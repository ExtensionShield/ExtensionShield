"""
Tool Adapters - Layer 0: Signal Extraction

Adapters that normalize outputs from each analyzer into the SignalPack structure.
Each adapter transforms raw tool output into normalized signals + evidence.

Adapters:
- SastAdapter: Normalizes SAST/Semgrep findings
- VirusTotalAdapter: Normalizes VirusTotal scan results
- EntropyAdapter: Normalizes entropy/obfuscation analysis
- WebstoreStatsAdapter: Normalizes webstore metadata
- WebstoreReviewsAdapter: Normalizes webstore review analysis
- PermissionsAdapter: Normalizes permission analysis
- ChromeStatsAdapter: Normalizes Chrome Stats behavioral data

Evidence Rule:
- Every tool output becomes evidence
- evidence_id = "tool:<toolname>:<hash>"
"""

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Tuple

from .signal_pack import (
    SignalPack,
    ToolEvidence,
    SastSignalPack,
    SastFindingNormalized,
    VirusTotalSignalPack,
    VendorHit,
    EntropySignalPack,
    WebstoreStatsSignalPack,
    WebstoreReviewsSignalPack,
    PermissionsSignalPack,
    PermissionAnalysisResult,
    ChromeStatsSignalPack,
    NetworkSignalPack,
    sanitize_code_snippet,
)

logger = logging.getLogger(__name__)


# =============================================================================
# BASE ADAPTER
# =============================================================================


class BaseToolAdapter:
    """Base class for tool adapters."""
    
    TOOL_NAME: str = "unknown"
    
    def __init__(self):
        self._evidence_hashes: set = set()
    
    def _create_evidence(
        self,
        content: str,
        file_path: Optional[str] = None,
        line_start: Optional[int] = None,
        line_end: Optional[int] = None,
        snippet: Optional[str] = None,
        raw_data: Optional[Dict[str, Any]] = None,
    ) -> ToolEvidence:
        """Create an evidence item with deduplication."""
        return ToolEvidence.create(
            tool_name=self.TOOL_NAME,
            content=content,
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            snippet=snippet,
            raw_data=raw_data,
        )
    
    def _truncate_snippet(self, text: Optional[str], max_len: int = 200) -> Optional[str]:
        """Return a real, truncated code snippet or None (drops fake placeholders).

        Delegates to the shared sanitizer so fake evidence like "requires login"
        never surfaces as a user-facing code snippet or feeds a gate.
        """
        return sanitize_code_snippet(text, max_len)


# =============================================================================
# SAST ADAPTER
# =============================================================================


class SastAdapter(BaseToolAdapter):
    """
    Adapter for SAST/Semgrep analysis results.
    
    Normalizes raw Semgrep findings into SastSignalPack + evidence.
    """
    
    TOOL_NAME = "sast"
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt SAST analysis results into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            signal_pack: SignalPack to populate
        """
        js_analysis = analysis_results.get("javascript_analysis", {})
        if not js_analysis or not isinstance(js_analysis, dict):
            logger.debug("No SAST analysis results to adapt")
            return
        
        sast_findings = js_analysis.get("sast_findings", {})
        scan_error = bool(js_analysis.get("scan_error", False))
        if not sast_findings:
            # D2: a failed/incomplete Semgrep run is missing coverage, not a clean
            # result. Even with zero findings, record the error so scoring forces
            # review rather than treating the absence of findings as safe.
            if scan_error:
                signal_pack.sast = SastSignalPack(files_scanned=0, scan_error=True)
            return
        
        # Initialize counters
        counts_by_severity = {"CRITICAL": 0, "ERROR": 0, "WARNING": 0, "INFO": 0}
        deduped_findings: List[SastFindingNormalized] = []
        raw_findings: Dict[str, int] = {}
        files_with_findings = 0
        seen_findings: set = set()
        
        for file_path, findings_list in sast_findings.items():
            if not findings_list:
                continue
            
            raw_findings[file_path] = len(findings_list)
            files_with_findings += 1
            
            for finding in findings_list:
                # Extract normalized data
                check_id = finding.get("check_id", "unknown")
                extra = finding.get("extra", {})
                start = finding.get("start", {})
                metadata = extra.get("metadata", {})
                
                severity = extra.get("severity", "INFO").upper()
                message = extra.get("message", "")
                line_num = start.get("line")
                snippet = extra.get("lines", "")
                category = metadata.get("category", check_id.split(".")[-1] if "." in check_id else None)
                
                # Update severity counts
                if severity in counts_by_severity:
                    counts_by_severity[severity] += 1
                else:
                    counts_by_severity["INFO"] += 1
                
                # Deduplicate by check_id + file + line
                finding_key = f"{check_id}:{file_path}:{line_num}"
                if finding_key in seen_findings:
                    continue
                seen_findings.add(finding_key)
                
                # Create normalized finding
                normalized = SastFindingNormalized(
                    check_id=check_id,
                    file_path=file_path,
                    line_number=line_num,
                    severity=severity,
                    message=message,
                    category=category,
                    code_snippet=self._truncate_snippet(snippet, 150),
                )
                deduped_findings.append(normalized)
                
                # Create evidence for this finding
                evidence_content = f"{check_id}:{file_path}:{line_num}:{message}"
                evidence = self._create_evidence(
                    content=evidence_content,
                    file_path=file_path,
                    line_start=line_num,
                    line_end=line_num,
                    snippet=self._truncate_snippet(snippet, 200),
                    raw_data={"check_id": check_id, "severity": severity, "category": category},
                )
                signal_pack.add_evidence(evidence)
        
        # Calculate confidence based on files scanned
        # Higher confidence with more files scanned
        files_scanned = len(sast_findings)
        confidence = min(1.0, 0.5 + (files_scanned * 0.1)) if files_scanned > 0 else 0.5
        
        # Populate signal pack
        signal_pack.sast = SastSignalPack(
            raw_findings=raw_findings,
            deduped_findings=deduped_findings,
            counts_by_severity=counts_by_severity,
            confidence=confidence,
            files_scanned=files_scanned,
            files_with_findings=files_with_findings,
            scan_error=scan_error,
        )
        
        logger.info(
            "SAST adapter: %d findings from %d files (CRITICAL=%d, ERROR=%d)",
            len(deduped_findings),
            files_scanned,
            counts_by_severity["CRITICAL"],
            counts_by_severity["ERROR"],
        )


# =============================================================================
# VIRUSTOTAL ADAPTER
# =============================================================================


class VirusTotalAdapter(BaseToolAdapter):
    """
    Adapter for VirusTotal analysis results.
    
    Normalizes VT scan results into VirusTotalSignalPack + evidence.
    """
    
    TOOL_NAME = "virustotal"
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt VirusTotal analysis results into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            signal_pack: SignalPack to populate
        """
        vt_analysis = analysis_results.get("virustotal_analysis", {})
        if not vt_analysis:
            logger.debug("No VirusTotal analysis results to adapt")
            return
        
        enabled = vt_analysis.get("enabled", False)
        if not enabled:
            signal_pack.virustotal = VirusTotalSignalPack(enabled=False)
            return
        
        # Extract summary stats
        total_malicious = vt_analysis.get("total_malicious", 0)
        total_suspicious = vt_analysis.get("total_suspicious", 0)
        files_analyzed = vt_analysis.get("files_analyzed", 0)
        
        # Extract summary data
        summary = vt_analysis.get("summary", {})
        threat_level = summary.get("threat_level", "clean")
        detected_families = summary.get("detected_families", [])
        
        # Process file results for vendor hits
        vendor_hits: List[VendorHit] = []
        file_results = vt_analysis.get("file_results", [])
        
        total_engines = 0
        harmless_count = 0
        undetected_count = 0
        
        for file_result in file_results:
            vt_data = file_result.get("virustotal", {})
            if not vt_data or not vt_data.get("found"):
                continue
            
            detection_stats = vt_data.get("detection_stats", {})
            total_engines = max(total_engines, detection_stats.get("total_engines", 0))
            harmless_count += detection_stats.get("harmless", 0)
            undetected_count += detection_stats.get("undetected", 0)
            
            # Extract individual vendor hits (if available from raw data)
            file_families = vt_data.get("malware_families", [])
            for family in file_families:
                vendor_hits.append(VendorHit(
                    vendor_name="aggregated",
                    result=family,
                    category="malicious" if total_malicious > 0 else "suspicious",
                ))
            
            # Create evidence for files with detections
            if detection_stats.get("malicious", 0) > 0 or detection_stats.get("suspicious", 0) > 0:
                file_path = file_result.get("file_path", file_result.get("file_name", "unknown"))
                sha256 = vt_data.get("sha256", "unknown")
                
                evidence_content = f"{file_path}:{sha256}:{detection_stats}"
                evidence = self._create_evidence(
                    content=evidence_content,
                    file_path=file_path,
                    raw_data={
                        "sha256": sha256,
                        "malicious": detection_stats.get("malicious", 0),
                        "suspicious": detection_stats.get("suspicious", 0),
                        "families": file_families[:5],
                    },
                )
                signal_pack.add_evidence(evidence)
        
        # Calculate ratios
        ratios = {}
        if total_engines > 0:
            ratios["malicious_ratio"] = total_malicious / total_engines
            ratios["suspicious_ratio"] = total_suspicious / total_engines
        
        # Populate signal pack
        signal_pack.virustotal = VirusTotalSignalPack(
            malicious_count=total_malicious,
            suspicious_count=total_suspicious,
            harmless_count=harmless_count,
            undetected_count=undetected_count,
            total_engines=total_engines,
            vendor_hits=vendor_hits[:20],  # Limit vendor hits
            malware_families=detected_families[:10],
            ratios=ratios,
            files_analyzed=files_analyzed,
            enabled=True,
            timestamp=datetime.now(timezone.utc),
        )
        
        logger.info(
            "VirusTotal adapter: %d malicious, %d suspicious across %d files",
            total_malicious,
            total_suspicious,
            files_analyzed,
        )


# =============================================================================
# ENTROPY ADAPTER
# =============================================================================


class EntropyAdapter(BaseToolAdapter):
    """
    Adapter for entropy/obfuscation analysis results.
    
    Normalizes entropy analysis into EntropySignalPack + evidence.
    """
    
    TOOL_NAME = "entropy"
    
    # Known minified library patterns (not suspicious)
    MINIFIED_PATTERNS = [
        r"\.min\.js$",
        r"jquery",
        r"react",
        r"angular",
        r"vue",
        r"bootstrap",
        r"lodash",
        r"moment",
        r"axios",
    ]
    
    def _is_likely_minified_library(self, file_path: str) -> bool:
        """Check if file is likely a minified library (not suspicious)."""
        file_lower = file_path.lower()
        for pattern in self.MINIFIED_PATTERNS:
            if re.search(pattern, file_lower):
                return True
        return False
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt entropy analysis results into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            signal_pack: SignalPack to populate
        """
        entropy_analysis = analysis_results.get("entropy_analysis", {})
        if not entropy_analysis:
            logger.debug("No entropy analysis results to adapt")
            return
        
        # Extract file results
        file_results = entropy_analysis.get("file_results", [])
        files_analyzed = entropy_analysis.get("files_analyzed", 0)
        obfuscated_count = entropy_analysis.get("obfuscated_files", 0)
        suspicious_count = entropy_analysis.get("suspicious_files", 0)
        
        # Extract summary
        summary = entropy_analysis.get("summary", {})
        overall_risk = summary.get("overall_risk", "normal")
        pattern_summary = summary.get("pattern_summary", {})
        
        # Process file results
        file_entropy_map: Dict[str, Dict[str, float]] = {}
        suspected_obfuscation_files: List[str] = []
        minified_files: List[str] = []
        high_risk_patterns: Dict[str, int] = {}
        
        for file_result in file_results:
            file_path = file_result.get("file_path", "")
            entropy_data = file_result.get("entropy", {})
            
            byte_entropy = entropy_data.get("byte_entropy", 0.0)
            char_entropy = entropy_data.get("char_entropy", 0.0)
            
            file_entropy_map[file_path] = {
                "byte_entropy": byte_entropy,
                "char_entropy": char_entropy,
            }
            
            risk_level = file_result.get("overall_risk", "normal")
            is_obfuscated = file_result.get("is_likely_obfuscated", False)
            
            # Categorize file
            if is_obfuscated or risk_level == "high":
                if self._is_likely_minified_library(file_path):
                    minified_files.append(file_path)
                else:
                    suspected_obfuscation_files.append(file_path)
                    
                    # Create evidence for suspected obfuscation
                    patterns = file_result.get("obfuscation_patterns", [])
                    evidence_content = f"{file_path}:{byte_entropy}:{patterns}"
                    evidence = self._create_evidence(
                        content=evidence_content,
                        file_path=file_path,
                        raw_data={
                            "byte_entropy": byte_entropy,
                            "char_entropy": char_entropy,
                            "patterns": [p.get("pattern_name") for p in patterns][:5],
                            "risk_level": risk_level,
                        },
                    )
                    signal_pack.add_evidence(evidence)
            elif self._is_likely_minified_library(file_path):
                minified_files.append(file_path)
            
            # Count patterns
            for pattern in file_result.get("obfuscation_patterns", []):
                pattern_name = pattern.get("pattern_name", "unknown")
                if pattern.get("risk") == "high":
                    high_risk_patterns[pattern_name] = high_risk_patterns.get(pattern_name, 0) + 1
        
        # Get thresholds from summary or use defaults
        thresholds = {
            "normal_max": 5.5,
            "suspicious_min": 6.5,
            "high_risk_min": 7.5,
        }
        
        # Populate signal pack
        signal_pack.entropy = EntropySignalPack(
            file_entropy_map=file_entropy_map,
            suspected_obfuscation_files=suspected_obfuscation_files,
            minified_files=minified_files,
            high_risk_patterns=high_risk_patterns,
            thresholds_used=thresholds,
            files_analyzed=files_analyzed,
            obfuscated_count=len(suspected_obfuscation_files),
            suspicious_count=suspicious_count,
            overall_risk=overall_risk,
        )
        
        logger.info(
            "Entropy adapter: %d files analyzed, %d suspected obfuscation, %d minified",
            files_analyzed,
            len(suspected_obfuscation_files),
            len(minified_files),
        )


# =============================================================================
# WEBSTORE STATS ADAPTER
# =============================================================================


class WebstoreStatsAdapter(BaseToolAdapter):
    """
    Adapter for webstore metadata/stats.
    
    Normalizes extension metadata into WebstoreStatsSignalPack + evidence.
    """
    
    TOOL_NAME = "webstore_stats"
    
    def adapt(
        self,
        metadata: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt webstore metadata into signal pack.
        
        Args:
            metadata: Extension metadata from workflow
            signal_pack: SignalPack to populate
        """
        if not metadata:
            logger.debug("No webstore metadata to adapt")
            return
        
        # Parse user count. The webstore metadata key is `user_count` (not
        # `users`); reading the wrong key made `installs` default to 0 for EVERY
        # extension, so a 300k-user wallet looked like 0 installs — falsely
        # tripping the "very few users" penalty and depressing confidence. Read
        # the correct key, with `users` kept only as a legacy fallback.
        users = metadata.get("user_count")
        if users in (None, ""):
            users = metadata.get("users")
        installs = None
        if users not in (None, ""):
            try:
                # Handle formats like "1,000,000+" or "10000"
                users_clean = str(users).replace(",", "").replace("+", "")
                installs = int(users_clean)
            except (ValueError, TypeError):
                pass
        
        # Parse rating
        rating_avg = None
        rating_raw = metadata.get("rating")
        if rating_raw:
            try:
                rating_avg = float(rating_raw)
            except (ValueError, TypeError):
                pass
        
        # Build developer profile
        developer_profile = {
            "name": metadata.get("developer_name"),
            "email": metadata.get("developer_email"),
            "website": metadata.get("developer_website"),
            "verified": metadata.get("developer_verified", False),
        }
        
        # Populate signal pack
        signal_pack.webstore_stats = WebstoreStatsSignalPack(
            installs=installs,
            rating_avg=rating_avg,
            rating_count=metadata.get("ratings_count"),
            last_updated=metadata.get("last_updated"),
            developer=metadata.get("developer_name"),
            developer_email=metadata.get("developer_email"),
            developer_website=metadata.get("developer_website"),
            developer_profile=developer_profile,
            category=metadata.get("category"),
            is_featured=metadata.get("is_featured", False),
            follows_best_practices=metadata.get("follows_best_practices", False),
            has_privacy_policy=bool(metadata.get("privacy_policy")),
        )
        
        # Create evidence for notable stats
        evidence_parts = []
        if installs is not None and installs < 1000:
            evidence_parts.append(f"low_installs:{installs}")
        if rating_avg is not None and rating_avg < 3.5:
            evidence_parts.append(f"low_rating:{rating_avg}")
        if not metadata.get("privacy_policy"):
            evidence_parts.append("no_privacy_policy")
        
        if evidence_parts:
            evidence = self._create_evidence(
                content=":".join(evidence_parts),
                raw_data={
                    "installs": installs,
                    "rating_avg": rating_avg,
                    "has_privacy_policy": bool(metadata.get("privacy_policy")),
                },
            )
            signal_pack.add_evidence(evidence)
        
        logger.info(
            "Webstore stats adapter: installs=%s, rating=%s",
            installs,
            rating_avg,
        )


# =============================================================================
# WEBSTORE REVIEWS ADAPTER
# =============================================================================


class WebstoreReviewsAdapter(BaseToolAdapter):
    """
    Adapter for webstore review analysis.
    
    Normalizes review analysis into WebstoreReviewsSignalPack + evidence.
    Currently a placeholder as review analysis may not be implemented.
    """
    
    TOOL_NAME = "webstore_reviews"
    
    # Keywords that indicate security concerns
    SECURITY_KEYWORDS = [
        "malware", "virus", "spam", "hack", "steal", "data", "privacy",
        "tracking", "suspicious", "phishing", "scam", "fake", "adware",
        "spyware", "dangerous", "unsafe", "broken", "crashed",
    ]
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        metadata: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt webstore review analysis into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            metadata: Extension metadata
            signal_pack: SignalPack to populate
        """
        # Currently, reviews aren't directly analyzed in the pipeline
        # This adapter provides the structure for future implementation
        
        webstore_analysis = analysis_results.get("webstore_analysis", {})
        
        # If we have webstore analysis text, scan for security keywords
        keyword_hits: Dict[str, int] = {}
        manipulation_flags: List[str] = []
        
        if isinstance(webstore_analysis, dict):
            analysis_text = webstore_analysis.get("webstore_analysis", "")
            if analysis_text:
                analysis_lower = analysis_text.lower()
                for keyword in self.SECURITY_KEYWORDS:
                    count = analysis_lower.count(keyword)
                    if count > 0:
                        keyword_hits[keyword] = count
        
        # Check for manipulation indicators
        stats = signal_pack.webstore_stats
        if stats.installs and stats.rating_count:
            review_ratio = stats.rating_count / stats.installs
            if review_ratio < 0.001:  # Less than 0.1% review rate
                manipulation_flags.append("extremely_low_review_ratio")
        
        # Populate signal pack
        signal_pack.webstore_reviews = WebstoreReviewsSignalPack(
            sampled_reviews=[],  # No direct review access currently
            complaint_clusters=[],
            keyword_hits=keyword_hits,
            time_trend={},
            manipulation_flags=manipulation_flags,
            total_reviews_sampled=0,
            negative_review_ratio=0.0,
        )
        
        # Create evidence for keyword hits
        if keyword_hits:
            evidence = self._create_evidence(
                content=f"keyword_hits:{keyword_hits}",
                raw_data={"keyword_hits": keyword_hits},
            )
            signal_pack.add_evidence(evidence)
        
        logger.debug("Webstore reviews adapter: %d keyword hits", len(keyword_hits))


# =============================================================================
# PERMISSIONS ADAPTER
# =============================================================================


class PermissionsAdapter(BaseToolAdapter):
    """
    Adapter for permission analysis results.
    
    Normalizes permission analysis into PermissionsSignalPack + evidence.
    """
    
    TOOL_NAME = "permissions"
    
    # Broad host patterns
    BROAD_HOST_PATTERNS = ["<all_urls>", "*://*/*", "http://*/*", "https://*/*"]
    
    # High-risk permissions
    HIGH_RISK_PERMISSIONS = {
        "debugger", "webRequest", "webRequestBlocking", "cookies",
        "clipboardRead", "nativeMessaging", "proxy", "management",
        "desktopCapture", "tabCapture", "browsingData", "history",
    }
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        manifest: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt permission analysis into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            manifest: Extension manifest
            signal_pack: SignalPack to populate
        """
        perm_analysis = analysis_results.get("permissions_analysis", {})
        
        # Extract permissions from manifest
        api_permissions = manifest.get("permissions", [])
        host_permissions = manifest.get("host_permissions", [])
        optional_permissions = manifest.get("optional_permissions", [])
        
        # Check for broad host patterns in MV2 permissions
        all_perms = api_permissions + host_permissions
        broad_patterns = [p for p in all_perms if p in self.BROAD_HOST_PATTERNS]
        
        # Check for high-risk permissions
        high_risk = [p for p in api_permissions if p in self.HIGH_RISK_PERMISSIONS]
        
        # Process permission details
        permission_analysis: List[PermissionAnalysisResult] = []
        unreasonable_permissions: List[str] = []
        
        perm_details = perm_analysis.get("permissions_details", {})
        if isinstance(perm_details, dict):
            for perm_name, perm_info in perm_details.items():
                # D4: no fail-open default. Missing/unavailable -> None (unknown),
                # never True (which would read as verified-reasonable).
                is_reasonable = perm_info.get("is_reasonable", None)
                risk_level = perm_info.get("risk_level", "low")
                justification = perm_info.get("justification_reasoning", "")
                
                result = PermissionAnalysisResult(
                    permission_name=perm_name,
                    risk_level=risk_level,
                    is_reasonable=is_reasonable,
                    justification=justification[:200] if justification else "",
                    category=perm_info.get("category", "other"),
                )
                permission_analysis.append(result)

                # D4: only CONFIRMED-unreasonable (False) counts; None is
                # "unavailable" and must not inflate the unreasonable-permission
                # count that drives signals/penalties.
                if is_reasonable is False:
                    unreasonable_permissions.append(perm_name)
                    
                    # Create evidence for unreasonable permission
                    evidence = self._create_evidence(
                        content=f"{perm_name}:{risk_level}:{is_reasonable}",
                        file_path="manifest.json",
                        snippet=f'"{perm_name}"',
                        raw_data={
                            "permission": perm_name,
                            "risk_level": risk_level,
                            "justification": justification[:100] if justification else "",
                        },
                    )
                    signal_pack.add_evidence(evidence)
        
        # Populate signal pack
        signal_pack.permissions = PermissionsSignalPack(
            api_permissions=api_permissions,
            host_permissions=host_permissions,
            optional_permissions=optional_permissions,
            permission_analysis=permission_analysis,
            unreasonable_permissions=unreasonable_permissions,
            high_risk_permissions=high_risk,
            has_broad_host_access=len(broad_patterns) > 0,
            broad_host_patterns=broad_patterns,
            total_permissions=len(api_permissions) + len(host_permissions),
        )
        
        logger.info(
            "Permissions adapter: %d total, %d unreasonable, %d high-risk",
            len(api_permissions) + len(host_permissions),
            len(unreasonable_permissions),
            len(high_risk),
        )


# =============================================================================
# CHROMESTATS ADAPTER
# =============================================================================


class ChromeStatsAdapter(BaseToolAdapter):
    """
    Adapter for Chrome Stats behavioral analysis.
    
    Normalizes Chrome Stats output into ChromeStatsSignalPack + evidence.
    """
    
    TOOL_NAME = "chromestats"
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt Chrome Stats analysis into signal pack.
        
        Args:
            analysis_results: Full analysis_results dict from workflow
            signal_pack: SignalPack to populate
        """
        chromestats = analysis_results.get("chromestats_analysis", {})
        if not chromestats:
            logger.debug("No Chrome Stats analysis to adapt")
            return
        
        enabled = chromestats.get("enabled", False)
        if not enabled:
            signal_pack.chromestats = ChromeStatsSignalPack(enabled=False)
            return
        
        risk_indicators = chromestats.get("risk_indicators", [])
        total_risk_score = chromestats.get("total_risk_score", 0)
        overall_risk = chromestats.get("overall_risk_level", "low")
        
        # Extract trend data
        install_trends = chromestats.get("install_trends", {})
        rating_patterns = chromestats.get("rating_patterns", {})
        developer_reputation = chromestats.get("developer_reputation", {})
        
        # Populate signal pack
        signal_pack.chromestats = ChromeStatsSignalPack(
            enabled=True,
            risk_indicators=risk_indicators,
            total_risk_score=total_risk_score,
            overall_risk_level=overall_risk,
            install_trends=install_trends,
            rating_patterns=rating_patterns,
            developer_reputation=developer_reputation,
        )
        
        # Create evidence for high-risk indicators
        if overall_risk in ["high", "critical"] or total_risk_score > 15:
            evidence = self._create_evidence(
                content=f"chromestats:{overall_risk}:{total_risk_score}",
                raw_data={
                    "overall_risk": overall_risk,
                    "total_risk_score": total_risk_score,
                    "top_indicators": risk_indicators[:5],
                },
            )
            signal_pack.add_evidence(evidence)
        
        logger.info(
            "ChromeStats adapter: risk=%s, score=%d, indicators=%d",
            overall_risk,
            total_risk_score,
            len(risk_indicators),
        )


# =============================================================================
# NETWORK ADAPTER
# =============================================================================


class NetworkAdapter(BaseToolAdapter):
    """
    Adapter for network behavior analysis results.
    
    Normalizes network analysis payloads into NetworkSignalPack + evidence.
    Only populates from real data - does NOT derive domains from SAST.
    
    Checks these keys in analysis_results:
    - network_analysis
    - network_behavior
    - third_party_api_analysis
    - urls_analysis
    """
    
    TOOL_NAME = "network"
    
    # Keys to check for network data
    NETWORK_KEYS = [
        "network_analysis",
        "network_behavior",
        "third_party_api_analysis",
        "urls_analysis",
    ]
    
    def adapt(
        self,
        analysis_results: Dict[str, Any],
        signal_pack: SignalPack,
    ) -> None:
        """
        Adapt network analysis results into NetworkSignalPack.
        
        Args:
            analysis_results: Analysis results dict
            signal_pack: SignalPack to populate
        """
        # Find first available network payload
        payload = None
        payload_key = None
        
        for key in self.NETWORK_KEYS:
            if key in analysis_results and analysis_results[key]:
                payload = analysis_results[key]
                payload_key = key
                break
        
        # No network data available - set disabled default
        if payload is None:
            signal_pack.network = NetworkSignalPack(
                enabled=False,
                confidence=0.0,
            )
            logger.debug("Network adapter: no network payload found, disabled")
            return
        
        # Handle payload being a dict or list
        if isinstance(payload, list):
            # If list of domains/urls, wrap in dict
            payload = {"domains": payload}
        
        if not isinstance(payload, dict):
            signal_pack.network = NetworkSignalPack(
                enabled=False,
                confidence=0.0,
            )
            logger.warning("Network adapter: payload is not dict or list, disabled")
            return
        
        # Extract domains safely
        raw_domains = payload.get("domains", [])
        if not isinstance(raw_domains, list):
            raw_domains = []
        
        # Normalize domains (strip scheme/path/port to hostname only)
        domains = []
        for domain in raw_domains:
            if not isinstance(domain, str) or not domain.strip():
                continue
            normalized = self._normalize_domain(domain)
            if normalized:
                domains.append(normalized)
        
        # Dedupe domains
        domains = list(dict.fromkeys(domains))[:100]  # Cap at 100
        
        # Determine if enabled
        enabled = payload.get("enabled", bool(domains))
        
        # Extract external request count
        external_request_count = payload.get("external_request_count", 0)
        if not isinstance(external_request_count, int):
            external_request_count = 0
        
        # Extract runtime URL construction flag
        has_runtime_url = payload.get("has_runtime_url_construction", False)
        if not isinstance(has_runtime_url, bool):
            has_runtime_url = bool(has_runtime_url)
        
        # Build suspicious flags with defaults
        default_flags = {
            "http_unencrypted": False,
            "base64_encoded_urls": False,
            "high_entropy_payload": False,
            "dynamic_url_construction": False,
            "credential_exfil_pattern": False,
            "data_harvest_pattern": False,
        }
        
        raw_flags = payload.get("suspicious_flags", {})
        if isinstance(raw_flags, dict):
            for key, default in default_flags.items():
                if key in raw_flags:
                    default_flags[key] = bool(raw_flags[key])
        
        # Extract data sending patterns
        data_patterns = payload.get("data_sending_patterns", [])
        if not isinstance(data_patterns, list):
            data_patterns = []
        data_patterns = [p for p in data_patterns if isinstance(p, str)][:20]
        
        # Determine confidence
        confidence = payload.get("confidence", 0.7 if enabled else 0.0)
        if not isinstance(confidence, (int, float)):
            confidence = 0.7 if enabled else 0.0
        confidence = max(0.0, min(1.0, float(confidence)))
        
        # Populate signal pack
        signal_pack.network = NetworkSignalPack(
            enabled=enabled,
            domains=domains,
            has_runtime_url_construction=has_runtime_url,
            suspicious_flags=default_flags,
            external_request_count=external_request_count,
            data_sending_patterns=data_patterns,
            confidence=confidence,
        )
        
        # Create evidence if domains or suspicious patterns found
        if domains or any(default_flags.values()):
            evidence = self._create_evidence(
                content=f"network:{payload_key}:{len(domains)}_domains",
                snippet=f"Domains: {', '.join(domains[:5])}{'...' if len(domains) > 5 else ''}",
                raw_data={
                    "source_key": payload_key,
                    "domains": domains[:10],
                    "suspicious_flags": default_flags,
                    "domain_count": len(domains),
                },
            )
            signal_pack.add_evidence(evidence)
        
        logger.info(
            "Network adapter: enabled=%s, domains=%d, confidence=%.2f, source=%s",
            enabled,
            len(domains),
            confidence,
            payload_key,
        )
    
    def _normalize_domain(self, raw: str) -> Optional[str]:
        """
        Normalize a URL/domain string to just the hostname.
        
        Handles:
        - https://example.com/path -> example.com
        - http://example.com:8080/path -> example.com
        - example.com -> example.com
        - //example.com/path -> example.com
        
        Returns None for invalid inputs.
        """
        raw = raw.strip()
        if not raw:
            return None
        
        try:
            # Remove scheme if present
            if "://" in raw:
                raw = raw.split("://", 1)[1]
            elif raw.startswith("//"):
                raw = raw[2:]
            
            # Remove path if present
            if "/" in raw:
                raw = raw.split("/", 1)[0]
            
            # Remove port if present
            if ":" in raw:
                raw = raw.split(":", 1)[0]
            
            # Basic validation: must have at least one dot for a domain
            # Allow localhost and IP addresses too
            hostname = raw.lower().strip()
            
            if not hostname:
                return None
            
            # Very basic hostname validation
            if not re.match(r'^[a-z0-9][a-z0-9\-\.]*[a-z0-9]$', hostname) and hostname != "localhost":
                # Could be an IP address
                if not re.match(r'^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$', hostname):
                    return None
            
            return hostname
            
        except Exception:
            return None


# =============================================================================
# SIGNAL PACK BUILDER
# =============================================================================


class SignalPackBuilder:
    """
    Builds a complete SignalPack from workflow state.
    
    Orchestrates all tool adapters to create a unified signal pack
    with all evidence collected.
    """
    
    def __init__(self):
        self.sast_adapter = SastAdapter()
        self.virustotal_adapter = VirusTotalAdapter()
        self.entropy_adapter = EntropyAdapter()
        self.webstore_stats_adapter = WebstoreStatsAdapter()
        self.webstore_reviews_adapter = WebstoreReviewsAdapter()
        self.permissions_adapter = PermissionsAdapter()
        self.chromestats_adapter = ChromeStatsAdapter()
        self.network_adapter = NetworkAdapter()
    
    def build(
        self,
        scan_id: str,
        analysis_results: Dict[str, Any],
        metadata: Optional[Dict[str, Any]] = None,
        manifest: Optional[Dict[str, Any]] = None,
        extension_id: Optional[str] = None,
    ) -> SignalPack:
        """
        Build a complete SignalPack from analysis results.
        
        Args:
            scan_id: Unique scan identifier
            analysis_results: Full analysis_results from workflow
            metadata: Extension metadata
            manifest: Extension manifest
            extension_id: Chrome extension ID
            
        Returns:
            Complete SignalPack with all signals and evidence
        """
        logger.info("Building signal pack for scan_id=%s", scan_id)
        
        # Initialize signal pack
        signal_pack = SignalPack(
            scan_id=scan_id,
            extension_id=extension_id,
        )
        
        # Ensure we have dict inputs
        analysis_results = analysis_results or {}
        metadata = metadata or {}
        manifest = manifest or {}
        
        # Run all adapters
        self.sast_adapter.adapt(analysis_results, signal_pack)
        self.virustotal_adapter.adapt(analysis_results, signal_pack)
        self.entropy_adapter.adapt(analysis_results, signal_pack)
        self.webstore_stats_adapter.adapt(metadata, signal_pack)
        self.webstore_reviews_adapter.adapt(analysis_results, metadata, signal_pack)
        self.permissions_adapter.adapt(analysis_results, manifest, signal_pack)
        self.chromestats_adapter.adapt(analysis_results, signal_pack)
        self.network_adapter.adapt(analysis_results, signal_pack)
        
        logger.info(
            "Signal pack built: %d evidence items collected",
            len(signal_pack.evidence),
        )
        
        return signal_pack
    
    def build_from_workflow_state(
        self,
        state: Dict[str, Any],
    ) -> SignalPack:
        """
        Build SignalPack from a workflow state dictionary.
        
        Args:
            state: WorkflowState dictionary
            
        Returns:
            Complete SignalPack
        """
        return self.build(
            scan_id=state.get("workflow_id", "unknown"),
            analysis_results=state.get("analysis_results", {}),
            metadata=state.get("extension_metadata", {}),
            manifest=state.get("manifest_data", {}),
            extension_id=state.get("extension_id"),
        )

