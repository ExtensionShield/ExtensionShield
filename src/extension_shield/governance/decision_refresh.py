"""Recompute the authoritative governance final verdict from a persisted
``governance_bundle`` using the CURRENT rulepacks + the single Decision Authority.

Why this exists
---------------
``workflow/governance_nodes.py`` computes the final verdict at scan time and
persists it under ``governance_bundle["decision"]["final_verdict"]``. Unlike
``scoring_v2`` (which carries ``scoring_version`` and is recomputed on read when
stale), the governance decision had **no version stamp and no recompute path** —
so when the decision logic changes (rulepack ``advisory`` semantics, a rule's
verdict, or the :func:`resolve` precedence), every previously-persisted row kept
serving its old verdict forever, and ``/api/scan/trigger`` returns the cached row
without refreshing it.

This module closes that gap. The scoring layer (scores / gates / confidence) is
unchanged across decision-logic revisions, so only the rules-engine +
:func:`resolve` layer needs to be re-run. Because the rules engine consumes only
the in-memory ``signals`` / ``store_listing`` / ``facts`` / ``context`` already
persisted in the bundle, the recompute is deterministic and network-free — no
re-download and no re-extraction of the CRX. It mirrors ``governance_nodes.py``
Stage 7 + Decision Authority exactly, operating on the *serialized* bundle.

Bump :data:`DECISION_VERSION` whenever a change can alter a stored verdict.
"""

from __future__ import annotations

import logging
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance import RulesEngine
from extension_shield.scoring.decision import OrgPolicy, resolve as resolve_decision

logger = logging.getLogger(__name__)

# Bump when the governance decision logic changes in a way that can alter a
# stored verdict: rulepack `advisory` semantics, a rule's verdict, the resolve()
# precedence chain, or this recompute. Rows whose stored decision_version differs
# are refreshed on read (see api/payload_helpers.upgrade_legacy_payload).
DECISION_VERSION = "1.0.0"

_RULEPACKS_DIR = Path(__file__).parent / "rulepacks"

# Module-level cache: rulepacks rarely change at runtime, and loading parses YAML
# off disk. The process is restarted (clearing this) whenever the source reloads.
_RULEPACKS_CACHE: Optional[Tuple[List[Dict[str, Any]], List[str]]] = None


def _load_rulepacks() -> Tuple[List[Dict[str, Any]], List[str]]:
    global _RULEPACKS_CACHE
    if _RULEPACKS_CACHE is None:
        _RULEPACKS_CACHE = RulesEngine.load_rulepacks_with_report(str(_RULEPACKS_DIR))
    return _RULEPACKS_CACHE


def _gate_obj(g: Dict[str, Any]) -> SimpleNamespace:
    """Duck-typed gate result for resolve() (only .decision/.triggered/.reasons used)."""
    return SimpleNamespace(
        gate_id=g.get("gate_id"),
        decision=g.get("decision"),
        triggered=g.get("triggered"),
        confidence=g.get("confidence"),
        reasons=g.get("reasons") or [],
    )


def recompute_final_decision(
    governance_bundle: Dict[str, Any],
    *,
    insufficient_data: bool = False,
    org_policy: Optional[OrgPolicy] = None,
    scan_id: str = "recompute",
) -> Optional[Dict[str, Any]]:
    """Recompute the final verdict from a persisted ``governance_bundle``.

    Returns a dict with ``final_verdict`` / ``final_authority`` / ``final_reasons``
    / ``insufficient_data`` / ``decision_version``, ready to splice into
    ``governance_bundle["decision"]``. Returns ``None`` when the bundle lacks the
    inputs required to recompute faithfully (in which case callers must keep the
    persisted verdict untouched rather than degrade it).
    """
    if not isinstance(governance_bundle, dict):
        return None

    sv2 = governance_bundle.get("scoring_v2") or {}
    signals_obj = governance_bundle.get("signals") or {}
    store_listing = governance_bundle.get("store_listing")
    facts = governance_bundle.get("facts")
    context = governance_bundle.get("context")

    # Require the rules-engine inputs and the scoring scores. Without them we
    # cannot reproduce governance_nodes' decision faithfully, so we decline
    # rather than emit a degraded verdict.
    if not isinstance(store_listing, dict) or sv2.get("overall_score") is None:
        return None

    signals = signals_obj.get("signals") if isinstance(signals_obj, dict) else signals_obj

    try:
        rulepacks, load_errors = _load_rulepacks()
        engine = RulesEngine(rulepacks, load_errors=load_errors)
        rule_results = engine.evaluate(
            scan_id=scan_id,
            facts=facts or {},
            signals=signals or [],
            store_listing=store_listing,
            context=context or {},
        )
    except Exception as exc:  # pragma: no cover - defensive
        logger.warning("recompute_final_decision: rules engine failed: %s", exc)
        return None

    # Only EVIDENCE-BACKED (non-advisory) governance rules may escalate the final
    # verdict — identical to workflow/governance_nodes.py.
    baseline_block_reasons = [
        (r.recommended_action or r.explanation)
        for r in rule_results.rule_results
        if r.verdict == "BLOCK" and not getattr(r, "advisory", False)
    ]
    baseline_review_reasons = [
        (r.recommended_action or r.explanation)
        for r in rule_results.rule_results
        if r.verdict == "NEEDS_REVIEW" and not getattr(r, "advisory", False)
    ]

    gate_results = [_gate_obj(g) for g in (sv2.get("gate_results") or [])]
    blocking_gates = [g for g in gate_results if g.triggered and g.decision == "BLOCK"]
    warning_gates = [g for g in gate_results if g.triggered and g.decision == "WARN"]

    final = resolve_decision(
        extension_id=(sv2.get("explanation") or {}).get("extension_id", "") or "",
        overall_score=sv2["overall_score"],
        security_score=sv2.get("security_score", 100),
        privacy_score=sv2.get("privacy_score", 100),
        governance_score=sv2.get("governance_score", 100),
        blocking_gates=blocking_gates,
        warning_gates=warning_gates,
        overall_confidence=sv2.get("overall_confidence", 1.0),
        insufficient_data=bool(insufficient_data),
        baseline_block_reasons=baseline_block_reasons,
        baseline_review_reasons=baseline_review_reasons,
        org_policy=org_policy,
    )

    return {
        "final_verdict": final.verdict.value,
        "final_authority": final.authority,
        "final_reasons": final.reasons,
        "insufficient_data": final.insufficient_data,
        "decision_version": DECISION_VERSION,
    }
