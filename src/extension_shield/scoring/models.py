"""
Scoring Models

Pydantic models for the V2 scoring architecture with normalized [0,1] severities
and confidences. All scores are explainable with factor contributions and evidence.
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, computed_field


def _current_scoring_version() -> str:
    """Single source of truth for a ``ScoringResult``'s default ``scoring_version``.

    The canonical version lives on ``ScoringEngine.VERSION``. It is imported
    lazily (inside the function body, not at module scope) because ``engine.py``
    imports this module at load time — a module-level ``from ...engine import
    ScoringEngine`` here would create a circular import. ``explain.py`` also
    imports this module, so we deliberately do not reuse its helper either.
    Resolving at instantiation time is safe: the engine module is always fully
    loaded before any ``ScoringResult`` is built. This keeps the default from
    drifting behind the engine version (it used to be a hardcoded ``"2.0.0"``).
    """
    from extension_shield.scoring.engine import ScoringEngine

    return ScoringEngine.VERSION


class RiskLevel(str, Enum):
    """Risk level classification based on score thresholds."""
    
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"
    
    @classmethod
    def from_severity(cls, severity: float) -> "RiskLevel":
        """Convert normalized severity [0,1] to risk level."""
        if severity >= 0.8:
            return cls.CRITICAL
        elif severity >= 0.6:
            return cls.HIGH
        elif severity >= 0.4:
            return cls.MEDIUM
        elif severity > 0.0:
            return cls.LOW
        return cls.NONE
    
    @classmethod
    def from_score(cls, score: int) -> "RiskLevel":
        """
        Convert score [0-100] to risk level (higher score = safer).

        Thresholds (aligned with frontend riskBands.js):
        - Red (HIGH/CRITICAL): 0-49
        - Yellow (MEDIUM/WARN): 50-74
        - Green (LOW/NONE): 75-100
        """
        if score < 50:
            # 0-49: Red zone (HIGH or CRITICAL)
            if score < 30:
                return cls.CRITICAL
            return cls.HIGH
        elif score < 75:
            # 50-74: Yellow zone (MEDIUM)
            return cls.MEDIUM
        else:
            # 75-100: Green zone (LOW or NONE)
            if score >= 95:
                return cls.NONE
            return cls.LOW


class Decision(str, Enum):
    """Governance decision for extension approval."""
    
    ALLOW = "ALLOW"
    BLOCK = "BLOCK"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class FactorScore(BaseModel):
    """
    Individual factor score with normalized severity and confidence.
    
    Represents a single scoring factor (e.g., SAST findings, VirusTotal detections)
    with all information needed for explainability and weighted aggregation.
    """
    
    name: str = Field(
        description="Unique identifier for this factor (e.g., 'SAST', 'VirusTotal')"
    )
    severity: float = Field(
        ge=0.0,
        le=1.0,
        description="Normalized severity score [0,1] where 0 = no risk, 1 = max risk"
    )
    confidence: float = Field(
        ge=0.0,
        le=1.0,
        description="Confidence in this score [0,1] where 1 = fully confident"
    )
    weight: float = Field(
        ge=0.0,
        le=1.0,
        description="Weight of this factor in layer aggregation [0,1]"
    )
    evidence_ids: List[str] = Field(
        default_factory=list,
        description="IDs linking to raw evidence from SignalPack"
    )
    details: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional details for explainability (counts, breakdowns, etc.)"
    )
    flags: List[str] = Field(
        default_factory=list,
        description="Risk flags detected (e.g., 'obfuscation_detected', 'malware_found')"
    )
    
    @computed_field
    @property
    def contribution(self) -> float:
        """
        Weighted contribution to layer score.
        
        Formula: severity * confidence * weight
        This is the effective risk contribution accounting for uncertainty.
        """
        return self.severity * self.confidence * self.weight
    
    @computed_field
    @property
    def risk_level(self) -> RiskLevel:
        """Risk level based on severity."""
        return RiskLevel.from_severity(self.severity)
    
    def model_dump_for_api(self) -> Dict[str, Any]:
        """Dump model for API response with computed fields."""
        return {
            "name": self.name,
            "severity": round(self.severity, 3),
            "confidence": round(self.confidence, 3),
            "weight": round(self.weight, 3),
            "contribution": round(self.contribution, 4),
            "risk_level": self.risk_level.value,
            "evidence_ids": self.evidence_ids,
            "details": self.details,
            "flags": self.flags,
        }


class LayerScore(BaseModel):
    """
    Aggregated score for a single layer (Security, Privacy, or Governance).
    
    Combines multiple factor scores using confidence-weighted aggregation.
    """
    
    layer_name: str = Field(
        description="Layer identifier: 'security', 'privacy', or 'governance'"
    )
    score: int = Field(
        ge=0,
        le=100,
        description="Layer score [0-100] where 100 = safest"
    )
    risk: float = Field(
        ge=0.0,
        le=1.0,
        description="Aggregated risk [0,1] from confidence-weighted factors"
    )
    factors: List[FactorScore] = Field(
        default_factory=list,
        description="All factor scores contributing to this layer"
    )
    
    @computed_field
    @property
    def risk_level(self) -> RiskLevel:
        """Risk level based on score."""
        return RiskLevel.from_score(self.score)
    
    @computed_field
    @property
    def confidence(self) -> float:
        """
        Overall confidence for this layer.
        
        Weighted average of factor confidences by their weights.
        """
        if not self.factors:
            return 0.0
        
        total_weight = sum(f.weight for f in self.factors)
        if total_weight == 0:
            return 0.0
        
        weighted_confidence = sum(f.confidence * f.weight for f in self.factors)
        return weighted_confidence / total_weight
    
    @classmethod
    def compute(
        cls,
        layer_name: str,
        factors: List[FactorScore],
    ) -> "LayerScore":
        """
        Compute layer score from factor scores using confidence-weighted aggregation.
        
        Formula:
            risk = Σ(severity_i * confidence_i * weight_i) / Σ(weight_i)
            score = 100 * (1 - risk)
        
        Args:
            layer_name: Identifier for this layer
            factors: List of factor scores with severities, confidences, and weights
            
        Returns:
            LayerScore with aggregated risk and score
        """
        if not factors:
            return cls(
                layer_name=layer_name,
                score=100,
                risk=0.0,
                factors=[],
            )
        
        # Confidence-weighted risk aggregation
        total_weight = sum(f.weight for f in factors)
        if total_weight == 0:
            return cls(
                layer_name=layer_name,
                score=100,
                risk=0.0,
                factors=factors,
            )
        
        # Sum of contributions normalized by total weight
        weighted_risk = sum(f.contribution for f in factors) / total_weight
        
        # Clamp to [0, 1]
        risk = max(0.0, min(1.0, weighted_risk))
        
        # Convert risk to score (invert: low risk = high score)
        score = int(100 * (1 - risk))
        
        return cls(
            layer_name=layer_name,
            score=score,
            risk=round(risk, 4),
            factors=factors,
        )
    
    def model_dump_for_api(self) -> Dict[str, Any]:
        """Dump model for API response with computed fields."""
        return {
            "layer_name": self.layer_name,
            "score": self.score,
            "risk": round(self.risk, 4),
            "risk_level": self.risk_level.value,
            "confidence": round(self.confidence, 3),
            "factors": [f.model_dump_for_api() for f in self.factors],
        }


class ScoringResult(BaseModel):
    """
    Complete scoring result with all three layer scores and final decision.
    
    This is the top-level output from the scoring engine, containing
    all information needed for governance decisions and UI display.
    """
    
    scan_id: str = Field(
        description="Unique identifier for this scan"
    )
    extension_id: str = Field(
        description="Chrome Web Store extension ID"
    )
    security_score: int = Field(
        ge=0,
        le=100,
        description="Security layer score [0-100]"
    )
    privacy_score: int = Field(
        ge=0,
        le=100,
        description="Privacy layer score [0-100]"
    )
    governance_score: int = Field(
        ge=0,
        le=100,
        description="Governance layer score [0-100]"
    )
    overall_score: int = Field(
        ge=0,
        le=100,
        description="Weighted overall score [0-100]"
    )
    decision: Decision = Field(
        description="Governance decision: ALLOW, BLOCK, or NEEDS_REVIEW"
    )
    reasons: List[str] = Field(
        default_factory=list,
        description="Human-readable reasons for the decision"
    )
    explanation: str = Field(
        default="",
        description="Detailed explanation of the scoring result"
    )
    security_layer: Optional[LayerScore] = Field(
        default=None,
        description="Detailed security layer breakdown"
    )
    privacy_layer: Optional[LayerScore] = Field(
        default=None,
        description="Detailed privacy layer breakdown"
    )
    governance_layer: Optional[LayerScore] = Field(
        default=None,
        description="Detailed governance layer breakdown"
    )
    hard_gates_triggered: List[str] = Field(
        default_factory=list,
        description="Any hard gates that triggered immediate BLOCK (e.g., malware detection)"
    )
    overall_confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Overall confidence in scoring result (layer-weighted average of confidences)"
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="Timestamp when this result was created"
    )
    scoring_version: str = Field(
        default_factory=_current_scoring_version,
        description="Version of the scoring engine used (defaults to ScoringEngine.VERSION)"
    )
    # Explicit gate/override breakdown for QA and enterprise audits (overall_score = final_overall)
    base_overall: Optional[int] = Field(
        default=None,
        ge=0,
        le=100,
        description="Weighted layer sum before gate penalties using LAYER_WEIGHTS "
                    "(sec*0.34 + priv*0.33 + gov*0.33)"
    )
    gate_penalty: Optional[int] = Field(
        default=None,
        ge=0,
        description="Points subtracted from base_overall by hard gate penalties (sum of layer penalties)"
    )
    gate_reasons: Optional[List[str]] = Field(
        default=None,
        description="Human-readable, auditable reasons for each triggered gate"
    )
    coverage_cap_applied: Optional[bool] = Field(
        default=None,
        description="True when overall was capped (e.g. SAST missing → cap at 80)"
    )
    coverage_cap_reason: Optional[str] = Field(
        default=None,
        description="Reason for coverage cap when coverage_cap_applied is True"
    )
    insufficient_data: bool = Field(
        default=False,
        description="True when analysis coverage is too low to clear the extension as safe"
    )
    insufficient_data_reason: Optional[str] = Field(
        default=None,
        description="Reason coverage was deemed insufficient (e.g. no SAST/VT/network signals)"
    )
    decision_authority: Optional[str] = Field(
        default=None,
        description="Which rung of the decision authority produced the verdict (see scoring.decision)"
    )

    @computed_field
    @property
    def risk_level(self) -> RiskLevel:
        """Overall risk level based on overall score."""
        return RiskLevel.from_score(self.overall_score)
    
    @computed_field
    @property
    def is_blocked(self) -> bool:
        """Whether this extension should be blocked."""
        return self.decision == Decision.BLOCK
    
    @computed_field
    @property
    def needs_review(self) -> bool:
        """Whether this extension needs manual review."""
        return self.decision == Decision.NEEDS_REVIEW
    
    @classmethod
    def assemble(
        cls,
        scan_id: str,
        extension_id: str,
        security_layer: LayerScore,
        privacy_layer: LayerScore,
        governance_layer: LayerScore,
        layer_weights: Dict[str, float],
        decision: "Decision",
        reasons: List[str],
        hard_gates_triggered: Optional[List[str]] = None,
    ) -> "ScoringResult":
        """
        Assemble a ScoringResult from pre-computed layers and a decision.

        Decision logic is centralized in ``scoring.decision.resolve`` (the single
        Decision Authority); this method only aggregates layer scores and attaches
        the decision that was already computed by the engine.

        Args:
            scan_id: Unique scan identifier
            extension_id: Chrome extension ID
            security_layer: Computed security layer score
            privacy_layer: Computed privacy layer score
            governance_layer: Computed governance layer score
            layer_weights: Weights for each layer (should sum to 1.0)
            decision: Pre-computed Decision from the engine
            reasons: Pre-computed decision reasons from the engine
            hard_gates_triggered: Any hard gates that triggered

        Returns:
            Complete ScoringResult
        """
        hard_gates = hard_gates_triggered or []

        # Defaults must match weights.LAYER_WEIGHTS (single source of truth).
        sec_weight = layer_weights.get("security", 0.34)
        priv_weight = layer_weights.get("privacy", 0.33)
        gov_weight = layer_weights.get("governance", 0.33)

        overall_score = int(
            security_layer.score * sec_weight +
            privacy_layer.score * priv_weight +
            governance_layer.score * gov_weight
        )

        overall_confidence = (
            security_layer.confidence * sec_weight +
            privacy_layer.confidence * priv_weight +
            governance_layer.confidence * gov_weight
        )

        explanation = cls._build_explanation(
            decision=decision,
            overall_score=overall_score,
            security_layer=security_layer,
            privacy_layer=privacy_layer,
            governance_layer=governance_layer,
            hard_gates=hard_gates,
        )

        return cls(
            scan_id=scan_id,
            extension_id=extension_id,
            security_score=security_layer.score,
            privacy_score=privacy_layer.score,
            governance_score=governance_layer.score,
            overall_score=overall_score,
            decision=decision,
            reasons=reasons,
            explanation=explanation,
            security_layer=security_layer,
            privacy_layer=privacy_layer,
            governance_layer=governance_layer,
            hard_gates_triggered=hard_gates,
            overall_confidence=round(overall_confidence, 3),
        )
    
    @staticmethod
    def _build_explanation(
        decision: Decision,
        overall_score: int,
        security_layer: LayerScore,
        privacy_layer: LayerScore,
        governance_layer: LayerScore,
        hard_gates: List[str],
    ) -> str:
        """Build human-readable explanation of the result."""
        lines = []
        
        if hard_gates:
            lines.append(f"BLOCKED due to: {', '.join(hard_gates)}")
            return " ".join(lines)
        
        lines.append(f"Overall score: {overall_score}/100 ({decision.value})")
        lines.append(f"Security: {security_layer.score}/100 ({security_layer.risk_level.value} risk)")
        lines.append(f"Privacy: {privacy_layer.score}/100 ({privacy_layer.risk_level.value} risk)")
        lines.append(f"Governance: {governance_layer.score}/100 ({governance_layer.risk_level.value} risk)")
        
        # Highlight top risk factors
        all_factors = (
            security_layer.factors +
            privacy_layer.factors +
            governance_layer.factors
        )
        high_risk_factors = [
            f for f in all_factors
            if f.severity >= 0.5 and f.confidence >= 0.6
        ]
        
        if high_risk_factors:
            sorted_factors = sorted(high_risk_factors, key=lambda f: f.contribution, reverse=True)
            top_factors = sorted_factors[:3]
            factor_strs = [
                f"{f.name} (severity={f.severity:.0%}, confidence={f.confidence:.0%})"
                for f in top_factors
            ]
            lines.append(f"Key risk factors: {', '.join(factor_strs)}")
        
        return " | ".join(lines)
    
    def model_dump_for_api(self) -> Dict[str, Any]:
        """Dump model for API response with computed fields."""
        out = {
            "scan_id": self.scan_id,
            "extension_id": self.extension_id,
            "security_score": self.security_score,
            "privacy_score": self.privacy_score,
            "governance_score": self.governance_score,
            "overall_score": self.overall_score,
            "decision": self.decision.value,
            "risk_level": self.risk_level.value,
            "is_blocked": self.is_blocked,
            "needs_review": self.needs_review,
            "reasons": self.reasons,
            # Audit fields preserved so rebuild/upgrade paths stay consistent
            # with freshly-scanned payloads (see ADR 0001).
            "decision_reasons": self.reasons,
            "overall_confidence": self.overall_confidence,
            "insufficient_data": self.insufficient_data,
            "decision_authority": self.decision_authority,
            "explanation": self.explanation,
            "hard_gates_triggered": self.hard_gates_triggered,
            "security_layer": self.security_layer.model_dump_for_api() if self.security_layer else None,
            "privacy_layer": self.privacy_layer.model_dump_for_api() if self.privacy_layer else None,
            "governance_layer": self.governance_layer.model_dump_for_api() if self.governance_layer else None,
            "created_at": self.created_at.isoformat(),
            "scoring_version": self.scoring_version,
        }
        if self.base_overall is not None:
            out["base_overall"] = self.base_overall
        if self.gate_penalty is not None:
            out["gate_penalty"] = self.gate_penalty
        if self.gate_reasons is not None:
            out["gate_reasons"] = self.gate_reasons
        if self.coverage_cap_applied is not None:
            out["coverage_cap_applied"] = self.coverage_cap_applied
        if self.coverage_cap_reason is not None:
            out["coverage_cap_reason"] = self.coverage_cap_reason
        if self.insufficient_data_reason is not None:
            out["insufficient_data_reason"] = self.insufficient_data_reason
        return out

