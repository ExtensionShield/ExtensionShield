"""
Central configuration for ExtensionShield.

Goals:
- Single place for env var parsing + defaults
- Centralize storage/db backend selection (maps current behavior)
- Provide local filesystem paths
- Validate required env in production

This module intentionally avoids importing app/business logic to prevent cycles.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

EnvName = Literal["local", "dev", "prod"]
StorageBackend = Literal["local", "supabase"]
DbBackend = Literal["sqlite", "postgres", "supabase"]

DEFAULT_UPLOAD_MAX_BYTES = 104857600  # 100 MiB


def _normalize_env(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    v = value.strip().lower()
    return v or None


def get_required_env(name: str) -> str:
    """
    Get a required environment variable, raising a clear error if missing.
    
    Use this ONLY when a feature is invoked that requires the env var.
    Do not call at module load time - call only when the feature is used.
    
    Args:
        name: Environment variable name
        
    Returns:
        The environment variable value
        
    Raises:
        ValueError: If the environment variable is not set
    """
    value = os.environ.get(name)
    if not value:
        raise ValueError(
            f"Required environment variable '{name}' is not set. "
            f"Please set it in your .env file or environment. "
            f"See docs/SECURITY.md for setup instructions."
        )
    return value


def _parse_env_name(value: Optional[str]) -> EnvName:
    v = _normalize_env(value) or "local"
    if v in ("local", "development", "dev"):
        return "dev" if v in ("development", "dev") else "local"
    if v in ("prod", "production"):
        return "prod"
    # Unknown values fall back to local so production must set ENV=prod or ENVIRONMENT=production.
    return "local"


def _parse_storage_backend(value: Optional[str]) -> StorageBackend:
    v = _normalize_env(value) or "local"
    if v == "supabase":
        return "supabase"
    return "local"


def _parse_db_backend(value: Optional[str]) -> Optional[DbBackend]:
    v = _normalize_env(value)
    if not v:
        return None
    if v in ("sqlite", "supabase", "postgres"):
        return v  # type: ignore[return-value]
    return None


@dataclass(frozen=True)
class LocalPaths:
    """
    Filesystem paths used by the current implementation.

    Note: `storage_root` preserves the raw value of EXTENSION_STORAGE_PATH (may be relative).
    `results_dir` matches existing API behavior (absolute path via resolve()).
    """

    storage_root: Path
    results_dir: Path

    def ensure_dirs(self) -> None:
        self.results_dir.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Settings:
    # Environment
    env: EnvName

    # Backends: Postgres (Supabase) is primary for prod; SQLite is dev fallback
    storage_backend: StorageBackend
    db_backend: DbBackend

    # Local filesystem paths
    extension_storage_path: str
    database_path: str

    # Supabase (optional)
    supabase_url: Optional[str]
    supabase_key: Optional[str]
    supabase_scan_results_table: str
    supabase_jwks_url: Optional[str]
    supabase_jwt_aud: str

    # Admin API keys
    admin_api_key: Optional[str]
    telemetry_admin_key: Optional[str]

    # Upload and zip extract limits (DoS/zip-bomb protection)
    upload_max_bytes: int
    zip_extract_max_files: int
    zip_extract_max_uncompressed_bytes: int

    @property
    def paths(self) -> LocalPaths:
        storage_root = Path(self.extension_storage_path)
        results_dir = storage_root.resolve()
        return LocalPaths(storage_root=storage_root, results_dir=results_dir)

    def is_prod(self) -> bool:
        return self.env == "prod"

    def validate(self) -> None:
        """
        Validate required configuration for production.

        In non-prod environments we preserve the current "best-effort defaults" behavior.
        """

        if not self.is_prod():
            return

        # Require explicit storage path to avoid accidentally writing into CWD in prod.
        if os.environ.get("EXTENSION_STORAGE_PATH") is None:
            raise ValueError("Missing required env var EXTENSION_STORAGE_PATH for prod")

        if self.db_backend == "sqlite":
            if os.environ.get("DATABASE_PATH") is None:
                raise ValueError("Missing required env var DATABASE_PATH for prod (sqlite backend)")

        if self.db_backend == "supabase":
            if not self.supabase_url:
                raise ValueError("Missing required env var SUPABASE_URL for prod (supabase backend)")
            if not self.supabase_key:
                raise ValueError(
                    "Missing required env var SUPABASE_SERVICE_ROLE_KEY for prod (supabase backend). "
                    "Backend writes require service role key; anon key is frontend-only."
                )

        if self.db_backend == "postgres":
            # Not wired into the app yet; keep this explicit so prod can't silently misconfigure.
            raise ValueError("DB_BACKEND=postgres is not supported by the current codebase")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Load settings from env vars.

    Env vars recognized (current + forward-looking):
    - ENV / APP_ENV / EXTENSION_SHIELD_ENV: local|dev|prod
    - EXTENSION_STORAGE_PATH: local filesystem root for artifacts/backups
    - DATABASE_PATH: SQLite file path (dev fallback only; not used when Supabase)
    - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SCAN_RESULTS_TABLE
    - ADMIN_API_KEY, TELEMETRY_ADMIN_KEY (optional, for admin endpoints)
    - STORAGE_BACKEND: local|supabase (currently only local FS is used)
    - DB_BACKEND: sqlite|supabase (Postgres via Supabase; sqlite is dev fallback)
    - UPLOAD_MAX_BYTES: max accepted CRX/ZIP upload size before request rejection
    - ZIP_EXTRACT_MAX_FILES, ZIP_EXTRACT_MAX_UNCOMPRESSED_BYTES: zip-bomb protection
    """

    env = _parse_env_name(
        os.environ.get("EXTENSION_SHIELD_ENV")
        or os.environ.get("APP_ENV")
        or os.environ.get("ENV")
        or os.environ.get("ENVIRONMENT")
    )

    extension_storage_path = os.environ.get("EXTENSION_STORAGE_PATH", "extensions_storage")
    database_path = os.environ.get("DATABASE_PATH", "project-atlas.db")

    supabase_url = os.environ.get("SUPABASE_URL")
    # Only use service role key for backend writes (never anon key)
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    supabase_scan_results_table = os.environ.get("SUPABASE_SCAN_RESULTS_TABLE", "scan_results")
    supabase_jwt_aud = os.environ.get("SUPABASE_JWT_AUD", "authenticated")

    supabase_jwks_url: Optional[str] = None
    if supabase_url:
        base = supabase_url.rstrip("/")
        supabase_jwks_url = f"{base}/auth/v1/.well-known/jwks.json"

    # Admin API keys
    admin_api_key = os.environ.get("ADMIN_API_KEY")
    telemetry_admin_key = os.environ.get("TELEMETRY_ADMIN_KEY")

    # Upload and zip-bomb protection: reject large uploads before saving/analysis,
    # then bound extracted archive complexity separately.
    _upload_max_bytes = os.environ.get("UPLOAD_MAX_BYTES", str(DEFAULT_UPLOAD_MAX_BYTES))
    try:
        upload_max_bytes = int(_upload_max_bytes)
    except ValueError:
        upload_max_bytes = DEFAULT_UPLOAD_MAX_BYTES
    if upload_max_bytes <= 0:
        upload_max_bytes = DEFAULT_UPLOAD_MAX_BYTES

    _zip_max_files = os.environ.get("ZIP_EXTRACT_MAX_FILES", "10000")
    _zip_max_bytes = os.environ.get("ZIP_EXTRACT_MAX_UNCOMPRESSED_BYTES", "524288000")  # 500 MiB
    try:
        zip_extract_max_files = int(_zip_max_files)
    except ValueError:
        zip_extract_max_files = 10000
    try:
        zip_extract_max_uncompressed_bytes = int(_zip_max_bytes)
    except ValueError:
        zip_extract_max_uncompressed_bytes = 524288000

    storage_backend = _parse_storage_backend(os.environ.get("STORAGE_BACKEND"))

    explicit_db_backend = _parse_db_backend(os.environ.get("DB_BACKEND"))
    if explicit_db_backend:
        db_backend: DbBackend = explicit_db_backend
        # If explicitly set to supabase but service role key is missing, log warning and fall back to sqlite
        if db_backend == "supabase" and not supabase_key:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning(
                "DB_BACKEND=supabase but SUPABASE_SERVICE_ROLE_KEY is missing. "
                "Backend writes require service role key. Falling back to sqlite."
            )
            db_backend = "sqlite"
    else:
        # Auto-select based on environment:
        # - Production: Use Postgres (Supabase) if URL + key exist, else SQLite fallback
        # - Local/Dev: Prefer Supabase if configured (validate against prod); else SQLite
        if env == "prod":
            db_backend = "supabase" if (supabase_url and supabase_key) else "sqlite"
        else:
            # Local/Dev: use Supabase when configured for prod parity; else SQLite
            db_backend = "supabase" if (supabase_url and supabase_key) else "sqlite"

    settings = Settings(
        env=env,
        storage_backend=storage_backend,
        db_backend=db_backend,
        extension_storage_path=extension_storage_path,
        database_path=database_path,
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        supabase_scan_results_table=supabase_scan_results_table,
        supabase_jwks_url=supabase_jwks_url,
        supabase_jwt_aud=supabase_jwt_aud,
        admin_api_key=admin_api_key,
        telemetry_admin_key=telemetry_admin_key,
        upload_max_bytes=upload_max_bytes,
        zip_extract_max_files=zip_extract_max_files,
        zip_extract_max_uncompressed_bytes=zip_extract_max_uncompressed_bytes,
    )
    settings.validate()
    return settings


