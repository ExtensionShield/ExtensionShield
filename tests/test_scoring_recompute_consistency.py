"""Regression tests: GET-time recompute must not degrade or diverge from the
authoritative governance-bundle scoring.

Root cause guarded here: the top-level scoring_v2 was stamped with a stale "v2"
literal (!= ScoringEngine.VERSION "2.0.0"), which forced upgrade_legacy_payload
to recompute; the recompute read top-level virustotal_analysis/sast_results,
which are empty on hydrated rows (real output lives under summary /
governance_bundle), producing a false "insufficient data / 65".
"""

import copy

from extension_shield.api.payload_helpers import upgrade_legacy_payload
from extension_shield.scoring.engine import ScoringEngine


def _authoritative_gb_scoring():
    return {
        "overall_score": 80,
        "security_score": 91,
        "privacy_score": 78,
        "governance_score": 100,
        "decision": "NEEDS_REVIEW",
        "risk_level": "low",
        "reasons": ["SAST coverage missing; score capped at 80"],
        "coverage_cap_applied": True,
        "coverage_cap_reason": "SAST coverage missing; score capped at 80",
        "scoring_version": ScoringEngine.VERSION,
        "hard_gates_triggered": [],
        "security_layer": {"score": 91, "risk_level": "low", "factors": []},
        "privacy_layer": {"score": 78, "risk_level": "low", "factors": []},
        "governance_layer": {"score": 100, "risk_level": "none", "factors": []},
        "gate_results": [],
    }


def _row_with_stale_top_and_good_gb():
    """A row as served: stale top-level scoring_v2 ('v2', would recompute) but a
    current-version governance_bundle.scoring_v2, and VT only under summary."""
    vt = {
        "enabled": True,
        "summary": {"threat_level": "clean"},
        "files_analyzed": 5,
        "total_malicious": 0,
        "total_suspicious": 0,
        "file_results": [
            {
                "file_name": "bg.js",
                "virustotal": {
                    "found": True,
                    "detection_stats": {"malicious": 0, "suspicious": 0, "total_engines": 75, "undetected": 75},
                },
            }
        ],
    }
    return {
        "extension_id": "recomputeconsistencytestrowxxxxx",
        "report_view_model": {"scorecard": {}},
        "manifest": {"version": "1.0", "manifest_version": 3, "permissions": ["storage"]},
        "metadata": {"version": "1.0", "user_count": 90000},
        "sast_results": {},                 # top-level empty (real: SAST didn't run)
        "virustotal_analysis": {},          # top-level empty (real data is under summary)
        "summary": {"virustotal_analysis": vt},
        "scoring_v2": {
            "overall_score": 80, "decision": "NEEDS_REVIEW",
            "insufficient_data": False, "decision_authority": "score_threshold",
            "scoring_version": "v2",        # stale literal -> historically forced recompute
        },
        "governance_bundle": {"scoring_v2": _authoritative_gb_scoring()},
    }


def test_stale_version_does_not_trigger_degraded_recompute():
    up = upgrade_legacy_payload(copy.deepcopy(_row_with_stale_top_and_good_gb()), "x")
    sv = up["scoring_v2"]
    # Adopted the authoritative governance-bundle score; NOT degraded to 65/insufficient.
    assert sv["overall_score"] == 80
    assert sv["decision"] == "NEEDS_REVIEW"
    assert sv.get("insufficient_data") is not True
    assert sv["scoring_version"] == ScoringEngine.VERSION
    # Layer detail is preserved (came from the governance-bundle copy).
    assert "security_layer" in sv
    # Top-level-only fields are carried over.
    assert sv.get("decision_authority") == "score_threshold"


def test_recent_and_detail_agree_after_adoption():
    """The adopted top-level scoring_v2 must match the governance-bundle copy on
    the fields /api/recent and /api/scan/results both surface."""
    row = _row_with_stale_top_and_good_gb()
    gb = row["governance_bundle"]["scoring_v2"]
    up = upgrade_legacy_payload(copy.deepcopy(row), "x")
    sv = up["scoring_v2"]
    assert sv["overall_score"] == gb["overall_score"]
    assert sv["decision"] == gb["decision"]
    assert sv.get("coverage_cap_applied") == gb.get("coverage_cap_applied")


def test_missing_sast_never_reads_as_clean_after_recompute():
    """A row with NO governance_bundle scoring but VT under summary must recompute
    without losing VT, and must not claim insufficient_data when VT ran."""
    row = _row_with_stale_top_and_good_gb()
    row.pop("governance_bundle")           # force a genuine recompute path
    row["scoring_v2"] = {"scoring_version": "v2", "overall_score": 80}
    up = upgrade_legacy_payload(copy.deepcopy(row), "x")
    sv = up["scoring_v2"]
    # VT was present under summary -> recompute must see it (not "insufficient data").
    assert sv.get("insufficient_data") is not True
    # SAST genuinely did not run -> coverage cap / review, never a clean high ALLOW.
    assert sv["decision"] != "ALLOW"
