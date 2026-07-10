"""Offline before/after scoring comparison harness.

Purpose
-------
Unblock future weight/layer work (PR-4/PR-5) by providing a way to measure how a
scoring change moves scores and verdicts across a labeled corpus, *before* it
ships. It loads a corpus of SignalPack-shaped INPUTS, recomputes scores under a
baseline and a candidate weight preset, and emits a diff report.

Design contract
---------------
* **Inputs, not outputs.** Each corpus entry stores the inputs to
  ``ScoringEngine.calculate_scores`` (a ``signal_pack`` plus optional
  ``manifest`` / ``user_count`` / ``permissions_analysis``), never a pre-scored
  ``ScoringResult``. This is what lets us recompute under a *different* model.
  Golden snapshots are frozen outputs and cannot serve this role.
* **Fully offline.** Only local imports (``ScoringEngine``, ``SignalPack``) and
  local JSON reads. No network, no scans, no database, no external services.
* **Deterministic diff.** Non-deterministic result fields (``created_at`` and
  anything else that varies per run) are excluded, so an identity comparison
  (same preset on both sides) yields an exact zero diff.
* **No labels asserted.** The corpus ``label`` / ``expected_verdict`` fields are
  advisory human ground-truth for future calibration. This harness only reports
  the delta between two engine runs; it never asserts the engine agrees with a
  label.

This module is import-safe (pure functions) and runnable as a CLI. It must not
import from ``tests/``.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.models import ScoringResult

# --- schema -----------------------------------------------------------------

REQUIRED_FIELDS: Tuple[str, ...] = ("id", "name", "label", "inputs")
VALID_LABELS = {"benign", "malicious", "needs_review", "low_confidence", "unknown"}
VALID_VERDICTS = {"ALLOW", "NEEDS_REVIEW", "BLOCK"}

# Result fields intentionally excluded from the diff because they vary per run.
# Keeping this list explicit is what makes identity-mode a true zero diff.
NON_DETERMINISTIC_FIELDS: Tuple[str, ...] = ("created_at",)

DEFAULT_OUTPUT_DIR = "scoring_reports"  # git-ignored; generated reports are not committed
DEFAULT_BASELINE = "v1"
DEFAULT_CANDIDATE = "v1"

# Verdict flips that always require explicit human sign-off before shipping.
REVIEW_REQUIRED_FLIPS = {"ALLOW<->BLOCK"}


class CorpusError(ValueError):
    """Raised when a corpus file or entry is malformed."""


# --- loading & validation ---------------------------------------------------


def load_corpus(path: Any) -> List[Dict[str, Any]]:
    """Load and validate a corpus JSON file.

    Accepts either a top-level JSON array of entries or an object with an
    ``entries`` array. Raises ``CorpusError`` on any structural problem.
    """
    p = Path(path)
    with p.open("r", encoding="utf-8") as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("entries", data)
    if not isinstance(data, list):
        raise CorpusError(
            f"Corpus at {p} must be a JSON array or an object with an 'entries' array."
        )
    validate_corpus(data)
    return data


def validate_entry(entry: Any, index: Optional[int] = None) -> None:
    """Validate a single corpus entry, including that its signal_pack parses."""
    where = f"entry[{index}]" if index is not None else "entry"
    if not isinstance(entry, dict):
        raise CorpusError(f"{where} must be a JSON object.")
    for field in REQUIRED_FIELDS:
        if field not in entry:
            raise CorpusError(f"{where} is missing required field '{field}'.")
    if not isinstance(entry["id"], str) or not entry["id"]:
        raise CorpusError(f"{where} 'id' must be a non-empty string.")
    if not isinstance(entry["name"], str):
        raise CorpusError(f"{where} 'name' must be a string.")
    label = entry["label"]
    if label not in VALID_LABELS:
        raise CorpusError(
            f"{where} has invalid label {label!r}; expected one of {sorted(VALID_LABELS)}."
        )
    expected = entry.get("expected_verdict")
    if expected is not None and expected not in VALID_VERDICTS:
        raise CorpusError(
            f"{where} has invalid expected_verdict {expected!r}; "
            f"expected one of {sorted(VALID_VERDICTS)} or null."
        )
    inputs = entry["inputs"]
    if not isinstance(inputs, dict) or "signal_pack" not in inputs:
        raise CorpusError(f"{where} 'inputs' must be an object containing 'signal_pack'.")
    # Confirm the signal_pack input actually deserializes into a SignalPack.
    build_inputs(entry)


def validate_corpus(corpus: Any) -> None:
    """Validate an entire corpus: each entry, plus id uniqueness."""
    if not isinstance(corpus, list):
        raise CorpusError("Corpus must be a list of entries.")
    seen_ids: set = set()
    for i, entry in enumerate(corpus):
        validate_entry(entry, i)
        entry_id = entry["id"]
        if entry_id in seen_ids:
            raise CorpusError(f"Duplicate entry id {entry_id!r}.")
        seen_ids.add(entry_id)


def build_inputs(
    entry: Dict[str, Any],
) -> Tuple[SignalPack, Optional[Dict[str, Any]], Optional[int], Optional[Dict[str, Any]]]:
    """Deserialize a corpus entry's ``inputs`` into calculate_scores arguments."""
    inputs = entry["inputs"]
    try:
        pack = SignalPack.model_validate(inputs["signal_pack"])
    except Exception as exc:  # pydantic ValidationError or malformed dict
        raise CorpusError(
            f"entry {entry.get('id')!r} signal_pack failed SignalPack validation: {exc}"
        ) from exc
    manifest = inputs.get("manifest")
    user_count = inputs.get("user_count")
    permissions_analysis = inputs.get("permissions_analysis")
    return pack, manifest, user_count, permissions_analysis


# --- scoring & diffing ------------------------------------------------------


def _score_snapshot(result: ScoringResult) -> Dict[str, Any]:
    """Project a ScoringResult into a deterministic dict for diffing.

    Excludes ``created_at`` (and anything else in NON_DETERMINISTIC_FIELDS by
    construction: only the fields listed below are read).
    """

    def layer(layer_score: Any) -> Optional[Dict[str, Any]]:
        if layer_score is None:
            return None
        return {
            "score": layer_score.score,
            "factors": {
                f.name: {
                    "severity": round(f.severity, 6),
                    "weight": round(f.weight, 6),
                    "confidence": round(f.confidence, 6),
                    "contribution": round(f.contribution, 6),
                }
                for f in layer_score.factors
            },
        }

    return {
        "overall_score": result.overall_score,
        "security_score": result.security_score,
        "privacy_score": result.privacy_score,
        "governance_score": result.governance_score,
        "verdict": result.decision.value,
        "layers": {
            "security": layer(result.security_layer),
            "privacy": layer(result.privacy_layer),
            "governance": layer(result.governance_layer),
        },
    }


def score_entry(entry: Dict[str, Any], weights_version: str = DEFAULT_BASELINE) -> Dict[str, Any]:
    """Recompute scores for one corpus entry under ``weights_version`` (offline)."""
    pack, manifest, user_count, permissions_analysis = build_inputs(entry)
    engine = ScoringEngine(weights_version=weights_version)
    result = engine.calculate_scores(
        pack,
        manifest=manifest,
        user_count=user_count,
        permissions_analysis=permissions_analysis,
    )
    return _score_snapshot(result)


def flip_type(baseline_verdict: str, candidate_verdict: str) -> Optional[str]:
    """Classify a verdict change; None if unchanged."""
    if baseline_verdict == candidate_verdict:
        return None
    pair = {baseline_verdict, candidate_verdict}
    if pair == {"ALLOW", "BLOCK"}:
        return "ALLOW<->BLOCK"
    if pair == {"ALLOW", "NEEDS_REVIEW"}:
        return "ALLOW<->NEEDS_REVIEW"
    if pair == {"NEEDS_REVIEW", "BLOCK"}:
        return "NEEDS_REVIEW<->BLOCK"
    # Fallback for any non-standard verdict values.
    return f"{baseline_verdict}->{candidate_verdict}"


def _layer_deltas(base_layers: Dict[str, Any], cand_layers: Dict[str, Any]) -> Dict[str, int]:
    out: Dict[str, int] = {}
    for name in ("security", "privacy", "governance"):
        base = base_layers.get(name)
        cand = cand_layers.get(name)
        if base and cand and base["score"] != cand["score"]:
            out[name] = cand["score"] - base["score"]
    return out


def _factor_deltas(
    base_layers: Dict[str, Any], cand_layers: Dict[str, Any]
) -> List[Dict[str, Any]]:
    deltas: List[Dict[str, Any]] = []
    for name in ("security", "privacy", "governance"):
        base = base_layers.get(name)
        cand = cand_layers.get(name)
        if not base or not cand:
            continue
        base_factors = base["factors"]
        cand_factors = cand["factors"]
        for fname in sorted(set(base_factors) | set(cand_factors)):
            base_contrib = base_factors.get(fname, {}).get("contribution")
            cand_contrib = cand_factors.get(fname, {}).get("contribution")
            if base_contrib != cand_contrib:
                deltas.append(
                    {
                        "layer": name,
                        "factor": fname,
                        "baseline_contribution": base_contrib,
                        "candidate_contribution": cand_contrib,
                    }
                )
    return deltas


def diff_entry(
    entry: Dict[str, Any],
    baseline_wv: str = DEFAULT_BASELINE,
    candidate_wv: str = DEFAULT_CANDIDATE,
) -> Dict[str, Any]:
    """Score one entry under both presets and return a diff row."""
    base = score_entry(entry, baseline_wv)
    cand = score_entry(entry, candidate_wv)
    ft = flip_type(base["verdict"], cand["verdict"])
    return {
        "id": entry["id"],
        "name": entry.get("name", ""),
        "label": entry.get("label", "unknown"),
        "expected_verdict": entry.get("expected_verdict"),
        "baseline_score": base["overall_score"],
        "candidate_score": cand["overall_score"],
        "score_delta": cand["overall_score"] - base["overall_score"],
        "baseline_verdict": base["verdict"],
        "candidate_verdict": cand["verdict"],
        "verdict_flip": ft or "",
        "review_required": ft in REVIEW_REQUIRED_FLIPS,
        "layer_deltas": _layer_deltas(base["layers"], cand["layers"]),
        "factor_deltas": _factor_deltas(base["layers"], cand["layers"]),
    }


def compare_corpus(
    corpus: List[Dict[str, Any]],
    baseline_wv: str = DEFAULT_BASELINE,
    candidate_wv: str = DEFAULT_CANDIDATE,
) -> List[Dict[str, Any]]:
    """Diff every entry in a corpus. Returns one row per entry."""
    return [diff_entry(entry, baseline_wv, candidate_wv) for entry in corpus]


def row_has_diff(row: Dict[str, Any]) -> bool:
    """True if a row shows any score/verdict/layer/factor movement."""
    return bool(
        row["score_delta"] != 0
        or row["verdict_flip"]
        or row["layer_deltas"]
        or row["factor_deltas"]
    )


def has_any_diff(rows: List[Dict[str, Any]]) -> bool:
    """True if any row in the report shows movement (False => identity/zero diff)."""
    return any(row_has_diff(row) for row in rows)


# --- rendering --------------------------------------------------------------


def _summarize(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    flips: Dict[str, int] = {}
    review_required = 0
    changed = 0
    for row in rows:
        if row_has_diff(row):
            changed += 1
        if row["verdict_flip"]:
            flips[row["verdict_flip"]] = flips.get(row["verdict_flip"], 0) + 1
        if row["review_required"]:
            review_required += 1
    return {
        "total": len(rows),
        "changed": changed,
        "flips": flips,
        "review_required": review_required,
    }


def _md_cell(value: Any) -> str:
    """Escape a value for safe inclusion in a Markdown table cell.

    A raw '|' would start a new column and a newline would break the row, so a
    corpus id/name containing either would corrupt the table. Escape pipes and
    flatten newlines.
    """
    return str(value).replace("|", "\\|").replace("\r", " ").replace("\n", " ")


def render_markdown(
    rows: List[Dict[str, Any]],
    baseline_wv: str = DEFAULT_BASELINE,
    candidate_wv: str = DEFAULT_CANDIDATE,
) -> str:
    """Render a Markdown diff report."""
    summary = _summarize(rows)
    lines: List[str] = []
    lines.append("# Scoring corpus before/after diff")
    lines.append("")
    lines.append(f"- Baseline weights: `{baseline_wv}`")
    lines.append(f"- Candidate weights: `{candidate_wv}`")
    lines.append(f"- Entries: {summary['total']}")
    lines.append(f"- Entries changed: {summary['changed']}")
    if summary["flips"]:
        flip_str = ", ".join(f"{k}: {v}" for k, v in sorted(summary["flips"].items()))
        lines.append(f"- Verdict flips: {flip_str}")
    else:
        lines.append("- Verdict flips: none")
    if summary["review_required"]:
        lines.append(
            f"- **REVIEW REQUIRED: {summary['review_required']} ALLOW<->BLOCK flip(s) "
            "need explicit human sign-off before shipping.**"
        )
    if summary["changed"] == 0:
        lines.append("")
        lines.append("_No differences: identity comparison (candidate == baseline)._")
    lines.append("")
    lines.append(
        "| id | label | base score | cand score | Δscore | base verdict | "
        "cand verdict | flip | layer Δ |"
    )
    lines.append("| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |")
    for row in rows:
        layer_delta = (
            ", ".join(f"{k}{v:+d}" for k, v in row["layer_deltas"].items())
            if row["layer_deltas"]
            else ""
        )
        flip = row["verdict_flip"]
        if row["review_required"]:
            flip = f"⚠️ {flip}"
        lines.append(
            f"| {_md_cell(row['id'])} | {_md_cell(row['label'])} | {row['baseline_score']} | "
            f"{row['candidate_score']} | {row['score_delta']:+d} | "
            f"{row['baseline_verdict']} | {row['candidate_verdict']} | {_md_cell(flip)} | {layer_delta} |"
        )
    # Factor-level detail for rows that moved.
    detailed = [r for r in rows if r["factor_deltas"]]
    if detailed:
        lines.append("")
        lines.append("## Factor-level changes")
        for row in detailed:
            lines.append("")
            lines.append(f"### {_md_cell(row['id'])} ({_md_cell(row['name'])})")
            lines.append("")
            lines.append("| layer | factor | base contribution | cand contribution |")
            lines.append("| --- | --- | ---: | ---: |")
            for fd in row["factor_deltas"]:
                lines.append(
                    f"| {_md_cell(fd['layer'])} | {_md_cell(fd['factor'])} | "
                    f"{fd['baseline_contribution']} | {fd['candidate_contribution']} |"
                )
    lines.append("")
    return "\n".join(lines)


def render_csv(rows: List[Dict[str, Any]]) -> str:
    """Render a flat CSV diff report (one row per entry)."""
    buffer = io.StringIO()
    fieldnames = [
        "id",
        "name",
        "label",
        "expected_verdict",
        "baseline_score",
        "candidate_score",
        "score_delta",
        "baseline_verdict",
        "candidate_verdict",
        "verdict_flip",
        "review_required",
        "layer_deltas",
        "factor_deltas",
    ]
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        flat = dict(row)
        flat["layer_deltas"] = json.dumps(row["layer_deltas"], sort_keys=True)
        flat["factor_deltas"] = json.dumps(row["factor_deltas"], sort_keys=True)
        writer.writerow(flat)
    return buffer.getvalue()


def render_report(
    rows: List[Dict[str, Any]],
    fmt: str,
    baseline_wv: str,
    candidate_wv: str,
) -> str:
    if fmt == "md":
        return render_markdown(rows, baseline_wv, candidate_wv)
    if fmt == "csv":
        return render_csv(rows)
    raise ValueError(f"Unknown format {fmt!r}; expected 'md' or 'csv'.")


def write_report(
    rows: List[Dict[str, Any]],
    out_path: Any,
    fmt: str,
    baseline_wv: str = DEFAULT_BASELINE,
    candidate_wv: str = DEFAULT_CANDIDATE,
) -> Path:
    """Render and write a report to ``out_path``; returns the Path written."""
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(render_report(rows, fmt, baseline_wv, candidate_wv), encoding="utf-8")
    return out


# --- CLI --------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Offline before/after scoring diff over a labeled corpus of "
            "SignalPack inputs. Fully offline; no APIs, scans, or DB access."
        )
    )
    parser.add_argument("--corpus", required=True, help="Path to a corpus JSON file.")
    parser.add_argument(
        "--baseline",
        default=DEFAULT_BASELINE,
        help=f"Baseline weights_version (default: {DEFAULT_BASELINE}).",
    )
    parser.add_argument(
        "--candidate",
        default=DEFAULT_CANDIDATE,
        help=(
            f"Candidate weights_version (default: {DEFAULT_CANDIDATE}). With the "
            "default, this is identity mode and the report shows zero diff."
        ),
    )
    parser.add_argument(
        "--format",
        choices=("md", "csv"),
        default="md",
        help="Report format (default: md).",
    )
    parser.add_argument(
        "--out",
        default=None,
        help=(
            f"Output path. Defaults to {DEFAULT_OUTPUT_DIR}/corpus_diff.<ext> "
            "(git-ignored; generated reports are not committed)."
        ),
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    corpus = load_corpus(args.corpus)
    rows = compare_corpus(corpus, args.baseline, args.candidate)
    ext = "md" if args.format == "md" else "csv"
    out_path = args.out or f"{DEFAULT_OUTPUT_DIR}/corpus_diff.{ext}"
    written = write_report(rows, out_path, args.format, args.baseline, args.candidate)
    summary = _summarize(rows)
    print(f"Wrote {args.format} report to {written}")
    print(
        f"entries={summary['total']} changed={summary['changed']} "
        f"review_required={summary['review_required']}"
    )
    if summary["flips"]:
        print("flips: " + ", ".join(f"{k}={v}" for k, v in sorted(summary["flips"].items())))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
