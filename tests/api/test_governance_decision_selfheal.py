"""The API must self-heal a stale governance final_verdict on read.

governance_bundle.decision carries a decision_version. When it is missing/stale
(the row was persisted before a decision-logic change), upgrade_legacy_payload
recomputes the final verdict deterministically from the bundle's own inputs so
the API never serves a stale verdict — even when scoring_v2 is already current
(the two are versioned independently). This mirrors the scoring_version
self-heal and is what /api/scan/trigger's cached path cannot do on its own.
"""
import copy

from extension_shield.api.payload_helpers import refresh_governance_decision
from extension_shield.governance.decision_refresh import DECISION_VERSION


def _bundle(*, signals, declared_categories, overall, security=90,
            stale_final="BLOCK", decision_version=None):
    decision = {"final_verdict": stale_final, "final_authority": "stale", "final_reasons": []}
    if decision_version is not None:
        decision["decision_version"] = decision_version
    return {
        "signals": {"signals": [{"type": t} for t in signals]},
        "store_listing": {
            "extraction": {"status": "ok"},
            "declared_third_parties": [],
            "declared_data_categories": declared_categories or [],
        },
        "facts": {},
        "context": {"rulepacks": ["CWS_LIMITED_USE", "ENTERPRISE_GOV_BASELINE"]},
        "scoring_v2": {
            "overall_score": overall, "security_score": security,
            "privacy_score": 90, "governance_score": 90,
            "overall_confidence": 0.85, "decision": "ALLOW",
            "gate_results": [], "scoring_version": "2.0.0",
        },
        "decision": decision,
    }


def _payload(bundle):
    return {"extension_id": "selfhealtestextensionidxxxxxxxx", "governance_bundle": bundle,
            "scoring_v2": bundle["scoring_v2"]}


def test_selfheal_corrects_stale_block_to_review():
    # Advisory-only hygiene signals + clean V2 ALLOW: stale BLOCK -> ALLOW.
    payload = _payload(_bundle(signals=["HOST_PERMS_BROAD", "OBFUSCATION"],
                               declared_categories=[], overall=89, stale_final="NEEDS_REVIEW"))
    changed = refresh_governance_decision(payload)
    assert changed is True
    decision = payload["governance_bundle"]["decision"]
    assert decision["final_verdict"] == "ALLOW"
    assert decision["decision_version"] == DECISION_VERSION


def test_selfheal_corrects_stale_block_from_downgraded_rule():
    # Dataflow + undeclared categories: old code hard-BLOCKed (R3 BLOCK), current
    # code reviews. Stale BLOCK must be refreshed to NEEDS_REVIEW.
    payload = _payload(_bundle(signals=["DATAFLOW_TRACE"], declared_categories=[],
                               overall=90, stale_final="BLOCK"))
    changed = refresh_governance_decision(payload)
    assert changed is True
    assert payload["governance_bundle"]["decision"]["final_verdict"] == "NEEDS_REVIEW"


def test_current_version_is_not_recomputed():
    # A row already stamped current must be left untouched (fast path).
    bundle = _bundle(signals=["HOST_PERMS_BROAD"], declared_categories=[], overall=89,
                     stale_final="BLOCK", decision_version=DECISION_VERSION)
    payload = _payload(bundle)
    before = copy.deepcopy(payload["governance_bundle"]["decision"])
    changed = refresh_governance_decision(payload)
    assert changed is False
    # Even the (wrong) stored verdict is preserved — versioning says it's current.
    assert payload["governance_bundle"]["decision"] == before


def test_missing_inputs_leaves_verdict_untouched():
    # No store_listing / scoring inputs -> decline to recompute, keep persisted.
    payload = {"extension_id": "x", "governance_bundle": {
        "decision": {"final_verdict": "BLOCK", "final_authority": "stale"}}}
    changed = refresh_governance_decision(payload)
    assert changed is False
    assert payload["governance_bundle"]["decision"]["final_verdict"] == "BLOCK"


def test_no_governance_bundle_is_noop():
    assert refresh_governance_decision({"extension_id": "x"}) is False
    assert refresh_governance_decision(None) is False


def test_recent_scan_refresh_exposes_current_final_verdict(monkeypatch):
    """Recent rows must use the same refreshed final verdict as detail pages."""
    from extension_shield.api import main

    scan = {
        "extension_id": "recentrowextensionidxxxxxxxxxxxx",
        "final_verdict": "NEEDS_REVIEW",
        "governance_verdict": "NEEDS_REVIEW",
        "summary": {
            "governance_bundle": {
                "decision": {"final_verdict": "NEEDS_REVIEW"},
            },
        },
    }
    scan["governance_bundle"] = scan["summary"]["governance_bundle"]

    def fake_refresh(payload):
        payload["governance_bundle"]["decision"]["final_verdict"] = "ALLOW"
        payload["governance_bundle"]["decision"]["decision_version"] = DECISION_VERSION
        return True

    monkeypatch.setattr(main, "refresh_governance_decision", fake_refresh)

    changed = main._refresh_recent_scan_verdict(scan)

    assert changed is True
    assert scan["final_verdict"] == "ALLOW"
    assert scan["governance_verdict"] == "ALLOW"
    assert scan["summary"]["governance_verdict"] == "ALLOW"
    assert scan["summary"]["governance_bundle"]["decision"]["final_verdict"] == "ALLOW"
