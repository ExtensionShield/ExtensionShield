"""
Shared API State & Request/Response Models

In-memory caches, Pydantic request/response models, and utility helpers
shared across route modules.  Kept in its own module to avoid circular
imports between ``main.py`` and route routers.
"""

from typing import Any, Dict, Optional
from pydantic import BaseModel


# ── In-memory state (process-local, not persisted) ──────────────────────

scan_results: Dict[str, Dict[str, Any]] = {}
"""extension_id → full scan payload (in-flight + recently completed)."""

scan_status: Dict[str, str] = {}
"""extension_id → scan lifecycle status string."""

scan_user_ids: Dict[str, Optional[str]] = {}
"""extension_id → authenticated user_id (Supabase ``sub``) at trigger time."""

scan_source: Dict[str, Optional[str]] = {}
"""extension_id → 'upload' for private builds; None/webstore for public."""


# ── Pydantic request / response models ──────────────────────────────────

class ScanRequest(BaseModel):
    """Request model for triggering a scan."""
    url: str
    # Temporary force-rescan: bypass the cached-result fast path so a scan is
    # recomputed even if the store version is unchanged. Gated server-side
    # (dev mode or a matching admin token); ignored otherwise.
    force: Optional[bool] = False
    # Set by the Scan History page when auto-refreshing a row whose scan is
    # missing/failed. Honored only for authenticated users, and only for an
    # extension already in that user's history, in which case the rescan is a
    # system refresh (quota-exempt) rather than a brand-new user scan.
    history_refresh: Optional[bool] = False


class ScanStatusResponse(BaseModel):
    """Response model for scan status."""
    scanned: bool
    status: Optional[str] = None
    extension_id: Optional[str] = None
    error: Optional[str] = None
    error_code: Optional[int] = None


class FileContentResponse(BaseModel):
    """Response model for file content."""
    content: str
    file_path: str


class FileListResponse(BaseModel):
    """Response model for file list."""
    files: list[str]


class PageViewEvent(BaseModel):
    """Request model for privacy-first pageview telemetry (no PII)."""
    path: str


class CustomTelemetryEvent(BaseModel):
    """Request model for custom frontend events (e.g. CTA clicks). No PII."""
    event: str


class BatchResultsRequest(BaseModel):
    """Request model for batch results lookup (Chrome extension popup)."""
    extension_ids: list[str]


class BatchStatusRequest(BaseModel):
    """Request model for batch status lookup (Chrome extension popup)."""
    extension_ids: list[str]
