"""
Normalizers Module

Pure functions that normalize raw signal pack values to severity [0,1] and confidence [0,1].
Uses mathematical formulas for diminishing returns and proper confidence handling.

Key Principles:
1. Severity [0,1]: How risky is this factor? (0 = no risk, 1 = maximum risk)
2. Confidence [0,1]: How confident are we in this severity? (accounts for data quality/availability)
3. Exponential saturation: severity = 1 - exp(-k * x) for diminishing returns
4. Popularity affects CONFIDENCE, not severity (popular extensions may use legitimate minification)
"""

import logging
import math
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

from extension_shield.governance.signal_pack import (
    ChromeStatsSignalPack,
    EntropySignalPack,
    NetworkSignalPack,
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
    VirusTotalSignalPack,
    WebstoreStatsSignalPack,
)
from extension_shield.scoring.models import FactorScore
from extension_shield.scoring.weights import (
    SECURITY_WEIGHTS_V1,
    PRIVACY_WEIGHTS_V1,
    SecurityFactors,
    PrivacyFactors,
)


# =============================================================================
# CONSTANTS
# =============================================================================

# Test file patterns to exclude from SAST analysis
TEST_FILE_PATTERNS = [
    r"[\\/]test[\\/]",
    r"[\\/]tests[\\/]",
    r"[\\/]spec[\\/]",
    r"[\\/]__tests__[\\/]",
    r"[\\/]fixtures[\\/]",
    r"[\\/]mocks[\\/]",
    r"[\\/]__mocks__[\\/]",
    r"\.test\.",
    r"\.spec\.",
    r"_test\.",
    r"_spec\.",
    r"test_",
]

# SAST severity weights for scoring
# CRITICAL findings should dominate the score to ensure security scores reflect true risk
SAST_SEVERITY_WEIGHTS: Dict[str, float] = {
    "CRITICAL": 15.0,  # Increased from 4.0 - critical findings should dominate security score
    "HIGH": 8.0,       # Increased from 4.0 - high severity findings are serious
    "ERROR": 3.0,      # Increased from 2.0
    "MEDIUM": 1.5,     # Decreased from 2.0 - less impact to balance critical/high
    "WARNING": 0.5,
    "INFO": 0.1,
    "LOW": 0.1,
}

# Dangerous permission combinations that indicate privacy risk
DANGEROUS_PERMISSION_COMBOS: List[Tuple[Set[str], float]] = [
    # (required permissions, severity addition)
    ({"cookies", "webRequest"}, 0.5),
    ({"cookies", "webRequestBlocking"}, 0.6),
    ({"clipboardRead", "webRequest"}, 0.4),
    ({"clipboardRead", "<all_urls>"}, 0.4),
    ({"debugger", "tabs"}, 0.7),
    ({"nativeMessaging"}, 0.7),
    ({"debugger"}, 0.5),
]

# Broad host patterns that indicate <all_urls> equivalent
BROAD_HOST_PATTERNS = {"<all_urls>", "*://*/*", "http://*/*", "https://*/*"}

# Known good domains (analytics, CDNs, etc.)
KNOWN_GOOD_DOMAINS = {
    "googleapis.com", "google.com", "gstatic.com",
    "cloudflare.com", "cdnjs.cloudflare.com",
    "unpkg.com", "jsdelivr.net",
    "chrome.google.com",
}

# Analytics domains (moderate risk - data collection but usually legitimate)
ANALYTICS_DOMAINS = {
    "google-analytics.com", "googletagmanager.com",
    "analytics.google.com", "mixpanel.com",
    "segment.io", "amplitude.com", "hotjar.com",
}

# Suspicious network patterns in code
SUSPICIOUS_NETWORK_PATTERNS = [
    r"http://",  # Unencrypted HTTP
    r"btoa\(",   # Base64 encoding (potential data exfil)
    r"atob\(",   # Base64 decoding
    r"\+\s*['\"][^'\"]+['\"]",  # String concatenation (dynamic URLs)
]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def _saturating_severity(x: float, k: float = 0.08) -> float:
    """
    Compute severity using saturating exponential formula.
    
    Formula: severity = 1 - exp(-k * x)
    
    This provides diminishing returns - the first issues matter most,
    additional issues add progressively less to severity.
    
    Args:
        x: Raw score/count to convert
        k: Saturation rate (higher = faster saturation)
        
    Returns:
        Severity in [0, 1]
    """
    return 1.0 - math.exp(-k * x)


def _is_test_file(file_path: str) -> bool:
    """Check if file path matches test file patterns."""
    for pattern in TEST_FILE_PATTERNS:
        if re.search(pattern, file_path, re.IGNORECASE):
            return True
    return False


def _dedupe_sast_findings(
    findings: List[SastFindingNormalized],
) -> List[SastFindingNormalized]:
    """
    Deduplicate SAST findings by (rule_id, file_path, line) or (rule_id, file_path).
    
    Args:
        findings: List of SAST findings
        
    Returns:
        Deduplicated list of findings
    """
    seen: Dict[str, SastFindingNormalized] = {}
    
    for finding in findings:
        # Primary key: (check_id, file_path, line)
        if finding.line_number:
            key = f"{finding.check_id}:{finding.file_path}:{finding.line_number}"
        else:
            # Fallback: (check_id, file_path)
            key = f"{finding.check_id}:{finding.file_path}"
        
        if key not in seen:
            seen[key] = finding
    
    return list(seen.values())


def _parse_user_count(user_string: Optional[str]) -> Optional[int]:
    """Parse user count from various string formats."""
    if not user_string:
        return None
    try:
        # Handle formats like "1,000,000+", "500K", "1M"
        cleaned = str(user_string).replace(",", "").replace("+", "").strip()
        if cleaned.upper().endswith("M"):
            return int(float(cleaned[:-1]) * 1_000_000)
        elif cleaned.upper().endswith("K"):
            return int(float(cleaned[:-1]) * 1_000)
        return int(cleaned)
    except (ValueError, TypeError):
        return None


# =============================================================================
# SECURITY LAYER NORMALIZERS
# =============================================================================

def normalize_sast(
    sast_pack: SastSignalPack,
    user_count: Optional[int] = None,
) -> FactorScore:
    """
    Normalize SAST findings to severity and confidence.
    
    Formula:
        - Exclude test files
        - Deduplicate by (rule_id, file_path, line)
        - Weight: CRITICAL/HIGH=4, MEDIUM/ERROR=2, WARNING=0.5, INFO=0.1
        - x = sum(weights) after dedup
        - severity = 1 - exp(-0.08 * x)
        - confidence = 1.0 if findings exist, 0.6 if analyzer missing, 0.8 if partial
    
    Args:
        sast_pack: SAST signal pack with findings
        user_count: Optional user count (not used in severity, kept for API consistency)
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    # Filter out test files
    filtered_findings = [
        f for f in sast_pack.deduped_findings
        if not _is_test_file(f.file_path)
    ]
    
    # Deduplicate
    deduped = _dedupe_sast_findings(filtered_findings)
    
    # Calculate weighted sum
    x = 0.0
    severity_breakdown: Dict[str, int] = {}
    
    for finding in deduped:
        severity_upper = finding.severity.upper()
        weight = SAST_SEVERITY_WEIGHTS.get(severity_upper, 0.1)
        x += weight
        severity_breakdown[severity_upper] = severity_breakdown.get(severity_upper, 0) + 1
    
    # Compute severity using saturating formula
    # Use more aggressive saturation for critical security findings
    severity = _saturating_severity(x, k=0.12)  # Increased from 0.08 for faster saturation
    
    # Determine confidence
    if not sast_pack.deduped_findings and sast_pack.files_scanned == 0:
        confidence = 0.6  # Analyzer missing or didn't run
    elif deduped:
        confidence = 1.0  # Have findings, high confidence
    else:
        confidence = 0.8  # Analyzer ran but no findings (partial confidence)
    
    # Build evidence IDs
    evidence_ids = [f"sast:{f.check_id}:{f.file_path}" for f in deduped[:10]]
    
    return FactorScore(
        name=SecurityFactors.SAST,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.SAST],
        evidence_ids=evidence_ids,
        details={
            "raw_findings": len(sast_pack.deduped_findings),
            "filtered_findings": len(filtered_findings),
            "deduped_findings": len(deduped),
            "weighted_sum": round(x, 2),
            "severity_breakdown": severity_breakdown,
            "files_scanned": sast_pack.files_scanned,
        },
        flags=["sast_issues_found"] if severity > 0.3 else [],
    )


def normalize_virustotal(vt_pack: VirusTotalSignalPack) -> FactorScore:
    """
    Normalize VirusTotal results to severity and confidence.
    
    Formula:
        - Malicious count mapping: 0→0, 1→0.3, 2-4→0.6, 5-9→0.8, >=10→1.0
        - Add suspicious: +0.05 each up to +0.2
        - confidence = 1.0 if VT present, 0.4 if missing, 0.7 if rate-limited
    
    Args:
        vt_pack: VirusTotal signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    # When VT is unavailable, exclude it from the weighted formula entirely
    # by setting confidence=0.0. This prevents missing data from artificially
    # inflating scores (severity=0 + confidence>0 adds to the denominator
    # without adding risk, which makes the extension look safer than warranted).
    if not vt_pack.enabled:
        return FactorScore(
            name=SecurityFactors.VIRUSTOTAL,
            severity=0.0,
            confidence=0.0,
            weight=SECURITY_WEIGHTS_V1[SecurityFactors.VIRUSTOTAL],
            evidence_ids=[],
            details={"message": "VirusTotal not enabled or unavailable"},
            flags=["signal_unavailable"],
        )
    
    # Map malicious count to severity
    mal_count = vt_pack.malicious_count
    if mal_count >= 10:
        base_severity = 1.0
    elif mal_count >= 5:
        base_severity = 0.8
    elif mal_count >= 2:
        base_severity = 0.6
    elif mal_count >= 1:
        base_severity = 0.3
    else:
        base_severity = 0.0
    
    # Add suspicious contribution (+0.05 each, up to +0.2)
    suspicious_add = min(0.2, vt_pack.suspicious_count * 0.05)
    severity = min(1.0, base_severity + suspicious_add)
    
    # Determine confidence
    if vt_pack.total_engines == 0:
        confidence = 0.0  # No engine data (rate-limited) — exclude from formula
    elif vt_pack.total_engines < 30:
        confidence = 0.7  # Partial scan (rate-limited or timeout)
    else:
        confidence = 1.0  # Full scan
    
    # Build flags
    flags = []
    if mal_count > 0:
        flags.append("malware_detected")
    if mal_count >= 5:
        flags.append("high_detection_consensus")
    if vt_pack.malware_families:
        flags.append(f"malware_families:{len(vt_pack.malware_families)}")
    
    return FactorScore(
        name=SecurityFactors.VIRUSTOTAL,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.VIRUSTOTAL],
        evidence_ids=[f"vt:detection:{vt_pack.malicious_count}"],
        details={
            "malicious_count": vt_pack.malicious_count,
            "suspicious_count": vt_pack.suspicious_count,
            "total_engines": vt_pack.total_engines,
            "malware_families": vt_pack.malware_families[:5],
            "threat_level": vt_pack.threat_level,
        },
        flags=flags,
    )


def normalize_entropy(
    entropy_pack: EntropySignalPack,
    user_count: Optional[int] = None,
) -> FactorScore:
    """
    Normalize entropy/obfuscation analysis to severity and confidence.
    
    Formula:
        - x = 2*obfuscated_files + 1*suspicious_files
        - severity = 1 - exp(-0.2 * x)
        - confidence adjustment for popularity:
          - users >= 1M: confidence *= 0.6 (popular = likely legitimate minification)
          - users >= 100K: confidence *= 0.7
          - else: confidence = 1.0
    
    NOTE: Popularity affects CONFIDENCE, not severity. Popular extensions may use
    legitimate minification tools, so we're less confident obfuscation is malicious.
    
    Args:
        entropy_pack: Entropy signal pack
        user_count: Optional user count for confidence adjustment
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    obfuscated = entropy_pack.obfuscated_count
    suspicious = entropy_pack.suspicious_count
    
    # Weighted sum: obfuscated files count more than suspicious
    x = 2 * obfuscated + 1 * suspicious
    
    # Compute severity
    severity = _saturating_severity(x, k=0.2)
    
    # Base confidence
    if entropy_pack.files_analyzed == 0:
        confidence = 0.5  # No analysis performed
    else:
        confidence = 0.9  # Good analysis
    
    # Adjust confidence based on popularity
    # Popular extensions often use legitimate build tools (webpack, etc.)
    if user_count is not None:
        if user_count >= 1_000_000:
            confidence *= 0.6  # Very popular - likely legitimate
        elif user_count >= 100_000:
            confidence *= 0.7  # Popular - probably legitimate
    
    # Build flags
    flags = []
    if obfuscated > 0:
        flags.append("obfuscation_detected")
    if entropy_pack.high_risk_patterns:
        flags.append("high_risk_patterns")
    
    return FactorScore(
        name=SecurityFactors.OBFUSCATION,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.OBFUSCATION],
        evidence_ids=[f"entropy:file:{f}" for f in entropy_pack.suspected_obfuscation_files[:5]],
        details={
            "obfuscated_count": obfuscated,
            "suspicious_count": suspicious,
            "files_analyzed": entropy_pack.files_analyzed,
            "high_risk_patterns": entropy_pack.high_risk_patterns,
            "overall_risk": entropy_pack.overall_risk,
            "user_count_adjusted": user_count is not None,
        },
        flags=flags,
    )


def normalize_manifest_posture(
    manifest: Dict[str, Any],
    perms: PermissionsSignalPack,
) -> FactorScore:
    """
    Normalize manifest security posture to severity and confidence.
    
    Formula:
        - Missing CSP → +0.3
        - MV2 legacy → +0.2
        - Broad host permissions → +0.3
        - Cap severity at 1.0
        - confidence = 1.0 if manifest parsed
    
    Args:
        manifest: Raw manifest data
        perms: Permissions signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    severity = 0.0
    issues: List[str] = []
    
    # Check Content Security Policy
    csp = manifest.get("content_security_policy")
    if not csp:
        severity += 0.3
        issues.append("missing_csp")
    
    # Check manifest version (MV2 is deprecated)
    manifest_version = manifest.get("manifest_version", 2)
    if manifest_version < 3:
        severity += 0.2
        issues.append("mv2_legacy")
    
    # Check for broad host permissions
    if perms.has_broad_host_access:
        severity += 0.3
        issues.append("broad_host_access")
    
    # Cap at 1.0
    severity = min(1.0, severity)
    
    # High confidence if manifest was parsed
    confidence = 1.0 if manifest else 0.5
    
    return FactorScore(
        name=SecurityFactors.MANIFEST,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.MANIFEST],
        evidence_ids=[f"manifest:issue:{issue}" for issue in issues],
        details={
            "has_csp": bool(csp),
            "manifest_version": manifest_version,
            "has_broad_host_access": perms.has_broad_host_access,
            "broad_host_patterns": perms.broad_host_patterns,
            "issues": issues,
        },
        flags=issues,
    )


def normalize_chromestats(chromestats: ChromeStatsSignalPack) -> FactorScore:
    """
    Normalize ChromeStats behavioral data to severity and confidence.
    
    Uses the pre-calculated risk score from ChromeStats and normalizes it.
    
    Args:
        chromestats: ChromeStats signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    if not chromestats.enabled:
        return FactorScore(
            name=SecurityFactors.CHROMESTATS,
            severity=0.0,
            confidence=0.0,
            weight=SECURITY_WEIGHTS_V1[SecurityFactors.CHROMESTATS],
            evidence_ids=[],
            details={"message": "ChromeStats not enabled"},
            flags=["signal_unavailable"],
        )
    
    # Normalize the risk score (original max was ~28)
    raw_score = chromestats.total_risk_score
    severity = _saturating_severity(raw_score, k=0.1)
    
    # Map risk level to flags
    flags = []
    if chromestats.overall_risk_level in ("high", "critical"):
        flags.append(f"chromestats_{chromestats.overall_risk_level}")
    
    return FactorScore(
        name=SecurityFactors.CHROMESTATS,
        severity=round(severity, 4),
        confidence=0.8,  # ChromeStats is generally reliable
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.CHROMESTATS],
        evidence_ids=[f"chromestats:{ind}" for ind in chromestats.risk_indicators[:5]],
        details={
            "total_risk_score": raw_score,
            "overall_risk_level": chromestats.overall_risk_level,
            "risk_indicators": chromestats.risk_indicators[:10],
        },
        flags=flags,
    )


def normalize_webstore_trust(stats: WebstoreStatsSignalPack) -> FactorScore:
    """
    Normalize webstore trust signals to severity and confidence.

    Fairness principles:
        - User count is a WEAK signal: many legitimate niche/developer/enterprise
          tools have small user bases. Low user count alone should never
          significantly impact the score.
        - Rating quality matters more than popularity.
        - Missing privacy policy is a disclosure/compliance concern that is scored
          by Governance/DisclosureAlignment; Webstore surfaces it as listing
          context only (see docs/adr/0002-scoring-layer-ownership.md).
        - Severity from user count is capped low and affects CONFIDENCE
          (less community vetting) rather than implying the extension is dangerous.

    Formula:
        - Low rating (<3.0) → higher severity (objective quality signal)
        - Very low users (<50) → minor severity bump (less vetting, not inherently risky)
        - Missing privacy policy → listing context only, no severity (owned by
          Governance/DisclosureAlignment)
        - confidence = lower when less community data available

    Args:
        stats: Webstore stats signal pack

    Returns:
        FactorScore with normalized severity and confidence
    """
    severity = 0.0
    issues: List[str] = []

    # Rating-based severity — objective quality signal
    if stats.rating_avg is not None:
        if stats.rating_avg < 2.0:
            severity += 0.35
            issues.append("very_low_rating")
        elif stats.rating_avg < 3.0:
            severity += 0.25
            issues.append("low_rating")
        elif stats.rating_avg < 3.5:
            severity += 0.1
            issues.append("below_average_rating")
    else:
        severity += 0.05  # Missing rating — not alarming, just less data
        issues.append("no_rating")

    # User count — WEAK signal, affects confidence more than severity.
    # Many legitimate developer tools, enterprise extensions, and niche utilities
    # naturally have small user bases. A low user count does NOT imply risk —
    # it means less community vetting, which we reflect in confidence.
    if stats.installs is not None:
        if stats.installs < 50:
            severity += 0.1  # Very new/niche — slightly less vetted
            issues.append("very_low_users")
        # No penalty for < 1000 or < 10000 — these are normal for niche tools
    else:
        severity += 0.05  # Unknown user count
        issues.append("unknown_users")

    # Privacy-policy absence is a GOVERNANCE / disclosure concern and is scored
    # solely by Governance/DisclosureAlignment (engine._compute_governance_factors)
    # as of scoring_version 2.1.1 — see docs/adr/0002-scoring-layer-ownership.md.
    # Webstore keeps it as listing context/evidence only; it no longer contributes
    # to the Security/Webstore severity (previously a double-count).
    if not stats.has_privacy_policy:
        issues.append("no_privacy_policy")

    # Cap at 1.0
    severity = min(1.0, severity)

    # Confidence based on data availability.
    # Low user count = less community vetting = lower confidence in the
    # absence of risk, NOT higher assumed risk.
    has_rating = stats.rating_avg is not None
    has_users = stats.installs is not None
    if has_rating and has_users:
        if stats.installs is not None and stats.installs < 100:
            confidence = 0.7  # Less community vetting, lower confidence
        else:
            confidence = 0.9
    elif has_rating or has_users:
        confidence = 0.6
    else:
        confidence = 0.3  # No data, low confidence

    return FactorScore(
        name=SecurityFactors.WEBSTORE,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.WEBSTORE],
        evidence_ids=[f"webstore:issue:{issue}" for issue in issues],
        details={
            "rating_avg": stats.rating_avg,
            "rating_count": stats.rating_count,
            "installs": stats.installs,
            "has_privacy_policy": stats.has_privacy_policy,
            "developer": stats.developer,
            "issues": issues,
        },
        flags=issues,
    )


def normalize_maintenance_health(stats: WebstoreStatsSignalPack) -> FactorScore:
    """
    Normalize maintenance health (staleness) to severity and confidence.
    
    Formula:
        - Parse last_updated date
        - >365 days → 0.8 severity
        - 180-365 days → 0.6 severity
        - 90-180 days → 0.4 severity
        - <90 days → 0.1 severity
        - confidence = low if date missing
    
    Args:
        stats: Webstore stats signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    severity = 0.0
    days_since_update: Optional[int] = None
    flags: List[str] = []
    
    if stats.last_updated:
        try:
            # Try parsing various date formats
            for fmt in ["%Y-%m-%d", "%B %d, %Y", "%d %B %Y", "%m/%d/%Y"]:
                try:
                    last_update = datetime.strptime(stats.last_updated, fmt)
                    days_since_update = (datetime.now(timezone.utc) - last_update.replace(tzinfo=timezone.utc)).days
                    break
                except ValueError:
                    continue
            
            if days_since_update is not None:
                if days_since_update > 365:
                    severity = 0.8
                    flags.append("stale_extension")
                elif days_since_update > 180:
                    severity = 0.6
                    flags.append("aging_extension")
                elif days_since_update > 90:
                    severity = 0.4
                    flags.append("needs_update")
                else:
                    severity = 0.1  # Recently maintained
        except Exception:
            logger.debug("Failed to parse last_updated date: %s", stats.last_updated)
    
    # Confidence based on data availability
    confidence = 0.9 if days_since_update is not None else 0.3
    
    return FactorScore(
        name=SecurityFactors.MAINTENANCE,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=SECURITY_WEIGHTS_V1[SecurityFactors.MAINTENANCE],
        evidence_ids=[f"maintenance:days:{days_since_update}"] if days_since_update else [],
        details={
            "last_updated": stats.last_updated,
            "days_since_update": days_since_update,
        },
        flags=flags,
    )


# =============================================================================
# PRIVACY LAYER NORMALIZERS
# =============================================================================

def normalize_permissions_baseline(perms: PermissionsSignalPack) -> FactorScore:
    """
    Normalize permissions baseline risk to severity and confidence.
    
    Formula:
        - n = sum of weighted risk scores for problematic permissions (with context multipliers)
        - severity = _saturating_severity(n, k=0.25)
        - confidence = 1.0 if manifest parsed
    
    Args:
        perms: Permissions signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    PERMISSION_WEIGHTS = {
        'debugger': 2.0,
        'webRequestBlocking': 1.5,
        'proxy': 1.5,
        'webRequest': 1.2,
        'desktopCapture': 1.2,
        'tabCapture': 1.2,
        'cookies': 1.0,
        'nativeMessaging': 1.0,
        'clipboardRead': 0.8,
        'history': 0.8,
        'browsingData': 0.8,
        'downloads': 0.5,
        'bookmarks': 0.5,
        'management': 0.5,
        'ttsEngine': 0.5
    }

    # Use a set to avoid double counting if a permission is both high risk and unreasonable
    problematic_perms = set(perms.high_risk_permissions)
    problematic_perms.update(perms.unreasonable_permissions)
    
    n = 0.0
    permission_weights_breakdown = {}
    for perm_name in problematic_perms:
        weight = PERMISSION_WEIGHTS.get(perm_name, 0.5)
        
        # Context-based evaluation based on justification
        for p in perms.permission_analysis:
            if p.permission_name == perm_name:
                justification = (p.justification or "").lower()
                if 'abusive' in justification or 'malicious' in justification or 'covert' in justification:
                    weight *= 2.0  # Double penalty for explicitly malicious context
                break
                
        n += weight
        permission_weights_breakdown[perm_name] = weight
    
    # Compute severity using saturating formula
    severity = _saturating_severity(n, k=0.25)
    
    # High confidence if we have permission data
    confidence = 1.0 if perms.total_permissions > 0 or perms.api_permissions else 0.5
    
    return FactorScore(
        name=PrivacyFactors.PERMISSIONS_BASELINE,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=PRIVACY_WEIGHTS_V1[PrivacyFactors.PERMISSIONS_BASELINE],
        evidence_ids=[f"perm:high_risk:{p}" for p in perms.high_risk_permissions[:5]],
        details={
            "score_n": round(n, 2),
            "permission_weights_breakdown": permission_weights_breakdown,
            "high_risk_count": len(perms.high_risk_permissions),
            "unreasonable_count": len(perms.unreasonable_permissions),
            "high_risk_permissions": perms.high_risk_permissions,
            "unreasonable_permissions": perms.unreasonable_permissions,
            "total_permissions": perms.total_permissions,
        },
        flags=["high_risk_permissions"] if n >= 3 else [],
    )


def normalize_permission_combos(perms: PermissionsSignalPack) -> FactorScore:
    """
    Normalize dangerous permission combinations to severity and confidence.
    
    Formula:
        - Check for dangerous combos: cookies+webRequest→+0.5, clipboardRead+network→+0.4, etc.
        - Add +0.5 for <all_urls> or equivalent broad access
        - Cap total at 1.0
    
    Args:
        perms: Permissions signal pack
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    all_permissions = set(perms.api_permissions + perms.host_permissions)
    
    severity = 0.0
    triggered_combos: List[str] = []
    
    # Check each dangerous combination
    for required_perms, addition in DANGEROUS_PERMISSION_COMBOS:
        if required_perms.issubset(all_permissions):
            severity += addition
            triggered_combos.append("+".join(required_perms))
    
    # Check for broad host access
    if perms.has_broad_host_access or any(p in all_permissions for p in BROAD_HOST_PATTERNS):
        severity += 0.5
        triggered_combos.append("broad_host_access")
    
    # Cap at 1.0
    severity = min(1.0, severity)
    
    # High confidence - permission combos are deterministic
    confidence = 1.0 if perms.total_permissions > 0 else 0.5
    
    return FactorScore(
        name=PrivacyFactors.PERMISSION_COMBOS,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=PRIVACY_WEIGHTS_V1[PrivacyFactors.PERMISSION_COMBOS],
        evidence_ids=[f"combo:{combo}" for combo in triggered_combos[:5]],
        details={
            "triggered_combos": triggered_combos,
            "all_permissions": list(all_permissions)[:20],
        },
        flags=["dangerous_permission_combo"] if triggered_combos else [],
    )


def normalize_network_exfil(
    network: NetworkSignalPack,
    perms: PermissionsSignalPack,
) -> FactorScore:
    """
    Normalize network exfiltration risk to severity and confidence.
    
    Per Phase 1 fixups: Use NetworkSignalPack instead of SastSignalPack.
    
    Formula:
        - Classify detected domains: known_good→0.1, analytics→0.6, unknown→0.5
        - Suspicious patterns add +0.2 each (http, base64, dynamic URL)
        - D = sum(domain_risks + pattern_risks)
        - severity = 1 - exp(-0.25 * D)
        - confidence from NetworkSignalPack (0.5 if no data)
    
    Args:
        network: Network signal pack with domains and suspicious patterns
        perms: Permissions signal pack for network permission check
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    # If network analysis not enabled, return low confidence default
    if not network.enabled:
        has_network_perms = perms.has_broad_host_access or any(
            p in perms.api_permissions for p in ["webRequest", "webRequestBlocking"]
        )
        return FactorScore(
            name=PrivacyFactors.NETWORK_EXFIL,
            severity=0.0,
            confidence=0.5,  # Low confidence when no analysis
            weight=PRIVACY_WEIGHTS_V1[PrivacyFactors.NETWORK_EXFIL],
            evidence_ids=[],
            details={
                "network_analysis_enabled": False,
                "has_network_permissions": has_network_perms,
                "message": "Network analysis not enabled - severity set to 0",
            },
            flags=[],
        )
    
    d = 0.0
    patterns_found: List[str] = []
    
    # Check if extension has network capabilities
    has_network = perms.has_broad_host_access or any(
        p in perms.api_permissions for p in ["webRequest", "webRequestBlocking"]
    )
    
    if has_network:
        d += 0.2  # Base risk for having network access
    
    # Analyze domains
    known_good_domains = {"cdn.jsdelivr.net", "apis.google.com", "fonts.googleapis.com", 
                          "cdnjs.cloudflare.com", "code.jquery.com", "unpkg.com"}
    analytics_domains = {"google-analytics.com", "analytics.google.com", "mixpanel.com",
                         "amplitude.com", "segment.io", "hotjar.com"}
    
    for domain in network.domains:
        domain_lower = domain.lower()
        if any(known in domain_lower for known in known_good_domains):
            d += 0.1
            patterns_found.append(f"domain:known_cdn:{domain}")
        elif any(analytics in domain_lower for analytics in analytics_domains):
            d += 0.6
            patterns_found.append(f"domain:analytics:{domain}")
        else:
            d += 0.5  # Unknown external domain
            patterns_found.append(f"domain:unknown:{domain}")
    
    # Add risk for suspicious patterns
    flags = network.suspicious_flags
    if flags.get("http_unencrypted"):
        d += 0.2
        patterns_found.append("pattern:http_unencrypted")
    if flags.get("base64_encoded_urls"):
        d += 0.3
        patterns_found.append("pattern:base64_urls")
    if flags.get("high_entropy_payload"):
        d += 0.2
        patterns_found.append("pattern:high_entropy_payload")
    if flags.get("dynamic_url_construction"):
        d += 0.2
        patterns_found.append("pattern:dynamic_url")
    if flags.get("credential_exfil_pattern"):
        d += 0.5
        patterns_found.append("pattern:credential_exfil")
    if flags.get("data_harvest_pattern"):
        d += 0.4
        patterns_found.append("pattern:data_harvest")
    
    # Runtime URL construction is suspicious
    if network.has_runtime_url_construction:
        d += 0.3
        patterns_found.append("pattern:runtime_url_construction")
    
    # Add for data sending patterns
    for pattern in network.data_sending_patterns[:5]:
        d += 0.15
        patterns_found.append(f"sending:{pattern}")
    
    # Dedupe patterns
    patterns_found = list(set(patterns_found))[:10]
    
    # Compute severity
    severity = _saturating_severity(d, k=0.25)
    
    # Use confidence from network analysis
    confidence = network.confidence
    
    return FactorScore(
        name=PrivacyFactors.NETWORK_EXFIL,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=PRIVACY_WEIGHTS_V1[PrivacyFactors.NETWORK_EXFIL],
        evidence_ids=[f"exfil:{p}" for p in patterns_found[:5]],
        details={
            "network_analysis_enabled": True,
            "has_network_permissions": has_network,
            "patterns_found": patterns_found,
            "domains_analyzed": len(network.domains),
            "external_request_count": network.external_request_count,
        },
        flags=["potential_exfiltration"] if severity > 0.4 else [],
    )


def normalize_capture_signals(
    perms: PermissionsSignalPack,
    manifest: Dict[str, Any],
    permissions_analysis: Optional[Dict[str, Any]] = None,
) -> FactorScore:
    """
    Normalize capture signals (screenshot, tab capture, etc.) to severity and confidence.
    
    Formula:
        - Check for screenshot_capture_analysis detected
        - Check for captureVisibleTab, canvas.toDataURL, getUserMedia permissions
        - Context-aware: disclosed screenshot tool → low severity, covert → high severity
    
    Args:
        perms: Permissions signal pack
        manifest: Raw manifest data for context
        permissions_analysis: Optional raw permissions analysis with screenshot detection
        
    Returns:
        FactorScore with normalized severity and confidence
    """
    severity = 0.0
    capture_signals: List[str] = []
    
    # Check for capture-related permissions
    capture_permissions = {"tabCapture", "desktopCapture", "activeTab"}
    found_capture_perms = capture_permissions.intersection(set(perms.api_permissions))
    
    if found_capture_perms:
        capture_signals.extend(found_capture_perms)
        severity += 0.2 * len(found_capture_perms)
    
    # Check screenshot analysis from permissions analyzer
    if permissions_analysis:
        screenshot_analysis = permissions_analysis.get("screenshot_capture_analysis", {})
        if isinstance(screenshot_analysis, dict) and screenshot_analysis.get("detected"):
            capture_signals.append("screenshot_capture_detected")
            severity += 0.3
    
    # Context-aware adjustment: check if this is a legitimate screenshot tool
    name = manifest.get("name", "").lower()
    desc = manifest.get("description", "").lower()
    screenshot_keywords = ["screenshot", "capture", "snap", "screen grab", "screen shot"]
    
    is_screenshot_tool = any(kw in name or kw in desc for kw in screenshot_keywords)
    
    if is_screenshot_tool and capture_signals:
        # Legitimate screenshot tool - reduce severity
        severity *= 0.3
        capture_signals.append("disclosed_screenshot_tool")
    elif capture_signals and not is_screenshot_tool:
        # Covert capture capability - increase severity
        severity *= 1.5
        capture_signals.append("covert_capture_capability")
    
    # Check for network + capture combo (exfiltration risk)
    if capture_signals and perms.has_broad_host_access:
        severity += 0.3
        capture_signals.append("capture_with_network")
    
    # Cap at 1.0
    severity = min(1.0, severity)
    
    # High confidence for this analysis
    confidence = 0.9 if manifest else 0.5
    
    return FactorScore(
        name=PrivacyFactors.CAPTURE_SIGNALS,
        severity=round(severity, 4),
        confidence=round(confidence, 2),
        weight=PRIVACY_WEIGHTS_V1[PrivacyFactors.CAPTURE_SIGNALS],
        evidence_ids=[f"capture:{s}" for s in capture_signals[:5]],
        details={
            "capture_signals": capture_signals,
            "is_disclosed_screenshot_tool": is_screenshot_tool,
            "has_network_access": perms.has_broad_host_access,
        },
        flags=["capture_capability"] if capture_signals else [],
    )


# =============================================================================
# BATCH NORMALIZERS FOR LAYER COMPUTATION
# =============================================================================

def normalize_security_factors(
    sast: SastSignalPack,
    vt: VirusTotalSignalPack,
    entropy: EntropySignalPack,
    manifest: Dict[str, Any],
    perms: PermissionsSignalPack,
    chromestats: ChromeStatsSignalPack,
    webstore_stats: WebstoreStatsSignalPack,
    user_count: Optional[int] = None,
) -> List[FactorScore]:
    """
    Normalize all security layer factors.
    
    Args:
        sast: SAST signal pack
        vt: VirusTotal signal pack
        entropy: Entropy signal pack
        manifest: Raw manifest data
        perms: Permissions signal pack
        chromestats: ChromeStats signal pack
        webstore_stats: Webstore stats signal pack
        user_count: Optional user count for context
        
    Returns:
        List of FactorScore for all security factors
    """
    return [
        normalize_sast(sast, user_count),
        normalize_virustotal(vt),
        normalize_entropy(entropy, user_count),
        normalize_manifest_posture(manifest, perms),
        normalize_chromestats(chromestats),
        normalize_webstore_trust(webstore_stats),
        normalize_maintenance_health(webstore_stats),
    ]


def normalize_privacy_factors(
    perms: PermissionsSignalPack,
    network: NetworkSignalPack,
    manifest: Dict[str, Any],
    permissions_analysis: Optional[Dict[str, Any]] = None,
) -> List[FactorScore]:
    """
    Normalize all privacy layer factors.
    
    Per Phase 1 fixups: Uses NetworkSignalPack instead of SastSignalPack for exfil.
    
    Args:
        perms: Permissions signal pack
        network: Network signal pack for exfiltration analysis
        manifest: Raw manifest data
        permissions_analysis: Optional raw permissions analysis
        
    Returns:
        List of FactorScore for all privacy factors
    """
    return [
        normalize_permissions_baseline(perms),
        normalize_permission_combos(perms),
        normalize_network_exfil(network, perms),
        normalize_capture_signals(perms, manifest, permissions_analysis),
    ]

