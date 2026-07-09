"""
Report View Model Builder

Creates a UI-friendly `report_view_model` payload from scan pipeline outputs.

Structure: meta, scorecard, highlights, impact_cards, privacy_snapshot, evidence, raw.

Design goals:
- Deterministic and production-safe (no placeholders, safe fallbacks when LLM is unavailable)
- Short, human-readable strings for UI
- Evidence-driven external sharing (UNKNOWN unless explicit evidence is present)
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.tool_adapters import SignalPackBuilder
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.core.summary_generator import SummaryGenerator
from extension_shield.core.impact_analyzer import ImpactAnalyzer
from extension_shield.core.privacy_compliance_analyzer import PrivacyComplianceAnalyzer
from extension_shield.core.layer_details_generator import LayerDetailsGenerator
from extension_shield.scoring.humanize import LayerHumanizer

# Permission → plain English for Quick Summary "What It Can Do" (extends LayerHumanizer)
PERMISSION_TO_PLAIN = {
    **LayerHumanizer.PERMISSION_EXPLANATIONS,
    "scripting": "run scripts on pages you visit",
    "identity": "access your Google account info",
    "alarms": "set background timers",
    "desktopCapture": "record your desktop",
    "tabCapture": "record a browser tab",
    "script": "run scripts on pages",
}


def _build_what_it_can_do(
    manifest: Optional[Dict[str, Any]],
    analysis_results: Optional[Dict[str, Any]],
    host_access: Dict[str, Any],
) -> List[str]:
    """Build human-readable 'What It Can Do' list for LLM prompt. Deduplicated."""
    seen: set = set()
    out: List[str] = []
    manifest = manifest or {}
    perms = list(manifest.get("permissions", []))
    hosts = list(manifest.get("host_permissions", []))

    # High-risk first
    perm_analysis = (analysis_results or {}).get("permissions_analysis", {})
    high_risk = perm_analysis.get("high_risk", []) or perm_analysis.get("highRiskPermissions", [])
    for p in high_risk:
        label = PERMISSION_TO_PLAIN.get(p, f"can use {p}")
        key = label.lower()
        if key not in seen:
            seen.add(key)
            out.append(label)

    for p in perms:
        if p in high_risk:
            continue
        label = PERMISSION_TO_PLAIN.get(p, f"can use {p}")
        key = label.lower()
        if key not in seen:
            seen.add(key)
            out.append(label)

    for h in hosts:
        if h in LayerHumanizer.HOST_EXPLANATIONS:
            label = LayerHumanizer.HOST_EXPLANATIONS[h]
        elif "://" in str(h):
            try:
                from urllib.parse import urlparse
                parsed = urlparse(h.replace("*", "x"))
                domain = parsed.netloc or parsed.path.split("/")[0] or "specific sites"
                label = f"access {domain}"
            except Exception:
                label = f"access {h}"
        else:
            label = f"access {h}"
        key = label.lower()
        if key not in seen:
            seen.add(key)
            out.append(label)

    host_scope = host_access.get("host_scope_label", "")
    if host_scope == "ALL_WEBSITES" and "runs on all websites" not in seen:
        seen.add("runs on all websites")
        out.insert(0, "runs on all websites")

    return out[:12]


logger = logging.getLogger(__name__)


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _map_score_label_from_risk_level(risk_level: str) -> str:
    """Map scoring RiskLevel ('low'|'medium'|'high'|'critical'|'none') to prompt label."""
    rl = (risk_level or "").lower()
    if rl in ("critical", "high"):
        return "HIGH RISK"
    if rl == "medium":
        return "MEDIUM RISK"
    return "LOW RISK"


def _normalize_verdict(decision: Any) -> str:
    """
    Map a scoring/governance decision to the authoritative verdict bucket.

    Returns one of BLOCK | NEEDS_REVIEW | ALLOW | UNKNOWN. Accepts an enum
    (with a .value), a string, or None.
    """
    val = getattr(decision, "value", decision)
    s = str(val or "").upper()
    if s == "BLOCK":
        return "BLOCK"
    if s in ("WARN", "NEEDS_REVIEW", "REVIEW"):
        return "NEEDS_REVIEW"
    if s == "ALLOW":
        return "ALLOW"
    return "UNKNOWN"


_VERDICT_SEVERITY = {"BLOCK": 3, "NEEDS_REVIEW": 2, "ALLOW": 1, "UNKNOWN": 0}


def _escalate_verdict(primary: str, other: str) -> str:
    """Return the MORE severe of two verdict buckets (escalate-only merge).

    Used to reconcile the engine's scoring verdict with the authoritative
    governance verdict (which includes org-policy and baseline-governance
    BLOCK/REVIEW rungs the engine omits). This only ever raises severity — it
    never downgrades an engine BLOCK/NEEDS_REVIEW.
    """
    if _VERDICT_SEVERITY.get(other, 0) > _VERDICT_SEVERITY.get(primary, 0):
        return other
    return primary


def _reconcile_score_label(score_label: str, verdict: str) -> str:
    """
    Keep the score-derived risk label from contradicting the authoritative verdict.

    The numeric score stays visible, but a BLOCK/NEEDS_REVIEW verdict must never
    present as a lower-risk label (which is what produced "Review before
    installing" / "appears safe" copy on a blocked extension). This only ever
    raises the label, never lowers it.
    """
    if verdict == "BLOCK":
        return "HIGH RISK"
    if verdict == "NEEDS_REVIEW" and score_label == "LOW RISK":
        return "MEDIUM RISK"
    return score_label


def _coerce_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    return []


def _coerce_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _ensure_len(items: List[str], length: int) -> List[str]:
    """Trim/pad list to an exact length (padding with empty strings is avoided)."""
    items = [str(x) for x in items if isinstance(x, str) and x.strip()]
    return items[:length]


def _ensure_max_len(items: List[str], max_len: int) -> List[str]:
    items = [str(x) for x in items if isinstance(x, str) and x.strip()]
    return items[:max_len]


def _summary_contradicts_label(text: str, score_label: str) -> bool:
    """
    Check if executive summary text contradicts the authoritative score_label.

    Returns True if the text contains wording that conflicts with the risk label,
    e.g. a LOW RISK label paired with "high risk" language.
    """
    t = (text or "").lower()
    if score_label == "LOW RISK":
        return any(x in t for x in ["high risk", "high-risk", "critical", "avoid", "severe"])
    if score_label == "HIGH RISK":
        return any(x in t for x in ["low risk", "low-risk", "safe", "no concerns", "no risk"])
    return False


def _fallback_executive_summary(score: int, score_label: str, host_scope_label: str) -> Dict[str, Any]:
    """
    Deterministic executive summary fallback (no LLM).

    IMPORTANT: The one_liner tone MUST match score_label.
    The dial and summary will never contradict each other when this
    function is the source of truth.
    """
    label_to_tone = {
        "LOW RISK": "Low risk overall",
        "MEDIUM RISK": "Some caution advised",
        "HIGH RISK": "High risk — avoid unless necessary",
    }
    one_liner = label_to_tone.get(score_label, "Risk level unavailable")
    
    # Force specific one-liner based on host scope if present
    if host_scope_label == "ALL_WEBSITES":
        if score_label == "LOW RISK":
            one_liner = "Low risk overall, but broad host access is requested."
        elif score_label == "MEDIUM RISK":
            one_liner = "Caution advised due to broad host access and permissions."

    what_to_watch: List[str] = []
    if host_scope_label == "ALL_WEBSITES":
        what_to_watch.append("Runs on all websites; avoid on sensitive accounts.")
    what_to_watch.append("Watch for updates that add new permissions or expand site access.")
    what_to_watch = _ensure_max_len(what_to_watch, 2)

    if score_label == "LOW RISK":
        why_this_score = [
            "The permissions it requests match what it says it does.",
            "No dangerous code patterns or malware detected.",
            "Developer disclosures and privacy policy look consistent.",
        ]
    elif score_label == "HIGH RISK":
        why_this_score = [
            "Our security scan flagged serious concerns.",
            "The code contains patterns that could put your data at risk.",
            "It requests powerful permissions that access sensitive data.",
        ]
    else:
        why_this_score = [
            "It requests some powerful permissions like tab or site access.",
            "Some code patterns should be reviewed before trusting this extension.",
            "The extension has moderate trust signals on the Chrome Web Store.",
        ]
    
    if host_scope_label == "ALL_WEBSITES":
        if score_label == "LOW RISK":
            why_this_score[0] = "It can run on all websites you visit."
        else:
            why_this_score[0] = "It runs on all websites, which gives it broad access to your browsing."
    elif host_scope_label in ("SINGLE_DOMAIN", "MULTI_DOMAIN"):
        scope = "a few specific sites" if host_scope_label == "MULTI_DOMAIN" else "one specific site"
        why_this_score[0] = f"Its access is limited to {scope}."
    
    why_this_score = _ensure_len(why_this_score, 3)

    return {
        "one_liner": one_liner,
        "why_this_score": why_this_score,
        "what_to_watch": what_to_watch,
        "confidence": "MEDIUM",
        "score": int(score),
        "score_label": score_label,
        # Legacy-compat fields (used elsewhere)
        "summary": one_liner,
        "key_findings": why_this_score,
        "recommendations": what_to_watch,
        "overall_risk_level": "unknown",
        "overall_security_score": int(score),
    }


def build_consumer_summary(
    report_view_model: Dict[str, Any],
    scoring_v2: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Build a clean, consumer-friendly summary from the report_view_model.

    Produces the format:
      verdict:     max 12 words
      reasons:     2-3 bullets (plain English)
      access:      1 bullet "What it can access"
      action:      1 bullet "What to do"

    Total length target: <= 80 words.

    Rules:
    - Use ONLY facts from the provided data. Do not assume anything else.
    - Do not include internal IDs (e.g., CRITICAL_SAST) or file paths.
    - Keep it non-alarmist but clear. No speculation.
    """
    scorecard = report_view_model.get("scorecard", {})
    highlights = report_view_model.get("highlights", {})
    evidence = report_view_model.get("evidence", {})
    consumer_insights = report_view_model.get("consumer_insights", {})
    layer_details = report_view_model.get("layer_details", {})

    score = scorecard.get("score", 0)
    score_label = scorecard.get("score_label", "UNKNOWN")
    one_liner = scorecard.get("one_liner", "")
    final_verdict = _normalize_verdict((scoring_v2 or {}).get("decision"))

    # --- Verdict (max 12 words) ---
    # Authoritative verdict owns the headline; score label only decides tone for
    # ALLOW/unknown extensions. A BLOCK/NEEDS_REVIEW is stated unambiguously.
    if final_verdict == "BLOCK":
        verdict = "Blocked — do not install without review."
    elif final_verdict == "NEEDS_REVIEW":
        verdict = "Not safe yet — review unresolved risks before installing."
    elif score_label == "HIGH RISK":
        verdict = one_liner if one_liner and len(one_liner.split()) <= 12 else "High risk — avoid unless necessary."
    elif score_label == "MEDIUM RISK":
        verdict = one_liner if one_liner and len(one_liner.split()) <= 12 else "Some caution needed before using this extension."
    elif score_label == "LOW RISK":
        verdict = one_liner if one_liner and len(one_liner.split()) <= 12 else "Low risk — appears safe for general use."
    else:
        verdict = one_liner or "Risk level could not be determined."

    # Truncate to 12 words max
    words = verdict.split()
    if len(words) > 12:
        verdict = " ".join(words[:12]) + "."

    # --- Reasons (2-3 bullets, plain English) ---
    reasons: List[str] = []
    why_this_score = highlights.get("why_this_score", [])
    if isinstance(why_this_score, list) and why_this_score:
        reasons = [str(r) for r in why_this_score if r and str(r).strip()][:3]

    # Fallback: use layer_details key_points if no highlights
    if not reasons:
        for layer_name in ("security", "privacy", "governance"):
            ld = layer_details.get(layer_name, {})
            if isinstance(ld, dict):
                kp = ld.get("key_points", [])
                if isinstance(kp, list):
                    reasons.extend([str(p) for p in kp if p and str(p).strip()])
        reasons = reasons[:3]

    # --- What it can access (1 bullet) ---
    access_bullet = ""
    host_access = evidence.get("host_access_summary", {})
    host_scope = host_access.get("host_scope_label", "UNKNOWN")
    cap_flags = evidence.get("capability_flags", {})

    access_parts: List[str] = []
    if host_scope == "ALL_WEBSITES":
        access_parts.append("all websites")
    elif host_scope == "MULTI_DOMAIN":
        domains = host_access.get("domains", [])
        if domains:
            access_parts.append(f"multiple sites ({', '.join(domains[:3])})")
        else:
            access_parts.append("multiple websites")
    elif host_scope == "SINGLE_DOMAIN":
        domains = host_access.get("domains", [])
        access_parts.append(domains[0] if domains else "one website")

    if cap_flags.get("reads_cookies"):
        access_parts.append("cookies")
    if cap_flags.get("reads_history") or cap_flags.get("reads_tabs"):
        access_parts.append("browsing history")
    if cap_flags.get("modifies_pages"):
        access_parts.append("page content")

    if access_parts:
        access_bullet = f"Can access: {', '.join(access_parts)}."
    else:
        access_bullet = "No special data access detected."

    # --- What to do (1 bullet) ---
    # Blocking/review verdicts take precedence over any softer "what to watch" hint.
    what_to_watch = highlights.get("what_to_watch", [])
    if final_verdict == "BLOCK":
        action_bullet = "Do not install without a manual security review."
    elif final_verdict == "NEEDS_REVIEW":
        action_bullet = "Do not treat as safe; review the flagged risks before installing."
    elif isinstance(what_to_watch, list) and what_to_watch:
        action_bullet = str(what_to_watch[0])
    elif score_label == "HIGH RISK":
        action_bullet = "Avoid installing unless absolutely necessary."
    elif score_label == "MEDIUM RISK":
        action_bullet = "Review permissions before installing; disable on sensitive sites."
    else:
        action_bullet = "Keep the extension updated and review after major updates."

    return {
        "verdict": verdict,
        "reasons": reasons,
        "access": access_bullet,
        "action": action_bullet,
    }


def build_unified_consumer_summary(
    report_view_model: Dict[str, Any],
    scoring_v2: Optional[Dict[str, Any]] = None,
    analysis_results: Optional[Dict[str, Any]] = None,
    manifest: Optional[Dict[str, Any]] = None,
    extension_name: Optional[str] = None,
    skip_llm: bool = False,
) -> Dict[str, Any]:
    """
    Build a unified, LLM-powered consumer summary with plain English insights.
    
    This is a simpler format than the old consumer_summary:
      - headline: One sentence takeaway (max 15 words)
      - tldr: 2-3 sentences explaining the situation
      - concerns: Top 3 specific concerns (deduplicated, plain English)
      - recommendation: One actionable sentence
    
    Falls back to deterministic summary if LLM fails.
    """
    import json
    import os
    from langchain_core.prompts import PromptTemplate
    from langchain_core.output_parsers import JsonOutputParser
    from extension_shield.llm.prompts import get_prompts
    from extension_shield.llm.clients.fallback import invoke_with_fallback

    scorecard = report_view_model.get("scorecard", {})
    evidence = report_view_model.get("evidence", {})
    layer_details = report_view_model.get("layer_details", {})
    highlights = report_view_model.get("highlights", {})
    
    score = scorecard.get("score", 0)
    score_label = scorecard.get("score_label", "UNKNOWN")
    verdict = _normalize_verdict((scoring_v2 or {}).get("decision"))
    host_access = evidence.get("host_access_summary", {})
    capability_flags = evidence.get("capability_flags", {})
    
    # Build the name
    meta = report_view_model.get("meta", {})
    ext_name = extension_name or meta.get("name", "This extension")

    # Retrieval/skip paths must not call the LLM (avoids network dependency and
    # latency). Use the deterministic, verdict-aware fallback directly.
    if skip_llm:
        return _fallback_unified_consumer_summary(
            score=score,
            score_label=score_label,
            host_access=host_access,
            capability_flags=capability_flags,
            layer_details=layer_details,
            highlights=highlights,
            extension_name=ext_name,
            verdict=verdict,
        )

    # Try LLM-powered generation first
    try:
        prompts = get_prompts("summary_generation")
        template_str = prompts.get("consumer_summary_unified")
        
        if template_str:
            # Gather findings from all layers
            security_findings = []
            privacy_findings = []
            governance_findings = []
            
            # From layer_details
            for layer_name, layer_data in layer_details.items():
                if not isinstance(layer_data, dict):
                    continue
                key_points = layer_data.get("key_points", [])
                if layer_name == "security":
                    security_findings.extend([p for p in key_points if p])
                elif layer_name == "privacy":
                    privacy_findings.extend([p for p in key_points if p])
                elif layer_name == "governance":
                    governance_findings.extend([p for p in key_points if p])
            
            # From scoring factors (scoring_v2 uses security_layer, privacy_layer, governance_layer)
            # Map internal factor names to plain English so the LLM prompt
            # (and any deterministic fallback) never surfaces jargon.
            _factor_plain_names = {
                "SAST": "Code security scan",
                "VirusTotal": "Antivirus scan",
                "Obfuscation": "Code obfuscation check",
                "Manifest": "Extension configuration",
                "ChromeStats": "Chrome Web Store reputation",
                "Webstore": "Store reputation",
                "Maintenance": "Update and maintenance status",
                "PermissionsBaseline": "Permission risk level",
                "PermissionCombos": "Risky permission combinations",
                "NetworkExfil": "External data transfer capability",
                "CaptureSignals": "Screen or input capture check",
                "ToSViolations": "Policy compliance",
                "Consistency": "Behavior consistency check",
                "DisclosureAlignment": "Privacy disclosure check",
            }

            def _humanize_factor_finding(factor: dict) -> str:
                raw_name = factor.get("name", "")
                human_name = _factor_plain_names.get(raw_name, raw_name)
                details = factor.get("details", {})
                if isinstance(details, dict):
                    desc = details.get("description", "")
                    if desc:
                        return f"{human_name}: {desc}"
                severity = factor.get("severity", 0)
                level = "Significant" if severity >= 0.7 else "Moderate" if severity >= 0.4 else "Minor"
                return f"{level} findings in {human_name.lower()}"

            if scoring_v2:
                for layer_key, findings_list in [
                    ("security_layer", security_findings),
                    ("privacy_layer", privacy_findings),
                    ("governance_layer", governance_findings),
                ]:
                    layer_data = scoring_v2.get(layer_key) or {}
                    for factor in layer_data.get("factors", []):
                        if isinstance(factor, dict) and factor.get("severity", 0) >= 0.3:
                            finding = _humanize_factor_finding(factor)
                            if finding and finding not in findings_list:
                                findings_list.append(finding)
            
            # Permissions summary
            permissions_data = {
                "all_permissions": [],
                "high_risk": [],
                "host_access": host_access.get("host_scope_label", "NONE"),
            }
            if manifest:
                permissions_data["all_permissions"] = manifest.get("permissions", []) + manifest.get("host_permissions", [])
            if analysis_results:
                perm_analysis = analysis_results.get("permissions_analysis", {})
                permissions_data["high_risk"] = perm_analysis.get("high_risk", []) or perm_analysis.get("highRiskPermissions", [])

            # What It Can Do – human-readable for Quick Summary (no duplication with modal)
            what_it_can_do = _build_what_it_can_do(manifest, analysis_results, host_access)

            # Get layer-specific scores for context
            security_score = None
            privacy_score = None
            governance_score = None
            decision = None
            if scoring_v2:
                sec_layer = scoring_v2.get("security_layer") or {}
                priv_layer = scoring_v2.get("privacy_layer") or {}
                gov_layer = scoring_v2.get("governance_layer") or {}
                security_score = sec_layer.get("score")
                privacy_score = priv_layer.get("score")
                governance_score = gov_layer.get("score")
                decision = scoring_v2.get("decision")
            
            # Log gathered findings for debugging
            logger.info(
                "Unified summary LLM context: sec=%d findings, priv=%d findings, gov=%d findings",
                len(security_findings), len(privacy_findings), len(governance_findings)
            )

            # Merge all key findings for single aggregated prompt (SAST, engine, layer_details)
            all_key_findings = (
                security_findings[:3]
                + privacy_findings[:3]
                + governance_findings[:3]
            )
            # Add hard gates in plain English (avoid raw gate IDs like "SENSITIVE_EXFIL")
            _gate_plain_names = {
                "CRITICAL_SAST": "Dangerous code patterns detected",
                "SENSITIVE_EXFIL": "Requests permissions that could send data externally",
                "PURPOSE_MISMATCH": "Behavior doesn't match its stated purpose",
                "VT_MALWARE": "Flagged by antivirus engines",
                "TOS_VIOLATION": "Chrome Web Store policy violation detected",
                "CAPTURE_SIGNALS": "May capture your screen or input",
            }
            if scoring_v2:
                for gate in scoring_v2.get("hard_gates_triggered", [])[:2]:
                    human_gate = _gate_plain_names.get(gate, gate.replace("_", " ").lower())
                    all_key_findings.insert(0, human_gate)

            # Create prompt - use jinja2 format since YAML templates use {{ variable }} syntax
            template = PromptTemplate(
                input_variables=[
                    "extension_name",
                    "score",
                    "score_label",
                    "security_score",
                    "privacy_score",
                    "governance_score",
                    "decision",
                    "host_access_summary_json",
                    "permissions_json",
                    "what_it_can_do_json",
                    "key_findings_json",
                    "security_findings_json",
                    "privacy_findings_json",
                    "governance_findings_json",
                ],
                template=template_str,
                template_format="jinja2",
            ).partial(
                extension_name=ext_name,
                score=score,
                score_label=score_label,
                security_score=security_score if security_score is not None else "N/A",
                privacy_score=privacy_score if privacy_score is not None else "N/A",
                governance_score=governance_score if governance_score is not None else "N/A",
                decision=decision or "N/A",
                host_access_summary_json=json.dumps(host_access, indent=2),
                permissions_json=json.dumps(permissions_data, indent=2),
                what_it_can_do_json=json.dumps(what_it_can_do, indent=2),
                key_findings_json=json.dumps(all_key_findings[:8], indent=2),
                security_findings_json=json.dumps(security_findings[:5], indent=2),
                privacy_findings_json=json.dumps(privacy_findings[:5], indent=2),
                governance_findings_json=json.dumps(governance_findings[:5], indent=2),
            )
            
            model_name = os.getenv("LLM_MODEL", "gpt-4o")
            model_parameters = {"temperature": 0.3, "max_tokens": 1024}
            
            formatted_prompt = template.format_prompt()
            messages = formatted_prompt.to_messages()
            
            response = invoke_with_fallback(
                messages=messages,
                model_name=model_name,
                model_parameters=model_parameters,
            )
            
            parser = JsonOutputParser()
            result = parser.parse(response.content if hasattr(response, "content") else str(response))
            
            if isinstance(result, dict) and (result.get("headline") or result.get("narrative")):
                # Prefer unified narrative; fall back to tldr+concerns+recommendation
                headline = result.get("headline", "")
                narrative = result.get("narrative", "")
                tldr = result.get("tldr", "")
                concerns = result.get("concerns", [])[:3]
                recommendation = result.get("recommendation", "")

                # Validate tone matches score
                text_to_check = (headline + " " + narrative + " " + tldr).lower()
                if score_label == "LOW RISK" and any(x in text_to_check for x in ["high risk", "dangerous", "avoid"]):
                    raise ValueError("Summary contradicts LOW RISK score")
                if score_label == "HIGH RISK" and any(x in text_to_check for x in ["safe", "low risk", "no concerns"]):
                    raise ValueError("Summary contradicts HIGH RISK score")
                # The authoritative verdict overrides the score: a BLOCK/NEEDS_REVIEW
                # extension must never be softened into review/safe wording.
                if verdict == "BLOCK" and any(
                    x in text_to_check
                    for x in ["appears safe", "safe for general use", "review before installing",
                              "needs some attention", "moderate issues", "no concerns"]
                ):
                    raise ValueError("Summary contradicts BLOCK verdict")
                if verdict == "NEEDS_REVIEW" and any(
                    x in text_to_check for x in ["appears safe", "safe for general use", "no concerns"]
                ):
                    raise ValueError("Summary contradicts NEEDS_REVIEW verdict")

                logger.info("Unified consumer summary generated via LLM")
                return {
                    "headline": headline,
                    "narrative": narrative,
                    "tldr": tldr,
                    "concerns": concerns,
                    "recommendation": recommendation,
                    "source": "llm",
                }
    except Exception as exc:
        logger.warning("LLM unified consumer summary failed, using fallback: %s", exc)
    
    # Fallback: deterministic summary
    return _fallback_unified_consumer_summary(
        score=score,
        score_label=score_label,
        host_access=host_access,
        capability_flags=capability_flags,
        layer_details=layer_details,
        highlights=highlights,
        extension_name=ext_name,
        verdict=verdict,
    )


def _fallback_unified_consumer_summary(
    score: int,
    score_label: str,
    host_access: Dict[str, Any],
    capability_flags: Dict[str, Any],
    layer_details: Dict[str, Any],
    highlights: Dict[str, Any],
    extension_name: str,
    verdict: str = "UNKNOWN",
) -> Dict[str, Any]:
    """
    Deterministic fallback for unified consumer summary.
    Uses plain English and avoids technical jargon.

    The authoritative ``verdict`` (BLOCK / NEEDS_REVIEW / ALLOW) takes precedence
    over the numeric score label for the headline and recommendation so a blocked
    extension is never described as "review"/"appears safe".
    """
    host_scope = host_access.get("host_scope_label", "NONE")

    # Headline: authoritative verdict first, score label only as a fallback.
    if verdict == "BLOCK":
        headline = f"Not safe — {extension_name} was blocked by automated security checks."
    elif verdict == "NEEDS_REVIEW":
        headline = f"Do not install yet — {extension_name} has unresolved risks that need review."
    elif score_label == "HIGH RISK":
        headline = f"Be careful — {extension_name} has significant security concerns."
    elif score_label == "MEDIUM RISK":
        headline = f"Review before installing — {extension_name} needs some attention."
    else:
        headline = f"{extension_name} appears safe for general use."
    
    # Truncate headline to 100 chars
    if len(headline) > 100:
        headline = headline[:97] + "..."
    
    # TL;DR based on findings
    tldr_parts = []
    
    if host_scope == "ALL_WEBSITES":
        tldr_parts.append("This extension runs on all websites you visit.")
    elif host_scope == "MULTI_DOMAIN":
        tldr_parts.append("This extension runs on multiple specific websites.")
    
    if capability_flags.get("can_read_cookies"):
        tldr_parts.append("It can read your cookies.")
    if capability_flags.get("can_read_history"):
        tldr_parts.append("It can see your browsing history.")
    if capability_flags.get("can_block_or_modify_network"):
        tldr_parts.append("It can see and modify your web traffic.")
    
    if not tldr_parts:
        if verdict == "BLOCK":
            tldr_parts.append("This extension was blocked by automated security checks and is not considered safe to install.")
        elif verdict == "NEEDS_REVIEW":
            tldr_parts.append("This extension has unresolved risks that must be reviewed before it can be considered safe.")
        elif score_label == "LOW RISK":
            tldr_parts.append("No major concerns were found during the security scan.")
        elif score_label == "MEDIUM RISK":
            tldr_parts.append("Some permissions and behaviors need review before installing.")
        else:
            tldr_parts.append("Several issues were found that may put your data at risk.")
    
    tldr = " ".join(tldr_parts[:3])
    if len(tldr) > 300:
        tldr = tldr[:297] + "..."
    
    # Strip internal IDs from user-facing text (belt-and-suspenders for LLM or
    # layer_details key_points that still contain raw identifiers).
    _jargon_replacements = {
        "SENSITIVE_EXFIL": "sensitive data transfer risk",
        "CRITICAL_SAST": "dangerous code patterns",
        "VT_MALWARE": "antivirus flags",
        "PURPOSE_MISMATCH": "behavior mismatch",
        "TOS_VIOLATION": "policy violation",
        "CAPTURE_SIGNALS": "screen or input capture",
        "CaptureSignals": "screen or input capture check",
        "NetworkExfil": "data transfer check",
        "PermissionsBaseline": "permission risk",
        "PermissionCombos": "permission combinations",
        "Sensitive permissions:": "Sensitive permissions include",
    }

    def _sanitize_concern(text: str) -> str:
        for jargon, plain in _jargon_replacements.items():
            text = text.replace(jargon, plain)
        return text

    # Concerns - gather from layer details
    concerns = []
    for layer_name in ("security", "privacy", "governance"):
        ld = layer_details.get(layer_name, {})
        if isinstance(ld, dict):
            key_points = ld.get("key_points", [])
            for kp in key_points:
                if kp and isinstance(kp, str) and kp.strip():
                    cleaned = _sanitize_concern(kp)
                    if cleaned not in concerns:
                        concerns.append(cleaned)
                    if len(concerns) >= 3:
                        break
        if len(concerns) >= 3:
            break
    
    # Fallback concerns from highlights
    if not concerns:
        why_this_score = highlights.get("why_this_score", [])
        if isinstance(why_this_score, list):
            concerns = [_sanitize_concern(str(r)) for r in why_this_score if r and str(r).strip()][:3]
    
    # Recommendation: authoritative verdict first.
    if verdict == "BLOCK":
        recommendation = "Do not install this extension without a manual security review; it was blocked by automated checks."
    elif verdict == "NEEDS_REVIEW":
        recommendation = "Do not treat this as safe yet — review the flagged risks before installing."
    elif score_label == "HIGH RISK":
        recommendation = "Consider using an alternative extension with fewer permissions."
    elif score_label == "MEDIUM RISK":
        recommendation = "Check the permissions carefully and avoid using on sensitive websites."
    else:
        recommendation = "Keep the extension updated and review after major version changes."
    
    # Build a flowing narrative that weaves capabilities, concerns, and advice
    narrative_parts = [tldr]
    if concerns:
        # Connect concerns naturally instead of dumping raw bullets
        concern_text = concerns[0]
        if len(concerns) > 1:
            concern_text += " " + concerns[1]
        narrative_parts.append(" " + concern_text)
    narrative_parts.append(" " + recommendation)
    narrative = " ".join(narrative_parts).replace("  ", " ").strip()
    if len(narrative) > 400:
        narrative = narrative[:397] + "..."

    return {
        "headline": headline,
        "narrative": narrative,
        "tldr": tldr,
        "concerns": concerns[:3],
        "recommendation": recommendation,
        "source": "fallback",
    }


def _bucket(risk_level: str, bullets: List[str], mitigations: List[str]) -> Dict[str, Any]:
    return {
        "risk_level": (risk_level or "UNKNOWN"),
        "bullets": _ensure_max_len([str(x) for x in bullets if isinstance(x, str)], 3),
        "mitigations": _ensure_max_len([str(x) for x in mitigations if isinstance(x, str)], 3),
    }


def _fallback_impact_from_capability_flags(
    capability_flags: Dict[str, Any],
    external_domains: List[str],
    network_evidence: List[Dict[str, Any]],
    has_externally_connectable: bool,
) -> Dict[str, Any]:
    """
    Deterministic impact buckets (no LLM).

    Risk mapping updates (production requirements):
    - Data access:
      - MEDIUM for can_read_all_sites OR can_read_tabs
      - HIGH only for cookies/history/clipboard/screenshots
    - External sharing remains UNKNOWN unless evidence exists:
      external_domains OR network_evidence OR externally_connectable
    """
    flags = capability_flags or {}

    # ----------------------------
    # Data access
    # ----------------------------
    data_bullets: List[str] = []
    if flags.get("can_read_all_sites"):
        data_bullets.append("Can read or interact with pages across all websites.")
    elif flags.get("can_read_specific_sites"):
        data_bullets.append("Can read or interact with pages on specific websites.")

    if flags.get("can_read_tabs"):
        data_bullets.append("Can access open tab context (e.g., URLs/titles).")
    if flags.get("can_read_cookies"):
        data_bullets.append("Could access cookies for matching sites.")
    if flags.get("can_read_history"):
        data_bullets.append("Could access browsing history.")
    if flags.get("can_read_clipboard"):
        data_bullets.append("Could read clipboard content.")
    if flags.get("can_capture_screenshots"):
        data_bullets.append("Could capture screenshots of web pages or tabs.")

    high_data = any(
        flags.get(k)
        for k in ["can_read_cookies", "can_read_history", "can_read_clipboard", "can_capture_screenshots"]
    )
    if high_data:
        data_risk = "HIGH"
    elif flags.get("can_read_all_sites") or flags.get("can_read_tabs"):
        data_risk = "MEDIUM"
    elif flags.get("can_read_specific_sites") or flags.get("can_read_page_content"):
        data_risk = "LOW" if data_bullets else "UNKNOWN"
    else:
        data_risk = "UNKNOWN"

    data_mitigations = [
        "Restrict site access to only the domains required.",
        "Use a separate browser profile for sensitive accounts.",
    ]

    # ----------------------------
    # Browser control
    # ----------------------------
    ctrl_bullets: List[str] = []
    if flags.get("can_inject_scripts"):
        ctrl_bullets.append("Can inject scripts into pages (content scripts / scripting).")
    if flags.get("can_modify_page_content"):
        ctrl_bullets.append("Can modify page content on matching sites.")
    if flags.get("can_block_or_modify_network"):
        ctrl_bullets.append("Can observe or modify network requests.")
    if flags.get("can_control_proxy"):
        ctrl_bullets.append("Can control proxy settings.")
    if flags.get("can_manage_extensions"):
        ctrl_bullets.append("Can manage other extensions.")
    if flags.get("can_debugger"):
        ctrl_bullets.append("Can use the debugger API.")

    if any(
        flags.get(k)
        for k in [
            "can_manage_extensions",
            "can_control_proxy",
            "can_debugger",
            "can_block_or_modify_network",
        ]
    ):
        ctrl_risk = "HIGH"
    elif any(flags.get(k) for k in ["can_inject_scripts", "can_modify_page_content"]):
        ctrl_risk = "MEDIUM"
    elif ctrl_bullets:
        ctrl_risk = "LOW"
    else:
        ctrl_risk = "UNKNOWN"

    ctrl_mitigations = [
        "Monitor for unexpected page changes or blocked requests.",
        "Limit use to non-sensitive workflows if possible.",
    ]

    # ----------------------------
    # External sharing (evidence-based)
    # ----------------------------
    has_external_evidence = bool(external_domains) or bool(network_evidence) or bool(has_externally_connectable)
    if not has_external_evidence:
        ext_bucket = _bucket("UNKNOWN", [], [])
    else:
        ext_bullets: List[str] = []
        if external_domains:
            ext_bullets.append(f"Contacts external domains (examples: {', '.join(external_domains[:3])}).")
        if network_evidence:
            ext_bullets.append("Network-related code patterns were detected in scan evidence.")
        if has_externally_connectable:
            ext_bullets.append("Accepts connections from external pages/apps (externally_connectable).")

        ext_mitigations = [
            "Review network endpoints and confirm they match the intended functionality.",
            "Ensure disclosures and controls exist for any data sent externally.",
        ]
        ext_bucket = _bucket("MEDIUM", ext_bullets, ext_mitigations)

    return {
        "data_access": _bucket(data_risk, data_bullets, data_mitigations),
        "browser_control": _bucket(ctrl_risk, ctrl_bullets, ctrl_mitigations),
        "external_sharing": ext_bucket,
    }


def _extract_context(
    manifest: Dict[str, Any],
    analysis_results: Dict[str, Any],
) -> Tuple[Dict[str, Any], Dict[str, Any], List[str], List[Dict[str, Any]]]:
    impact_analyzer = ImpactAnalyzer()
    host_access_summary = impact_analyzer._classify_host_access_scope(manifest)
    external_domains = impact_analyzer._extract_external_domains(analysis_results)
    javascript_analysis = analysis_results.get("javascript_analysis", {}) or {}
    network_evidence = ImpactAnalyzer._extract_network_evidence_from_sast(javascript_analysis)
    capability_flags = impact_analyzer._compute_capability_flags(
        manifest=manifest,
        analysis_results=analysis_results,
        host_access_summary=host_access_summary,
        external_domains=external_domains,
        network_evidence=network_evidence,
    )
    return host_access_summary, capability_flags, external_domains, network_evidence


def build_consumer_insights(
    scoring_v2: Optional[Dict[str, Any]],
    capability_flags: Optional[Dict[str, Any]],
    host_access_summary: Optional[Dict[str, Any]],
    permissions_analysis: Optional[Dict[str, Any]],
    webstore_metadata: Optional[Dict[str, Any]],
    network_evidence: Optional[List[Dict[str, Any]]],
    external_domains: Optional[List[str]],
) -> Dict[str, Any]:
    """
    Build a deterministic, consumer-friendly aggregation payload for the UI.

    Constraints:
    - Deterministic only (LLM outputs must not introduce new facts).
    - Safe fallbacks: missing inputs → UNKNOWN and empty lists; never raise.
    """

    def _to_float(value: Any) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return 0.0

    def _yn(value: Any) -> str:
        if value is True:
            return "YES"
        if value is False:
            return "NO"
        return "UNKNOWN"

    def _dedupe_strs(items: List[Any], max_len: int = 25) -> List[str]:
        out: List[str] = []
        seen: set[str] = set()
        for x in items:
            if not isinstance(x, str):
                continue
            s = x.strip()
            if not s or s in seen:
                continue
            out.append(s)
            seen.add(s)
            if len(out) >= max_len:
                break
        return out

    def _domain_matches(hostname: str, base_domains: Any) -> bool:
        if not isinstance(hostname, str) or not hostname.strip():
            return False
        h = hostname.lower().strip(".")
        if not isinstance(base_domains, (set, list, tuple)):
            return False
        for d in base_domains:
            if not isinstance(d, str) or not d:
                continue
            d = d.lower().strip(".")
            if h == d or h.endswith(f".{d}"):
                return True
        return False

    scoring = _coerce_dict(scoring_v2)
    flags = _coerce_dict(capability_flags)
    host = _coerce_dict(host_access_summary)
    _ = _coerce_dict(permissions_analysis)  # reserved for future deterministic enrichments
    md = _coerce_dict(webstore_metadata)
    net_evidence = _coerce_list(network_evidence)
    domains = [d for d in (_coerce_list(external_domains)) if isinstance(d, str) and d.strip()]

    # ---------------------------------------------------------------------
    # Scoring helpers
    # ---------------------------------------------------------------------
    def _iter_factors() -> List[Tuple[str, Dict[str, Any]]]:
        out: List[Tuple[str, Dict[str, Any]]] = []
        for layer_key, layer_name in [
            ("security_layer", "security"),
            ("privacy_layer", "privacy"),
            ("governance_layer", "governance"),
        ]:
            layer = scoring.get(layer_key)
            if not isinstance(layer, dict):
                continue
            factors = layer.get("factors") or []
            if not isinstance(factors, list):
                continue
            for f in factors:
                if isinstance(f, dict):
                    out.append((layer_name, f))
        return out

    def _find_factor(factor_name: str) -> Optional[Dict[str, Any]]:
        for _, f in _iter_factors():
            if str(f.get("name") or "") == factor_name:
                return f
        return None

    def _evidence_from_factors(
        factor_names: List[str],
        *,
        contains_any: Optional[List[str]] = None,
        max_len: int = 20,
    ) -> List[str]:
        ids: List[str] = []
        for fn in factor_names:
            f = _find_factor(fn)
            if not isinstance(f, dict):
                continue
            ev = f.get("evidence_ids") or []
            if not isinstance(ev, list):
                continue
            ids.extend([x for x in ev if isinstance(x, str)])
        if contains_any:
            needles = [n.lower() for n in contains_any if isinstance(n, str) and n.strip()]
            filtered: List[str] = []
            for e in ids:
                el = e.lower()
                if any(n in el for n in needles):
                    filtered.append(e)
            ids = filtered
        return _dedupe_strs(ids, max_len=max_len)

    # ---------------------------------------------------------------------
    # Top drivers (deterministic, from scoring_v2 factor contributions)
    # ---------------------------------------------------------------------
    top_drivers: List[Dict[str, Any]] = []
    try:
        for layer_name, f in _iter_factors():
            name = str(f.get("name") or "")
            if not name:
                continue
            sev = _to_float(f.get("severity"))
            conf = _to_float(f.get("confidence"))
            weight = _to_float(f.get("weight"))
            contrib = f.get("contribution")
            contribution = _to_float(contrib) if contrib is not None else (sev * conf * weight)
            if contribution <= 0:
                continue
            ev_ids = _dedupe_strs(
                f.get("evidence_ids") if isinstance(f.get("evidence_ids"), list) else [],
                max_len=15,
            )
            top_drivers.append(
                {
                    "layer": layer_name,
                    "name": name,
                    "contribution": round(contribution, 4),
                    "severity": round(sev, 3),
                    "confidence": round(conf, 3),
                    "evidence_ids": ev_ids,
                }
            )

        # Stable sort: primary=contribution desc, then layer/name asc for determinism
        top_drivers.sort(key=lambda d: (-_to_float(d.get("contribution")), str(d.get("layer")), str(d.get("name"))))
        top_drivers = top_drivers[:5]
    except Exception:
        top_drivers = []

    # ---------------------------------------------------------------------
    # Deterministic derived signals for labels/scenarios
    # ---------------------------------------------------------------------
    host_scope_label = str(host.get("host_scope_label") or "UNKNOWN")
    is_broad_host = host_scope_label == "ALL_WEBSITES"

    has_network = bool(domains) or bool(net_evidence) or bool(flags.get("can_connect_external_domains"))

    # Scoring factors used for deterministic evidence + some classifications
    obfusc_factor = _find_factor("Obfuscation")
    maintenance_factor = _find_factor("Maintenance")
    webstore_factor = _find_factor("Webstore")

    obfusc_present = False
    if isinstance(obfusc_factor, dict):
        obfusc_present = _to_float(obfusc_factor.get("severity")) > 0.0 or bool(obfusc_factor.get("evidence_ids"))

    days_since_update: Optional[int] = None
    if isinstance(maintenance_factor, dict):
        details = maintenance_factor.get("details") or {}
        if isinstance(details, dict) and details.get("days_since_update") is not None:
            try:
                days_since_update = int(details.get("days_since_update"))
            except (TypeError, ValueError):
                days_since_update = None

    has_privacy_policy = None
    if md:
        has_privacy_policy = bool(
            md.get("privacy_policy")
            or md.get("privacyPolicy")
            or md.get("privacy_policy_url")
            or md.get("privacyPolicyUrl")
            or md.get("privacy_policy_link")
        )

    recently_updated = None
    if days_since_update is not None:
        recently_updated = days_since_update <= 90

    # Low trust = notable webstore factor severity (heuristic, deterministic)
    low_trust = False
    if isinstance(webstore_factor, dict):
        low_trust = _to_float(webstore_factor.get("severity")) >= 0.4

    stale = False
    if days_since_update is not None:
        stale = days_since_update > 180
    elif isinstance(maintenance_factor, dict):
        stale = _to_float(maintenance_factor.get("severity")) >= 0.6

    # ---------------------------------------------------------------------
    # Safety labels (fixed rows; UNKNOWN when inputs are missing)
    # ---------------------------------------------------------------------
    safety_label: List[Dict[str, Any]] = []

    # Host scope
    if host_scope_label == "UNKNOWN":
        host_value = "UNKNOWN"
        host_sev = "MEDIUM"
        host_why = "Host access scope was not available from scan signals."
        host_ev: List[str] = []
    else:
        host_value = "YES" if is_broad_host else "NO"
        host_sev = "HIGH" if is_broad_host else "LOW"
        host_why = (
            "Requests access to all websites (broad host permissions increase potential impact)."
            if is_broad_host
            else f"Host access scope is {host_scope_label} (not all websites)."
        )
        host_ev = _evidence_from_factors(["Manifest", "PermissionCombos"], contains_any=["broad_host_access", "all_urls"])

    safety_label.append(
        {
            "id": "host_scope",
            "title": "Runs on all websites",
            "value": host_value,
            "severity": host_sev,
            "why": host_why,
            "evidence_ids": host_ev,
        }
    )

    # Cookies
    cookies_value = _yn(flags.get("can_read_cookies"))
    safety_label.append(
        {
            "id": "cookies",
            "title": "Can access cookies",
            "value": cookies_value,
            "severity": "HIGH" if cookies_value == "YES" else ("MEDIUM" if cookies_value == "UNKNOWN" else "LOW"),
            "why": (
                "Has permission to access cookies on matching sites."
                if cookies_value == "YES"
                else ("No cookies permission detected." if cookies_value == "NO" else "Cookies capability was not available.")
            ),
            "evidence_ids": _evidence_from_factors(["PermissionsBaseline", "PermissionCombos"], contains_any=["cookies"]),
        }
    )

    # History / Tabs
    history = flags.get("can_read_history")
    tabs = flags.get("can_read_tabs")
    ht_value = "UNKNOWN" if history is None and tabs is None else ("YES" if (history or tabs) else "NO")
    if ht_value == "YES":
        ht_sev = "HIGH" if history else "MEDIUM"
        ht_why = "Can access browsing history." if history else "Can access open tab context (e.g., URLs/titles)."
    elif ht_value == "NO":
        ht_sev = "LOW"
        ht_why = "No history or tab-access capability detected."
    else:
        ht_sev = "MEDIUM"
        ht_why = "History/tab capability was not available."
    safety_label.append(
        {
            "id": "history_tabs",
            "title": "Can access history or tabs",
            "value": ht_value,
            "severity": ht_sev,
            "why": ht_why,
            "evidence_ids": _evidence_from_factors(
                ["PermissionsBaseline", "PermissionCombos"],
                contains_any=["history", "browsingdata", "tabcapture", "desktopcapture"],
            ),
        }
    )

    # Page modification
    can_modify = flags.get("can_modify_page_content")
    can_inject = flags.get("can_inject_scripts")
    if can_modify is None and can_inject is None:
        page_mod_value = "UNKNOWN"
    else:
        page_mod_value = "YES" if (can_modify or can_inject) else "NO"
    safety_label.append(
        {
            "id": "page_modification",
            "title": "Can modify web pages",
            "value": page_mod_value,
            "severity": "MEDIUM" if page_mod_value == "YES" else ("MEDIUM" if page_mod_value == "UNKNOWN" else "LOW"),
            "why": (
                "Can inject scripts or modify page content on matching sites."
                if page_mod_value == "YES"
                else (
                    "No page-modification capability detected." if page_mod_value == "NO" else "Page modification capability was not available."
                )
            ),
            "evidence_ids": _evidence_from_factors(["Manifest"], contains_any=["broad_host_access"]),
        }
    )

    # External sharing
    external_value = "UNKNOWN" if external_domains is None and network_evidence is None else ("YES" if has_network else "NO")
    safety_label.append(
        {
            "id": "external_sharing",
            "title": "Connects to external domains",
            "value": external_value,
            "severity": "MEDIUM" if external_value == "YES" else ("MEDIUM" if external_value == "UNKNOWN" else "LOW"),
            "why": (
                f"External domains detected (examples: {', '.join(domains[:3])})."
                if external_value == "YES" and domains
                else (
                    "Network-related evidence was detected in scan results."
                    if external_value == "YES"
                    else ("No external domain evidence was found." if external_value == "NO" else "External connectivity signals were not available.")
                )
            ),
            "evidence_ids": _evidence_from_factors(["NetworkExfil", "DisclosureAlignment"]),
        }
    )

    # Obfuscation
    if scoring_v2 is None or obfusc_factor is None:
        ob_value = "UNKNOWN"
        ob_sev = "MEDIUM"
        ob_why = "Obfuscation signal was not available."
        ob_ev: List[str] = []
    else:
        ob_value = "YES" if obfusc_present else "NO"
        ob_sev = "HIGH" if ob_value == "YES" else "LOW"
        ob_why = (
            "Code obfuscation or suspicious minification patterns were detected."
            if ob_value == "YES"
            else "No obfuscation signals were detected."
        )
        ob_ev = _evidence_from_factors(["Obfuscation"])
    safety_label.append(
        {
            "id": "obfuscation",
            "title": "Obfuscated code detected",
            "value": ob_value,
            "severity": ob_sev,
            "why": ob_why,
            "evidence_ids": ob_ev,
        }
    )

    # Privacy policy present
    pp_value = _yn(has_privacy_policy) if has_privacy_policy is not None else "UNKNOWN"
    if pp_value == "YES":
        pp_sev = "LOW"
        pp_why = "A privacy policy is present in webstore metadata."
    elif pp_value == "NO":
        pp_sev = "MEDIUM"
        pp_why = "No privacy policy was found in webstore metadata."
    else:
        pp_sev = "MEDIUM"
        pp_why = "Privacy policy presence was not available."
    safety_label.append(
        {
            "id": "privacy_policy",
            "title": "Privacy policy present",
            "value": pp_value,
            "severity": pp_sev,
            "why": pp_why,
            "evidence_ids": _evidence_from_factors(["Webstore", "DisclosureAlignment"], contains_any=["no_privacy_policy"]),
        }
    )

    # Recently updated
    ru_value = _yn(recently_updated) if recently_updated is not None else "UNKNOWN"
    if ru_value == "YES":
        ru_sev = "LOW"
        ru_why = "Recently updated based on available maintenance signals."
    elif ru_value == "NO":
        ru_sev = "MEDIUM"
        ru_why = "Not recently updated based on available maintenance signals."
    else:
        ru_sev = "MEDIUM"
        ru_why = "Update recency was not available."
    ru_ev = _evidence_from_factors(["Maintenance"], contains_any=["maintenance:days", "stale", "aging", "needs_update"])
    safety_label.append(
        {
            "id": "recently_updated",
            "title": "Recently updated",
            "value": ru_value,
            "severity": ru_sev,
            "why": (f"{ru_why} (days since update: {days_since_update})" if days_since_update is not None else ru_why),
            "evidence_ids": ru_ev,
        }
    )

    # ---------------------------------------------------------------------
    # Scenarios (only when deterministic triggers match)
    # ---------------------------------------------------------------------
    scenarios: List[Dict[str, Any]] = []

    # Domain classification: reuse the same sets as scoring normalizers when available
    analytics_set: Any = set()
    known_good_set: Any = set()
    try:
        from extension_shield.scoring.normalizers import ANALYTICS_DOMAINS, KNOWN_GOOD_DOMAINS

        analytics_set = ANALYTICS_DOMAINS
        known_good_set = KNOWN_GOOD_DOMAINS
    except Exception:
        analytics_set = set()
        known_good_set = set()

    analytics_domains = [d for d in domains if _domain_matches(d, analytics_set)]
    unknown_domains = [d for d in domains if not _domain_matches(d, known_good_set) and not _domain_matches(d, analytics_set)]

    # Scenario 1: cookies + broad + network
    if bool(flags.get("can_read_cookies")) and is_broad_host and has_network:
        scenarios.append(
            {
                "id": "cookies_broad_network",
                "title": "Cookies + broad access + network",
                "severity": "HIGH",
                "summary": "Can access cookies across many sites and has external connectivity signals.",
                "why": "Cookies access combined with broad site access and network connectivity increases the potential for sensitive data exposure.",
                "evidence_ids": _dedupe_strs(
                    (
                        _evidence_from_factors(["PermissionsBaseline", "PermissionCombos"], contains_any=["cookies"])
                        + host_ev
                        + _evidence_from_factors(["NetworkExfil"])
                    ),
                    max_len=25,
                ),
                "mitigations": _ensure_max_len(
                    [
                        "Restrict the extension’s site access to only required domains.",
                        "Review and validate any external endpoints it contacts.",
                        "Avoid using with sensitive accounts if not necessary.",
                    ],
                    3,
                ),
            }
        )

    # Scenario 2: inject scripts
    if bool(flags.get("can_inject_scripts")):
        sev = "HIGH" if is_broad_host else "MEDIUM"
        scenarios.append(
            {
                "id": "inject_scripts",
                "title": "Page script injection",
                "severity": sev,
                "summary": "Can inject scripts into pages, which can change what you see and do on sites.",
                "why": "Script injection can modify pages and interact with content on matching sites.",
                "evidence_ids": _dedupe_strs(host_ev, max_len=15),
                "mitigations": _ensure_max_len(
                    [
                        "Limit site access to only the sites where it is needed.",
                        "Disable the extension on sensitive sites (banking, email, admin consoles).",
                    ],
                    3,
                ),
            }
        )

    # Scenario 3: analytics / unknown domains
    if analytics_domains or unknown_domains:
        sev = "MEDIUM" if unknown_domains else "LOW"
        examples = analytics_domains[:2] + [d for d in unknown_domains[:2] if d not in analytics_domains]
        scenarios.append(
            {
                "id": "analytics_or_unknown_domains",
                "title": "Contacts analytics or unrecognized domains",
                "severity": sev,
                "summary": "Contacts external domains that may be used for analytics/telemetry or are not in a known-good allowlist.",
                "why": (
                    f"Detected external domains (examples: {', '.join(examples)})." if examples else "Detected external domains in scan results."
                ),
                "evidence_ids": _evidence_from_factors(["NetworkExfil"]),
                "mitigations": _ensure_max_len(
                    [
                        "Review the extension’s privacy policy and disclosures.",
                        "Block or monitor unexpected domains at the network layer.",
                        "Prefer extensions that minimize external data sharing.",
                    ],
                    3,
                ),
            }
        )

    # Scenario 4: capture + network
    if bool(flags.get("can_capture_screenshots")) and has_network:
        scenarios.append(
            {
                "id": "capture_plus_network",
                "title": "Capture capability + network connectivity",
                "severity": "HIGH",
                "summary": "Can capture page/tab content and also has external connectivity signals.",
                "why": "Capture capabilities combined with network access can increase the risk of sensitive data being transmitted.",
                "evidence_ids": _dedupe_strs(_evidence_from_factors(["CaptureSignals"]) + _evidence_from_factors(["NetworkExfil"]), max_len=25),
                "mitigations": _ensure_max_len(
                    [
                        "Use only when necessary and avoid sensitive workflows.",
                        "Review capture-related permissions and features.",
                        "Monitor outbound network connections for unexpected destinations.",
                    ],
                    3,
                ),
            }
        )

    # Scenario 5: stale + obfuscation + low trust
    if stale and obfusc_present and low_trust:
        scenarios.append(
            {
                "id": "stale_obfuscated_low_trust",
                "title": "Stale + obfuscated + low trust signals",
                "severity": "HIGH",
                "summary": "Shows a combination of staleness, code obfuscation, and weak webstore trust signals.",
                "why": "Extensions that are not maintained, are hard to inspect, and have weak store signals can be higher risk to keep installed.",
                "evidence_ids": _dedupe_strs(
                    _evidence_from_factors(["Maintenance", "Obfuscation", "Webstore", "DisclosureAlignment"]),
                    max_len=25,
                ),
                "mitigations": _ensure_max_len(
                    [
                        "Prefer well-maintained alternatives with clear disclosures.",
                        "Limit usage and site access if you must keep it installed.",
                        "Re-evaluate after updates, especially if permissions expand.",
                    ],
                    3,
                ),
            }
        )

    return {
        "safety_label": safety_label,
        "scenarios": scenarios,
        "top_drivers": top_drivers,
    }


def build_report_view_model(
    manifest: Dict[str, Any],
    analysis_results: Dict[str, Any],
    metadata: Optional[Dict[str, Any]],
    extension_id: str,
    scan_id: str,
    skip_llm: bool = False,
    governance_verdict: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build the production `report_view_model` dict for the frontend.

    Args:
        manifest: parsed manifest.json
        analysis_results: workflow analysis_results dict
        metadata: webstore metadata dict (may be empty)
        extension_id: extension identifier
        scan_id: scan identifier
        skip_llm: if True, skip LLM calls and use deterministic fallbacks only.
                  Use this for retrieval paths to avoid slow LLM latency.
    """
    manifest = _coerce_dict(manifest)
    analysis_results = _coerce_dict(analysis_results)
    metadata = _coerce_dict(metadata)

    # -------------------------------------------------------------------------
    # Layer 0 + Scoring (deterministic)
    # -------------------------------------------------------------------------
    signal_pack_builder = SignalPackBuilder()
    signal_pack = signal_pack_builder.build(
        scan_id=scan_id or extension_id,
        analysis_results=analysis_results,
        metadata=metadata,
        manifest=manifest,
        extension_id=extension_id,
    )

    user_count = metadata.get("user_count") or metadata.get("users") or signal_pack.webstore_stats.installs
    scoring_engine = ScoringEngine(weights_version="v1")
    scoring_result = scoring_engine.calculate_scores(
        signal_pack=signal_pack,
        manifest=manifest,
        user_count=user_count if isinstance(user_count, int) else None,
        permissions_analysis=analysis_results.get("permissions_analysis"),
    )

    score = int(getattr(scoring_result, "overall_score", 0) or 0)
    score_label = _map_score_label_from_risk_level(
        getattr(scoring_result, "risk_level", None).value if getattr(scoring_result, "risk_level", None) else ""
    )

    # The authoritative verdict (governance Decision Authority) — not the numeric
    # score — owns the headline tone. Reconcile the score label up to the verdict
    # so all downstream copy (executive summary, scorecard, consumer summaries)
    # cannot soften a BLOCK/NEEDS_REVIEW into "review"/"appears safe". The score
    # number itself is unchanged and still rendered. (Phase 1 follow-up.)
    verdict = _normalize_verdict(getattr(scoring_result, "decision", None))
    # D1: the engine's scoring decision deliberately omits the org-policy and
    # baseline-governance BLOCK/NEEDS_REVIEW rungs (those are applied by the
    # governance node). The consumer report must not soften an authoritative
    # governance BLOCK/REVIEW into "appears safe", so escalate (never downgrade)
    # to the more severe of (engine verdict, authoritative governance verdict).
    verdict = _escalate_verdict(verdict, _normalize_verdict(governance_verdict))
    score_label = _reconcile_score_label(score_label, verdict)

    # -------------------------------------------------------------------------
    # Deterministic context (for evidence + fallbacks)
    # -------------------------------------------------------------------------
    host_access_summary, capability_flags, external_domains, network_evidence = _extract_context(
        manifest=manifest,
        analysis_results=analysis_results,
    )
    host_scope_label = host_access_summary.get("host_scope_label", "UNKNOWN")
    has_externally_connectable = bool(manifest.get("externally_connectable"))

    # -------------------------------------------------------------------------
    # LLM-backed outputs (with safe fallbacks)
    # -------------------------------------------------------------------------
    # Prefer already-computed pipeline outputs to avoid duplicate LLM calls.
    # When skip_llm=True (retrieval path), never call LLM - use deterministic fallbacks.
    executive_summary_raw: Any = (
        analysis_results.get("executive_summary")
        or analysis_results.get("summary")
        or analysis_results.get("executiveSummary")
    )
    if not (isinstance(executive_summary_raw, dict) and executive_summary_raw) and not skip_llm:
        try:
            executive_summary_raw = SummaryGenerator().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                metadata=metadata,
                scan_id=scan_id,
                extension_id=extension_id,
            )
        except Exception:
            executive_summary_raw = None

    executive_summary = (
        executive_summary_raw
        if isinstance(executive_summary_raw, dict) and executive_summary_raw
        else _fallback_executive_summary(score=score, score_label=score_label, host_scope_label=host_scope_label)
    )

    # ── Sanity gate: guard the EXACT text that will appear in scorecard.one_liner ──
    # Must mirror the expression on the scorecard assembly line below:
    #   str(executive_summary.get("one_liner") or executive_summary.get("summary") or "")
    # Old DB summaries only have "summary" (not "one_liner"), so we must check both.
    if isinstance(executive_summary, dict):
        display_text = str(
            executive_summary.get("one_liner")
            or executive_summary.get("summary")
            or ""
        )
        if _summary_contradicts_label(display_text, score_label):
            logger.warning(
                "Executive summary display text contradicts score_label (%s): %.80s… "
                "Falling back to deterministic summary.",
                score_label,
                display_text,
            )
            executive_summary = _fallback_executive_summary(
                score=score, score_label=score_label, host_scope_label=host_scope_label
            )

    impact_analysis_raw: Any = analysis_results.get("impact_analysis") or analysis_results.get("impactAnalysis")
    if not (isinstance(impact_analysis_raw, dict) and impact_analysis_raw) and not skip_llm:
        try:
            impact_analysis_raw = ImpactAnalyzer().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                extension_id=extension_id,
            )
        except Exception:
            impact_analysis_raw = None

    impact_analysis = (
        impact_analysis_raw
        if isinstance(impact_analysis_raw, dict) and impact_analysis_raw
        else _fallback_impact_from_capability_flags(
            capability_flags=capability_flags,
            external_domains=external_domains,
            network_evidence=network_evidence,
            has_externally_connectable=has_externally_connectable,
        )
    )

    privacy_compliance_raw: Any = analysis_results.get("privacy_compliance") or analysis_results.get("privacyCompliance")
    if not (isinstance(privacy_compliance_raw, dict) and privacy_compliance_raw) and not skip_llm:
        try:
            privacy_compliance_raw = PrivacyComplianceAnalyzer().generate(
                analysis_results=analysis_results,
                manifest=manifest,
                extension_dir=None,
                webstore_metadata=metadata,
            )
        except Exception:
            privacy_compliance_raw = None

    privacy_compliance = (
        privacy_compliance_raw
        if isinstance(privacy_compliance_raw, dict) and privacy_compliance_raw
        else {
            "privacy_snapshot": "",
            "data_categories": [],
            "governance_checks": [],
            "compliance_notes": [],
        }
    )
    # Deterministic injection: ensure site-terms compliance checks are present even
    # when privacy_compliance was precomputed/stored in analysis_results.
    privacy_compliance = (
        PrivacyComplianceAnalyzer._inject_travel_docs_site_terms_checks(
            result=privacy_compliance,
            manifest=manifest or {},
            analysis_results=analysis_results or {},
        )
        or privacy_compliance
    )

    # -------------------------------------------------------------------------
    # Normalize & compose report_view_model (stable shape)
    # -------------------------------------------------------------------------
    # Highlights: enforce list lengths and broad-access mention
    why_this_score = _ensure_len(
        _coerce_list(executive_summary.get("why_this_score") or executive_summary.get("key_findings")),
        3,
    )
    what_to_watch = _ensure_max_len(
        _coerce_list(executive_summary.get("what_to_watch") or executive_summary.get("recommendations")),
        2,
    )
    if host_scope_label == "ALL_WEBSITES":
        broad_terms = ["broad", "all websites", "all_urls", "<all_urls>", "*://*/*"]
        has_broad = any(any(t in str(item).lower() for t in broad_terms) for item in what_to_watch)
        if not has_broad:
            # Ensure we mention broad access (required)
            if len(what_to_watch) < 2:
                what_to_watch.append("Runs on all websites (broad host access).")
            else:
                what_to_watch[0] = "Runs on all websites (broad host access)."

    # Impact cards: enforce external_sharing UNKNOWN unless evidence exists
    impact_cards: List[Dict[str, Any]] = []
    for bucket_id, title in [
        ("data_access", "Data Access"),
        ("browser_control", "Browser Control"),
        ("external_sharing", "External Sharing"),
    ]:
        bucket = _coerce_dict(impact_analysis.get(bucket_id))
        if bucket_id == "external_sharing":
            has_external_evidence = bool(external_domains) or bool(network_evidence) or bool(has_externally_connectable)
            if not has_external_evidence:
                impact_cards.append(
                    {
                        "id": bucket_id,
                        "risk_level": "UNKNOWN",
                        "bullets": [],
                        "mitigations": [],
                        "title": title,
                    }
                )
                continue

        impact_cards.append(
            {
                "id": bucket_id,
                "risk_level": str(bucket.get("risk_level") or "UNKNOWN"),
                "bullets": _ensure_max_len(_coerce_list(bucket.get("bullets")), 3),
                "mitigations": _ensure_max_len(_coerce_list(bucket.get("mitigations")), 3),
                "title": title,
            }
        )

    # -------------------------------------------------------------------------
    # Consumer insights (deterministic aggregation; safe fallbacks)
    # -------------------------------------------------------------------------
    scoring_v2_for_insights: Optional[Dict[str, Any]] = None
    try:
        # Includes layer factor contributions + evidence IDs
        scoring_v2_for_insights = scoring_result.model_dump_for_api() if scoring_result else None
    except Exception:
        scoring_v2_for_insights = None
    # D1: surface the escalated (engine ∨ governance) verdict to consumer insights
    # so they cannot read a softer engine-only decision.
    if isinstance(scoring_v2_for_insights, dict):
        scoring_v2_for_insights["decision"] = verdict

    consumer_insights = build_consumer_insights(
        scoring_v2=scoring_v2_for_insights,
        capability_flags=capability_flags,
        host_access_summary=host_access_summary,
        permissions_analysis=analysis_results.get("permissions_analysis") or {},
        webstore_metadata=metadata,
        network_evidence=network_evidence,
        external_domains=external_domains,
    )

    # -------------------------------------------------------------------------
    # Layer Details Generation (LLM with deterministic fallback)
    # -------------------------------------------------------------------------
    # Gate results feed both the LLM generator and the deterministic fallback.
    gate_results = []
    if scoring_result and hasattr(scoring_engine, '_last_gate_results'):
        gate_results = scoring_engine._last_gate_results or []

    # Prefer already-computed pipeline outputs to avoid duplicate LLM calls.
    # When skip_llm=True (retrieval path), never call the LLM - use the
    # deterministic fallback below.
    layer_details_raw: Any = (
        analysis_results.get("layer_details")
        or analysis_results.get("layerDetails")
    )
    if not (isinstance(layer_details_raw, dict) and layer_details_raw) and not skip_llm:
        try:
            layer_details_generator = LayerDetailsGenerator()
            layer_details_raw = layer_details_generator.generate(
                scoring_result=scoring_result,
                analysis_results=analysis_results,
                manifest=manifest,
                gate_results=gate_results,
            )
        except Exception:
            layer_details_raw = None

    # Use deterministic fallback if LLM was skipped or failed
    layer_details = (
        layer_details_raw
        if isinstance(layer_details_raw, dict) and layer_details_raw
        else LayerHumanizer.generate_layer_details_fallback(
            scoring_result=scoring_result,
            analysis_results=analysis_results,
            manifest=manifest,
            gate_results=gate_results,
        )
    )

    report_view_model = {
        "meta": {
            "extension_id": extension_id,
            "name": (manifest.get("name") or metadata.get("title") or metadata.get("name") or extension_id),
            "version": manifest.get("version") or metadata.get("version") or "0.0.0",
            "description": (manifest.get("description") or metadata.get("description") or ""),
            "scan_id": scan_id or extension_id,
            "scanned_at": _utc_now_iso(),
            "host_scope_label": host_scope_label,
        },
        "scorecard": {
            "score": score,
            "score_label": score_label,
            "confidence": str(executive_summary.get("confidence") or "LOW"),
            "one_liner": str(executive_summary.get("one_liner") or executive_summary.get("summary") or ""),
        },
        "highlights": {
            "why_this_score": why_this_score,
            "what_to_watch": what_to_watch,
        },
        "impact_cards": [
            {
                "id": c["id"],
                "risk_level": c["risk_level"],
                "bullets": c["bullets"],
                "mitigations": c["mitigations"],
                # keep extra fields if frontend wants them; safe to ignore
                "title": c.get("title"),
            }
            for c in impact_cards
        ],
        "privacy_snapshot": {
            "privacy_snapshot": str(privacy_compliance.get("privacy_snapshot") or ""),
            "data_categories": _ensure_max_len(_coerce_list(privacy_compliance.get("data_categories")), 12),
            "governance_checks": _coerce_list(privacy_compliance.get("governance_checks")),
            "compliance_notes": _coerce_list(privacy_compliance.get("compliance_notes")),
        },
        "evidence": {
            "host_access_summary": host_access_summary,
            "capability_flags": capability_flags,
            "external_domains": external_domains,
            "network_evidence": network_evidence,
            "webstore_metadata": metadata,
            "sast_summary_or_findings": (
                (analysis_results.get("javascript_analysis") or {}).get("sast_analysis")
                or (analysis_results.get("javascript_analysis") or {}).get("sast_findings", {})
            ),
            "permissions_summary": analysis_results.get("permissions_analysis") or {},
        },
        "raw": {
            "executive_summary": executive_summary,
            "impact_analysis": impact_analysis,
            "privacy_compliance": privacy_compliance,
        },
        "consumer_insights": consumer_insights,
        "layer_details": layer_details,
    }

    # -------------------------------------------------------------------------
    # Consumer Summary (clean, ranked facts — not taxonomy)
    # Verdict + 2-3 reasons + access + action, <= 80 words total
    # -------------------------------------------------------------------------
    scoring_v2_for_summary: Optional[Dict[str, Any]] = None
    try:
        scoring_v2_for_summary = scoring_result.model_dump_for_api() if scoring_result else None
    except Exception:
        scoring_v2_for_summary = None
    # D1: the consumer/unified summaries derive their verdict from scoring_v2's
    # decision; feed them the escalated (engine ∨ governance) verdict so an
    # org/baseline-governance BLOCK/REVIEW is never softened to "appears safe".
    if isinstance(scoring_v2_for_summary, dict):
        scoring_v2_for_summary["decision"] = verdict

    report_view_model["consumer_summary"] = build_consumer_summary(
        report_view_model=report_view_model,
        scoring_v2=scoring_v2_for_summary,
    )

    # -------------------------------------------------------------------------
    # Unified Consumer Summary (NEW: simplified format with LLM plain English)
    # headline + tldr + concerns + recommendation
    # -------------------------------------------------------------------------
    report_view_model["unified_summary"] = build_unified_consumer_summary(
        report_view_model=report_view_model,
        scoring_v2=scoring_v2_for_summary,
        analysis_results=analysis_results,
        manifest=manifest,
        extension_name=manifest.get("name") or metadata.get("title") or metadata.get("name"),
        skip_llm=skip_llm,
    )

    return report_view_model


