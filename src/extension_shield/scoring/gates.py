"""
Hard Gates Module

Governance hard gates that can BLOCK or WARN regardless of computed scores.
Gates are evaluated in priority order and provide early decision overrides
for high-confidence threats.

Key Design Principles:
1. Gates bypass score calculation for clear-cut cases
2. Each gate has explicit confidence thresholds
3. Gates return structured results with evidence for explainability
4. Gate results can be combined with layer scores for final decision

Gate Priority Order:
1. VT_MALWARE      - Any VirusTotal malware detection → BLOCK
2. CRITICAL_SAST   - High-confidence critical SAST findings → BLOCK
3. TOS_VIOLATION   - Explicit ToS prohibition + matching behavior → BLOCK
4. PURPOSE_MISMATCH - Claims one purpose but has credential capture patterns → WARN/BLOCK
5. SENSITIVE_EXFIL  - Sensitive permissions + network exfil + no disclosure → WARN
"""

import logging
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Tuple

logger = logging.getLogger(__name__)

from extension_shield.governance.signal_pack import (
    NetworkSignalPack,
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
    SignalPack,
    VirusTotalSignalPack,
    WebstoreStatsSignalPack,
)
from extension_shield.scoring.models import Decision, LayerScore


# =============================================================================
# DOMAIN LISTS (COMPLIANCE / SITE TERMS)
# =============================================================================

# Protected visa/travel-doc domains now live in the declarative single source of
# truth: config/protected_services.yaml (loaded by governance/protected_services.py).
# They are re-exported here under the legacy names for backward compatibility so the
# existing TOS gate keeps working unchanged while detection logic migrates to the
# PROTECTED_SERVICE_AUTOMATION rulepack. Edit the YAML, not this file, to tune lists.
from extension_shield.governance.protected_services import (  # noqa: E402
    PROTECTED_SERVICE_DOMAINS as TRAVEL_DOCS_PROTECTED_DOMAINS,
    ECOSYSTEM_DOMAINS as VISA_SLOT_ECOSYSTEM_DOMAINS,
)


# =============================================================================
# GATE RESULT
# =============================================================================

@dataclass
class GateResult:
    """
    Result from evaluating a single hard gate.
    
    Attributes:
        gate_id: Unique identifier for this gate
        decision: The decision this gate recommends (ALLOW, WARN, BLOCK)
        triggered: Whether this gate was triggered
        confidence: Confidence in this gate's evaluation [0,1]
        reasons: Human-readable reasons for the gate result
        evidence_ids: Evidence supporting this gate result
        details: Additional details for debugging/explainability
    """
    gate_id: str
    decision: Literal["ALLOW", "WARN", "BLOCK"]
    triggered: bool
    confidence: float
    reasons: List[str] = field(default_factory=list)
    evidence_ids: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)
    
    @property
    def is_blocking(self) -> bool:
        """Whether this gate triggered a BLOCK decision."""
        return self.triggered and self.decision == "BLOCK"
    
    @property
    def is_warning(self) -> bool:
        """Whether this gate triggered a WARN decision."""
        return self.triggered and self.decision == "WARN"


# =============================================================================
# GATE CONFIGURATION
# =============================================================================

@dataclass(frozen=True)
class GateConfig:
    """Configuration thresholds for hard gates."""
    
    # VT_MALWARE thresholds
    # Per Phase 1 fixups: >=5 BLOCK, 1-4 WARN, 0 no gate
    vt_malicious_block_threshold: int = 5      # >=5 malicious detections = BLOCK
    vt_malicious_warn_threshold: int = 1       # 1-4 malicious detections = WARN
    vt_confidence_threshold: float = 0.95      # High confidence for VT
    
    # CRITICAL_SAST thresholds
    sast_critical_block_count: int = 1         # >=1 critical finding = BLOCK
    sast_high_block_count: int = 3             # >=3 high findings = BLOCK
    sast_confidence_threshold: float = 0.7     # Minimum confidence for SAST block
    
    # TOS_VIOLATION patterns
    tos_prohibited_permissions: Tuple[str, ...] = (
        "debugger",                  # Often prohibited in enterprise
        "proxy",                     # Can intercept traffic
        "nativeMessaging",           # Can bypass browser sandbox
    )

    # Travel-docs / visa portal compliance patterns
    travel_docs_protected_domains: Tuple[str, ...] = TRAVEL_DOCS_PROTECTED_DOMAINS
    visa_slot_ecosystem_domains: Tuple[str, ...] = VISA_SLOT_ECOSYSTEM_DOMAINS
    travel_docs_automation_code_patterns: Tuple[str, ...] = (
        # Automation / interception patterns
        r"xmlhttprequest\.prototype\.(open|send)\s*=",
        r"\.open\s*=\s*function",
        r"\.send\s*=\s*function",
        r"intercept.*xmlhttprequest",
        # Screenshot capture patterns
        r"html2canvas",
        r"toDataURL\(\s*[\"']image/png[\"']\s*\)",
        r"captureVisibleTab",
        # Credential storage patterns
        r"chrome\.storage\.(local|sync)\.set",
        r"logindetails",
        r"securityquestions",
    )
    
    # PURPOSE_MISMATCH patterns
    credential_capture_patterns: Tuple[str, ...] = (
        r"password",
        r"credential",
        r"login",
        r"keylog",
        r"input\s*value",
        r"form\s*data",
    )
    tracking_patterns: Tuple[str, ...] = (
        r"track",
        r"analytics",
        r"beacon",
        r"pixel",
        r"fingerprint",
    )
    
    # SENSITIVE_EXFIL thresholds
    sensitive_permissions: Tuple[str, ...] = (
        "cookies",
        "webRequest",
        "webRequestBlocking",
        "history",
        "browsingData",
        "clipboardRead",
        "tabs",
    )


# Default configuration
DEFAULT_GATE_CONFIG = GateConfig()


# ============================================================================
# CRITICAL HIGH SAST PATTERNS
# ============================================================================
#
# Some HIGH/ERROR SAST findings are dangerous enough to BLOCK even if the
# total high-count is below the usual threshold. We match a small, pragmatic
# allowlist of patterns in check_id/message/category/code_snippet and, when
# seen in a HIGH/ERROR finding with sufficient confidence, we treat them as
# critical-high signals.
CRITICAL_HIGH_SAST_PATTERNS: Tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"eval\(|new\s+Function",  # dynamic code execution
        r"keylog|keylogger|credential|password|login|form\s*(capture|intercept)",  # credential / keylogger
        r"cookie|token|session",  # cookie/token/session exfil
        r"remote\s*(script|code)|load\s*(remote|external)",  # remote code/script load
        r"webrequestblocking|modify\s*(headers|request|response)",  # request/response interception
        r"externally_connectable|message\s*relay|postMessage",  # broad relay / message relay
    )
)


# ============================================================================
# RESTRICTED-PERMISSION CAPABILITY EVIDENCE PATTERNS
# ============================================================================
#
# A restricted permission (proxy / nativeMessaging / debugger) only escalates
# from WARN to BLOCK when HIGH/CRITICAL SAST evidence is tied to THAT privileged
# capability — never from unrelated findings. These patterns define what
# "tied to the capability" means per permission.
RESTRICTED_PERM_EVIDENCE_PATTERNS: Dict[str, Tuple[re.Pattern[str], ...]] = {
    "proxy": tuple(
        re.compile(p, re.IGNORECASE)
        for p in (
            r"chrome\.proxy",
            r"\bproxy\b",
            r"pac_?script",
            r"onauthrequired",
            r"webrequestblocking",
            r"intercept.*(traffic|request)|modify\s*(headers|request|response)",
        )
    ),
    "nativeMessaging": tuple(
        re.compile(p, re.IGNORECASE)
        for p in (
            r"native\s*messag",
            r"connectnative",
            r"sendnativemessage",
            r"native\s*host",
        )
    ),
    "debugger": tuple(
        re.compile(p, re.IGNORECASE)
        for p in (
            r"chrome\.debugger",
            r"debugger\s*\.\s*attach",
            r"devtools\s*protocol",
            r"\bcdp\b",
        )
    ),
}


# ============================================================================
# PURPOSE_MISMATCH BEHAVIOR TAXONOMY
# ============================================================================
#
# PURPOSE_MISMATCH must escalate to a hard BLOCK only for CONCRETE dangerous
# behavior, never for scary SAST rule NAMES. We classify each SAST finding by
# the specific behavior it detected — the LAST dotted segment of its rule id
# (e.g. `credential.theft.chrome_identity_api` -> `chrome_identity_api`) — and
# treat benign-compatible detectors as review-only. We NEVER regex-match
# credential/login/password keywords against the rule id, message, or snippet.
#
# Behavior-identifier keys (last segment of the custom Semgrep rule ids in
# config/custom_semgrep_rules.yaml).

# Benign-compatible or ambiguous: legitimate uses exist. Never a hard BLOCK on
# their own — at most REVIEW (chrome.identity, first-party credentialed fetch,
# background messaging, cookie/storage reads, generic API/websocket calls).
_PM_BENIGN_COMPATIBLE = frozenset({
    "chrome_identity_api", "fetch_credentials_include", "chrome_runtime_external",
    "external_api_calls", "document_cookie_access", "chrome_cookies_api",
    "storage_access", "indexeddb_storage", "websocket_connection",
    "webnavigation", "dynamic_domain_mapping", "generic_channels",
})
# Reads secret / credential VALUES from the page. Dangerous only when
# corroborated by an exfiltration behavior (reads secrets AND sends them out).
_PM_SECRET_READ = frozenset({
    "password_extraction", "password_input_hooks", "form_serialization",
    "submit_intercept",
})
# Broad keystroke capture. Dangerous only when corroborated by exfil/storage.
_PM_KEY_CAPTURE = frozenset({"keylogger"})
# Covert / external exfiltration of data.
_PM_EXFIL = frozenset({
    "periodic_beacon", "image_steganography", "base64_encoded_data",
    "dns_tunneling", "url_and_userid", "override_fetch_xhr",
})
# Remote executable code loading — concrete dangerous on its own.
_PM_REMOTE_CODE = frozenset({
    "dynamic_script_loading", "server_list", "fallback_loop", "import_scripts",
})
# Standalone high-confidence malicious behaviors — concrete on their own.
_PM_STANDALONE_DANGEROUS = frozenset({
    "clipboard_hijack",    # crypto-clipper: read clipboard + replace address
    "silent_payment",      # automated money transfer
    "cookie_exfiltration", # explicitly sends cookies to an external server
})
# Credentialed / generic send channels: benign for a first-party or disclosed
# backend (REVIEW on their own), but the exfiltration vector when the extension
# ALSO reads secrets or captures keystrokes.
_PM_CREDENTIALED_SEND = frozenset({
    "fetch_credentials_include", "external_api_calls", "websocket_connection",
})
# Suspicious external destinations (hardcoded DGA-looking / C2-style domains).
_PM_SUSPICIOUS_EXTERNAL = frozenset({"random_domain_pattern"})


def _pm_behavior_suffix(check_id: str) -> str:
    """The specific behavior identifier: the last dotted segment of a rule id."""
    return (check_id or "").strip().lower().split(".")[-1]


# Placeholder / non-evidential snippets seen on minified/bundled single-line
# files. These must NOT, on their own, support a high-confidence BLOCK.
_PM_PLACEHOLDER_SNIPPETS = frozenset({
    "", "requires login", "<snippet>", "...", "n/a", "na", "none", "null",
})


def _pm_standalone_high_quality(finding: "SastFindingNormalized", corroborated: bool) -> bool:
    """Whether a standalone-dangerous SAST behavior is backed by high-quality
    evidence strong enough to hard-BLOCK.

    BLOCK is allowed only when EITHER:
      - there is corroborating concrete evidence (a suspicious external
        destination, remote-code loading, or read-secret+exfil), OR
      - the match itself is real file/line evidence: line_number > 1 with a
        non-placeholder code snippet that supports the behavior.

    A line-1 match in a minified/bundled file with a weak/placeholder snippet and
    no corroboration is NOT high-quality -> the gate downgrades to WARN (review),
    so the final result is NEEDS_REVIEW, not BLOCK.
    """
    if corroborated:
        return True
    line = getattr(finding, "line_number", None)
    snippet = (getattr(finding, "code_snippet", None) or "").strip()
    return (
        isinstance(line, int)
        and line > 1
        and bool(snippet)
        and snippet.lower() not in _PM_PLACEHOLDER_SNIPPETS
        and len(snippet) >= 8
    )


# =============================================================================
# HARD GATES CLASS
# =============================================================================

class HardGates:
    """
    Governance hard gates that can BLOCK regardless of score.
    
    Gates are evaluated in priority order. Any triggered BLOCK gate
    short-circuits further evaluation and produces an immediate BLOCK decision.
    
    Gates:
    1. VT_MALWARE      - VirusTotal malware detection → BLOCK
    2. CRITICAL_SAST   - Critical SAST findings → BLOCK
    3. TOS_VIOLATION   - Terms of Service violations → BLOCK
    4. PURPOSE_MISMATCH - Claimed purpose vs actual behavior → WARN/BLOCK
    5. SENSITIVE_EXFIL  - Sensitive data exfiltration risk → WARN
    """
    
    # Gate IDs in priority order
    GATES = [
        "VT_MALWARE",
        "CRITICAL_SAST",
        "TOS_VIOLATION",
        "PURPOSE_MISMATCH",
        "SENSITIVE_EXFIL",
    ]
    
    def __init__(self, config: Optional[GateConfig] = None):
        """
        Initialize HardGates with optional configuration.
        
        Args:
            config: Gate configuration thresholds (uses defaults if None)
        """
        self.config = config or DEFAULT_GATE_CONFIG
        self._credential_patterns = [
            re.compile(p, re.IGNORECASE) 
            for p in self.config.credential_capture_patterns
        ]
        self._tracking_patterns = [
            re.compile(p, re.IGNORECASE)
            for p in self.config.tracking_patterns
        ]
    
    # =========================================================================
    # GATE 1: VT_MALWARE
    # =========================================================================
    
    def evaluate_vt_malware(self, vt: VirusTotalSignalPack) -> GateResult:
        """
        Evaluate VirusTotal malware gate.
        
        Thresholds (per Phase 1 fixups):
        - >=5 malicious detections: BLOCK
        - 1-4 malicious detections: WARN
        - 0 malicious: no gate triggered
        - VT missing/rate-limited: no gate (low confidence)
        
        Args:
            vt: VirusTotal signal pack
            
        Returns:
            GateResult with BLOCK/WARN/ALLOW based on detection count
        """
        gate_id = "VT_MALWARE"
        
        # Check if VT was enabled/available
        if not vt.enabled:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.4,
                reasons=["VirusTotal not enabled - cannot evaluate"],
                details={"vt_enabled": False},
            )
        
        # Rate-limited or no engine data = no gate
        if vt.total_engines == 0:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.3,
                reasons=["VirusTotal rate-limited or no engine data"],
                details={"vt_enabled": True, "total_engines": 0},
            )
        
        malicious_count = vt.malicious_count
        
        # Calculate confidence based on engine count
        if vt.total_engines >= 50:
            confidence = 0.98
        elif vt.total_engines >= 30:
            confidence = 0.95
        else:
            confidence = 0.85
        
        # >=5 malicious detections: BLOCK
        if malicious_count >= self.config.vt_malicious_block_threshold:
            return GateResult(
                gate_id=gate_id,
                decision="BLOCK",
                triggered=True,
                confidence=confidence,
                reasons=[
                    f"Antivirus scan flagged this extension as malware ({malicious_count} of {vt.total_engines} engines)",
                    f"Threat level: {vt.threat_level}",
                ],
                evidence_ids=[f"vt:malicious:{malicious_count}"],
                details={
                    "malicious_count": malicious_count,
                    "suspicious_count": vt.suspicious_count,
                    "total_engines": vt.total_engines,
                    "malware_families": vt.malware_families[:5],
                },
            )
        
        # 1-4 malicious detections: WARN
        if malicious_count >= self.config.vt_malicious_warn_threshold:
            return GateResult(
                gate_id=gate_id,
                decision="WARN",
                triggered=True,
                confidence=confidence * 0.8,  # Lower confidence for warn
                reasons=[
                    f"Antivirus scan flagged by {malicious_count} engine(s) — may be a false positive",
                    "Review before installing",
                ],
                evidence_ids=[f"vt:suspicious:{malicious_count}"],
                details={
                    "malicious_count": malicious_count,
                    "suspicious_count": vt.suspicious_count,
                    "total_engines": vt.total_engines,
                    "malware_families": vt.malware_families[:5],
                },
            )
        
        # 0 malicious: no gate
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=self.config.vt_confidence_threshold,
            reasons=["No malware detected by VirusTotal"],
            details={
                "malicious_count": 0,
                "total_engines": vt.total_engines,
            },
        )
    
    # =========================================================================
    # GATE 2: CRITICAL_SAST
    # =========================================================================
    
    def evaluate_critical_sast(self, sast: SastSignalPack) -> GateResult:
        """
        Evaluate critical SAST findings gate.
        
        Critical/High severity SAST findings in high-confidence patterns
        trigger BLOCK.
        
        Args:
            sast: SAST signal pack
            
        Returns:
            GateResult with BLOCK if critical issues found
        """
        gate_id = "CRITICAL_SAST"
        
        if not sast.deduped_findings:
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=sast.confidence,
                reasons=["No SAST findings"],
                details={"findings_count": 0},
            )
        
        # Count critical and high severity findings
        critical_count = 0
        high_count = 0
        critical_findings: List[SastFindingNormalized] = []
        high_findings: List[SastFindingNormalized] = []
        critical_high_hits = 0
        critical_high_example_ids: List[str] = []
        
        for finding in sast.deduped_findings:
            severity = finding.severity.upper()
            if severity == "CRITICAL":
                critical_count += 1
                critical_findings.append(finding)
            elif severity in ("HIGH", "ERROR"):
                high_count += 1
                high_findings.append(finding)
                
                # Check for critical-high patterns in HIGH/ERROR findings
                text_parts = [
                    finding.check_id,
                    getattr(finding, "message", "") or "",
                    getattr(finding, "category", "") or "",
                    getattr(finding, "code_snippet", "") or "",
                ]
                combined_text = " ".join(t for t in text_parts if t)
                for pattern in CRITICAL_HIGH_SAST_PATTERNS:
                    if pattern.search(combined_text):
                        critical_high_hits += 1
                        critical_high_example_ids.append(finding.check_id)
                        break
        
        # Check BLOCK thresholds.
        # A pile of HIGH/ERROR findings does NOT hard-BLOCK on raw count alone —
        # that false-BLOCKs benign extensions that legitimately accumulate several
        # capability-level findings (e.g. internal messaging + IndexedDB + a fetch).
        # HIGH/ERROR findings escalate to BLOCK only when at least one matches a
        # genuinely-dangerous pattern (critical_high_hits, e.g. eval / keylogger /
        # remote-code / credential exfil); otherwise they lower the security score
        # toward NEEDS_REVIEW instead of hard-blocking.
        should_block = (
            critical_count >= self.config.sast_critical_block_count or
            critical_high_hits >= 1
        )
        
        if should_block and sast.confidence >= self.config.sast_confidence_threshold:
            # Build evidence
            evidence_ids = []
            reasons = []
            
            if critical_count > 0:
                evidence_ids.extend([
                    f"sast:critical:{f.check_id}" for f in critical_findings[:3]
                ])
                reasons.append(f"Security scan found {critical_count} critical code issue(s)")

            if critical_high_hits >= 1:
                evidence_ids.extend([
                    f"sast:high:{cid}" for cid in critical_high_example_ids[:3]
                ])
                reasons.append(
                    f"Dangerous code pattern found in {critical_high_hits} location(s)"
                )
            
            return GateResult(
                gate_id=gate_id,
                decision="BLOCK",
                triggered=True,
                confidence=sast.confidence,
                reasons=reasons,
                evidence_ids=evidence_ids,
                details={
                    "critical_count": critical_count,
                    "high_count": high_count,
                    "critical_high_hits": critical_high_hits,
                    "critical_findings": [f.check_id for f in critical_findings[:5]],
                    "high_findings": [f.check_id for f in high_findings[:5]],
                    "critical_high_example_ids": critical_high_example_ids[:5],
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=sast.confidence,
            reasons=["No critical SAST issues triggering block"],
            details={
                "critical_count": critical_count,
                "high_count": high_count,
            },
        )
    
    # =========================================================================
    # GATE 3: TOS_VIOLATION
    # =========================================================================
    
    def evaluate_tos_violation(
        self,
        perms: PermissionsSignalPack,
        sast: SastSignalPack,
        network: NetworkSignalPack,
        manifest: Dict[str, Any],
    ) -> GateResult:
        """
        Evaluate Terms of Service violation gate.
        
        Certain permissions or behaviors are explicitly prohibited by
        enterprise policies or Chrome Web Store ToS.
        
        Additionally, some sites (e.g., U.S. visa scheduling / travel-docs portals)
        explicitly prohibit automated access/scraping and unauthorized third-party
        processing. If an extension targets those portals and exhibits automation,
        screenshot capture, credential storage, or third-party endpoint patterns,
        we treat this as a high-confidence governance/compliance failure.
        
        Args:
            perms: Permissions signal pack
            manifest: Manifest data
            
        Returns:
            GateResult with BLOCK if ToS violations detected
        """
        gate_id = "TOS_VIOLATION"
        
        all_permissions = set(perms.api_permissions + perms.host_permissions)
        violations: List[str] = []
        evidence_ids: List[str] = []
        
        # Restricted permissions (proxy / nativeMessaging / debugger) are powerful
        # but NOT inherently malicious: a VPN needs `proxy`, a password manager
        # needs `nativeMessaging`, a devtools helper needs `debugger`. Declaring one
        # is a REVIEW signal, not an automatic block. We only escalate to BLOCK when
        # an aggravating factor shows the capability is wired up dangerously (an
        # any-website message bridge, or code-level evidence). Scoped per audit: do
        # not auto-block a legitimate extension on a permission declaration alone.
        prohibited_present = [
            p for p in self.config.tos_prohibited_permissions if p in all_permissions
        ]

        # Aggravator 1: externally_connectable exposes the extension to any website
        # (a web -> extension -> native/privileged bridge).
        ext_conn = manifest.get("externally_connectable", {})
        ext_conn_wildcard = False
        if isinstance(ext_conn, dict):
            _ec_matches = ext_conn.get("matches", []) or []
            ext_conn_wildcard = "<all_urls>" in _ec_matches or "*://*/*" in _ec_matches

        # Aggravator 2: code-level evidence (SAST) that THIS restricted capability
        # is wired up dangerously. An unrelated HIGH finding (e.g. eval usage in a
        # UI file) must NOT escalate a bare `proxy` declaration to BLOCK — only
        # findings tied to the privileged capability itself count. (Genuinely
        # critical unrelated findings still block via the CRITICAL_SAST gate.)
        def _finding_text(f: Any) -> str:
            return " ".join(
                t for t in (
                    getattr(f, "check_id", "") or "",
                    getattr(f, "message", "") or "",
                    getattr(f, "code_snippet", "") or "",
                ) if t
            )

        high_finding_texts = [
            _finding_text(f)
            for f in (getattr(sast, "deduped_findings", None) or [])
            if (getattr(f, "severity", "") or "").upper() in ("CRITICAL", "HIGH", "ERROR")
        ]
        capability_evidence: Dict[str, int] = {}
        for perm in prohibited_present:
            patterns = RESTRICTED_PERM_EVIDENCE_PATTERNS.get(perm, ())
            hits = sum(
                1 for text in high_finding_texts
                if any(p.search(text) for p in patterns)
            )
            if hits:
                capability_evidence[perm] = hits
        restricted_perm_aggravated = ext_conn_wildcard or bool(capability_evidence)

        # ---------------------------------------------------------------------
        # Travel-docs / visa portal ToS risk (deterministic, evidence-based)
        #
        # DEPRECATION (backstop): this branch is superseded by the declarative
        # PROTECTED_SERVICE_AUTOMATION rulepack. It is intentionally KEPT as a
        # defensive backstop and will be retired only after that rulepack has
        # proven itself across more fixtures. See docs/adr/0001-scoring-governance-
        # decision-authority.md ("Why the hardcoded TOS gate remains").
        # ---------------------------------------------------------------------

        def _matches_any_domain(patterns: List[str], domains: Tuple[str, ...]) -> List[str]:
            hits: List[str] = []
            for p in patterns:
                if not isinstance(p, str):
                    continue
                low = p.lower()
                for d in domains:
                    if d and d in low:
                        hits.append(d)
            return list(dict.fromkeys(hits))

        # Evidence anchor 1: protected portal host permissions / content_script matches
        protected_domain_hits: List[str] = _matches_any_domain(
            perms.host_permissions or [], self.config.travel_docs_protected_domains
        )

        cs_matches: List[str] = []
        for cs in (manifest.get("content_scripts") or []):
            if not isinstance(cs, dict):
                continue
            matches = cs.get("matches") or []
            if isinstance(matches, list):
                cs_matches.extend([m for m in matches if isinstance(m, str)])
        protected_domain_hits = list(
            dict.fromkeys(
                protected_domain_hits
                + _matches_any_domain(cs_matches, self.config.travel_docs_protected_domains)
            )
        )

        # Evidence anchor 2: visa-slot ecosystem endpoints in network domains or externally_connectable
        ext_conn_matches: List[str] = []
        if isinstance(ext_conn, dict):
            m = ext_conn.get("matches") or []
            if isinstance(m, list):
                ext_conn_matches = [x for x in m if isinstance(x, str)]

        network_domains: List[str] = []
        try:
            if network and getattr(network, "enabled", False):
                network_domains = list(getattr(network, "domains", []) or [])
        except Exception:
            logger.debug("Failed to extract network domains for TOS gate", exc_info=True)
            network_domains = []

        visa_ecosystem_hits = list(
            dict.fromkeys(
                _matches_any_domain(network_domains, self.config.visa_slot_ecosystem_domains)
                + _matches_any_domain(ext_conn_matches, self.config.visa_slot_ecosystem_domains)
            )
        )

        # Evidence anchor 3: code patterns in SAST findings (best-effort)
        tos_patterns = [
            re.compile(p, re.IGNORECASE)
            for p in getattr(self.config, "travel_docs_automation_code_patterns", ())
        ]
        all_findings_text: List[str] = []
        for f in (getattr(sast, "deduped_findings", None) or []):
            try:
                all_findings_text.append(
                    f"{getattr(f, 'check_id', '')} {getattr(f, 'message', '')} {getattr(f, 'code_snippet', '')}"
                )
            except Exception:
                logger.debug("Skipping malformed SAST finding in TOS gate")
                continue
        joined = "\n".join(all_findings_text).lower()

        pattern_hits: List[str] = []
        for rx in tos_patterns:
            if rx.search(joined):
                pattern_hits.append(rx.pattern)
        pattern_hits = list(dict.fromkeys(pattern_hits))

        domain_string_hits: List[str] = []
        for d in self.config.visa_slot_ecosystem_domains:
            if d in joined:
                domain_string_hits.append(d)
        domain_string_hits = list(dict.fromkeys(domain_string_hits))

        # Capability inference: automation or capture capability
        has_injection_capability = any(
            p in (perms.api_permissions or [])
            for p in ["scripting", "webRequest", "webRequestBlocking", "declarativeNetRequest"]
        ) or bool(manifest.get("content_scripts"))
        has_capture_capability = any(
            p in (perms.api_permissions or []) for p in ["tabCapture", "desktopCapture"]
        ) or any("html2canvas" in ph.lower() for ph in pattern_hits)

        if protected_domain_hits and (
            has_injection_capability
            or has_capture_capability
            or visa_ecosystem_hits
            or domain_string_hits
            or pattern_hits
        ):
            violations.append(
                "Accesses visa scheduling sites where automation may violate their terms of service"
            )
            evidence_ids.append("tos:travel_docs:protected_domain_access")

            if has_injection_capability:
                violations.append("Can run scripts on protected government visa sites")
                evidence_ids.append("tos:travel_docs:automation_capability")

            if has_capture_capability:
                violations.append("Can capture screenshots of visa and travel documents")
                evidence_ids.append("tos:travel_docs:screenshot_capture")

            combined_exfil_hits = list(dict.fromkeys(visa_ecosystem_hits + domain_string_hits))
            if combined_exfil_hits:
                violations.append(
                    "Connects to third-party servers alongside government visa sites"
                )
                evidence_ids.append("tos:travel_docs:third_party_processor")
        
        # ---- Scoped decision -------------------------------------------------
        # Travel/visa-portal automation remains a hard, evidence-based BLOCK.
        travel_docs_block = any(e.startswith("tos:travel_docs") for e in evidence_ids)

        decision: Literal["ALLOW", "WARN", "BLOCK"] = "ALLOW"
        reasons: List[str] = list(violations)  # travel-docs reasons, if any

        if prohibited_present:
            perm_list = ", ".join(prohibited_present)
            if restricted_perm_aggravated:
                decision = "BLOCK"
                reasons.append(
                    f"Restricted permission ({perm_list}) combined with a high-risk capability"
                )
                if ext_conn_wildcard:
                    reasons.append(
                        "Any website can connect to this extension (externally_connectable: <all_urls>)"
                    )
                if capability_evidence:
                    evidenced = ", ".join(sorted(capability_evidence))
                    reasons.append(
                        f"Code analysis found high-risk usage tied to: {evidenced}"
                    )
                evidence_ids.extend(f"tos:restricted_perm_blocked:{p}" for p in prohibited_present)
            else:
                decision = "WARN"
                reasons.append(
                    f"Requests restricted permission ({perm_list}); verify it matches the "
                    f"extension's stated purpose before installing"
                )
                evidence_ids.extend(f"tos:restricted_perm_review:{p}" for p in prohibited_present)
        elif ext_conn_wildcard:
            decision = "WARN"
            reasons.append(
                "Any website can connect to this extension (externally_connectable: <all_urls>)"
            )
            evidence_ids.append("tos:ext_connectable_wildcard")

        # Travel-docs automation forces BLOCK regardless of the permission scoping.
        if travel_docs_block:
            decision = "BLOCK"

        if decision == "ALLOW":
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.9,
                reasons=["No ToS violations detected"],
                details={"checked_permissions": list(self.config.tos_prohibited_permissions)},
            )

        return GateResult(
            gate_id=gate_id,
            decision=decision,
            triggered=True,
            # High confidence for a BLOCK (aggravated / evidence-based); moderate
            # for a review-only restricted-permission declaration.
            confidence=0.9 if decision == "BLOCK" else 0.6,
            reasons=reasons or ["Restricted permissions require review"],
            evidence_ids=evidence_ids,
            details={
                "violations": reasons,
                "prohibited_present": prohibited_present,
                "externally_connectable_wildcard": ext_conn_wildcard,
                "aggravated": restricted_perm_aggravated,
                "capability_evidence": capability_evidence,
                "checked_permissions": list(self.config.tos_prohibited_permissions),
                "travel_docs": {
                    "protected_domains_hit": protected_domain_hits[:10],
                    "visa_ecosystem_domains_hit": list(dict.fromkeys(visa_ecosystem_hits + domain_string_hits))[:20],
                    "pattern_hits": pattern_hits[:20],
                    "externally_connectable_matches": ext_conn_matches[:20],
                },
            },
        )
    
    # =========================================================================
    # GATE 4: PURPOSE_MISMATCH
    # =========================================================================
    
    def evaluate_purpose_mismatch(
        self,
        manifest: Dict[str, Any],
        sast: SastSignalPack,
        perms: PermissionsSignalPack,
    ) -> GateResult:
        """
        Evaluate purpose mismatch gate.
        
        Detects when an extension claims one purpose but contains code patterns
        indicating credential capture, tracking, or other concerning behaviors.
        
        Examples:
        - "Productivity tool" with keylogging patterns → BLOCK
        - "Theme" extension with network + clipboard access → WARN
        
        Args:
            manifest: Manifest data
            sast: SAST signal pack
            perms: Permissions signal pack
            
        Returns:
            GateResult with WARN or BLOCK if mismatch detected
        """
        gate_id = "PURPOSE_MISMATCH"
        
        # Extract claimed purpose from manifest
        name = manifest.get("name", "").lower()
        description = manifest.get("description", "").lower()
        claimed_purpose = f"{name} {description}"
        
        # Categories that shouldn't have credential/tracking capabilities
        benign_categories = [
            "theme", "color", "dark mode", "light mode",
            "font", "beautif", "style", "appearance",
            "bookmark", "new tab", "wallpaper",
        ]
        
        is_benign_claimed = any(cat in claimed_purpose for cat in benign_categories)
        
        # Classify SAST findings by the CONCRETE BEHAVIOR they detected (the
        # specific rule suffix + severity) — never by scary keywords in the rule
        # id/message, and never from placeholder snippets. Benign-compatible
        # detectors (chrome.identity, first-party credentialed fetch, background
        # messaging, cookie/storage reads) are excluded from block evidence.
        secret_read: List[str] = []
        key_capture: List[str] = []
        exfil: List[str] = []
        remote_code: List[str] = []
        # Standalone-dangerous findings are collected with their finding object so
        # their evidence quality can be checked before they are allowed to BLOCK.
        standalone_findings: List[tuple] = []
        standalone_dangerous: List[str] = []  # high-quality -> BLOCK
        standalone_weak: List[str] = []       # weak/line-1/placeholder -> REVIEW
        benign_compat: List[str] = []
        credentialed_send: List[str] = []
        suspicious_external: List[str] = []

        for finding in sast.deduped_findings:
            suffix = _pm_behavior_suffix(finding.check_id)
            if not suffix:
                continue
            if suffix in _PM_BENIGN_COMPATIBLE:
                benign_compat.append(suffix)
                if suffix in _PM_CREDENTIALED_SEND:
                    credentialed_send.append(suffix)
                continue
            if suffix in _PM_SUSPICIOUS_EXTERNAL:
                suspicious_external.append(suffix)
            if suffix in _PM_STANDALONE_DANGEROUS:
                standalone_findings.append((suffix, finding))
            if suffix in _PM_REMOTE_CODE:
                remote_code.append(suffix)
            elif suffix in _PM_SECRET_READ:
                secret_read.append(suffix)
            elif suffix in _PM_KEY_CAPTURE:
                key_capture.append(suffix)
            elif suffix in _PM_EXFIL:
                exfil.append(suffix)

        # First-party/disclosed credentialed fetch (or a generic API/websocket
        # send) is benign ALONE — REVIEW, not BLOCK. But when the extension ALSO
        # reads secrets or captures keystrokes, that channel is the exfiltration
        # vector, so it corroborates a credential-theft pattern. A hardcoded
        # suspicious/DGA-looking destination corroborates the same way. We stay
        # conservative: ambiguous cases become REVIEW, never SAFE.
        if (secret_read or key_capture) and not exfil and (credentialed_send or suspicious_external):
            exfil.extend(sorted(set(credentialed_send + suspicious_external)))

        # Evidence-quality guard: a standalone-dangerous behavior may hard-BLOCK
        # only with high-quality evidence — a corroborating concrete signal, or a
        # real file/line match (line > 1, non-placeholder snippet). A line-1
        # minified match with a weak/placeholder snippet and no corroboration is
        # downgraded to WARN so the final result is NEEDS_REVIEW, not BLOCK.
        corroborated_concrete = bool(suspicious_external) or bool(remote_code) or bool(secret_read and exfil)
        for suffix, finding in standalone_findings:
            if _pm_standalone_high_quality(finding, corroborated_concrete):
                standalone_dangerous.append(suffix)
            else:
                standalone_weak.append(suffix)

        # Concerning permission combinations on an extension that CLAIMS to be a
        # simple/benign utility (purpose vs capability mismatch).
        has_network = perms.has_broad_host_access or "webRequest" in perms.api_permissions
        has_clipboard = "clipboardRead" in perms.api_permissions
        has_capture = any(p in perms.api_permissions for p in ["tabCapture", "desktopCapture"])

        # ------------------------------------------------------------------
        # BLOCK only for CONCRETE, corroborated dangerous behavior.
        # ------------------------------------------------------------------
        block_reasons: List[str] = []
        if remote_code:
            block_reasons.append("Loads and runs code from a remote/external source")
        if secret_read and exfil:
            block_reasons.append(
                "Reads secret or credential values and sends data to external servers"
            )
        if key_capture and exfil:
            block_reasons.append("Captures keystrokes and transmits them externally")
        if standalone_dangerous:
            block_reasons.append(
                "High-confidence malicious behavior detected: "
                + ", ".join(sorted(set(standalone_dangerous)))
            )

        # ------------------------------------------------------------------
        # REVIEW (WARN) for concerning-but-benign-compatible or uncorroborated
        # signals, and for benign-purpose-claim vs capability mismatch.
        # Ambiguous cases become REVIEW, never SAFE.
        # ------------------------------------------------------------------
        review_reasons: List[str] = []
        if standalone_weak:
            review_reasons.append(
                "Potential "
                + ", ".join(sorted(set(standalone_weak)))
                + " pattern in minified/bundled code (weak match) — review; not a "
                "confirmed behavior without file/line or destination evidence"
            )
        if secret_read and not exfil:
            review_reasons.append(
                "Reads form/credential values — review whether it stays local"
            )
        if key_capture and not exfil:
            review_reasons.append(
                "Uses keyboard capture (may be a hotkey/shortcut) — review before use"
            )
        if exfil and not (secret_read or key_capture):
            review_reasons.append("Sends data to external servers — review its destinations")
        if suspicious_external and not block_reasons:
            review_reasons.append(
                "Contacts a hardcoded, unusual-looking domain — review the destination"
            )
        if benign_compat:
            review_reasons.append(
                "Uses sensitive-but-common capabilities (identity/cookies/messaging/network) "
                "— verify they match the stated purpose"
            )
        if is_benign_claimed and has_network and has_clipboard:
            review_reasons.append(
                f"'{name}' presents as simple but can read your clipboard and access the internet"
            )
        if is_benign_claimed and has_capture:
            review_reasons.append(f"'{name}' presents as simple but can capture your screen")

        decision: Literal["ALLOW", "WARN", "BLOCK"] = "ALLOW"
        if block_reasons:
            decision = "BLOCK"
        elif review_reasons:
            decision = "WARN"

        if decision == "ALLOW":
            return GateResult(
                gate_id=gate_id,
                decision="ALLOW",
                triggered=False,
                confidence=0.8,
                reasons=["No purpose mismatch detected"],
                details={"is_benign_claimed": is_benign_claimed},
            )

        reasons = block_reasons if decision == "BLOCK" else review_reasons
        evidence_ids = (
            [f"mismatch:remote_code:{s}" for s in sorted(set(remote_code))]
            + [f"mismatch:secret_read:{s}" for s in sorted(set(secret_read))]
            + [f"mismatch:key_capture:{s}" for s in sorted(set(key_capture))]
            + [f"mismatch:exfil:{s}" for s in sorted(set(exfil))]
            + [f"mismatch:standalone:{s}" for s in sorted(set(standalone_dangerous))]
            + [f"mismatch:standalone_weak:{s}" for s in sorted(set(standalone_weak))]
        )[:6]
        return GateResult(
            gate_id=gate_id,
            decision=decision,
            triggered=True,
            # High confidence for a corroborated BLOCK; moderate for review-only.
            confidence=0.85 if decision == "BLOCK" else 0.6,
            reasons=reasons[:4],
            evidence_ids=evidence_ids,
            details={
                "claimed_purpose": claimed_purpose[:100],
                "is_benign_claimed": is_benign_claimed,
                "secret_read": sorted(set(secret_read)),
                "key_capture": sorted(set(key_capture)),
                "exfil": sorted(set(exfil)),
                "remote_code": sorted(set(remote_code)),
                "standalone_dangerous": sorted(set(standalone_dangerous)),
                "benign_compatible": sorted(set(benign_compat)),
                "credentialed_send": sorted(set(credentialed_send)),
                "suspicious_external": sorted(set(suspicious_external)),
                "has_network": has_network,
                "has_clipboard": has_clipboard,
                "has_capture": has_capture,
            },
        )
    
    # =========================================================================
    # GATE 5: SENSITIVE_EXFIL
    # =========================================================================
    
    def evaluate_sensitive_exfil(
        self,
        perms: PermissionsSignalPack,
        sast: SastSignalPack,
        webstore_stats: WebstoreStatsSignalPack,
    ) -> GateResult:
        """
        Evaluate sensitive data exfiltration risk gate.
        
        Detects the combination of:
        - Sensitive permissions (cookies, webRequest, history, etc.)
        - Network/third-party API patterns in code
        - Missing privacy policy disclosure
        
        This combination suggests potential data exfiltration.
        
        Args:
            perms: Permissions signal pack
            sast: SAST signal pack
            webstore_stats: Webstore stats for privacy policy check
            
        Returns:
            GateResult with WARN if exfiltration risk detected
        """
        gate_id = "SENSITIVE_EXFIL"
        
        # Count sensitive permissions
        all_permissions = set(perms.api_permissions)
        sensitive_found = [
            p for p in self.config.sensitive_permissions
            if p in all_permissions
        ]
        
        has_sensitive = len(sensitive_found) > 0
        has_network = perms.has_broad_host_access or "webRequest" in all_permissions
        has_privacy_policy = webstore_stats.has_privacy_policy
        
        # Check for network/exfil patterns in SAST
        network_patterns = [
            r"fetch", r"xhr", r"ajax", r"http", r"websocket",
            r"sendbeacon", r"external.*api", r"third.?party",
        ]
        network_pattern_compiled = [re.compile(p, re.IGNORECASE) for p in network_patterns]
        
        network_findings: List[str] = []
        for finding in sast.deduped_findings:
            check_lower = finding.check_id.lower()
            msg_lower = finding.message.lower()
            for pattern in network_pattern_compiled:
                if pattern.search(check_lower) or pattern.search(msg_lower):
                    network_findings.append(finding.check_id)
                    break
        
        network_findings = list(set(network_findings))[:5]
        has_network_patterns = len(network_findings) > 0
        
        # Risk assessment
        risk_factors = 0
        reasons: List[str] = []
        
        perm_plain = {
            "cookies": "cookies", "history": "browsing history",
            "tabs": "tab info", "webRequest": "web traffic",
            "clipboardRead": "clipboard",
        }
        if has_sensitive:
            risk_factors += 1
            plain_perms = [perm_plain.get(p, p) for p in sensitive_found[:3]]
            reasons.append(f"Can access your {', '.join(plain_perms)}")
        
        if has_network or has_network_patterns:
            risk_factors += 1
            if has_network:
                reasons.append("Requests permissions that could send data externally")
            if has_network_patterns:
                reasons.append("Code contains patterns that could send data externally")
        
        if not has_privacy_policy:
            risk_factors += 1
            reasons.append("No privacy policy provided")
        
        # WARN if 2+ risk factors (sensitive + network + no privacy)
        if risk_factors >= 2:
            # This gate is a capability/disclosure warning, not proof of
            # exfiltration. Make that explicit so the finding is not read as a
            # confirmed data-theft behavior.
            reasons.append(
                "Capability warning; not confirmed exfiltration unless source/destination "
                "evidence is shown"
            )
            return GateResult(
                gate_id=gate_id,
                decision="WARN",
                triggered=True,
                confidence=0.7,
                reasons=reasons,
                evidence_ids=[
                    f"exfil:sensitive_perm:{p}" for p in sensitive_found[:3]
                ] + [
                    f"exfil:network:{f}" for f in network_findings[:2]
                ],
                details={
                    "sensitive_permissions": sensitive_found,
                    "has_network_access": has_network,
                    "network_findings": network_findings,
                    "has_privacy_policy": has_privacy_policy,
                    "risk_factors": risk_factors,
                },
            )
        
        return GateResult(
            gate_id=gate_id,
            decision="ALLOW",
            triggered=False,
            confidence=0.8,
            reasons=["No significant exfiltration risk"],
            details={
                "sensitive_permissions": sensitive_found,
                "risk_factors": risk_factors,
            },
        )
    
    # =========================================================================
    # MAIN EVALUATION METHODS
    # =========================================================================
    
    def evaluate_all(
        self,
        signal_pack: SignalPack,
        manifest: Optional[Dict[str, Any]] = None,
    ) -> List[GateResult]:
        """
        Evaluate all hard gates against the signal pack.
        
        Gates are evaluated in priority order. All gates are evaluated
        to provide complete visibility, even if an early gate triggers BLOCK.
        
        Args:
            signal_pack: Layer 0 SignalPack with normalized signals
            manifest: Optional manifest data (uses empty dict if None)
            
        Returns:
            List of GateResult in priority order
        """
        manifest = manifest or {}
        
        results = [
            self.evaluate_vt_malware(signal_pack.virustotal),
            self.evaluate_critical_sast(signal_pack.sast),
            self.evaluate_tos_violation(signal_pack.permissions, signal_pack.sast, signal_pack.network, manifest),
            self.evaluate_purpose_mismatch(manifest, signal_pack.sast, signal_pack.permissions),
            self.evaluate_sensitive_exfil(
                signal_pack.permissions,
                signal_pack.sast,
                signal_pack.webstore_stats,
            ),
        ]
        
        return results
    
    def get_triggered_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get only the triggered gates from results."""
        return [g for g in gate_results if g.triggered]
    
    def get_blocking_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get gates that triggered BLOCK decision."""
        return [g for g in gate_results if g.is_blocking]
    
    def get_warning_gates(self, gate_results: List[GateResult]) -> List[GateResult]:
        """Get gates that triggered WARN decision."""
        return [g for g in gate_results if g.is_warning]
    
    def get_final_decision(
        self,
        gate_results: List[GateResult],
        layer_scores: Optional[Dict[str, LayerScore]] = None,
    ) -> Tuple[Decision, List[str], List[str]]:
        """
        Compute final governance decision from gates and layer scores.

        This delegates to the single Decision Authority (``scoring.decision.resolve``)
        so gate-only decisions use the exact same precedence chain and thresholds
        (``DecisionPolicy``) as the scoring engine. Do not reintroduce separate
        thresholds here.

        Args:
            gate_results: Results from evaluate_all()
            layer_scores: Optional dict of layer scores (security, privacy, governance)

        Returns:
            Tuple of (Decision, reasons list, triggered gate IDs)
        """
        from extension_shield.scoring.decision import resolve as resolve_decision

        blocking_gates = self.get_blocking_gates(gate_results)
        warning_gates = self.get_warning_gates(gate_results)
        triggered_ids = [g.gate_id for g in blocking_gates + warning_gates]

        def _score(name: str, default: int) -> int:
            layer = (layer_scores or {}).get(name)
            return layer.score if layer is not None else default

        final = resolve_decision(
            overall_score=_score("overall", _score("security", 100)),
            security_score=_score("security", 100),
            privacy_score=_score("privacy", 100),
            governance_score=_score("governance", 100),
            blocking_gates=blocking_gates,
            warning_gates=warning_gates,
        )
        return final.verdict, final.reasons, triggered_ids


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def evaluate_hard_gates(
    signal_pack: SignalPack,
    manifest: Optional[Dict[str, Any]] = None,
    config: Optional[GateConfig] = None,
) -> Tuple[List[GateResult], Decision, List[str]]:
    """
    Convenience function to evaluate all hard gates and get decision.
    
    Args:
        signal_pack: Layer 0 SignalPack
        manifest: Optional manifest data
        config: Optional gate configuration
        
    Returns:
        Tuple of (all gate results, final decision, reasons)
    """
    gates = HardGates(config)
    results = gates.evaluate_all(signal_pack, manifest)
    decision, reasons, _ = gates.get_final_decision(results)
    return results, decision, reasons


def get_hard_gate_summary(gate_results: List[GateResult]) -> Dict[str, Any]:
    """
    Get a summary of gate results for API/UI consumption.
    
    Args:
        gate_results: List of GateResult from evaluate_all()
        
    Returns:
        Dictionary summary of gate results
    """
    triggered = [g for g in gate_results if g.triggered]
    blocking = [g for g in triggered if g.is_blocking]
    warning = [g for g in triggered if g.is_warning]
    
    return {
        "total_gates": len(gate_results),
        "triggered_count": len(triggered),
        "blocking_count": len(blocking),
        "warning_count": len(warning),
        "blocking_gates": [
            {
                "gate_id": g.gate_id,
                "reasons": g.reasons,
                "confidence": g.confidence,
            }
            for g in blocking
        ],
        "warning_gates": [
            {
                "gate_id": g.gate_id,
                "reasons": g.reasons,
                "confidence": g.confidence,
            }
            for g in warning
        ],
        "all_gates": [
            {
                "gate_id": g.gate_id,
                "decision": g.decision,
                "triggered": g.triggered,
                "confidence": g.confidence,
            }
            for g in gate_results
        ],
    }

