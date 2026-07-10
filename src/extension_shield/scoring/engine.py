"""
Scoring Engine Module

THE SINGLE SOURCE OF TRUTH for extension risk scoring.

This module provides the main ScoringEngine class that orchestrates:
1. Signal normalization to severity [0,1] + confidence [0,1]
2. Layer score calculation (Security, Privacy, Governance)
3. Hard gate evaluation (can override scores)
4. Complete result generation with explanations

Mathematical Foundation:
    Layer Risk: R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
    Layer Score: score = round(100 × (1 - R))
    Overall Score: weighted average of layer scores

Where:
    w_i = weight of factor i
    c_i = confidence in factor i [0,1]
    s_i = severity of factor i [0,1]
"""

import logging
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.scoring.gates import (
    GateResult,
    HardGates,
    GateConfig,
    get_hard_gate_summary,
)
from extension_shield.scoring.models import (
    Decision,
    FactorScore,
    LayerScore,
    RiskLevel,
    ScoringResult,
)
from extension_shield.scoring.normalizers import (
    normalize_security_factors,
    normalize_privacy_factors,
)
from extension_shield.scoring.weights import (
    WeightPreset,
    get_weight_preset,
    GovernanceFactors,
    GOVERNANCE_WEIGHTS_V1,
)
from extension_shield.scoring.explain import (
    ExplanationPayload,
    ExplanationBuilder,
    FactorExplanation,
    LayerExplanation,
)
from extension_shield.scoring.decision import (
    DecisionPolicy,
    OrgPolicy,
    resolve as resolve_decision,
)


logger = logging.getLogger(__name__)


# Overall score is capped into the review band when analysis coverage is too low
# to clear an extension as safe (no SAST / VirusTotal / network signals).
INSUFFICIENT_DATA_SCORE_CAP = 65


# =============================================================================
# SCORING ENGINE
# =============================================================================

class ScoringEngine:
    """
    Unified scoring engine - THE SINGLE SOURCE OF TRUTH.
    
    Architecture:
    1. Normalize signals to severity [0,1] + confidence [0,1]
    2. Apply weights within each layer
    3. Combine via: R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
    4. Score = round(100 × (1 - R))
    5. Evaluate hard gates (can override score)
    6. Return complete result with explanation
    
    Usage:
        engine = ScoringEngine()
        result = engine.calculate_scores(signal_pack, manifest)
        
        # Access scores
        print(result.overall_score)
        print(result.decision)
        
        # Get explanation
        explanation = engine.get_explanation()
    """
    
    # Bumped 2.0.0 -> 2.1.0 for the SAST/governance recalibration (over-broad
    # CRITICAL/ERROR rule downgrades, CRITICAL_SAST corroboration, restricted-
    # permission gate rework). Rows stamped with an older version are treated as
    # model_stale so they are re-scored on read and rescanned on trigger, instead
    # of serving pre-recalibration verdicts.
    # Bumped 2.1.0 -> 2.1.1: privacy-policy absence is no longer scored by the
    # Security/Webstore factor (it was a double-count); Governance/DisclosureAlignment
    # is now the sole scored owner. See docs/adr/0002-scoring-layer-ownership.md.
    # Bumped 2.1.1 -> 2.1.2: bare broad-host access is no longer scored by the
    # Security/Manifest factor (it was an unconditional double-count);
    # Privacy/PermissionCombos is now the sole scored owner. Compound broad-host
    # uses (ToSViolations+VT, CaptureSignals, NetworkExfil, DisclosureAlignment)
    # are unchanged. See docs/adr/0002-scoring-layer-ownership.md.
    VERSION = "2.1.2"
    
    def __init__(
        self,
        weights_version: str = "v1",
        gate_config: Optional[GateConfig] = None,
    ):
        """
        Initialize ScoringEngine with weight preset and gate configuration.
        
        Args:
            weights_version: Version of weight preset to use (e.g., "v1")
            gate_config: Optional custom gate configuration
        """
        self.weights = get_weight_preset(weights_version)
        self.weights_version = weights_version
        self.gates = HardGates(gate_config)
        
        # Cache for last computation (for explanation generation)
        self._last_result: Optional[ScoringResult] = None
        self._last_explanation: Optional[ExplanationPayload] = None
        self._last_gate_results: Optional[List[GateResult]] = None
        
        logger.debug(
            "ScoringEngine initialized: version=%s, weights=%s",
            self.VERSION,
            weights_version,
        )
    
    def calculate_scores(
        self,
        signal_pack: SignalPack,
        manifest: Optional[Dict[str, Any]] = None,
        user_count: Optional[int] = None,
        permissions_analysis: Optional[Dict[str, Any]] = None,
    ) -> ScoringResult:
        """
        Main entry point - calculates all scores.
        
        This is THE SINGLE SOURCE OF TRUTH for extension scoring.
        All consumers (API, CLI, MCP, governance) should use this method.
        
        Args:
            signal_pack: Layer 0 SignalPack with normalized signals
            manifest: Optional manifest data for context
            user_count: Optional user count for popularity-based confidence adjustment
            permissions_analysis: Optional raw permissions analysis data
            
        Returns:
            ScoringResult with:
            - security_score: 0-100
            - privacy_score: 0-100
            - governance_score: 0-100
            - overall_score: weighted average
            - decision: ALLOW/NEEDS_REVIEW/BLOCK
            - reasons: list of decision reasons
            - explanation: full breakdown
        """
        manifest = manifest or {}
        scan_id = signal_pack.scan_id
        extension_id = signal_pack.extension_id or "unknown"
        
        logger.info(
            "Calculating scores: scan_id=%s, extension_id=%s",
            scan_id,
            extension_id,
        )
        
        # =====================================================================
        # STEP 1: Normalize all signals to factors
        # =====================================================================
        
        # Security factors
        security_factors = normalize_security_factors(
            sast=signal_pack.sast,
            vt=signal_pack.virustotal,
            entropy=signal_pack.entropy,
            manifest=manifest,
            perms=signal_pack.permissions,
            chromestats=signal_pack.chromestats,
            webstore_stats=signal_pack.webstore_stats,
            user_count=user_count,
        )
        # Coverage sanity: track whether SAST coverage is missing.
        # If no files were scanned and no findings exist, we treat coverage as limited
        # and will apply a deterministic cap + review decision later.
        sast_missing_coverage = (
            signal_pack.sast.files_scanned == 0
            and not signal_pack.sast.deduped_findings
        )
        
        # Privacy factors (use network signal pack for exfiltration analysis)
        privacy_factors = normalize_privacy_factors(
            perms=signal_pack.permissions,
            network=signal_pack.network,
            manifest=manifest,
            permissions_analysis=permissions_analysis,
        )
        
        # Governance factors (simpler - based on policy compliance)
        governance_factors = self._compute_governance_factors(
            signal_pack=signal_pack,
            manifest=manifest,
            security_factors=security_factors,
            privacy_factors=privacy_factors,
        )
        
        # =====================================================================
        # STEP 2: Calculate layer scores using confidence-weighted formula
        # =====================================================================
        
        security_score, security_risk = self._calculate_layer_score(
            security_factors,
            self.weights.security_weights,
        )
        
        privacy_score, privacy_risk = self._calculate_layer_score(
            privacy_factors,
            self.weights.privacy_weights,
        )
        
        governance_score, governance_risk = self._calculate_layer_score(
            governance_factors,
            self.weights.governance_weights,
        )
        
        # Build LayerScore objects (using adjusted scores after gate penalties)
        security_layer = LayerScore(
            layer_name="security",
            score=security_score,  # This is now the adjusted score
            risk=round(security_risk, 4),
            factors=security_factors,
        )
        
        privacy_layer = LayerScore(
            layer_name="privacy",
            score=privacy_score,  # This is now the adjusted score
            risk=round(privacy_risk, 4),
            factors=privacy_factors,
        )
        
        governance_layer = LayerScore(
            layer_name="governance",
            score=governance_score,  # This is now the adjusted score
            risk=round(governance_risk, 4),
            factors=governance_factors,
        )
        
        # =====================================================================
        # STEP 3: Evaluate hard gates (before calculating overall score)
        # =====================================================================
        
        layer_weights = self.weights.layer_weights
        base_overall = round(
            security_score * layer_weights.get("security", 0.34) +
            privacy_score * layer_weights.get("privacy", 0.33) +
            governance_score * layer_weights.get("governance", 0.33)
        )
        
        gate_results = self.gates.evaluate_all(signal_pack, manifest)
        self._last_gate_results = gate_results
        
        # STEP 3.1: Incorporate hard gate penalties into layer scores
        # Hard gates should affect the numeric scores, not just trigger decisions
        security_score, privacy_score, governance_score = self._apply_gate_penalties(
            security_score, privacy_score, governance_score, gate_results
        )
        
        overall_after_gates = round(
            security_score * layer_weights.get("security", 0.34) +
            privacy_score * layer_weights.get("privacy", 0.33) +
            governance_score * layer_weights.get("governance", 0.33)
        )
        gate_penalty = base_overall - overall_after_gates
        gate_reasons_list: List[str] = []
        for g in gate_results:
            if g.triggered and g.reasons:
                gate_reasons_list.extend(g.reasons[:2])
        
        # Rebuild LayerScore objects so .score and .risk stay consistent.
        # risk = 1 - score/100  (the inverse relationship defined by the formula)
        security_layer = LayerScore(
            layer_name="security",
            score=security_score,
            risk=round(1.0 - security_score / 100.0, 4),
            factors=security_layer.factors,
        )
        privacy_layer = LayerScore(
            layer_name="privacy",
            score=privacy_score,
            risk=round(1.0 - privacy_score / 100.0, 4),
            factors=privacy_layer.factors,
        )
        governance_layer = LayerScore(
            layer_name="governance",
            score=governance_score,
            risk=round(1.0 - governance_score / 100.0, 4),
            factors=governance_layer.factors,
        )
        
        # =====================================================================
        # STEP 4: Calculate overall score (weighted average of layers)
        # AFTER gate penalties are applied
        # =====================================================================
        
        overall_score = overall_after_gates

        # ---------------------------------------------------------------------
        # Overall confidence (P1.2): layer-weighted average of layer confidences.
        # NEVER defaults to 1.0 - empty/low-coverage scans must show low confidence.
        # ---------------------------------------------------------------------
        overall_confidence = round(
            security_layer.confidence * layer_weights.get("security", 0.34)
            + privacy_layer.confidence * layer_weights.get("privacy", 0.33)
            + governance_layer.confidence * layer_weights.get("governance", 0.33),
            3,
        )

        # ---------------------------------------------------------------------
        # Coverage sanity caps
        # ---------------------------------------------------------------------
        extra_review_reasons: List[str] = []
        coverage_cap_applied = False
        coverage_cap_reason: Optional[str] = None

        # Broad insufficient-data detection (P1.3): when NONE of the substantive
        # code/threat analyzers produced coverage, manifest/permission metadata
        # alone cannot clear an extension as safe. A zero-data extension must not
        # look like a confident 80/100. Cap into the review band and force review.
        sast_ran = (
            signal_pack.sast.files_scanned > 0 or bool(signal_pack.sast.deduped_findings)
        )
        vt_available = (
            signal_pack.virustotal.enabled and signal_pack.virustotal.total_engines > 0
        )
        network_ran = bool(getattr(signal_pack.network, "enabled", False))
        insufficient_data = (not sast_ran) and (not vt_available) and (not network_ran)
        insufficient_data_reason: Optional[str] = None

        # Partial-coverage guard (audit finding #11): even when SAST ran, an
        # extension whose malware scan (VirusTotal) AND network/exfiltration
        # analysis BOTH did not run must not be cleared as a confident high-score
        # ALLOW. SAST finding nothing is not evidence of safety when the two
        # highest-signal analyzers are absent. This is distinct from the
        # all-or-nothing insufficient_data case above.
        threat_coverage_missing = (not vt_available) and (not network_ran)

        if insufficient_data:
            insufficient_data_reason = (
                "Insufficient analysis coverage (no SAST, VirusTotal, or network signals)"
            )
            if overall_score > INSUFFICIENT_DATA_SCORE_CAP:
                overall_score = INSUFFICIENT_DATA_SCORE_CAP
            extra_review_reasons.append(insufficient_data_reason)
        elif threat_coverage_missing:
            # SAST ran, but neither VirusTotal nor network analysis did. Cap into
            # the review band and force NEEDS_REVIEW so a clean SAST pass alone
            # cannot produce a high-score ALLOW without malware/exfil coverage.
            if overall_score > INSUFFICIENT_DATA_SCORE_CAP:
                overall_score = INSUFFICIENT_DATA_SCORE_CAP
            coverage_cap_applied = True
            coverage_cap_reason = (
                "Limited threat coverage: neither VirusTotal nor network analysis "
                "ran; cannot clear as safe without malware/exfiltration coverage"
            )
            extra_review_reasons.append(coverage_cap_reason)
        elif sast_missing_coverage:
            # SAST-only coverage gap (other analyzers present). The cap only lowers
            # scores above 80, but the coverage flag + review reason MUST be emitted
            # for EVERY SAST-missing scan (even when the score is already <= 80) so
            # the UI can honestly surface "Partial coverage" instead of "Full
            # coverage". A missing code analyzer must never render as a confident,
            # fully-covered result. (Recent-scans trust fix.)
            if overall_score > 80:
                overall_score = 80
                coverage_cap_reason = "SAST coverage missing; score capped at 80"
            else:
                coverage_cap_reason = "SAST coverage missing; code was not analyzed"
            coverage_cap_applied = True
            extra_review_reasons.append(coverage_cap_reason)

        # SAST scan failure (D2): a Semgrep crash/timeout means the primary code
        # analyzer did not run to completion. Its absence of findings is NOT
        # evidence of safety, so cap into the review band and force NEEDS_REVIEW
        # regardless of the other layers. This is independent of the coverage
        # branches above (a failed scan can still report files_scanned > 0).
        if getattr(signal_pack.sast, "scan_error", False):
            if overall_score > INSUFFICIENT_DATA_SCORE_CAP:
                overall_score = INSUFFICIENT_DATA_SCORE_CAP
            coverage_cap_applied = True
            coverage_cap_reason = (
                "SAST scan failed or was incomplete; cannot clear as safe without "
                "code-analysis coverage"
            )
            extra_review_reasons.append(coverage_cap_reason)

        logger.debug(
            "Layer scores (after gate penalties): security=%d, privacy=%d, "
            "governance=%d, overall=%d, confidence=%.2f",
            security_score,
            privacy_score,
            governance_score,
            overall_score,
            overall_confidence,
        )

        # =====================================================================
        # STEP 5: Get gate results for decision making
        # =====================================================================

        blocking_gates = self.gates.get_blocking_gates(gate_results)
        warning_gates = self.gates.get_warning_gates(gate_results)

        triggered_gate_ids = [g.gate_id for g in blocking_gates + warning_gates]

        if blocking_gates:
            logger.info(
                "Hard gates triggered BLOCK: %s",
                [g.gate_id for g in blocking_gates],
            )

        # =====================================================================
        # STEP 6: Final verdict via the single Decision Authority
        # (scoring rungs only here; org/baseline-governance rungs are applied by
        #  the governance node, which has rulepack results. Same precedence fn.)
        # =====================================================================

        final = resolve_decision(
            extension_id=extension_id,
            overall_score=overall_score,
            security_score=security_score,
            privacy_score=privacy_score,
            governance_score=governance_score,
            blocking_gates=blocking_gates,
            warning_gates=warning_gates,
            overall_confidence=overall_confidence,
            insufficient_data=insufficient_data,
            extra_review_reasons=extra_review_reasons,
        )
        decision = final.verdict
        reasons = list(final.reasons)

        # =====================================================================
        # STEP 7: Build final result
        # =====================================================================

        result = ScoringResult(
            scan_id=scan_id,
            extension_id=extension_id,
            security_score=security_score,
            privacy_score=privacy_score,
            governance_score=governance_score,
            overall_score=overall_score,
            decision=decision,
            reasons=reasons,
            explanation=self._build_summary(
                decision=decision,
                overall_score=overall_score,
                security_layer=security_layer,
                privacy_layer=privacy_layer,
                governance_layer=governance_layer,
                triggered_gate_ids=triggered_gate_ids,
            ),
            security_layer=security_layer,
            privacy_layer=privacy_layer,
            governance_layer=governance_layer,
            hard_gates_triggered=triggered_gate_ids,
            scoring_version=self.VERSION,
            base_overall=base_overall,
            gate_penalty=gate_penalty,
            gate_reasons=gate_reasons_list or None,
            coverage_cap_applied=coverage_cap_applied,
            coverage_cap_reason=coverage_cap_reason,
            overall_confidence=overall_confidence,
            insufficient_data=insufficient_data,
            insufficient_data_reason=insufficient_data_reason,
            decision_authority=final.authority,
        )
        
        # Cache for explanation generation
        self._last_result = result
        self._last_explanation = self._build_explanation(
            result=result,
            security_factors=security_factors,
            privacy_factors=privacy_factors,
            governance_factors=governance_factors,
            gate_results=gate_results,
        )
        
        logger.info(
            "Scoring complete: overall=%d, decision=%s, gates_triggered=%d",
            overall_score,
            decision.value,
            len(triggered_gate_ids),
        )
        
        return result
    
    def _calculate_layer_score(
        self,
        factors: List[FactorScore],
        weights: Dict[str, float],
    ) -> Tuple[int, float]:
        """
        Calculate layer score using confidence-weighted formula.
        
        Formula:
            R = Σ(w_i × c_i × s_i) / Σ(w_i × c_i)
            Score = round(100 × (1 - R))
        
        Where:
            w_i = weight of factor i
            c_i = confidence in factor i [0,1]
            s_i = severity of factor i [0,1]
        
        Edge case: if Σ(w_i × c_i) == 0, return score=100 (no risk)
        
        Args:
            factors: List of FactorScore objects
            weights: Weight dictionary for the layer
            
        Returns:
            Tuple of (score: int [0-100], risk: float [0-1])
        """
        if not factors:
            return 100, 0.0
        
        # Calculate weighted sums
        weighted_risk_sum = 0.0
        weighted_confidence_sum = 0.0
        
        for factor in factors:
            w = weights.get(factor.name, factor.weight)
            c = factor.confidence
            s = factor.severity
            
            weighted_risk_sum += w * c * s
            weighted_confidence_sum += w * c
        
        # Handle edge case: no confidence-weighted data
        if weighted_confidence_sum == 0:
            return 100, 0.0
        
        # Calculate risk ratio
        risk = weighted_risk_sum / weighted_confidence_sum
        
        # Clamp to [0, 1]
        risk = max(0.0, min(1.0, risk))
        
        # Convert to score (invert: low risk = high score)
        score = round(100 * (1 - risk))
        
        return score, risk
    
    def _compute_governance_factors(
        self,
        signal_pack: SignalPack,
        manifest: Dict[str, Any],
        security_factors: List[FactorScore],
        privacy_factors: List[FactorScore],
    ) -> List[FactorScore]:
        """
        Compute governance layer factors.
        
        Governance factors assess policy compliance and behavioral consistency:
        - ToS violations (based on prohibited behaviors)
        - Consistency (claimed purpose vs actual behavior)
        - Disclosure alignment (privacy policy vs data collection)
        
        Args:
            signal_pack: SignalPack with normalized signals
            manifest: Manifest data
            security_factors: Already computed security factors
            privacy_factors: Already computed privacy factors
            
        Returns:
            List of governance FactorScore objects
        """
        factors: List[FactorScore] = []
        
        # Factor 1: ToS Violations
        # Check for explicit policy violations
        tos_severity = 0.0
        tos_flags: List[str] = []
        
        # Check for prohibited permissions (from gate logic)
        prohibited = {"debugger", "proxy", "nativeMessaging"}
        found_prohibited = prohibited.intersection(set(signal_pack.permissions.api_permissions))
        if found_prohibited:
            tos_severity += 0.5 * len(found_prohibited)
            tos_flags.extend([f"prohibited_perm:{p}" for p in found_prohibited])
        
        # Check for concerning permission combinations
        if signal_pack.permissions.has_broad_host_access:
            if signal_pack.virustotal.malicious_count > 0:
                tos_severity += 0.4
                tos_flags.append("broad_access_with_vt_detection")

        # Travel-docs / visa portal ToS automation risk (deterministic)
        # If an extension targets protected visa scheduling portals and can inject scripts
        # or capture screens, treat as a severe governance/compliance concern.
        try:
            from extension_shield.scoring.gates import TRAVEL_DOCS_PROTECTED_DOMAINS, VISA_SLOT_ECOSYSTEM_DOMAINS

            host_patterns = (signal_pack.permissions.host_permissions or []) + (signal_pack.permissions.api_permissions or [])
            host_text = " ".join([str(x).lower() for x in host_patterns if isinstance(x, str)])
            protected_hit = any(d in host_text for d in TRAVEL_DOCS_PROTECTED_DOMAINS)

            manifest_text = (
                json.dumps(manifest or {}, sort_keys=True, ensure_ascii=True).lower()
                if isinstance(manifest, dict) else ""
            )
            protected_hit = protected_hit or any(d in manifest_text for d in TRAVEL_DOCS_PROTECTED_DOMAINS)

            has_injection_capability = any(
                p in (signal_pack.permissions.api_permissions or [])
                for p in ["scripting", "webRequest", "webRequestBlocking", "declarativeNetRequest"]
            ) or bool(manifest.get("content_scripts"))

            has_capture_capability = any(
                p in (signal_pack.permissions.api_permissions or [])
                for p in ["tabCapture", "desktopCapture"]
            )

            ecosystem_hit = any(d in manifest_text for d in VISA_SLOT_ECOSYSTEM_DOMAINS)
            if protected_hit and (has_injection_capability or has_capture_capability or ecosystem_hit):
                tos_severity = max(tos_severity, 0.9)
                tos_flags.append("travel_docs_tos_automation_risk")
                if ecosystem_hit:
                    tos_flags.append("travel_docs_third_party_processor_risk")
        except Exception:
            logger.debug("Travel-docs ToS heuristic failed", exc_info=True)
        
        tos_severity = min(1.0, tos_severity)
        
        factors.append(FactorScore(
            name=GovernanceFactors.TOS_VIOLATIONS,
            severity=round(tos_severity, 4),
            confidence=0.9,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.TOS_VIOLATIONS],
            evidence_ids=[f"tos:{f}" for f in tos_flags[:3]],
            details={"violations": tos_flags},
            flags=tos_flags,
        ))
        
        # Factor 2: Consistency
        # Check if claimed purpose matches actual behavior
        consistency_severity = 0.0
        consistency_flags: List[str] = []
        
        name = manifest.get("name", "").lower()
        desc = manifest.get("description", "").lower()
        
        # Benign claims that shouldn't have risky behavior
        benign_claims = ["theme", "color", "font", "wallpaper", "new tab"]
        is_benign_claimed = any(claim in name or claim in desc for claim in benign_claims)
        
        # Check for inconsistency
        has_high_security_risk = any(f.severity > 0.5 for f in security_factors)
        has_high_privacy_risk = any(f.severity > 0.5 for f in privacy_factors)
        
        if is_benign_claimed and (has_high_security_risk or has_high_privacy_risk):
            consistency_severity = 0.6
            consistency_flags.append("benign_claim_risky_behavior")
        
        # Check for network access on offline-claimed extensions
        if "offline" in desc and signal_pack.permissions.has_broad_host_access:
            consistency_severity = max(consistency_severity, 0.4)
            consistency_flags.append("offline_claim_network_access")
        
        factors.append(FactorScore(
            name=GovernanceFactors.CONSISTENCY,
            severity=round(consistency_severity, 4),
            confidence=0.8,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.CONSISTENCY],
            evidence_ids=[f"consistency:{f}" for f in consistency_flags[:3]],
            details={
                "is_benign_claimed": is_benign_claimed,
                "has_high_security_risk": has_high_security_risk,
                "has_high_privacy_risk": has_high_privacy_risk,
            },
            flags=consistency_flags,
        ))
        
        # Factor 3: Disclosure Alignment
        # Check if privacy practices are disclosed
        disclosure_severity = 0.0
        disclosure_flags: List[str] = []
        
        has_privacy_policy = signal_pack.webstore_stats.has_privacy_policy
        has_data_collection = len(signal_pack.permissions.high_risk_permissions) > 0
        has_network = signal_pack.permissions.has_broad_host_access
        
        # Missing privacy policy with data collection = disclosure issue
        if not has_privacy_policy:
            if has_data_collection:
                disclosure_severity = 0.5
                disclosure_flags.append("no_privacy_policy_with_data_collection")
            elif has_network:
                disclosure_severity = 0.3
                disclosure_flags.append("no_privacy_policy_with_network")
        
        factors.append(FactorScore(
            name=GovernanceFactors.DISCLOSURE_ALIGNMENT,
            severity=round(disclosure_severity, 4),
            confidence=0.85,
            weight=GOVERNANCE_WEIGHTS_V1[GovernanceFactors.DISCLOSURE_ALIGNMENT],
            evidence_ids=[f"disclosure:{f}" for f in disclosure_flags[:3]],
            details={
                "has_privacy_policy": has_privacy_policy,
                "has_data_collection": has_data_collection,
                "has_network": has_network,
            },
            flags=disclosure_flags,
        ))
        
        return factors
    
    def _apply_gate_penalties(
        self,
        security_score: int,
        privacy_score: int, 
        governance_score: int,
        gate_results: List[GateResult],
    ) -> Tuple[int, int, int]:
        """
        Apply hard gate penalties to layer scores.
        
        Hard gates that trigger should significantly penalize the corresponding layer score.
        This ensures that gate findings are reflected in both decisions AND numeric scores.
        
        Args:
            security_score: Original security score
            privacy_score: Original privacy score
            governance_score: Original governance score
            gate_results: Results from hard gate evaluation
            
        Returns:
            Tuple of (adjusted_security_score, adjusted_privacy_score, adjusted_governance_score)
        """
        # Gate penalty mappings (gate_id -> (layer, penalty))
        # BLOCK gates get higher penalty than WARN gates
        gate_penalties = {
            'CRITICAL_SAST': ('security', 50),      # BLOCK gate
            'VT_MALWARE': ('security', 45),         # BLOCK gate
            'TOS_VIOLATION': ('governance', 60),    # BLOCK gate - severe governance issue
            'PURPOSE_MISMATCH': ('governance', 45), # WARN/BLOCK gate - major consistency issue
            'SENSITIVE_EXFIL': ('privacy', 40),     # WARN gate
        }
        
        # Track penalties by layer
        security_penalty = 0
        privacy_penalty = 0
        governance_penalty = 0
        
        for gate_result in gate_results:
            if not gate_result.triggered:
                continue
                
            gate_config = gate_penalties.get(gate_result.gate_id)
            if not gate_config:
                continue
                
            layer, base_penalty = gate_config
            
            # Scale penalty based on gate decision severity and confidence
            penalty_multiplier = 1.0
            if gate_result.decision == 'BLOCK':
                penalty_multiplier = 1.0  # Full penalty for BLOCK
            elif gate_result.decision == 'WARN':
                penalty_multiplier = 0.7  # Reduced penalty for WARN
            
            # Apply confidence scaling
            adjusted_penalty = int(base_penalty * penalty_multiplier * gate_result.confidence)
            
            # Apply penalty to appropriate layer
            if layer == 'security':
                security_penalty = max(security_penalty, adjusted_penalty)
            elif layer == 'privacy':
                privacy_penalty = max(privacy_penalty, adjusted_penalty)
            elif layer == 'governance':
                governance_penalty = max(governance_penalty, adjusted_penalty)
        
        # Apply penalties (ensure scores don't go below 0)
        adjusted_security = max(0, security_score - security_penalty)
        adjusted_privacy = max(0, privacy_score - privacy_penalty)
        adjusted_governance = max(0, governance_score - governance_penalty)
        
        # Log penalties for debugging
        if security_penalty > 0 or privacy_penalty > 0 or governance_penalty > 0:
            logger.info(
                "Applied gate penalties: security %d->%d (-%d), privacy %d->%d (-%d), governance %d->%d (-%d)",
                security_score, adjusted_security, security_penalty,
                privacy_score, adjusted_privacy, privacy_penalty,
                governance_score, adjusted_governance, governance_penalty,
            )
        
        return adjusted_security, adjusted_privacy, adjusted_governance
    
    def _build_summary(
        self,
        decision: Decision,
        overall_score: int,
        security_layer: LayerScore,
        privacy_layer: LayerScore,
        governance_layer: LayerScore,
        triggered_gate_ids: List[str],
    ) -> str:
        """Build human-readable summary string."""
        parts = [
            f"Overall: {overall_score}/100 ({decision.value})",
            f"Security: {security_layer.score}/100",
            f"Privacy: {privacy_layer.score}/100",
            f"Governance: {governance_layer.score}/100",
        ]
        
        if triggered_gate_ids:
            parts.append(f"Gates triggered: {', '.join(triggered_gate_ids)}")
        
        # Identify top risk factors
        all_factors = (
            security_layer.factors +
            privacy_layer.factors +
            governance_layer.factors
        )
        high_risk = [
            f for f in all_factors
            if f.severity >= 0.4 and f.confidence >= 0.6
        ]
        
        if high_risk:
            sorted_factors = sorted(high_risk, key=lambda f: f.contribution, reverse=True)
            top_names = [f.name for f in sorted_factors[:3]]
            parts.append(f"Key factors: {', '.join(top_names)}")
        
        return " | ".join(parts)
    
    def _build_explanation(
        self,
        result: ScoringResult,
        security_factors: List[FactorScore],
        privacy_factors: List[FactorScore],
        governance_factors: List[FactorScore],
        gate_results: List[GateResult],
    ) -> ExplanationPayload:
        """
        Build complete explanation payload using ExplanationBuilder.
        
        Delegates to the ExplanationBuilder for consistent explanation generation.
        """
        builder = ExplanationBuilder(
            scoring_version=self.VERSION,
            weights_version=self.weights_version,
        )
        return builder.build_from_result(result, gate_results)
    
    def get_last_result(self) -> Optional[ScoringResult]:
        """Get the last computed ScoringResult."""
        return self._last_result
    
    def get_explanation(self) -> Optional[ExplanationPayload]:
        """
        Get the explanation payload for the last computation.
        
        Returns:
            ExplanationPayload if calculate_scores was called, None otherwise
        """
        return self._last_explanation
    
    def get_gate_results(self) -> Optional[List[GateResult]]:
        """Get the gate results from the last computation."""
        return self._last_gate_results


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def calculate_extension_score(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    user_count: Optional[int] = None,
    weights_version: str = "v1",
) -> ScoringResult:
    """
    Convenience function to calculate extension score.
    
    This is the recommended entry point for most use cases.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        user_count: Optional user count
        weights_version: Weight preset version
        
    Returns:
        Complete ScoringResult
    """
    engine = ScoringEngine(weights_version=weights_version)
    return engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count,
    )


def get_score_explanation(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    user_count: Optional[int] = None,
    weights_version: str = "v1",
) -> Tuple[ScoringResult, ExplanationPayload]:
    """
    Calculate scores and return both result and explanation.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        user_count: Optional user count
        weights_version: Weight preset version
        
    Returns:
        Tuple of (ScoringResult, ExplanationPayload)
    """
    engine = ScoringEngine(weights_version=weights_version)
    result = engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count,
    )
    explanation = engine.get_explanation()
    return result, explanation

