"""
Signal Pack - Layer 0: Signal Extraction

Normalized signal pack structure that collects signals + evidence from all tooling outputs.
This is Layer 0 of the 3-layer scoring architecture.

Layer 0 (Signal Extraction):
- Collect normalized signals from each tool
- Generate evidence items with stable IDs
- Provide a unified SignalPack structure for downstream processing

Evidence Rule:
- Every tool output becomes evidence
- evidence_id = "tool:<toolname>:<hash>"
- Includes minimal snippet/hash + file/line when possible
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


# Snippets that are not real matched code and must never be shown as evidence
# or consumed by gates (e.g. a placeholder returned instead of the source line).
_PLACEHOLDER_SNIPPETS = frozenset({"requires login", "requires_login", "n/a", "none", "null"})
# Characters that indicate a string is actual source code (not a prose phrase).
_CODE_CHARS = set("(){}[];=<>.:/\\\"'`+*&|")


def sanitize_code_snippet(text: Optional[str], max_len: int = 200) -> Optional[str]:
    """Return a real code snippet, or None when the snippet is fake/non-code.

    A finding's code snippet must be the actual matched source. Some analyzer
    paths emit a placeholder instead (e.g. "requires login"); such values must
    never surface as user-facing code evidence and must never feed a gate. When
    no real snippet is available we return None so callers can fall back to the
    file/line reference and mark the code evidence as unavailable.
    """
    if not text or not isinstance(text, str):
        return None
    stripped = text.strip()
    if not stripped or stripped.lower() in _PLACEHOLDER_SNIPPETS:
        return None
    # A short phrase with no code punctuation is prose, not matched code.
    if len(stripped) <= 40 and not any(ch in _CODE_CHARS for ch in stripped):
        return None
    if len(stripped) <= max_len:
        return stripped
    return stripped[: max_len - 3] + "..."


# =============================================================================
# EVIDENCE MODELS
# =============================================================================


class ToolEvidence(BaseModel):
    """
    Evidence item from a tool output.
    
    Evidence ID format: tool:<toolname>:<hash>
    """
    evidence_id: str = Field(description="Unique evidence ID: tool:<toolname>:<hash>")
    tool_name: str = Field(description="Name of the tool that produced this evidence")
    content_hash: str = Field(description="SHA256 hash of the evidence content")
    file_path: Optional[str] = Field(default=None, description="File path if applicable")
    line_start: Optional[int] = Field(default=None, description="Starting line number")
    line_end: Optional[int] = Field(default=None, description="Ending line number")
    snippet: Optional[str] = Field(default=None, description="Code/content snippet (max 200 chars)")
    raw_data: Optional[Dict[str, Any]] = Field(default=None, description="Raw tool output (limited)")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    @classmethod
    def create(
        cls,
        tool_name: str,
        content: str,
        file_path: Optional[str] = None,
        line_start: Optional[int] = None,
        line_end: Optional[int] = None,
        snippet: Optional[str] = None,
        raw_data: Optional[Dict[str, Any]] = None,
    ) -> "ToolEvidence":
        """
        Factory method to create evidence with proper ID generation.
        
        Args:
            tool_name: Name of the source tool
            content: Content to hash for ID generation
            file_path: Optional file path
            line_start: Optional start line
            line_end: Optional end line
            snippet: Optional code snippet
            raw_data: Optional raw data (will be truncated)
            
        Returns:
            ToolEvidence instance with generated ID
        """
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        evidence_id = f"tool:{tool_name}:{content_hash}"
        
        # Truncate snippet if too long
        if snippet and len(snippet) > 200:
            snippet = snippet[:197] + "..."
        
        # Limit raw_data size
        limited_raw = None
        if raw_data:
            limited_raw = {k: v for k, v in list(raw_data.items())[:10]}
        
        return cls(
            evidence_id=evidence_id,
            tool_name=tool_name,
            content_hash=content_hash,
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            snippet=snippet,
            raw_data=limited_raw,
        )


# =============================================================================
# SAST SIGNAL PACK
# =============================================================================


class SastFindingNormalized(BaseModel):
    """Normalized SAST finding for signal pack."""
    check_id: str
    file_path: str
    line_number: Optional[int] = None
    severity: str = Field(default="INFO")
    message: str = ""
    category: Optional[str] = None
    code_snippet: Optional[str] = None


class SastSignalPack(BaseModel):
    """
    SAST Signal Pack - normalized SAST output.
    
    Contains:
    - raw_findings: Original findings count per file
    - deduped_findings: Deduplicated findings list
    - counts_by_severity: Findings grouped by severity
    - confidence: Overall confidence in SAST results
    """
    raw_findings: Dict[str, int] = Field(
        default_factory=dict,
        description="Raw findings count per file"
    )
    deduped_findings: List[SastFindingNormalized] = Field(
        default_factory=list,
        description="Deduplicated and normalized findings"
    )
    counts_by_severity: Dict[str, int] = Field(
        default_factory=lambda: {"CRITICAL": 0, "ERROR": 0, "WARNING": 0, "INFO": 0},
        description="Findings count by severity level"
    )
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Confidence in SAST results (0-1)"
    )
    files_scanned: int = Field(default=0)
    files_with_findings: int = Field(default=0)
    scan_error: bool = Field(
        default=False,
        description=(
            "True when the SAST scan failed to run to completion (Semgrep "
            "crash/timeout). A failed scan is missing coverage, NOT a clean "
            "result, and must not clear an extension as safe."
        ),
    )


# =============================================================================
# VIRUSTOTAL SIGNAL PACK
# =============================================================================


class VendorHit(BaseModel):
    """Individual vendor detection from VirusTotal."""
    vendor_name: str
    result: str
    category: str = "undetected"


class VirusTotalSignalPack(BaseModel):
    """
    VirusTotal Signal Pack - normalized VT output.
    
    Contains:
    - malicious_count: Number of malicious detections
    - suspicious_count: Number of suspicious detections
    - total_engines: Total engines that analyzed
    - vendor_hits: List of vendor detections
    - ratios: Detection ratios
    - timestamp: When the scan was performed
    """
    malicious_count: int = Field(default=0)
    suspicious_count: int = Field(default=0)
    harmless_count: int = Field(default=0)
    undetected_count: int = Field(default=0)
    total_engines: int = Field(default=0)
    vendor_hits: List[VendorHit] = Field(
        default_factory=list,
        description="List of vendor detections"
    )
    malware_families: List[str] = Field(
        default_factory=list,
        description="Detected malware family names"
    )
    ratios: Dict[str, float] = Field(
        default_factory=dict,
        description="Detection ratios (malicious_ratio, suspicious_ratio)"
    )
    files_analyzed: int = Field(default=0)
    enabled: bool = Field(default=False)
    timestamp: Optional[datetime] = None
    
    @property
    def malicious_ratio(self) -> float:
        """Calculate malicious detection ratio."""
        if self.total_engines == 0:
            return 0.0
        return self.malicious_count / self.total_engines
    
    @property
    def threat_level(self) -> str:
        """Determine threat level from detections."""
        if self.malicious_count > 0:
            return "malicious"
        if self.suspicious_count > 0:
            return "suspicious"
        return "clean"


# =============================================================================
# ENTROPY SIGNAL PACK
# =============================================================================


class EntropyFileResult(BaseModel):
    """Entropy analysis result for a single file."""
    file_path: str
    file_name: str
    byte_entropy: float
    char_entropy: float
    risk_level: str = "normal"
    is_likely_obfuscated: bool = False
    obfuscation_patterns: List[str] = Field(default_factory=list)


class EntropySignalPack(BaseModel):
    """
    Entropy Signal Pack - normalized entropy/obfuscation output.
    
    Contains:
    - file_entropy_map: Entropy values per file
    - suspected_obfuscation_files: Files flagged for obfuscation
    - minified_files: Files detected as minified (not malicious)
    - thresholds_used: Entropy thresholds applied
    """
    file_entropy_map: Dict[str, Dict[str, float]] = Field(
        default_factory=dict,
        description="Map of file path to {byte_entropy, char_entropy}"
    )
    suspected_obfuscation_files: List[str] = Field(
        default_factory=list,
        description="Files suspected of obfuscation (high risk)"
    )
    minified_files: List[str] = Field(
        default_factory=list,
        description="Files detected as minified (not suspicious)"
    )
    high_risk_patterns: Dict[str, int] = Field(
        default_factory=dict,
        description="High-risk patterns detected and their counts"
    )
    thresholds_used: Dict[str, float] = Field(
        default_factory=lambda: {
            "normal_max": 5.5,
            "suspicious_min": 6.5,
            "high_risk_min": 7.5,
        },
        description="Entropy thresholds applied"
    )
    files_analyzed: int = Field(default=0)
    obfuscated_count: int = Field(default=0)
    suspicious_count: int = Field(default=0)
    overall_risk: str = Field(default="normal")


# =============================================================================
# WEBSTORE STATS SIGNAL PACK
# =============================================================================


class WebstoreStatsSignalPack(BaseModel):
    """
    Webstore Stats Signal Pack - extension metadata from Chrome Web Store.
    
    Contains:
    - installs: User install count
    - rating_avg: Average rating
    - rating_count: Number of ratings
    - last_updated: Last update date
    - developer: Developer name
    - developer_profile: Developer profile information
    """
    installs: Optional[int] = Field(default=None, description="User install count")
    rating_avg: Optional[float] = Field(default=None, description="Average rating (0-5)")
    rating_count: Optional[int] = Field(default=None, description="Number of ratings")
    last_updated: Optional[str] = Field(default=None, description="Last update date")
    developer: Optional[str] = Field(default=None, description="Developer name")
    developer_email: Optional[str] = Field(default=None, description="Developer email")
    developer_website: Optional[str] = Field(default=None, description="Developer website")
    developer_profile: Dict[str, Any] = Field(
        default_factory=dict,
        description="Full developer profile information"
    )
    category: Optional[str] = Field(default=None, description="Extension category")
    is_featured: bool = Field(default=False)
    follows_best_practices: bool = Field(default=False)
    has_privacy_policy: bool = Field(default=False)


# =============================================================================
# WEBSTORE REVIEWS SIGNAL PACK
# =============================================================================


class ReviewSample(BaseModel):
    """Sample review from webstore."""
    rating: int
    text: str
    date: Optional[str] = None
    helpful_count: int = 0


class ComplaintCluster(BaseModel):
    """Cluster of similar complaints."""
    theme: str
    count: int
    sample_texts: List[str] = Field(default_factory=list)
    severity: str = "low"


class WebstoreReviewsSignalPack(BaseModel):
    """
    Webstore Reviews Signal Pack - review analysis from Chrome Web Store.
    
    Contains:
    - sampled_reviews: Sample of reviews analyzed
    - complaint_clusters: Clusters of similar complaints
    - keyword_hits: Security-related keyword matches
    - time_trend: Rating trend over time
    - manipulation_flags: Potential review manipulation indicators
    """
    sampled_reviews: List[ReviewSample] = Field(
        default_factory=list,
        description="Sample of reviews analyzed"
    )
    complaint_clusters: List[ComplaintCluster] = Field(
        default_factory=list,
        description="Clusters of similar complaints"
    )
    keyword_hits: Dict[str, int] = Field(
        default_factory=dict,
        description="Security-related keywords found and counts"
    )
    time_trend: Dict[str, float] = Field(
        default_factory=dict,
        description="Rating trend data (recent_avg, historical_avg, trend_direction)"
    )
    manipulation_flags: List[str] = Field(
        default_factory=list,
        description="Flags indicating potential review manipulation"
    )
    total_reviews_sampled: int = Field(default=0)
    negative_review_ratio: float = Field(default=0.0)


# =============================================================================
# PERMISSIONS SIGNAL PACK
# =============================================================================


class PermissionAnalysisResult(BaseModel):
    """Analysis result for a single permission."""
    permission_name: str
    risk_level: str = "low"
    # Tri-state (D4): True=reasonable, False=unreasonable, None=analysis unavailable.
    is_reasonable: Optional[bool] = None
    justification: str = ""
    category: str = "other"


class PermissionsSignalPack(BaseModel):
    """
    Permissions Signal Pack - permission analysis results.
    
    Contains normalized permission analysis from the PermissionsAnalyzer.
    """
    api_permissions: List[str] = Field(default_factory=list)
    host_permissions: List[str] = Field(default_factory=list)
    optional_permissions: List[str] = Field(default_factory=list)
    permission_analysis: List[PermissionAnalysisResult] = Field(default_factory=list)
    unreasonable_permissions: List[str] = Field(default_factory=list)
    high_risk_permissions: List[str] = Field(default_factory=list)
    has_broad_host_access: bool = Field(default=False)
    broad_host_patterns: List[str] = Field(default_factory=list)
    total_permissions: int = Field(default=0)


# =============================================================================
# NETWORK SIGNAL PACK
# =============================================================================


class NetworkSignalPack(BaseModel):
    """
    Network Signal Pack - network exfiltration risk signals.
    
    Contains normalized network behavior and suspicious patterns.
    Per Phase 1 fixups: Used by normalize_network_exfil instead of SastSignalPack.
    """
    enabled: bool = Field(default=False, description="Whether network analysis was run")
    domains: List[str] = Field(default_factory=list, description="External domains contacted")
    has_runtime_url_construction: bool = Field(
        default=False, description="Uses runtime URL construction (eval/concat)"
    )
    suspicious_flags: Dict[str, bool] = Field(
        default_factory=lambda: {
            "http_unencrypted": False,       # Uses HTTP instead of HTTPS
            "base64_encoded_urls": False,    # Base64-encoded URLs/payloads
            "high_entropy_payload": False,   # High-entropy payload data
            "dynamic_url_construction": False,  # Runtime URL building
            "credential_exfil_pattern": False,  # Patterns suggesting credential theft
            "data_harvest_pattern": False,   # Bulk data collection patterns
        },
        description="Suspicious network behavior flags"
    )
    external_request_count: int = Field(default=0, description="Number of external network requests")
    data_sending_patterns: List[str] = Field(
        default_factory=list, description="Detected data sending patterns"
    )
    confidence: float = Field(
        default=0.5, ge=0.0, le=1.0, description="Confidence in network analysis"
    )


# =============================================================================
# CHROMESTATS SIGNAL PACK
# =============================================================================


class ChromeStatsSignalPack(BaseModel):
    """
    Chrome Stats Signal Pack - behavioral threat intelligence.
    
    Contains normalized ChromeStats analysis output.
    """
    enabled: bool = Field(default=False)
    risk_indicators: List[str] = Field(default_factory=list)
    total_risk_score: int = Field(default=0)
    overall_risk_level: str = Field(default="low")
    install_trends: Dict[str, Any] = Field(default_factory=dict)
    rating_patterns: Dict[str, Any] = Field(default_factory=dict)
    developer_reputation: Dict[str, Any] = Field(default_factory=dict)


# =============================================================================
# MAIN SIGNAL PACK
# =============================================================================


class SignalPack(BaseModel):
    """
    Layer 0: Complete Signal Pack
    
    Aggregates normalized signals from all tools with associated evidence.
    This is the canonical input to Layer 1 (Risk Scoring) and Layer 2 (Decision).
    
    Evidence Rule:
    - Every tool output becomes evidence
    - evidence_id = "tool:<toolname>:<hash>"
    """
    scan_id: str = Field(description="Unique scan identifier")
    extension_id: Optional[str] = Field(default=None, description="Chrome extension ID")
    
    # Tool signal packs
    sast: SastSignalPack = Field(default_factory=SastSignalPack)
    virustotal: VirusTotalSignalPack = Field(default_factory=VirusTotalSignalPack)
    entropy: EntropySignalPack = Field(default_factory=EntropySignalPack)
    webstore_stats: WebstoreStatsSignalPack = Field(default_factory=WebstoreStatsSignalPack)
    webstore_reviews: WebstoreReviewsSignalPack = Field(default_factory=WebstoreReviewsSignalPack)
    permissions: PermissionsSignalPack = Field(default_factory=PermissionsSignalPack)
    chromestats: ChromeStatsSignalPack = Field(default_factory=ChromeStatsSignalPack)
    network: NetworkSignalPack = Field(default_factory=NetworkSignalPack)
    
    # Evidence collection
    evidence: List[ToolEvidence] = Field(
        default_factory=list,
        description="All evidence items from tool outputs"
    )
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    def get_evidence_by_tool(self, tool_name: str) -> List[ToolEvidence]:
        """Get all evidence items from a specific tool."""
        return [e for e in self.evidence if e.tool_name == tool_name]
    
    def get_evidence_ids(self) -> List[str]:
        """Get all evidence IDs."""
        return [e.evidence_id for e in self.evidence]
    
    def add_evidence(self, evidence: ToolEvidence) -> None:
        """Add an evidence item, avoiding duplicates by ID."""
        existing_ids = {e.evidence_id for e in self.evidence}
        if evidence.evidence_id not in existing_ids:
            self.evidence.append(evidence)

