"""CWS_LIMITED_USE calibration (audit follow-up).

A sensitive API with no declared data category is a disclosure/compliance
*review* gap (R2), not proof of malicious behavior -> NEEDS_REVIEW, not BLOCK.
Real malware (R10) must still BLOCK, and an independent BLOCK rule firing
alongside the R2 review gap must still yield a BLOCK verdict.
"""

from pathlib import Path

from extension_shield.governance.rules_engine import RulesEngine

RULEPACKS_DIR = (
    Path(__file__).parent.parent.parent
    / "src" / "extension_shield" / "governance" / "rulepacks"
)


def _rulepacks():
    rulepacks, errors = RulesEngine.load_rulepacks_with_report(str(RULEPACKS_DIR))
    assert errors == [], f"rulepack validation errors: {errors}"
    return rulepacks


def _engine():
    return RulesEngine(_rulepacks())


def _verdict_for(results, rule_id):
    for r in results.rule_results:
        if r.rule_id == rule_id:
            return r.verdict
    return None


def _eval(engine, facts, signals, store_listing):
    return engine.evaluate(
        scan_id="t", facts=facts, signals=signals,
        store_listing=store_listing, context={"rulepacks": ["CWS_LIMITED_USE"]},
    )


def test_r2_definition_is_needs_review_and_r10_stays_block():
    rp = next(rp for rp in _rulepacks() if rp.get("rulepack_id") == "CWS_LIMITED_USE")
    by_id = {r["rule_id"]: r for r in rp["rules"]}
    assert by_id["CWS_LIMITED_USE::R2"]["verdict"] == "NEEDS_REVIEW"
    assert by_id["CWS_LIMITED_USE::R10"]["verdict"] == "BLOCK"


def test_r2_sensitive_api_without_declaration_reviews_not_blocks():
    results = _eval(
        _engine(),
        facts={},
        signals=[{"type": "SENSITIVE_API", "evidence_refs": [], "confidence": 0.9, "severity": "high"}],
        store_listing={"extraction": {"status": "ok"}, "declared_data_categories": []},
    )
    assert _verdict_for(results, "CWS_LIMITED_USE::R2") == "NEEDS_REVIEW"


def test_r10_real_malware_still_blocks():
    results = _eval(
        _engine(),
        facts={"security_findings": {"virustotal_threat_level": "malicious", "virustotal_malicious_count": 8}},
        signals=[],
        store_listing={"extraction": {"status": "ok"}},
    )
    assert _verdict_for(results, "CWS_LIMITED_USE::R10") == "BLOCK"


def test_disclosure_gap_plus_malware_still_has_block_verdict():
    # Part 1.3: an independent BLOCK rule (R10) firing alongside the R2 review gap
    # must still surface a BLOCK verdict; R2 itself stays NEEDS_REVIEW.
    results = _eval(
        _engine(),
        facts={"security_findings": {"virustotal_threat_level": "malicious", "virustotal_malicious_count": 8}},
        signals=[{"type": "SENSITIVE_API", "evidence_refs": [], "confidence": 0.9, "severity": "high"}],
        store_listing={"extraction": {"status": "ok"}, "declared_data_categories": []},
    )
    assert "BLOCK" in [r.verdict for r in results.rule_results]
    assert _verdict_for(results, "CWS_LIMITED_USE::R2") == "NEEDS_REVIEW"
