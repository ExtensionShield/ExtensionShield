"""Golden-fixture → SignalPack extraction utility for corpus labeling.

Converts existing ``tests/fixtures/*_results.json`` scan-OUTPUT payloads into
corpus-compatible ``inputs.signal_pack`` entries (the PR #274 schema), so real
scans can seed a labeled corpus. See ``docs/scoring/corpus_inventory.md``.

Design contract
---------------
* **Reuse production assembly, do not hand-roll.** The SignalPack is built by the
  same ``SignalPackBuilder`` the real pipeline uses
  (``extension_shield.governance.tool_adapters``), fed a reconstructed
  ``analysis_results`` dict. We do NOT re-implement the analyzer→sub-pack mapping,
  so the extracted pack matches what production would build. The only fixups are
  key names the adapters expect: identity for most sections, plus
  ``sast_results`` → ``javascript_analysis`` (what ``SastAdapter`` reads).
* **Fully offline.** ``build()`` is a pure dict→SignalPack transform — no scans,
  network, or DB. This module only reads local JSON and imports local code.
* **Never invents labels.** ``label`` defaults to ``"unknown"`` and
  ``expected_verdict`` to ``null`` unless a human passes one explicitly. The
  fixture's ``governance_verdict``/``overall_*`` are ENGINE OUTPUTS, never treated
  as ground truth (recorded only under a clearly-marked, non-authoritative field).
* **Best-effort reconstruction.** Re-scoring an extracted pack may NOT reproduce
  the fixture's stored score (fixtures may predate the current engine/normalizer;
  the persisted results view is not guaranteed identical to the raw
  ``analysis_results``). These entries are for LABELING, not score reproduction.
* **Tool-only PR.** This utility does not commit extracted real-extension corpus
  entries — output defaults to stdout; ``--output`` writes to a caller-specified
  path and refuses to write into the committed corpus dir. Committing labeled
  real-extension data is a separate, human-reviewed step.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.governance.tool_adapters import SignalPackBuilder
from scripts.scoring.compare_scoring_corpus import CorpusError, validate_entry

# Fixture analyzer-section keys that the adapters read from ``analysis_results``
# under the SAME name (identity mapping).
_IDENTITY_KEYS: Tuple[str, ...] = (
    "virustotal_analysis",
    "entropy_analysis",
    "webstore_analysis",
    "permissions_analysis",
    "chromestats_analysis",
    "network_analysis",
)
# Fixture key -> analysis_results key the adapter expects (non-identity fixups).
# SAST is persisted as ``sast_results`` but ``SastAdapter`` reads
# ``javascript_analysis`` (verified in tool_adapters.py:SastAdapter.adapt).
_REMAP: Dict[str, str] = {"sast_results": "javascript_analysis"}

# Engine OUTPUT fields that must NEVER be used as a human label. Recorded (some
# of them) only under entry["extraction"]["engine_outputs_not_ground_truth"].
_OUTPUT_ONLY_FIELDS: Tuple[str, ...] = (
    "governance_verdict",
    "governance_bundle",
    "governance_report",
    "overall_risk",
    "overall_security_score",
    "risk_distribution",
    "total_risk_score",
    "summary",
)


def reconstruct_analysis_results(
    fixture: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str]]:
    """Rebuild the ``analysis_results`` dict the adapters consume from a fixture.

    Returns (analysis_results, used_keys) where used_keys records what was mapped
    (for the extraction audit trail).
    """
    analysis_results: Dict[str, Any] = {}
    used: List[str] = []
    for key in _IDENTITY_KEYS:
        if fixture.get(key) is not None:
            analysis_results[key] = fixture[key]
            used.append(key)
    for src, dst in _REMAP.items():
        if fixture.get(src) is not None:
            analysis_results[dst] = fixture[src]
            used.append(f"{src}->{dst}")
    return analysis_results, used


def _coverage_warnings(fixture: Dict[str, Any], pack: SignalPack) -> List[str]:
    """Flag sections where the fixture HAD data but the built sub-pack is empty.

    A warning means the reconstruction likely lost data (a key mismatch) — the
    opposite of silent loss. Sections the fixture simply lacks are not warned.
    """
    warns: List[str] = []

    sast_findings = (fixture.get("sast_results") or {}).get("sast_findings") or {}
    had_sast = (
        any(bool(v) for v in sast_findings.values())
        if isinstance(sast_findings, dict)
        else bool(sast_findings)
    )
    if had_sast and not pack.sast.deduped_findings and not pack.sast.raw_findings:
        warns.append("sast: fixture had findings but built SAST pack is empty")

    if fixture.get("virustotal_analysis") and not pack.virustotal.enabled:
        warns.append("virustotal: fixture had data but built VT pack is disabled")

    if fixture.get("entropy_analysis") and pack.entropy.files_analyzed == 0:
        warns.append("entropy: fixture had data but files_analyzed=0")

    if fixture.get("permissions_analysis") and (
        pack.permissions.total_permissions == 0
        and not pack.permissions.api_permissions
        and not pack.permissions.host_permissions
    ):
        warns.append("permissions: fixture had data but built permissions pack is empty")

    return warns


def extract_entry(
    fixture: Dict[str, Any],
    *,
    source_path: str = "",
    expected_verdict: Optional[str] = None,
) -> Tuple[Dict[str, Any], List[str]]:
    """Build one corpus entry from a golden fixture. Returns (entry, warnings).

    Raises CorpusError if the fixture lacks an extension_id or the produced entry
    fails schema/SignalPack validation.
    """
    ext_id = fixture.get("extension_id")
    if not ext_id or not isinstance(ext_id, str):
        raise CorpusError(f"fixture {source_path or '<unknown>'} has no usable extension_id")

    analysis_results, used_keys = reconstruct_analysis_results(fixture)
    pack = SignalPackBuilder().build(
        scan_id=ext_id,
        analysis_results=analysis_results,
        metadata=fixture.get("metadata") or {},
        manifest=fixture.get("manifest") or {},
        extension_id=ext_id,
    )
    warns = _coverage_warnings(fixture, pack)

    metadata = fixture.get("metadata") or {}
    user_count = metadata.get("user_count") or metadata.get("users")

    entry: Dict[str, Any] = {
        "id": f"golden-{ext_id}",
        "name": fixture.get("extension_name") or ext_id,
        "label": "unknown",  # never inferred from engine output
        "expected_verdict": expected_verdict,  # None unless a human passed one
        "confidence": None,
        "source_type": "real_scan",
        "rationale": (
            "Extracted from a committed golden scan-output fixture via the "
            "production SignalPackBuilder. Best-effort reconstruction for future "
            "human labeling; NOT evidence-backed and NOT a score-reproduction guarantee."
        ),
        "tags": ["extracted", "real_scan", "needs_labeling"],
        "known_signals": [],
        "notes": (
            "Auto-extracted; label='unknown' until a human reviews the evidence. "
            "engine outputs are recorded under 'extraction' but are NOT ground truth."
        ),
        "extraction": {
            "source_fixture": source_path,
            "reconstruction_used_keys": used_keys,
            "coverage_warnings": warns,
            "engine_outputs_not_ground_truth": {
                k: fixture[k] for k in ("governance_verdict",) if k in fixture
            },
        },
        "inputs": {
            "signal_pack": pack.model_dump(mode="json"),
            "manifest": fixture.get("manifest"),
            "user_count": user_count,
            "permissions_analysis": None,
        },
    }

    # Validate against the #274 schema and the SignalPack model before emitting.
    validate_entry(entry)
    SignalPack.model_validate(entry["inputs"]["signal_pack"])
    return entry, warns


def extract_entries(
    fixture_paths: List[str],
    *,
    expected_verdict: Optional[str] = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Extract entries for multiple fixture paths. Returns (entries, all_warnings)."""
    entries: List[Dict[str, Any]] = []
    all_warns: List[str] = []
    for path in fixture_paths:
        fixture = json.loads(Path(path).read_text(encoding="utf-8"))
        entry, warns = extract_entry(fixture, source_path=path, expected_verdict=expected_verdict)
        entries.append(entry)
        all_warns.extend(f"[{path}] {w}" for w in warns)
    return entries, all_warns


_CORPUS_DIR_GUARD = "tests/fixtures/scoring_corpus"


def _is_within_corpus_dir(out: Path) -> bool:
    """True if ``out`` resolves inside the committed corpus dir.

    Uses the RESOLVED, absolute path so cwd-relative paths, ``..`` traversal, and
    symlinks cannot slip a write into ``tests/fixtures/scoring_corpus/`` (a plain
    substring check on the raw path is bypassable — e.g. ``--output out.json`` run
    from inside that directory).
    """
    resolved = out.resolve()
    try:
        repo_root = Path(__file__).resolve().parents[2]
        corpus_dir = (repo_root / _CORPUS_DIR_GUARD).resolve()
        if resolved == corpus_dir or resolved.is_relative_to(corpus_dir):
            return True
    except (IndexError, OSError, ValueError):
        pass
    # Fallback: substring on the normalized/absolute path (still catches the dir
    # even if the repo layout differs from the expected scripts/scoring/ anchor).
    return _CORPUS_DIR_GUARD in resolved.as_posix()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract corpus signal_pack entries from golden scan-output fixtures "
            "(fully offline; reuses the production SignalPackBuilder). Defaults to "
            "stdout dry-run; does not commit real-extension corpus data."
        )
    )
    parser.add_argument("fixtures", nargs="+", help="Path(s) to *_results.json golden fixtures.")
    parser.add_argument(
        "--output",
        default=None,
        help=(
            "Write the corpus JSON array to this path. Default: stdout (dry-run). "
            f"Refuses to write into {_CORPUS_DIR_GUARD}/ (committing real-extension "
            "corpus is a separate, human-reviewed step)."
        ),
    )
    parser.add_argument(
        "--expected-verdict",
        default=None,
        choices=("ALLOW", "NEEDS_REVIEW", "BLOCK"),
        help="Optional human-provided expected_verdict for all entries (default: null).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    entries, warns = extract_entries(args.fixtures, expected_verdict=args.expected_verdict)
    for w in warns:
        print(f"WARN {w}", file=sys.stderr)
    payload = json.dumps(entries, indent=2)
    if args.output:
        out = Path(args.output)
        if _is_within_corpus_dir(out):
            raise SystemExit(
                f"Refusing to write into {_CORPUS_DIR_GUARD}/ — committing extracted "
                "real-extension corpus entries is deferred to a human-reviewed labeling PR."
            )
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"Wrote {len(entries)} entrie(s) to {out}", file=sys.stderr)
    else:
        print(payload)
    print(f"extracted={len(entries)} warnings={len(warns)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
