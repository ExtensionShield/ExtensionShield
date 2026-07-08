"""Regression: ENTERPRISE_GOV_BASELINE::R3 must not false-BLOCK benign extensions.

R3 fires on (extraction ok + DATAFLOW_TRACE + empty declared_data_categories).
DATAFLOW_TRACE is first-party agnostic (it fires on a storage permission + any
network endpoint, e.g. an extension POSTing to its OWN backend), and a benign
developer who simply did not populate recognized disclosure phrases yields an
empty declared_data_categories. R3 was a non-advisory BLOCK, which — via the
Decision Authority baseline_governance rung — hard-BLOCKed such benign
first-party extensions with no dangerous or third-party behavior.

R3 is now NEEDS_REVIEW (consistent with R4, "declaration unknown -> review");
a hard BLOCK requires concrete dangerous behavior enforced by the V2 hard gates.
"""
from pathlib import Path

import yaml

from extension_shield.governance.decision_refresh import recompute_final_decision

RULEPACK_DIR = Path("src/extension_shield/governance/rulepacks")


def _rules(pack):
    return {r["rule_id"]: r for r in yaml.safe_load((RULEPACK_DIR / f"{pack}.yaml").read_text())["rules"]}


def _bundle(*, signals, declared_categories, overall, security=90, gate_results=None,
            declared_parties=None):
    """A persisted-shape governance_bundle with a deliberately stale decision."""
    return {
        "signals": {"signals": [{"type": t} for t in signals]},
        "store_listing": {
            "extraction": {"status": "ok"},
            "declared_third_parties": declared_parties or [],
            "declared_data_categories": declared_categories or [],
        },
        "facts": {},
        "context": {"rulepacks": ["CWS_LIMITED_USE", "ENTERPRISE_GOV_BASELINE"]},
        "scoring_v2": {
            "overall_score": overall, "security_score": security,
            "privacy_score": 90, "governance_score": 90,
            "overall_confidence": 0.85, "decision": "ALLOW",
            "gate_results": gate_results or [], "scoring_version": "2.0.0",
        },
        "decision": {"final_verdict": "BLOCK", "final_authority": "stale", "final_reasons": []},
    }


def test_r3_verdict_is_review_in_rulepack():
    ent = _rules("ENTERPRISE_GOV_BASELINE")
    assert ent["ENTERPRISE_GOV_BASELINE::R3"]["verdict"] == "NEEDS_REVIEW"


def test_benign_first_party_dataflow_is_review_not_block():
    # storage-backed dataflow to own backend, undeclared categories, no third
    # party, clean high V2 score -> REVIEW (disclosure gap), never a hard BLOCK.
    out = recompute_final_decision(
        _bundle(signals=["DATAFLOW_TRACE"], declared_categories=[], overall=90)
    )
    assert out is not None
    assert out["final_verdict"] == "NEEDS_REVIEW"
    assert out["final_verdict"] != "BLOCK"
    assert out["final_authority"] != "baseline_governance"


def test_r3_does_not_block_even_with_endpoint_and_broad_host():
    # Add ENDPOINT_FOUND + broad host (advisory) — still must not hard-BLOCK.
    out = recompute_final_decision(
        _bundle(
            signals=["DATAFLOW_TRACE", "ENDPOINT_FOUND", "HOST_PERMS_BROAD"],
            declared_categories=[], overall=82,
        )
    )
    assert out is not None
    assert out["final_verdict"] == "NEEDS_REVIEW"
    assert out["final_authority"] != "baseline_governance"


def test_declared_categories_suppress_r3_but_still_review_on_endpoint():
    # When the developer DID declare categories, R3 does not fire; an undisclosed
    # endpoint (R6) still yields REVIEW, never BLOCK.
    out = recompute_final_decision(
        _bundle(signals=["DATAFLOW_TRACE", "ENDPOINT_FOUND"],
                declared_categories=["activity"], overall=76)
    )
    assert out is not None
    assert out["final_verdict"] == "NEEDS_REVIEW"
    assert out["final_authority"] != "baseline_governance"
