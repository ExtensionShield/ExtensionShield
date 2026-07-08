# Scripts

Use these when you need to run something outside the usual `make` targets.
Prefer **Make** when possible: `make api`, `make frontend`, `make test`, etc.

## How to run (Make)

| What you want | Command |
|---------------|---------|
| Start API | `make api` |
| Start frontend | `make frontend` |
| Run tests | `make test` |
| Check accidental secrets | `make secrets-check` |

---

## What each script does

**Start**

- **start_api.sh** - Starts the API. You can run `make api` instead for local dev.

**Security**

- **security_smoke.sh** - Quick security checks. Run by hand when you want a sanity check.

**Diagnostics**

- **check_local_db_backend.py** - Reports whether the API is using SQLite or Supabase and where scan data is stored.
- **verify_openai_api.py** - Validates `OPENAI_API_KEY` format and connectivity with a minimal OpenAI call.
- **refresh_governance_decisions.py** - Refreshes local persisted governance decisions after scoring/governance logic changes. Dry-run by default; pass `--apply` to write.

## Running scripts directly

Start API:

```bash
./scripts/start_api.sh
```

Check the local DB backend:

```bash
uv run python scripts/check_local_db_backend.py
```

Verify OpenAI API access:

```bash
uv run python scripts/verify_openai_api.py
```
