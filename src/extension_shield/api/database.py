"""
Database Module for ExtensionShield

Handles persistent storage of scan results, statistics, and history.
- Postgres (Supabase): Primary for staging/production.
- SQLite: Dev fallback when Supabase is not configured.
"""

import os
import re
import sqlite3
import json
import uuid
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional, Dict, Any, List
from contextlib import contextmanager

from extension_shield.core.config import get_settings
from extension_shield.utils.json_encoder import safe_json_dumps

logger = logging.getLogger(__name__)


def _generate_slug(name: str) -> str:
    """Generate a URL-friendly slug from extension name. Must match frontend slug.js."""
    if not name:
        return ""
    slug = name.lower()
    slug = re.sub(r"[-–—_/\\|]+", "-", slug)
    slug = re.sub(r"[^a-z0-9\s-]", "", slug)
    slug = re.sub(r"\s+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    slug = slug.strip("-")
    return slug


def _is_extension_id(s: str) -> bool:
    """Check if string is a Chrome extension ID (32 lowercase letters a-p)."""
    return bool(s and len(s) == 32 and all(c in "abcdefghijklmnop" for c in s))


def _relevance_rank(extension_name: str, extension_id: str, search_term: str) -> int:
    """Return a numeric rank for search relevance (lower = better). Used for Supabase in-memory sort."""
    if not search_term or not (extension_name or extension_id):
        return 4
    term = search_term.strip().lower()
    name = (extension_name or "").strip().lower()
    eid = (extension_id or "").lower()
    if name == term:
        return 0  # Exact title match
    if name.startswith(term):
        return 1  # Title starts with search
    if term in name:
        return 2  # Title contains (e.g. "block" in "Paypal ad blocker")
    if term in eid:
        return 3  # ID contains
    return 4


def _escape_postgrest_like_term(term: str) -> str:
    """Escape wildcard characters before interpolating into a PostgREST ilike filter."""
    return re.sub(r"([%_\\])", r"\\\1", term)


class Database:
    """SQLite database manager (dev fallback when Postgres/Supabase is not used)."""

    def __init__(self, db_path: str = None):
        """Initialize database connection.

        Args:
            db_path: Path to SQLite database file. If None, uses DATABASE_PATH
                     environment variable or defaults to 'project-atlas.db'.
                     Used only when DB_BACKEND=sqlite (dev fallback).
        """
        if db_path is None:
            db_path = get_settings().database_path
        self.db_path = Path(db_path)
        # Ensure parent directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.init_database()

    @contextmanager
    def get_connection(self):
        """Context manager for database connections."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def init_database(self):
        """Initialize database schema."""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Local metrics (OSS: pageview/event when OSS_TELEMETRY_ENABLED; Cloud: same table)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS page_views_daily (
                    day TEXT NOT NULL,
                    path TEXT NOT NULL,
                    count INTEGER NOT NULL DEFAULT 0,
                    PRIMARY KEY (day, path)
                )
            """
            )

            # User-scoped scan history (references global scan_results by extension_id)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS user_scan_history (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    extension_id TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """
            )
            # Migration: add last_viewed_at for bumping re-scanned extensions to top
            try:
                cursor.execute("ALTER TABLE user_scan_history ADD COLUMN last_viewed_at TEXT")
            except sqlite3.OperationalError:
                pass  # column already exists

            # Scan results table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS scan_results (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    extension_id TEXT UNIQUE NOT NULL,
                    extension_name TEXT,
                    url TEXT,
                    timestamp TEXT NOT NULL,
                    status TEXT NOT NULL,
                    security_score INTEGER,
                    risk_level TEXT,
                    total_findings INTEGER DEFAULT 0,
                    total_files INTEGER DEFAULT 0,
                    high_risk_count INTEGER DEFAULT 0,
                    medium_risk_count INTEGER DEFAULT 0,
                    low_risk_count INTEGER DEFAULT 0,
                    metadata TEXT,
                    manifest TEXT,
                    permissions_analysis TEXT,
                    sast_results TEXT,
                    webstore_analysis TEXT,
                    summary TEXT,
                    extracted_path TEXT,
                    extracted_files TEXT,
                    icon_path TEXT,
                    icon_base64 TEXT,
                    icon_media_type TEXT,
                    error TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """
            )
            
            # Add icon_path column if it doesn't exist (for existing databases)
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN icon_path TEXT")
            except Exception:
                # Column already exists, ignore
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN icon_base64 TEXT")
            except Exception:
                # Column already exists, ignore
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN icon_media_type TEXT")
            except Exception:
                # Column already exists, ignore
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN slug TEXT")
            except Exception:
                pass
            try:
                cursor.execute("CREATE INDEX IF NOT EXISTS idx_scan_results_slug ON scan_results(slug)")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN user_id TEXT")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN visibility TEXT DEFAULT 'public'")
            except Exception:
                pass
            try:
                cursor.execute("ALTER TABLE scan_results ADD COLUMN source TEXT DEFAULT 'webstore'")
            except Exception:
                pass

            # Statistics table for aggregated metrics
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS statistics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT UNIQUE NOT NULL,
                    metric_value INTEGER DEFAULT 0,
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """
            )

            # Initialize default statistics
            cursor.execute(
                """
                INSERT OR IGNORE INTO statistics (metric_name, metric_value)
                VALUES 
                    ('total_scans', 0),
                    ('high_risk_extensions', 0),
                    ('total_files_analyzed', 0),
                    ('total_vulnerabilities', 0)
            """
            )

            # Create indexes for better query performance
            # Note: idx_extension_id omitted - extension_id UNIQUE already creates sqlite_autoindex
            # Migration: drop redundant idx_extension_id if it exists (duplicate of UNIQUE's autoindex)
            try:
                cursor.execute("DROP INDEX IF EXISTS idx_extension_id")
            except Exception:
                pass
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_timestamp 
                ON scan_results(timestamp DESC)
            """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_risk_level 
                ON scan_results(risk_level)
            """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_page_views_day
                ON page_views_daily(day)
            """
            )

            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_user_scan_history_user_created
                ON user_scan_history(user_id, created_at DESC)
            """
            )

            # Scan result feedback (per-scan user feedback)
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS scan_feedback (
                    id TEXT PRIMARY KEY,
                    scan_id TEXT NOT NULL,
                    helpful INTEGER NOT NULL,
                    reason TEXT,
                    suggested_score INTEGER,
                    comment TEXT,
                    user_id TEXT,
                    model_version TEXT,
                    ruleset_version TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_scan_feedback_scan_id
                ON scan_feedback(scan_id)
            """
            )
            cursor.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_scan_feedback_created_at
                ON scan_feedback(created_at DESC)
            """
            )

    def save_scan_result(self, result: Dict[str, Any]) -> bool:
        """Save or update scan result."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Extract metadata
                extension_id = result.get("extension_id")
                metadata = result.get("metadata", {}) or {}
                manifest = result.get("manifest", {}) or {}
                chrome_stats = metadata.get("chrome_stats") or {}
                # Get extension_name from top-level first, then try metadata/manifest fields
                _name_candidates = [
                    result.get("extension_name"),
                    metadata.get("title"),
                    metadata.get("name"),
                    chrome_stats.get("name") if isinstance(chrome_stats, dict) else None,
                    manifest.get("name"),
                ]
                extension_name = next(
                    (n for n in _name_candidates if n and isinstance(n, str) and n.strip() and n.strip() != "Unknown"),
                    extension_id,
                )

                # Calculate risk distribution
                risk_dist = result.get("risk_distribution", {})

                # Enhance summary with modern fields for signals and risk calculation
                summary_data = result.get("summary", {}) or {}
                if not isinstance(summary_data, dict):
                    summary_data = {}
                
                # Store modern fields in summary JSON for backward compatibility
                # These fields are needed for frontend signal calculation
                if result.get("scoring_v2"):
                    summary_data["scoring_v2"] = result.get("scoring_v2")
                if result.get("report_view_model"):
                    summary_data["report_view_model"] = result.get("report_view_model")
                if result.get("governance_bundle"):
                    summary_data["governance_bundle"] = result.get("governance_bundle")
                if result.get("virustotal_analysis"):
                    summary_data["virustotal_analysis"] = result.get("virustotal_analysis")

                slug = _generate_slug(extension_name) if extension_name else ""

                cursor.execute(
                    """
                    INSERT OR REPLACE INTO scan_results (
                        extension_id, extension_name, slug, url, timestamp, status,
                        security_score, risk_level, total_findings, total_files,
                        high_risk_count, medium_risk_count, low_risk_count,
                        metadata, manifest, permissions_analysis, sast_results,
                        webstore_analysis, summary, extracted_path, extracted_files,
                        icon_path, icon_base64, icon_media_type, error, updated_at,
                        user_id, visibility, source
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        extension_id,
                        extension_name,
                        slug,
                        result.get("url"),
                        result.get("timestamp"),
                        result.get("status"),
                        result.get("overall_security_score"),
                        result.get("overall_risk"),
                        result.get("total_findings", 0),
                        len(result.get("extracted_files") or []),
                        risk_dist.get("high", 0),
                        risk_dist.get("medium", 0),
                        risk_dist.get("low", 0),
                        safe_json_dumps(result.get("metadata", {})),
                        safe_json_dumps(result.get("manifest", {})),
                        safe_json_dumps(result.get("permissions_analysis", {})),
                        safe_json_dumps(result.get("sast_results", {})),
                        safe_json_dumps(result.get("webstore_analysis", {})),
                        safe_json_dumps(summary_data),
                        result.get("extracted_path"),
                        safe_json_dumps(result.get("extracted_files", [])),
                        result.get("icon_path"),  # Relative path to icon (e.g., "icons/128.png")
                        result.get("icon_base64"),  # Persisted icon bytes for prod fallback
                        result.get("icon_media_type"),
                        result.get("error"),
                        datetime.now().isoformat(),
                        result.get("user_id"),
                        result.get("visibility", "public"),
                        result.get("source", "webstore"),
                    ),
                )

                # Update statistics
                self._update_statistics()

                logger.info(f"[save_scan_result SQLite] Saved scan for extension_id={extension_id}")
                return True
        except Exception as e:
            import traceback
            logger.error(f"[save_scan_result SQLite] ERROR for extension_id={result.get('extension_id')}: {e}\n{traceback.format_exc()}")
            return False

    def increment_page_view(self, day: str, path: str) -> int:
        """
        Increment a page view count for a given UTC day + path.

        Args:
            day: YYYY-MM-DD (UTC)
            path: Route path (e.g., /research)

        Returns:
            Updated count
        """
        path = (path or "/").strip()
        if not path.startswith("/"):
            path = "/" + path

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO page_views_daily (day, path, count)
                VALUES (?, ?, 1)
                ON CONFLICT(day, path) DO UPDATE SET count = count + 1
            """,
                (day, path),
            )
            cursor.execute(
                "SELECT count FROM page_views_daily WHERE day = ? AND path = ?",
                (day, path),
            )
            row = cursor.fetchone()
            return int(row["count"]) if row else 0

    def get_page_view_summary(self, days: int = 14) -> Dict[str, Any]:
        """
        Return aggregate telemetry counts for the last N UTC days.

        Returns:
            {
              "days": int,
              "start_day": "YYYY-MM-DD",
              "end_day": "YYYY-MM-DD",
              "by_day": { "YYYY-MM-DD": int },
              "by_path": { "/research": int },
              "rows": [{ "day": "...", "path": "...", "count": 123 }]
            }
        """
        days = int(days or 14)
        days = max(1, min(days, 365))

        now_utc = datetime.now(timezone.utc).date()
        start_date = now_utc - timedelta(days=days - 1)
        start_day = start_date.strftime("%Y-%m-%d")
        end_day = now_utc.strftime("%Y-%m-%d")

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT day, path, count
                FROM page_views_daily
                WHERE day >= ?
                ORDER BY day ASC, path ASC
            """,
                (start_day,),
            )
            rows = [dict(r) for r in cursor.fetchall()]

        by_day: Dict[str, int] = {}
        by_path: Dict[str, int] = {}
        for r in rows:
            d = r.get("day")
            p = r.get("path")
            c = int(r.get("count") or 0)
            if d:
                by_day[d] = by_day.get(d, 0) + c
            if p:
                by_path[p] = by_path.get(p, 0) + c

        return {
            "days": days,
            "start_day": start_day,
            "end_day": end_day,
            "by_day": by_day,
            "by_path": by_path,
            "rows": rows,
        }

    def add_user_scan_history(self, user_id: str, extension_id: str) -> bool:
        """
        Insert or update a user-scoped scan history entry. Re-scans bump the extension to top.
        """
        try:
            now = datetime.now(timezone.utc).isoformat()
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT id FROM user_scan_history
                    WHERE user_id = ? AND extension_id = ?
                    LIMIT 1
                """,
                    (user_id, extension_id),
                )
                existing = cursor.fetchone()
                if existing:
                    cursor.execute(
                        """
                        UPDATE user_scan_history SET last_viewed_at = ?
                        WHERE user_id = ? AND extension_id = ?
                    """,
                        (now, user_id, extension_id),
                    )
                    return True
                row_id = str(uuid.uuid4())
                cursor.execute(
                    """
                    INSERT INTO user_scan_history (id, user_id, extension_id, created_at, last_viewed_at)
                    VALUES (?, ?, ?, ?, ?)
                """,
                    (row_id, user_id, extension_id, now, now),
                )
            return True
        except Exception as e:
            print(f"Error adding user scan history: {e}")
            return False

    def save_feedback(
        self,
        scan_id: str,
        helpful: bool,
        reason: Optional[str] = None,
        suggested_score: Optional[int] = None,
        comment: Optional[str] = None,
        user_id: Optional[str] = None,
        model_version: Optional[str] = None,
        ruleset_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save scan result feedback.

        Args:
            scan_id: Extension/scan identifier (slug or ID)
            helpful: Whether the user found the result helpful
            reason: Reason for negative feedback (required if helpful=False)
            suggested_score: User's suggested score (0-100)
            comment: Optional comment (max 280 chars)
            user_id: Anonymous user identifier
            model_version: AI model version (future-proofing)
            ruleset_version: Ruleset version (future-proofing)

        Returns:
            The saved feedback record
        """
        try:
            now = datetime.now(timezone.utc).isoformat()
            row_id = str(uuid.uuid4())
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO scan_feedback (
                        id, scan_id, helpful, reason, suggested_score, comment,
                        user_id, model_version, ruleset_version, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        row_id,
                        scan_id,
                        1 if helpful else 0,
                        reason,
                        suggested_score,
                        comment,
                        user_id,
                        model_version,
                        ruleset_version,
                        now,
                    ),
                )
            record = {
                "id": row_id,
                "scan_id": scan_id,
                "helpful": helpful,
                "reason": reason,
                "suggested_score": suggested_score,
                "comment": comment,
                "user_id": user_id,
                "model_version": model_version,
                "ruleset_version": ruleset_version,
                "created_at": now,
            }
            logger.info("Saved feedback for scan %s: helpful=%s, reason=%s", scan_id, helpful, reason)
            return record
        except Exception as e:
            logger.error("Error saving feedback: %s", e)
            raise

    def get_user_scan_history(self, user_id: str, limit: int = 50, private_only: bool = False) -> List[Dict[str, Any]]:
        """
        Get scan history for a single user, joined with global scan_results by extension_id.
        
        Args:
            user_id: User identifier
            limit: Max results to return
            private_only: If True, only return private uploads (source='upload')
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                base_query = """
                    SELECT
                        h.extension_id,
                        r.extension_name,
                        r.url,
                        r.timestamp,
                        r.status,
                        r.security_score,
                        r.risk_level,
                        r.total_findings,
                        r.total_files,
                        r.high_risk_count,
                        r.medium_risk_count,
                        r.low_risk_count,
                        r.visibility,
                        r.source
                    FROM user_scan_history h
                    LEFT JOIN scan_results r
                        ON r.extension_id = h.extension_id
                    WHERE h.user_id = ?
                """
                if private_only:
                    base_query += " AND r.source = 'upload'"
                base_query += " ORDER BY COALESCE(h.last_viewed_at, h.created_at) DESC LIMIT ?"
                
                cursor.execute(base_query, (user_id, limit))
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error getting user scan history: {e}")
            return []

    def get_scan_result(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Get scan result by extension ID or slug. Identifier can be 32-char extension ID, upload UUID, or name slug."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                # Always try extension_id first (Chrome ID or upload UUID)
                cursor.execute("SELECT * FROM scan_results WHERE extension_id = ?", (identifier,))
                row = cursor.fetchone()
                if not row and not _is_extension_id(identifier):
                    # Fall back to slug for human-readable names
                    cursor.execute(
                        """SELECT * FROM scan_results WHERE slug = ? ORDER BY timestamp DESC LIMIT 1""",
                        (identifier,),
                    )
                    row = cursor.fetchone()
                if not row:
                    return None
                return self._row_to_dict(row)
        except Exception as e:
            print(f"Error getting scan result: {e}")
            return None

    def get_scan_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get scan history ordered by most recent."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT 
                        extension_id, extension_name, url, timestamp, status,
                        security_score, risk_level, total_findings, total_files,
                        high_risk_count, medium_risk_count, low_risk_count
                    FROM scan_results
                    ORDER BY timestamp DESC
                    LIMIT ?
                """,
                    (limit,),
                )

                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            print(f"Error getting scan history: {e}")
            return []

    def get_statistics(self) -> Dict[str, int]:
        """Get aggregated statistics."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Get basic stats from statistics table
                cursor.execute("SELECT metric_name, metric_value FROM statistics")
                stats = {row["metric_name"]: row["metric_value"] for row in cursor.fetchall()}

                # Get additional computed stats
                cursor.execute(
                    """
                    SELECT 
                        COUNT(*) as total_scans,
                        SUM(CASE WHEN risk_level = 'high' THEN 1 ELSE 0 END) as high_risk,
                        SUM(total_files) as total_files,
                        SUM(total_findings) as total_findings,
                        AVG(security_score) as avg_security_score
                    FROM scan_results
                    WHERE status = 'completed'
                """
                )

                row = cursor.fetchone()
                if row:
                    stats.update(
                        {
                            "total_scans": row["total_scans"] or 0,
                            "high_risk_extensions": row["high_risk"] or 0,
                            "total_files_analyzed": row["total_files"] or 0,
                            "total_vulnerabilities": row["total_findings"] or 0,
                            "avg_security_score": int(row["avg_security_score"] or 0),
                        }
                    )

                return stats
        except Exception as e:
            print(f"Error getting statistics: {e}")
            return {
                "total_scans": 0,
                "high_risk_extensions": 0,
                "total_files_analyzed": 0,
                "total_vulnerabilities": 0,
                "avg_security_score": 0,
            }

    def get_risk_distribution(self) -> Dict[str, int]:
        """Get distribution of risk levels."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT 
                        risk_level,
                        COUNT(*) as count
                    FROM scan_results
                    WHERE status = 'completed'
                    GROUP BY risk_level
                """
                )

                distribution = {"high": 0, "medium": 0, "low": 0}
                for row in cursor.fetchall():
                    risk_level = row["risk_level"]
                    if risk_level in distribution:
                        distribution[risk_level] = row["count"]

                return distribution
        except Exception as e:
            print(f"Error getting risk distribution: {e}")
            return {"high": 0, "medium": 0, "low": 0}

    def get_recent_scans(self, limit: int = 10, search: Optional[str] = None, include_all: bool = False) -> List[Dict[str, Any]]:
        """Get recent scans with summary info including metadata and signal data to avoid N+1 queries.
        Optional search filters by extension_name or extension_id (case-insensitive).
        When search is provided, results are ranked by relevance: exact title match first, then title
        starts with, then title contains (e.g. "block" matches "Paypal ad blocker"), then ID match; then by recency.
        When include_all=True, returns all completed scans regardless of visibility/source (for QA export).
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                if search and search.strip():
                    term_raw = search.strip()
                    term = f"%{term_raw}%"
                    visibility_filter = "" if include_all else " AND COALESCE(visibility, 'public') = 'public' AND COALESCE(source, 'webstore') = 'webstore'"
                    cursor.execute(
                        """
                        SELECT 
                            extension_id, extension_name, slug, url, timestamp,
                            security_score, risk_level, total_findings,
                            total_files, metadata, 
                            sast_results, permissions_analysis, manifest, 
                            webstore_analysis, summary,
                            icon_base64, icon_media_type
                        FROM scan_results
                        WHERE status = 'completed'
                          """ + visibility_filter + """
                          AND (extension_name LIKE ? OR extension_id LIKE ?)
                        ORDER BY
                          CASE
                            WHEN LOWER(TRIM(extension_name)) = LOWER(?) THEN 0
                            WHEN LOWER(extension_name) LIKE LOWER(?) || '%' THEN 1
                            WHEN LOWER(extension_name) LIKE '%' || LOWER(?) || '%' THEN 2
                            WHEN extension_id LIKE ? THEN 3
                            ELSE 4
                          END,
                          COALESCE(updated_at, timestamp) DESC
                        LIMIT ?
                    """,
                        (term, term, term_raw, term_raw, term_raw, term, limit),
                    )
                else:
                    visibility_filter = "" if include_all else " AND COALESCE(visibility, 'public') = 'public' AND COALESCE(source, 'webstore') = 'webstore'"
                    cursor.execute(
                        """
                        SELECT 
                            extension_id, extension_name, slug, url, timestamp,
                            security_score, risk_level, total_findings,
                            total_files, metadata, 
                            sast_results, permissions_analysis, manifest, 
                            webstore_analysis, summary,
                            icon_base64, icon_media_type
                        FROM scan_results
                        WHERE status = 'completed'
                          """ + visibility_filter + """
                        ORDER BY COALESCE(updated_at, timestamp) DESC
                        LIMIT ?
                    """,
                        (limit,),
                    )

                # Use _row_to_dict to parse JSON fields like metadata, sast_results, etc.
                rows = cursor.fetchall()
                result_rows = []
                for row in rows:
                    try:
                        row_dict = self._row_to_dict(row)
                        
                        # Extract modern fields from summary JSON if present (for signal calculation)
                        summary = row_dict.get("summary", {})
                        if isinstance(summary, dict):
                            if "scoring_v2" in summary:
                                row_dict["scoring_v2"] = summary.get("scoring_v2")
                            if "report_view_model" in summary:
                                row_dict["report_view_model"] = summary.get("report_view_model")
                            if "governance_bundle" in summary:
                                row_dict["governance_bundle"] = summary.get("governance_bundle")
                            if "virustotal_analysis" in summary:
                                row_dict["virustotal_analysis"] = summary.get("virustotal_analysis")
                        
                        result_rows.append(row_dict)
                    except Exception as row_error:
                        print(f"Error processing row in get_recent_scans: {row_error}")
                        # Continue processing other rows
                        continue
                
                print(f"[get_recent_scans] Retrieved {len(result_rows)} scans from database")
                return result_rows
        except Exception as e:
            import traceback
            print(f"Error getting recent scans: {e}")
            print(f"Traceback: {traceback.format_exc()}")
            return []

    def touch_scan_result(self, extension_id: str) -> bool:
        """Touch scan result to bump it in recent scans (updates updated_at)."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE scan_results SET updated_at = datetime('now') WHERE extension_id = ?
                """,
                    (extension_id,),
                )
                return cursor.rowcount > 0
        except Exception as e:
            print(f"Error touching scan result: {e}")
            return False

    def update_scan_summary(self, extension_id: str, scoring_v2: dict, report_view_model: dict) -> bool:
        """
        Update the summary JSON field with upgraded scoring_v2 and report_view_model.
        Called after legacy payload upgrade to persist the computed data.
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                # Get current summary
                cursor.execute(
                    "SELECT summary FROM scan_results WHERE extension_id = ?",
                    (extension_id,),
                )
                row = cursor.fetchone()
                if not row:
                    return False
                
                current_summary = row[0]
                if isinstance(current_summary, str):
                    try:
                        current_summary = json.loads(current_summary)
                    except Exception:
                        current_summary = {}
                if not isinstance(current_summary, dict):
                    current_summary = {}
                
                # Update with new fields
                if scoring_v2:
                    current_summary["scoring_v2"] = scoring_v2
                if report_view_model:
                    current_summary["report_view_model"] = report_view_model
                
                cursor.execute(
                    "UPDATE scan_results SET summary = ? WHERE extension_id = ?",
                    (json.dumps(current_summary), extension_id),
                )
                return cursor.rowcount > 0
        except Exception as e:
            print(f"Error updating scan summary: {e}")
            return False

    def delete_scan_result(self, extension_id: str) -> bool:
        """Delete a scan result."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    DELETE FROM scan_results WHERE extension_id = ?
                """,
                    (extension_id,),
                )

                self._update_statistics()
                return True
        except Exception as e:
            print(f"Error deleting scan result: {e}")
            return False

    def clear_all_results(self) -> bool:
        """Clear all scan results."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM scan_results")
                self._update_statistics()
                return True
        except Exception as e:
            print(f"Error clearing results: {e}")
            return False

    def delete_scans_before(self, cutoff_iso: str) -> int:
        """Delete scan_results with timestamp strictly before cutoff (for cleanup). Returns count deleted."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "DELETE FROM scan_results WHERE timestamp < ?",
                    (cutoff_iso,),
                )
                n = cursor.rowcount
                self._update_statistics()
                return n
        except Exception as e:
            print(f"Error delete_scans_before: {e}")
            return 0

    def _update_statistics(self):
        """Update aggregated statistics."""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Update total scans
                cursor.execute(
                    """
                    UPDATE statistics 
                    SET metric_value = (
                        SELECT COUNT(*) FROM scan_results WHERE status = 'completed'
                    ),
                        updated_at = ?
                    WHERE metric_name = 'total_scans'
                """,
                    (datetime.now().isoformat(),),
                )

                # Update high risk count
                cursor.execute(
                    """
                    UPDATE statistics 
                    SET metric_value = (
                        SELECT COUNT(*) FROM scan_results 
                        WHERE status = 'completed' AND risk_level = 'high'
                    ),
                    updated_at = ?
                    WHERE metric_name = 'high_risk_extensions'
                """,
                    (datetime.now().isoformat(),),
                )

                # Update total files
                cursor.execute(
                    """
                    UPDATE statistics 
                    SET metric_value = (
                        SELECT COALESCE(SUM(total_files), 0) FROM scan_results 
                        WHERE status = 'completed'
                    ),
                    updated_at = ?
                    WHERE metric_name = 'total_files_analyzed'
                """,
                    (datetime.now().isoformat(),),
                )

                # Update total vulnerabilities
                cursor.execute(
                    """
                    UPDATE statistics 
                    SET metric_value = (
                        SELECT COALESCE(SUM(total_findings), 0) FROM scan_results 
                        WHERE status = 'completed'
                    ),
                    updated_at = ?
                    WHERE metric_name = 'total_vulnerabilities'
                """,
                    (datetime.now().isoformat(),),
                )

        except Exception as e:
            print(f"Error updating statistics: {e}")

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert database row to dictionary with JSON parsing."""
        result = dict(row)

        # Parse JSON fields
        json_fields = [
            "metadata",
            "manifest",
            "permissions_analysis",
            "sast_results",
            "webstore_analysis",
            "summary",
            "extracted_files",
        ]

        for field in json_fields:
            if result.get(field):
                try:
                    result[field] = json.loads(result[field])
                except json.JSONDecodeError:
                    result[field] = {}

        return result


class SupabaseDatabase:
    """
    Supabase-backed storage adapter.

    Uses a single `scan_results` table (JSON-friendly) and computes statistics on-the-fly.
    This is intended for production deployments where the filesystem/SQLite may be ephemeral.
    """

    def __init__(self):
        settings = get_settings()
        supabase_url = settings.supabase_url
        supabase_key = settings.supabase_key
        if not supabase_url or not supabase_key:
            raise ValueError("Missing SUPABASE_URL or SUPABASE_*_KEY")

        self.table_scan_results = settings.supabase_scan_results_table

        # Lazy import so local dev doesn't require Supabase deps unless enabled.
        from supabase import create_client  # type: ignore

        self.client = create_client(supabase_url, supabase_key)

    def save_scan_result(self, result: Dict[str, Any]) -> bool:
        try:
            extension_id = result.get("extension_id")
            if not extension_id:
                return False

            metadata = result.get("metadata", {}) or {}
            extension_name = (
                result.get("extension_name")
                or metadata.get("title")
                or metadata.get("name")
                or extension_id
            )

            risk_dist = result.get("risk_distribution", {}) or {}
            extracted_files = result.get("extracted_files") or []

            # Use UTC for all timestamps (fixes "6h ago" timezone bug)
            now_utc = datetime.now(timezone.utc).isoformat()
            timestamp_value = result.get("timestamp")
            scanned_at = timestamp_value if timestamp_value else now_utc

            # Fetch existing row to determine first vs re-scan and preserve previous state
            # (graceful if migration 20260210200000 not yet applied - no first_scanned_at etc.)
            existing = None
            try:
                existing_resp = (
                    self.client.table(self.table_scan_results)
                    .select("extension_id, scanned_at, first_scanned_at, metadata, webstore_analysis, total_findings, risk_level, security_score")
                    .eq("extension_id", extension_id)
                    .limit(1)
                    .execute()
                )
                existing = (getattr(existing_resp, "data", None) or [None])[0]
            except Exception as _e:
                # May fail if new columns not yet in schema; fall back to basic select
                try:
                    existing_resp = (
                        self.client.table(self.table_scan_results)
                        .select("extension_id, scanned_at, metadata, webstore_analysis, total_findings, risk_level, security_score")
                        .eq("extension_id", extension_id)
                        .limit(1)
                        .execute()
                    )
                    existing = (getattr(existing_resp, "data", None) or [None])[0]
                except Exception:
                    pass

            first_scanned_at = None
            previous_scanned_at = None
            previous_scan_state = None

            if existing:
                # Re-scan: preserve first_scanned_at, capture previous state for Hot extensions analytics
                first_scanned_at = existing.get("first_scanned_at")  # keep original
                previous_scanned_at = existing.get("scanned_at")
                # Structured metadata snapshot for graphing (user_count, rating, etc.)
                prev_meta = existing.get("metadata") or {}
                prev_web = existing.get("webstore_analysis") or {}
                if isinstance(prev_meta, str):
                    try:
                        prev_meta = json.loads(prev_meta) if prev_meta else {}
                    except Exception:
                        prev_meta = {}
                if isinstance(prev_web, str):
                    try:
                        prev_web = json.loads(prev_web) if prev_web else {}
                    except Exception:
                        prev_web = {}
                previous_scan_state = {
                    "scanned_at": previous_scanned_at,
                    "user_count": prev_meta.get("user_count") or prev_web.get("user_count"),
                    "rating": prev_meta.get("rating") or prev_web.get("rating"),
                    "rating_count": prev_meta.get("ratings_count") or prev_meta.get("rating_count") or prev_web.get("ratings_count"),
                    "total_findings": existing.get("total_findings"),
                    "risk_level": existing.get("risk_level"),
                    "security_score": existing.get("security_score"),
                }
            else:
                # First scan: set first_scanned_at
                first_scanned_at = scanned_at

            # Enhance summary with modern fields for signals and risk calculation
            summary_data = result.get("summary", {}) or {}
            if not isinstance(summary_data, dict):
                summary_data = {}
            
            # Store modern fields in summary JSONB for backward compatibility
            # These fields are needed for frontend signal calculation
            if result.get("scoring_v2"):
                summary_data["scoring_v2"] = result.get("scoring_v2")
            if result.get("report_view_model"):
                summary_data["report_view_model"] = result.get("report_view_model")
            if result.get("governance_bundle"):
                summary_data["governance_bundle"] = result.get("governance_bundle")
            if result.get("virustotal_analysis"):
                summary_data["virustotal_analysis"] = result.get("virustotal_analysis")
            
            slug = _generate_slug(extension_name) if extension_name else ""
            row = {
                "extension_id": extension_id,
                "extension_name": extension_name,
                "slug": slug,
                "url": result.get("url"),
                "scanned_at": scanned_at,  # Last scan time (always updated)
                "first_scanned_at": first_scanned_at,
                "previous_scanned_at": previous_scanned_at,
                "previous_scan_state": previous_scan_state,
                "status": result.get("status"),
                "security_score": result.get("overall_security_score"),
                "risk_level": result.get("overall_risk"),
                "total_findings": result.get("total_findings", 0),
                "total_files": len(extracted_files),
                "high_risk_count": risk_dist.get("high", 0),
                "medium_risk_count": risk_dist.get("medium", 0),
                "low_risk_count": risk_dist.get("low", 0),
                "metadata": result.get("metadata", {}) or {},
                "manifest": result.get("manifest", {}) or {},
                "permissions_analysis": result.get("permissions_analysis", {}) or {},
                "sast_results": result.get("sast_results", {}) or {},
                "webstore_analysis": result.get("webstore_analysis", {}) or {},
                "summary": summary_data,  # Enhanced with modern fields
                "extracted_path": result.get("extracted_path"),
                "extracted_files": extracted_files,
                "icon_path": result.get("icon_path"),  # Relative path to icon (e.g., "icons/128.png")
                "icon_base64": result.get("icon_base64"),
                "icon_media_type": result.get("icon_media_type"),
                "error": result.get("error"),
                # updated_at is auto-updated by trigger, but set it anyway for initial insert
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "user_id": result.get("user_id"),
                "visibility": result.get("visibility", "public"),
                "source": result.get("source", "webstore"),
            }

            # Upsert on extension_id
            try:
                self.client.table(self.table_scan_results).upsert(row).execute()
            except Exception as upsert_error:
                # Allow rollout when DB migration for new columns is not applied yet.
                upsert_error_str = str(upsert_error).lower()
                if "icon_base64" in upsert_error_str or "icon_media_type" in upsert_error_str:
                    row.pop("icon_base64", None)
                    row.pop("icon_media_type", None)
                    self.client.table(self.table_scan_results).upsert(row).execute()
                elif "visibility" in upsert_error_str or "source" in upsert_error_str or "42703" in upsert_error_str:
                    # Migration 20260221100000 not applied: retry without visibility/source
                    row.pop("visibility", None)
                    row.pop("source", None)
                    row.pop("user_id", None)
                    self.client.table(self.table_scan_results).upsert(row).execute()
                else:
                    raise
            print(f"[save_scan_result Supabase] Successfully saved scan for extension_id={extension_id}, status={result.get('status')}")
            return True
        except Exception as e:
            import traceback
            print(f"[save_scan_result Supabase] ERROR saving scan result for extension_id={result.get('extension_id')}: {e}")
            print(f"[save_scan_result Supabase] Traceback: {traceback.format_exc()}")
            return False

    def add_user_scan_history(self, user_id: str, extension_id: str) -> bool:
        """
        Insert into Supabase `user_scan_history`.
        The trigger `user_scan_history_increment_karma` will automatically:
        - Create/update user_profiles record
        - Increment karma_points by 1
        - Increment total_scans by 1
        Relies on RLS policies in production.
        """
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            # Check if this extension was already scanned by this user
            existing = (
                self.client.table("user_scan_history")
                .select("id")
                .eq("user_id", user_id)
                .eq("extension_id", extension_id)
                .limit(1)
                .execute()
            )
            
            existing_data = getattr(existing, "data", None) or []
            if existing_data:
                # User already scanned this extension - bump last_viewed_at so it appears at top (no karma increment)
                self.client.table("user_scan_history").update(
                    {"last_viewed_at": now_iso}
                ).eq("user_id", user_id).eq("extension_id", extension_id).execute()
                return True
            
            # Insert new scan history with last_viewed_at set immediately so new scans
            # sort correctly even if the column default was missing in an older deployment.
            self.client.table("user_scan_history").insert(
                {"user_id": user_id, "extension_id": extension_id, "last_viewed_at": now_iso}
            ).execute()
            return True
        except Exception as e:
            print(f"Error adding user scan history (Supabase): {e}")
            return False

    def save_feedback(
        self,
        scan_id: str,
        helpful: bool,
        reason: Optional[str] = None,
        suggested_score: Optional[int] = None,
        comment: Optional[str] = None,
        user_id: Optional[str] = None,
        model_version: Optional[str] = None,
        ruleset_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Save scan result feedback to scan_feedback table.

        Args:
            scan_id: Extension/scan identifier (slug or ID)
            helpful: Whether the user found the result helpful
            reason: Reason for negative feedback (required if helpful=False)
            suggested_score: User's suggested score (0-100)
            comment: Optional comment (max 280 chars)
            user_id: Anonymous user identifier
            model_version: AI model version (future-proofing)
            ruleset_version: Ruleset version (future-proofing)

        Returns:
            The saved feedback record
        """
        try:
            row = {
                "scan_id": scan_id,
                "helpful": helpful,
                "reason": reason,
                "suggested_score": suggested_score,
                "comment": comment,
                "user_id": user_id,
                "model_version": model_version,
                "ruleset_version": ruleset_version,
            }
            resp = self.client.table("scan_feedback").insert(row).execute()
            data = getattr(resp, "data", None) or []
            record = data[0] if data else row
            record["created_at"] = record.get("created_at") or datetime.now(timezone.utc).isoformat()
            record["id"] = record.get("id", "")
            record["helpful"] = helpful
            logger.info("Saved feedback for scan %s: helpful=%s, reason=%s", scan_id, helpful, reason)
            return record
        except Exception as e:
            logger.error("Error saving feedback (Supabase): %s", e)
            raise

    def get_user_karma(self, user_id: str) -> Dict[str, Any]:
        """
        Get user's karma points and scan statistics.
        """
        try:
            resp = (
                self.client.table("user_profiles")
                .select("karma_points, total_scans, created_at, updated_at")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            data = getattr(resp, "data", None) or []
            if data:
                return data[0]
            # Return defaults if profile doesn't exist yet
            return {"karma_points": 0, "total_scans": 0, "created_at": None, "updated_at": None}
        except Exception as e:
            print(f"Error getting user karma (Supabase): {e}")
            return {"karma_points": 0, "total_scans": 0, "created_at": None, "updated_at": None}

    def get_user_scan_history(self, user_id: str, limit: int = 50, private_only: bool = False) -> List[Dict[str, Any]]:
        """
        Fetch user history rows, then look up global scan_results by extension_id.
        
        Args:
            user_id: User identifier
            limit: Max results to return
            private_only: If True, only return private uploads (source='upload')
        """
        try:
            hist_resp = (
                self.client.table("user_scan_history")
                .select("extension_id, created_at, last_viewed_at")
                .eq("user_id", user_id)
                .order("last_viewed_at", desc=True)
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            hist_rows = getattr(hist_resp, "data", None) or []
            ext_ids = [r.get("extension_id") for r in hist_rows if r.get("extension_id")]
            if not ext_ids:
                return []

            query = (
                self.client.table(self.table_scan_results)
                .select(
                    "extension_id, extension_name, url, scanned_at, created_at, updated_at, status, security_score, risk_level, total_findings, total_files, high_risk_count, medium_risk_count, low_risk_count, metadata, sast_results, permissions_analysis, manifest, summary, visibility, source"
                )
                .in_("extension_id", ext_ids)
            )
            if private_only:
                query = query.eq("source", "upload")
            scans_resp = query.execute()
            scans = getattr(scans_resp, "data", None) or []
            by_id = {}
            for r in scans:
                # Map scanned_at → timestamp for API compatibility (prefer scanned_at > updated_at > created_at)
                ts = r.get("scanned_at") or r.get("updated_at") or r.get("created_at")
                if ts:
                    r["timestamp"] = ts
                r.pop("scanned_at", None)
                r.pop("updated_at", None)
                r.pop("created_at", None)
                
                # Extract modern fields from summary JSONB if present
                summary = r.get("summary", {})
                if isinstance(summary, dict):
                    if "scoring_v2" in summary:
                        r["scoring_v2"] = summary.get("scoring_v2")
                    if "report_view_model" in summary:
                        r["report_view_model"] = summary.get("report_view_model")
                    if "governance_bundle" in summary:
                        r["governance_bundle"] = summary.get("governance_bundle")
                    if "virustotal_analysis" in summary:
                        r["virustotal_analysis"] = summary.get("virustotal_analysis")
                
                by_id[r.get("extension_id")] = r

            # Preserve user history ordering; attach scan summary where available.
            out: List[Dict[str, Any]] = []
            for h in hist_rows:
                ext = h.get("extension_id")
                row = by_id.get(ext, {"extension_id": ext})
                out.append(row)
            return out
        except Exception as e:
            print(f"Error getting user scan history (Supabase): {e}")
            return []

    def get_scan_result(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Get scan result by extension ID or slug. Identifier can be 32-char extension ID, upload UUID, or name slug."""
        try:
            # Try extension_id first (Chrome ID or upload UUID)
            resp = (
                self.client.table(self.table_scan_results)
                .select("*")
                .eq("extension_id", identifier)
                .limit(1)
                .execute()
            )
            data = getattr(resp, "data", None) or []
            if not data and not _is_extension_id(identifier):
                # Fall back to slug for human-readable names
                resp = (
                    self.client.table(self.table_scan_results)
                    .select("*")
                    .eq("slug", identifier)
                    .order("scanned_at", desc=True)
                    .limit(1)
                    .execute()
                )
                data = getattr(resp, "data", None) or []
            if not data:
                return None
            
            # Map scanned_at → timestamp for API compatibility (prefer scanned_at > updated_at > created_at)
            result = data[0]
            ts = result.get("scanned_at") or result.get("updated_at") or result.get("created_at")
            if ts:
                result["timestamp"] = ts
            result.pop("scanned_at", None)
            
            # Extract modern fields from summary JSONB if present
            # Also check top-level in case they were stored there (backward compatibility)
            summary = result.get("summary", {})
            if isinstance(summary, dict):
                if "scoring_v2" in summary:
                    result["scoring_v2"] = summary.get("scoring_v2")
                if "report_view_model" in summary:
                    result["report_view_model"] = summary.get("report_view_model")
                if "governance_bundle" in summary:
                    result["governance_bundle"] = summary.get("governance_bundle")
                if "virustotal_analysis" in summary:
                    result["virustotal_analysis"] = summary.get("virustotal_analysis")
            
            # If not found in summary, check top-level (for backward compatibility with old scans)
            # Note: Supabase might return these as top-level fields if they were stored that way
            if "scoring_v2" not in result and result.get("scoring_v2"):
                pass  # Already at top level
            if "virustotal_analysis" not in result and result.get("virustotal_analysis"):
                pass  # Already at top level
            
            return result
        except Exception as e:
            print(f"Error getting scan result (Supabase): {e}")
            return None

    def get_scan_history(self, limit: int = 50) -> List[Dict[str, Any]]:
        try:
            resp = (
                self.client.table(self.table_scan_results)
                .select(
                    "extension_id, extension_name, url, scanned_at, created_at, updated_at, status, security_score, risk_level, total_findings, total_files, high_risk_count, medium_risk_count, low_risk_count, metadata, sast_results, permissions_analysis, manifest, summary"
                )
                .order("scanned_at", desc=True)
                .limit(limit)
                .execute()
            )
            rows = getattr(resp, "data", None) or []
            # Map scanned_at → timestamp for API compatibility (prefer scanned_at > updated_at > created_at)
            for row in rows:
                ts = row.get("scanned_at") or row.get("updated_at") or row.get("created_at")
                if ts:
                    row["timestamp"] = ts
                row.pop("scanned_at", None)
                row.pop("updated_at", None)
                row.pop("created_at", None)
                
                # Extract modern fields from summary JSONB if present
                summary = row.get("summary", {})
                if isinstance(summary, dict):
                    if "scoring_v2" in summary:
                        row["scoring_v2"] = summary.get("scoring_v2")
                    if "report_view_model" in summary:
                        row["report_view_model"] = summary.get("report_view_model")
                    if "governance_bundle" in summary:
                        row["governance_bundle"] = summary.get("governance_bundle")
                    if "virustotal_analysis" in summary:
                        row["virustotal_analysis"] = summary.get("virustotal_analysis")
            return rows
        except Exception as e:
            print(f"Error getting scan history (Supabase): {e}")
            return []

    def get_recent_scans(self, limit: int = 10, search: Optional[str] = None, include_all: bool = False) -> List[Dict[str, Any]]:
        """Get recent scans (public webstore only unless include_all=True). Optional search filters by extension_name or extension_id.
        When search is provided, results are ranked by relevance: exact title first, then title starts with, then title contains, then ID; then by recency.
        When include_all=True, returns all completed scans regardless of visibility/source (for QA export).
        """
        select_cols = "extension_id, extension_name, url, slug, scanned_at, created_at, updated_at, security_score, risk_level, total_findings, total_files, high_risk_count, medium_risk_count, low_risk_count, metadata, webstore_analysis, sast_results, permissions_analysis, manifest, summary, icon_base64, icon_media_type"
        try:
            # When searching, fetch more candidates so we can rank by relevance then trim to limit
            limit_fetch = min(200, limit * 15) if (search and search.strip()) else limit
            q = (
                self.client.table(self.table_scan_results)
                .select(select_cols)
                .eq("status", "completed")
            )
            if not include_all:
                q = q.or_("visibility.is.null,visibility.eq.public").or_("source.is.null,source.eq.webstore")
            q = q.order("updated_at", desc=True)
            if search and search.strip():
                term = _escape_postgrest_like_term(search.strip())
                q = q.or_(f"extension_name.ilike.%{term}%,extension_id.ilike.%{term}%")
            resp = q.limit(limit_fetch).execute()
            rows = getattr(resp, "data", None) or []

            # Rank by relevance when search is present: exact title > title starts with > title contains > id contains; then recency (query already ordered by updated_at)
            if search and search.strip():
                term = search.strip()
                rows = sorted(rows, key=lambda r: _relevance_rank(r.get("extension_name"), r.get("extension_id"), term))[:limit]

            print(f"[get_recent_scans Supabase] Retrieved {len(rows)} scans from database")
            
            # Map scanned_at → timestamp for API compatibility. Use most accurate time for "recently scanned" display.
            # Prefer: scanned_at (actual scan time) > updated_at > created_at
            for row in rows:
                try:
                    ts = row.get("scanned_at") or row.get("updated_at") or row.get("created_at")
                    if ts:
                        row["timestamp"] = ts
                    row.pop("scanned_at", None)
                    row.pop("updated_at", None)
                    row.pop("created_at", None)
                    
                    # Extract modern fields from summary JSONB if present
                    summary = row.get("summary", {})
                    if isinstance(summary, dict):
                        if "scoring_v2" in summary:
                            row["scoring_v2"] = summary.get("scoring_v2")
                        if "report_view_model" in summary:
                            row["report_view_model"] = summary.get("report_view_model")
                        if "governance_bundle" in summary:
                            row["governance_bundle"] = summary.get("governance_bundle")
                        if "virustotal_analysis" in summary:
                            row["virustotal_analysis"] = summary.get("virustotal_analysis")
                except Exception as row_error:
                    print(f"Error processing row in get_recent_scans (Supabase): {row_error}")
                    # Continue processing other rows
                    continue
            return rows
        except Exception as e:
            import traceback
            err_str = str(e).lower()
            # Migration 20260221100000 not applied: visibility/source columns missing
            if "42703" in err_str or "visibility" in err_str or "source" in err_str or "does not exist" in err_str:
                try:
                    limit_fetch = min(200, limit * 15) if (search and search.strip()) else limit
                    q = (
                        self.client.table(self.table_scan_results)
                        .select(select_cols)
                        .eq("status", "completed")
                        .order("updated_at", desc=True)
                    )
                    if search and search.strip():
                        term = _escape_postgrest_like_term(search.strip())
                        q = q.or_(f"extension_name.ilike.%{term}%,extension_id.ilike.%{term}%")
                    resp = q.limit(limit_fetch).execute()
                    rows = getattr(resp, "data", None) or []
                    if search and search.strip():
                        term = search.strip()
                        rows = sorted(rows, key=lambda r: _relevance_rank(r.get("extension_name"), r.get("extension_id"), term))[:limit]
                    print(f"[get_recent_scans Supabase] Retrieved {len(rows)} scans (no visibility/source filter)")
                    for row in rows:
                        try:
                            ts = row.get("scanned_at") or row.get("updated_at") or row.get("created_at")
                            if ts:
                                row["timestamp"] = ts
                            row.pop("scanned_at", None)
                            row.pop("updated_at", None)
                            row.pop("created_at", None)
                            summary = row.get("summary", {})
                            if isinstance(summary, dict):
                                if "scoring_v2" in summary:
                                    row["scoring_v2"] = summary.get("scoring_v2")
                                if "report_view_model" in summary:
                                    row["report_view_model"] = summary.get("report_view_model")
                                if "governance_bundle" in summary:
                                    row["governance_bundle"] = summary.get("governance_bundle")
                                if "virustotal_analysis" in summary:
                                    row["virustotal_analysis"] = summary.get("virustotal_analysis")
                        except Exception as row_error:
                            print(f"Error processing row in get_recent_scans (Supabase): {row_error}")
                            continue
                    return rows
                except Exception as fallback_e:
                    print(f"Error in get_recent_scans fallback (Supabase): {fallback_e}")
            print(f"Error getting recent scans (Supabase): {e}")
            print(f"Traceback: {traceback.format_exc()}")
            return []

    def touch_scan_result(self, extension_id: str) -> bool:
        """Touch scan result to bump it in recent scans (updates updated_at)."""
        try:
            resp = (
                self.client.table(self.table_scan_results)
                .update({"updated_at": datetime.now(timezone.utc).isoformat()})
                .eq("extension_id", extension_id)
                .execute()
            )
            data = getattr(resp, "data", None) or []
            return len(data) > 0
        except Exception as e:
            print(f"Error touching scan result (Supabase): {e}")
            return False

    def update_scan_summary(self, extension_id: str, scoring_v2: dict, report_view_model: dict) -> bool:
        """
        Update the summary JSONB field with upgraded scoring_v2 and report_view_model.
        Called after legacy payload upgrade to persist the computed data.
        """
        try:
            # First, get the current summary
            resp = (
                self.client.table(self.table_scan_results)
                .select("summary")
                .eq("extension_id", extension_id)
                .limit(1)
                .execute()
            )
            data = getattr(resp, "data", None) or []
            if not data:
                return False
            
            current_summary = data[0].get("summary") or {}
            if not isinstance(current_summary, dict):
                current_summary = {}
            
            # Update with new fields
            if scoring_v2:
                current_summary["scoring_v2"] = scoring_v2
            if report_view_model:
                current_summary["report_view_model"] = report_view_model
            
            # Update the row
            resp = (
                self.client.table(self.table_scan_results)
                .update({"summary": current_summary})
                .eq("extension_id", extension_id)
                .execute()
            )
            updated = getattr(resp, "data", None) or []
            return len(updated) > 0
        except Exception as e:
            print(f"Error updating scan summary (Supabase): {e}")
            return False

    def delete_scan_result(self, extension_id: str) -> bool:
        try:
            self.client.table(self.table_scan_results).delete().eq("extension_id", extension_id).execute()
            return True
        except Exception as e:
            print(f"Error deleting scan result (Supabase): {e}")
            return False

    def clear_all_results(self) -> bool:
        try:
            # PostgREST requires a filter for deletes; this matches all rows.
            self.client.table(self.table_scan_results).delete().neq("extension_id", "").execute()
            return True
        except Exception as e:
            print(f"Error clearing results (Supabase): {e}")
            return False

    def delete_scans_before(self, cutoff_iso: str) -> int:
        """Delete scan_results with scanned_at strictly before cutoff (for cleanup). Returns count deleted."""
        try:
            resp = (
                self.client.table(self.table_scan_results)
                .delete()
                .lt("scanned_at", cutoff_iso)
                .execute()
            )
            # PostgREST may return deleted rows in resp.data
            data = getattr(resp, "data", None) or []
            return len(data) if isinstance(data, list) else 0
        except Exception as e:
            print(f"Error delete_scans_before (Supabase): {e}")
            return 0

    def get_risk_distribution(self) -> Dict[str, int]:
        dist = {"high": 0, "medium": 0, "low": 0}
        try:
            resp = (
                self.client.table(self.table_scan_results)
                .select("risk_level")
                .eq("status", "completed")
                .execute()
            )
            rows = getattr(resp, "data", None) or []
            for r in rows:
                level = (r.get("risk_level") or "").lower()
                if level in dist:
                    dist[level] += 1
            return dist
        except Exception as e:
            print(f"Error getting risk distribution (Supabase): {e}")
            return dist

    def get_statistics(self) -> Dict[str, int]:
        """
        Compute stats on-the-fly from scan_results.
        (For large datasets you can replace with a materialized stats table or RPC.)
        """
        try:
            resp = (
                self.client.table(self.table_scan_results)
                .select("security_score, risk_level, total_files, total_findings")
                .eq("status", "completed")
                .execute()
            )
            rows = getattr(resp, "data", None) or []
            total_scans = None
            try:
                count_resp = (
                    self.client.table(self.table_scan_results)
                    .select("extension_id", count="exact")
                    .eq("status", "completed")
                    .limit(1)
                    .execute()
                )
                total_scans = getattr(count_resp, "count", None)
            except Exception:
                total_scans = None
            if total_scans is None:
                total_scans = len(rows)
            high_risk = sum(1 for r in rows if (r.get("risk_level") or "").lower() == "high")
            total_files = sum(int(r.get("total_files") or 0) for r in rows)
            total_findings = sum(int(r.get("total_findings") or 0) for r in rows)
            security_scores = [int(r["security_score"]) for r in rows if r.get("security_score") is not None]
            avg_security_score = int(sum(security_scores) / len(security_scores)) if security_scores else 0

            return {
                "total_scans": total_scans,
                "high_risk_extensions": high_risk,
                "total_files_analyzed": total_files,
                "total_vulnerabilities": total_findings,
                "avg_security_score": avg_security_score,
            }
        except Exception as e:
            print(f"Error getting statistics (Supabase): {e}")
            return {
                "total_scans": 0,
                "high_risk_extensions": 0,
                "total_files_analyzed": 0,
                "total_vulnerabilities": 0,
                "avg_security_score": 0,
            }

    def increment_page_view(self, day: str, path: str) -> int:
        """
        Increment a page view count for a given UTC day + path (Supabase backend).
        
        Uses atomic RPC function to prevent race conditions and lost updates.

        Args:
            day: YYYY-MM-DD (UTC)
            path: Route path (e.g., /research)

        Returns:
            Updated count
        """
        path = (path or "/").strip()
        if not path.startswith("/"):
            path = "/" + path

        try:
            # Use atomic RPC function for safe concurrent increments
            resp = self.client.rpc(
                "increment_page_view",
                {"p_day": day, "p_path": path}
            ).execute()
            
            # Parse RPC return value - handle multiple response formats
            result = getattr(resp, "data", None)
            if result is None:
                return 0
            
            # Case 1: Direct integer
            if isinstance(result, int):
                return result
            
            # Case 2: String representation of integer
            if isinstance(result, str):
                try:
                    return int(result)
                except (ValueError, TypeError):
                    return 0
            
            # Case 3: Dictionary with count or function name as key
            if isinstance(result, dict):
                # Try common keys
                count = result.get("count") or result.get("increment_page_view") or result.get("value")
                if count is not None:
                    try:
                        return int(count)
                    except (ValueError, TypeError):
                        pass
                return 0
            
            # Case 4: List of values
            if isinstance(result, list) and len(result) > 0:
                first_item = result[0]
                # If list contains integers
                if isinstance(first_item, int):
                    return first_item
                # If list contains dicts
                if isinstance(first_item, dict):
                    count = first_item.get("count") or first_item.get("increment_page_view") or first_item.get("value")
                    if count is not None:
                        try:
                            return int(count)
                        except (ValueError, TypeError):
                            pass
                # If list contains strings
                if isinstance(first_item, str):
                    try:
                        return int(first_item)
                    except (ValueError, TypeError):
                        pass
            
            return 0
                
        except Exception as e:
            print(f"Error incrementing page view (Supabase): {e}")
            # Fallback to non-atomic method if RPC doesn't exist (backward compatibility)
            try:
                resp = (
                    self.client.table("page_views_daily")
                    .select("count")
                    .eq("day", day)
                    .eq("path", path)
                    .limit(1)
                    .execute()
                )
                data = getattr(resp, "data", None) or []
                
                if data:
                    current_count = int(data[0].get("count", 0))
                    new_count = current_count + 1
                    self.client.table("page_views_daily").update(
                        {"count": new_count}
                    ).eq("day", day).eq("path", path).execute()
                    return new_count
                else:
                    self.client.table("page_views_daily").insert(
                        {"day": day, "path": path, "count": 1}
                    ).execute()
                    return 1
            except Exception:
                return 0

    def get_page_view_summary(self, days: int = 14) -> Dict[str, Any]:
        """
        Return aggregate telemetry counts for the last N UTC days (Supabase backend).

        Returns:
            {
              "days": int,
              "start_day": "YYYY-MM-DD",
              "end_day": "YYYY-MM-DD",
              "by_day": { "YYYY-MM-DD": int },
              "by_path": { "/research": int },
              "rows": [{ "day": "...", "path": "...", "count": 123 }]
            }
        """
        days = int(days or 14)
        days = max(1, min(days, 365))

        now_utc = datetime.now(timezone.utc).date()
        start_date = now_utc - timedelta(days=days - 1)
        start_day = start_date.strftime("%Y-%m-%d")
        end_day = now_utc.strftime("%Y-%m-%d")

        try:
            resp = (
                self.client.table("page_views_daily")
                .select("day, path, count")
                .gte("day", start_day)
                .order("day", desc=False)
                .execute()
            )
            rows = getattr(resp, "data", None) or []

            by_day: Dict[str, int] = {}
            by_path: Dict[str, int] = {}
            for r in rows:
                d = r.get("day")
                p = r.get("path")
                c = int(r.get("count") or 0)
                if d:
                    by_day[d] = by_day.get(d, 0) + c
                if p:
                    by_path[p] = by_path.get(p, 0) + c

            return {
                "days": days,
                "start_day": start_day,
                "end_day": end_day,
                "by_day": by_day,
                "by_path": by_path,
                "rows": rows,
            }
        except Exception as e:
            print(f"Error getting page view summary (Supabase): {e}")
            return {
                "days": days,
                "start_day": start_day,
                "end_day": end_day,
                "by_day": {},
                "by_path": {},
                "rows": [],
            }

    # ---------- Community review queue ----------

    def get_review_queue(self) -> List[Dict[str, Any]]:
        """
        Fetch review queue items with extension names from scan_results and aggregate vote counts.
        Sort: open first, then in_review, then verified/dismissed; newest first within status.
        """
        try:
            queue_resp = (
                self.client.table("extension_review_queue")
                .select("id, extension_id, finding_type, severity, status, assigned_to_user_id, created_at")
                .order("created_at", desc=True)
                .execute()
            )
            queue_rows = getattr(queue_resp, "data", None) or []
            if not queue_rows:
                return []

            queue_ids = [r["id"] for r in queue_rows]
            votes_resp = (
                self.client.table("extension_review_votes")
                .select("queue_item_id, vote")
                .in_("queue_item_id", queue_ids)
                .execute()
            )
            votes_rows = getattr(votes_resp, "data", None) or []
            vote_counts: Dict[str, Dict[str, int]] = {}
            for v in votes_rows:
                qid = v.get("queue_item_id")
                if not qid:
                    continue
                if qid not in vote_counts:
                    vote_counts[qid] = {"up": 0, "down": 0}
                vote_counts[qid][v.get("vote") or "up"] = vote_counts[qid].get(v.get("vote") or "up", 0) + 1

            ext_ids = list({r["extension_id"] for r in queue_rows})
            scan_resp = (
                self.client.table(self.table_scan_results)
                .select("extension_id, extension_name")
                .in_("extension_id", ext_ids)
                .execute()
            )
            scans = getattr(scan_resp, "data", None) or []
            names_by_id = {s["extension_id"]: (s.get("extension_name") or s["extension_id"]) for s in scans}

            status_order = {"open": 0, "in_review": 1, "verified": 2, "dismissed": 3}

            def _created_ts(c: str):
                if not c:
                    return 0.0
                try:
                    s = (c or "").replace("Z", "+00:00")
                    return datetime.fromisoformat(s).timestamp()
                except Exception:
                    return 0.0

            out = []
            for r in queue_rows:
                qid = r.get("id")
                ext_id = r.get("extension_id") or ""
                counts = vote_counts.get(qid, {"up": 0, "down": 0})
                status = (r.get("status") or "open").lower()
                created_at = r.get("created_at") or ""
                out.append({
                    "id": qid,
                    "extension_id": ext_id,
                    "extension_name": names_by_id.get(ext_id, ext_id or "Unknown"),
                    "finding_type": r.get("finding_type") or "Security scan",
                    "severity": (r.get("severity") or "medium").lower(),
                    "status": status,
                    "assigned_to_user_id": r.get("assigned_to_user_id"),
                    "created_at": created_at,
                    "votes_up": counts.get("up", 0),
                    "votes_down": counts.get("down", 0),
                    "_sort": (status_order.get(status, 99), -_created_ts(created_at)),
                })
            out.sort(key=lambda x: x["_sort"])
            for o in out:
                o.pop("_sort", None)
            return out
        except Exception as e:
            print(f"Error get_review_queue (Supabase): {e}")
            return []

    def claim_review_queue_item(self, queue_item_id: str, user_id: Optional[str] = None) -> bool:
        """Set status=in_review and optionally assigned_to_user_id. user_id may be None (anon claim)."""
        try:
            payload = {"status": "in_review", "updated_at": datetime.now(timezone.utc).isoformat()}
            if user_id and user_id != "anon":
                payload["assigned_to_user_id"] = user_id
            self.client.table("extension_review_queue").update(payload).eq("id", queue_item_id).execute()
            return True
        except Exception as e:
            print(f"Error claim_review_queue_item (Supabase): {e}")
            return False

    def upsert_review_vote(
        self, queue_item_id: str, user_id: str, vote: str, note: Optional[str] = None
    ) -> bool:
        """Upsert a vote (up/down) and optional note. user_id must be authenticated (not anon)."""
        if user_id in (None, "", "anon"):
            return False
        if vote not in ("up", "down"):
            return False
        try:
            # Check existing vote for this user + item
            existing = (
                self.client.table("extension_review_votes")
                .select("id")
                .eq("queue_item_id", queue_item_id)
                .eq("user_id", user_id)
                .limit(1)
                .execute()
            )
            data = getattr(existing, "data", None) or []
            row = {"queue_item_id": queue_item_id, "user_id": user_id, "vote": vote, "note": (note or "")[:500] or None}
            if data:
                self.client.table("extension_review_votes").update(row).eq("id", data[0]["id"]).execute()
            else:
                self.client.table("extension_review_votes").insert(row).execute()
            return True
        except Exception as e:
            print(f"Error upsert_review_vote (Supabase): {e}")
            return False


def _create_db():
    """
    Choose storage backend based on DB_BACKEND env var.

    DB_BACKEND is the primary signal:
      - "supabase": Use Supabase (Postgres). Fall back to SQLite on init failure.
      - "sqlite" / unset: Use local SQLite.

    This respects DB_BACKEND regardless of EXTSHIELD_MODE or ENV, so:
      - Production (Railway) with DB_BACKEND=supabase → Supabase.
      - Local dev with DB_BACKEND=supabase → Supabase (same data as prod).
      - Local dev without DB_BACKEND (or =sqlite) → SQLite (no cloud needed).
    """
    import logging
    _logger = logging.getLogger(__name__)

    from extension_shield.utils.mode import get_feature_flags

    flags = get_feature_flags()
    settings = get_settings()

    if settings.db_backend == "supabase":
        try:
            _db = SupabaseDatabase()
            _logger.info("DB backend: supabase")
            print(f"✓ DB backend: supabase  |  mode={flags.mode}  |  env={settings.env}")
            return _db
        except Exception as e:
            _logger.warning(
                "Supabase enabled but failed to initialize. Falling back to SQLite. Error: %s", e
            )
            print(
                f"⚠️  Supabase init failed, falling back to SQLite. Error: {e}"
            )
            _db = Database()
            _logger.info("DB backend: sqlite (fallback)")
            print(f"✓ DB backend: sqlite (fallback)  |  mode={flags.mode}")
            return _db

    if settings.db_backend == "sqlite":
        _db = Database()
        _logger.info("DB backend: sqlite")
        print(f"✓ DB backend: sqlite  |  mode={flags.mode}")
        return _db

    _db = Database()
    _logger.info("DB backend: sqlite (default)")
    print(f"✓ DB backend: sqlite (default)  |  mode={flags.mode}")
    return _db


# Global database instance
db = _create_db()
