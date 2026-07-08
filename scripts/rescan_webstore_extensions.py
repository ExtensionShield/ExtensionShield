"""Nightly rescan rotation for public web-store extensions (Railway cron).

Re-runs the full deep-scan workflow for already-scanned public web-store
extensions, **oldest-scanned first**, sequentially with pacing. It calls the scan
pipeline directly (``run_analysis_workflow``) instead of the HTTP endpoint, so it
bypasses the per-IP (6/min) and daily deep-scan rate limits entirely and writes
straight to the same database the app reads (Supabase in prod, SQLite locally).

Sustainable by design — it does NOT re-scan the whole corpus every night:
  * only extensions last scanned before ``--older-than-days`` are eligible, and
  * the run stops at ``--limit`` scans or ``--max-minutes``, whichever comes first.
Uploads / private scans are skipped automatically (get_recent_scans returns only
public web-store rows).

Usage (local):
    uv run python scripts/rescan_webstore_extensions.py --dry-run
    uv run python scripts/rescan_webstore_extensions.py --older-than-days 7 --limit 50 --sleep 20

One-time full sweep (re-scan everything, e.g. after a scoring change):
    uv run python scripts/rescan_webstore_extensions.py --older-than-days 0 --limit 100000 --max-minutes 480

Every flag has an env-var override so a Railway cron can be configured with variables:
    RESCAN_OLDER_THAN_DAYS, RESCAN_LIMIT, RESCAN_SLEEP_SECONDS, RESCAN_MAX_MINUTES,
    RESCAN_PER_SCAN_TIMEOUT_SECONDS, RESCAN_FETCH, RESCAN_DRY_RUN
"""
from __future__ import annotations

import argparse
import asyncio
import os
import time
from datetime import datetime, timedelta, timezone

# Importing the API module gives us the shared DB adapter and the canonical
# scan+persist pipeline — the same one /api/scan/trigger runs in the background.
from extension_shield.api.main import db, run_analysis_workflow


def _parse_iso(value):
    if not value or not isinstance(value, str):
        return None
    try:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _store_url(row):
    """Prefer the stored listing URL; otherwise build the canonical store URL."""
    url = (row.get("url") or "").strip()
    if url.startswith("http") and ("chromewebstore.google.com/detail" in url or "chrome.google.com/webstore" in url):
        return url
    ext_id = row.get("extension_id")
    return f"https://chromewebstore.google.com/detail/_/{ext_id}" if ext_id else None


_EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _eligible(rows, older_than):
    """Public web-store rows last scanned before `older_than`, oldest-scanned first.

    (get_recent_scans already filters out uploads/private, so no source check here.)
    """
    out = []
    for r in rows:
        ext_id = r.get("extension_id")
        if not ext_id:
            continue
        scanned = _parse_iso(r.get("timestamp")) or _parse_iso(r.get("scanned_at"))
        if older_than is not None and scanned is not None and scanned >= older_than:
            continue  # scanned recently enough — skip
        out.append((scanned or _EPOCH, ext_id, _store_url(r), r.get("extension_name") or ext_id))
    out.sort(key=lambda t: t[0])  # oldest first
    return out


async def _run(args):
    older_than = None
    if args.older_than_days and args.older_than_days > 0:
        older_than = datetime.now(timezone.utc) - timedelta(days=args.older_than_days)

    rows = db.get_recent_scans(limit=args.fetch)
    candidates = _eligible(rows, older_than)
    print(
        f"[rescan] fetched={len(rows)} eligible={len(candidates)} "
        f"older_than_days={args.older_than_days} limit={args.limit} "
        f"max_minutes={args.max_minutes} sleep={args.sleep}s dry_run={args.dry_run}",
        flush=True,
    )

    if args.dry_run:
        for scanned, ext_id, url, name in candidates[: args.limit]:
            print(f"  [dry] {str(name)[:40]:40} {ext_id}  last_scanned={scanned.isoformat()}", flush=True)
        print(f"[rescan] dry-run: would rescan {min(len(candidates), args.limit)} extension(s).", flush=True)
        return 0

    deadline = (time.monotonic() + args.max_minutes * 60) if args.max_minutes > 0 else None
    attempted = failed = 0
    for scanned, ext_id, url, name in candidates:
        if attempted >= args.limit:
            print(f"[rescan] limit {args.limit} reached — stopping.", flush=True)
            break
        if deadline and time.monotonic() >= deadline:
            print(f"[rescan] time budget {args.max_minutes}m reached — stopping.", flush=True)
            break
        if not url:
            print(f"  [skip] {ext_id} — no store URL", flush=True)
            continue

        attempted += 1
        print(f"[rescan] ({attempted}) {str(name)[:44]} {ext_id} …", flush=True)
        t0 = time.monotonic()
        try:
            await asyncio.wait_for(run_analysis_workflow(url, ext_id), timeout=args.per_scan_timeout)
            print(f"         ok in {time.monotonic() - t0:.0f}s", flush=True)
        except asyncio.TimeoutError:
            failed += 1
            print(f"         TIMEOUT after {args.per_scan_timeout}s", flush=True)
        except Exception as exc:  # one bad extension must not kill the run
            failed += 1
            print(f"         ERROR: {exc}", flush=True)

        if args.sleep > 0:
            await asyncio.sleep(args.sleep)

    print(f"[rescan] done: attempted={attempted} failed_or_timed_out={failed}", flush=True)
    return 0


def _int_env(name, default):
    try:
        return int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default


def main():
    p = argparse.ArgumentParser(description="Nightly rescan rotation for web-store extensions.")
    p.add_argument("--older-than-days", type=int, default=_int_env("RESCAN_OLDER_THAN_DAYS", 7),
                   help="Only rescan extensions last scanned more than N days ago. 0 = no age filter (all).")
    p.add_argument("--limit", type=int, default=_int_env("RESCAN_LIMIT", 50),
                   help="Max extensions to rescan this run.")
    p.add_argument("--sleep", type=int, default=_int_env("RESCAN_SLEEP_SECONDS", 20),
                   help="Seconds to wait between scans (bounds external API usage).")
    p.add_argument("--max-minutes", type=int, default=_int_env("RESCAN_MAX_MINUTES", 240),
                   help="Wall-clock budget for the run. 0 = no time cap.")
    p.add_argument("--per-scan-timeout", type=int, default=_int_env("RESCAN_PER_SCAN_TIMEOUT_SECONDS", 600),
                   help="Abort a single scan after this many seconds and move on.")
    p.add_argument("--fetch", type=int, default=_int_env("RESCAN_FETCH", 5000),
                   help="How many recent rows to pull for the candidate list.")
    p.add_argument("--dry-run", action="store_true",
                   default=(os.getenv("RESCAN_DRY_RUN", "").lower() in ("1", "true", "yes")),
                   help="List what would be rescanned without scanning.")
    args = p.parse_args()
    return asyncio.run(_run(args))


if __name__ == "__main__":
    raise SystemExit(main())
