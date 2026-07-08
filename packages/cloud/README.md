# Cloud (Proprietary — Gated)

This directory documents **cloud-only** components. The actual code lives in the main tree and is **gated by `EXTSHIELD_MODE`** and feature flags; when `EXTSHIELD_MODE=oss` (default), cloud-only routes return **HTTP 501** and no cloud code runs.

## What is Cloud (Proprietary)

- **Supabase service logic**: Auth (JWT verification), Supabase-backed storage adapter, multi-tenant persistence.
- **Cloud-only API routes**: History, user karma, telemetry summary, diagnostic scans, delete scan, clear all, community review queue, enterprise/careers forms.
- **Scripts**: cloud-only migration runner and destructive/admin operations — proprietary, **not included in the OSS distribution** (used only when Cloud is enabled).

Implementation locations:

- `../src/extension_shield/api/supabase_auth.py` — Supabase JWT verification.
- `../src/extension_shield/api/database.py` — `SupabaseDatabase` class (used only when `DB_BACKEND=supabase`).
- `../src/extension_shield/api/main.py` — Cloud-only routes use `require_cloud_dep("feature_name")`; they return 501 in OSS mode.
- Supabase migrations and cloud-only admin scripts are proprietary and are not part of this OSS repository.

**Enforcement**: All cloud-only routes declare `dependencies=[require_cloud_dep("...")]` so the guard runs before any handler; in OSS mode no Supabase calls are made. See [OPEN_CORE_BOUNDARIES.md](../../docs/OPEN_CORE_BOUNDARIES.md).
