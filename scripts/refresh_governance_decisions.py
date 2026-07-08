"""Refresh stale governance final verdicts in local persistence (SQLite + files).

The governance final_verdict (summary.governance_bundle.decision.final_verdict)
is versioned by decision_version. When decision logic changes (a rulepack
verdict, advisory semantics, or the resolve() precedence), previously-persisted
rows/files keep serving their old verdict — /api/scan/trigger returns the cached
row without refreshing it. The API self-heals on read, but this script rewrites
the stored copies so every local persistence layer reflects current decision
logic (no stale flat JSON left behind).

Deterministic and network-free: it re-runs the CURRENT rulepacks + Decision
Authority on each row/file's already-persisted bundle inputs. No re-download.

Usage:
    uv run python scripts/refresh_governance_decisions.py            # dry-run
    uv run python scripts/refresh_governance_decisions.py --apply    # write

Honors DATABASE_PATH (default ExtensionShield.db). SQLite (local) only. Also
refreshes RESULTS_DIR/*_results.json (the file fallback) unless --no-files.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import sqlite3
import sys

from extension_shield.governance.decision_refresh import (
    DECISION_VERSION,
    recompute_final_decision,
)


def _insufficient(container: dict, decision: dict) -> bool:
    top_sv2 = container.get("scoring_v2") or {}
    return bool(top_sv2.get("insufficient_data", False)) or bool(
        decision.get("insufficient_data", False)
    )


def _refresh_container(container: dict, scan_id: str):
    """Mutate container['governance_bundle']['decision'] in place.

    Returns (prev_verdict, new_verdict, refreshed_dict) or None when the bundle
    lacks the inputs to recompute (leave the stored verdict untouched).
    """
    gb = container.get("governance_bundle")
    if not isinstance(gb, dict) or not isinstance(gb.get("decision"), dict):
        return None
    decision = gb["decision"]
    prev = decision.get("final_verdict")
    refreshed = recompute_final_decision(
        gb, insufficient_data=_insufficient(container, decision), scan_id=scan_id
    )
    if not refreshed:
        return None
    decision.update(refreshed)
    return prev, refreshed["final_verdict"], refreshed


def _refresh_db(db_path: str, apply: bool) -> int:
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    rows = con.execute("SELECT id, extension_name, summary FROM scan_results ORDER BY id").fetchall()
    changed = 0
    print(f"== SQLite: {db_path} ({len(rows)} rows) ==")
    for r in rows:
        if not r["summary"]:
            continue
        try:
            summary = json.loads(r["summary"])
        except (TypeError, ValueError):
            continue
        res = _refresh_container(summary, str(r["id"]))
        if res is None:
            print(f"  [skip]    id={r['id']:>4} {r['extension_name'][:32]:32} (insufficient bundle inputs)")
            continue
        prev, now, refreshed = res
        changed += 1 if now != prev else 0
        print(f"  [{'CHANGED' if now != prev else 'same   '}] id={r['id']:>4} "
              f"{r['extension_name'][:32]:32} {str(prev):12} -> {now:12} ({refreshed['final_authority']})")
        if apply:
            con.execute(
                "UPDATE scan_results SET summary=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
                (json.dumps(summary), r["id"]),
            )
    if apply:
        con.commit()
    con.close()
    return changed


def _refresh_files(results_dir: str, apply: bool) -> int:
    files = sorted(glob.glob(os.path.join(results_dir, "*_results.json")))
    changed = 0
    print(f"== Files: {results_dir} ({len(files)} *_results.json) ==")
    for p in files:
        try:
            payload = json.load(open(p))
        except (OSError, ValueError):
            continue
        res = _refresh_container(payload, os.path.basename(p))
        if res is None:
            print(f"  [skip]    {os.path.basename(p)[:24]:26} (insufficient bundle inputs)")
            continue
        prev, now, refreshed = res
        changed += 1 if now != prev else 0
        print(f"  [{'CHANGED' if now != prev else 'same   '}] {os.path.basename(p)[:24]:26} "
              f"{str(prev):12} -> {now:12} ({refreshed['final_authority']})")
        if apply:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes (default: dry-run)")
    parser.add_argument("--db", default=os.getenv("DATABASE_PATH", "ExtensionShield.db"))
    parser.add_argument("--no-files", action="store_true", help="skip RESULTS_DIR flat files")
    args = parser.parse_args()

    total = 0
    if os.path.exists(args.db):
        total += _refresh_db(args.db, args.apply)
    else:
        print(f"DB not found (skipping): {args.db}", file=sys.stderr)

    if not args.no_files:
        try:
            from extension_shield.core.config import get_settings
            results_dir = str(get_settings().paths.results_dir)
            if os.path.isdir(results_dir):
                total += _refresh_files(results_dir, args.apply)
        except Exception as exc:  # pragma: no cover - defensive
            print(f"Could not resolve RESULTS_DIR (skipping files): {exc}", file=sys.stderr)

    if args.apply:
        print(f"\nApplied. {total} verdict(s) changed; decision_version -> {DECISION_VERSION}.")
    else:
        print(f"\nDry-run. {total} verdict(s) would change. Re-run with --apply to write.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
