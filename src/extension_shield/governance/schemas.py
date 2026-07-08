"""
Governance Engine Schemas

Pydantic models for all governance pipeline JSON outputs.
These schemas define the canonical data contracts between pipeline stages.
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, Field


# =============================================================================
# Stage 2: Facts Builder → facts.json
# =============================================================================


class ContentScriptFacts(BaseModel):
    """Normalized content script configuration from manifest."""
    
    matches: List[str] = Field(default_factory=list, description="URL patterns where script runs")
    exclude_matches: List[str] = Field(default_factory=list, description="URL patterns to exclude")
    js: List[str] = Field(default_factory=list, description="JavaScript files to inject")
    css: List[str] = Field(default_factory=list, description="CSS files to inject")
    run_at: str = Field(default="document_idle", description="When to inject the script")
    all_frames: bool = Field(default=False, description="Whether to run in all frames")
    match_about_blank: bool = Field(default=False, description="Whether to match about:blank")


class BackgroundFacts(BaseModel):
    """Normalized background script/service worker configuration."""
    
    type: str = Field(description="Background type: 'service_worker', 'scripts', or 'page'")
    service_worker: Optional[str] = Field(default=None, description="Service worker path (MV3)")
    scripts: List[str] = Field(default_factory=list, description="Background scripts (MV2)")
    page: Optional[str] = Field(default=None, description="Background page (MV2)")
    persistent: bool = Field(default=True, description="Whether background is persistent (MV2)")
    type_module: bool = Field(default=False, description="Whether service worker is ES module")


class ManifestFacts(BaseModel):
    """Normalized manifest data extracted from extension."""
    
    name: str = Field(description="Extension name")
    version: str = Field(description="Extension version")
    manifest_version: int = Field(description="Manifest version (2 or 3)")
    description: str = Field(default="", description="Extension description")
    
    # Permissions (critical for governance)
    permissions: List[str] = Field(default_factory=list, description="API permissions")
    host_permissions: List[str] = Field(default_factory=list, description="Host permissions (MV3)")
    optional_permissions: List[str] = Field(default_factory=list, description="Optional permissions")
    
    # Scripts
    content_scripts: List[ContentScriptFacts] = Field(default_factory=list)
    background: Optional[BackgroundFacts] = Field(default=None)
    
    # Security-relevant
    externally_connectable: Optional[Dict[str, Any]] = Field(default=None)
    web_accessible_resources: List[Any] = Field(default_factory=list)
    content_security_policy: Optional[str] = Field(default=None)
    update_url: Optional[str] = Field(default=None)


class FileInventoryItem(BaseModel):
    """Single file in the extension inventory."""
    
    path: str = Field(description="Relative path within extension")
    file_type: str = Field(description="File type/extension (e.g., 'js', 'html', 'json')")
    size_bytes: Optional[int] = Field(default=None, description="File size in bytes")
    sha256: Optional[str] = Field(default=None, description="SHA256 hash of file contents")


class PermissionAnalysisFinding(BaseModel):
    """Individual permission analysis finding."""
    
    permission_name: str
    # Tri-state (D4): True=reasonable, False=unreasonable, None=analysis unavailable.
    is_reasonable: Optional[bool] = None
    justification_reasoning: str


class SastFinding(BaseModel):
    """Individual SAST finding."""
    
    file_path: str
    finding_type: str
    severity: str = Field(default="medium")
    description: str
    line_number: Optional[int] = None
    code_snippet: Optional[str] = None


class VirusTotalFileFinding(BaseModel):
    """VirusTotal analysis for a single file."""
    
    file_name: str
    file_path: str
    sha256: str
    detection_stats: Optional[Dict[str, int]] = None
    threat_level: str = Field(default="clean")
    malware_families: List[str] = Field(default_factory=list)


class EntropyFileFinding(BaseModel):
    """Entropy analysis for a single file."""
    
    file_name: str
    file_path: str
    byte_entropy: float
    char_entropy: float
    risk_level: str
    is_likely_obfuscated: bool
    obfuscation_patterns: List[str] = Field(default_factory=list)


class SecurityFindings(BaseModel):
    """Consolidated security findings from all Stage 1 analyzers."""
    
    # Permission analysis
    permission_findings: List[PermissionAnalysisFinding] = Field(default_factory=list)
    dangerous_permissions: List[str] = Field(default_factory=list)
    
    # SAST findings
    sast_findings: List[SastFinding] = Field(default_factory=list)
    sast_risk_level: str = Field(default="low")
    
    # VirusTotal findings
    virustotal_findings: List[VirusTotalFileFinding] = Field(default_factory=list)
    virustotal_threat_level: str = Field(default="clean")
    virustotal_malicious_count: int = Field(default=0)
    
    # Entropy/obfuscation findings
    entropy_findings: List[EntropyFileFinding] = Field(default_factory=list)
    entropy_risk_level: str = Field(default="normal")
    obfuscation_detected: bool = Field(default=False)
    
    # WebStore reputation
    webstore_risk_level: str = Field(default="unknown")
    webstore_analysis: Optional[str] = Field(default=None)
    
    # Overall
    overall_risk_level: str = Field(default="medium")
    overall_security_score: int = Field(default=0)
    total_findings: int = Field(default=0)


class ExtensionMetadata(BaseModel):
    """Metadata about the extension from Chrome Web Store or local analysis."""
    
    title: Optional[str] = None
    user_count: Optional[int] = None
    rating: Optional[float] = None
    ratings_count: Optional[int] = None
    last_updated: Optional[str] = None
    developer_name: Optional[str] = None
    developer_email: Optional[str] = None
    developer_website: Optional[str] = None
    category: Optional[str] = None
    is_featured: bool = False
    follows_best_practices: bool = False


class Facts(BaseModel):
    """
    Stage 2 Output: facts.json
    
    The canonical contract between security analysis (Pipeline A) and 
    governance decisioning (Pipeline B). This schema normalizes all 
    security outputs and manifest data into a structure used by governance.
    """
    
    # Identifiers
    scan_id: str = Field(description="Unique identifier for this scan")
    extension_id: Optional[str] = Field(default=None, description="Chrome extension ID")
    artifact_hash: Optional[str] = Field(default=None, description="SHA256 hash of the extension artifact")
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    # Normalized manifest
    manifest: ManifestFacts = Field(description="Normalized manifest data")
    
    # MVP CRITICAL: Consolidated host access patterns
    # This field consolidates host access from:
    # - manifest.host_permissions (MV3)
    # - manifest.permissions (MV2 host patterns like <all_urls>, *://*/*)
    # - manifest.content_scripts[].matches
    # - manifest.externally_connectable.matches
    host_access_patterns: List[str] = Field(
        default_factory=list,
        description="Consolidated host access patterns from all manifest sources"
    )
    
    # File inventory
    file_inventory: List[FileInventoryItem] = Field(
        default_factory=list,
        description="All files in the extension"
    )
    
    # Security findings (carried forward from Stage 1)
    security_findings: SecurityFindings = Field(
        default_factory=SecurityFindings,
        description="Consolidated security findings from all analyzers"
    )
    
    # Extension metadata
    metadata: Optional[ExtensionMetadata] = Field(default=None)
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


# =============================================================================
# Stage 3: Evidence Index Builder → evidence_index.json
# =============================================================================


class EvidenceItem(BaseModel):
    """Single evidence item with chain-of-custody."""
    
    evidence_id: str = Field(description="Unique evidence identifier (e.g., 'ev_001')")
    file_path: str = Field(description="Path to source file")
    file_hash: str = Field(description="SHA256 hash of source file (sha256:<hex>)")
    line_start: Optional[int] = Field(default=None, description="Starting line number")
    line_end: Optional[int] = Field(default=None, description="Ending line number")
    snippet: Optional[str] = Field(default=None, description="Code snippet (small)")
    provenance: str = Field(description="How this evidence was discovered")
    version: Optional[int] = Field(default=1, description="Evidence version for cache stability")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EvidenceIndex(BaseModel):
    """Stage 3 Output: evidence_index.json"""
    
    scan_id: str
    evidence: Dict[str, EvidenceItem] = Field(
        default_factory=dict,
        description="Evidence items keyed by evidence_id"
    )


# =============================================================================
# Stage 4: Signal Extractor → signals.json
# =============================================================================


class Signal(BaseModel):
    """
    Individual governance signal extracted from facts.
    
    MVP Signal Types:
    - HOST_PERMS_BROAD: Extension requests broad host permissions
    - SENSITIVE_API: Extension uses sensitive Chrome APIs
    - ENDPOINT_FOUND: External endpoint/URL detected in code
    - DATAFLOW_TRACE: Potential data exfiltration pattern
    """
    
    signal_id: str = Field(description="Unique signal identifier")
    type: str = Field(description="Signal type (HOST_PERMS_BROAD, SENSITIVE_API, etc.)")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0-1")
    evidence_refs: List[str] = Field(default_factory=list, description="Evidence IDs")
    description: str = Field(description="Human-readable signal description")
    severity: Literal["low", "medium", "high", "critical"] = Field(default="medium", description="Severity level")


class Signals(BaseModel):
    """Stage 4 Output: signals.json"""
    
    scan_id: str
    signals: List[Signal] = Field(default_factory=list)


# =============================================================================
# Stage 5: Store Listing Extractor → store_listing.json
# =============================================================================


class ExtractionStatus(BaseModel):
    """Status of store listing extraction."""
    
    status: Literal["ok", "skipped", "failed"] = Field(description="Extraction outcome")
    reason: str = Field(default="", description="Details on why skipped or failed")
    extracted_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StoreListing(BaseModel):
    """
    Stage 5 Output: store_listing.json
    
    IMPORTANT: This file is ALWAYS created, even when extraction is skipped/failed.
    Rules that depend on store listing data MUST check extraction.status == "ok".
    """
    
    extraction: ExtractionStatus
    declared_data_categories: List[str] = Field(default_factory=list)
    declared_purposes: List[str] = Field(default_factory=list)
    declared_third_parties: List[str] = Field(default_factory=list)
    privacy_policy_url: Optional[str] = None
    privacy_policy_hash: Optional[str] = None


# =============================================================================
# Stage 6: Context Builder → context.json
# =============================================================================


class GovernanceContext(BaseModel):
    """Stage 6 Output: context.json"""
    
    regions_in_scope: List[str] = Field(
        default_factory=lambda: ["GLOBAL"],
        description="Policy regions (GLOBAL, US, EU, IN, etc.)"
    )
    rulepacks: List[str] = Field(
        default_factory=lambda: ["ENTERPRISE_GOV_BASELINE", "CWS_LIMITED_USE"],
        description="Active rulepack IDs"
    )
    domain_categories: List[str] = Field(default_factory=lambda: ["general"])
    cross_border_risk: bool = Field(default=False)


class Context(BaseModel):
    """Wrapper for context.json output."""
    
    context: GovernanceContext = Field(default_factory=GovernanceContext)


# =============================================================================
# Stage 7: Rules Engine → rule_results.json
# =============================================================================


class RuleResult(BaseModel):
    """Individual rule evaluation result."""
    
    rule_id: str = Field(description="Rule identifier (e.g., 'ENTERPRISE_GOV_BASELINE::R1')")
    rulepack: str = Field(description="Source rulepack")
    verdict: Literal["ALLOW", "BLOCK", "NEEDS_REVIEW"] = Field(description="Rule decision")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence in the verdict")
    evidence_refs: List[str] = Field(default_factory=list, description="Evidence IDs supporting verdict")
    citations: List[str] = Field(default_factory=list, description="Citation IDs for policies/standards")
    explanation: str = Field(description="Why rule was triggered and verdict rendered")
    recommended_action: str = Field(description="Action to take based on verdict")
    advisory: bool = Field(
        default=False,
        description=(
            "Advisory (policy-hygiene) rule. Its verdict is surfaced as a review "
            "note but must NOT escalate the final verdict above the evidence-based "
            "V2 decision (e.g. broad host access, minification, generic manifest/"
            "permission warnings, missing-policy). Non-advisory rules are "
            "evidence-backed and may escalate."
        ),
    )
    triggered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="When rule was evaluated")


class RuleResults(BaseModel):
    """Stage 7 Output: rule_results.json"""
    
    scan_id: str
    rule_results: List[RuleResult] = Field(default_factory=list)


# =============================================================================
# Stage 8: Decision + Report → report.json
# =============================================================================


class GovernanceDecision(BaseModel):
    """Final governance decision."""
    
    verdict: str = Field(description="ALLOW, BLOCK, or NEEDS_REVIEW")
    rationale: str
    action_required: str
    triggered_rules: List[str] = Field(default_factory=list)
    block_rules: List[str] = Field(default_factory=list)
    review_rules: List[str] = Field(default_factory=list)


class GovernanceReport(BaseModel):
    """Stage 8 Output: report.json"""
    
    scan_id: str
    extension_id: Optional[str] = None
    extension_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    decision: GovernanceDecision
    rule_results: List[RuleResult] = Field(default_factory=list)
    
    # Summary statistics
    total_rules_evaluated: int = 0
    rules_triggered: int = 0
    block_count: int = 0
    review_count: int = 0
    allow_count: int = 0



