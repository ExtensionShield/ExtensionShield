#!/usr/bin/env python3
"""
Report which database the API uses when you run `make api` (and optionally `make frontend`).

Loads .env from project root (same as the API), then prints:
  - DB backend: sqlite | supabase
  - Where the API stores scan data (file path or Supabase)

Run from project root: uv run python scripts/check_local_db_backend.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if (PROJECT_ROOT / ".env").exists():
    import dotenv
    dotenv.load_dotenv(PROJECT_ROOT / ".env")

sys.path.insert(0, str(PROJECT_ROOT / "src"))

def main():
    from extension_shield.core.config import get_settings
    from extension_shield.utils.mode import get_feature_flags
    settings = get_settings()
    flags = get_feature_flags()
    print("=== Local API / Frontend — Database Backend ===\n")
    print(f"  EXTSHIELD_MODE: {flags.mode}")
    print(f"  DB_BACKEND:    {os.environ.get('DB_BACKEND', '(not set → sqlite)')}")
    print(f"  Resolved:       {settings.db_backend}\n")
    if settings.db_backend == "supabase":
        url = (settings.supabase_url or "")[:50]
        print(f"  ✓ API uses Supabase ({url}...)")
        print("  Scan results are stored in your Supabase project (same as production if same project).\n")
    else:
        path = getattr(settings, "database_path", "ExtensionShield.db")
        abs_path = Path(path).resolve() if path else Path("ExtensionShield.db").resolve()
        print(f"  ✓ API uses SQLite")
        print(f"  Scan results file: {abs_path}\n")
    print("  Frontend does not connect to the DB; it talks to the API (VITE_API_URL or proxy to :8007).")
    print("  So: Frontend → API → " + ("Supabase" if settings.db_backend == "supabase" else "SQLite") + "\n")

if __name__ == "__main__":
    main()
