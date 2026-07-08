"""
Governance Workflow Nodes

This module contains the node functions for the governance decisioning pipeline.
These nodes integrate with the existing extension analysis workflow to produce
governance decisions (ALLOW/BLOCK/NEEDS_REVIEW).

3-Layer Scoring Architecture:
    Layer 0: Signal Extraction - SignalPackBuilder normalizes tool outputs
    Layer 1: Risk Scoring - Deterministic scoring from SignalPack
    Layer 2: Decision - Rules engine evaluates signals → verdict
"""

import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any

from langgraph.graph import END
from langgraph.types import Command

from extension_shield.governance import (
    FactsBuilder,
    SignalExtractor,
    EvidenceIndexBuilder,
    StoreListingExtractor,
    ContextBuilder,
    RulesEngine,
    ReportGenerator,
    link_evidence_to_signals,
    get_context_for_rules_engine,
    # Layer 0: Signal Pack
    SignalPackBuilder,
    SignalPack,
    # Layer 1: Security Scorecard + Governance Scorecard
    ScorecardBuilder,
    SecurityScorecard,
    GovernanceScorecard,
)
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.decision import OrgPolicy, resolve as resolve_decision
from extension_shield.governance.decision_refresh import DECISION_VERSION
from extension_shield.workflow.node_types import CLEANUP_NODE


logger = logging.getLogger(__name__)

# Governance node type constant
GOVERNANCE_NODE = "governance_node"


def governance_node(state: dict) -> Command:
    """
    Node that runs the governance decisioning pipeline.
    
    Uses the 3-Layer Scoring Architecture:
    - Layer 0: Signal Extraction (SignalPackBuilder)
    - Layer 1: Risk Scoring (from SignalPack)
    - Layer 2: Decision (Rules Engine)
    
    Also executes legacy Stages 2-8 for compatibility:
    - Stage 2: Facts Builder
    - Stage 3: Evidence Index Builder
    - Stage 4: Signal Extractor
    - Stage 5: Store Listing Extractor
    - Stage 6: Context Builder
    - Stage 7: Rules Engine
    - Stage 8: Report Generator
    
    Args:
        state: The current workflow state
        
    Returns:
        Command with governance results
    """
    logger.info("Starting governance decisioning pipeline (3-Layer Architecture)")
    
    scan_id = state.get("workflow_id", "unknown")
    manifest_data = state.get("manifest_data", {})
    analysis_results = state.get("analysis_results", {})
    extension_metadata = state.get("extension_metadata", {})
    extracted_files = state.get("extracted_files", [])
    extension_dir = state.get("extension_dir")
    chrome_extension_path = state.get("chrome_extension_path", "")
    
    try:
        # =====================================================================
        # LAYER 0: Signal Extraction (NEW 3-Layer Architecture)
        # =====================================================================
        logger.info("Layer 0: Building SignalPack from tool outputs...")
        signal_pack_builder = SignalPackBuilder()
        signal_pack = signal_pack_builder.build(
            scan_id=scan_id,
            analysis_results=analysis_results or {},
            metadata=extension_metadata or {},
            manifest=manifest_data or {},
            extension_id=_extract_extension_id(chrome_extension_path),
        )
        signal_pack_dict = signal_pack.model_dump(mode="json")
        
        logger.info(
            "Layer 0 complete: %d evidence items, SAST=%d findings, VT=%s",
            len(signal_pack.evidence),
            len(signal_pack.sast.deduped_findings),
            signal_pack.virustotal.threat_level if signal_pack.virustotal.enabled else "disabled",
        )
        
        # =====================================================================
        # LAYER 1 (V2): ScoringEngine - Single Source of Truth
        # =====================================================================
        # Compute v2 scoring via the new Phase 1 ScoringEngine pipeline
        logger.info("Layer 1 (V2): Computing v2 scores via ScoringEngine...")
        
        user_count = signal_pack.webstore_stats.installs  # May be None
        scoring_engine = ScoringEngine(weights_version="v1")
        scoring_result = scoring_engine.calculate_scores(
            signal_pack=signal_pack,
            manifest=manifest_data if manifest_data else None,
            user_count=user_count,
        )
        
        # Get explanation and gate results for full transparency
        scoring_v2_explanation = scoring_engine.get_explanation()
        scoring_v2_gate_results = scoring_engine.get_gate_results()
        
        logger.info(
            "Layer 1 (V2) complete: overall=%d, security=%d, privacy=%d, governance=%d, decision=%s, confidence=%.2f",
            scoring_result.overall_score,
            scoring_result.security_score,
            scoring_result.privacy_score,
            scoring_result.governance_score,
            scoring_result.decision.value,
            scoring_result.overall_confidence,
        )
        
        if scoring_result.hard_gates_triggered:
            logger.warning(
                "V2 hard gates triggered: %s",
                scoring_result.hard_gates_triggered,
            )
        
        # =====================================================================
        # LAYER 1 (Legacy): Security Scorecard + Governance Scorecard
        # =====================================================================
        logger.info("Layer 1: Building security scorecard...")
        scorecard_builder = ScorecardBuilder()
        security_scorecard = scorecard_builder.build(signal_pack)
        
        logger.info(
            "Security scorecard: score=%d, risk=%s, factors=%d",
            security_scorecard.security_score,
            security_scorecard.risk_level,
            len(security_scorecard.factors),
        )
        
        # Compute Governance Scorecard (verdict logic)
        logger.info("Layer 1: Computing governance scorecard...")
        governance_scorecard = GovernanceScorecard.compute(signal_pack, security_scorecard)
        
        logger.info(
            "Governance scorecard: verdict=%s, confidence=%.0f%%, blocking=%s, warning=%s",
            governance_scorecard.verdict,
            governance_scorecard.confidence * 100,
            governance_scorecard.blocking_factors,
            governance_scorecard.warning_factors,
        )
        
        # =====================================================================
        # PHASE 2.2: Attach v2 scoring to legacy scorecards for serialization
        # =====================================================================
        # This does NOT change points-based scoring, only adds v2 data for to_dict()
        scoring_v2_data = {
            "security_score": scoring_result.security_score,
            "privacy_score": scoring_result.privacy_score,
            "governance_score": scoring_result.governance_score,
            "overall_score": scoring_result.overall_score,
            "overall_confidence": scoring_result.overall_confidence,
            "decision": scoring_result.decision.value,
            "risk_level": scoring_result.risk_level.value,
            "hard_gates_triggered": scoring_result.hard_gates_triggered,
        }
        
        # Attach to SecurityScorecard
        security_scorecard.v2 = scoring_v2_data
        
        # Attach to GovernanceScorecard with additional decision context
        governance_scorecard.v2 = {
            "decision": scoring_result.decision.value,
            "decision_reasons": scoring_result.reasons,
            "scores": scoring_v2_data,
            "hard_gates": scoring_result.hard_gates_triggered,
            "overall_confidence": scoring_result.overall_confidence,
        }
        
        # Now serialize (to_dict will include v2 if present)
        security_scorecard_dict = security_scorecard.to_dict()
        governance_scorecard_dict = governance_scorecard.to_dict()
        
        # =====================================================================
        # LEGACY STAGES 2-4 (for backward compatibility)
        # =====================================================================
        
        # Stage 2: Build Facts
        logger.info("Stage 2: Building facts...")
        facts_builder = FactsBuilder(scan_id=scan_id)
        facts = facts_builder.build(
            manifest_data=manifest_data or {},
            analysis_results=analysis_results or {},
            extracted_files=extracted_files or [],
            extension_id=_extract_extension_id(chrome_extension_path),
            metadata=extension_metadata,
            artifact_path=extension_dir,
        )
        facts_dict = facts.model_dump(mode="json")
        
        # Stage 3: Build Evidence Index
        logger.info("Stage 3: Building evidence index...")
        evidence_builder = EvidenceIndexBuilder()
        evidence_index = evidence_builder.build(facts)
        evidence_dict = evidence_index.model_dump(mode="json")
        
        # Stage 4: Extract Signals (ALWAYS run both extractors, merge results)
        logger.info("Stage 4: Extracting signals...")
        signal_extractor = SignalExtractor()
        
        # ALWAYS call legacy SignalExtractor.extract() - don't lose existing signals
        legacy_signals = signal_extractor.extract(facts)
        legacy_signals_list = legacy_signals.signals
        
        # Also extract from SignalPack for new signal types
        signalpack_signals = signal_extractor.extract_from_signal_pack(signal_pack)
        signalpack_signals_list = signalpack_signals.signals
        
        # Merge signals: combine both, dedupe by type
        seen_signal_types = set()
        merged_signals = []
        
        # Prefer SignalPack signals (newer, more detailed)
        for sig in signalpack_signals_list:
            if sig.type not in seen_signal_types:
                merged_signals.append(sig)
                seen_signal_types.add(sig.type)
        
        # Add legacy signals that weren't in SignalPack
        for sig in legacy_signals_list:
            if sig.type not in seen_signal_types:
                merged_signals.append(sig)
                seen_signal_types.add(sig.type)
        
        # Create merged signals object
        from extension_shield.governance import Signals
        signals = Signals(scan_id=scan_id, signals=merged_signals)
        signals_dict = signals.model_dump(mode="json")
        
        # Link evidence from legacy evidence index
        signals_dict = link_evidence_to_signals(evidence_index, signals_dict, facts)
        
        logger.info(
            "Signal extraction: %d from SignalPack, %d from Facts, %d merged",
            len(signalpack_signals_list),
            len(legacy_signals_list),
            len(merged_signals),
        )
        
        # Stage 5: Extract Store Listing
        logger.info("Stage 5: Extracting store listing...")
        store_extractor = StoreListingExtractor()
        
        # Determine if this is a local upload or CWS extension
        is_local = not chrome_extension_path.startswith("https://chromewebstore")
        
        if is_local:
            store_listing = store_extractor.create_local_upload_listing()
        elif extension_metadata:
            store_listing = store_extractor.extract_from_metadata(
                extension_metadata,
                store_url=chrome_extension_path
            )
        else:
            store_listing = store_extractor.extract_from_url(chrome_extension_path)
        
        store_listing_dict = store_listing.model_dump(mode="json")
        
        # Stage 6: Build Context
        logger.info("Stage 6: Building governance context...")
        context_builder = ContextBuilder()
        context = context_builder.build(facts)
        context_dict = get_context_for_rules_engine(context)
        
        # Stage 7: Run Rules Engine
        logger.info("Stage 7: Evaluating rules...")
        rulepacks_dir = Path(__file__).parent.parent / "governance" / "rulepacks"
        rulepacks, rulepack_load_errors = RulesEngine.load_rulepacks_with_report(str(rulepacks_dir))
        if rulepack_load_errors:
            logger.warning("Rulepack load errors (failing closed): %s", rulepack_load_errors)
        rules_engine = RulesEngine(rulepacks, load_errors=rulepack_load_errors)
        
        rule_results = rules_engine.evaluate(
            scan_id=scan_id,
            facts=facts_dict,
            signals=signals_dict.get("signals", []),
            store_listing=store_listing_dict,
            context=context_dict,
        )
        rule_results_dict = rule_results.model_dump(mode="json")
        
        # Stage 8: Generate Report
        logger.info("Stage 8: Generating governance report...")
        report_generator = ReportGenerator()
        report = report_generator.generate(
            scan_id=scan_id,
            rule_results=rule_results,
            facts=facts,
            signals=signals,
            evidence_index=evidence_index,
            store_listing=store_listing,
            context=context,
        )
        report_dict = report.model_dump(mode="json")
        
        logger.info(
            "Governance pipeline complete: verdict=%s, rules_triggered=%d/%d",
            report.decision.verdict,
            report.rules_triggered,
            report.total_rules_evaluated,
        )

        # =====================================================================
        # SINGLE DECISION AUTHORITY (final verdict)
        # =====================================================================
        # One precedence chain reconciles org policy + baseline governance rules
        # + hard gates + scores + confidence. This is THE final verdict; the
        # rules-engine report and scoring decision are retained as detail/audit.
        gate_results = scoring_v2_gate_results or []
        blocking_gates = [g for g in gate_results if g.triggered and g.decision == "BLOCK"]
        warning_gates = [g for g in gate_results if g.triggered and g.decision == "WARN"]

        # Only EVIDENCE-BACKED governance rules may escalate the final verdict
        # above the V2 (behavior/evidence-based) decision. Advisory policy-hygiene
        # rules — broad host access, minification/obfuscation, generic
        # manifest/permission warnings, missing-policy — are surfaced as review
        # notes in rule_results but must not, on their own, make the verdict
        # stricter than V2. This keeps a clean V2 ALLOW from being downgraded by
        # vague signals while preserving genuine threat-intel / dataflow blocks.
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

        org_cfg = state.get("org_policy") or {}
        org_policy = (
            OrgPolicy(
                block_ids=set(org_cfg.get("block_ids", []) or []),
                allow_ids=set(org_cfg.get("allow_ids", []) or []),
            )
            if org_cfg
            else None
        )

        final_decision = resolve_decision(
            extension_id=scoring_result.extension_id or "",
            overall_score=scoring_result.overall_score,
            security_score=scoring_result.security_score,
            privacy_score=scoring_result.privacy_score,
            governance_score=scoring_result.governance_score,
            blocking_gates=blocking_gates,
            warning_gates=warning_gates,
            overall_confidence=scoring_result.overall_confidence,
            insufficient_data=bool(getattr(scoring_result, "insufficient_data", False)),
            baseline_block_reasons=baseline_block_reasons,
            baseline_review_reasons=baseline_review_reasons,
            org_policy=org_policy,
        )
        final_verdict = final_decision.verdict.value
        logger.info(
            "Final verdict (authority=%s): %s",
            final_decision.authority,
            final_verdict,
        )

        # Compile governance bundle (includes Layer 0 SignalPack + Layer 1 Scorecards)
        governance_bundle = {
            # Layer 0: Signal Pack (new 3-layer architecture)
            "signal_pack": signal_pack_dict,
            # Layer 1 (V2): ScoringEngine results - SINGLE SOURCE OF TRUTH
            "scoring_v2": {
                "security_score": scoring_result.security_score,
                "privacy_score": scoring_result.privacy_score,
                "governance_score": scoring_result.governance_score,
                "overall_score": scoring_result.overall_score,
                "overall_confidence": scoring_result.overall_confidence,
                "decision": scoring_result.decision.value,
                "risk_level": scoring_result.risk_level.value,
                "reasons": scoring_result.reasons,
                "hard_gates_triggered": scoring_result.hard_gates_triggered,
                "scoring_version": scoring_result.scoring_version,
                "base_overall": getattr(scoring_result, "base_overall", None),
                "gate_penalty": getattr(scoring_result, "gate_penalty", None),
                "gate_reasons": getattr(scoring_result, "gate_reasons", None),
                "coverage_cap_applied": getattr(scoring_result, "coverage_cap_applied", None),
                "coverage_cap_reason": getattr(scoring_result, "coverage_cap_reason", None),
                # Full layer breakdowns for transparency
                "security_layer": scoring_result.security_layer.model_dump_for_api() if scoring_result.security_layer else None,
                "privacy_layer": scoring_result.privacy_layer.model_dump_for_api() if scoring_result.privacy_layer else None,
                "governance_layer": scoring_result.governance_layer.model_dump_for_api() if scoring_result.governance_layer else None,
                # Explanation for UI/API
                "explanation": scoring_v2_explanation.to_dict() if scoring_v2_explanation else None,
                # Gate results for debugging
                "gate_results": [
                    {
                        "gate_id": g.gate_id,
                        "decision": g.decision,
                        "triggered": g.triggered,
                        "confidence": g.confidence,
                        "reasons": g.reasons,
                    }
                    for g in scoring_v2_gate_results
                ] if scoring_v2_gate_results else [],
            },
            # Layer 1 (Legacy): Security Scorecard - kept for backward compatibility
            "security_scorecard": security_scorecard_dict,
            # Layer 1 (Legacy): Governance Scorecard - kept for backward compatibility
            "governance_scorecard": governance_scorecard_dict,
            # Legacy stages
            "facts": facts_dict,
            "evidence_index": evidence_dict,
            "signals": signals_dict,
            "store_listing": store_listing_dict,
            "context": context_dict,
            "rule_results": rule_results_dict,
            "report": report_dict,
            # Decision (combines rules engine + governance scorecard)
            "decision": {
                # FINAL verdict from the single Decision Authority (authoritative)
                "final_verdict": final_verdict,
                "final_authority": final_decision.authority,
                "final_reasons": final_decision.reasons,
                "insufficient_data": final_decision.insufficient_data,
                # Version stamp so a stored verdict can be detected as stale and
                # refreshed on read after decision-logic changes (see
                # governance/decision_refresh.py + api/payload_helpers.py).
                "decision_version": DECISION_VERSION,
                # From rules engine (detail/audit)
                "verdict": report.decision.verdict,
                "rationale": report.decision.rationale,
                "action_required": report.decision.action_required,
                # From security scorecard (legacy)
                "security_score": security_scorecard.security_score,
                "risk_level_from_scorecard": security_scorecard.risk_level,
                # From governance scorecard (legacy)
                "governance_verdict": governance_scorecard.verdict,
                "governance_confidence": governance_scorecard.confidence,
                "governance_recommendation": governance_scorecard.recommendation,
                "blocking_factors": governance_scorecard.blocking_factors,
                "warning_factors": governance_scorecard.warning_factors,
                # From scoring_v2 (new single source of truth)
                "v2_decision": scoring_result.decision.value,
                "v2_overall_score": scoring_result.overall_score,
                "v2_hard_gates": scoring_result.hard_gates_triggered,
            },
            # UI-friendly explanation of "why" (webstore reputation for display)
            "webstore_reputation_behavior": governance_scorecard_dict.get("webstore_reputation_behavior"),
        }
        
        return Command(
            goto=CLEANUP_NODE,
            update={
                "governance_bundle": governance_bundle,
                "governance_verdict": final_verdict,
                "governance_report": report_dict,
            },
        )
        
    except Exception as exc:
        logger.exception("Governance pipeline failed: %s", exc)
        
        # Return partial results on error
        return Command(
            goto=CLEANUP_NODE,
            update={
                "governance_bundle": None,
                "governance_verdict": "ERROR",
                "governance_error": str(exc),
            },
        )


def _extract_extension_id(url: str) -> Optional[str]:
    """Extract extension ID from Chrome Web Store URL. Returns only if it matches ^[a-z]{32}$."""
    import re
    from extension_shield.utils.extension import is_chrome_extension_id

    if not url:
        return None
    match = re.search(r"/detail/(?:[^/]+/)?([a-z]{32})", url)
    candidate = match.group(1) if match else None
    return candidate if candidate and is_chrome_extension_id(candidate) else None

