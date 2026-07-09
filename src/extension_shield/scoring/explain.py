"""
Explanation Builder Module

Builds human-readable and machine-parseable explanations for scoring results.
Provides structured output suitable for:
- API responses
- Frontend UI display
- Audit logs
- Debugging

Output formats support both detailed technical explanations and
simplified summaries for end-user display.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from extension_shield.scoring.gates import GateResult, get_hard_gate_summary
from extension_shield.scoring.models import (
    Decision,
    FactorScore,
    LayerScore,
    RiskLevel,
    ScoringResult,
)


# =============================================================================
# EXPLANATION DATA STRUCTURES
# =============================================================================

@dataclass
class FactorExplanation:
    """
    Explanation for a single factor's contribution to layer score.
    
    Provides all information needed to understand why a factor
    contributed to the overall risk assessment.
    """
    name: str
    severity: float
    confidence: float
    weight: float
    contribution: float
    risk_level: str
    flags: List[str] = field(default_factory=list)
    evidence_ids: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    summary: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "severity": round(self.severity, 3),
            "confidence": round(self.confidence, 3),
            "weight": round(self.weight, 3),
            "contribution": round(self.contribution, 4),
            "risk_level": self.risk_level,
            "flags": self.flags,
            "evidence_ids": self.evidence_ids,
            "details": self.details,
            "summary": self.summary,
        }


@dataclass
class LayerExplanation:
    """
    Explanation for a layer's score calculation.
    
    Includes the layer score, all factor contributions, and
    identifies the top risk contributors.
    """
    layer_name: str
    score: int
    risk: float
    risk_level: str
    confidence: float
    factors: List[FactorExplanation] = field(default_factory=list)
    top_contributors: List[str] = field(default_factory=list)
    summary: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "layer_name": self.layer_name,
            "score": self.score,
            "risk": round(self.risk, 4),
            "risk_level": self.risk_level,
            "confidence": round(self.confidence, 3),
            "factors": [f.to_dict() for f in self.factors],
            "top_contributors": self.top_contributors,
            "summary": self.summary,
        }


@dataclass
class ExplanationPayload:
    """
    Complete explanation payload for human + machine readability.
    
    This is the main output structure containing all information
    needed to explain why an extension received its scores and decision.
    
    Structure:
    {
        "summary": "Security score 85/100 - Low risk",
        "decision_rationale": "Extension passed all checks",
        "layers": {
            "security": { score, risk, factors: [...] },
            "privacy": { ... },
            "governance": { ... }
        },
        "hard_gates": {
            "triggered": false,
            "gates_checked": ["VT_MALWARE", ...],
            "results": [...]
        },
        "scoring_version": "v2",
        "weights_version": "v1"
    }
    """
    scan_id: str
    extension_id: str
    overall_score: int
    decision: str
    decision_rationale: str
    decision_reasons: List[str] = field(default_factory=list)
    
    security: Optional[LayerExplanation] = None
    privacy: Optional[LayerExplanation] = None
    governance: Optional[LayerExplanation] = None
    
    hard_gates: Dict[str, Any] = field(default_factory=dict)
    triggered_gates: List[str] = field(default_factory=list)
    
    scoring_version: str = "2.0.0"
    weights_version: str = "v1"
    computed_at: str = ""
    overall_confidence: float = 1.0  # Per Phase 1 fixups: layer-weighted avg of layer confidences
    
    summary: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "scan_id": self.scan_id,
            "extension_id": self.extension_id,
            "overall_score": self.overall_score,
            "overall_confidence": round(self.overall_confidence, 3),
            "decision": self.decision,
            "decision_rationale": self.decision_rationale,
            "decision_reasons": self.decision_reasons,
            "summary": self.summary,
            "layers": {
                "security": self.security.to_dict() if self.security else None,
                "privacy": self.privacy.to_dict() if self.privacy else None,
                "governance": self.governance.to_dict() if self.governance else None,
            },
            "hard_gates": self.hard_gates,
            "triggered_gates": self.triggered_gates,
            "scoring_version": self.scoring_version,
            "weights_version": self.weights_version,
            "computed_at": self.computed_at,
        }


# =============================================================================
# EXPLANATION BUILDER
# =============================================================================

class ExplanationBuilder:
    """
    Builds human-readable and machine-parseable explanations.
    
    Provides structured explanations for scoring results that can be:
    - Displayed in UI
    - Returned via API
    - Logged for auditing
    - Used for debugging
    
    Usage:
        builder = ExplanationBuilder()
        explanation = builder.build(
            security_factors=security_factors,
            privacy_factors=privacy_factors,
            governance_factors=governance_factors,
            gate_results=gate_results,
            layer_scores={"security": 85, "privacy": 90, "governance": 95},
            decision="ALLOW",
            reasons=["All checks passed"],
        )
        
        # Get JSON-serializable dict
        explanation_dict = explanation.to_dict()
        
        # Get simplified UI format
        ui_data = builder.format_for_ui(explanation_dict)
    """
    
    def __init__(
        self,
        scoring_version: str = "2.0.0",
        weights_version: str = "v1",
    ):
        """
        Initialize ExplanationBuilder.
        
        Args:
            scoring_version: Version of the scoring engine
            weights_version: Version of the weight preset used
        """
        self.scoring_version = scoring_version
        self.weights_version = weights_version
    
    def build(
        self,
        security_factors: List[FactorScore],
        privacy_factors: List[FactorScore],
        governance_factors: List[FactorScore],
        gate_results: List[GateResult],
        layer_scores: Dict[str, int],
        decision: str,
        reasons: List[str],
        scan_id: str = "",
        extension_id: str = "",
        overall_score: Optional[int] = None,
    ) -> ExplanationPayload:
        """
        Build complete explanation payload.
        
        Args:
            security_factors: List of security FactorScore
            privacy_factors: List of privacy FactorScore
            governance_factors: List of governance FactorScore
            gate_results: List of GateResult from hard gates
            layer_scores: Dict with layer scores {"security": int, "privacy": int, "governance": int}
            decision: Final decision string (ALLOW, BLOCK, NEEDS_REVIEW)
            reasons: List of decision reason strings
            scan_id: Optional scan identifier
            extension_id: Optional extension identifier
            overall_score: Optional overall score (calculated if not provided)
            
        Returns:
            Complete ExplanationPayload
        """
        # Calculate overall score if not provided
        if overall_score is None:
            overall_score = int(
                layer_scores.get("security", 100) * 0.5 +
                layer_scores.get("privacy", 100) * 0.3 +
                layer_scores.get("governance", 100) * 0.2
            )
        
        # Build layer explanations
        security_exp = self._build_layer_explanation(
            layer_name="security",
            factors=security_factors,
            score=layer_scores.get("security", 100),
        )
        
        privacy_exp = self._build_layer_explanation(
            layer_name="privacy",
            factors=privacy_factors,
            score=layer_scores.get("privacy", 100),
        )
        
        governance_exp = self._build_layer_explanation(
            layer_name="governance",
            factors=governance_factors,
            score=layer_scores.get("governance", 100),
        )
        
        # Build gate summary
        gate_summary = get_hard_gate_summary(gate_results)
        triggered_gates = [g.gate_id for g in gate_results if g.triggered]
        
        # Build decision rationale
        decision_rationale = self._build_decision_rationale(
            decision=decision,
            overall_score=overall_score,
            triggered_gates=triggered_gates,
            reasons=reasons,
        )
        
        # Build summary
        summary = self.get_summary(overall_score, decision)
        
        # Calculate overall confidence (layer-weighted average of layer confidences)
        # Per Phase 1 fixups: overall_conf = LAYER_WEIGHTS-weighted avg of layer_conf
        overall_confidence = (
            security_exp.confidence * 0.5 +
            privacy_exp.confidence * 0.3 +
            governance_exp.confidence * 0.2
        )
        
        return ExplanationPayload(
            scan_id=scan_id,
            extension_id=extension_id,
            overall_score=overall_score,
            decision=decision,
            decision_rationale=decision_rationale,
            decision_reasons=reasons,
            security=security_exp,
            privacy=privacy_exp,
            governance=governance_exp,
            hard_gates=gate_summary,
            triggered_gates=triggered_gates,
            scoring_version=self.scoring_version,
            weights_version=self.weights_version,
            computed_at=datetime.now(timezone.utc).isoformat(),
            overall_confidence=round(overall_confidence, 3),
            summary=summary,
        )
    
    def build_from_result(
        self,
        result: ScoringResult,
        gate_results: List[GateResult],
    ) -> ExplanationPayload:
        """
        Build explanation from a ScoringResult.
        
        Convenience method for when you already have a ScoringResult.
        
        Args:
            result: Complete ScoringResult
            gate_results: List of GateResult from evaluation
            
        Returns:
            ExplanationPayload
        """
        return self.build(
            security_factors=result.security_layer.factors if result.security_layer else [],
            privacy_factors=result.privacy_layer.factors if result.privacy_layer else [],
            governance_factors=result.governance_layer.factors if result.governance_layer else [],
            gate_results=gate_results,
            layer_scores={
                "security": result.security_score,
                "privacy": result.privacy_score,
                "governance": result.governance_score,
            },
            decision=result.decision.value,
            reasons=result.reasons,
            scan_id=result.scan_id,
            extension_id=result.extension_id,
            overall_score=result.overall_score,
        )
    
    def _build_layer_explanation(
        self,
        layer_name: str,
        factors: List[FactorScore],
        score: int,
    ) -> LayerExplanation:
        """
        Build explanation for a single layer.
        
        Per Phase 1 fixups:
        - Sort factors by descending contribution before returning
        - Include layer confidence for aggregation
        """
        # Sort factors by contribution (descending) for consistent ordering
        sorted_factors = sorted(factors, key=lambda f: f.contribution, reverse=True)
        
        # Convert sorted factors to explanations
        factor_explanations = [
            self._factor_to_explanation(f) for f in sorted_factors
        ]
        
        # Calculate layer risk and confidence
        # Formula: layer_conf = sum(w_i * c_i) / sum(w_i) 
        if factors:
            total_weight = sum(f.weight for f in factors)
            if total_weight > 0:
                risk = sum(f.contribution for f in factors) / total_weight
                # Weighted confidence: how confident are we in this layer?
                confidence = sum(f.confidence * f.weight for f in factors) / total_weight
            else:
                risk = 0.0
                confidence = 0.0
        else:
            risk = 0.0
            confidence = 0.0
        
        # Get risk level
        risk_level = RiskLevel.from_score(score).value
        
        # Identify top contributors (already sorted) with plain names
        top_contributors = [
            self.FACTOR_PLAIN_NAMES.get(f.name, f.name)
            for f in sorted_factors[:3]
            if f.contribution > 0.01
        ]
        
        summary = f"{layer_name.title()}: {score}/100 ({risk_level} risk)"
        if top_contributors:
            summary += f" — driven by {', '.join(top_contributors[:2])}"
        
        return LayerExplanation(
            layer_name=layer_name,
            score=score,
            risk=round(risk, 4),
            risk_level=risk_level,
            confidence=round(confidence, 3),
            factors=factor_explanations,
            top_contributors=top_contributors,
            summary=summary,
        )
    
    FACTOR_PLAIN_NAMES = {
        "SAST": "code security scan",
        "VirusTotal": "antivirus scan",
        "Entropy": "code obfuscation check",
        "ManifestPosture": "extension configuration",
        "ChromeStats": "Chrome Web Store reputation",
        "WebStoreTrust": "developer trust signals",
        "MaintenanceHealth": "update and maintenance status",
        "PermissionsBaseline": "permission risk level",
        "PermissionCombos": "risky permission combinations",
        "NetworkExfil": "external data transfer check",
        "CaptureSignals": "screen or input capture check",
    }

    def _factor_to_explanation(self, factor: FactorScore) -> FactorExplanation:
        """Convert FactorScore to FactorExplanation."""
        if factor.severity > 0.5:
            severity_desc = "significant"
        elif factor.severity > 0.2:
            severity_desc = "moderate"
        elif factor.severity > 0:
            severity_desc = "minor"
        else:
            severity_desc = "no"
        
        plain_name = self.FACTOR_PLAIN_NAMES.get(factor.name, factor.name)
        summary = f"{severity_desc.capitalize()} findings in {plain_name}"
        if factor.flags:
            summary += f" — {factor.flags[0]}"
        
        return FactorExplanation(
            name=factor.name,
            severity=factor.severity,
            confidence=factor.confidence,
            weight=factor.weight,
            contribution=factor.contribution,
            risk_level=factor.risk_level.value,
            flags=factor.flags,
            evidence_ids=factor.evidence_ids,
            details=factor.details,
            summary=summary,
        )
    
    GATE_PLAIN_NAMES = {
        "CRITICAL_SAST": "dangerous code patterns",
        "SENSITIVE_EXFIL": "permissions that could send data externally",
        "PURPOSE_MISMATCH": "behavior not matching its stated purpose",
        "VT_MALWARE": "antivirus flags",
        "TOS_VIOLATION": "policy violations",
        "MANIFEST_POSTURE": "suspicious configuration",
        "CAPTURE_SIGNALS": "screen or input capture",
    }

    def _build_decision_rationale(
        self,
        decision: str,
        overall_score: int,
        triggered_gates: List[str],
        reasons: List[str],
    ) -> str:
        """Build human-readable decision rationale."""
        if decision == "BLOCK":
            if triggered_gates:
                gate_descriptions = [self.GATE_PLAIN_NAMES.get(g, g) for g in triggered_gates]
                return (
                    f"This extension was blocked because our scan found "
                    f"{', '.join(gate_descriptions)}. "
                    f"We recommend not installing it."
                )
            else:
                return (
                    f"This extension was blocked due to a low safety score "
                    f"({overall_score}/100). Multiple concerns were found."
                )
        
        elif decision == "NEEDS_REVIEW":
            if triggered_gates:
                gate_descriptions = [self.GATE_PLAIN_NAMES.get(g, g) for g in triggered_gates]
                return (
                    f"This extension needs careful review. Our scan flagged "
                    f"{', '.join(gate_descriptions)}. "
                    f"Check the details before installing."
                )
            else:
                return (
                    f"This extension needs review (score: {overall_score}/100). "
                    f"Some concerns were found that you should check before installing."
                )
        
        else:  # ALLOW
            return (
                f"This extension looks safe (score: {overall_score}/100). "
                f"No critical issues were found in our security scan."
            )
    
    def get_summary(self, score: int, decision: str) -> str:
        """
        Get brief summary string for the score and decision.
        
        Args:
            score: Overall score 0-100
            decision: Decision string
            
        Returns:
            Brief summary like "Security score 85/100 - Low risk"
        """
        risk_level = RiskLevel.from_score(score)
        
        if decision == "BLOCK":
            return f"Score {score}/100 - BLOCKED ({risk_level.value} risk)"
        elif decision == "NEEDS_REVIEW":
            return f"Score {score}/100 - NEEDS REVIEW ({risk_level.value} risk)"
        else:
            return f"Score {score}/100 - ALLOWED ({risk_level.value} risk)"
    
    def format_for_ui(self, explanation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format explanation for frontend display with simplified structure.
        
        Transforms the full explanation into a UI-friendly format with:
        - Simplified factor displays
        - Color-coded risk indicators
        - Formatted percentages
        - User-friendly labels
        
        Args:
            explanation: Full explanation dict from to_dict()
            
        Returns:
            Simplified dict optimized for UI rendering
        """
        def _format_factor(factor: Dict[str, Any]) -> Dict[str, Any]:
            """Format a single factor for UI."""
            severity_pct = int(factor.get("severity", 0) * 100)
            confidence_pct = int(factor.get("confidence", 0) * 100)
            
            # Determine color based on severity
            if severity_pct >= 60:
                color = "red"
                status = "critical"
            elif severity_pct >= 40:
                color = "orange"
                status = "warning"
            elif severity_pct >= 20:
                color = "yellow"
                status = "caution"
            else:
                color = "green"
                status = "ok"
            
            return {
                "name": factor.get("name", "Unknown"),
                "severity_pct": severity_pct,
                "confidence_pct": confidence_pct,
                "contribution_pct": round(factor.get("contribution", 0) * 100, 1),
                "color": color,
                "status": status,
                "flags": factor.get("flags", []),
                "summary": factor.get("summary", ""),
            }
        
        def _format_layer(layer: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
            """Format a layer for UI."""
            if not layer:
                return None
            
            score = layer.get("score", 100)
            
            # Determine layer color
            if score >= 80:
                color = "green"
            elif score >= 60:
                color = "yellow"
            elif score >= 40:
                color = "orange"
            else:
                color = "red"
            
            return {
                "name": layer.get("layer_name", "").title(),
                "score": score,
                "score_display": f"{score}/100",
                "color": color,
                "risk_level": layer.get("risk_level", "unknown"),
                "top_concerns": layer.get("top_contributors", [])[:3],
                "factors": [
                    _format_factor(f)
                    for f in layer.get("factors", [])
                ],
            }
        
        # Format decision badge
        decision = explanation.get("decision", "ALLOW")
        if decision == "BLOCK":
            decision_color = "red"
            decision_icon = "🛑"
        elif decision == "NEEDS_REVIEW":
            decision_color = "orange"
            decision_icon = "⚠️"
        else:
            decision_color = "green"
            decision_icon = "✅"
        
        # Format gates
        gates = explanation.get("hard_gates", {})
        triggered_gates = explanation.get("triggered_gates", [])
        
        return {
            "score": {
                "value": explanation.get("overall_score", 100),
                "display": f"{explanation.get('overall_score', 100)}/100",
                "label": self.get_summary(
                    explanation.get("overall_score", 100),
                    decision,
                ),
            },
            "decision": {
                "value": decision,
                "color": decision_color,
                "icon": decision_icon,
                "rationale": explanation.get("decision_rationale", ""),
                "reasons": explanation.get("decision_reasons", []),
            },
            "layers": {
                "security": _format_layer(
                    explanation.get("layers", {}).get("security")
                ),
                "privacy": _format_layer(
                    explanation.get("layers", {}).get("privacy")
                ),
                "governance": _format_layer(
                    explanation.get("layers", {}).get("governance")
                ),
            },
            "gates": {
                "triggered": len(triggered_gates) > 0,
                "triggered_gates": triggered_gates,
                "blocking_count": gates.get("blocking_count", 0),
                "warning_count": gates.get("warning_count", 0),
            },
            "meta": {
                "scan_id": explanation.get("scan_id", ""),
                "extension_id": explanation.get("extension_id", ""),
                "scoring_version": explanation.get("scoring_version", ""),
                "computed_at": explanation.get("computed_at", ""),
            },
        }
    
    def format_for_api(self, explanation: Dict[str, Any]) -> Dict[str, Any]:
        """
        Format explanation for API response.
        
        Similar to format_for_ui but with full detail for programmatic access.
        
        Args:
            explanation: Full explanation dict from to_dict()
            
        Returns:
            API-formatted dict
        """
        # API format is essentially the same as the full explanation
        # but with some additional convenience fields
        api_format = explanation.copy()
        
        # Add convenience fields
        api_format["is_blocked"] = explanation.get("decision") == "BLOCK"
        api_format["needs_review"] = explanation.get("decision") == "NEEDS_REVIEW"
        api_format["is_allowed"] = explanation.get("decision") == "ALLOW"
        
        # Add layer score summary
        layers = explanation.get("layers", {})
        api_format["layer_scores"] = {
            "security": layers.get("security", {}).get("score", 100) if layers.get("security") else 100,
            "privacy": layers.get("privacy", {}).get("score", 100) if layers.get("privacy") else 100,
            "governance": layers.get("governance", {}).get("score", 100) if layers.get("governance") else 100,
        }
        
        return api_format
    
    def format_for_log(self, explanation: Dict[str, Any]) -> str:
        """
        Format explanation for logging/audit.
        
        Returns a compact string suitable for log entries.
        
        Args:
            explanation: Full explanation dict from to_dict()
            
        Returns:
            Compact log string
        """
        parts = [
            f"scan_id={explanation.get('scan_id', 'unknown')}",
            f"ext_id={explanation.get('extension_id', 'unknown')}",
            f"score={explanation.get('overall_score', 0)}",
            f"decision={explanation.get('decision', 'UNKNOWN')}",
        ]
        
        layers = explanation.get("layers", {})
        if layers.get("security"):
            parts.append(f"security={layers['security'].get('score', 100)}")
        if layers.get("privacy"):
            parts.append(f"privacy={layers['privacy'].get('score', 100)}")
        if layers.get("governance"):
            parts.append(f"governance={layers['governance'].get('score', 100)}")
        
        triggered = explanation.get("triggered_gates", [])
        if triggered:
            parts.append(f"gates={','.join(triggered)}")
        
        return " | ".join(parts)


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def build_explanation(
    result: ScoringResult,
    gate_results: List[GateResult],
    scoring_version: str = "2.0.0",
    weights_version: str = "v1",
) -> ExplanationPayload:
    """
    Convenience function to build explanation from ScoringResult.
    
    Args:
        result: Complete ScoringResult
        gate_results: List of GateResult from evaluation
        scoring_version: Scoring engine version
        weights_version: Weight preset version
        
    Returns:
        ExplanationPayload
    """
    builder = ExplanationBuilder(
        scoring_version=scoring_version,
        weights_version=weights_version,
    )
    return builder.build_from_result(result, gate_results)


def get_ui_explanation(
    result: ScoringResult,
    gate_results: List[GateResult],
) -> Dict[str, Any]:
    """
    Get UI-formatted explanation from ScoringResult.
    
    Args:
        result: Complete ScoringResult
        gate_results: List of GateResult from evaluation
        
    Returns:
        UI-formatted explanation dict
    """
    builder = ExplanationBuilder()
    explanation = builder.build_from_result(result, gate_results)
    return builder.format_for_ui(explanation.to_dict())

