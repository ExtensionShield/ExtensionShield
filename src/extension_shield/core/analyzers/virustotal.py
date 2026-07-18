"""
VirusTotal Analyzer

This module provides threat intelligence integration with VirusTotal API
to check file hashes and identify known malicious extensions.

Supports multiple API keys with rotation: set VIRUSTOTAL_API_KEYS (comma-separated)
to spread load across keys and avoid rate limits (each key: 4 req/min, 500/day).
When one key returns 429, that key is marked rate-limited and the next key is used.
"""

import os
import copy
import hashlib
import logging
import json
import time
import threading
from pathlib import Path
from typing import Dict, Optional, List, Any, Tuple
from dotenv import load_dotenv

load_dotenv()
logger = logging.getLogger(__name__)

# Check if vt-py is available
try:
    import vt

    VT_AVAILABLE = True
except ImportError:
    VT_AVAILABLE = False
    logger.warning("vt-py not installed. VirusTotal analysis will be disabled.")

from extension_shield.core.analyzers import BaseAnalyzer


def _parse_virustotal_api_keys() -> List[str]:
    """
    Parse VirusTotal API keys from env.
    Supports VIRUSTOTAL_API_KEYS (comma-separated) or single VIRUSTOTAL_API_KEY.
    Returns list of non-empty stripped keys.
    """
    keys_str = os.getenv("VIRUSTOTAL_API_KEYS", "").strip()
    if keys_str:
        keys = [k.strip() for k in keys_str.split(",") if k.strip()]
        if keys:
            return keys
    single = os.getenv("VIRUSTOTAL_API_KEY", "").strip()
    if single:
        return [single]
    return []


def _is_vt_not_found_error(exc: Exception, error_str: Optional[str] = None) -> bool:
    """
    True when VirusTotal reports that a specific file hash is not present in its database.
    This is an expected lookup outcome, not an integration failure.
    """
    msg = (error_str or str(exc)).lower()
    exc_name = type(exc).__name__.lower()
    return "notfounderror" in exc_name or "not found" in msg or "404" in msg


class _VTRateLimiter:
    """
    Per-key rate limiter for VirusTotal free tier.
    Enforces 4 requests / 60 s and 500 / day per key.
    """

    def __init__(self, max_per_minute: int = 4, max_per_day: int = 500):
        self._max_min = max_per_minute
        self._max_day = max_per_day
        self._timestamps: List[float] = []
        self._lock = threading.Lock()
        self._rate_limited = False
        self._daily_count = 0
        self._daily_date: str = ""

    @property
    def is_rate_limited(self) -> bool:
        return self._rate_limited

    def mark_rate_limited(self) -> None:
        self._rate_limited = True

    def _reset_daily_if_needed(self) -> None:
        import datetime as _dt
        today = _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
        if today != self._daily_date:
            self._daily_count = 0
            self._daily_date = today
            self._rate_limited = False

    def wait(self, max_wait: Optional[float] = None) -> bool:
        """Reserve a request slot for this key.

        max_wait semantics:
          - None  → wait as long as needed (legacy blocking behavior)
          - 0     → non-blocking: reserve only if a slot is immediately free
          - >0    → wait up to this many seconds for a slot

        The slot is reserved atomically UNDER the lock, but any waiting
        (``time.sleep``) happens with the lock RELEASED so concurrent scans do
        not serialize behind one sleeping thread. Returns False if the key is
        rate-limited/quota-exhausted or no slot frees within ``max_wait``.
        """
        deadline = None if max_wait is None else time.monotonic() + max(max_wait, 0.0)
        while True:
            if self._rate_limited:
                return False
            with self._lock:
                self._reset_daily_if_needed()
                if self._rate_limited:
                    return False
                if self._daily_count >= self._max_day:
                    self._rate_limited = True
                    return False
                now = time.monotonic()
                self._timestamps = [t for t in self._timestamps if now - t < 60]
                if len(self._timestamps) < self._max_min:
                    # Slot available — reserve it atomically before releasing the lock.
                    self._timestamps.append(now)
                    self._daily_count += 1
                    return True
                # No slot right now; compute how long until the oldest ages out.
                sleep_for = 60 - (now - self._timestamps[0]) + 0.5
            # Lock released before sleeping.
            if deadline is not None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return False
                sleep_for = min(sleep_for, remaining)
            time.sleep(max(min(sleep_for, 2.0), 0.05))


class _VTKeyPool:
    """
    Pool of VirusTotal API keys with per-key rate limiters.
    Round-robins across keys; when a key returns 429 it is marked and the next key is used.
    """

    def __init__(self, keys: List[str], max_per_minute: int = 4, max_per_day: int = 500):
        self._keys = list(keys)
        self._limiters = [_VTRateLimiter(max_per_minute, max_per_day) for _ in self._keys]
        self._index = 0
        self._lock = threading.Lock()

    def wait_and_get_key(self, max_wait: Optional[float] = None) -> Tuple[Optional[int], Optional[str]]:
        """
        Get a key with available capacity.

        Pass 1 is non-blocking across ALL keys (grab any key with an immediately
        free slot). If none is free and ``max_wait`` allows waiting, Pass 2 waits
        (bounded by ``max_wait``) on the next key in the rotation. Any waiting
        happens inside the per-key limiter with its lock released — the pool lock
        is only held briefly to advance the round-robin cursor.

        Returns (key_index, api_key) or (None, None) if all keys are rate-limited
        or no slot frees within ``max_wait``.
        """
        if not self._keys:
            return None, None
        with self._lock:
            start = self._index
        # Pass 1: non-blocking — take any key with immediate capacity.
        for i in range(len(self._keys)):
            idx = (start + i) % len(self._keys)
            if self._limiters[idx].wait(max_wait=0):
                with self._lock:
                    self._index = (idx + 1) % len(self._keys)
                return idx, self._keys[idx]
        # Pass 2: bounded (or unbounded, when max_wait is None) wait on one key.
        if max_wait is None or max_wait > 0:
            idx = start % len(self._keys)
            if self._limiters[idx].wait(max_wait=max_wait):
                with self._lock:
                    self._index = (idx + 1) % len(self._keys)
                return idx, self._keys[idx]
        logger.warning("VirusTotal: all keys rate-limited or wait budget exhausted")
        return None, None

    def mark_rate_limited(self, key_index: int) -> None:
        if 0 <= key_index < len(self._limiters):
            self._limiters[key_index].mark_rate_limited()
            logger.info("VirusTotal: key index %d marked rate-limited", key_index)

    @property
    def is_exhausted(self) -> bool:
        return all(lim.is_rate_limited for lim in self._limiters)

    @property
    def key_count(self) -> int:
        return len(self._keys)


# Module-level key pool (lazy init so env is loaded)
_vt_key_pool: Optional[_VTKeyPool] = None
_vt_key_pool_lock = threading.Lock()


def _get_vt_key_pool() -> Optional[_VTKeyPool]:
    global _vt_key_pool
    if _vt_key_pool is not None:
        return _vt_key_pool
    with _vt_key_pool_lock:
        if _vt_key_pool is not None:
            return _vt_key_pool
        keys = _parse_virustotal_api_keys()
        if not keys:
            return None
        _vt_key_pool = _VTKeyPool(keys, max_per_minute=4, max_per_day=500)
        logger.info("VirusTotal: using %d API key(s) with rotation", len(keys))
        return _vt_key_pool


# ---------------------------------------------------------------------------
# Process-level VirusTotal verdict cache (keyed by file sha256).
# Concurrent/repeat scans of the same extension — or of a shared library file
# common to many extensions — reuse a recent verdict instead of re-spending the
# (small) free-tier quota. Only DEFINITIVE verdicts are cached (a real report or
# a genuine "not in VT database"); transient/rate-limit/auth results are never
# cached so a healthy key retries them.
# ---------------------------------------------------------------------------
_vt_hash_cache: Dict[str, Tuple[Dict[str, Any], float]] = {}
_vt_hash_cache_lock = threading.Lock()
_VT_HASH_CACHE_TTL = float(os.getenv("VT_HASH_CACHE_TTL_SECONDS", str(6 * 3600)))
_vt_cache_hits = 0  # process-lifetime observability counter


def _vt_cache_get(sha256: str) -> Optional[Dict[str, Any]]:
    if not sha256:
        return None
    with _vt_hash_cache_lock:
        entry = _vt_hash_cache.get(sha256)
        if not entry:
            return None
        verdict, expiry = entry
        if time.monotonic() >= expiry:
            _vt_hash_cache.pop(sha256, None)
            return None
        global _vt_cache_hits
        _vt_cache_hits += 1
        return copy.deepcopy(verdict)  # deep copy so callers cannot mutate the cached entry (incl. nested)


def _vt_cache_put(sha256: str, verdict: Optional[Dict[str, Any]]) -> None:
    if not sha256 or not isinstance(verdict, dict):
        return
    # Never cache transient / rate-limit / auth failures — retry those on a healthy key.
    if verdict.get("status") in ("RATE_LIMITED", "INVALID_KEY"):
        return
    if verdict.get("error"):
        return
    with _vt_hash_cache_lock:
        _vt_hash_cache[sha256] = (copy.deepcopy(verdict), time.monotonic() + _VT_HASH_CACHE_TTL)


def vt_cache_stats() -> Dict[str, int]:
    """Observability for tests/ops: cumulative hit count and current cache size."""
    with _vt_hash_cache_lock:
        return {"hits": _vt_cache_hits, "size": len(_vt_hash_cache)}


class VirusTotalAnalyzer(BaseAnalyzer):
    """
    Analyzes Chrome extensions using VirusTotal threat intelligence.
    Supports multiple API keys (VIRUSTOTAL_API_KEYS) with round-robin rotation
    to avoid rate limits until you have a commercial license.
    """

    # Priority files to scan (most likely to contain malicious code)
    PRIORITY_FILES = [
        "background.js",
        "content.js",
        "service_worker.js",
        "inject.js",
        "main.js",
        "popup.js",
    ]

    # File extensions to scan
    SCANNABLE_EXTENSIONS = {".js", ".html", ".json"}

    def __init__(self):
        """Initialize the VirusTotalAnalyzer. Uses VIRUSTOTAL_API_KEYS or VIRUSTOTAL_API_KEY."""
        super().__init__(name="VirusTotalAnalyzer")
        keys = _parse_virustotal_api_keys()
        self.api_keys = keys
        self.api_key = keys[0] if keys else None  # backward compat
        self.enabled = bool(keys) and VT_AVAILABLE
        self.config = self._load_config()

        if not keys:
            logger.warning("VIRUSTOTAL_API_KEY / VIRUSTOTAL_API_KEYS not set. VirusTotal analysis will be disabled.")
        elif not VT_AVAILABLE:
            logger.warning("vt-py library not available. VirusTotal analysis will be disabled.")
        elif len(keys) > 1:
            logger.info("VirusTotal: %d API keys configured for rotation", len(keys))

    @staticmethod
    def _load_config() -> Dict:
        """Load VirusTotal configuration from JSON file."""
        config_path = Path(__file__).parent.parent.parent / "config" / "virustotal_config.json"
        default_config = {
            "enabled": True,
            "max_files_to_scan": 10,
            "scan_manifest": True,
            "scan_js_files": True,
            "timeout_seconds": 30,
        }
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                return {**default_config, **json.load(f)}
        except FileNotFoundError:
            logger.info("VirusTotal config not found, using defaults")
            return default_config
        except json.JSONDecodeError as exc:
            logger.error("Error parsing VirusTotal config: %s", exc)
            return default_config

    @staticmethod
    def compute_file_hash(file_path: str, algorithm: str = "sha256") -> str:
        """
        Compute hash of a file.

        Args:
            file_path: Path to the file
            algorithm: Hash algorithm (sha256, sha1, md5)

        Returns:
            Hex digest of the file hash
        """
        hash_func = getattr(hashlib, algorithm)()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                hash_func.update(chunk)
        return hash_func.hexdigest()

    @staticmethod
    def compute_all_hashes(file_path: str) -> Dict[str, str]:
        """
        Compute SHA256, SHA1, and MD5 hashes of a file.

        Args:
            file_path: Path to the file

        Returns:
            Dictionary with hash values
        """
        return {
            "sha256": VirusTotalAnalyzer.compute_file_hash(file_path, "sha256"),
            "sha1": VirusTotalAnalyzer.compute_file_hash(file_path, "sha1"),
            "md5": VirusTotalAnalyzer.compute_file_hash(file_path, "md5"),
        }

    def _get_files_to_scan(self, extension_dir: str) -> List[Dict[str, Any]]:
        """
        Get list of files to scan, prioritizing important files.

        Args:
            extension_dir: Path to the extracted extension directory

        Returns:
            List of file info dicts with path and priority
        """
        files_to_scan = []
        extension_path = Path(extension_dir)

        # First, add priority files if they exist
        for priority_file in self.PRIORITY_FILES:
            for file_path in extension_path.rglob(priority_file):
                if file_path.is_file():
                    files_to_scan.append(
                        {"path": str(file_path), "name": file_path.name, "priority": True}
                    )

        # Then add other scannable files
        for ext in self.SCANNABLE_EXTENSIONS:
            for file_path in extension_path.rglob(f"*{ext}"):
                if file_path.is_file():
                    file_info = {"path": str(file_path), "name": file_path.name, "priority": False}
                    # Avoid duplicates
                    if not any(f["path"] == file_info["path"] for f in files_to_scan):
                        files_to_scan.append(file_info)

        # Limit to max files
        max_files = self.config.get("max_files_to_scan", 10)
        return files_to_scan[:max_files]

    async def _check_hash_virustotal(self, file_hash: str, max_wait: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        Check a file hash against VirusTotal (async version).
        Uses key pool with rotation; on 429 the current key is marked and next key is used next time.
        A recent cached verdict (process-level, keyed by sha256) is returned without spending quota.
        """
        if not self.enabled:
            return None

        cached = _vt_cache_get(file_hash)
        if cached is not None:
            return cached

        pool = _get_vt_key_pool()
        if not pool:
            return None
        key_index, api_key = pool.wait_and_get_key(max_wait=max_wait)
        if api_key is None:
            return {
                "found": False,
                "status": "RATE_LIMITED",
                "message": "VirusTotal daily/minute quota exhausted — skipping remaining lookups",
            }

        try:
            async with vt.Client(api_key) as client:
                file_report = await client.get_object_async(f"/files/{file_hash}")

                stats = file_report.last_analysis_stats
                results = {
                    "found": True,
                    "sha256": file_report.sha256,
                    "sha1": getattr(file_report, "sha1", None),
                    "md5": getattr(file_report, "md5", None),
                    "detection_stats": {
                        "malicious": stats.get("malicious", 0),
                        "suspicious": stats.get("suspicious", 0),
                        "undetected": stats.get("undetected", 0),
                        "harmless": stats.get("harmless", 0),
                        "total_engines": sum(stats.values()),
                    },
                    "reputation": getattr(file_report, "reputation", 0),
                    "times_submitted": getattr(file_report, "times_submitted", 0),
                    "first_submission_date": str(
                        getattr(file_report, "first_submission_date", "Unknown")
                    ),
                    "last_analysis_date": str(
                        getattr(file_report, "last_analysis_date", "Unknown")
                    ),
                    "type_description": getattr(file_report, "type_description", "Unknown"),
                    "tags": getattr(file_report, "tags", []),
                }

                if hasattr(file_report, "last_analysis_results"):
                    malware_families = set()
                    for engine, result in file_report.last_analysis_results.items():
                        if result.get("category") in ["malicious", "suspicious"]:
                            result_name = result.get("result", "")
                            if result_name:
                                malware_families.add(result_name)
                    results["malware_families"] = list(malware_families)[:10]
                else:
                    results["malware_families"] = []

                _vt_cache_put(file_hash, results)
                return results

        except vt.error.APIError as e:
            error_str = str(e)
            status_code = getattr(e, "status_code", None)

            if _is_vt_not_found_error(e, error_str):
                logger.info("[VirusTotal] Hash not present in database for %s", file_hash)
                _not_found = {"found": False, "message": "Hash not found in VirusTotal database"}
                _vt_cache_put(file_hash, _not_found)
                return _not_found

            logger.warning("[VirusTotal] API error - status_code=%s, error=%s", status_code, error_str)

            if status_code == 429 or "rate limit" in error_str.lower() or "quota" in error_str.lower():
                pool.mark_rate_limited(key_index)
                return {
                    "found": False,
                    "status": "RATE_LIMITED",
                    "message": "VirusTotal rate limit exceeded",
                    "error": error_str,
                }

            if status_code == 401 or "unauthorized" in error_str.lower() or "api key" in error_str.lower():
                logger.error("[VirusTotal] Invalid API key (401) — key index %s disabled for this process", key_index)
                pool.mark_rate_limited(key_index)
                return {
                    "found": False,
                    "status": "INVALID_KEY",
                    "message": "VirusTotal API key invalid",
                    "error": error_str,
                }

            logger.error("VirusTotal API error: %s", e)
            return {"found": False, "error": error_str}
        except Exception as e:
            logger.error("[VirusTotal] Unexpected error: %s", e)
            return {"found": False, "error": str(e)}

    def _check_hash_virustotal_sync(self, file_hash: str, max_wait: Optional[float] = None) -> Optional[Dict[str, Any]]:
        """
        Synchronous version of VirusTotal hash check.
        Uses key pool with rotation; on 429 the current key is marked and next key is used next time.
        A recent cached verdict (process-level, keyed by sha256) is returned without spending quota.
        """
        if not self.enabled:
            return None

        cached = _vt_cache_get(file_hash)
        if cached is not None:
            return cached

        pool = _get_vt_key_pool()
        if not pool:
            return None
        key_index, api_key = pool.wait_and_get_key(max_wait=max_wait)
        if api_key is None:
            return {
                "found": False,
                "status": "RATE_LIMITED",
                "message": "VirusTotal daily/minute quota exhausted — skipping remaining lookups",
            }

        try:
            with vt.Client(api_key) as client:
                file_report = client.get_object(f"/files/{file_hash}")

                stats = file_report.last_analysis_stats
                results = {
                    "found": True,
                    "sha256": file_report.sha256,
                    "sha1": getattr(file_report, "sha1", None),
                    "md5": getattr(file_report, "md5", None),
                    "detection_stats": {
                        "malicious": stats.get("malicious", 0),
                        "suspicious": stats.get("suspicious", 0),
                        "undetected": stats.get("undetected", 0),
                        "harmless": stats.get("harmless", 0),
                        "total_engines": sum(stats.values()),
                    },
                    "reputation": getattr(file_report, "reputation", 0),
                    "times_submitted": getattr(file_report, "times_submitted", 0),
                    "first_submission_date": str(
                        getattr(file_report, "first_submission_date", "Unknown")
                    ),
                    "last_analysis_date": str(
                        getattr(file_report, "last_analysis_date", "Unknown")
                    ),
                    "type_description": getattr(file_report, "type_description", "Unknown"),
                    "tags": getattr(file_report, "tags", []),
                }

                if hasattr(file_report, "last_analysis_results"):
                    malware_families = set()
                    for engine, result in file_report.last_analysis_results.items():
                        if result.get("category") in ["malicious", "suspicious"]:
                            result_name = result.get("result", "")
                            if result_name:
                                malware_families.add(result_name)
                    results["malware_families"] = list(malware_families)[:10]
                else:
                    results["malware_families"] = []

                _vt_cache_put(file_hash, results)
                return results

        except vt.error.APIError as e:
            error_str = str(e)
            status_code = getattr(e, "status_code", None)

            if _is_vt_not_found_error(e, error_str):
                logger.info("[VirusTotal] Hash not present in database for %s", file_hash)
                _not_found = {"found": False, "message": "Hash not found in VirusTotal database"}
                _vt_cache_put(file_hash, _not_found)
                return _not_found

            logger.warning("[VirusTotal] API error (sync) - status_code=%s, error=%s", status_code, error_str)

            if status_code == 429 or "rate limit" in error_str.lower() or "quota" in error_str.lower():
                pool.mark_rate_limited(key_index)
                return {
                    "found": False,
                    "status": "RATE_LIMITED",
                    "message": "VirusTotal rate limit exceeded",
                    "error": error_str,
                }

            if status_code == 401 or "unauthorized" in error_str.lower() or "api key" in error_str.lower():
                logger.error("[VirusTotal] Invalid API key (401) — key index %s disabled", key_index)
                pool.mark_rate_limited(key_index)
                return {
                    "found": False,
                    "status": "INVALID_KEY",
                    "message": "VirusTotal API key invalid",
                    "error": error_str,
                }

            logger.error("VirusTotal API error: %s", e)
            return {"found": False, "error": error_str}
        except Exception as e:
            logger.error("[VirusTotal] Unexpected error (sync): %s", e)
            return {"found": False, "error": str(e)}

    def analyze(
        self, extension_dir: str, manifest: Optional[Dict] = None, metadata: Optional[Dict] = None
    ) -> Optional[Dict]:
        """
        Analyze Chrome extension files using VirusTotal.

        Args:
            extension_dir: Path to the extracted extension directory
            manifest: Parsed manifest.json (optional)
            metadata: Additional metadata about the extension (optional)

        Returns:
            Analysis results with VirusTotal findings
        """
        if not self.enabled:
            return {
                "enabled": False,
                "message": "VirusTotal analysis disabled (API key not configured or vt-py not installed)",
                "files_analyzed": 0,
                "detections": [],
            }

        results = {
            "enabled": True,
            "files_analyzed": 0,
            "files_found_in_vt": 0,
            "files_with_detections": 0,
            "total_malicious": 0,
            "total_suspicious": 0,
            "file_results": [],
            "summary": {
                # Default to "unknown" — only downgraded to "clean" when at least
                # one file was actually present in VirusTotal with engine coverage.
                # Not-found is missing intelligence, not a clean result.
                "threat_level": "unknown",
                "detected_families": [],
                "recommendation": "",
            },
        }

        files_to_scan = self._get_files_to_scan(extension_dir)
        pool = _get_vt_key_pool()
        pool_desc = f"{pool.key_count} key(s), 4 req/min each" if pool else "no keys"
        logger.info("VirusTotal: Scanning %d files (%s)", len(files_to_scan), pool_desc)

        # Total wall-clock budget for VT lookups this scan. Bounds how long the
        # analyzer will wait behind the rate limiter so a burst of concurrent
        # scans cannot make one scan hang for minutes. Cached hashes are served
        # instantly and do NOT consume this budget.
        vt_budget_seconds = float(os.getenv("VT_SCAN_BUDGET_SECONDS", "45"))
        scan_deadline = time.monotonic() + vt_budget_seconds

        rate_limited_skips = 0
        for file_info in files_to_scan:
            remaining_budget = scan_deadline - time.monotonic()
            if pool and (pool.is_exhausted or remaining_budget <= 0):
                rate_limited_skips += 1
                results["file_results"].append({
                    "file_name": file_info["name"],
                    "file_path": file_info["path"].replace(extension_dir, ""),
                    "skipped": True,
                    "reason": (
                        "VirusTotal rate limit reached — file skipped"
                        if (pool and pool.is_exhausted)
                        else "VirusTotal time budget reached — file skipped"
                    ),
                })
                continue

            try:
                file_path = file_info["path"]
                hashes = self.compute_all_hashes(file_path)

                vt_result = self._check_hash_virustotal_sync(hashes["sha256"], max_wait=remaining_budget)

                file_result = {
                    "file_name": file_info["name"],
                    "file_path": file_path.replace(extension_dir, ""),
                    "priority_file": file_info["priority"],
                    "hashes": hashes,
                    "virustotal": vt_result,
                }

                results["file_results"].append(file_result)
                results["files_analyzed"] += 1

                if vt_result and vt_result.get("found"):
                    stats = vt_result.get("detection_stats", {})
                    malicious = stats.get("malicious", 0)
                    suspicious = stats.get("suspicious", 0)

                    # File was actually present in VirusTotal with engine coverage.
                    if stats.get("total_engines", 0) > 0:
                        results["files_found_in_vt"] += 1

                    if malicious > 0 or suspicious > 0:
                        results["files_with_detections"] += 1
                        results["total_malicious"] += malicious
                        results["total_suspicious"] += suspicious

                        families = vt_result.get("malware_families", [])
                        results["summary"]["detected_families"].extend(families)

                # If VT returned a rate-limit status, stop further lookups this scan.
                if vt_result and vt_result.get("status") == "RATE_LIMITED":
                    logger.warning("VirusTotal rate-limited — skipping remaining files")
                    rate_limited_skips += 1
                    break

            except Exception as e:
                logger.error("Error analyzing file %s: %s", file_info["path"], e)
                results["file_results"].append(
                    {
                        "file_name": file_info["name"],
                        "error": str(e),
                    }
                )

        if rate_limited_skips:
            results["rate_limited_skips"] = rate_limited_skips

        # Deduplicate malware families
        results["summary"]["detected_families"] = list(
            set(results["summary"]["detected_families"])
        )[:15]

        # Determine overall threat level
        if results["total_malicious"] > 0:
            results["summary"]["threat_level"] = "malicious"
            results["summary"]["recommendation"] = (
                "HIGH RISK: Multiple antivirus engines have flagged files in this extension as malicious. "
                "Do not install this extension."
            )
        elif results["total_suspicious"] > 0:
            results["summary"]["threat_level"] = "suspicious"
            results["summary"]["recommendation"] = (
                "CAUTION: Some files in this extension have been flagged as suspicious. "
                "Review carefully before installation."
            )
        elif results["files_found_in_vt"] > 0:
            # At least one file was actually present in VirusTotal and engines
            # returned no detections — a genuine clean result (still not a safety
            # guarantee, but real intelligence).
            results["summary"]["threat_level"] = "clean"
            results["summary"]["recommendation"] = (
                "No known threats detected in VirusTotal database. "
                "Note: This does not guarantee the extension is safe."
            )
        elif results["files_analyzed"] > 0:
            # Files were hashed but NONE were present in VirusTotal's database.
            # Missing intelligence must NOT be reported as "clean".
            results["summary"]["threat_level"] = "unknown"
            results["summary"]["recommendation"] = (
                "No VirusTotal intelligence available: none of the scanned files "
                "were found in the VirusTotal database. This is missing intelligence, "
                "not a clean result, and should not be treated as safe."
            )

        return results
