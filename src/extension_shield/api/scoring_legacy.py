"""
Legacy Scoring Functions

.. deprecated::
    These functions pre-date the V2 ``ScoringEngine`` and are retained only
    for backward-compatible ``determine_overall_risk`` calls on pre-V2 scan
    rows.  New code should use ``extension_shield.scoring.engine.ScoringEngine``
    exclusively.  This module will be removed in a future release.
"""

from __future__ import annotations

import warnings
from typing import Any, Dict

from extension_shield.workflow.state import WorkflowState


# ── Permission-Purpose Alignment (context-aware model) ──────────────────

def _calculate_permission_alignment_penalty(
    manifest: Dict,
    permissions_details: Dict,
    permissions_analysis: Dict,
    analysis_results: Dict,
) -> int:
    """
    Calculate penalty based on permission-purpose alignment.

    Differentiates legitimate use (e.g. Vimium needing ``<all_urls>`` for
    keyboard navigation) from abusive use (e.g. Honey collecting data
    covertly).

    Returns:
        int: penalty points 0-20
    """
    name = manifest.get("name", "").lower()
    description = manifest.get("description", "").lower()

    permissions = set(permissions_details.keys()) if permissions_details else set()

    base_risk = 0
    transparency_score = 1.0
    covert_multiplier = 1.0

    has_all_urls = any(
        p in permissions
        or p in str(permissions_analysis.get("host_permissions_analysis", ""))
        for p in ["<all_urls>", "*://*/*"]
    )
    has_cookies = "cookies" in permissions
    has_web_request = any(p in permissions for p in ["webRequest", "webRequestBlocking"])
    has_history = "history" in permissions
    has_clipboard = any(
        p in permissions for p in ["clipboardRead", "clipboardWrite"]
    )
    has_tabs = "tabs" in permissions
    has_screenshot = any(
        p in permissions for p in ["desktopCapture", "tabCapture"]
    )
    screenshot_analysis = permissions_analysis.get("screenshot_capture_analysis", {})
    has_screenshot_lib = (
        screenshot_analysis.get("detected", False)
        if isinstance(screenshot_analysis, dict)
        else False
    )

    transparency_keywords = {
        "all_urls": [
            "browser", "navigation", "keyboard", "shortcut",
            "accessibility", "reader", "dark mode", "style",
        ],
        "cookies": [
            "login", "session", "authentication", "sync",
            "password", "manager",
        ],
        "webRequest": [
            "block", "filter", "ad", "privacy", "tracker", "vpn", "proxy",
        ],
        "history": ["history", "bookmark", "search", "session", "backup"],
        "clipboard": ["clipboard", "copy", "paste", "text", "snippet"],
        "screenshot": [
            "screenshot", "capture", "image", "pdf", "print", "screen",
        ],
    }

    if has_all_urls:
        if not any(
            kw in name or kw in description
            for kw in transparency_keywords["all_urls"]
        ):
            transparency_score *= 0.5
    if has_cookies:
        if not any(
            kw in name or kw in description
            for kw in transparency_keywords["cookies"]
        ):
            transparency_score *= 0.7
    if has_web_request:
        if not any(
            kw in name or kw in description
            for kw in transparency_keywords["webRequest"]
        ):
            transparency_score *= 0.6
    if has_screenshot or has_screenshot_lib:
        if not any(
            kw in name or kw in description
            for kw in transparency_keywords["screenshot"]
        ):
            transparency_score *= 0.3

    js_analysis = analysis_results.get("javascript_analysis", {})
    has_third_party_api = False
    if js_analysis and isinstance(js_analysis, dict):
        sast_findings = js_analysis.get("sast_findings", {})
        for findings_list in sast_findings.values():
            for finding in findings_list:
                check_id = finding.get("check_id", "")
                if "third_party" in check_id.lower() or "external_api" in check_id.lower():
                    has_third_party_api = True
                    break
            if has_third_party_api:
                break

    if has_cookies or has_history or has_clipboard:
        covert_multiplier = 2.0

    if has_all_urls and has_third_party_api:
        base_risk += 4
    if has_all_urls and has_web_request:
        base_risk += 3
    if has_cookies and has_third_party_api:
        base_risk += 5
    if has_screenshot and has_third_party_api:
        base_risk += 6
    if has_history and has_third_party_api:
        base_risk += 5
    if has_tabs and has_third_party_api:
        base_risk += 3

    transparency_multiplier = 2.0 - transparency_score
    penalty = int(base_risk * transparency_multiplier * covert_multiplier)
    return min(20, penalty)


# ── Legacy composite score ──────────────────────────────────────────────

def calculate_security_score(state: WorkflowState) -> int:
    """
    Legacy security score using weighted multi-factor analysis.

    .. deprecated::
        Use ``ScoringEngine.calculate_scores()`` from
        ``extension_shield.scoring.engine`` instead.

    Returns:
        int: Security score from 0 (dangerous) to 100 (secure)
    """
    warnings.warn(
        "calculate_security_score() is deprecated. "
        "Use ScoringEngine.calculate_scores() instead.",
        DeprecationWarning,
        stacklevel=2,
    )

    analysis_results = state.get("analysis_results", {}) or {}
    manifest = state.get("manifest_data", {}) or {}

    sast_score = 0
    javascript_analysis = analysis_results.get("javascript_analysis", {})
    if javascript_analysis and isinstance(javascript_analysis, dict):
        sast_findings = javascript_analysis.get("sast_findings", {})
        for findings_list in sast_findings.values():
            for finding in findings_list:
                check_id = finding.get("check_id", "")
                if "third_party" in check_id.lower() or "external_api" in check_id.lower():
                    continue
                severity = finding.get("extra", {}).get("severity", "INFO").upper()
                if severity in ("CRITICAL", "HIGH"):
                    sast_score += 8
                elif severity in ("ERROR", "MEDIUM"):
                    sast_score += 4
                elif severity == "WARNING":
                    sast_score += 1
    sast_score = min(40, sast_score)

    permissions_score = 0
    permissions_analysis = analysis_results.get("permissions_analysis", {}) or {}
    permissions_details = (
        permissions_analysis.get("permissions_details")
        if isinstance(permissions_analysis, dict)
        else None
    )
    if not isinstance(permissions_details, dict):
        permissions_details = {}
    for _, perm_analysis in permissions_details.items():
        is_reasonable = perm_analysis.get("is_reasonable", True)
        risk = perm_analysis.get("risk_level", "").lower()
        if not is_reasonable:
            if risk == "high":
                permissions_score += 5
            elif risk == "medium":
                permissions_score += 2
            else:
                permissions_score += 1
    permissions_score = min(30, permissions_score)

    webstore_score = 0
    metadata = state.get("extension_metadata", {}) or {}
    rating = metadata.get("rating")
    if rating:
        try:
            rating_val = float(rating)
            if rating_val >= 4.5:
                webstore_score += 0
            elif rating_val >= 4.0:
                webstore_score += 2
            elif rating_val >= 3.0:
                webstore_score += 5
            else:
                webstore_score += 10
        except (ValueError, TypeError):
            webstore_score += 3
    else:
        webstore_score += 3
    users = metadata.get("users", "0")
    try:
        user_count = int(users.replace(",", "").replace("+", ""))
        if user_count >= 1000000:
            webstore_score += 0
        elif user_count >= 100000:
            webstore_score += 2
        elif user_count >= 10000:
            webstore_score += 5
        else:
            webstore_score += 8
    except (ValueError, TypeError):
        webstore_score += 5
    webstore_score = min(20, webstore_score)

    manifest_score = 0
    if not manifest.get("name") or manifest.get("name", "").startswith("__MSG_"):
        manifest_score += 3
    if not manifest.get("description") or manifest.get("description", "").startswith("__MSG_"):
        manifest_score += 2
    if not manifest.get("content_security_policy"):
        manifest_score += 2
    if not manifest.get("update_url"):
        manifest_score += 1
    manifest_score = min(10, manifest_score)

    third_party_api_score = 0
    if javascript_analysis and isinstance(javascript_analysis, dict):
        sast_findings = javascript_analysis.get("sast_findings", {})
        third_party_detected = False
        for findings_list in sast_findings.values():
            for finding in findings_list:
                check_id = finding.get("check_id", "")
                if check_id and (
                    "banking.third_party.external_api_calls" in check_id
                    or "third_party" in check_id.lower()
                    or "external_api" in check_id.lower()
                ):
                    third_party_detected = True
                    break
            if third_party_detected:
                break
        if third_party_detected:
            third_party_api_score = 1

    screenshot_score = 0
    if permissions_analysis and isinstance(permissions_analysis, dict):
        screenshot_analysis = permissions_analysis.get("screenshot_capture_analysis", {})
        if isinstance(screenshot_analysis, dict) and screenshot_analysis.get("detected", False):
            screenshot_score = 3
            extension_name = manifest.get("name", "").lower()
            extension_desc = manifest.get("description", "").lower()
            screenshot_keywords = [
                "screenshot", "capture", "snap", "screen", "image", "pdf", "print",
            ]
            is_screenshot_tool = any(
                kw in extension_name or kw in extension_desc
                for kw in screenshot_keywords
            )
            if is_screenshot_tool:
                screenshot_score = 1
            else:
                has_network = any(
                    perm in permissions_details
                    for perm in ["webRequest", "webRequestBlocking", "<all_urls>"]
                )
                if has_network:
                    screenshot_score = 10
                has_storage = any(
                    perm in permissions_details
                    for perm in ["clipboardWrite", "downloads"]
                )
                if has_storage and has_network:
                    screenshot_score = 15

    virustotal_score = 0
    virustotal_analysis = analysis_results.get("virustotal_analysis", {})
    if virustotal_analysis and isinstance(virustotal_analysis, dict):
        if virustotal_analysis.get("enabled"):
            total_malicious = virustotal_analysis.get("total_malicious", 0)
            total_suspicious = virustotal_analysis.get("total_suspicious", 0)
            if total_malicious > 0:
                if total_malicious >= 10:
                    virustotal_score = 50
                elif total_malicious >= 5:
                    virustotal_score = 40
                elif total_malicious >= 2:
                    virustotal_score = 30
                else:
                    virustotal_score = 15
            elif total_suspicious > 0:
                virustotal_score = min(20, total_suspicious * 5)

    entropy_score = 0
    entropy_analysis = analysis_results.get("entropy_analysis", {})
    if entropy_analysis and isinstance(entropy_analysis, dict):
        obfuscated_files = entropy_analysis.get("obfuscated_files", 0)
        suspicious_files = entropy_analysis.get("suspicious_files", 0)
        uc = 0
        try:
            users_str = state.get("extension_metadata", {}).get("users", "0")
            uc = int(str(users_str).replace(",", "").replace("+", ""))
        except (ValueError, TypeError):
            pass
        popularity_modifier = 0.5 if uc >= 100000 else 1.0
        if obfuscated_files > 0:
            entropy_score += int(min(20, obfuscated_files * 8) * popularity_modifier)
        if suspicious_files > 0:
            entropy_score += min(10, suspicious_files * 4)
        entropy_score = min(30, entropy_score)

    chromestats_score = 0
    chromestats_analysis = analysis_results.get("chromestats_analysis", {})
    if chromestats_analysis and isinstance(chromestats_analysis, dict):
        if chromestats_analysis.get("enabled") and not chromestats_analysis.get("error"):
            chromestats_score = min(28, chromestats_analysis.get("total_risk_score", 0))

    alignment_penalty = _calculate_permission_alignment_penalty(
        manifest=manifest,
        permissions_details=permissions_details,
        permissions_analysis=permissions_analysis,
        analysis_results=analysis_results,
    )

    final_score = (
        sast_score
        + permissions_score
        + webstore_score
        + manifest_score
        + third_party_api_score
        + screenshot_score
        + virustotal_score
        + entropy_score
        + chromestats_score
        + alignment_penalty
    )
    return max(0, min(100, 100 - final_score))


def determine_overall_risk(state: WorkflowState) -> str:
    """Determine overall risk level (uses legacy scorer)."""
    score = calculate_security_score(state)
    if score < 30:
        return "high"
    if score < 70:
        return "medium"
    return "low"


def count_total_findings(state: WorkflowState) -> int:
    """Count total security findings including unreasonable permissions."""
    analysis_results = state.get("analysis_results", {}) or {}
    javascript_analysis = analysis_results.get("javascript_analysis", {})
    total = 0
    if javascript_analysis:
        sast_findings = javascript_analysis.get("sast_findings", {})
        for findings_list in sast_findings.values():
            if findings_list is not None:
                total += len(findings_list)
    permissions_analysis = analysis_results.get("permissions_analysis", {}) or {}
    permissions_details = (
        permissions_analysis.get("permissions_details")
        if isinstance(permissions_analysis, dict)
        else None
    )
    if not isinstance(permissions_details, dict):
        permissions_details = {}
    for _, perm_analysis in permissions_details.items():
        # Tri-state (D4): only CONFIRMED-unreasonable (False) is a finding;
        # None = analysis unavailable, not unreasonable, so it must not be counted.
        if perm_analysis.get("is_reasonable") is False:
            total += 1
    return total


def calculate_total_risk_score(state: WorkflowState) -> int:
    """Calculate total risk score from SAST findings."""
    analysis_results = state.get("analysis_results", {}) or {}
    javascript_analysis = analysis_results.get("javascript_analysis", {})
    js_analysis = []
    if javascript_analysis and isinstance(javascript_analysis, dict):
        sast_findings = javascript_analysis.get("sast_findings", {})
        for findings_list in sast_findings.values():
            js_analysis.extend(findings_list)
    elif isinstance(javascript_analysis, list):
        js_analysis = javascript_analysis
    severity_scores = {
        "CRITICAL": 10, "HIGH": 8, "ERROR": 5,
        "MEDIUM": 5, "WARNING": 1, "INFO": 0,
    }
    total_score = 0
    for finding in js_analysis:
        severity = finding.get("extra", {}).get("severity", "INFO")
        total_score += severity_scores.get(severity, 0)
    return total_score
