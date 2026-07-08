"""End-to-end calibration regression for the five local-SQLite calibration cases.

Runs the REAL rules engine + rulepacks + the final decision resolver (mirroring
governance_nodes) to lock the audited verdicts:

  - Sweezy Cursors  : V2 ALLOW  + only advisory hygiene signals -> stays ALLOW
  - Bulk Image      : V2 REVIEW + dataflow/endpoint (no declaration) -> REVIEW, NOT BLOCK
  - Page Marker     : V2 REVIEW + undisclosed endpoint             -> REVIEW, NOT BLOCK
  - BookSeeker      : V2 REVIEW + undisclosed endpoint             -> REVIEW, NOT BLOCK
  - Indian Visa     : V2 BLOCK  (concrete SAST behavior gate)      -> BLOCK

Guards two prior fixes: CWS_LIMITED_USE::R4 must be NEEDS_REVIEW (not BLOCK), and
advisory policy-hygiene rules (broad host / obfuscation-minification) must never
escalate a clean V2 ALLOW.
"""
from pathlib import Path

from extension_shield.governance.rules_engine import RulesEngine
from extension_shield.scoring.decision import resolve as resolve_decision

RULEPACKS_DIR = Path(__file__).resolve().parents[2] / "src" / "extension_shield" / "governance" / "rulepacks"


def _sig(t):
    return {"type": t}


def _run(signals, declared_parties=None, declared_categories=None, *, v2_overall,
         v2_security=90, v2_privacy=90, v2_governance=90, blocking_gates=(),
         warning_gates=(), v2_confidence=0.85):
    """Evaluate the rulepacks then resolve the final verdict, exactly as
    governance_nodes does (advisory rules are surfaced but never escalate)."""
    rulepacks, errors = RulesEngine.load_rulepacks_with_report(str(RULEPACKS_DIR))
    engine = RulesEngine(rulepacks, load_errors=errors)
    rr = engine.evaluate(
        scan_id="calib",
        facts={},
        signals=signals,
        store_listing={
            "extraction": {"status": "ok"},
            "declared_third_parties": declared_parties or [],
            "declared_data_categories": declared_categories or [],
        },
        context={"rulepacks": ["CWS_LIMITED_USE", "ENTERPRISE_GOV_BASELINE"]},
    )
    baseline_block = [r.recommended_action or r.explanation
                      for r in rr.rule_results if r.verdict == "BLOCK" and not r.advisory]
    baseline_review = [r.recommended_action or r.explanation
                       for r in rr.rule_results if r.verdict == "NEEDS_REVIEW" and not r.advisory]
    fd = resolve_decision(
        extension_id="calib",
        overall_score=v2_overall, security_score=v2_security,
        privacy_score=v2_privacy, governance_score=v2_governance,
        blocking_gates=list(blocking_gates), warning_gates=list(warning_gates),
        overall_confidence=v2_confidence, insufficient_data=False,
        baseline_block_reasons=baseline_block, baseline_review_reasons=baseline_review,
    )
    return fd, rr, baseline_block


class _Gate:
    """Duck-typed gate result for the resolver (only .reasons/.decision used)."""
    def __init__(self, decision, reasons):
        self.decision = decision
        self.reasons = reasons


def test_sweezy_advisory_only_stays_allow():
    # Broad host + minification/obfuscation only -> all advisory -> V2 ALLOW wins.
    fd, rr, blocks = _run([_sig("HOST_PERMS_BROAD"), _sig("OBFUSCATION")], v2_overall=89)
    assert fd.verdict.value == "ALLOW"
    assert blocks == []


def test_bulk_image_dataflow_is_review_not_block():
    # Real Bulk Image DID declare data categories (so R3 does not fire); with a
    # dataflow trace + undisclosed third parties + broad host and V2 REVIEW, the
    # verdict is REVIEW, never BLOCK.
    fd, rr, blocks = _run(
        [_sig("DATAFLOW_TRACE"), _sig("ENDPOINT_FOUND"), _sig("HOST_PERMS_BROAD")],
        declared_categories=["activity"],
        v2_overall=76,
    )
    assert fd.verdict.value == "NEEDS_REVIEW"
    # No rule may hard-BLOCK a disclosure gap without concrete dangerous behavior.
    assert blocks == []
    r4 = next((r for r in rr.rule_results if r.rule_id == "CWS_LIMITED_USE::R4"), None)
    assert r4 is not None and r4.verdict == "NEEDS_REVIEW"


def test_page_marker_undisclosed_endpoint_is_review():
    fd, _, blocks = _run([_sig("ENDPOINT_FOUND")], v2_overall=89)
    assert fd.verdict.value == "NEEDS_REVIEW"  # evidence-backed (an endpoint was found)
    assert blocks == []


def test_indian_visa_concrete_behavior_stays_block():
    # A concrete V2 hard gate (remote-code + secret-read + exfil) blocks regardless
    # of governance rules — the authoritative reason is the behavior gate.
    gate = _Gate("BLOCK", ["Reads password fields and loads remote code"])
    fd, _, _ = _run(
        [], declared_categories=["activity"], declared_parties=["backend"],
        v2_overall=62, v2_security=29, blocking_gates=[gate],
    )
    assert fd.verdict.value == "BLOCK"
    assert fd.authority == "hard_gate"


def test_r4_is_review_not_block_in_rulepack():
    rulepacks, _ = RulesEngine.load_rulepacks_with_report(str(RULEPACKS_DIR))
    cws = next(rp for rp in rulepacks if rp.get("rulepack_id") == "CWS_LIMITED_USE")
    r4 = next(r for r in cws["rules"] if r["rule_id"] == "CWS_LIMITED_USE::R4")
    assert r4["verdict"] == "NEEDS_REVIEW"
