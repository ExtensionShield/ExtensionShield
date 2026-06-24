"""
Regression tests for D1: the web consumer report verdict ignored the
authoritative governance verdict. build_report_view_model derived its verdict
solely from the engine's scoring decision, which omits org-policy and
baseline-governance BLOCK/NEEDS_REVIEW rungs. An extension the Decision Authority
BLOCKs could therefore render as "appears safe" in the consumer report.

The fix threads the governance verdict in and escalates (never downgrades) the
consumer verdict to the more severe of (engine verdict, governance verdict).
"""

import json

from extension_shield.core.report_view_model import (
    _escalate_verdict,
    build_report_view_model,
)

CLEAN_VT = {
    "enabled": True,
    "files_analyzed": 1,
    "files_found_in_vt": 1,
    "total_malicious": 0,
    "total_suspicious": 0,
    "file_results": [
        {
            "file_name": "x.js",
            "virustotal": {
                "found": True,
                "detection_stats": {
                    "malicious": 0,
                    "suspicious": 0,
                    "undetected": 70,
                    "harmless": 0,
                    "total_engines": 70,
                },
                "malware_families": [],
            },
        }
    ],
    "summary": {"threat_level": "clean", "detected_families": [], "recommendation": ""},
}

SOFTENING = ["appears safe", "safe for general use", "low risk — appears safe"]


def _build(governance_verdict=None, with_vt=True):
    manifest = {"manifest_version": 3, "name": "t", "version": "1.0"}
    analysis_results = {
        "javascript_analysis": {"sast_findings": {"app.js": []}, "scan_error": False},
        "permissions_analysis": {},
    }
    if with_vt:
        analysis_results["virustotal_analysis"] = CLEAN_VT
    return build_report_view_model(
        manifest=manifest,
        analysis_results=analysis_results,
        metadata={},
        extension_id="abc",
        scan_id="s1",
        skip_llm=True,
        governance_verdict=governance_verdict,
    )


def _no_softening(view_model):
    blob = json.dumps(
        {
            "scorecard": view_model.get("scorecard"),
            "consumer_summary": view_model.get("consumer_summary"),
            "unified_summary": view_model.get("unified_summary"),
        }
    ).lower()
    return not any(p in blob for p in SOFTENING)


# --- pure helper -------------------------------------------------------------

def test_escalate_verdict_is_severity_max():
    assert _escalate_verdict("ALLOW", "BLOCK") == "BLOCK"
    assert _escalate_verdict("BLOCK", "ALLOW") == "BLOCK"  # never downgrades
    assert _escalate_verdict("ALLOW", "NEEDS_REVIEW") == "NEEDS_REVIEW"
    assert _escalate_verdict("NEEDS_REVIEW", "UNKNOWN") == "NEEDS_REVIEW"
    assert _escalate_verdict("ALLOW", "UNKNOWN") == "ALLOW"


# --- governance escalates an engine ALLOW -----------------------------------

def test_engine_allow_baseline_control():
    """Control: engine clears benign+clean-VT as ALLOW (LOW RISK) when no
    governance verdict is supplied — proving the escalations below are real."""
    vm = _build(governance_verdict=None)
    assert vm["scorecard"]["score_label"] == "LOW RISK"


def test_governance_block_escalates_consumer_verdict():
    vm = _build(governance_verdict="BLOCK")
    assert vm["scorecard"]["score_label"] == "HIGH RISK"
    assert _no_softening(vm), "consumer copy still softened a governance BLOCK"


def test_governance_review_escalates_consumer_verdict():
    vm = _build(governance_verdict="NEEDS_REVIEW")
    assert vm["scorecard"]["score_label"] != "LOW RISK"
    assert _no_softening(vm)


# --- never downgrade ---------------------------------------------------------

def test_governance_allow_never_downgrades_engine_review():
    """Engine NEEDS_REVIEW (no threat coverage) must stay at review even if a
    stale/permissive governance verdict says ALLOW."""
    vm = _build(governance_verdict="ALLOW", with_vt=False)
    assert vm["scorecard"]["score_label"] != "LOW RISK"
