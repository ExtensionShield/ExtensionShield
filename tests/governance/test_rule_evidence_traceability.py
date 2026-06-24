"""
Regression tests for D5: governance rule verdicts were not evidence-traceable.

Every rulepack rule defines ``evidence_refs: []`` statically, and the engine
copied that empty list verbatim onto the RuleResult. A BLOCK / NEEDS_REVIEW
verdict therefore carried no link to the runtime signals that triggered it.

The fix joins a matched rule's verdict to the evidence_refs of the signals whose
type satisfied its condition, so a reviewer can trace the verdict to concrete
evidence ids.
"""

from extension_shield.governance.rules_engine import RulesEngine


def _engine():
    rulepack = {
        "rulepack_id": "TEST_PACK",
        "rules": [
            {
                "rule_id": "R_SENS",
                "verdict": "BLOCK",
                "confidence": 0.9,
                "evidence_refs": [],  # static empty, mirroring real rulepacks
                "condition": 'signals contains type="SENSITIVE_API"',
                "recommended_action": "review",
            }
        ],
    }
    return RulesEngine(rulepacks=[rulepack])


def _eval(engine, signals):
    return engine.evaluate(
        scan_id="s1",
        facts={},
        signals=signals,
        store_listing={},
        context={"rulepacks": ["TEST_PACK"]},
    )


def _result(results, rule_id="R_SENS"):
    return [r for r in results.rule_results if r.rule_id == rule_id][0]


def test_matched_block_carries_signal_evidence_refs():
    """A matched BLOCK must carry the triggering signal's evidence ids, not []."""
    signals = [
        {"type": "SENSITIVE_API", "evidence_refs": ["ev_001", "ev_002"], "severity": "high"},
        {"type": "OTHER", "evidence_refs": ["ev_999"], "severity": "low"},
    ]
    matched = _result(_eval(_engine(), signals))

    assert matched.verdict == "BLOCK"
    assert matched.evidence_refs == ["ev_001", "ev_002"], (
        "matched verdict is not traceable to the signal that triggered it"
    )
    assert "ev_999" not in matched.evidence_refs  # unrelated signal excluded


def test_unmatched_rule_has_no_signal_evidence():
    """An ALLOW (condition not met) carries no signal evidence."""
    signals = [{"type": "SOMETHING_ELSE", "evidence_refs": ["ev_x"]}]
    matched = _result(_eval(_engine(), signals))
    assert matched.verdict == "ALLOW"
    assert matched.evidence_refs == []


def test_collect_helper_extracts_named_types_only_and_dedupes():
    refs = RulesEngine._collect_signal_evidence_refs(
        'signals contains type="A" OR signals contains type="B"',
        [
            {"type": "A", "evidence_refs": ["a1"]},
            {"type": "B", "evidence_refs": ["b1", "a1"]},  # a1 deduped
            {"type": "C", "evidence_refs": ["c1"]},  # not named -> excluded
        ],
    )
    assert refs == ["a1", "b1"]


def test_collect_helper_no_signal_types_returns_empty():
    refs = RulesEngine._collect_signal_evidence_refs(
        "facts.host_access_patterns contains '<all_urls>'",
        [{"type": "A", "evidence_refs": ["a1"]}],
    )
    assert refs == []
