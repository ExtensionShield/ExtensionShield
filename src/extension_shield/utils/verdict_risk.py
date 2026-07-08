"""Helpers for keeping consumer risk labels aligned with verdict authority."""

from typing import Any, Mapping


def resolve_authoritative_verdict(payload: Mapping[str, Any] | None) -> str | None:
    """Return the authoritative verdict from an API/report payload, if present."""
    if not isinstance(payload, Mapping):
        return None

    final_verdict = payload.get("final_verdict")
    if final_verdict:
        return str(final_verdict).upper()

    governance_verdict = payload.get("governance_verdict")
    if governance_verdict:
        return str(governance_verdict).upper()

    governance_bundle = payload.get("governance_bundle")
    if isinstance(governance_bundle, Mapping):
        decision = governance_bundle.get("decision")
        if isinstance(decision, Mapping):
            bundle_verdict = decision.get("final_verdict")
            if bundle_verdict:
                return str(bundle_verdict).upper()

    scoring_v2 = payload.get("scoring_v2")
    if isinstance(scoring_v2, Mapping):
        scoring_decision = scoring_v2.get("decision")
        if scoring_decision:
            return str(scoring_decision).upper()

    return None


def coherent_risk_level(final_verdict: Any, risk_level: Any) -> Any:
    """Floor safe-looking risk labels when a stronger final verdict exists.

    The helper only changes label bands, never scores or stored analyzer output.
    """
    verdict = str(final_verdict or "").upper()
    normalized_risk = str(risk_level or "").lower()

    if verdict == "BLOCK" and normalized_risk in {"", "low", "none", "unknown"}:
        return "high"
    if verdict == "NEEDS_REVIEW" and normalized_risk in {"", "low", "none", "unknown"}:
        return "medium"
    return risk_level


def coherent_risk_level_for_payload(payload: Mapping[str, Any] | None, risk_level: Any) -> Any:
    """Resolve verdict from a payload and return the coherent risk label."""
    return coherent_risk_level(resolve_authoritative_verdict(payload), risk_level)
