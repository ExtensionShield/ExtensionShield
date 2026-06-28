"""
FastAPI Backend for Project Atlas

Provides REST API endpoints for the frontend to trigger extension analysis
and retrieve results.
"""

import base64
import mimetypes
import os
import hmac
from pathlib import Path

# Load .env from project root so DB_BACKEND, SUPABASE_*, etc. are set before config/database init
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if (_PROJECT_ROOT / ".env").exists():
    from dotenv import load_dotenv
    load_dotenv(_PROJECT_ROOT / ".env")

import html as html_module
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta

from fastapi import FastAPI, HTTPException, BackgroundTasks, Response, UploadFile, File, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse
from enum import Enum
from pydantic import BaseModel, Field, model_validator
import shutil

from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from extension_shield.core.report_generator import ReportGenerator
from extension_shield.core.extension_metadata import ExtensionMetadata
from extension_shield.core.chromestats_downloader import ChromeStatsDownloader

from extension_shield.workflow.graph import build_graph
from extension_shield.workflow.state import WorkflowState, WorkflowStatus
from extension_shield.api.database import db, SupabaseDatabase, _is_extension_id
from extension_shield.api.supabase_auth import get_current_user_id as _get_current_user_id
from extension_shield.core.config import get_settings
from extension_shield.utils.mode import require_cloud, get_feature_flags, is_oss_telemetry_allowed, require_cloud_dep
from extension_shield.api.csp_middleware import CSPMiddleware
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from extension_shield.api.payload_helpers import (
    build_publisher_disclosures,
    build_report_view_model_safe,
    governance_verdict_from_payload,
    ensure_consumer_insights,
    ensure_description_in_meta,
    ensure_name_in_payload,
    log_scan_results_return_shape,
    upgrade_legacy_payload,
)
from extension_shield.governance.tool_adapters import SignalPackBuilder
from extension_shield.scoring.engine import ScoringEngine

# Initialize logger
logger = logging.getLogger(__name__)

# Import safe JSON utilities from shared module
from extension_shield.utils.json_encoder import (
    safe_json_dumps,
    safe_json_dump,
    sanitize_for_json,
)


# Request/response models and in-memory state live in shared.py to avoid
# circular imports when route modules are split out.
from extension_shield.api.shared import (  # noqa: E402
    ScanRequest,
    ScanStatusResponse,
    FileContentResponse,
    FileListResponse,
    PageViewEvent,
    CustomTelemetryEvent,
    BatchResultsRequest,
    BatchStatusRequest,
)


# Sentry: enable only in prod when SENTRY_DSN is set; never capture request bodies or auth headers
def _sanitize_error_for_client(text: str) -> str:
    """Strip competitor/service names from error messages shown to the client."""
    if not text or not isinstance(text, str):
        return text or ""
    for phrase in ("Google CRX", "ChromeStats", "chrome-stats", "chromestats"):
        if phrase in text:
            text = text.replace(phrase, "download source")
    return text


def _init_sentry() -> None:
    if not get_settings().is_prod():
        return
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        def _before_send(event: dict, hint: dict) -> dict | None:
            # Ensure request bodies and Authorization headers are never sent
            request = event.get("request") or {}
            if isinstance(request, dict):
                request = dict(request)
                request.pop("data", None)
                request.pop("cookies", None)
                headers = request.get("headers")
                if isinstance(headers, dict):
                    headers = {k: v for k, v in headers.items() if k.lower() not in ("authorization", "cookie")}
                    request["headers"] = headers
                elif isinstance(headers, (list, tuple)):
                    request["headers"] = [(k, v) for k, v in headers if k.lower() not in ("authorization", "cookie")]
                event["request"] = request
            return event

        sentry_sdk.init(
            dsn=dsn,
            environment="production",
            send_default_pii=False,
            before_send=_before_send,
            integrations=[
                StarletteIntegration(),
                FastApiIntegration(),
            ],
        )
        logger.info("Sentry initialized (prod, SENTRY_DSN set)")
    except Exception as exc:
        logger.warning("Sentry init skipped or failed: %s", exc)


_init_sentry()

# Disable interactive API docs in production to reduce attack surface and avoid exposing internal routes
_prod = get_settings().is_prod()
app = FastAPI(
    title="ExtensionShield API",
    description="REST API for Chrome extension security analysis",
    version="1.0.0",
    docs_url=None if _prod else "/docs",
    redoc_url=None if _prod else "/redoc",
    openapi_url=None if _prod else "/openapi.json",
)

# Global rate limiting toggle
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("1", "true", "yes")
limiter = None
if RATE_LIMIT_ENABLED:
    limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)


def _rate_limit(limit: str):
    """Return a limiter decorator if enabled, otherwise no-op."""
    if RATE_LIMIT_ENABLED and limiter:
        return limiter.limit(limit)
    def _noop(func):
        return func
    return _noop


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})


# User-friendly error message for service unavailability
SERVICE_UNAVAILABLE_MESSAGE = "ExtensionShield is temporarily unavailable. We're working to restore service and will be back shortly. Please try again in a few minutes."


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler that catches unhandled exceptions and returns
    user-friendly error messages instead of exposing internal API details.
    """
    # Never return 503 for /health so Railway healthchecks don't fail the deploy
    if request.url.path == "/health":
        logger.error("Error during /health: %s", exc)
        return JSONResponse(
            status_code=200,
            content={
                "status": "degraded",
                "version": "1.0.0",
                "uptime_seconds": 0,
                "mode": "unknown",
                "detail": SERVICE_UNAVAILABLE_MESSAGE,
                "error_code": "SERVICE_HEALTH_DEGRADED",
            },
        )
    error_str = str(exc).lower()
    
    # Check for connection/network errors (external API down)
    if any(keyword in error_str for keyword in [
        "connection refused", "connection reset", "connection error",
        "timeout", "network", "errno 61", "errno 111",
        "name resolution", "dns", "unreachable"
    ]):
        logger.error("Service connection error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "detail": SERVICE_UNAVAILABLE_MESSAGE,
                "error_code": "SERVICE_UNAVAILABLE"
            }
        )
    
    # Check for authentication/API key errors (don't expose API key info)
    if any(keyword in error_str for keyword in [
        "api key", "api_key", "apikey", "unauthorized", "authentication",
        "invalid key", "sk-proj", "sk-"
    ]):
        logger.error("API authentication error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "detail": SERVICE_UNAVAILABLE_MESSAGE,
                "error_code": "SERVICE_UNAVAILABLE"
            }
        )
    
    # Check for external service errors (VirusTotal, ChromeStats, etc.)
    if any(keyword in error_str for keyword in [
        "virustotal", "chromestats", "chrome-stats", "rate limit",
        "quota exceeded", "too many requests"
    ]):
        logger.error("External service error: %s", exc)
        return JSONResponse(
            status_code=503,
            content={
                "detail": SERVICE_UNAVAILABLE_MESSAGE,
                "error_code": "SERVICE_UNAVAILABLE"
            }
        )
    
    # For all other unhandled exceptions, log and return generic message
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={
            "detail": SERVICE_UNAVAILABLE_MESSAGE,
            "error_code": "INTERNAL_ERROR"
        }
    )


@app.middleware("http")
async def attach_user_context(request: Request, call_next):
    """
    Best-effort auth context.
    If token is missing/invalid, user_id will be None.
    """
    try:
        request.state.user_id = _get_current_user_id(request)
    except Exception:
        request.state.user_id = None
    return await call_next(request)


@app.middleware("http")
async def domain_redirect_middleware(request: Request, call_next):
    """
    Redirect non-canonical domains to extensionshield.com.
    
    This middleware handles:
    - extensionscanner.com -> extensionshield.com
    Note: extensionaudit.com will be added in the future.
    
    Preserves path and query parameters.
    """
    host = request.headers.get("host", "").lower()
    canonical_domain = "extensionshield.com"
    # Note: extensionaudit.com will be added in the future
    non_canonical_domains = ["extensionscanner.com"]
    
    # Check if this is a non-canonical domain
    if any(host.startswith(domain) for domain in non_canonical_domains):
        # Preserve path and query string
        path = request.url.path
        query = request.url.query
        redirect_url = f"https://{canonical_domain}{path}"
        if query:
            redirect_url += f"?{query}"
        
        # Return 301 permanent redirect
        return RedirectResponse(url=redirect_url, status_code=301)
    
    return await call_next(request)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Add security headers to all responses."""
    response = await call_next(request)
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    # HSTS: always in production; in dev only when request is effectively HTTPS (scheme or X-Forwarded-Proto)
    is_https = request.url.scheme == "https"
    if not is_https and request.headers.get("X-Forwarded-Proto", "").strip().lower() == "https":
        is_https = True
    if get_settings().is_prod() or is_https:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Note: CSP is now handled by CSPMiddleware (added below)
    return response

# Configure CORS: prod requires explicit allowlist (no "*"); dev defaults to localhost
_cors_env = os.getenv("CORS_ORIGINS", "").strip()
if get_settings().is_prod():
    if not _cors_env:
        raise ValueError(
            "CORS_ORIGINS must be set in production. Set to a comma-separated list of allowed origins "
            "(e.g. https://extensionshield.com). Wildcard '*' is not allowed in prod."
        )
    allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    if "*" in allowed_origins or not allowed_origins:
        raise ValueError(
            "CORS_ORIGINS in production must be a non-empty allowlist; '*' is not allowed. "
            f"Got: {_cors_env!r}"
        )
else:
    if _cors_env:
        allowed_origins = [o.strip() for o in _cors_env.split(",") if o.strip()]
    else:
        allowed_origins = [
            "http://localhost:5173",  # Vite dev server (default)
            "http://localhost:5174",  "http://localhost:5175",  "http://localhost:5176",
            "http://localhost:5177",  "http://localhost:3000",  "http://localhost:8007",
        ]
print(f"CORS allowed origins: {allowed_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Static files directory for React frontend (in container)
# IMPORTANT: Define STATIC_DIR BEFORE CSP middleware so it can detect production mode
STATIC_DIR = Path(__file__).parent.parent.parent.parent / "static"
# Frontend public directory for development (serves data files)
FRONTEND_PUBLIC_DIR = Path(__file__).parent.parent.parent.parent / "frontend" / "public"

# Add CSP middleware (after CORS, after STATIC_DIR is defined)
# Check if we're in development mode (when STATIC_DIR doesn't exist or is empty)
_is_dev = not (STATIC_DIR.exists() and (STATIC_DIR / "index.html").exists())
if _is_dev:
    print(f"⚠️  CSP: Development mode detected (STATIC_DIR={STATIC_DIR}, exists={STATIC_DIR.exists()})")
else:
    print(f"✅ CSP: Production mode detected (STATIC_DIR={STATIC_DIR}, index.html exists)")
app.add_middleware(CSPMiddleware, is_dev=_is_dev)

# Trust X-Forwarded-Proto / X-Forwarded-For from Railway/Cloudflare so request.url.scheme is correct
TRUSTED_PROXIES = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "10.0.0.0/8",
]
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=TRUSTED_PROXIES)

# In-memory state lives in shared.py; import references here so existing
# code in this file (and tests) can continue using module-level names.
from extension_shield.api.shared import (  # noqa: E402
    scan_results,
    scan_status,
    scan_user_ids,
    scan_source,
)

# For /health uptime (no filesystem or internal config in response)
_health_start_time = datetime.now(timezone.utc)

# -----------------------------------------------------------------------------
# Daily deep-scan limit (placeholder, in-memory)
# -----------------------------------------------------------------------------
DAILY_DEEP_SCAN_LIMIT = 3  # authenticated users
ANONYMOUS_DAILY_DEEP_SCAN_LIMIT = 1  # anonymous (IP-based) users – after 1 scan, prompt login
# deep_scan_usage[user_id][YYYY-MM-DD] = used_count
deep_scan_usage: Dict[str, Dict[str, int]] = {}


def _get_user_id(request: Request) -> str:
    """
    Best-effort user identifier.

    Prefer Supabase-authenticated user_id (JWT `sub`) when available.
    If absent, allow an optional `X-User-Id` header for local/dev usage.
    No IP-based fallback (privacy-first).
    """
    state_user = getattr(getattr(request, "state", None), "user_id", None)
    if state_user:
        return str(state_user)

    header_user = request.headers.get("x-user-id") or request.headers.get("X-User-Id")
    if header_user:
        return header_user.strip()

    return "anon"


def _get_client_ip(request: Request) -> str:
    """
    Get the client's IP address for rate limiting anonymous users.
    
    Relies on ProxyHeadersMiddleware to properly set request.client.host
    based on trusted reverse proxies, preventing header spoofing.
    """
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _get_rate_limit_key(request: Request) -> str:
    """
    Get the rate limit key for the request.
    
    For authenticated users: use user_id (allows sharing limit across devices)
    For anonymous users: use IP address (prevents abuse)
    """
    authenticated_user_id = getattr(getattr(request, "state", None), "user_id", None)
    if authenticated_user_id:
        return f"user:{authenticated_user_id}"
    
    # Use IP for anonymous users
    return f"ip:{_get_client_ip(request)}"


def _require_admin_key(request: Request) -> None:
    """
    Verify X-Admin-Key header matches ADMIN_API_KEY.
    
    Raises HTTPException(403) if:
    - Header is missing
    - Key doesn't match ADMIN_API_KEY
    - ADMIN_API_KEY is not configured
    """
    settings = get_settings()
    admin_key = settings.admin_api_key
    
    if not admin_key:
        raise HTTPException(
            status_code=403,
            detail="Admin API key is not configured"
        )
    provided_key = request.headers.get("X-Admin-Key") or request.headers.get("x-admin-key")
    if not provided_key:
        raise HTTPException(
            status_code=403,
            detail="X-Admin-Key header is required"
        )
    
    if not hmac.compare_digest(
        provided_key.encode("utf-8"),
        admin_key.encode("utf-8")
    ):
        raise HTTPException(
            status_code=403,
            detail="Invalid admin API key"
        )


def _require_admin_or_telemetry_key(request: Request) -> None:
    """
    Verify X-Admin-Key header matches ADMIN_API_KEY or TELEMETRY_ADMIN_KEY.
    Used for telemetry summary endpoint so either key is accepted.
    """
    settings = get_settings()
    admin_key = settings.admin_api_key
    telemetry_key = settings.telemetry_admin_key
    accepted = admin_key or telemetry_key
    if not accepted:
        raise HTTPException(
            status_code=403,
            detail="Admin API key is not configured"
        )
    provided = request.headers.get("X-Admin-Key") or request.headers.get("x-admin-key")
    if not provided:
        raise HTTPException(
            status_code=403,
            detail="X-Admin-Key header is required"
        )
    valid = (
        (admin_key and hmac.compare_digest(
            provided.encode("utf-8"),
            admin_key.encode("utf-8")
        )) or
        (telemetry_key and hmac.compare_digest(
            provided.encode("utf-8"),
            telemetry_key.encode("utf-8")
        ))
    )
    if not valid:
        raise HTTPException(
            status_code=403,
            detail="Invalid admin API key"
        )


def _deep_scan_limit_status(rate_limit_key: str) -> Dict[str, Any]:
    """Get deep scan limit status. Returns unlimited in local/dev environments.
    Anonymous (IP-based) users get 1 scan per day; authenticated users get 3.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    day_key = now.strftime("%Y-%m-%d")
    used = deep_scan_usage.get(rate_limit_key, {}).get(day_key, 0)
    
    # In development/local, return unlimited
    if not settings.is_prod():
        return {
            "limit": 999999,
            "used": used,
            "remaining": 999999,
            "day_key": day_key,
            "reset_at": (datetime(now.year, now.month, now.day, tzinfo=timezone.utc) + timedelta(days=1)).isoformat(),
        }
    
    # Anonymous (IP) = 1 scan/day; authenticated = 3 scans/day
    limit = ANONYMOUS_DAILY_DEEP_SCAN_LIMIT if rate_limit_key.startswith("ip:") else DAILY_DEEP_SCAN_LIMIT
    remaining = max(0, limit - used)
    reset_at = datetime(now.year, now.month, now.day, tzinfo=timezone.utc) + timedelta(days=1)
    return {
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "day_key": day_key,
        "reset_at": reset_at.isoformat(),
    }


def _consume_deep_scan(user_id: str) -> Dict[str, Any]:
    status = _deep_scan_limit_status(user_id)
    if status["remaining"] <= 0:
        return status
    day_key = status["day_key"]
    deep_scan_usage.setdefault(user_id, {})
    deep_scan_usage[user_id][day_key] = deep_scan_usage[user_id].get(day_key, 0) + 1
    return _deep_scan_limit_status(user_id)


def _has_cached_results(extension_id: str) -> bool:
    if extension_id in scan_results:
        return True

    # Database lookup (fast path for cached lookups)
    try:
        existing = db.get_scan_result(extension_id)
        if existing:
            return True
    except Exception:
        # If DB is unavailable, fall back to file check below.
        pass

    # File fallback
    result_file = RESULTS_DIR / f"{extension_id}_results.json"
    return result_file.exists()


def _parse_iso_datetime(value: Any) -> Optional[datetime]:
    """Parse an ISO datetime string, returning None on failure."""
    if not value or not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _build_public_store_url(extension_id: str) -> str:
    """Build a canonical Chrome Web Store URL from an extension ID."""
    return f"https://chromewebstore.google.com/detail/_/{extension_id}"


def _get_payload_version(payload: Dict[str, Any]) -> Optional[str]:
    """Best-effort current version extraction from a scan payload."""
    metadata = payload.get("metadata") or {}
    manifest = payload.get("manifest") or {}
    chrome_stats = metadata.get("chrome_stats") if isinstance(metadata, dict) else {}
    candidates = [
        manifest.get("version") if isinstance(manifest, dict) else None,
        metadata.get("version") if isinstance(metadata, dict) else None,
        chrome_stats.get("version") if isinstance(chrome_stats, dict) else None,
    ]
    for candidate in candidates:
        if isinstance(candidate, str) and candidate.strip():
            return candidate.strip()
    return None


def _fast_live_version_check(extension_id: str, timeout_seconds: float = 2.0) -> Optional[str]:
    """
    Quick version check for cached-path: fetch live version from ChromeStats only
    with a short timeout so we don't block the 'already scanned' response.
    Returns live version string or None on timeout/error (caller treats None as unchanged).
    """
    try:
        downloader = ChromeStatsDownloader()
        if not downloader.enabled:
            return None
        # Use a short timeout so cached lookups return quickly
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            fut = ex.submit(downloader._get_extension_details, extension_id)
            try:
                details = fut.result(timeout=timeout_seconds)
            except concurrent.futures.TimeoutError:
                logger.debug("[CACHED_PATH] Fast version check timed out for %s", extension_id)
                return None
        if isinstance(details, dict):
            ver = details.get("version")
            if isinstance(ver, str) and ver.strip():
                return ver.strip()
    except Exception as exc:
        logger.debug("[CACHED_PATH] Fast version check failed for %s: %s", extension_id, exc)
    return None


def _hydrate_db_scan_result(results: Dict[str, Any], identifier: str) -> Dict[str, Any]:
    """Normalize a DB row into the API scan payload shape."""
    db_metadata = results.get("metadata") or {}
    if isinstance(db_metadata, str):
        try:
            db_metadata = json.loads(db_metadata)
        except Exception:
            db_metadata = {}

    db_manifest = results.get("manifest") or {}
    if isinstance(db_manifest, str):
        try:
            db_manifest = json.loads(db_manifest)
        except Exception:
            db_manifest = {}

    db_chrome_stats = db_metadata.get("chrome_stats") or {}
    def _is_extension_id_like(s):
        if not s or not isinstance(s, str):
            return False
        return len(s.strip()) == 32 and all(c in "abcdefghijklmnop" for c in s.strip().lower())
    name_candidates = [
        results.get("extension_name"),
        db_metadata.get("title"),
        db_metadata.get("name"),
        db_chrome_stats.get("name") if isinstance(db_chrome_stats, dict) else None,
        db_manifest.get("name"),
    ]
    resolved_extension_name = next(
        (n for n in name_candidates if n and isinstance(n, str) and n.strip() and n.strip() != "Unknown" and not _is_extension_id_like(n)),
        results.get("extension_id") or identifier,
    )

    payload: Dict[str, Any] = {
        "extension_id": results.get("extension_id"),
        "extension_name": resolved_extension_name,
        "slug": results.get("slug"),
        "url": results.get("url"),
        "timestamp": results.get("timestamp"),
        "status": results.get("status"),
        "user_id": results.get("user_id"),
        "visibility": results.get("visibility"),
        "source": results.get("source"),
        "metadata": results.get("metadata", {}),
        "manifest": results.get("manifest", {}),
        "permissions_analysis": results.get("permissions_analysis", {}),
        "sast_results": results.get("sast_results", {}),
        "webstore_analysis": results.get("webstore_analysis", {}),
        "summary": results.get("summary", {}),
        "impact_analysis": results.get("impact_analysis", {}),
        "privacy_compliance": results.get("privacy_compliance", {}),
        "extracted_path": results.get("extracted_path"),
        "icon_path": results.get("icon_path"),
        "icon_base64": results.get("icon_base64"),
        "icon_media_type": results.get("icon_media_type"),
        "extracted_files": results.get("extracted_files", []),
        "overall_security_score": results.get("security_score", 0),
        "total_findings": results.get("total_findings", 0),
        "risk_distribution": {
            "high": results.get("high_risk_count", 0),
            "medium": results.get("medium_risk_count", 0),
            "low": results.get("low_risk_count", 0),
        },
        "overall_risk": results.get("risk_level", "unknown"),
        "total_risk_score": results.get("total_findings", 0),
    }
    summary = results.get("summary") or {}
    summary = summary if isinstance(summary, dict) else {}
    payload["report_view_model"] = results.get("report_view_model") or summary.get("report_view_model")
    payload["scoring_v2"] = results.get("scoring_v2") or summary.get("scoring_v2")
    payload["governance_bundle"] = results.get("governance_bundle") or summary.get("governance_bundle")
    return payload


def _refresh_scan_payload_with_store_metadata(
    payload: Dict[str, Any],
    extension_id: str,
    *,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Refresh lightweight Chrome Web Store metadata for a cached public scan.

    Returns a dict with:
      - payload: updated or original payload
      - refreshed: whether metadata was updated and persisted
      - version_changed: whether live store version differs from cached payload
      - cached_version / live_version: version strings when available
    """
    result = {
        "payload": payload,
        "refreshed": False,
        "version_changed": False,
        "cached_version": _get_payload_version(payload),
        "live_version": None,
    }

    if not isinstance(payload, dict):
        return result
    if payload.get("visibility") == "private" or payload.get("source") == "upload":
        return result

    metadata = payload.get("metadata") or {}
    metadata = metadata if isinstance(metadata, dict) else {}
    refreshed_at = _parse_iso_datetime(metadata.get("webstore_refreshed_at"))
    if not force and refreshed_at:
        age_seconds = (datetime.now(timezone.utc) - refreshed_at.astimezone(timezone.utc)).total_seconds()
        if age_seconds < 12 * 60 * 60:
            return result

    extension_url = payload.get("url") if isinstance(payload.get("url"), str) else None
    if not extension_url:
        extension_url = _build_public_store_url(extension_id)

    live_metadata: Dict[str, Any] = {}
    try:
        extracted_metadata = ExtensionMetadata(extension_url=extension_url).fetch_metadata() or {}
        if isinstance(extracted_metadata, dict):
            live_metadata.update(extracted_metadata)
    except Exception as exc:
        logger.warning("[STORE_REFRESH] Failed to fetch live metadata for %s: %s", extension_id, exc)

    try:
        chromestats_details = ChromeStatsDownloader()._get_extension_details(extension_id)
        if chromestats_details:
            live_metadata["chrome_stats"] = chromestats_details
            if not live_metadata.get("version"):
                live_metadata["version"] = chromestats_details.get("version")
            if live_metadata.get("user_count") is None:
                live_metadata["user_count"] = chromestats_details.get("userCount")
            if live_metadata.get("rating") is None:
                live_metadata["rating"] = chromestats_details.get("ratingValue")
            if live_metadata.get("ratings_count") is None:
                live_metadata["ratings_count"] = chromestats_details.get("ratingCount")
            if not live_metadata.get("last_updated"):
                live_metadata["last_updated"] = chromestats_details.get("lastUpdate")
    except Exception as exc:
        logger.warning("[STORE_REFRESH] Failed to fetch chrome-stats details for %s: %s", extension_id, exc)

    if not live_metadata:
        return result

    live_metadata["extension_id"] = extension_id
    live_metadata["webstore_refreshed_at"] = datetime.now(timezone.utc).isoformat()

    cached_version = result["cached_version"]
    live_version = _get_payload_version({"metadata": live_metadata})
    result["live_version"] = live_version
    if cached_version and live_version and cached_version != live_version:
        result["version_changed"] = True
        return result

    merged_metadata = dict(metadata)
    for key, value in live_metadata.items():
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        merged_metadata[key] = value

    updated_payload = dict(payload)
    updated_payload["metadata"] = merged_metadata

    name_candidates = [
        updated_payload.get("extension_name"),
        merged_metadata.get("title"),
        merged_metadata.get("name"),
        (merged_metadata.get("chrome_stats") or {}).get("name") if isinstance(merged_metadata.get("chrome_stats"), dict) else None,
        (updated_payload.get("manifest") or {}).get("name"),
    ]
    updated_payload["extension_name"] = next(
        (n for n in name_candidates if isinstance(n, str) and n.strip() and n.strip() != "Unknown"),
        extension_id,
    )

    analysis_results = {
        "permissions_analysis": updated_payload.get("permissions_analysis") or {},
        "javascript_analysis": updated_payload.get("sast_results") or {},
        "webstore_analysis": updated_payload.get("webstore_analysis") or {},
        "virustotal_analysis": updated_payload.get("virustotal_analysis") or {},
        "entropy_analysis": updated_payload.get("entropy_analysis") or {},
        "impact_analysis": updated_payload.get("impact_analysis") or {},
        "privacy_compliance": updated_payload.get("privacy_compliance") or {},
        "executive_summary": updated_payload.get("summary") or {},
    }
    updated_payload["report_view_model"] = build_report_view_model_safe(
        manifest=updated_payload.get("manifest") or {},
        analysis_results=analysis_results,
        metadata=merged_metadata,
        extension_id=extension_id,
        scan_id=extension_id,
        governance_verdict=governance_verdict_from_payload(updated_payload),
    )
    updated_payload["publisher_disclosures"] = build_publisher_disclosures(
        merged_metadata,
        updated_payload.get("governance_bundle"),
    )

    scoring_v2 = _build_scoring_v2_for_payload(updated_payload, extension_id)
    if scoring_v2:
        updated_payload["scoring_v2"] = scoring_v2
        updated_payload["overall_security_score"] = scoring_v2.get(
            "overall_score",
            updated_payload.get("overall_security_score", 0),
        )
        updated_payload["security_score"] = scoring_v2.get("security_score")
        updated_payload["privacy_score"] = scoring_v2.get("privacy_score")
        updated_payload["governance_score"] = scoring_v2.get("governance_score")
        updated_payload["overall_confidence"] = scoring_v2.get("overall_confidence")
        updated_payload["decision_v2"] = scoring_v2.get("decision")
        updated_payload["decision_reasons_v2"] = scoring_v2.get("decision_reasons")
        updated_payload["insufficient_data"] = scoring_v2.get("insufficient_data")
        updated_payload["decision_authority"] = scoring_v2.get("decision_authority")
        updated_payload["overall_risk"] = scoring_v2.get(
            "risk_level",
            updated_payload.get("overall_risk", "unknown"),
        )

    updated_payload = upgrade_legacy_payload(updated_payload, extension_id)
    updated_payload = ensure_consumer_insights(updated_payload)
    ensure_description_in_meta(updated_payload)
    ensure_name_in_payload(updated_payload)
    updated_payload["risk_and_signals"] = _extract_risk_and_signals(updated_payload)

    scan_results[extension_id] = sanitize_for_json(updated_payload)
    try:
        db.save_scan_result(scan_results[extension_id])
    except Exception as exc:
        logger.warning("[STORE_REFRESH] Failed to persist refreshed metadata for %s: %s", extension_id, exc)

    result["payload"] = scan_results[extension_id]
    result["refreshed"] = True
    return result


# -----------------------------------------------------------------------------
# Enterprise pilot request (placeholder, in-memory)
# -----------------------------------------------------------------------------
class EnterprisePilotRequest(BaseModel):
    name: str
    email: str
    company: Optional[str] = None
    notes: Optional[str] = None
    interests: Optional[List[str]] = None
    custom_extension_notes: Optional[str] = None


enterprise_pilot_requests: list[Dict[str, Any]] = []


# -----------------------------------------------------------------------------
# Careers apply (in-memory + email via Resend)
# -----------------------------------------------------------------------------
class CareersApplyRequest(BaseModel):
    """Request model for careers application form."""

    full_name: str = Field(..., min_length=1, max_length=200)
    email: str = Field(..., min_length=1, max_length=320)
    role_id: Optional[str] = Field(None, max_length=100)
    linkedin_url: Optional[str] = Field(None, max_length=500)
    github_url: Optional[str] = Field(None, max_length=500)
    resume_link: Optional[str] = Field(None, max_length=1000)
    note: Optional[str] = Field(None, max_length=2000)


careers_apply_submissions: list[Dict[str, Any]] = []


def _send_careers_apply_email(item: Dict[str, Any]) -> None:
    """Send careers application to team email (and optional confirmation to applicant) via Resend. No-op if RESEND_API_KEY unset."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key or api_key.startswith("re_xxxx"):
        return
    from_email = os.getenv("CAREERS_FROM_EMAIL", os.getenv("ENTERPRISE_FROM_EMAIL", "ExtensionShield <onboarding@resend.dev>")).strip()
    to_careers = os.getenv("CAREERS_NOTIFY_EMAIL", "careers@extensionshield.com").strip()
    if not to_careers:
        return
    try:
        import resend
        resend.api_key = api_key

        def esc(s: Optional[str]) -> str:
            if s is None or not s.strip():
                return "—"
            return html_module.escape(s.strip())

        full_name = esc(item.get("full_name"))
        email = item.get("email", "").strip()
        role_id = esc(item.get("role_id"))
        linkedin = esc(item.get("linkedin_url"))
        github = esc(item.get("github_url"))
        resume = esc(item.get("resume_link"))
        note = esc(item.get("note"))

        subject = f"Careers application: {full_name}"
        if role_id and role_id != "—":
            subject += f" — {role_id}"

        html = f"""
        <p><strong>New careers application</strong></p>
        <p><strong>Name:</strong> {full_name}<br/>
        <strong>Email:</strong> {email}<br/>
        <strong>Role:</strong> {role_id}<br/>
        <strong>LinkedIn:</strong> {linkedin}<br/>
        <strong>GitHub:</strong> {github}<br/>
        <strong>Resume:</strong> {resume}</p>
        """
        if note and note != "—":
            html += f"<p><strong>Note:</strong><br/>{note}</p>"
        html += "<p>— ExtensionShield Careers</p>"

        resend.Emails.send({
            "from": from_email,
            "to": [to_careers],
            "subject": subject,
            "html": html,
        })

        # Optional confirmation to applicant
        confirm_to = os.getenv("CAREERS_CONFIRM_TO_APPLICANT", "true").strip().lower() in ("1", "true", "yes")
        if confirm_to and email:
            confirm_html = f"""
            <p>Hi {full_name},</p>
            <p>Thanks for applying to ExtensionShield. We've received your application and will review it shortly.</p>
            <p>— The ExtensionShield team</p>
            """
            resend.Emails.send({
                "from": from_email,
                "to": [email],
                "subject": "We received your ExtensionShield application",
                "html": confirm_html,
            })
    except Exception as e:
        logger.warning("Careers apply email send failed: %s", e)


# -----------------------------------------------------------------------------
# Scan result feedback (per-scan user feedback)
# -----------------------------------------------------------------------------
class FeedbackReason(str, Enum):
    """Reasons for negative feedback on scan results."""
    FALSE_POSITIVE = "false_positive"
    FALSE_NEGATIVE = "false_negative"
    SCORE_OFF = "score_off"
    UNCLEAR = "unclear"
    OTHER = "other"


class FeedbackRequest(BaseModel):
    """Request model for scan result feedback."""
    scan_id: str
    helpful: bool
    reason: Optional[FeedbackReason] = None
    suggested_score: Optional[int] = Field(None, ge=0, le=100)
    comment: Optional[str] = Field(None, max_length=280)

    @model_validator(mode="after")
    def validate_feedback(self) -> "FeedbackRequest":
        """Validate that negative feedback includes a reason."""
        if not self.helpful and self.reason is None:
            raise ValueError("reason is required when helpful=false")
        return self


class ReviewQueueClaimRequest(BaseModel):
    """Request body for claiming a review queue item."""
    queue_item_id: str


class ReviewQueueVoteRequest(BaseModel):
    """Request body for voting (thumbs up/down) on a review queue item."""
    queue_item_id: str
    vote: str  # 'up' | 'down'
    note: Optional[str] = Field(None, max_length=500)


# Load existing results from database on startup
def load_existing_results():
    """Load existing scan results from database into memory cache."""
    history = db.get_scan_history(limit=100)
    for item in history:
        ext_id = item.get("extension_id")
        if ext_id:
            scan_status[ext_id] = item.get("status", "completed")


load_existing_results()

# Directory for storing analysis results
# Use centralized config (maps current behavior)
_settings = get_settings()
STORAGE_PATH = _settings.extension_storage_path
RESULTS_DIR = _settings.paths.results_dir  # Convert to absolute path
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# Base64 SVG placeholder for extension icons when local file is missing (e.g. ephemeral storage on Railway)
_EXTENSION_ICON_PLACEHOLDER_B64 = (
    "PHN2ZyB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHZpZXdCb3g9IjAgMCA2NCA2NCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4K"
    "ICA8cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxMiIgZmlsbD0iIzJBMkEzNSIvPgogIDxwYXRoIGQ9Ik0zMiAxNkMyNC4yNjggMTYgMTggMjIuMjY4IDE4IDMwQzE4IDMxLjY1NyAxOC4zMjEgMzMuMjI5IDE4LjkwOSAzNC42NjdMMjIuOTg0IDM0LjY2N0MyMy43MyAzNC42NjcgMjQuMzMzIDM1LjI3IDI0LjMzMyAzNi4wMTZWNDAuMDkxQzI0LjMzMyA0MC44MzggMjMuNzMgNDEuNDQxIDIyLjk4NCA0MS40NDFIMTguOTA5QzIwLjU3MSA0NS42ODcgMjQuMzMzIDQ5LjIyNCAyOC45NTkgNTAuNDg2VjQ2LjQxMUMyOC45NTkgNDUuNjY1IDI5LjU2MiA0NS4wNjIgMzAuMzA4IDQ1LjA2MkgzNC4zODNDMzUuMTMgNDUuMDYyIDM1LjczMyA0NC40NTkgMzUuNzMzIDQzLjcxM1YzOS42MzhDMzUuNzMzIDM4Ljg5MSAzNi4zMzYgMzguMjg4IDM3LjA4MyAzOC4yODhINDEuMTU3QzQxLjkwNCAzOC4yODggNDIuNTA3IDM3LjY4NSA0Mi41MDcgMzYuOTM4VjMyLjg2NEM0Mi41MDcgMzIuMTE3IDQzLjExIDMxLjUxNCA0My44NTcgMzEuNTE0SDQ3LjkzMkM0Ny45NzggMzEuMDE1IDQ4IDMwLjUxIDQ4IDMwQzQ4IDIyLjI2OCA0MS43MzIgMTYgMzIgMTZaIiBmaWxsPSIjNEE5MEU2Ii8+CiAgPGNpcmNsZSBjeD0iMjYiIGN5PSIyNiIgcj0iMyIgZmlsbD0iI0ZGRkZGRiIvPgo8L3N2Zz4="
)
_MAX_ICON_BYTES_FOR_DB = 2 * 1024 * 1024


def _extension_icon_placeholder_response() -> Response:
    """Return placeholder extension icon when local file is missing (e.g. ephemeral storage)."""
    svg_bytes = base64.b64decode(_EXTENSION_ICON_PLACEHOLDER_B64)
    return Response(
        content=svg_bytes,
        media_type="image/svg+xml",
        headers={
            # Don't cache placeholders aggressively; icon may become available moments later.
            "Cache-Control": "no-store, max-age=0",
            "Pragma": "no-cache",
            "Access-Control-Allow-Origin": "*",
            "X-Extension-Icon-Source": "placeholder",
        },
    )


def _normalize_image_media_type(media_type: Optional[str]) -> str:
    """Normalize media type for icon responses."""
    if not media_type or not isinstance(media_type, str):
        return "image/png"
    normalized = media_type.strip().lower()
    if not normalized.startswith("image/"):
        return "image/png"
    return normalized


def _extension_icon_response_from_base64(
    icon_base64: Optional[str], icon_media_type: Optional[str]
) -> Optional[Response]:
    """Build an image response from persisted base64 icon data."""
    if not icon_base64:
        return None
    try:
        icon_bytes = base64.b64decode(icon_base64)
    except Exception:
        logger.warning("[ICON] Failed to decode persisted icon_base64")
        return None

    return Response(
        content=icon_bytes,
        media_type=_normalize_image_media_type(icon_media_type),
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "X-Extension-Icon-Source": "db_blob",
        },
    )


def _extension_icon_file_response(icon_file_path: str) -> FileResponse:
    """Build a file response with normalized icon media type and cache headers."""
    guessed_media_type, _ = mimetypes.guess_type(icon_file_path)
    return FileResponse(
        icon_file_path,
        media_type=_normalize_image_media_type(guessed_media_type),
        headers={
            "Cache-Control": "public, max-age=86400",
            "Access-Control-Allow-Origin": "*",
            "X-Extension-Icon-Source": "filesystem",
        },
    )


def _load_icon_record_from_db(extension_id: str) -> Dict[str, Optional[str]]:
    """
    Load icon-related fields for an extension from DB.
    Works for both SQLite and Supabase, and gracefully handles older schemas.
    """
    record: Dict[str, Optional[str]] = {
        "extracted_path": None,
        "icon_path": None,
        "icon_base64": None,
        "icon_media_type": None,
    }
    try:
        if hasattr(db, "get_connection"):
            with db.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("PRAGMA table_info(scan_results)")
                columns = [row[1] for row in cursor.fetchall()]
                selected_columns = ["extracted_path"]
                if "icon_path" in columns:
                    selected_columns.append("icon_path")
                if "icon_base64" in columns:
                    selected_columns.append("icon_base64")
                if "icon_media_type" in columns:
                    selected_columns.append("icon_media_type")

                cursor.execute(
                    f"SELECT {', '.join(selected_columns)} FROM scan_results WHERE extension_id = ? LIMIT 1",
                    (extension_id,),
                )
                row = cursor.fetchone()
                if row:
                    for idx, col_name in enumerate(selected_columns):
                        record[col_name] = row[idx] if len(row) > idx else None
        else:
            row = db.get_scan_result(extension_id)
            if row:
                record["extracted_path"] = row.get("extracted_path")
                record["icon_path"] = row.get("icon_path")
                record["icon_base64"] = row.get("icon_base64")
                record["icon_media_type"] = row.get("icon_media_type")
    except Exception as exc:
        logger.debug("[ICON] Could not load icon record from database: %s", exc)
    return record


def _extract_icon_blob_for_storage(
    icon_path: Optional[str], extracted_path: Optional[str]
) -> tuple[Optional[str], Optional[str]]:
    """Encode icon bytes to base64 for DB persistence (production-safe fallback)."""
    if not icon_path or not extracted_path:
        return None, None
    try:
        abs_extracted_path = os.path.abspath(extracted_path)
        candidate_path = (
            os.path.abspath(icon_path)
            if os.path.isabs(icon_path)
            else os.path.abspath(os.path.join(extracted_path, icon_path))
        )

        # Security check: icon must stay inside extracted extension dir.
        if os.path.commonpath([abs_extracted_path, candidate_path]) != abs_extracted_path:
            logger.warning("[ICON] Refusing out-of-bounds icon path for persistence: %s", icon_path)
            return None, None
        if not os.path.isfile(candidate_path):
            return None, None

        with open(candidate_path, "rb") as icon_file:
            icon_bytes = icon_file.read()
        if not icon_bytes:
            return None, None
        if len(icon_bytes) > _MAX_ICON_BYTES_FOR_DB:
            logger.warning(
                "[ICON] Skipping icon persistence for oversized icon (%s bytes): %s",
                len(icon_bytes),
                candidate_path,
            )
            return None, None

        icon_b64 = base64.b64encode(icon_bytes).decode("ascii")
        guessed_media_type, _ = mimetypes.guess_type(candidate_path)
        media_type = _normalize_image_media_type(guessed_media_type)
        return icon_b64, media_type
    except Exception as exc:
        logger.warning("[ICON] Failed to persist icon bytes for %s: %s", icon_path, exc)
        return None, None


def _storage_relative_extracted_path(extension_dir: Optional[str]) -> Optional[str]:
    """
    Return extracted_path in a form resolvable on any backend: path relative to
    extension_storage_path (e.g. extracted_<id>.crx_123 or extracted_<id>.zip_9/1.0.0_0
    when the zip had a top-level version folder). Icon endpoint joins this with
    extension_storage_path so icons work when DB is Supabase and storage is local.
    """
    if not extension_dir:
        return None
    storage_path = get_settings().extension_storage_path
    try:
        rel = os.path.relpath(extension_dir.rstrip(os.sep), storage_path)
        # Avoid storing paths that escape storage (e.g. "..")
        if rel.startswith("..") or os.path.isabs(rel):
            return os.path.basename(extension_dir.rstrip(os.sep))
        return rel
    except ValueError:
        return os.path.basename(extension_dir.rstrip(os.sep))


def extract_extension_id(url: str) -> Optional[str]:
    """Extract extension ID from Chrome Web Store URL. Returns only if it matches ^[a-z]{32}$."""
    import re
    from extension_shield.utils.extension import is_chrome_extension_id
    match = re.search(r"/detail/(?:[^/]+/)?([a-z]{32})", url)
    candidate = match.group(1) if match else None
    return candidate if candidate and is_chrome_extension_id(candidate) else None


def extract_icon_path(manifest: Dict[str, Any], extracted_path: Optional[str]) -> Optional[str]:
    """
    Extract icon path from manifest.json.
    
    Returns the relative path to the icon file (e.g., "icons/128.png")
    based on manifest.json icons field, or None if not found.
    
    Args:
        manifest: Parsed manifest.json dict
        extracted_path: Path to extracted extension directory (for validation)
    
    Returns:
        Relative icon path (e.g., "icons/128.png") or None
    """
    if not manifest or not isinstance(manifest, dict):
        return None
    
    icons = manifest.get("icons", {})
    if not icons or not isinstance(icons, dict):
        return None
    
    # Get the largest icon (prefer 128, then 64, then 48, etc.)
    icon_sizes = ["128", "64", "48", "32", "16", "96", "256", "38", "19"]
    for size in icon_sizes:
        if size in icons:
            icon_path = icons[size]
            if isinstance(icon_path, str):
                # Validate path exists if extracted_path is available
                if extracted_path:
                    full_path = os.path.join(extracted_path, icon_path)
                    if os.path.exists(full_path):
                        return icon_path
                else:
                    # Return path even if we can't validate (for database storage)
                    return icon_path
    
    return None


def _relpath_from_extracted(extracted_path: str, abs_path: str) -> Optional[str]:
    """Return a safe, normalized (POSIX) relpath within extracted_path."""
    try:
        rel = os.path.relpath(abs_path, start=extracted_path)
    except Exception:
        return None
    # Guard: must stay within extracted_path
    if rel.startswith(".."):
        return None
    return rel.replace(os.sep, "/")


def _find_icon_path_on_disk(
    extracted_path: Optional[str], manifest: Optional[Dict[str, Any]] = None
) -> Optional[str]:
    """
    Find a real icon file path inside an extracted extension directory.

    This is used at scan completion to persist icon bytes even when manifest.icons is missing
    or points to a non-existent file. It intentionally mirrors the icon endpoint's fallback
    search strategy, but returns a relative path suitable for DB storage (e.g. "icons/128.png").
    """
    if not extracted_path:
        return None
    if not os.path.isdir(extracted_path):
        return None

    ex = extracted_path
    ex_abs = os.path.abspath(ex)

    def _candidate(rel_parts: list[str]) -> Optional[str]:
        abs_path = os.path.abspath(os.path.join(ex, *rel_parts))
        if os.path.commonpath([ex_abs, abs_path]) != ex_abs:
            return None
        if os.path.isfile(abs_path):
            return _relpath_from_extracted(ex, abs_path)
        return None

    # 1) If manifest provides icon paths, try all of them (largest-first if keys are numeric).
    icons = (manifest or {}).get("icons") if isinstance(manifest, dict) else None
    if isinstance(icons, dict) and icons:
        def _key_to_int(k: Any) -> int:
            try:
                return int(str(k))
            except Exception:
                return -1

        # Prefer numeric keys (sizes) descending; otherwise preserve insertion order.
        icon_items = list(icons.items())
        if any(_key_to_int(k) >= 0 for k, _ in icon_items):
            icon_items.sort(key=lambda kv: _key_to_int(kv[0]), reverse=True)

        for _, rel in icon_items:
            if isinstance(rel, str) and rel:
                found = _candidate([rel])
                if found:
                    return found

    # 2) Common conventions (icons/, root, images/)
    icon_sizes = ["256", "128", "96", "64", "48", "32", "16"]
    exts = [".png", ".jpg", ".jpeg", ".webp", ".svg"]

    # icons/<size>.(png|...)
    for size in icon_sizes:
        for ext in exts:
            found = _candidate(["icons", f"{size}{ext}"])
            if found:
                return found
            found = _candidate(["icons", f"icon{size}{ext}"])
            if found:
                return found

    # root icon files
    for size in icon_sizes:
        for ext in exts:
            for name in (f"icon{size}{ext}", f"{size}{ext}", f"icon_{size}{ext}"):
                found = _candidate([name])
                if found:
                    return found

    # images/ common names
    for name in (
        "icon256.png",
        "icon128.png",
        "icon96.png",
        "icon64.png",
        "icon48.png",
        "icon32.png",
        "icon16.png",
        "icon.png",
        "logo.png",
        "logo.svg",
    ):
        found = _candidate(["images", name])
        if found:
            return found

    # 3) Last resort: pick the largest-looking image in icons/ or images/
    for folder in ("icons", "images"):
        folder_abs = os.path.join(ex, folder)
        if not os.path.isdir(folder_abs):
            continue
        try:
            candidates = []
            for item in os.listdir(folder_abs):
                lower = item.lower()
                if not any(lower.endswith(ext) for ext in exts):
                    continue
                abs_path = os.path.abspath(os.path.join(folder_abs, item))
                if os.path.commonpath([ex_abs, abs_path]) != ex_abs:
                    continue
                if not os.path.isfile(abs_path):
                    continue
                try:
                    size_bytes = os.path.getsize(abs_path)
                except Exception:
                    size_bytes = 0
                candidates.append((size_bytes, abs_path))
            if candidates:
                candidates.sort(key=lambda t: t[0], reverse=True)
                rel = _relpath_from_extracted(ex, candidates[0][1])
                if rel:
                    return rel
        except Exception:
            continue

    return None


async def run_analysis_workflow(url: str, extension_id: str):
    """Run the analysis workflow in the background."""
    workflow_start = datetime.now()
    logger.info("[TIMELINE] scan_started → extension_id=%s, url=%s", extension_id, url)
    
    try:
        # Update status
        scan_status[extension_id] = "running"
        logger.info("[TIMELINE] status_set_to_running → extension_id=%s", extension_id)

        # Build and run workflow
        logger.info("[TIMELINE] building_workflow_graph → extension_id=%s", extension_id)
        graph = build_graph()
        logger.info("[TIMELINE] workflow_graph_built → extension_id=%s", extension_id)

        initial_state: WorkflowState = {
            "workflow_id": extension_id,
            "chrome_extension_path": url,
            "extension_dir": None,
            "downloaded_crx_path": None,
            "extension_metadata": None,
            "manifest_data": None,
            "analysis_results": None,
            "executive_summary": None,
            "extracted_files": None,
            # Governance fields
            "governance_bundle": None,
            "governance_verdict": None,
            "governance_report": None,
            "governance_error": None,
            # Status fields
            "status": WorkflowStatus.PENDING,
            "start_time": datetime.now().isoformat(),
            "end_time": None,
            "error": None,
        }

        # Run workflow
        logger.info("[TIMELINE] executing_workflow → extension_id=%s", extension_id)
        final_state = await graph.ainvoke(initial_state)
        logger.info("[TIMELINE] workflow_completed → extension_id=%s, status=%s", extension_id, final_state.get("status"))

        # Store results
        if (
            final_state["status"] == WorkflowStatus.COMPLETED
            or final_state["status"] == "completed"
        ):
            analysis_results = final_state.get("analysis_results", {}) or {}

            # Extract extension name from metadata or manifest
            # Check all possible sources: webstore metadata, chromestats metadata, parsed manifest
            metadata = final_state.get("extension_metadata") or {}
            manifest = final_state.get("manifest_data") or {}
            chrome_stats = metadata.get("chrome_stats") or {}
            _name_candidates = [
                metadata.get("title"),
                metadata.get("name"),
                chrome_stats.get("name") if isinstance(chrome_stats, dict) else None,
                manifest.get("name"),
            ]
            extension_name = next(
                (n for n in _name_candidates if n and isinstance(n, str) and n.strip() and n.strip() != "Unknown"),
                extension_id,
            )

            # Ensure all values are not None
            extracted_files = final_state.get("extracted_files")
            if extracted_files is None:
                extracted_files = []

            # Extract icon path from manifest
            extracted_path = final_state.get("extension_dir")
            icon_path = extract_icon_path(manifest, extracted_path)
            if not icon_path and extracted_path:
                icon_path = _find_icon_path_on_disk(extracted_path, manifest)
            icon_base64, icon_media_type = _extract_icon_blob_for_storage(
                icon_path=icon_path,
                extracted_path=extracted_path,
            )

            # =================================================================
            # V2 SCORING: Build SignalPack and compute scores via ScoringEngine
            # =================================================================
            signal_pack_builder = SignalPackBuilder()
            signal_pack = signal_pack_builder.build(
                scan_id=extension_id,
                analysis_results=analysis_results,
                metadata=metadata,
                manifest=manifest,
                extension_id=extension_id,
            )
            
            # Determine user count for context-aware scoring
            user_count = signal_pack.webstore_stats.installs
            if user_count is None:
                # Fallback to metadata if available
                user_count = metadata.get("users") or metadata.get("user_count")
            
            # Compute v2 scores
            logger.info("[TIMELINE] computing_scores → extension_id=%s", extension_id)
            scoring_engine = ScoringEngine(weights_version="v1")
            scoring_result = scoring_engine.calculate_scores(
                signal_pack=signal_pack,
                manifest=manifest,
                user_count=user_count,
            )
            logger.info("[TIMELINE] scores_computed → extension_id=%s, overall_score=%s", extension_id, scoring_result.overall_score)
            
            # Build scoring_v2 payload for API response (include gate/override breakdown for QA)
            scoring_v2_payload = {
                "scoring_version": "v2",
                "weights_version": "v1",
                "security_score": scoring_result.security_score,
                "privacy_score": scoring_result.privacy_score,
                "governance_score": scoring_result.governance_score,
                "overall_score": scoring_result.overall_score,
                "overall_confidence": scoring_result.overall_confidence,
                "decision": scoring_result.decision.value,
                "decision_reasons": scoring_result.reasons,
                "insufficient_data": scoring_result.insufficient_data,
                "decision_authority": scoring_result.decision_authority,
                "hard_gates_triggered": scoring_result.hard_gates_triggered,
                "risk_level": scoring_result.risk_level.value,
                "explanation": scoring_result.explanation,
            }
            if scoring_result.insufficient_data_reason is not None:
                scoring_v2_payload["insufficient_data_reason"] = scoring_result.insufficient_data_reason
            if scoring_result.base_overall is not None:
                scoring_v2_payload["base_overall"] = scoring_result.base_overall
            if scoring_result.gate_penalty is not None:
                scoring_v2_payload["gate_penalty"] = scoring_result.gate_penalty
            if scoring_result.gate_reasons is not None:
                scoring_v2_payload["gate_reasons"] = scoring_result.gate_reasons
            if scoring_result.coverage_cap_applied is not None:
                scoring_v2_payload["coverage_cap_applied"] = scoring_result.coverage_cap_applied
            if scoring_result.coverage_cap_reason is not None:
                scoring_v2_payload["coverage_cap_reason"] = scoring_result.coverage_cap_reason

            # Build scan results - sanitize complex objects to prevent circular references
            raw_results = {
                "extension_id": extension_id,
                "extension_name": extension_name,
                "url": url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "status": "completed",
                "metadata": metadata,
                "manifest": manifest,
                "permissions_analysis": analysis_results.get("permissions_analysis") or {},
                "sast_results": analysis_results.get("javascript_analysis") or {},
                "webstore_analysis": analysis_results.get("webstore_analysis") or {},
                "virustotal_analysis": analysis_results.get("virustotal_analysis") or {},
                "entropy_analysis": analysis_results.get("entropy_analysis") or {},
                "summary": final_state.get("executive_summary") or {},
                "impact_analysis": analysis_results.get("impact_analysis") or {},
                "privacy_compliance": analysis_results.get("privacy_compliance") or {},
                "extracted_path": _storage_relative_extracted_path(final_state.get("extension_dir")),
                "extracted_files": extracted_files,
                "icon_path": icon_path,  # Relative path to icon (e.g., "icons/128.png")
                "icon_base64": icon_base64,  # Persisted icon bytes for environments with ephemeral storage
                "icon_media_type": icon_media_type,
                # UI-first payload (production) - handle LLM failures gracefully
                "report_view_model": build_report_view_model_safe(
                    manifest=manifest,
                    analysis_results={**analysis_results, "executive_summary": final_state.get("executive_summary") or {}},
                    metadata=metadata,
                    extension_id=extension_id,
                    scan_id=extension_id,
                    governance_verdict=governance_verdict_from_payload(final_state),
                ),
                # V2 scoring - overall_security_score for backward compatibility
                "overall_security_score": scoring_result.overall_score,
                # Explicit v2 keys for new consumers
                "security_score": scoring_result.security_score,
                "privacy_score": scoring_result.privacy_score,
                "governance_score": scoring_result.governance_score,
                "overall_confidence": scoring_result.overall_confidence,
                "decision_v2": scoring_result.decision.value,
                "decision_reasons_v2": scoring_result.reasons,
                "insufficient_data": scoring_result.insufficient_data,
                "decision_authority": scoring_result.decision_authority,
                # Full v2 scoring payload
                "scoring_v2": scoring_v2_payload,
                # Legacy helper outputs (kept for backward compatibility)
                "total_findings": count_total_findings(final_state),
                "risk_distribution": calculate_risk_distribution(final_state),
                "overall_risk": scoring_result.risk_level.value,  # Use v2 risk level
                "total_risk_score": calculate_total_risk_score(final_state),
                # Governance data (Pipeline B: Stages 2-8) - sanitize to prevent circular refs
                "governance_verdict": final_state.get("governance_verdict"),
                "governance_bundle": sanitize_for_json(final_state.get("governance_bundle")),
                "governance_report": sanitize_for_json(final_state.get("governance_report")),
                "governance_error": final_state.get("governance_error"),
                "publisher_disclosures": build_publisher_disclosures(
                    metadata, final_state.get("governance_bundle")
                ),
            }

            # Final sanitization pass to ensure JSON-serializability
            scan_results[extension_id] = sanitize_for_json(raw_results)
            logger.info("[TIMELINE] report_view_model_built → extension_id=%s, has_rvm=%s", extension_id, bool(scan_results[extension_id].get("report_view_model")))

            # Private upload: set user_id, visibility, source before save (so uploads are scoped and excluded from public feed)
            user_id = scan_user_ids.pop(extension_id, None)
            source = scan_source.pop(extension_id, None)
            scan_results[extension_id]["user_id"] = user_id
            scan_results[extension_id]["visibility"] = "private" if source == "upload" else "public"
            scan_results[extension_id]["source"] = source if source else "webstore"

            # Save to database *before* marking completed so GET /api/scan/results/:id finds the row
            logger.info("[TIMELINE] saving_to_database → extension_id=%s", extension_id)
            save_success = db.save_scan_result(scan_results[extension_id])
            if not save_success:
                logger.error("[TIMELINE] FAILED to save to database → extension_id=%s", extension_id)
            else:
                logger.info("[TIMELINE] saved_to_database → extension_id=%s, success=%s", extension_id, save_success)

            # Save to user history (best-effort; anonymous scans are not saved)
            if user_id:
                try:
                    db.add_user_scan_history(user_id=user_id, extension_id=extension_id)
                except Exception:
                    pass

            # Save to file (backup) - use safe JSON encoder to handle circular references
            logger.info("[TIMELINE] saving_to_file → extension_id=%s", extension_id)
            result_file = RESULTS_DIR / f"{extension_id}_results.json"
            try:
                with open(result_file, "w", encoding="utf-8") as f:
                    success = safe_json_dump(scan_results[extension_id], f, indent=2)
                if success:
                    logger.info("[TIMELINE] saved_to_file → extension_id=%s, file=%s", extension_id, result_file)
                else:
                    logger.warning("[TIMELINE] file_save_partial → extension_id=%s, file=%s", extension_id, result_file)
            except Exception as file_error:
                logger.error("[TIMELINE] file_save_failed → extension_id=%s, error=%s", extension_id, str(file_error))
                # Don't fail the scan if file save fails - database is the primary storage

            # Mark completed only after DB (and file) save so GET /api/scan/results/:id returns 200
            scan_status[extension_id] = "completed"
            workflow_duration = (datetime.now() - workflow_start).total_seconds()
            logger.info("[TIMELINE] scan_complete → extension_id=%s, duration=%.2fs", extension_id, workflow_duration)
        else:
            scan_status[extension_id] = "failed"
            logger.error("[TIMELINE] scan_failed → extension_id=%s, status=%s, error=%s", extension_id, final_state.get("status"), final_state.get("error"))
            # Use store metadata for name when download failed but we have extension_metadata from earlier node
            ext_meta = final_state.get("extension_metadata") or {}
            ext_meta = ext_meta if isinstance(ext_meta, dict) else {}
            resolved_name = (
                ext_meta.get("title") or ext_meta.get("name")
                or (ext_meta.get("chrome_stats") or {}).get("name") if isinstance(ext_meta.get("chrome_stats"), dict) else None
            ) or extension_id
            failed_payload = {
                "extension_id": extension_id,
                "extension_name": resolved_name,
                "url": url,
                "status": "failed",
                "error": _sanitize_error_for_client(final_state.get("error", "Unknown error")),
                "metadata": ext_meta,
                "manifest": {},
                "overall_security_score": 0,
                "overall_risk": "unknown",
                "total_findings": 0,
                "risk_distribution": {"high": 0, "medium": 0, "low": 0},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
            scan_results[extension_id] = failed_payload
            try:
                db.save_scan_result(failed_payload)
                logger.info("[TIMELINE] saved failed scan to database → extension_id=%s", extension_id)
            except Exception as save_err:
                logger.warning("[TIMELINE] failed to save failed scan to database → extension_id=%s, error=%s", extension_id, save_err)

    except Exception as e:
        scan_status[extension_id] = "failed"
        import traceback
        logger.error("[TIMELINE] workflow_exception → extension_id=%s, error=%s", extension_id, str(e))
        logger.error("[TIMELINE] workflow_exception_traceback → extension_id=%s\n%s", extension_id, traceback.format_exc())
        
        # Check for errors and provide user-friendly messages
        # All error messages should be user-friendly and not expose internal API details
        error_str = str(e)
        error_code = 503  # Default to service unavailable
        
        # User-friendly message for all service errors
        # Don't expose internal API details to users
        error_message = SERVICE_UNAVAILABLE_MESSAGE
        
        # Check for specific error types for internal logging (but use friendly message for user)
        if any(keyword in error_str.lower() for keyword in [
            "sk-proj-", "invalid_api_key", "incorrect api key", "authentication",
            "401", "api key", "apikey"
        ]):
            error_code = 503
            logger.error("[WORKFLOW] API authentication error: %s", error_str)
        elif any(keyword in error_str.lower() for keyword in [
            "connection refused", "errno 61", "errno 111", "timeout", "connection error"
        ]):
            error_code = 503
            logger.error("[WORKFLOW] Connection error: %s", error_str)
        elif any(keyword in error_str.lower() for keyword in [
            "token_quota_reached", "quota", "403", "rate limit"
        ]):
            error_code = 503
            logger.error("[WORKFLOW] Quota/rate limit error: %s", error_str)
        elif any(keyword in error_str.lower() for keyword in [
            "virustotal", "chromestats", "chrome-stats"
        ]):
            error_code = 503
            logger.error("[WORKFLOW] External service error: %s", error_str)
        else:
            logger.error("[WORKFLOW] Unknown error: %s", error_str)
        
        scan_results[extension_id] = {
            "extension_id": extension_id,
            "extension_name": extension_id,
            "url": url,
            "status": "failed",
            "error": _sanitize_error_for_client(error_message),
            "error_code": error_code,
            "metadata": {},
            "manifest": {},
            "overall_security_score": 0,
            "overall_risk": "unknown",
            "total_findings": 0,
            "risk_distribution": {"high": 0, "medium": 0, "low": 0},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        try:
            db.save_scan_result(scan_results[extension_id])
            logger.info("[TIMELINE] saved failed scan to database → extension_id=%s", extension_id)
        except Exception as save_err:
            logger.warning("[TIMELINE] failed to save failed scan to database → extension_id=%s, error=%s", extension_id, save_err)


def get_extracted_files(extracted_path: Optional[str]) -> list[str]:
    """Get list of extracted files from the extension."""
    if not extracted_path or not os.path.exists(extracted_path):
        return []

    files = []
    for root, _, filenames in os.walk(extracted_path):
        for filename in filenames:
            file_path = os.path.join(root, filename)
            # Store relative path from extracted_path
            rel_path = os.path.relpath(file_path, extracted_path)
            files.append(rel_path)

    return files


# Legacy scoring helpers (used by the scan-result builder below).
from extension_shield.api.scoring_legacy import (  # noqa: E402
    count_total_findings,
    calculate_total_risk_score,
)


def _coerce_int(value: Any) -> Optional[int]:
    """Best-effort int coercion."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _build_scoring_v2_for_payload(payload: Dict[str, Any], extension_id: str) -> Dict[str, Any]:
    """
    Build scoring_v2 from available scan payload fields (no LLM/report generation).
    Used by /api/recent when legacy rows are missing scoring_v2.
    """
    try:
        manifest = payload.get("manifest") or {}
        metadata = payload.get("metadata") or {}
        analysis_results = {
            "permissions_analysis": payload.get("permissions_analysis") or {},
            "javascript_analysis": payload.get("sast_results") or {},
            "webstore_analysis": payload.get("webstore_analysis") or {},
            "virustotal_analysis": payload.get("virustotal_analysis") or {},
            "entropy_analysis": payload.get("entropy_analysis") or {},
            "impact_analysis": payload.get("impact_analysis") or {},
            "privacy_compliance": payload.get("privacy_compliance") or {},
            "executive_summary": payload.get("summary") or {},
        }

        signal_pack_builder = SignalPackBuilder()
        signal_pack = signal_pack_builder.build(
            scan_id=extension_id,
            analysis_results=analysis_results,
            metadata=metadata,
            manifest=manifest,
            extension_id=extension_id,
        )

        user_count = metadata.get("user_count") or metadata.get("users") or signal_pack.webstore_stats.installs
        scoring_engine = ScoringEngine(weights_version="v1")
        scoring_result = scoring_engine.calculate_scores(
            signal_pack=signal_pack,
            manifest=manifest,
            user_count=user_count if isinstance(user_count, int) else None,
            permissions_analysis=analysis_results.get("permissions_analysis"),
        )

        scoring_v2_payload = scoring_result.model_dump_for_api()
        scoring_v2_payload["weights_version"] = "v1"
        gate_results = scoring_engine.get_gate_results() or []
        scoring_v2_payload["gate_results"] = [
            {
                "gate_id": g.gate_id,
                "decision": g.decision,
                "triggered": g.triggered,
                "confidence": g.confidence,
                "reasons": g.reasons,
            }
            for g in gate_results
        ]
        return scoring_v2_payload
    except Exception as exc:
        logger.warning(
            "[RISK_SIGNALS] Could not rebuild scoring_v2 for extension_id=%s: %s",
            extension_id,
            exc,
        )
        return {}


def _extract_risk_and_signals(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract risk and signals mapping from scan results payload.

    Returns:
        {"risk": int, "signals": {"security": int, "privacy": int, "gov": int}, "total_findings": int}
    """
    scoring_v2 = payload.get("scoring_v2")
    if not isinstance(scoring_v2, dict) or not scoring_v2:
        summary = payload.get("summary")
        if isinstance(summary, str):
            try:
                summary = json.loads(summary)
            except Exception:
                summary = {}
        if isinstance(summary, dict):
            candidate = summary.get("scoring_v2")
            if isinstance(candidate, dict) and candidate:
                scoring_v2 = candidate
    if (not isinstance(scoring_v2, dict) or not scoring_v2) and isinstance(payload.get("governance_bundle"), dict):
        candidate = payload.get("governance_bundle", {}).get("scoring_v2")
        if isinstance(candidate, dict) and candidate:
            scoring_v2 = candidate

    if not isinstance(scoring_v2, dict) or not scoring_v2:
        extension_id = str(payload.get("extension_id") or "unknown")
        scoring_v2 = _build_scoring_v2_for_payload(payload, extension_id=extension_id)
        if scoring_v2:
            payload["scoring_v2"] = scoring_v2

    overall_score = (
        _coerce_int((scoring_v2 or {}).get("overall_score"))
        or _coerce_int(payload.get("overall_security_score"))
        or _coerce_int(payload.get("security_score"))
        or 0
    )

    security_score = _coerce_int((scoring_v2 or {}).get("security_score"))
    if security_score is None and isinstance((scoring_v2 or {}).get("security_layer"), dict):
        security_score = _coerce_int((scoring_v2 or {}).get("security_layer", {}).get("score"))
    if security_score is None:
        security_score = _coerce_int(payload.get("security_score")) or _coerce_int(payload.get("overall_security_score"))

    privacy_score = _coerce_int((scoring_v2 or {}).get("privacy_score"))
    if privacy_score is None and isinstance((scoring_v2 or {}).get("privacy_layer"), dict):
        privacy_score = _coerce_int((scoring_v2 or {}).get("privacy_layer", {}).get("score"))
    if privacy_score is None:
        privacy_score = _coerce_int(payload.get("privacy_score"))

    governance_score = _coerce_int((scoring_v2 or {}).get("governance_score"))
    if governance_score is None and isinstance((scoring_v2 or {}).get("governance_layer"), dict):
        governance_score = _coerce_int((scoring_v2 or {}).get("governance_layer", {}).get("score"))
    if governance_score is None:
        governance_score = _coerce_int(payload.get("governance_score"))

    total_findings = 0
    if isinstance(scoring_v2, dict) and scoring_v2:
        combined_keys: set = set()
        for layer_key in ("security_layer", "privacy_layer", "governance_layer"):
            layer_obj = scoring_v2.get(layer_key)
            if not isinstance(layer_obj, dict):
                continue
            factors = layer_obj.get("factors", [])
            if not isinstance(factors, list):
                continue
            for factor in factors:
                if not isinstance(factor, dict):
                    continue
                sev = factor.get("severity")
                contrib = factor.get("contribution")
                try:
                    sev_num = float(sev) if sev is not None else 0.0
                except (TypeError, ValueError):
                    sev_num = 0.0
                try:
                    contrib_num = float(contrib) if contrib is not None else 0.0
                except (TypeError, ValueError):
                    contrib_num = 0.0
                if sev_num <= 0 and contrib_num <= 0:
                    continue
                factor_name = str(factor.get("name") or factor.get("id") or factor.get("key") or "unknown")
                combined_keys.add(f"{layer_key}:{factor_name}")

        gate_results = scoring_v2.get("gate_results", [])
        if isinstance(gate_results, list):
            for gate in gate_results:
                if isinstance(gate, dict) and bool(gate.get("triggered")):
                    gate_id = str(gate.get("gate_id") or "gate")
                    combined_keys.add(f"gate:{gate_id}")

        if combined_keys:
            total_findings = len(combined_keys)

    if total_findings == 0:
        facts = payload.get("governance_bundle", {}).get("facts", {})
        if isinstance(facts, dict):
            security_findings = facts.get("security_findings", {})
            if isinstance(security_findings, dict):
                deduped_findings = security_findings.get("deduped_findings", [])
                if isinstance(deduped_findings, list) and deduped_findings:
                    total_findings = len(deduped_findings)
                else:
                    total_findings = _coerce_int(security_findings.get("total_findings")) or 0

    if total_findings == 0:
        signal_pack = payload.get("signal_pack", {})
        if isinstance(signal_pack, dict):
            sast_signal = signal_pack.get("sast", {})
            if isinstance(sast_signal, dict):
                deduped = sast_signal.get("deduped_findings", [])
                if isinstance(deduped, list) and deduped:
                    total_findings = len(deduped)

    if total_findings == 0:
        total_findings = _coerce_int(payload.get("total_findings")) or 0

    if total_findings == 0:
        sast_results = payload.get("sast_results", {})
        if isinstance(sast_results, dict):
            sast_findings = sast_results.get("sast_findings", {})
            if isinstance(sast_findings, dict):
                seen: set = set()
                for file_path, findings_list in sast_findings.items():
                    if not isinstance(findings_list, list):
                        continue
                    for finding in findings_list:
                        if not isinstance(finding, dict):
                            continue
                        check_id = finding.get("check_id") or finding.get("rule_id", "")
                        line = (
                            finding.get("start", {}).get("line")
                            if isinstance(finding.get("start"), dict)
                            else finding.get("line")
                        )
                        key = f"{check_id}:{file_path}:{line}"
                        seen.add(key)
                total_findings = len(seen)

    signals: Dict[str, int] = {}
    if security_score is not None:
        signals["security"] = max(0, min(100, security_score))
    if privacy_score is not None:
        signals["privacy"] = max(0, min(100, privacy_score))
    if governance_score is not None:
        signals["gov"] = max(0, min(100, governance_score))

    return {
        "risk": max(0, min(100, int(overall_score))),
        "signals": signals,
        "total_findings": max(0, int(total_findings)),
    }


def calculate_risk_distribution(state: WorkflowState) -> Dict[str, int]:
    """Calculate distribution of risk levels."""
    distribution = {"high": 0, "medium": 0, "low": 0}
    analysis_results = state.get("analysis_results", {}) or {}
    javascript_analysis = analysis_results.get("javascript_analysis", {})
    js_analysis = []
    if javascript_analysis and isinstance(javascript_analysis, dict):
        sast_findings = javascript_analysis.get("sast_findings", {})
        for findings_list in sast_findings.values():
            if findings_list is not None:
                js_analysis.extend(findings_list)
    elif isinstance(javascript_analysis, list):
        js_analysis = javascript_analysis

    for finding in js_analysis:
        risk_level = finding.get("extra", {}).get("severity", "INFO").lower()
        if risk_level in ("critical", "high"):
            distribution["high"] += 1
        elif risk_level in ("error", "medium"):
            distribution["medium"] += 1
        else:
            distribution["low"] += 1

    permissions_analysis = analysis_results.get("permissions_analysis", {}) or {}
    permissions_details = (
        permissions_analysis.get("permissions_details")
        if isinstance(permissions_analysis, dict)
        else None
    )
    if not isinstance(permissions_details, dict):
        permissions_details = {}
    for _, perm_analysis in permissions_details.items():
        # Tri-state (D4): only CONFIRMED-unreasonable (False) contributes to the
        # distribution; None = analysis unavailable, not unreasonable.
        is_reasonable = perm_analysis.get("is_reasonable")
        risk = perm_analysis.get("risk_level", "").lower()
        if is_reasonable is False:
            if risk == "high":
                distribution["high"] += 1
            elif risk == "low":
                distribution["low"] += 1
            else:
                distribution["medium"] += 1
    return distribution


# ── API Endpoints ───────────────────────────────────────────────────────


def _no_frontend_html() -> str:
    """HTML shown when frontend is not built (e.g. only API running on 8007)."""
    return """<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>ExtensionShield API</title></head>
<body style="font-family: system-ui, sans-serif; max-width: 520px; margin: 60px auto; padding: 20px;">
  <h1>ExtensionShield API is running</h1>
  <p>You're on the <strong>API server</strong> (port 8007). The web app is not built here.</p>
  <ul>
    <li><strong>To use the app with latest changes:</strong> Run <code>make frontend</code> in another terminal, then open <a href="http://localhost:5173">http://localhost:5173</a>.</li>
    <li><strong>To serve the app from this port:</strong> Run <code>make build-and-serve</code> once (builds frontend and copies to static), then restart the API.</li>
  </ul>
  <p><a href="/docs">API docs</a> &middot; <a href="/health">Health</a></p>
</body>
</html>"""


@app.get("/")
async def root():
    """Root endpoint - serves frontend or API info."""
    # Serve frontend if available
    index_file = STATIC_DIR / "index.html"
    if STATIC_DIR.exists() and index_file.exists():
        return FileResponse(index_file)
    # Otherwise return helpful HTML (development mode)
    return HTMLResponse(_no_frontend_html())


# Legacy path redirects (so /scanner etc. work when requested directly)
@app.get("/scanner")
@app.get("/scanner/")
def redirect_scanner_to_scan():
    """Redirect legacy /scanner to canonical /scan."""
    return RedirectResponse(url="/scan", status_code=302)


@app.get("/robots.txt")
async def robots_txt(request: Request):
    """
    Dynamic robots.txt that varies by domain.
    
    - extensionshield.com: Allow all, point to sitemap
    - extensionscanner.com: Disallow all (redirect domain)
    - Note: extensionaudit.com will be added in the future
    """
    host = request.headers.get("host", "").lower()
    canonical_domain = "extensionshield.com"
    # Note: extensionaudit.com will be added in the future
    non_canonical_domains = ["extensionscanner.com"]
    
    # Check if this is a non-canonical domain
    if any(host.startswith(domain) for domain in non_canonical_domains):
        # Disallow all for non-canonical domains
        robots_content = """User-agent: *
Disallow: /
"""
    else:
        # Canonical domain: only origin rules. Cloudflare Managed robots.txt injects
        # Content-Signal + AI crawler disallows; we must not duplicate that block.
        robots_content = """User-agent: *
Allow: /
Disallow: /settings
Disallow: /reports

# Sitemap
Sitemap: https://extensionshield.com/sitemap.xml
"""
    
    return Response(
        content=robots_content,
        media_type="text/plain",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@app.get("/sitemap.xml")
async def sitemap_xml():
    """
    Serve sitemap.xml for SEO crawlers. Built at frontend build time into static/.
    Explicit route ensures 200 with application/xml; avoid relying on catch-all.
    """
    sitemap_path = STATIC_DIR / "sitemap.xml"
    if not sitemap_path.is_file():
        raise HTTPException(status_code=404, detail="Sitemap not found")
    return Response(
        content=sitemap_path.read_text(encoding="utf-8"),
        media_type="application/xml",
    )


@app.get("/api")
@app.get("/api/")
async def api_root():
    """API root: basic info and pointer to docs. Prevents 'API endpoint not found' when hitting /api or /api/."""
    return {
        "api": "ExtensionShield",
        "docs": "https://extensionshield.com/resources/api-service",
        "health": "/api/health/db",
        "scan_trigger": "POST /api/scan/trigger",
        "scan_results": "GET /api/scan/results/{identifier}",
    }


@app.get("/api/limits/deep-scan")
async def get_deep_scan_limit(http_request: Request):
    """Return daily deep-scan usage status for the current user/IP."""
    rate_limit_key = _get_rate_limit_key(http_request)
    return _deep_scan_limit_status(rate_limit_key)


def _send_enterprise_pilot_emails(item: Dict[str, Any]) -> None:
    """Send confirmation email to the user (and optional notify team) via Resend. No-op if RESEND_API_KEY unset."""
    api_key = os.getenv("RESEND_API_KEY", "").strip()
    if not api_key or api_key.startswith("re_xxxx"):
        return
    from_email = os.getenv("ENTERPRISE_FROM_EMAIL", "ExtensionShield <onboarding@resend.dev>").strip()
    try:
        import resend
        resend.api_key = api_key
        to_email = item.get("email")
        name = item.get("name", "")
        company = item.get("company", "")
        notes = item.get("notes") or ""
        subject = "We received your Enterprise Pilot request"
        html = f"""
        <p>Hi{(' ' + name) if name else ''},</p>
        <p>Thanks for your interest in ExtensionShield Enterprise. We've received your pilot request for <strong>{company or 'your organization'}</strong>.</p>
        <p>We'll review it and reach out to you soon.</p>
        <p>— The ExtensionShield team</p>
        """
        if notes:
            html += f"<p><em>Your note: {notes}</em></p>"
        resend.Emails.send({
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html,
        })
        notify_email = os.getenv("ENTERPRISE_NOTIFY_EMAIL", "").strip()
        if notify_email and notify_email != to_email:
            interests = item.get("interests") or []
            custom_notes = (item.get("custom_extension_notes") or "").strip() or None
            interests_str = ", ".join(interests) if interests else "—"
            notify_html = f"<p>New pilot request from {name} &lt;{to_email}&gt;, company: {company or '—'}.</p><p>Interests: {interests_str}</p><p>Notes: {notes or '—'}</p>"
            if custom_notes:
                notify_html += f"<p><strong>Custom extension notes:</strong> {custom_notes}</p>"
            resend.Emails.send({
                "from": from_email,
                "to": [notify_email],
                "subject": f"New Enterprise Pilot: {company or '—'} ({name})",
                "html": notify_html,
            })
    except Exception as e:
        logger.warning("Enterprise pilot email send failed: %s", e)
        # Do not fail the request; submission is already stored


@app.post("/api/enterprise/pilot-request", dependencies=[require_cloud_dep("enterprise_forms")])
async def create_enterprise_pilot_request(request: EnterprisePilotRequest, http_request: Request):
    """Capture an Enterprise pilot request; optionally send confirmation email via Resend."""
    user_id = _get_user_id(http_request)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "received_at": now,
        "user_id": user_id,
        "name": request.name.strip(),
        "email": request.email.strip(),
        "company": (request.company or "").strip() or None,
        "notes": (request.notes or "").strip() or None,
        "interests": request.interests or [],
        "custom_extension_notes": (request.custom_extension_notes or "").strip() or None,
    }
    enterprise_pilot_requests.append(item)
    _send_enterprise_pilot_emails(item)
    return {"ok": True, "received_at": now}


@app.post("/api/careers/apply", dependencies=[require_cloud_dep("enterprise_forms")])
@_rate_limit("5/minute")
async def create_careers_apply(request: CareersApplyRequest, http_request: Request):
    """Accept careers application; send to team email via Resend (and optional confirmation to applicant)."""
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "received_at": now,
        "full_name": request.full_name.strip(),
        "email": request.email.strip(),
        "role_id": (request.role_id or "").strip() or None,
        "linkedin_url": (request.linkedin_url or "").strip() or None,
        "github_url": (request.github_url or "").strip() or None,
        "resume_link": (request.resume_link or "").strip() or None,
        "note": (request.note or "").strip() or None,
    }
    careers_apply_submissions.append(item)
    _send_careers_apply_email(item)
    return {"ok": True, "received_at": now}


@app.post("/api/feedback")
async def submit_feedback(feedback: FeedbackRequest, http_request: Request):
    """
    Submit feedback for a scan result.
    
    Allows users to indicate whether a scan result was helpful, and optionally
    provide details about why it wasn't (false positive, score issues, etc.).
    """
    user_id = _get_user_id(http_request)
    
    # If helpful=true, ignore reason/suggested_score/comment
    reason = None if feedback.helpful else (feedback.reason.value if feedback.reason else None)
    suggested_score = None if feedback.helpful else feedback.suggested_score
    comment = None if feedback.helpful else feedback.comment
    
    # Save feedback to database (SQLite or Supabase)
    db.save_feedback(
        scan_id=feedback.scan_id,
        helpful=feedback.helpful,
        reason=reason,
        suggested_score=suggested_score,
        comment=comment,
        user_id=user_id,
        model_version=None,  # TODO: Extract from scan result metadata
        ruleset_version=None,  # TODO: Extract from scan result metadata
    )
    
    return {"ok": True}


# -----------------------------------------------------------------------------
# Community review queue (Supabase only)
# -----------------------------------------------------------------------------

@app.get("/api/community/review-queue", dependencies=[require_cloud_dep("community_queue")])
async def get_community_review_queue():
    """List review queue items with extension names and vote counts. Sorted: open, in_review, then by newest."""
    if not isinstance(db, SupabaseDatabase):
        return []
    return db.get_review_queue()


@app.post("/api/community/review-queue/claim", dependencies=[require_cloud_dep("community_queue")])
async def claim_community_review_item(body: ReviewQueueClaimRequest, http_request: Request):
    """Claim a queue item (set status=in_review, optional assigned_to_user_id)."""
    if not isinstance(db, SupabaseDatabase):
        raise HTTPException(
            status_code=501,
            detail={"error": "not_implemented", "feature": "community_queue", "mode": get_feature_flags().mode},
        )
    user_id = _get_user_id(http_request)
    ok = db.claim_review_queue_item(body.queue_item_id, user_id)
    if not ok:
        raise HTTPException(status_code=400, detail="Claim failed")
    return {"ok": True}


@app.post("/api/community/review-queue/vote", dependencies=[require_cloud_dep("community_queue")])
async def vote_community_review_item(body: ReviewQueueVoteRequest, http_request: Request):
    """Upsert a vote (up/down) and optional note. Requires authenticated user."""
    if not isinstance(db, SupabaseDatabase):
        raise HTTPException(
            status_code=501,
            detail={"error": "not_implemented", "feature": "community_queue", "mode": get_feature_flags().mode},
        )
    if body.vote not in ("up", "down"):
        raise HTTPException(status_code=400, detail="vote must be 'up' or 'down'")
    user_id = _get_user_id(http_request)
    if user_id in (None, "", "anon"):
        raise HTTPException(status_code=401, detail="Sign in to vote")
    ok = db.upsert_review_vote(body.queue_item_id, user_id, body.vote, body.note)
    if not ok:
        raise HTTPException(status_code=400, detail="Vote failed")
    return {"ok": True}


@app.post("/api/scan/trigger")
@_rate_limit("6/minute")  # Conservative for VirusTotal (3 keys); cached lookups return immediately without running scan
async def trigger_scan(scan_request: ScanRequest, background_tasks: BackgroundTasks, request: Request):
    """
    Trigger a new extension scan.

    Args:
        request: Scan request containing the extension URL
        background_tasks: FastAPI background tasks

    Returns:
        Scan trigger confirmation with extension ID
    """
    url = scan_request.url
    extension_id = extract_extension_id(url)

    if not extension_id:
        raise HTTPException(status_code=400, detail="Invalid Chrome Web Store URL")

    cached_payload = scan_results.get(extension_id)
    if not cached_payload:
        try:
            existing = db.get_scan_result(extension_id)
            if existing:
                cached_payload = _hydrate_db_scan_result(existing, extension_id)
        except Exception:
            cached_payload = None

    # If we already have results, use a fast version check only (no blocking store refresh)
    # so cached lookups return immediately. Full store refresh runs on GET when needed.
    if cached_payload:
        cached_version = _get_payload_version(cached_payload)
        live_version = _fast_live_version_check(extension_id, timeout_seconds=2.0)
        version_changed = (
            cached_version is not None
            and live_version is not None
            and cached_version != live_version
        )
        if not version_changed:
            # Bump extension to top of recent scans (for both auth and anonymous users)
            try:
                db.touch_scan_result(extension_id)
            except Exception:
                pass
            # Record user history even for cached lookups (if authenticated)
            user_id = getattr(getattr(request, "state", None), "user_id", None)
            if user_id:
                try:
                    db.add_user_scan_history(user_id=user_id, extension_id=extension_id)
                except Exception:
                    pass
            scan_status[extension_id] = "completed"
            logger.info(
                "[CACHED_PATH] Returning cached results for %s (no version change)",
                extension_id,
            )
            return {
                "message": "Cached results available",
                "extension_id": extension_id,
                "status": "completed",
                "already_scanned": True,
                "scan_type": "lookup",
            }
        logger.info(
            "[CACHED_PATH] Version change detected for %s (%s -> %s); starting deep rescan",
            extension_id,
            cached_version,
            live_version,
        )
    elif _has_cached_results(extension_id):
        # File-only fallback: we know we have cached results but cannot safely inspect version.
        try:
            db.touch_scan_result(extension_id)
        except Exception:
            pass
        user_id = getattr(getattr(request, "state", None), "user_id", None)
        if user_id:
            try:
                db.add_user_scan_history(user_id=user_id, extension_id=extension_id)
            except Exception:
                pass
        scan_status[extension_id] = "completed"
        return {
            "message": "Cached results available",
            "extension_id": extension_id,
            "status": "completed",
            "already_scanned": True,
            "scan_type": "lookup",
        }

    # Check if already scanning
    if extension_id in scan_status and scan_status[extension_id] == "running":
        return {
            "message": "Scan already in progress",
            "extension_id": extension_id,
            "status": "running",
        }

    # Get rate limit key (user_id for authenticated, IP for anonymous)
    # This allows both authenticated and anonymous users to scan, with IP-based limits for anonymous
    rate_limit_key = _get_rate_limit_key(request)
    settings = get_settings()
    
    # Enforce daily deep-scan limit - skip in development
    # Uses rate_limit_key (user_id for authenticated users, IP for anonymous)
    is_anonymous = rate_limit_key.startswith("ip:")
    if settings.is_prod():
        limit_status = _deep_scan_limit_status(rate_limit_key)
        if limit_status["remaining"] <= 0:
            limit_num = limit_status.get("limit", 1)
            scans_word = "scan" if limit_num == 1 else "scans"
            raise HTTPException(
                status_code=429,
                detail={
                    "error_code": "DAILY_DEEP_SCAN_LIMIT",
                    "message": f"You've reached your daily scan limit ({limit_num} {scans_word}). Sign in to get more scans or try again tomorrow.",
                    "is_anonymous": is_anonymous,
                    "requires_login": is_anonymous,
                    **limit_status,
                },
            )

    # Consume one deep scan since we are starting a new analysis run
    after_consume = _consume_deep_scan(rate_limit_key)

    # Start background analysis
    scan_user_ids[extension_id] = getattr(getattr(request, "state", None), "user_id", None)
    background_tasks.add_task(run_analysis_workflow, url, extension_id)

    return {
        "message": "Scan triggered successfully",
        "extension_id": extension_id,
        "status": "running",
        "already_scanned": False,
        "scan_type": "deep_scan",
        "deep_scan_limit": after_consume,
    }


@app.post("/api/scan/upload")
@_rate_limit("10/minute")
async def upload_and_scan(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...)
):
    """
    Upload a CRX/ZIP file and trigger analysis. Requires authentication in production.

    Args:
        file: Uploaded CRX or ZIP file
        background_tasks: FastAPI background tasks

    Returns:
        Scan trigger confirmation with extension ID
    """
    settings = get_settings()
    user_id = getattr(getattr(request, "state", None), "user_id", None)
    if settings.is_prod() and not user_id:
        raise HTTPException(status_code=401, detail="Sign in to upload private builds")

    # Validate file extension
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    # Sanitize filename to prevent path traversal attacks
    import os
    safe_filename = os.path.basename(file.filename)  # Remove any path components
    # Remove any remaining dangerous characters
    safe_filename = "".join(c for c in safe_filename if c.isalnum() or c in "._-")
    if not safe_filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    filename_lower = safe_filename.lower()
    if not (filename_lower.endswith('.crx') or filename_lower.endswith('.zip')):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only .crx and .zip files are supported"
        )

    # Validate file size (max 100MB)
    max_size = 100 * 1024 * 1024  # 100MB
    file_content = await file.read()
    if len(file_content) > max_size:
        raise HTTPException(
            status_code=400,
            detail=f"File too large. Maximum size is {max_size / (1024*1024):.0f}MB"
        )

    # Validate MIME type (additional security check)
    import mimetypes
    detected_mime, _ = mimetypes.guess_type(safe_filename)
    # Check content magic bytes for CRX (Chrome Extension) or ZIP
    is_crx = file_content[:4] == b'Cr24'  # CRX v3 magic bytes
    is_zip = file_content[:2] == b'PK'  # ZIP magic bytes
    
    if not (is_crx or is_zip):
        raise HTTPException(
            status_code=400,
            detail="Invalid file content. File does not appear to be a valid CRX or ZIP file"
        )

    # Generate unique ID for uploaded file
    import uuid
    extension_id = str(uuid.uuid4())

    # Get rate limit key (user_id for authenticated, IP for anonymous)
    # File uploads are allowed for both authenticated and anonymous users with IP-based limits
    settings = get_settings()
    rate_limit_key = _get_rate_limit_key(request)

    # Enforce daily deep-scan limit (uploads are always deep scans) - skip in development
    is_anonymous = rate_limit_key.startswith("ip:")
    if settings.is_prod():
        limit_status = _deep_scan_limit_status(rate_limit_key)
        if limit_status["remaining"] <= 0:
            limit_num = limit_status.get("limit", 1)
            scans_word = "scan" if limit_num == 1 else "scans"
            raise HTTPException(
                status_code=429,
                detail={
                    "error_code": "DAILY_DEEP_SCAN_LIMIT",
                    "message": f"You've reached your daily scan limit ({limit_num} {scans_word}). Sign in to get more scans or try again tomorrow.",
                    "is_anonymous": is_anonymous,
                    "requires_login": is_anonymous,
                    **limit_status,
                },
            )
    after_consume = _consume_deep_scan(rate_limit_key)

    # Save uploaded file to extensions_storage (use sanitized filename)
    file_path = RESULTS_DIR / f"{extension_id}_{safe_filename}"

    try:
        with open(file_path, "wb") as buffer:
            buffer.write(file_content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save file: {str(e)}")

    # Start background analysis with local file path (private upload: user_id + source for DB)
    scan_user_ids[extension_id] = getattr(getattr(request, "state", None), "user_id", None)
    scan_source[extension_id] = "upload"
    background_tasks.add_task(run_analysis_workflow, str(file_path), extension_id)

    return {
        "message": "File uploaded and scan triggered successfully",
        "extension_id": extension_id,
        "filename": file.filename,
        "status": "running",
        "already_scanned": False,
        "scan_type": "deep_scan",
        "deep_scan_limit": after_consume,
    }


@app.get("/api/scan/status/{extension_id}")
async def get_scan_status(extension_id: str) -> ScanStatusResponse:
    """
    Get the status of a scan.

    Args:
        extension_id: Chrome extension ID

    Returns:
        Scan status information
    """
    status = scan_status.get(extension_id)

    if not status:
        return ScanStatusResponse(scanned=False)

    # Safely extract error and error_code to avoid circular reference issues
    # Only extract simple types (str, int, None) to prevent serialization problems
    error = None
    error_code = None
    
    try:
        result = scan_results.get(extension_id, {})
    except Exception as e:
        logger.warning(f"[get_scan_status] Failed to access scan_results for {extension_id}: {e}")
        result = {}
    
    try:
        error_val = result.get("error")
        # Ensure error is a string or None, not a complex object
        if error_val is not None:
            if isinstance(error_val, str):
                error = _sanitize_error_for_client(error_val)
            else:
                # Convert to string if it's not already
                error = _sanitize_error_for_client(str(error_val))
    except Exception as e:
        # If there's any issue accessing error (e.g., circular reference), set to None
        logger.warning(f"[get_scan_status] Failed to extract error for {extension_id}: {e}")
        error = None
    
    try:
        error_code_val = result.get("error_code")
        # Ensure error_code is an int or None
        if error_code_val is not None:
            if isinstance(error_code_val, int):
                error_code = error_code_val
            elif isinstance(error_code_val, (str, float)):
                # Try to convert to int if possible
                try:
                    error_code = int(error_code_val)
                except (ValueError, TypeError):
                    error_code = None
    except Exception as e:
        # If there's any issue accessing error_code, set to None
        logger.warning(f"[get_scan_status] Failed to extract error_code for {extension_id}: {e}")
        error_code = None

    return ScanStatusResponse(
        scanned=status == "completed",
        status=status,
        extension_id=extension_id,
        error=error,
        error_code=error_code,
    )


@app.get("/api/scan/results/{identifier}")
async def get_scan_results(identifier: str, http_request: Request):
    """
    Get the results of a completed scan.

    Args:
        identifier: Chrome extension ID (32 chars a-p) or extension name slug (e.g. "session-buddy")

    Returns:
        Complete scan results
    """
    logger.debug("[get_scan_results] identifier=%s", identifier)

    # Resolve identifier to extension_id for memory/file lookups.
    # Accept Chrome extension ID (32 a-p) or upload scan ID (e.g. UUID).
    extension_id = identifier if (_is_extension_id(identifier) or identifier in scan_results) else None

    # Authorization: logged-in users may view any completed scan.
    # Only block if an *in-progress* scan belongs to a *different* user.
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if user_id and extension_id:
        scan_owner = scan_user_ids.get(extension_id)
        if scan_owner and scan_owner != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

    # Try memory first (works for both Chrome IDs and upload UUIDs)
    if extension_id and extension_id in scan_results:
        payload = scan_results[extension_id]
        if payload is None:
            del scan_results[extension_id]
        else:
            logger.debug("[get_scan_results] Using memory cache path")
            # Private reports: only the owning user may view
            if payload.get("visibility") == "private":
                requester_id = getattr(getattr(http_request, "state", None), "user_id", None)
                if not requester_id or payload.get("user_id") != requester_id:
                    raise HTTPException(status_code=404, detail="Scan results not found")
            # Upgrade legacy payload and ensure consumer_insights (no blocking store refresh)
            payload = upgrade_legacy_payload(payload, extension_id)
            payload = ensure_consumer_insights(payload)
            ensure_description_in_meta(payload)
            ensure_name_in_payload(payload)
            # Add risk and signals mapping
            payload["risk_and_signals"] = _extract_risk_and_signals(payload)
            scan_results[extension_id] = payload
            log_scan_results_return_shape("memory", payload)
            if payload.get("error"):
                payload["error"] = _sanitize_error_for_client(payload["error"])
            return payload

    # Try loading from database (accepts extension_id or slug)
    logger.debug("[get_scan_results] Trying database path")
    results = db.get_scan_result(identifier)
    if results:
        extension_id = results.get("extension_id") or extension_id
        logger.debug("[get_scan_results] Database row exists: %s", bool(results))
        # Private reports: only the owning user may view
        if results.get("visibility") == "private":
            requester_id = getattr(getattr(http_request, "state", None), "user_id", None)
            if not requester_id or results.get("user_id") != requester_id:
                raise HTTPException(status_code=404, detail="Scan results not found")
        formatted_results = _hydrate_db_scan_result(results, identifier)

        # Track if we need to upgrade (legacy payload without scoring_v2/report_view_model)
        had_scoring_v2 = bool(formatted_results.get("scoring_v2"))
        had_report_view_model = bool(formatted_results.get("report_view_model"))
        
        # Upgrade legacy payload and ensure consumer_insights (no blocking store refresh)
        payload = upgrade_legacy_payload(formatted_results, extension_id)
        payload = ensure_consumer_insights(payload)
        ensure_description_in_meta(payload)
        ensure_name_in_payload(payload)
        # Add risk and signals mapping
        payload["risk_and_signals"] = _extract_risk_and_signals(payload)
        scan_results[extension_id] = payload  # Cache in memory

        # Persist upgraded payload back to database (background, non-blocking)
        # Only if we actually computed new scoring_v2 or report_view_model
        now_has_scoring_v2 = bool(payload.get("scoring_v2"))
        now_has_report_view_model = bool(payload.get("report_view_model"))
        if (now_has_scoring_v2 and not had_scoring_v2) or (now_has_report_view_model and not had_report_view_model):
            try:
                db.update_scan_summary(
                    extension_id,
                    payload.get("scoring_v2"),
                    payload.get("report_view_model"),
                )
                logger.debug("[get_scan_results] Persisted upgraded payload to DB for %s", extension_id)
            except Exception as persist_err:
                logger.debug("[get_scan_results] Failed to persist upgraded payload: %s", persist_err)
        
        log_scan_results_return_shape("db", payload)
        if payload.get("error"):
            payload["error"] = _sanitize_error_for_client(payload["error"])
        return payload
    else:
        logger.debug("[get_scan_results] Database row does NOT exist for identifier=%s", identifier)

    # Try loading from file (fallback; use identifier so upload UUID works)
    if not extension_id:
        extension_id = identifier
    if not extension_id:
        raise HTTPException(status_code=404, detail="Scan results not found")
    logger.debug("[get_scan_results] Trying file path")
    result_file = RESULTS_DIR / f"{extension_id}_results.json"
    if result_file.exists():
        logger.debug("[get_scan_results] File exists: %s", result_file)
        try:
            with open(result_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            # Private reports: only the owning user may view
            if payload.get("visibility") == "private":
                requester_id = getattr(getattr(http_request, "state", None), "user_id", None)
                if not requester_id or payload.get("user_id") != requester_id:
                    raise HTTPException(status_code=404, detail="Scan results not found")
            # Upgrade legacy payload and ensure consumer_insights
            payload = upgrade_legacy_payload(payload, extension_id)
            payload = ensure_consumer_insights(payload)
            ensure_description_in_meta(payload)
            ensure_name_in_payload(payload)
            # Add risk and signals mapping
            payload["risk_and_signals"] = _extract_risk_and_signals(payload)
            scan_results[extension_id] = payload  # Cache in memory
            # Persist upgraded payload to database so subsequent requests skip file I/O
            try:
                db.save_scan_result(payload)
            except Exception:
                pass
            log_scan_results_return_shape("file", payload)
            if payload.get("error"):
                payload["error"] = _sanitize_error_for_client(payload["error"])
            return payload
        except json.JSONDecodeError as e:
            logger.error("[get_scan_results] JSON file is corrupted for %s: %s", extension_id, str(e))
            # Delete the corrupted file
            try:
                result_file.unlink()
                logger.debug("[get_scan_results] Deleted corrupted JSON file: %s", result_file)
            except Exception as delete_err:
                logger.debug("[get_scan_results] Failed to delete corrupted file: %s", str(delete_err))
    else:
        logger.debug("[get_scan_results] File does NOT exist: %s", result_file)

    logger.error("[get_scan_results] No results found in memory, DB, or file for identifier=%s", identifier)
    # When client sends X-Prefer-Soft-NotFound, return 200 + body to avoid console 404 noise from batch checks.
    if http_request.headers.get("X-Prefer-Soft-NotFound", "").lower() in ("1", "true", "yes"):
        return JSONResponse(status_code=200, content={"_st": "not_found", "message": "Scan results not found"})
    raise HTTPException(status_code=404, detail="Scan results not found")


# ---------------------------------------------------------------------------
# Batch endpoints for Chrome extension popup performance
# ---------------------------------------------------------------------------

def _lookup_scan_result(
    extension_id: str,
    *,
    lightweight: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Internal helper: look up a scan result via memory → DB → file.

    When *lightweight* is True the expensive ``upgrade_legacy_payload`` step
    is skipped — the caller only needs the score / risk-level for badge
    rendering (used by the batch endpoint to stay fast).

    Returns the payload dict or ``None`` if not found anywhere.
    """
    # 1. Memory cache (instant)
    payload = scan_results.get(extension_id)
    if payload is not None:
        if lightweight:
            ensure_name_in_payload(payload)
            payload["risk_and_signals"] = _extract_risk_and_signals(payload)
            return payload
        payload = upgrade_legacy_payload(payload, extension_id)
        payload = ensure_consumer_insights(payload)
        ensure_description_in_meta(payload)
        ensure_name_in_payload(payload)
        payload["risk_and_signals"] = _extract_risk_and_signals(payload)
        scan_results[extension_id] = payload
        return payload

    # 2. Database
    try:
        db_row = db.get_scan_result(extension_id)
    except Exception:
        db_row = None

    if db_row:
        resolved_id = db_row.get("extension_id") or extension_id
        formatted = _hydrate_db_scan_result(db_row, extension_id)
        if lightweight:
            ensure_name_in_payload(formatted)
            formatted["risk_and_signals"] = _extract_risk_and_signals(formatted)
            scan_results[resolved_id] = formatted  # warm the memory cache
            return formatted
        payload = upgrade_legacy_payload(formatted, resolved_id)
        payload = ensure_consumer_insights(payload)
        ensure_description_in_meta(payload)
        ensure_name_in_payload(payload)
        payload["risk_and_signals"] = _extract_risk_and_signals(payload)
        scan_results[resolved_id] = payload
        return payload

    # 3. File fallback
    result_file = RESULTS_DIR / f"{extension_id}_results.json"
    if result_file.exists():
        try:
            with open(result_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (json.JSONDecodeError, OSError):
            return None
        if lightweight:
            ensure_name_in_payload(payload)
            payload["risk_and_signals"] = _extract_risk_and_signals(payload)
            scan_results[extension_id] = payload
            return payload
        payload = upgrade_legacy_payload(payload, extension_id)
        payload = ensure_consumer_insights(payload)
        ensure_description_in_meta(payload)
        ensure_name_in_payload(payload)
        payload["risk_and_signals"] = _extract_risk_and_signals(payload)
        scan_results[extension_id] = payload
        return payload

    return None


@app.post("/api/scan/batch-results")
@_rate_limit("30/minute")
async def batch_scan_results(req: BatchResultsRequest, request: Request):
    """
    Batch lookup of scan results for multiple extensions.

    Used by the Chrome extension popup to fetch all installed extension
    results in a single HTTP call instead of N individual GET requests.
    Returns lightweight payloads (skips expensive legacy upgrades) with
    just enough data for badge rendering.

    Returns:
        Dict mapping extension_id → payload (or {\"_st\": \"not_found\"}).
    """
    if len(req.extension_ids) > 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum 50 extension IDs per batch request",
        )

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique_ids: list[str] = []
    for eid in req.extension_ids:
        if eid not in seen:
            seen.add(eid)
            unique_ids.append(eid)

    results: Dict[str, Any] = {}
    for ext_id in unique_ids:
        payload = _lookup_scan_result(ext_id, lightweight=True)
        if payload is None:
            results[ext_id] = {"_st": "not_found"}
        else:
            if payload.get("error"):
                payload["error"] = _sanitize_error_for_client(payload["error"])
            results[ext_id] = payload

    return results


@app.post("/api/scan/batch-status")
@_rate_limit("60/minute")
async def batch_scan_status(req: BatchStatusRequest, request: Request):
    """
    Batch lookup of scan statuses for multiple extensions.

    Used by the Chrome extension popup to poll all in-progress scans
    in a single HTTP call instead of N individual GET requests.

    Returns:
        Dict with \"statuses\" mapping extension_id → {scanned, status}.
    """
    if len(req.extension_ids) > 50:
        raise HTTPException(
            status_code=400,
            detail="Maximum 50 extension IDs per batch request",
        )

    statuses: Dict[str, Dict[str, Any]] = {}
    for ext_id in req.extension_ids:
        status = scan_status.get(ext_id)
        statuses[ext_id] = {
            "scanned": status == "completed",
            "status": status or "unknown",
        }

    return {"statuses": statuses}


@app.get("/api/scan/enforcement_bundle/{extension_id}")
async def get_enforcement_bundle(extension_id: str):
    """
    Get the governance enforcement bundle for an analyzed extension.
    
    This endpoint returns the complete governance decisioning data including:
    - facts: Normalized security analysis data
    - evidence_index: Chain-of-custody evidence items
    - signals: Extracted governance signals
    - store_listing: Chrome Web Store listing data
    - context: Policy evaluation context
    - rule_results: Individual rule evaluation outcomes
    - report: Final governance decision and report
    
    Args:
        extension_id: Chrome extension ID
        
    Returns:
        Complete governance enforcement bundle
    """
    # Try memory first
    results = scan_results.get(extension_id)
    
    # Try loading from database if not in memory
    if not results:
        results = db.get_scan_result(extension_id)
        if results:
            scan_results[extension_id] = results
    
    # Try loading from file (fallback)
    if not results:
        result_file = RESULTS_DIR / f"{extension_id}_results.json"
        if result_file.exists():
            with open(result_file, "r", encoding="utf-8") as f:
                results = json.load(f)
                scan_results[extension_id] = results
    
    if not results:
        raise HTTPException(status_code=404, detail="Scan results not found")
    
    # Check if governance analysis was run
    governance_bundle = results.get("governance_bundle")
    
    if governance_bundle is None:
        # Governance analysis was not run or failed
        governance_error = results.get("governance_error")
        if governance_error:
            logger.error(
                "Governance failed for %s: %s",
                extension_id,
                governance_error,
            )
            raise HTTPException(
                status_code=500,
                detail="Governance analysis failed. Please try again."
            )
        raise HTTPException(
            status_code=404,
            detail="Governance enforcement bundle not available. Analysis may be in progress."
        )
    
    # Return the enforcement bundle with additional metadata
    return {
        "extension_id": extension_id,
        "extension_name": results.get("extension_name"),
        "verdict": results.get("governance_verdict"),
        "timestamp": results.get("timestamp"),
        "bundle": governance_bundle,
    }


@app.get("/api/scan/report/{extension_id}")
async def generate_pdf_report(extension_id: str) -> Response:
    """
    Generate a PDF security report for an analyzed extension.

    Args:
        extension_id: Chrome extension ID

    Returns:
        PDF file as downloadable response
    """
    # Get scan results
    results = scan_results.get(extension_id)

    # Try database if not in memory
    if not results:
        results = db.get_scan_result(extension_id)
        if results:
            scan_results[extension_id] = results

    # Try filesystem if not in database
    if not results:
        results_file = RESULTS_DIR / f"{extension_id}_results.json"
        if results_file.exists():
            with open(results_file, "r", encoding="utf-8") as f:
                results = json.load(f)
                scan_results[extension_id] = results

    if not results:
        raise HTTPException(status_code=404, detail="Scan results not found")

    # Generate PDF report
    try:
        report_generator = ReportGenerator()
        if not report_generator.enabled:
            raise HTTPException(
                status_code=503,
                detail="PDF generation is disabled. Install weasyprint to enable."
            )

        pdf_bytes = report_generator.generate_pdf(results)

        # Get extension name for filename
        extension_name = (results.get("metadata") or {}).get("title") or results.get("extension_name") or extension_id
        safe_name = "".join(c for c in (extension_name or extension_id) if c.isalnum() or c in " -_")[:50]
        filename = f"ExtensionShield_Report_{safe_name}.pdf"

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF: {str(e)}")


@app.get("/api/scan/files/{extension_id}")
async def get_file_list(extension_id: str, http_request: Request) -> FileListResponse:
    """
    Get list of files in the extracted extension.

    Args:
        extension_id: Chrome extension ID

    Returns:
        List of file paths
    """
    # Authorization: block only if in-progress scan belongs to a different user
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if user_id:
        scan_owner = scan_user_ids.get(extension_id)
        if scan_owner and scan_owner != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    results = scan_results.get(extension_id)
    if not results:
        raise HTTPException(status_code=404, detail="Extension not found")

    extracted_path = results.get("extracted_path")
    if not extracted_path or not os.path.exists(extracted_path):
        raise HTTPException(status_code=404, detail="Extracted files not found")

    files = get_extracted_files(extracted_path)
    return FileListResponse(files=files)


@app.get("/api/scan/file/{extension_id}/{file_path:path}")
async def get_file_content(extension_id: str, file_path: str, http_request: Request) -> FileContentResponse:
    """
    Get content of a specific file from the extracted extension.

    Args:
        extension_id: Chrome extension ID
        file_path: Relative path to the file

    Returns:
        File content
    """
    # Authorization: block only if in-progress scan belongs to a different user
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if user_id:
        scan_owner = scan_user_ids.get(extension_id)
        if scan_owner and scan_owner != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    results = scan_results.get(extension_id)
    if not results:
        raise HTTPException(status_code=404, detail="Extension not found")

    extracted_path = results.get("extracted_path")
    if not extracted_path:
        raise HTTPException(status_code=404, detail="Extracted files not found")

    # Construct full file path
    full_path = os.path.join(extracted_path, file_path)

    # Security check: ensure path is within extracted directory
    if not os.path.abspath(full_path).startswith(os.path.abspath(extracted_path)):
        raise HTTPException(status_code=403, detail="Access denied")

    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="File not found")

    try:
        with open(full_path, "r", encoding="utf-8") as f:
            content = f.read()
        return FileContentResponse(content=content, file_path=file_path)
    except UnicodeDecodeError as exc:
        # Binary file
        raise HTTPException(status_code=400, detail="Cannot read binary file") from exc
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}") from e


@app.get("/api/statistics")
async def get_statistics():
    """
    Get aggregated statistics.

    Returns:
        Statistics including total scans, high risk count, etc.
    """
    stats = db.get_statistics()
    risk_dist = db.get_risk_distribution()

    return {
        "total_scans": stats.get("total_scans", 0),
        "high_risk_extensions": stats.get("high_risk_extensions", 0),
        "total_files_analyzed": stats.get("total_files_analyzed", 0),
        "total_vulnerabilities": stats.get("total_vulnerabilities", 0),
        "avg_security_score": stats.get("avg_security_score", 0),
        "risk_distribution": risk_dist,
    }

@app.post("/api/telemetry/pageview")
async def track_pageview(event: PageViewEvent):
    """
    Privacy-first pageview counter.

    In OSS mode: enabled only when OSS_TELEMETRY_ENABLED=true; stores in SQLite (local metrics only, no outbound).
    In Cloud mode: stores in configured backend (Supabase or SQLite).
    - No IP storage, no user identifier; server computes day in UTC.
    When telemetry is not enabled, returns 200 with no-op so the UI does not break (fail open).
    """
    if not is_oss_telemetry_allowed():
        # Fail open: return success without persisting so frontend does not see 501
        day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        path = (event.path or "/").strip()
        return {"day": day, "path": path if path.startswith("/") else f"/{path}", "count": 0}
    day = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    path = (event.path or "/").strip()
    try:
        count = db.increment_page_view(day=day, path=path)
    except AttributeError:
        # If backend doesn't support telemetry methods, fail open (do not break the UI).
        count = 0
    return {"day": day, "path": path if path.startswith("/") else f"/{path}", "count": count}


@app.post("/api/telemetry/event")
async def track_custom_event(event: CustomTelemetryEvent):
    """
    Log a custom frontend event (e.g. enterprise_custom_extension_cta_click).
    In OSS: enabled only when OSS_TELEMETRY_ENABLED=true; local only (no outbound).
    No PII; fails silently if backend has no storage for events.
    When telemetry is not enabled, returns 200 with no-op so the UI does not break (fail open).
    """
    if not is_oss_telemetry_allowed():
        return {"ok": True}
    name = (event.event or "").strip()
    if name:
        logger.info("Telemetry event: %s", name)
    return {"ok": True}


@app.get("/api/telemetry/summary", dependencies=[require_cloud_dep("telemetry")])
async def telemetry_summary(request: Request, days: int = 14):
    """
    Aggregate telemetry summary (admin-only). Requires X-Admin-Key (ADMIN_API_KEY or TELEMETRY_ADMIN_KEY).
    """
    _require_admin_or_telemetry_key(request)
    try:
        return db.get_page_view_summary(days=days)
    except AttributeError:
        return {"days": days, "start_day": None, "end_day": None, "by_day": {}, "by_path": {}, "rows": []}


@app.get("/api/history", dependencies=[require_cloud_dep("history")])
async def get_history(http_request: Request, limit: int = 50):
    """
    Get scan history.

    Args:
        limit: Maximum number of results to return

    Returns:
        List of scan history items
    """
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if not user_id:
        # When using Supabase (staging or prod), require auth. SQLite fallback allows global history for dev testing.
        if isinstance(db, SupabaseDatabase):
            raise HTTPException(status_code=401, detail="Sign in to view history")
        history = db.get_scan_history(limit=limit)
        return {"history": history, "total": len(history)}

    history = db.get_user_scan_history(user_id=user_id, limit=limit)
    return {"history": history, "total": len(history)}


@app.get("/api/history/private", dependencies=[require_cloud_dep("history")])
async def get_private_history(http_request: Request, limit: int = 50):
    """
    Get user's private scan history (uploaded CRX/ZIP builds only).

    Args:
        limit: Maximum number of results to return

    Returns:
        List of private scan history items (source='upload')
    """
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to view private history")

    history = db.get_user_scan_history(user_id=user_id, limit=limit, private_only=True)
    return {"history": history, "total": len(history)}


@app.get("/api/user/karma", dependencies=[require_cloud_dep("auth")])
async def get_user_karma(http_request: Request):
    """
    Get user's karma points and scan statistics.
    
    Returns:
        User karma points, total scans, and timestamps
    """
    user_id = getattr(getattr(http_request, "state", None), "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign in to view karma")
    
    if not isinstance(db, SupabaseDatabase):
        # SQLite fallback doesn't have karma tracking (Postgres only)
        return {"karma_points": 0, "total_scans": 0, "created_at": None, "updated_at": None}
    
    karma = db.get_user_karma(user_id=user_id)
    return karma


@app.get("/api/recent")
@app.get("/api/recent/")  # Allow trailing slash (proxies/CDNs sometimes add it)
async def get_recent_scans(limit: int = 10, search: str = None):
    """
    Get recent scans with summary info including risk and signals mapping.

    Args:
        limit: Maximum number of results to return
        search: Optional filter by extension name or ID (case-insensitive, Postgres/SQLite)

    Returns:
        List of recent scans with risk_and_signals mapping; db_backend for verification (supabase|sqlite).
    """
    db_backend = "supabase" if isinstance(db, SupabaseDatabase) else "sqlite"
    try:
        logger.info(f"[get_recent_scans] Fetching {limit} recent scans, search={search}")
        recent = db.get_recent_scans(limit=limit, search=search)
        logger.info(f"[get_recent_scans] Retrieved {len(recent)} scans from database")

        if len(recent) == 0:
            logger.warning("[get_recent_scans] No scans found in database - checking if any scans exist with different status")
            # Diagnostic: Check if scans exist but with wrong status
            try:
                if hasattr(db, 'get_connection'):
                    # SQLite path
                    with db.get_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("SELECT COUNT(*) as total, status, COUNT(*) as count FROM scan_results GROUP BY status")
                        status_counts = cursor.fetchall()
                        logger.info(f"[get_recent_scans] Diagnostic - Status counts: {status_counts}")
            except Exception as diag_error:
                logger.warning(f"[get_recent_scans] Diagnostic check failed: {diag_error}")

        # Ensure extension_name is always populated, even for legacy rows
        for scan in recent:
            if not scan.get("extension_name") or scan["extension_name"] == scan.get("extension_id"):
                _meta = scan.get("metadata") or {}
                _manifest = scan.get("manifest") or {}
                _cs = _meta.get("chrome_stats") if isinstance(_meta, dict) else {}
                if not isinstance(_cs, dict):
                    _cs = {}
                _candidates = [
                    _meta.get("title") if isinstance(_meta, dict) else None,
                    _meta.get("name") if isinstance(_meta, dict) else None,
                    _cs.get("name"),
                    _manifest.get("name") if isinstance(_manifest, dict) else None,
                ]
                _resolved = next((n for n in _candidates if n and isinstance(n, str) and n.strip()), None)
                if _resolved:
                    scan["extension_name"] = _resolved.strip()

        # Add risk_and_signals mapping to each scan.
        # If legacy recent rows are missing layer scores, backfill from full scan result dynamically.
        for scan in recent:
            try:
                mapping = _extract_risk_and_signals(scan)
                signals = mapping.get("signals", {})
                missing_layers = any(k not in signals for k in ("security", "privacy", "gov"))

                if missing_layers:
                    extension_id = scan.get("extension_id")
                    if extension_id:
                        try:
                            full_scan = db.get_scan_result(extension_id)
                        except Exception as e:
                            logger.warning(f"[get_recent_scans] Failed to fetch full scan for {extension_id}: {e}")
                            full_scan = None
                        if isinstance(full_scan, dict):
                            backfilled = _extract_risk_and_signals(full_scan)
                            if len(backfilled.get("signals", {})) > len(signals):
                                mapping = backfilled
                            # Expose scoring_v2 on recent rows when available to keep frontend consistent.
                            if isinstance(full_scan.get("scoring_v2"), dict):
                                scan["scoring_v2"] = full_scan.get("scoring_v2")

                scan["risk_and_signals"] = mapping
            except Exception as e:
                logger.error(f"[get_recent_scans] Error processing scan {scan.get('extension_id')}: {e}")
                # Continue processing other scans even if one fails
                scan["risk_and_signals"] = {"risk": 0, "signals": {}}

        logger.info(f"[get_recent_scans] Returning {len(recent)} enriched scans")
        return {"recent": recent, "db_backend": db_backend}
    except Exception as e:
        logger.error(f"[get_recent_scans] Error fetching recent scans: {e}", exc_info=True)
        return {"recent": [], "db_backend": db_backend}


@app.get("/api/diagnostic/scans", dependencies=[require_cloud_dep("telemetry")])
async def diagnostic_scans(request: Request):
    """
    Diagnostic endpoint to check scan data flow.
    Returns information about scans in memory, database, and their status.
    Useful for debugging why scans aren't appearing in the UI.
    """
    _require_admin_key(request)
    try:
        diagnostic_info = {
            "memory_scans": {
                "count": len(scan_results),
                "extension_ids": list(scan_results.keys())[:10],  # First 10
                "statuses": {}
            },
            "database_scans": {
                "total_count": 0,
                "completed_count": 0,
                "failed_count": 0,
                "other_statuses": {},
                "sample_extension_ids": []
            },
            "recent_endpoint_test": {
                "limit_10": 0,
                "limit_25": 0
            },
            "errors": []
        }
        
        # Check memory scans
        for ext_id, status in scan_status.items():
            diagnostic_info["memory_scans"]["statuses"][ext_id] = status
        
        # Check database scans
        try:
            # Get total count and status breakdown
            if hasattr(db, 'get_connection'):
                # SQLite path
                with db.get_connection() as conn:
                    cursor = conn.cursor()
                    # Total count
                    cursor.execute("SELECT COUNT(*) FROM scan_results")
                    diagnostic_info["database_scans"]["total_count"] = cursor.fetchone()[0]
                    
                    # Status breakdown
                    cursor.execute("SELECT status, COUNT(*) as count FROM scan_results GROUP BY status")
                    for row in cursor.fetchall():
                        status_val = row[0] if row[0] else "NULL"
                        count = row[1]
                        if status_val == "completed":
                            diagnostic_info["database_scans"]["completed_count"] = count
                        elif status_val == "failed":
                            diagnostic_info["database_scans"]["failed_count"] = count
                        else:
                            diagnostic_info["database_scans"]["other_statuses"][status_val] = count
                    
                    # Sample extension IDs
                    cursor.execute("SELECT extension_id FROM scan_results WHERE status = 'completed' ORDER BY timestamp DESC LIMIT 5")
                    diagnostic_info["database_scans"]["sample_extension_ids"] = [row[0] for row in cursor.fetchall()]
            else:
                # Supabase path
                try:
                    resp = db.client.table(db.table_scan_results).select("extension_id, status", count="exact").limit(1000).execute()
                    total = getattr(resp, "count", len(resp.data or []))
                    diagnostic_info["database_scans"]["total_count"] = total
                    
                    # Count by status
                    status_counts = {}
                    for row in (resp.data or []):
                        status = row.get("status", "NULL")
                        status_counts[status] = status_counts.get(status, 0) + 1
                    
                    diagnostic_info["database_scans"]["completed_count"] = status_counts.get("completed", 0)
                    diagnostic_info["database_scans"]["failed_count"] = status_counts.get("failed", 0)
                    for status, count in status_counts.items():
                        if status not in ["completed", "failed"]:
                            diagnostic_info["database_scans"]["other_statuses"][status] = count
                    
                    # Sample extension IDs
                    completed_resp = db.client.table(db.table_scan_results).select("extension_id").eq("status", "completed").order("scanned_at", desc=True).limit(5).execute()
                    diagnostic_info["database_scans"]["sample_extension_ids"] = [row.get("extension_id") for row in (completed_resp.data or [])]
                except Exception as supabase_error:
                    diagnostic_info["errors"].append(f"Supabase query error: {str(supabase_error)}")
        except Exception as db_error:
            diagnostic_info["errors"].append(f"Database query error: {str(db_error)}")
        
        # Test recent endpoint
        try:
            recent_10 = db.get_recent_scans(limit=10)
            diagnostic_info["recent_endpoint_test"]["limit_10"] = len(recent_10)
            
            recent_25 = db.get_recent_scans(limit=25)
            diagnostic_info["recent_endpoint_test"]["limit_25"] = len(recent_25)
        except Exception as recent_error:
            diagnostic_info["errors"].append(f"Recent scans query error: {str(recent_error)}")
        
        return diagnostic_info
    except Exception as e:
        logger.error(f"[diagnostic_scans] Error: {e}", exc_info=True)
        return {"error": str(e)}


@app.delete("/api/scan/{extension_id}", dependencies=[require_cloud_dep("telemetry")])
async def delete_scan(extension_id: str, request: Request):
    """
    Delete a scan result.

    Args:
        extension_id: Chrome extension ID

    Returns:
        Deletion confirmation
    """
    _require_admin_key(request)
    success = db.delete_scan_result(extension_id)

    if success:
        # Remove from memory cache
        scan_results.pop(extension_id, None)
        scan_status.pop(extension_id, None)

        return {"message": "Scan deleted successfully", "extension_id": extension_id}

    raise HTTPException(status_code=404, detail="Scan not found")


@app.post("/api/clear", dependencies=[require_cloud_dep("telemetry")])
async def clear_all_scans(request: Request):
    """
    Clear all scan results.

    Returns:
        Confirmation message
    """
    _require_admin_key(request)
    success = db.clear_all_results()

    if success:
        scan_results.clear()
        scan_status.clear()
        return {"message": "All scans cleared successfully"}

    raise HTTPException(status_code=500, detail="Failed to clear scans")


@app.get("/health", include_in_schema=False)
async def health_check():
    """
    Health check endpoint for container orchestration (e.g. Railway).
    Never raises; always returns HTTP 200 so deploys are not blocked by external deps.
    """
    try:
        uptime_seconds = int((datetime.now(timezone.utc) - _health_start_time).total_seconds())
        flags = get_feature_flags()
        return {
            "status": "healthy",
            "version": "1.0.0",
            "uptime_seconds": uptime_seconds,
            "mode": flags.mode,
        }
    except Exception as exc:
        logger.error("Health check internal error: %s", exc)
        return {
            "status": "degraded",
            "version": "1.0.0",
            "uptime_seconds": 0,
            "mode": "unknown",
        }


@app.get("/api/health/sentry-test")
async def sentry_test_endpoint(request: Request):
    """
    Raise an exception to verify Sentry capture. Only enabled in prod (Sentry init is prod-only).
    Requires X-Admin-Key so it is not triggered by accident.
    """
    _require_admin_key(request)
    raise RuntimeError("Sentry test: intentional exception for verification (ignore in prod Sentry)")


@app.get("/api/health/db")
async def database_health_check(request: Request):
    """
    Production-safe database health check endpoint (admin-protected).
    
    Returns backend type, table status, write capability, table counts, function verification,
    and migration completeness checks.
    Useful for verifying Supabase is properly configured in production.
    
    Requires: X-Admin-Key header matching ADMIN_API_KEY
    
    Verifies:
    - Backend type (supabase/sqlite)
    - Required tables exist (scan_results, user_scan_history, page_views_daily)
    - increment_page_view function exists (Supabase only)
    - Table row counts
    - Write capability (tested via safe operations)
    - Migration completeness:
      * statistics table existence + row count
      * scan_results column structure (scanned_at for Supabase, timestamp for SQLite)
      * increment_page_view RPC exists and callable (Supabase only)
    
    Example response:
    {
        "backend": "supabase",
        "tables_ok": true,
        "can_write": true,
        "status": "healthy",
        "tables": {
            "scan_results": {"exists": true, "count": 42},
            "user_scan_history": {"exists": true, "count": 15},
            "page_views_daily": {"exists": true, "count": 128}
        },
        "functions": {
            "increment_page_view": {"exists": true}
        },
        "migrations": {
            "statistics": {"exists": true, "count": 4},
            "scan_results_columns_ok": true,
            "page_views_rpc_ok": true
        },
        "missing_tables": []
    }
    
    Note: Does NOT expose secrets, env values, or sensitive configuration.
    """
    # Require admin key
    _require_admin_key(request)
    
    from extension_shield.api.database import Database, SupabaseDatabase
    
    backend_type = "unknown"
    tables_ok = False
    can_write = False
    missing_tables = []
    tables_info = {}
    functions_info = {}
    error_message = None
    
    try:
        # Determine backend type
        if isinstance(db, SupabaseDatabase):
            backend_type = "supabase"
            
            # Check tables via information_schema query (preferred) or safe probe
            required_tables = ["scan_results", "user_scan_history", "page_views_daily"]
            existing_tables = []
            
            # Try to use information_schema query via RPC if available, otherwise use safe probes
            try:
                # Attempt to query information_schema via raw SQL (if Supabase supports it)
                # Fallback to safe table probes if not available
                for table_name in required_tables:
                    try:
                        # Safe probe: select count limit 1 (doesn't expose data)
                        resp = db.client.table(table_name).select("*", count="exact").limit(1).execute()
                        existing_tables.append(table_name)
                        
                        # Get row count (Supabase returns count in response)
                        count = getattr(resp, "count", None)
                        if count is None:
                            # Fallback: query with count="exact" and limit
                            count_resp = db.client.table(table_name).select("*", count="exact").limit(10000).execute()
                            count = getattr(count_resp, "count", 0)
                        
                        tables_info[table_name] = {
                            "exists": True,
                            "count": count if count is not None else 0
                        }
                    except Exception as e:
                        # Table doesn't exist or can't be accessed
                        missing_tables.append(table_name)
                        tables_info[table_name] = {
                            "exists": False,
                            "count": None
                        }
                        if not error_message:
                            error_message = str(e)[:200]  # Truncate to avoid exposing sensitive info
            except Exception as e:
                # If all table checks fail, set error
                if not error_message:
                    error_message = str(e)[:200]
            
            # Check for increment_page_view function via pg_proc query or safe RPC test
            try:
                # Try to call the function with a harmless test path and today's date
                # This will create a test row that we can optionally clean up
                today = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
                test_path = "/__healthcheck"
                
                # Call RPC to test function existence and write capability
                test_resp = db.client.rpc("increment_page_view", {
                    "p_day": today,
                    "p_path": test_path
                }).execute()
                
                # If RPC succeeds, function exists and we can write
                functions_info["increment_page_view"] = {"exists": True}
                can_write = True
                
                # Optional: Clean up test row (delete the healthcheck entry)
                try:
                    db.client.table("page_views_daily").delete().eq("day", today).eq("path", test_path).execute()
                except Exception:
                    # If cleanup fails, that's okay - the test row is harmless
                    pass
                    
            except Exception as e:
                # Function doesn't exist or can't be called
                functions_info["increment_page_view"] = {"exists": False}
                can_write = False
                if not error_message:
                    error_message = f"increment_page_view check failed: {str(e)[:100]}"
            
            # Tables are OK if at least scan_results exists (required)
            # user_scan_history is required for auth features
            # page_views_daily is optional but recommended
            if "scan_results" in existing_tables:
                tables_ok = True
                # can_write is set by function test above
            else:
                tables_ok = False
                if not error_message:
                    error_message = "Required table scan_results is missing"
                
        elif isinstance(db, Database):
            backend_type = "sqlite"
            
            # For SQLite, check if tables exist via sqlite_master
            try:
                with db.get_connection() as conn:
                    cursor = conn.cursor()
                    
                    # Check required tables
                    required_tables = ["scan_results", "user_scan_history", "page_views_daily"]
                    for table_name in required_tables:
                        cursor.execute(
                            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                            (table_name,)
                        )
                        exists = cursor.fetchone() is not None
                        
                        # Get count if table exists
                        count = None
                        if exists:
                            try:
                                cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                                count = cursor.fetchone()[0]
                            except Exception:
                                count = None
                        
                        tables_info[table_name] = {
                            "exists": exists,
                            "count": count
                        }
                        if not exists:
                            missing_tables.append(table_name)
                    
                    tables_ok = "scan_results" in [t for t, info in tables_info.items() if info["exists"]]
                    
                    # Test write capability by incrementing page view for healthcheck
                    if tables_ok:
                        try:
                            today = datetime.now(timezone.utc).date().strftime("%Y-%m-%d")
                            test_path = "/__healthcheck"
                            # This will create or increment a test row
                            db.increment_page_view(today, test_path)
                            can_write = True
                            # Optional: Clean up test row
                            try:
                                with db.get_connection() as cleanup_conn:
                                    cleanup_cursor = cleanup_conn.cursor()
                                    cleanup_cursor.execute(
                                        "DELETE FROM page_views_daily WHERE day = ? AND path = ?",
                                        (today, test_path)
                                    )
                            except Exception:
                                pass  # Cleanup failure is okay
                        except Exception as e:
                            can_write = False
                            if not error_message:
                                error_message = f"Write test failed: {str(e)[:100]}"
                    else:
                        can_write = False
            except Exception as e:
                tables_ok = False
                can_write = False
                error_message = str(e)[:200]
        else:
            backend_type = "unknown"
                
    except Exception as e:
        # If we can't determine backend, return defaults
        backend_type = "error"
        error_message = str(e)[:200]  # Truncate to avoid exposing sensitive info
    
    # Migration verification
    migrations_info = {}
    
    try:
        if isinstance(db, SupabaseDatabase):
            # Check statistics table (migration 004)
            statistics_exists = False
            statistics_count = None
            try:
                stats_resp = db.client.table("statistics").select("*", count="exact").limit(1).execute()
                statistics_exists = True
                statistics_count = getattr(stats_resp, "count", None)
            except Exception:
                statistics_exists = False
            
            migrations_info["statistics"] = {
                "exists": statistics_exists,
                "count": statistics_count if statistics_count is not None else None
            }
            
            # Verify scan_results columns (especially scanned_at)
            scan_results_columns_ok = False
            # Check if scan_results table exists (from tables_info)
            if tables_info.get("scan_results", {}).get("exists", False):
                try:
                    # Try to query scanned_at column (should exist after migration 001b)
                    test_resp = db.client.table(db.table_scan_results).select("scanned_at").limit(1).execute()
                    scan_results_columns_ok = True
                except Exception:
                    # Column might not exist or table structure is wrong
                    scan_results_columns_ok = False
            else:
                scan_results_columns_ok = False
            
            migrations_info["scan_results_columns_ok"] = scan_results_columns_ok
            
            # Verify RPC increment_page_view exists AND callable
            page_views_rpc_ok = functions_info.get("increment_page_view", {}).get("exists", False)
            migrations_info["page_views_rpc_ok"] = page_views_rpc_ok
            
        elif isinstance(db, Database):
            # For SQLite, check statistics table
            statistics_exists = False
            statistics_count = None
            try:
                with db.get_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name='statistics'"
                    )
                    statistics_exists = cursor.fetchone() is not None
                    
                    if statistics_exists:
                        cursor.execute("SELECT COUNT(*) FROM statistics")
                        statistics_count = cursor.fetchone()[0]
            except Exception:
                statistics_exists = False
            
            migrations_info["statistics"] = {
                "exists": statistics_exists,
                "count": statistics_count
            }
            
            # Verify scan_results columns (timestamp in SQLite, not scanned_at)
            scan_results_columns_ok = False
            if tables_info.get("scan_results", {}).get("exists", False):
                try:
                    with db.get_connection() as conn:
                        cursor = conn.cursor()
                        # Check if timestamp column exists (SQLite uses timestamp, not scanned_at)
                        cursor.execute("PRAGMA table_info(scan_results)")
                        columns = [row[1] for row in cursor.fetchall()]
                        scan_results_columns_ok = "timestamp" in columns
                except Exception:
                    scan_results_columns_ok = False
            else:
                scan_results_columns_ok = False
            
            migrations_info["scan_results_columns_ok"] = scan_results_columns_ok
            
            # SQLite doesn't use RPC functions
            migrations_info["page_views_rpc_ok"] = None
    except Exception as e:
        # If migration checks fail, mark as unknown
        if not error_message:
            error_message = f"Migration check failed: {str(e)[:100]}"
    
    response = {
        "backend": backend_type,
        "tables_ok": tables_ok,
        "can_write": can_write,
        "status": "healthy" if (tables_ok and can_write) else "degraded",
        "tables": tables_info,
        "migrations": migrations_info,
    }
    
    # Add functions info for Supabase
    if backend_type == "supabase" and functions_info:
        response["functions"] = functions_info
    
    # Add diagnostic info if degraded
    if not tables_ok or missing_tables:
        response["missing_tables"] = missing_tables
        if error_message:
            # Only include first line of error to avoid exposing sensitive info
            response["error"] = error_message.split("\n")[0][:200]
    
    return response


@app.get("/api/scan/icon/{extension_id}")
async def get_extension_icon(extension_id: str):
    """
    Get extension icon from the extracted extension folder.
    Uses icon_path from storage when available, and falls back to persisted icon bytes.
    
    Args:
        extension_id: Chrome extension ID
        
    Returns:
        Icon image response (PNG/JPEG/WEBP/SVG)
    """
    logger.debug(f"[ICON] Request for extension_id={extension_id}")
    # Check if scan is completed first
    results = scan_results.get(extension_id)
    extracted_path = None
    icon_path = None
    icon_base64 = None
    icon_media_type = None
    
    if results:
        extracted_path = results.get("extracted_path")
        icon_path = results.get("icon_path")  # Use stored icon_path from database
        icon_base64 = results.get("icon_base64")
        icon_media_type = results.get("icon_media_type")
    else:
        db_icon_record = _load_icon_record_from_db(extension_id)
        extracted_path = db_icon_record.get("extracted_path")
        icon_path = db_icon_record.get("icon_path")
        icon_base64 = db_icon_record.get("icon_base64")
        icon_media_type = db_icon_record.get("icon_media_type")
        if icon_path:
            logger.debug("Loaded icon_path from database: %s", icon_path)
        
        # Scan might still be running - try to find extracted extension in storage
        # Check if extension is being scanned
        status = scan_status.get(extension_id)
        if status in ("running", "pending"):
            # Try to find the extracted extension in the storage directory
            # Extensions are stored as extracted_{filename}_{pid}, so we need to search
            settings = get_settings()
            storage_path = Path(settings.extension_storage_path)
            
            # Search for extracted directories that might contain this extension
            if storage_path.exists():
                try:
                    # Look for directories starting with "extracted_"
                    for item in storage_path.iterdir():
                        if item.is_dir() and item.name.startswith("extracted_"):
                            manifest_path = item / "manifest.json"
                            if manifest_path.exists():
                                # Check if manifest has matching extension_id
                                try:
                                    with open(manifest_path, "r", encoding="utf-8") as f:
                                        manifest = json.load(f)
                                        # Check manifest key (MV2) or extension_id from metadata
                                        manifest_id = manifest.get("key") or manifest.get("extension_id")
                                        # Also check if extension_id matches (for MV3)
                                        if manifest_id == extension_id or extension_id in str(manifest):
                                            extracted_path = str(item)
                                            logger.debug(f"Found extracted extension during scan at: {extracted_path}")
                                            break
                                except Exception:
                                    # Skip if we can't read manifest
                                    continue
                except Exception as e:
                    logger.debug(f"Error searching for extracted extension: {e}")

    # Best practice: if we have a persisted icon blob, serve it immediately.
    # This avoids relying on filesystem state (ephemeral/persistent) and prevents slow fallbacks.
    persisted = _extension_icon_response_from_base64(icon_base64, icon_media_type)
    if persisted:
        return persisted
    
    if not extracted_path:
        # Search for extracted extension directory by extension_id in storage
        settings = get_settings()
        storage_path = Path(settings.extension_storage_path)
        
        if storage_path.exists():
            # Look for directories containing the extension_id
            for item in storage_path.iterdir():
                if item.is_dir() and extension_id in item.name and item.name.startswith("extracted_"):
                    extracted_path = str(item)
                    logger.debug(f"[ICON] Found extracted extension by ID: {extracted_path}")
                    break
    
    db_icon_checked = bool(icon_base64)

    def _persisted_icon_response() -> Optional[Response]:
        nonlocal icon_base64, icon_media_type, db_icon_checked
        response = _extension_icon_response_from_base64(icon_base64, icon_media_type)
        if response:
            return response
        if not db_icon_checked:
            db_icon_checked = True
            db_icon_record = _load_icon_record_from_db(extension_id)
            icon_base64 = db_icon_record.get("icon_base64")
            icon_media_type = db_icon_record.get("icon_media_type")
            return _extension_icon_response_from_base64(icon_base64, icon_media_type)
        return None

    if not extracted_path:
        persisted_response = _persisted_icon_response()
        if persisted_response:
            logger.debug("[ICON] Served persisted icon blob for %s", extension_id)
            return persisted_response
        # Return placeholder - expected during early scan stages or when storage is ephemeral (Railway)
        logger.debug(f"[ICON] No extracted_path for {extension_id}, returning placeholder")
        return _extension_icon_placeholder_response()
    
    # Convert to absolute path if it's relative
    # extracted_path is relative to extension_storage_path, not RESULTS_DIR
    if not os.path.isabs(extracted_path):
        settings = get_settings()
        storage_path = Path(settings.extension_storage_path)
        # If extracted_path is just a directory name, join with storage_path
        if os.path.basename(extracted_path) == extracted_path:
            extracted_path = os.path.join(str(storage_path), extracted_path)
        else:
            # Already has path components, resolve relative to storage_path
            extracted_path = os.path.join(str(storage_path), extracted_path)
    
    # Verify the path exists
    if not os.path.exists(extracted_path):
        logger.warning(f"Extracted path does not exist: {extracted_path}")
        # Try alternative: search in storage_path for matching directory
        settings = get_settings()
        storage_path = Path(settings.extension_storage_path)
        if storage_path.exists():
            # Look for directory matching the basename
            basename = os.path.basename(extracted_path)
            for item in storage_path.iterdir():
                if item.is_dir() and (item.name == basename or item.name.startswith(basename)):
                    extracted_path = str(item)
                    logger.debug(f"Found extracted extension at: {extracted_path}")
                    break
            else:
                persisted_response = _persisted_icon_response()
                if persisted_response:
                    logger.debug("[ICON] Served persisted icon blob for %s", extension_id)
                    return persisted_response
                logger.debug(f"[ICON] Extracted path not found for {extension_id}, returning placeholder")
                return _extension_icon_placeholder_response()
        else:
            persisted_response = _persisted_icon_response()
            if persisted_response:
                logger.debug("[ICON] Served persisted icon blob for %s", extension_id)
                return persisted_response
            logger.debug(f"[ICON] Storage path missing for {extension_id}, returning placeholder")
            return _extension_icon_placeholder_response()
    
    logger.debug(f"[ICON] extracted_path={extracted_path}, icon_path={icon_path}")
    
    # First, try using icon_path from database if available
    if icon_path:
        full_icon_path = os.path.join(extracted_path, icon_path)
        # Security check: ensure icon_path is within extracted_path
        abs_icon_path = os.path.abspath(full_icon_path)
        abs_extracted_path = os.path.abspath(extracted_path)
        
        logger.debug(f"[ICON] Trying stored icon_path: {full_icon_path}")
        if abs_icon_path.startswith(abs_extracted_path) and os.path.exists(full_icon_path):
            logger.info(f"[ICON] Found icon using stored icon_path: {full_icon_path}")
            return _extension_icon_file_response(full_icon_path)
        else:
            logger.warning(f"[ICON] Stored icon_path {icon_path} not found at {full_icon_path}, falling back to search")
    
    # Fallback: Try common icon sizes in order of preference
    icon_sizes = ["128", "64", "48", "32", "16", "96", "256"]
    icons_dir = os.path.join(extracted_path, "icons")
    
    # First try icons directory
    if os.path.exists(icons_dir):
        for size in icon_sizes:
            icon_path = os.path.join(icons_dir, f"{size}.png")
            if os.path.exists(icon_path):
                logger.debug(f"Found icon at: {icon_path}")
                return _extension_icon_file_response(icon_path)
    
    # Try root directory
    for size in icon_sizes:
        test_icon_path = os.path.join(extracted_path, f"icon{size}.png")
        if os.path.exists(test_icon_path):
            logger.debug(f"Found icon at: {test_icon_path}")
            return _extension_icon_file_response(test_icon_path)
        
        test_icon_path = os.path.join(extracted_path, f"{size}.png")
        if os.path.exists(test_icon_path):
            logger.debug(f"Found icon at: {test_icon_path}")
            return _extension_icon_file_response(test_icon_path)
    
    # Try images directory (common for many extensions)
    images_dir = os.path.join(extracted_path, "images")
    if os.path.exists(images_dir):
        # Look for icon files in images directory
        for icon_name in ["icon128.png", "icon.png", "icon64.png", "icon48.png", "icon32.png", "icon16.png", "logo.png"]:
            icon_path = os.path.join(images_dir, icon_name)
            if os.path.exists(icon_path):
                logger.debug(f"Found icon in images dir: {icon_path}")
                return _extension_icon_file_response(icon_path)
    
    # Try checking manifest for icon paths
    manifest_path = os.path.join(extracted_path, "manifest.json")
    if os.path.exists(manifest_path):
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = json.load(f)
                
            # Check icons object in manifest
            manifest_icons = manifest.get("icons", {})
            if manifest_icons:
                # Get the largest icon
                largest_size = max(manifest_icons.keys(), key=lambda x: int(x))
                icon_rel_path = manifest_icons[largest_size]
                manifest_icon_path = os.path.join(extracted_path, icon_rel_path)
                
                # Security check
                abs_icon_path = os.path.abspath(manifest_icon_path)
                abs_extracted_path = os.path.abspath(extracted_path)
                
                if abs_icon_path.startswith(abs_extracted_path):
                    if os.path.exists(manifest_icon_path):
                        logger.debug(f"Found icon from manifest at: {manifest_icon_path}")
                        return _extension_icon_file_response(manifest_icon_path)
        except Exception as e:
            logger.warning(f"Failed to read manifest for icons: {e}")
    
    persisted_response = _persisted_icon_response()
    if persisted_response:
        logger.debug("[ICON] Served persisted icon blob for %s", extension_id)
        return persisted_response

    # No icon file found (path exists but no icon, or path from DB is gone - ephemeral storage)
    logger.debug(f"[ICON] No icon file for {extension_id}, returning placeholder")
    return _extension_icon_placeholder_response()


# Mount static files for React frontend assets (if static directory exists)
if STATIC_DIR.exists() and (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")
    # Mount root static files (vite.svg, etc.)
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Mount data files - check production first, then fallback to development
# This allows data files to be served both in production (from static/) and local dev (from frontend/public/)
data_dir = None
if STATIC_DIR.exists():
    prod_data_dir = STATIC_DIR / "data"
    if prod_data_dir.exists():
        data_dir = prod_data_dir

# Fallback to development directory if production static dir doesn't exist
if not data_dir and FRONTEND_PUBLIC_DIR.exists():
    dev_data_dir = FRONTEND_PUBLIC_DIR / "data"
    if dev_data_dir.exists():
        data_dir = dev_data_dir

if data_dir:
    app.mount("/data", StaticFiles(directory=data_dir), name="data")


# --- Known-route manifest: lets the SPA catch-all return a REAL 404 for unknown
# URLs (e.g. /Principal) instead of a soft-404 (200 + homepage shell). Generated
# at build time by frontend/scripts/generate-sitemap.js -> routes-manifest.json.
def _load_routes_manifest():
    """Return (static_set, [compiled_dynamic_regexes]).

    Falls back to (None, None) when the manifest is missing/unreadable, in which
    case serve_spa preserves its previous always-200 behaviour (fail-safe).
    """
    import re as _re

    try:
        manifest_file = STATIC_DIR / "routes-manifest.json"
        if not manifest_file.is_file():
            return None, None
        data = json.loads(manifest_file.read_text(encoding="utf-8"))
        static_set = set(data.get("static", []))
        dynamic = [_re.compile(p) for p in data.get("dynamic", [])]
        return static_set, dynamic
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("Could not load routes-manifest.json: %s", exc)
        return None, None


_KNOWN_STATIC, _KNOWN_DYNAMIC = _load_routes_manifest()


def _is_known_route(full_path: str) -> bool:
    """True if the path is a real SPA route (serve 200) vs unknown (serve 404)."""
    if _KNOWN_STATIC is None:
        return True  # manifest unavailable -> never 404 (previous behaviour)
    if full_path in ("", "/"):
        return True
    normalized = "/" + full_path.strip("/")
    if normalized in _KNOWN_STATIC:
        return True
    return any(rx.match(normalized) for rx in _KNOWN_DYNAMIC)


# Catch-all route for SPA - must be defined last
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    """
    Serve React SPA for all non-API routes.
    This enables client-side routing in the React app.
    """
    # Don't intercept API routes
    if full_path.startswith("api/"):
        raise HTTPException(status_code=404, detail="API endpoint not found")
    
    # Don't intercept data files (should be handled by static mount above)
    if full_path.startswith("data/"):
        raise HTTPException(status_code=404, detail="Data file not found")
    
    # Don't intercept assets (should be handled by static mount above)
    if full_path.startswith("assets/"):
        raise HTTPException(status_code=404, detail="Asset not found")
    
    # Don't intercept static files (should be handled by static mount above)
    if full_path.startswith("static/"):
        raise HTTPException(status_code=404, detail="Static file not found")

    # Check if this is a static file request (favicon, logo, manifest, etc.)
    # These files are in the root of STATIC_DIR (copied from public/ during build)
    if STATIC_DIR.exists():
        static_file = STATIC_DIR / full_path
        # Only serve actual files, not directories, and only common static file types
        if static_file.is_file() and full_path not in ("", "/"):
            # Check if it's a known static file type
            static_extensions = (".png", ".jpg", ".jpeg", ".svg", ".ico", ".json", ".txt", ".xml", ".webmanifest")
            if static_file.suffix.lower() in static_extensions or full_path in ("manifest.json", "robots.txt", "sitemap.xml"):
                return FileResponse(static_file)

    # Serve a prerendered nested snapshot if one exists (dist/<route>/index.html).
    # These carry per-page title/canonical/OG/JSON-LD baked into the raw HTML.
    if STATIC_DIR.exists() and full_path not in ("", "/"):
        nested_index = STATIC_DIR / full_path / "index.html"
        try:
            within = os.path.realpath(nested_index).startswith(os.path.realpath(STATIC_DIR))
        except Exception:
            within = False
        if within and nested_index.is_file():
            return FileResponse(nested_index)

    # Serve index.html for all other routes (SPA routing).
    index_file = STATIC_DIR / "index.html"
    if STATIC_DIR.exists() and index_file.exists():
        if _is_known_route(full_path):
            return FileResponse(index_file)
        # Unknown URL -> real HTTP 404 (the SPA still renders its NotFoundPage),
        # plus an explicit noindex header so crawlers drop it. Kills the soft-404.
        return FileResponse(index_file, status_code=404, headers={"X-Robots-Tag": "noindex"})

    # If no static files, return helpful HTML (development mode)
    return HTMLResponse(_no_frontend_html())


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8007)
