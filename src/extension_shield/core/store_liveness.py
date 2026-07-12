"""
Chrome Web Store liveness — extension availability METADATA.

This module answers one narrow question: "is this extension still served by the
Chrome Web Store?" It is deliberately separate from scoring. It NEVER changes a
score, a recompute-on-read result, a coverage value, or any corpus / Track A
label. The resolved status is additive metadata plus a presentation gate.

Signal (proven in Phase 1):
  - The Omaha update endpoint (clients2.google.com/service/update2/crx, the same
    endpoint the downloader uses) can only DISPROVE availability. It gives a
    definitive signal ONLY for the *artifact-withdrawn* class:
        HTTP 204/404 -> no artifact / not found    -> "unavailable" (definitive)
        HTTP 302  -> an artifact IS served         -> "unknown" (NOT "available")
        anything else / error / timeout / HTML     -> "unknown" (fail-open)
  - A 302 (redirect to a downloadable CRX) does NOT prove the storefront listing
    exists: storefront-delisted extensions may return the same 302 response as live
    extensions, so a served artifact does not confirm storefront availability. The
    auto probe never CONFIRMS availability — it can only report "unavailable"
    (204/404) or "unknown".
  - Storefront POLICY delistings (page still lists a real name but shows a
    JS-rendered "no longer available" banner) have NO server-side signal here and
    are handled via CURATED status (see set_curated_status / the CLI).

The probe MUST NOT download, save, or analyze the CRX body, and MUST NOT scrape
store-page HTML. It observes only the update endpoint's status line.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from extension_shield.utils.http_safety import safe_get

logger = logging.getLogger(__name__)

# Statuses (tri-state).
AVAILABLE = "available"
UNAVAILABLE = "unavailable"
UNKNOWN = "unknown"

# Sources / provenance.
SOURCE_AUTO = "auto"
SOURCE_CURATED = "curated"

# Generic reason for an auto-detected removal. Detailed/attributed reasons are a
# future follow-up — we never infer WHY an item was removed.
REASON_UNAVAILABLE = "Chrome Web Store item unavailable"
# An "available" reason is only ever set by a CURATED record — the auto probe never
# confirms availability (a 302 only proves an artifact is served, not that the
# storefront listing exists).
REASON_AVAILABLE = "Marked available"
# A 302 means the update endpoint served an artifact, but that does not establish
# storefront availability — so the storefront status stays UNKNOWN (fail-open).
REASON_ARTIFACT_SERVED = "Artifact served by the update endpoint; storefront status unverified"
REASON_UNKNOWN = "Availability check inconclusive"

# Cache TTLs (seconds). Definitive results are cached longer than "unknown" ones,
# so a transient failure is retried sooner without hammering the endpoint.
DEFINITIVE_TTL_SECONDS = 24 * 60 * 60
UNKNOWN_TTL_SECONDS = 60 * 60
# Bounded, short timeout so a Google outage never slows the report endpoint.
PROBE_TIMEOUT = (3, 4)

_UPDATE_HOST = "clients2.google.com"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_url(extension_id: str) -> str:
    """Same update2/crx endpoint the downloader uses (core/extension_downloader.py),
    built here so the probe stays independent of the download machinery."""
    chrome_version = os.getenv("CHROME_VERSION", "131.0.0.0")
    return (
        "https://clients2.google.com/service/update2/crx"
        f"?response=redirect&prodversion={chrome_version}"
        "&acceptformat=crx2%2Ccrx3"
        f"&x=id%3D{extension_id}%26uc"
    )


def probe_store_availability(extension_id: str) -> Dict[str, Any]:
    """Probe the update endpoint (no redirect follow, no body read) and classify.

    Returns {status, reason, checked_at}. Never raises — any error is "unknown".
    """
    checked_at = _now_iso()
    if not extension_id:
        return {"status": UNKNOWN, "reason": REASON_UNKNOWN, "checked_at": checked_at}
    try:
        resp = safe_get(
            _update_url(extension_id),
            allowed_hosts={_UPDATE_HOST},
            timeout=PROBE_TIMEOUT,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
                ),
                "Accept": "application/x-chrome-extension,*/*",
            },
            stream=True,            # never buffer the body
            allow_redirects=False,  # never follow the redirect / download the CRX
        )
        status_code = resp.status_code
        try:
            resp.close()  # discard without reading the body
        except Exception:
            pass
        if status_code in (204, 404):
            return {"status": UNAVAILABLE, "reason": REASON_UNAVAILABLE, "checked_at": checked_at}
        # A 302 means an artifact is served, which does NOT prove the storefront
        # listing exists (delisted-but-served extensions return 302 too). The auto
        # probe never confirms availability -> storefront status stays UNKNOWN.
        if status_code == 302:
            return {"status": UNKNOWN, "reason": REASON_ARTIFACT_SERVED, "checked_at": checked_at}
        # 200 (consent/HTML), 429, 5xx, etc. are not a definitive removal.
        return {"status": UNKNOWN, "reason": REASON_UNKNOWN, "checked_at": checked_at}
    except Exception as exc:
        logger.debug("store liveness probe failed for %s: %s", extension_id, exc)
        return {"status": UNKNOWN, "reason": REASON_UNKNOWN, "checked_at": checked_at}


def resolve_store_status(
    current: Optional[Dict[str, Any]],
    probe: Dict[str, Any],
    *,
    now: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Pure precedence resolver (no I/O — unit-testable).

    Rules:
      - CURATED wins: an auto probe never overwrites a human-set row -> returns
        None (no write).
      - UNKNOWN never overwrites a prior CONFIRMED (available/unavailable) row ->
        returns None.
      - first_detected_unavailable_at is set ONCE and preserved thereafter.
      - last_seen_available_at is preserved unless a fresh "available" updates it.

    Returns the field dict to upsert, or None when nothing should change.
    """
    now = now or _now_iso()
    status = probe.get("status", UNKNOWN)
    reason = probe.get("reason")
    checked_at = probe.get("checked_at", now)
    cur = current or {}

    # Curated rows are authoritative; the automated probe must not touch them.
    if cur.get("store_status_source") == SOURCE_CURATED:
        return None

    prior_first_unavail = cur.get("first_detected_unavailable_at")
    prior_last_avail = cur.get("last_seen_available_at")
    prior_status = cur.get("store_status")

    if status == UNAVAILABLE:
        return {
            "store_status": UNAVAILABLE,
            "store_status_reason": reason,
            "store_status_source": SOURCE_AUTO,
            "store_status_checked_at": checked_at,
            "first_detected_unavailable_at": prior_first_unavail or now,
            "last_seen_available_at": prior_last_avail,
        }
    if status == AVAILABLE:
        return {
            "store_status": AVAILABLE,
            "store_status_reason": reason,
            "store_status_source": SOURCE_AUTO,
            "store_status_checked_at": checked_at,
            "first_detected_unavailable_at": prior_first_unavail,
            "last_seen_available_at": now,
        }
    # status == UNKNOWN
    if prior_status in (AVAILABLE, UNAVAILABLE):
        # Do not erase a prior definitive fact with an inconclusive probe.
        return None
    return {
        "store_status": UNKNOWN,
        "store_status_reason": reason,
        "store_status_source": SOURCE_AUTO,
        "store_status_checked_at": checked_at,
        "first_detected_unavailable_at": prior_first_unavail,
        "last_seen_available_at": prior_last_avail,
    }


def _ttl_for(status: Optional[str]) -> int:
    return DEFINITIVE_TTL_SECONDS if status in (AVAILABLE, UNAVAILABLE) else UNKNOWN_TTL_SECONDS


def _is_fresh(current: Optional[Dict[str, Any]], *, now: Optional[datetime] = None) -> bool:
    if not current or not current.get("store_status_checked_at"):
        return False
    try:
        checked = datetime.fromisoformat(str(current["store_status_checked_at"]))
        if checked.tzinfo is None:
            checked = checked.replace(tzinfo=timezone.utc)
    except Exception:
        return False
    now = now or datetime.now(timezone.utc)
    age = (now - checked).total_seconds()
    return age < _ttl_for(current.get("store_status"))


def public_status(current: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """The additive API-payload shape (never leaks source/internal columns)."""
    cur = current or {}
    return {
        "status": cur.get("store_status") or UNKNOWN,
        "reason": cur.get("store_status_reason"),
        "checked_at": cur.get("store_status_checked_at"),
        "first_detected_unavailable_at": cur.get("first_detected_unavailable_at"),
    }


def get_store_status_for_payload(db: Any, extension_id: str, *, allow_probe: bool = True) -> Dict[str, Any]:
    """Cached, TTL-gated, fail-open resolver used by the result GET path.

    Serves the cached status; refreshes with one bounded probe only when stale/
    missing (and never for curated rows). NEVER raises — on any error it returns
    the last known status, or "unknown" (which the gate renders normally).
    """
    if not extension_id:
        return public_status(None)
    try:
        current = db.get_store_status(extension_id)
    except Exception:
        current = None

    # Curated status is authoritative and needs no network probe.
    if current and current.get("store_status_source") == SOURCE_CURATED:
        return public_status(current)

    if not allow_probe or _is_fresh(current):
        return public_status(current)

    try:
        probe = probe_store_availability(extension_id)
        resolved = resolve_store_status(current, probe)
        if resolved is not None:
            db.upsert_store_status(extension_id, **resolved)
            current = db.get_store_status(extension_id) or {**(current or {}), **resolved}
    except Exception as exc:
        logger.debug("get_store_status_for_payload refresh failed for %s: %s", extension_id, exc)

    return public_status(current)


def set_curated_status(
    db: Any,
    extension_id: str,
    status: str,
    reason: Optional[str] = None,
) -> bool:
    """Human/admin curated status (CLI). Curated rows win over the auto probe.

    Used to mark storefront policy-delistings (which have no automated signal)
    as unavailable. Marking unavailable stamps first_detected_unavailable_at once.
    """
    status = (status or "").strip().lower()
    if status not in (AVAILABLE, UNAVAILABLE, UNKNOWN):
        raise ValueError(f"invalid status {status!r}; expected available|unavailable|unknown")
    now = _now_iso()
    try:
        current = db.get_store_status(extension_id) or {}
    except Exception:
        current = {}
    fields = {
        "store_status": status,
        "store_status_reason": reason if reason is not None else (
            REASON_UNAVAILABLE if status == UNAVAILABLE else None
        ),
        "store_status_source": SOURCE_CURATED,
        "store_status_checked_at": now,
        "first_detected_unavailable_at": (
            current.get("first_detected_unavailable_at") or now
        ) if status == UNAVAILABLE else current.get("first_detected_unavailable_at"),
        "last_seen_available_at": now if status == AVAILABLE else current.get("last_seen_available_at"),
    }
    return bool(db.upsert_store_status(extension_id, **fields))
