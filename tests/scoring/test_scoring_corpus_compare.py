"""Diff-harness tests for the offline scoring corpus comparison.

Covers: identity-mode (v1 vs v1) produces an exact zero diff, the diff excludes
non-deterministic fields (created_at), verdict-flip classification, and report
generation to a tmp path. Fully offline: no APIs, scans, or database access.

These tests intentionally do NOT assert engine output equals a corpus label.
"""

from pathlib import Path

import pytest

from scripts.scoring.compare_scoring_corpus import (
    DEFAULT_BASELINE,
    NON_DETERMINISTIC_FIELDS,
    REVIEW_REQUIRED_FLIPS,
    _factor_deltas,
    _layer_deltas,
    compare_corpus,
    diff_entry,
    flip_type,
    has_any_diff,
    load_corpus,
    render_csv,
    render_markdown,
    row_has_diff,
    score_entry,
    write_report,
)


def _synthetic_row(**overrides):
    """A diff row shaped exactly like diff_entry() output, for renderer tests."""
    row = {
        "id": "syn-flip",
        "name": "forced-flip",
        "label": "unknown",
        "expected_verdict": None,
        "baseline_score": 80,
        "candidate_score": 20,
        "score_delta": -60,
        "baseline_verdict": "ALLOW",
        "candidate_verdict": "BLOCK",
        "verdict_flip": "ALLOW<->BLOCK",
        "review_required": True,
        "layer_deltas": {"security": -60},
        "factor_deltas": [
            {
                "layer": "security",
                "factor": "SAST",
                "baseline_contribution": 0.1,
                "candidate_contribution": 0.7,
            }
        ],
    }
    row.update(overrides)
    return row

FIXTURES = Path(__file__).parent.parent / "fixtures" / "scoring_corpus"
STARTER = FIXTURES / "starter_corpus.json"


@pytest.fixture()
def starter():
    return load_corpus(STARTER)


# --- identity mode ----------------------------------------------------------


def test_identity_mode_produces_zero_diff(starter):
    rows = compare_corpus(starter, DEFAULT_BASELINE, DEFAULT_BASELINE)
    assert len(rows) == len(starter)
    for row in rows:
        assert row["score_delta"] == 0, row
        assert row["verdict_flip"] == "", row
        assert row["layer_deltas"] == {}, row
        assert row["factor_deltas"] == [], row
        assert row["baseline_verdict"] == row["candidate_verdict"]
    assert has_any_diff(rows) is False
    assert all(not row_has_diff(row) for row in rows)


def test_scoring_is_deterministic_across_runs(starter):
    # Same entry, same preset, scored twice → identical snapshot (created_at excluded).
    for entry in starter:
        a = score_entry(entry, DEFAULT_BASELINE)
        b = score_entry(entry, DEFAULT_BASELINE)
        assert a == b


def test_snapshot_excludes_non_deterministic_fields(starter):
    # The diff snapshot must not carry created_at (or any listed volatile field).
    snap = score_entry(starter[0], DEFAULT_BASELINE)
    for field in NON_DETERMINISTIC_FIELDS:
        assert field not in snap
    assert "created_at" not in snap


# --- flip classification ----------------------------------------------------


def test_flip_type_none_when_unchanged():
    assert flip_type("ALLOW", "ALLOW") is None
    assert flip_type("BLOCK", "BLOCK") is None


def test_flip_type_classifies_each_pair():
    assert flip_type("ALLOW", "NEEDS_REVIEW") == "ALLOW<->NEEDS_REVIEW"
    assert flip_type("NEEDS_REVIEW", "ALLOW") == "ALLOW<->NEEDS_REVIEW"
    assert flip_type("NEEDS_REVIEW", "BLOCK") == "NEEDS_REVIEW<->BLOCK"
    assert flip_type("ALLOW", "BLOCK") == "ALLOW<->BLOCK"
    assert flip_type("BLOCK", "ALLOW") == "ALLOW<->BLOCK"


def test_allow_block_flip_constant_membership():
    assert "ALLOW<->BLOCK" in REVIEW_REQUIRED_FLIPS
    assert flip_type("ALLOW", "BLOCK") in REVIEW_REQUIRED_FLIPS


# --- non-empty diff path (exercised with synthetic snapshots/rows, no invented weights) ---


def test_layer_deltas_reports_changed_layers_only():
    base = {
        "security": {"score": 90, "factors": {}},
        "privacy": {"score": 100, "factors": {}},
        "governance": {"score": 100, "factors": {}},
    }
    cand = {
        "security": {"score": 40, "factors": {}},
        "privacy": {"score": 100, "factors": {}},
        "governance": {"score": 100, "factors": {}},
    }
    assert _layer_deltas(base, cand) == {"security": -50}


def test_factor_deltas_reports_changed_contributions_only():
    base = {
        "security": {"score": 90, "factors": {"SAST": {"contribution": 0.1}, "VT": {"contribution": 0.2}}},
        "privacy": {"score": 100, "factors": {}},
        "governance": {"score": 100, "factors": {}},
    }
    cand = {
        "security": {"score": 40, "factors": {"SAST": {"contribution": 0.6}, "VT": {"contribution": 0.2}}},
        "privacy": {"score": 100, "factors": {}},
        "governance": {"score": 100, "factors": {}},
    }
    deltas = _factor_deltas(base, cand)
    assert deltas == [
        {"layer": "security", "factor": "SAST", "baseline_contribution": 0.1, "candidate_contribution": 0.6}
    ]


def test_markdown_renders_non_empty_diff_with_review_marker():
    text = render_markdown([_synthetic_row()], "v1", "v2")
    assert "REVIEW REQUIRED" in text          # summary callout
    assert "⚠️ ALLOW<->BLOCK" in text          # flagged flip in the table
    assert "Factor-level changes" in text      # factor detail section rendered
    assert "SAST" in text
    assert "security-60" in text               # layer delta cell


def test_markdown_escapes_pipe_and_newline_in_cells():
    row = _synthetic_row(id="syn|evil", name="line1\nline2")
    text = render_markdown([row], "v1", "v2")
    # A raw pipe/newline would corrupt the table; they must be escaped/flattened.
    assert "syn\\|evil" in text
    assert "syn|evil |" not in text  # unescaped pipe would create a phantom column
    # the factor-detail heading uses id/name too
    assert "line1 line2" in text


def test_csv_renders_non_empty_diff_row():
    text = render_csv([_synthetic_row()])
    body = text.splitlines()[1]
    assert "ALLOW<->BLOCK" in body
    assert "-60" in body


# --- report generation ------------------------------------------------------


def test_markdown_report_generates(starter, tmp_path):
    rows = compare_corpus(starter, DEFAULT_BASELINE, DEFAULT_BASELINE)
    out = write_report(rows, tmp_path / "diff.md", "md", DEFAULT_BASELINE, DEFAULT_BASELINE)
    assert out.exists()
    text = out.read_text(encoding="utf-8")
    assert "Scoring corpus before/after diff" in text
    # Identity mode should announce zero differences.
    assert "identity comparison" in text
    for entry in starter:
        assert entry["id"] in text


def test_csv_report_generates(starter, tmp_path):
    rows = compare_corpus(starter, DEFAULT_BASELINE, DEFAULT_BASELINE)
    out = write_report(rows, tmp_path / "diff.csv", "csv", DEFAULT_BASELINE, DEFAULT_BASELINE)
    assert out.exists()
    text = out.read_text(encoding="utf-8")
    header = text.splitlines()[0]
    for col in ("id", "score_delta", "verdict_flip", "layer_deltas", "factor_deltas"):
        assert col in header


def test_render_functions_return_strings(starter):
    rows = compare_corpus(starter, DEFAULT_BASELINE, DEFAULT_BASELINE)
    assert isinstance(render_markdown(rows, "v1", "v1"), str)
    assert isinstance(render_csv(rows), str)


def test_diff_entry_shape(starter):
    row = diff_entry(starter[0], DEFAULT_BASELINE, DEFAULT_BASELINE)
    for key in (
        "id",
        "baseline_score",
        "candidate_score",
        "score_delta",
        "baseline_verdict",
        "candidate_verdict",
        "verdict_flip",
        "review_required",
        "layer_deltas",
        "factor_deltas",
    ):
        assert key in row


def test_unknown_weights_version_raises(starter):
    # A candidate preset that does not exist must fail loudly, not silently pass.
    with pytest.raises(Exception):
        score_entry(starter[0], "does-not-exist")
