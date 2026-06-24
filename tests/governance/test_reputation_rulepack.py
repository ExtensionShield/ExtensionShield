"""
Regression tests for D6/D7: the ChromeStats reputation signal (CHROMESTATS_RISK)
was emitted by the signal extractor but consumed by no rule, so an elevated
ChromeStats risk could not influence the governance verdict (and a
chromestats-risk-only extension could clear as ALLOW).

ENTERPRISE_GOV_BASELINE::R11 now consumes CHROMESTATS_RISK and escalates to
NEEDS_REVIEW.
"""

from pathlib import Path

from extension_shield.governance.rules_engine import RulesEngine

RULEPACKS_DIR = (
    Path(__file__).parent.parent.parent
    / "src" / "extension_shield" / "governance" / "rulepacks"
)


def _eval(signals):
    rulepacks, errors = RulesEngine.load_rulepacks_with_report(str(RULEPACKS_DIR))
    assert errors == [], f"rulepack validation errors: {errors}"
    engine = RulesEngine(rulepacks)
    return engine.evaluate(
        scan_id="t",
        facts={},
        signals=signals,
        store_listing={},
        context={"rulepacks": ["ENTERPRISE_GOV_BASELINE"]},
    )


def _verdict_for(results, rule_id):
    for r in results.rule_results:
        if r.rule_id == rule_id:
            return r.verdict
    return None


def test_chromestats_risk_signal_triggers_review_rule():
    results = _eval(
        [{"type": "CHROMESTATS_RISK", "evidence_refs": [], "confidence": 0.8, "severity": "high"}]
    )
    assert _verdict_for(results, "ENTERPRISE_GOV_BASELINE::R11") == "NEEDS_REVIEW"


def test_no_chromestats_signal_does_not_trigger_rule():
    results = _eval([{"type": "SOMETHING_ELSE", "evidence_refs": []}])
    assert _verdict_for(results, "ENTERPRISE_GOV_BASELINE::R11") == "ALLOW"


def test_rulepack_still_valid_after_new_rule():
    rulepacks, errors = RulesEngine.load_rulepacks_with_report(str(RULEPACKS_DIR))
    assert errors == []
    ids = {rp.get("rulepack_id") for rp in rulepacks}
    assert "ENTERPRISE_GOV_BASELINE" in ids
