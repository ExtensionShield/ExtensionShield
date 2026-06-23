"""
Facts Builder - Stage 2 of Governance Pipeline

Transforms security scan outputs + manifest into the canonical facts.json
structure used by governance decisioning (Stages 3-8).

The Facts Builder consolidates:
- Manifest data (permissions, host access, content scripts)
- File inventory
- Security findings from all Stage 1 analyzers
- Extension metadata

Output: facts.json - The canonical contract between security analysis
        and governance decisioning.
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional

from .schemas import (
    Facts,
    ManifestFacts,
    ContentScriptFacts,
    BackgroundFacts,
    FileInventoryItem,
    SecurityFindings,
    PermissionAnalysisFinding,
    SastFinding,
    VirusTotalFileFinding,
    EntropyFileFinding,
    ExtensionMetadata,
)


logger = logging.getLogger(__name__)


class FactsBuilder:
    """
    Builds the facts.json canonical contract from security scan outputs.
    
    This is Stage 2 of the Governance Decisioning Pipeline.
    
    Usage:
        builder = FactsBuilder(scan_id="scan_123")
        facts = builder.build(
            manifest_data=manifest_dict,
            analysis_results=analysis_dict,
            extracted_files=file_list,
            extension_id="abc123",
            metadata=metadata_dict
        )
        facts_dict = facts.model_dump()
    """
    
    # URL pattern indicators for detecting host permissions in MV2
    URL_PATTERN_INDICATORS = [
        "://", "*://", "http://", "https://", "file://", "ftp://",
        "<all_urls>", "*://*/*", "http://*/*", "https://*/*"
    ]
    
    def __init__(self, scan_id: str):
        """
        Initialize the Facts Builder.
        
        Args:
            scan_id: Unique identifier for this scan
        """
        self.scan_id = scan_id
    
    def build(
        self,
        manifest_data: Dict[str, Any],
        analysis_results: Optional[Dict[str, Any]] = None,
        extracted_files: Optional[List[str]] = None,
        extension_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        artifact_path: Optional[str] = None,
    ) -> Facts:
        """
        Build the Facts object from security scan outputs.
        
        Args:
            manifest_data: Parsed manifest.json data
            analysis_results: Results from all Stage 1 analyzers
            extracted_files: List of file paths in the extension
            extension_id: Chrome extension ID
            metadata: Extension metadata from Chrome Web Store
            artifact_path: Path to the original artifact (for hashing)
            
        Returns:
            Facts: The canonical facts object
        """
        logger.info("Building facts for scan_id=%s", self.scan_id)
        
        # Compute artifact hash if path provided
        artifact_hash = None
        if artifact_path:
            artifact_hash = self._compute_artifact_hash(artifact_path)
        
        # Build manifest facts
        manifest_facts = self._build_manifest_facts(manifest_data)
        
        # Build consolidated host access patterns (MVP critical field)
        host_access_patterns = self._extract_host_access_patterns(manifest_data)
        
        # Build file inventory
        file_inventory = self._build_file_inventory(extracted_files or [])
        
        # Build security findings
        security_findings = self._build_security_findings(analysis_results or {})
        
        # Build metadata
        ext_metadata = self._build_metadata(metadata) if metadata else None
        
        facts = Facts(
            scan_id=self.scan_id,
            extension_id=extension_id,
            artifact_hash=artifact_hash,
            created_at=datetime.now(timezone.utc),
            manifest=manifest_facts,
            host_access_patterns=host_access_patterns,
            file_inventory=file_inventory,
            security_findings=security_findings,
            metadata=ext_metadata,
        )
        
        logger.info(
            "Facts built: %d host patterns, %d files, %d permission findings",
            len(host_access_patterns),
            len(file_inventory),
            len(security_findings.permission_findings)
        )
        
        return facts
    
    def build_from_results_file(self, results_path: str) -> Facts:
        """
        Build Facts from a *_results.json file (existing scan output format).
        
        Args:
            results_path: Path to the *_results.json file
            
        Returns:
            Facts: The canonical facts object
        """
        with open(results_path, "r", encoding="utf-8") as f:
            results = json.load(f)
        
        return self.build(
            manifest_data=results.get("manifest", {}),
            analysis_results={
                "permissions_analysis": results.get("permissions_analysis"),
                "sast_results": results.get("sast_results"),
                "virustotal_analysis": results.get("virustotal_analysis"),
                "entropy_analysis": results.get("entropy_analysis"),
                "webstore_analysis": results.get("webstore_analysis"),
                "summary": results.get("summary"),
            },
            extracted_files=results.get("extracted_files", []),
            extension_id=results.get("extension_id"),
            metadata=results.get("metadata"),
        )
    
    def _compute_artifact_hash(self, artifact_path: str) -> Optional[str]:
        """Compute SHA256 hash of the artifact file."""
        try:
            path = Path(artifact_path)
            if path.exists():
                sha256_hash = hashlib.sha256()
                with open(path, "rb") as f:
                    for chunk in iter(lambda: f.read(8192), b""):
                        sha256_hash.update(chunk)
                return f"sha256:{sha256_hash.hexdigest()}"
        except Exception as e:
            logger.warning("Failed to compute artifact hash: %s", e)
        return None
    
    def _build_manifest_facts(self, manifest_data: Dict[str, Any]) -> ManifestFacts:
        """Build normalized manifest facts from parsed manifest data."""
        
        # Validate manifest version
        manifest_version = manifest_data.get("manifest_version", 2)
        if manifest_version not in (2, 3):
            logger.warning(
                "Unexpected manifest_version=%s for scan_id=%s (expected 2 or 3)",
                manifest_version, self.scan_id
            )
        
        # Parse content scripts
        content_scripts = []
        for cs in manifest_data.get("content_scripts", []):
            content_scripts.append(ContentScriptFacts(
                matches=cs.get("matches", []),
                exclude_matches=cs.get("exclude_matches", []),
                js=cs.get("js", []),
                css=cs.get("css", []),
                run_at=cs.get("run_at", "document_idle"),
                all_frames=cs.get("all_frames", False),
                match_about_blank=cs.get("match_about_blank", False),
            ))
        
        # Parse background
        background = None
        bg_data = manifest_data.get("background")
        if bg_data:
            background = BackgroundFacts(
                type=bg_data.get("type", "scripts"),
                service_worker=bg_data.get("service_worker"),
                scripts=bg_data.get("scripts", []),
                page=bg_data.get("page"),
                persistent=bg_data.get("persistent", True),
                type_module=bg_data.get("type_module", False),
            )
        
        return ManifestFacts(
            name=manifest_data.get("name", "Unknown"),
            version=manifest_data.get("version", "Unknown"),
            manifest_version=manifest_data.get("manifest_version", 2),
            description=manifest_data.get("description", ""),
            permissions=manifest_data.get("permissions", []),
            host_permissions=manifest_data.get("host_permissions", []),
            optional_permissions=manifest_data.get("optional_permissions", []),
            content_scripts=content_scripts,
            background=background,
            externally_connectable=manifest_data.get("externally_connectable"),
            web_accessible_resources=manifest_data.get("web_accessible_resources", []),
            content_security_policy=manifest_data.get("content_security_policy"),
            update_url=manifest_data.get("update_url"),
        )
    
    def _extract_host_access_patterns(self, manifest_data: Dict[str, Any]) -> List[str]:
        """
        Extract and consolidate host access patterns from all manifest sources.
        
        This is the MVP critical field that consolidates host access from:
        - manifest.host_permissions (MV3)
        - manifest.permissions (MV2 host patterns like <all_urls>, *://*/*)
        - manifest.content_scripts[].matches
        - manifest.externally_connectable.matches
        
        Rulepacks should prefer checking facts.host_access_patterns instead
        of querying multiple manifest paths.
        """
        patterns = set()
        
        try:
            # 1. host_permissions (MV3)
            host_perms = manifest_data.get("host_permissions", [])
            if isinstance(host_perms, list):
                for hp in host_perms:
                    if isinstance(hp, str):
                        patterns.add(hp)
            else:
                logger.warning("host_permissions is not a list for scan_id=%s", self.scan_id)
            
            # 2. permissions (MV2) - filter for URL patterns
            perms = manifest_data.get("permissions", [])
            if isinstance(perms, list):
                for perm in perms:
                    if isinstance(perm, str) and self._is_url_pattern(perm):
                        patterns.add(perm)
            else:
                logger.warning("permissions is not a list for scan_id=%s", self.scan_id)
            
            # 3. content_scripts[].matches
            content_scripts = manifest_data.get("content_scripts", [])
            if isinstance(content_scripts, list):
                for cs in content_scripts:
                    if isinstance(cs, dict):
                        matches = cs.get("matches", [])
                        if isinstance(matches, list):
                            for match in matches:
                                if isinstance(match, str):
                                    patterns.add(match)
            else:
                logger.warning("content_scripts is not a list for scan_id=%s", self.scan_id)
            
            # 4. externally_connectable.matches
            ext_connectable = manifest_data.get("externally_connectable")
            if isinstance(ext_connectable, dict):
                ext_matches = ext_connectable.get("matches", [])
                if isinstance(ext_matches, list):
                    for match in ext_matches:
                        if isinstance(match, str):
                            patterns.add(match)
            
        except Exception as e:
            logger.error(
                "Error extracting host access patterns for scan_id=%s: %s",
                self.scan_id, e
            )
        
        # Sort for consistent output
        return sorted(patterns)
    
    def _is_url_pattern(self, permission: str) -> bool:
        """Check if a permission string is a URL pattern."""
        if permission == "<all_urls>":
            return True
        return any(indicator in permission for indicator in self.URL_PATTERN_INDICATORS)
    
    def _build_file_inventory(self, extracted_files: List[str]) -> List[FileInventoryItem]:
        """Build file inventory from list of extracted file paths.
        
        Args:
            extracted_files: List of file paths. Can be simple paths or dicts with hash info.
        """
        inventory = []
        
        for file_entry in extracted_files:
            # Handle both string paths and dict entries with metadata
            if isinstance(file_entry, dict):
                file_path = file_entry.get("path", "")
                file_hash = file_entry.get("sha256")
                size_bytes = file_entry.get("size_bytes")
            else:
                file_path = file_entry
                file_hash = None
                size_bytes = None
            
            # Determine file type from extension
            path = Path(file_path)
            file_type = path.suffix.lstrip(".") if path.suffix else "unknown"
            
            inventory.append(FileInventoryItem(
                path=file_path,
                file_type=file_type,
                size_bytes=size_bytes,
                sha256=file_hash,  # Now properly populated from input
            ))
        
        return inventory
    
    def _build_security_findings(self, analysis_results: Dict[str, Any]) -> SecurityFindings:
        """Build consolidated security findings from all analyzer outputs.
        
        Handles two input scenarios:
        1. Workflow state: analysis_results contains "javascript_analysis" key
           (direct from ExtensionAnalyzer)
        2. Results file: analysis_results contains "sast_results" key
           (loaded from saved *_results.json via build_from_results_file)
        """
        
        findings = SecurityFindings()
        
        # Permission analysis
        perm_analysis = analysis_results.get("permissions_analysis", {})
        if perm_analysis:
            perm_details = perm_analysis.get("permissions_details", {})
            if perm_details:
                for perm_name, details in perm_details.items():
                    # Handle both dict and non-dict detail formats
                    if isinstance(details, dict):
                        findings.permission_findings.append(PermissionAnalysisFinding(
                            permission_name=perm_name,
                            is_reasonable=details.get("is_reasonable", True),
                            justification_reasoning=details.get("justification_reasoning", ""),
                        ))
            
            # Extract dangerous permissions
            findings.dangerous_permissions = [
                pf.permission_name for pf in findings.permission_findings
                if not pf.is_reasonable
            ]
        
        # SAST results - handle both workflow state and results file formats
        # Workflow state uses "javascript_analysis", results files use "sast_results"
        sast_results = (
            analysis_results.get("javascript_analysis") or 
            analysis_results.get("sast_results") or 
            {}
        )
        if sast_results:
            sast_findings_raw = sast_results.get("sast_findings", {})
            
            # Count findings by severity for risk level calculation
            severity_counts = {"CRITICAL": 0, "ERROR": 0, "HIGH": 0, "WARNING": 0, "MEDIUM": 0, "INFO": 0, "LOW": 0}
            
            for file_path, file_findings in sast_findings_raw.items():
                for finding in file_findings:
                    # Extract data from Semgrep's actual output structure:
                    # - check_id: rule identifier
                    # - start.line: line number  
                    # - extra.severity: severity level (INFO, WARNING, ERROR, etc.)
                    # - extra.message: finding description
                    # - extra.lines: code snippet
                    # - extra.metadata.category: finding category
                    extra = finding.get("extra", {})
                    start = finding.get("start", {})
                    metadata = extra.get("metadata", {})
                    
                    severity = extra.get("severity", "INFO").upper()
                    severity_counts[severity] = severity_counts.get(severity, 0) + 1
                    
                    findings.sast_findings.append(SastFinding(
                        file_path=file_path,
                        finding_type=finding.get("check_id", metadata.get("category", "unknown")),
                        severity=severity.lower(),
                        description=extra.get("message", ""),
                        line_number=start.get("line"),
                        code_snippet=extra.get("lines"),
                    ))
            
            # Calculate risk level from findings
            # First try structured field, then text parsing, then severity distribution
            findings.sast_risk_level = sast_results.get("risk_level", "")
            
            if not findings.sast_risk_level:
                # Fall back to text parsing from LLM summary
                sast_text = sast_results.get("sast_analysis") or ""
                if not isinstance(sast_text, str):
                    sast_text = str(sast_text) if sast_text else ""
                if "[RISK: HIGH]" in sast_text or "[RISK: CRITICAL]" in sast_text:
                    findings.sast_risk_level = "high"
                elif "[RISK: MEDIUM]" in sast_text:
                    findings.sast_risk_level = "medium"
                elif "[RISK: LOW]" in sast_text:
                    findings.sast_risk_level = "low"
                else:
                    # Calculate from severity distribution
                    if severity_counts.get("CRITICAL", 0) > 0 or severity_counts.get("ERROR", 0) >= 3:
                        findings.sast_risk_level = "high"
                    elif severity_counts.get("ERROR", 0) > 0 or severity_counts.get("HIGH", 0) > 0 or severity_counts.get("WARNING", 0) >= 5:
                        findings.sast_risk_level = "medium"
                    elif len(findings.sast_findings) > 0:
                        findings.sast_risk_level = "low"
                    else:
                        findings.sast_risk_level = "low"
        
        # VirusTotal results
        vt_analysis = analysis_results.get("virustotal_analysis", {})
        if vt_analysis:
            findings.virustotal_malicious_count = vt_analysis.get("total_malicious", 0)
            # Default to "unknown" (not "clean"): absent VT intelligence must not
            # be conflated with a clean result.
            findings.virustotal_threat_level = vt_analysis.get("summary", {}).get("threat_level", "unknown")
            
            for file_result in vt_analysis.get("file_results", []):
                vt_data = file_result.get("virustotal", {})
                if vt_data.get("found"):
                    detection_stats = vt_data.get("detection_stats", {})
                    # Improved: Check if file was found in VT and has actual malicious detections
                    malicious_count = detection_stats.get("malicious", 0)
                    threat_level = "malicious" if malicious_count > 0 else "suspicious" if detection_stats.get("suspicious", 0) > 0 else "clean"
                    
                    findings.virustotal_findings.append(VirusTotalFileFinding(
                        file_name=file_result.get("file_name", ""),
                        file_path=file_result.get("file_path", ""),
                        sha256=vt_data.get("sha256", ""),
                        detection_stats=detection_stats,
                        threat_level=threat_level,
                        malware_families=vt_data.get("malware_families", []),
                    ))
        
        # Entropy analysis
        entropy_analysis = analysis_results.get("entropy_analysis", {})
        if entropy_analysis:
            summary = entropy_analysis.get("summary", {})
            findings.entropy_risk_level = summary.get("overall_risk", "normal")
            findings.obfuscation_detected = summary.get("obfuscation_detected", False)
            
            for file_result in entropy_analysis.get("file_results", []):
                entropy_data = file_result.get("entropy", {})
                patterns = file_result.get("obfuscation_patterns", [])
                findings.entropy_findings.append(EntropyFileFinding(
                    file_name=file_result.get("file_name", ""),
                    file_path=file_result.get("file_path", ""),
                    byte_entropy=entropy_data.get("byte_entropy", 0.0),
                    char_entropy=entropy_data.get("char_entropy", 0.0),
                    risk_level=entropy_data.get("risk_level", "normal"),
                    is_likely_obfuscated=file_result.get("is_likely_obfuscated", False),
                    obfuscation_patterns=[p.get("pattern_name", "") for p in patterns],
                ))
        
        # WebStore analysis
        webstore_analysis = analysis_results.get("webstore_analysis", {})
        if webstore_analysis:
            analysis_text = webstore_analysis.get("webstore_analysis", "")
            findings.webstore_analysis = analysis_text
            if "high" in analysis_text.lower():
                findings.webstore_risk_level = "high"
            elif "medium" in analysis_text.lower():
                findings.webstore_risk_level = "medium"
            elif "low" in analysis_text.lower():
                findings.webstore_risk_level = "low"
            else:
                findings.webstore_risk_level = "unknown"
        
        # Overall from summary
        summary = analysis_results.get("summary", {})
        if summary:
            findings.overall_risk_level = summary.get("overall_risk_level", "medium")
            findings.overall_security_score = summary.get("overall_security_score", 0)
            findings.total_findings = len(findings.sast_findings) + len(findings.dangerous_permissions)
        
        return findings
    
    def _build_metadata(self, metadata: Dict[str, Any]) -> ExtensionMetadata:
        """Build extension metadata from Chrome Web Store data."""
        return ExtensionMetadata(
            title=metadata.get("title"),
            user_count=metadata.get("user_count"),
            rating=metadata.get("rating"),
            ratings_count=metadata.get("ratings_count"),
            last_updated=metadata.get("last_updated"),
            developer_name=metadata.get("developer_name"),
            developer_email=metadata.get("developer_email"),
            developer_website=metadata.get("developer_website"),
            category=metadata.get("category"),
            is_featured=metadata.get("is_featured", False),
            follows_best_practices=metadata.get("follows_best_practices", False),
        )
    
    def save(self, facts: Facts, output_path: str) -> None:
        """
        Save facts to a JSON file.
        
        Args:
            facts: The Facts object to save
            output_path: Path to save the facts.json file
        """
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output, "w", encoding="utf-8") as f:
            json.dump(facts.model_dump(mode="json"), f, indent=2, default=str)
        
        logger.info("Facts saved to %s", output_path)



