from extension_shield.utils.verdict_risk import (
    coherent_risk_level,
    resolve_authoritative_verdict,
)


def test_coherent_risk_level_truth_table():
    assert coherent_risk_level("BLOCK", "low") == "high"
    assert coherent_risk_level("BLOCK", "none") == "high"
    assert coherent_risk_level("BLOCK", "medium") == "medium"
    assert coherent_risk_level("BLOCK", "high") == "high"

    assert coherent_risk_level("NEEDS_REVIEW", "low") == "medium"
    assert coherent_risk_level("NEEDS_REVIEW", "none") == "medium"
    assert coherent_risk_level("NEEDS_REVIEW", "medium") == "medium"
    assert coherent_risk_level("NEEDS_REVIEW", "high") == "high"

    assert coherent_risk_level("ALLOW", "low") == "low"
    assert coherent_risk_level(None, "low") == "low"


def test_resolve_authoritative_verdict_order():
    assert resolve_authoritative_verdict({"final_verdict": "BLOCK"}) == "BLOCK"
    assert resolve_authoritative_verdict({"governance_verdict": "needs_review"}) == "NEEDS_REVIEW"
    assert (
        resolve_authoritative_verdict(
            {"governance_bundle": {"decision": {"final_verdict": "block"}}}
        )
        == "BLOCK"
    )
    assert resolve_authoritative_verdict({"scoring_v2": {"decision": "allow"}}) == "ALLOW"
