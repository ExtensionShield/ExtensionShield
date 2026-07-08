"""Regression tests: governance must not escalate the final verdict above the
evidence-based V2 decision using vague policy-hygiene signals.

Root cause fixed: every rulepack BLOCK/NEEDS_REVIEW verdict fed the final
decision, so broad host access (R1), minification/obfuscation (R7), a generic
"storage" permission (R9), a missing/undetected privacy policy (R10), and a
data-flow-without-declaration (CWS R4=BLOCK) downgraded clean extensions —
Sweezy Cursors ALLOW->REVIEW and Bulk Image REVIEW->BLOCK. The vague rules are
now `advisory` (surfaced, never escalating) and R4 is REVIEW, not BLOCK.
"""

from pathlib import Path
from types import SimpleNamespace

import yaml

from extension_shield.governance.schemas import RuleResult
from extension_shield.scoring.decision import resolve as resolve_decision

RULEPACK_DIR = Path("src/extension_shield/governance/rulepacks")


def _load(pack):
    return {r["rule_id"]: r for r in yaml.safe_load((RULEPACK_DIR / f"{pack}.yaml").read_text())["rules"]}


def test_vague_rules_are_marked_advisory():
    ent = _load("ENTERPRISE_GOV_BASELINE")
    cws = _load("CWS_LIMITED_USE")
    # Task-prohibited signals: broad host, obfuscation/minification, generic
    # permission, missing-policy -> advisory (must not escalate past V2).
    for rid in ("ENTERPRISE_GOV_BASELINE::R1", "ENTERPRISE_GOV_BASELINE::R7",
                "ENTERPRISE_GOV_BASELINE::R9", "ENTERPRISE_GOV_BASELINE::R10"):
        assert ent[rid].get("advisory") is True, f"{rid} must be advisory"
    assert cws["CWS_LIMITED_USE::R1"].get("advisory") is True


def test_evidence_backed_rules_are_not_advisory():
    ent = _load("ENTERPRISE_GOV_BASELINE")
    # Threat-intel / malware rules must still be able to escalate.
    assert not ent["ENTERPRISE_GOV_BASELINE::R8"].get("advisory", False)  # VT/threat intel
    assert not ent["ENTERPRISE_GOV_BASELINE::R3"].get("advisory", False)  # evidence-backed dataflow rule (may escalate to review)


def test_r4_dataflow_without_declaration_is_review_not_block():
    cws = _load("CWS_LIMITED_USE")
    assert cws["CWS_LIMITED_USE::R4"]["verdict"] == "NEEDS_REVIEW"


def test_rule_result_carries_advisory_flag_default_false():
    r = RuleResult(rule_id="X::R1", rulepack="X", verdict="NEEDS_REVIEW",
                   confidence=0.9, explanation="e", recommended_action="a")
    assert r.advisory is False
    r2 = RuleResult(rule_id="X::R2", rulepack="X", verdict="NEEDS_REVIEW",
                    confidence=0.9, explanation="e", recommended_action="a", advisory=True)
    assert r2.advisory is True


def _baseline_reasons(rule_results):
    """Mirror governance_nodes: only non-advisory rules feed the final verdict."""
    block = [r.recommended_action for r in rule_results if r.verdict == "BLOCK" and not r.advisory]
    review = [r.recommended_action for r in rule_results if r.verdict == "NEEDS_REVIEW" and not r.advisory]
    return block, review


def _clean_v2_resolve(block, review):
    """Resolve with a clean V2 signal (ALLOW-shaped: high scores, no gates)."""
    return resolve_decision(
        overall_score=89, security_score=83, privacy_score=85, governance_score=100,
        blocking_gates=[], warning_gates=[], overall_confidence=0.84,
        insufficient_data=False, baseline_block_reasons=block, baseline_review_reasons=review,
    )


def test_advisory_review_does_not_escalate_clean_v2_allow():
    # Sweezy-style: only advisory hygiene rules fired -> stays ALLOW.
    rules = [
        RuleResult(rule_id="ENTERPRISE_GOV_BASELINE::R1", rulepack="E", verdict="NEEDS_REVIEW",
                   confidence=0.9, explanation="broad host", recommended_action="justify", advisory=True),
        RuleResult(rule_id="ENTERPRISE_GOV_BASELINE::R7", rulepack="E", verdict="NEEDS_REVIEW",
                   confidence=0.7, explanation="minified", recommended_action="transparency", advisory=True),
    ]
    block, review = _baseline_reasons(rules)
    assert review == [] and block == []
    assert _clean_v2_resolve(block, review).verdict.value == "ALLOW"


def test_evidence_backed_block_still_escalates():
    rules = [
        RuleResult(rule_id="ENTERPRISE_GOV_BASELINE::R8", rulepack="E", verdict="BLOCK",
                   confidence=0.95, explanation="VT malware", recommended_action="block", advisory=False),
    ]
    block, review = _baseline_reasons(rules)
    assert block and _clean_v2_resolve(block, review).verdict.value == "BLOCK"
