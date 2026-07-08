# Nightly re-scan cron (Railway)

`scripts/rescan_webstore_extensions.py` re-runs the full deep-scan workflow for
already-scanned **public web-store** extensions, oldest-scanned first, one at a
time. It calls the scan pipeline directly (not the HTTP API), so it **bypasses
the 6/min per-IP and daily deep-scan limits** and writes straight to the same
database the app reads.

It rotates through the corpus instead of re-scanning everything each night:
only extensions last scanned before `--older-than-days` are eligible, and the run
stops at `--limit` scans or `--max-minutes` — whichever comes first.

## Railway setup (dashboard)

Add a **separate cron service** — do **not** put a cron schedule on the web
service (that would stop it serving traffic).

1. Railway project → **New → GitHub Repo** → pick this repo (same repo as the API).
2. In the new service’s **Settings**:
   - **Custom Start Command:** `python scripts/rescan_webstore_extensions.py`
     (use `uv run python scripts/rescan_webstore_extensions.py` if the image uses uv)
   - **Cron Schedule:** e.g. `0 8 * * *` — **UTC**. Pick your bedtime in UTC
     (midnight PT = `0 8 * * *`, midnight ET = `0 5 * * *`).
   - **Restart Policy:** Never (a cron job runs once and exits).
3. **Variables:** give it the *same* backend env as the API service — Supabase
   (`SUPABASE_URL`, `SUPABASE_*_KEY`, `DB_BACKEND`), the LLM keys, VirusTotal keys,
   and any ChromeStats/downloader config. Easiest: add them as **project shared
   variables** and reference them from both services.

That's it — Railway runs the script on the schedule and the process exits when done.

## Tuning (env vars — all optional, sensible defaults)

| Variable | Default | Meaning |
|---|---|---|
| `RESCAN_OLDER_THAN_DAYS` | `7` | Only rescan extensions last scanned > N days ago. `0` = all. |
| `RESCAN_LIMIT` | `50` | Max extensions per run. |
| `RESCAN_SLEEP_SECONDS` | `20` | Gap between scans (bounds VirusTotal / LLM usage). |
| `RESCAN_MAX_MINUTES` | `240` | Wall-clock budget for the run (`0` = no cap). |
| `RESCAN_PER_SCAN_TIMEOUT_SECONDS` | `600` | Abort one hung scan and move on. |
| `RESCAN_DRY_RUN` | `` | `1`/`true` to list candidates without scanning. |

## First, test it

```bash
# List what it would do — no scanning, no API cost:
uv run python scripts/rescan_webstore_extensions.py --older-than-days 0 --dry-run

# Re-scan a few for real:
uv run python scripts/rescan_webstore_extensions.py --older-than-days 0 --limit 3 --sleep 20
```

## One-time full sweep

To re-scan the entire corpus once (e.g. after a scoring change), run with no age
filter and generous budgets — as a manual `railway run` or a temporary schedule:

```bash
uv run python scripts/rescan_webstore_extensions.py --older-than-days 0 --limit 100000 --max-minutes 480
```

## Notes

- **Cost:** each scan re-downloads the CRX and runs SAST + VirusTotal + the LLM
  governance pass. Keep `RESCAN_LIMIT` / `RESCAN_MAX_MINUTES` sane and watch your
  VirusTotal quota; raise `RESCAN_SLEEP_SECONDS` to spread usage.
- **Failures** (delisted/unfetchable) preserve the previous good report — the
  workflow never overwrites a good scan with a failed placeholder.
- Uploads / private scans are skipped automatically.
