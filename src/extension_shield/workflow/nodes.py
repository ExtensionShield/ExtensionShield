"""
Workflow Node Implementations

This module contains the node functions for the extension analysis workflow.
"""

import logging
from datetime import datetime
from langgraph.graph import END
from langgraph.types import Command
from extension_shield.workflow.state import WorkflowState, WorkflowStatus
from extension_shield.core.extension_metadata import ExtensionMetadata
from extension_shield.core.extension_downloader import ExtensionDownloader
from extension_shield.core.manifest_parser import ManifestParser
from extension_shield.core.extension_analyzer import ExtensionAnalyzer
from extension_shield.core.summary_generator import SummaryGenerator
from extension_shield.core.impact_analyzer import ImpactAnalyzer
from extension_shield.core.privacy_compliance_analyzer import PrivacyComplianceAnalyzer
from extension_shield.utils.extension import (
    extract_extension_crx,
    resolve_extension_root,
    cleanup_downloaded_crx,
    is_chrome_extension_store_url,
    is_local_extension_crx_file,
    is_chrome_extension_id,
)
from extension_shield.core.chromestats_downloader import ChromeStatsDownloader
from extension_shield.workflow.node_types import (
    EXTENSION_METADATA_NODE,
    EXTENSION_DOWNLOADER_NODE,
    MANIFEST_PARSER_NODE,
    EXTENSION_ANALYZER_NODE,
    SUMMARY_GENERATION_NODE,
    IMPACT_ANALYSIS_NODE,
    PRIVACY_COMPLIANCE_NODE,
    GOVERNANCE_NODE,
    CLEANUP_NODE,
)


logger = logging.getLogger(__name__)


def extension_path_routing_node(state: WorkflowState) -> Command:
    """Node that routes to the appropriate next node based on Chrome extension path."""
    chrome_extension_path = state.get("chrome_extension_path")
    if not chrome_extension_path:
        raise ValueError("No Chrome extension path provided in the workflow state.")

    # Check if it's an extension ID (32-character string)
    if is_chrome_extension_id(chrome_extension_path):
        logger.info("Detected Chrome extension ID: %s", chrome_extension_path)
        return Command(goto="chromestats_downloader_node")

    # Check if it's a Chrome Web Store URL
    if is_chrome_extension_store_url(chrome_extension_path):
        return Command(goto=EXTENSION_METADATA_NODE)

    # Check if it's a local CRX/ZIP file
    if is_local_extension_crx_file(chrome_extension_path):
        return Command(goto=EXTENSION_DOWNLOADER_NODE)

    return Command(
        goto=END,
        update={
            "status": WorkflowStatus.FAILED.value,
            "error": "Invalid input: not a Chrome Web Store URL, extension ID, or local CRX file.",
        },
    )


def extension_metadata_node(state: WorkflowState) -> Command:
    """
    Node that performs the Chrome extension metadata extraction operation.

    Args:
        state (PipelineState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    chrome_extension_url = state.get("chrome_extension_path")
    if not chrome_extension_url:
        raise ValueError("No Chrome extension path provided in the workflow state.")

    metadata = None

    try:
        logger.info("Extracting metadata for extension URL: %s", chrome_extension_url)
        metadata_extractor = ExtensionMetadata(extension_url=chrome_extension_url)
        metadata = metadata_extractor.fetch_metadata()
        
        # Also fetch chrome-stats metadata if we have an extension ID
        if metadata and metadata.get("extension_id"):
            try:
                logger.info("Fetching chrome-stats metadata for extension ID: %s", metadata["extension_id"])
                chromestats = ChromeStatsDownloader()
                chromestats_details = chromestats._get_extension_details(metadata["extension_id"])
                
                if chromestats_details:
                    # Add chrome_stats field to metadata
                    metadata["chrome_stats"] = chromestats_details
                    logger.info("Successfully fetched chrome-stats metadata")
                else:
                    logger.warning("No chrome-stats metadata available for extension ID: %s", metadata["extension_id"])
            except Exception as chromestats_exc:
                logger.warning("Failed to fetch chrome-stats metadata: %s", chromestats_exc)
                # Don't fail the whole workflow if chrome-stats fetch fails
                
    except Exception as exc:
        logger.exception("Extension metadata extraction failed: %s", str(exc))

    return Command(
        goto=EXTENSION_DOWNLOADER_NODE,
        update={
            "extension_metadata": metadata,
        },
    )


def chromestats_downloader_node(state: WorkflowState) -> Command:
    """
    Node that downloads extension from chrome-stats.com using extension ID.
    
    Args:
        state (WorkflowState): The current state of the workflow.
        
    Returns:
        Command: A command indicating the next step in the workflow.
    """
    chrome_extension_path = state.get("chrome_extension_path")
    if not chrome_extension_path:
        raise ValueError("No Chrome extension ID provided in the workflow state.")
    
    extension_id = chrome_extension_path.strip().lower()
    downloaded_crx_path = None
    extension_dir = None
    metadata = None
    
    try:
        logger.info("Downloading extension from chrome-stats.com: %s", extension_id)
        downloader = ChromeStatsDownloader()
        
        # Download extension (as ZIP for easier extraction)
        file_path, metadata = downloader.download_extension(
            extension_id=extension_id,
            file_format="ZIP"
        )
        
        if not file_path or not metadata:
            raise RuntimeError("Failed to download extension from chrome-stats.com")
        
        logger.info("Successfully downloaded extension: %s", file_path)
        downloaded_crx_path = file_path
        
        # Extract the downloaded file
        extension_dir = extract_extension_crx(file_path)
        if not extension_dir:
            raise RuntimeError("Failed to extract downloaded extension")
        
        logger.info("Successfully extracted extension to: %s", extension_dir)
        
    except Exception as exc:
        logger.exception("Chrome Stats download/extract failed")
        return Command(
            goto=CLEANUP_NODE,
            update={
                "extension_dir": extension_dir,
                "downloaded_crx_path": downloaded_crx_path,
                "extension_metadata": metadata if metadata else None,
                "status": WorkflowStatus.FAILED.value,
                "error": str(exc),
            },
        )
    
    return Command(
        goto=MANIFEST_PARSER_NODE,
        update={
            "extension_dir": extension_dir,
            "downloaded_crx_path": downloaded_crx_path,
            "extension_metadata": metadata,
        },
    )


def _try_chromestats_fallback(extension_id: str):
    """
    Fallback: download extension when primary download fails.
    Returns (file_path, metadata) or (None, None).
    """
    try:
        downloader = ChromeStatsDownloader()
        if not downloader.enabled:
            logger.warning("Fallback download unavailable (CHROMESTATS_API_KEY not set)")
            return None, None
        logger.info("Attempting fallback download for %s", extension_id)
        file_path, metadata = downloader.download_extension(
            extension_id=extension_id, file_format="ZIP"
        )
        if file_path:
            logger.info("Fallback download succeeded: %s", file_path)
        return file_path, metadata
    except Exception as fallback_exc:
        logger.warning("Fallback download failed: %s", fallback_exc)
        return None, None


def extension_downloader_node(state: WorkflowState) -> Command:
    """
    Node that performs the Chrome extension downloading or extraction operation.
    Falls back to alternate download when primary download fails (e.g. on cloud servers).

    Args:
        state (PipelineState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    chrome_extension_path = state.get("chrome_extension_path")
    if not chrome_extension_path:
        raise ValueError("No Chrome extension path provided in the workflow state.")

    downloaded_crx_path = None  # Track downloaded files for cleanup
    metadata_update = {}

    try:
        if is_local_extension_crx_file(chrome_extension_path):
            logger.info("Processing local extension file: %s", chrome_extension_path)
            extension_dir = extract_extension_crx(chrome_extension_path)
            if not extension_dir:
                raise RuntimeError("Failed to extract extension file.")
        else:
            # Try Google CRX download first
            downloader = ExtensionDownloader()
            extension_info = downloader.download_extension(extension_url=chrome_extension_path)

            if not extension_info or "file_path" not in extension_info:
                # Primary download failed — try fallback
                from extension_shield.utils.extension import extract_extension_id_by_url
                ext_id = extract_extension_id_by_url(chrome_extension_path)
                if ext_id:
                    logger.warning(
                        "Primary download failed for %s, trying fallback", ext_id
                    )
                    fallback_path, fallback_meta = _try_chromestats_fallback(ext_id)
                    if fallback_path:
                        downloaded_crx_path = fallback_path
                        extension_dir = extract_extension_crx(fallback_path)
                        if not extension_dir:
                            raise RuntimeError("Failed to extract extension package.")
                        # Only set metadata if not already populated by extension_metadata_node
                        existing_meta = state.get("extension_metadata")
                        if fallback_meta and not existing_meta:
                            metadata_update["extension_metadata"] = fallback_meta
                        elif fallback_meta and existing_meta:
                            # Merge: keep existing Web Store metadata, add fallback extras
                            merged = dict(existing_meta)
                            merged["chrome_stats"] = fallback_meta
                            metadata_update["extension_metadata"] = merged
                    else:
                        raise RuntimeError(
                            "Extension download returned no file. "
                            "All download sources failed."
                        )
                else:
                    raise RuntimeError("Extension download returned no file.")
            else:
                downloaded_crx_path = extension_info["file_path"]
                extension_dir = extract_extension_crx(downloaded_crx_path)
                if not extension_dir:
                    raise RuntimeError("Failed to extract extension file.")

    except Exception as exc:
        logger.exception("Extension download/extract failed")
        return Command(
            goto=CLEANUP_NODE,
            update={
                "extension_dir": extension_dir if "extension_dir" in locals() else None,
                "downloaded_crx_path": downloaded_crx_path,
                "status": WorkflowStatus.FAILED.value,
                "error": str(exc),
            },
        )

    update = {
        "extension_dir": extension_dir,
        "downloaded_crx_path": downloaded_crx_path,
    }
    update.update(metadata_update)

    return Command(
        goto=MANIFEST_PARSER_NODE,
        update=update,
    )


def manifest_parser_node(state: WorkflowState) -> Command:
    """
    Node that performs the manifest parsing operation.

    Args:
        state (PipelineState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    extension_dir = state.get("extension_dir")
    if not extension_dir:
        raise ValueError("No extension directory provided in the workflow state.")

    # Resolve to the dir that actually contains manifest.json (handles zips with
    # a top-level folder, e.g. when zipping from Chrome's Extensions folder).
    resolved = resolve_extension_root(extension_dir)
    if resolved:
        extension_dir = resolved

    try:
        logger.info("Parsing manifest in extension directory: %s", extension_dir)
        manifest_parser = ManifestParser(extension_dir=extension_dir)
        manifest_data = manifest_parser.parse()
        if not manifest_data:
            raise RuntimeError("Manifest parsing returned no data.")

    except Exception as exc:
        logger.exception("Manifest parsing failed")
        return Command(
            goto=CLEANUP_NODE,
            update={
                "status": WorkflowStatus.FAILED.value,
                "error": str(exc),
            },
        )

    return Command(
        goto=EXTENSION_ANALYZER_NODE,
        update={"manifest_data": manifest_data, "extension_dir": extension_dir},
    )


def extension_analyzer_node(state: WorkflowState) -> Command:
    """
    Node that performs the Chrome extension analysis operation.

    Args:
        state (PipelineState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    extension_dir = state.get("extension_dir")
    if not extension_dir:
        raise ValueError("No extension directory provided in the workflow state.")

    manifest = state.get("manifest_data")
    metadata = state.get("extension_metadata")

    # Ensure the extension id reaches the analyzers (ChromeStats requires it and
    # otherwise logs "Extension ID not provided" even for Web Store scans). The
    # id is known from the scan context/state; carry it into metadata.
    state_extension_id = state.get("extension_id")
    if state_extension_id:
        metadata = dict(metadata or {})
        metadata.setdefault("extension_id", state_extension_id)

    try:
        logger.info("Analyzing extension directory: %s", extension_dir)
        analyzer = ExtensionAnalyzer(
            extension_dir=extension_dir, manifest=manifest, metadata=metadata
        )
        analysis_results = analyzer.analyze()

    except Exception as exc:
        error_str = str(exc).lower()
        # Check if this is a rate limit error - continue with empty results instead of failing
        if "429" in str(exc) or "rate_limit" in error_str or "rate limit" in error_str:
            logger.warning("Extension analysis hit rate limit, continuing with partial results: %s", exc)
            analysis_results = {
                "permissions_analysis": None,
                "permissions_details": None,
                "sast_analysis": None,
                "webstore_analysis": None,
                "error": f"Rate limit reached: {str(exc)[:200]}",
            }
        else:
            logger.exception("Extension analysis failed")
            return Command(
                goto=CLEANUP_NODE,
                update={
                    "status": WorkflowStatus.FAILED.value,
                    "error": str(exc),
                },
            )

    return Command(
        goto=SUMMARY_GENERATION_NODE,
        update={"analysis_results": analysis_results},
    )


def summary_generation_node(state: WorkflowState) -> Command:
    """
    Node that generates executive summary from all analysis results.

    Args:
        state (WorkflowState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    analysis_results = state.get("analysis_results")
    manifest = state.get("manifest_data")
    metadata = state.get("extension_metadata")
    scan_id = state.get("workflow_id")
    extension_id = state.get("extension_id") or scan_id

    if not analysis_results:
        logger.warning("No analysis results available for summary generation")
        return Command(
            goto=GOVERNANCE_NODE,
            update={"executive_summary": None},
        )

    try:
        logger.info("Generating executive summary")
        generator = SummaryGenerator()
        executive_summary = generator.generate(
            analysis_results=analysis_results,
            manifest=manifest,
            metadata=metadata,
            scan_id=scan_id,
            extension_id=extension_id,
        )
    except Exception as exc:
        # LLM failures are non-fatal - generators return None and callers use fallbacks
        # Only log as warning to avoid noisy stack traces
        from extension_shield.llm.clients.fallback import LLMFallbackError
        if isinstance(exc, LLMFallbackError):
            logger.warning("LLM providers failed for summary generation, using fallback: %s", exc)
        else:
            logger.warning("Summary generation failed, using fallback: %s", exc)
        executive_summary = None

    return Command(
        goto=IMPACT_ANALYSIS_NODE,
        update={"executive_summary": executive_summary},
    )


def impact_analysis_node(state: WorkflowState) -> Command:
    """
    Node that generates impact analysis buckets from capabilities and scope.

    Args:
        state (WorkflowState): The current state of the workflow.

    Returns:
        Command: A command indicating the next step in the workflow.
    """
    analysis_results = state.get("analysis_results") or {}
    manifest = state.get("manifest_data") or {}
    scan_id = state.get("workflow_id")
    extension_id = state.get("extension_id") or scan_id

    if not manifest:
        logger.warning("No manifest data available for impact analysis")
        return Command(
            goto=GOVERNANCE_NODE,
            update={"analysis_results": analysis_results},
        )

    try:
        logger.info("Generating impact analysis")
        analyzer = ImpactAnalyzer()
        impact_analysis = analyzer.generate(
            analysis_results=analysis_results,
            manifest=manifest,
            extension_id=extension_id,
        )
    except Exception as exc:
        # LLM failures are non-fatal - generators return None and callers use fallbacks
        # Only log as warning to avoid noisy stack traces
        from extension_shield.llm.clients.fallback import LLMFallbackError
        if isinstance(exc, LLMFallbackError):
            logger.warning("LLM providers failed for impact analysis, using fallback: %s", exc)
        else:
            logger.warning("Impact analysis failed, using fallback: %s", exc)
        impact_analysis = None

    updated_results = dict(analysis_results)
    updated_results["impact_analysis"] = impact_analysis

    return Command(
        goto=PRIVACY_COMPLIANCE_NODE,
        update={
            "analysis_results": updated_results,
            "impact_analysis": impact_analysis,
        },
    )


def privacy_compliance_node(state: WorkflowState) -> Command:
    """
    Node that generates privacy + compliance snapshot for UI tiles.
    """
    analysis_results = state.get("analysis_results") or {}
    manifest = state.get("manifest_data") or {}
    metadata = state.get("extension_metadata") or {}
    extension_dir = state.get("extension_dir")

    if not manifest:
        logger.warning("No manifest data available for privacy compliance")
        return Command(
            goto=GOVERNANCE_NODE,
            update={"analysis_results": analysis_results},
        )

    try:
        logger.info("Generating privacy + compliance snapshot")
        analyzer = PrivacyComplianceAnalyzer()
        privacy_compliance = analyzer.generate(
            analysis_results=analysis_results,
            manifest=manifest,
            extension_dir=extension_dir,
            webstore_metadata=metadata or {},
        )
    except Exception as exc:
        # LLM failures are non-fatal - analyzer returns fallback result
        # Only log as warning to avoid noisy stack traces
        from extension_shield.llm.clients.fallback import LLMFallbackError
        if isinstance(exc, LLMFallbackError):
            logger.warning("LLM providers failed for privacy compliance, using fallback: %s", exc)
        else:
            logger.warning("Privacy compliance analysis failed, using fallback: %s", exc)
        privacy_compliance = None

    updated_results = dict(analysis_results)
    updated_results["privacy_compliance"] = privacy_compliance

    return Command(
        goto=GOVERNANCE_NODE,
        update={
            "analysis_results": updated_results,
            "privacy_compliance": privacy_compliance,
        },
    )


def cleanup_node(state: WorkflowState) -> Command:
    """
    Node that performs cleanup operations after the workflow is completed.
    Collects file list but KEEPS extracted directory for file viewing.
    Only removes downloaded CRX files.

    Args:
        state (PipelineState): The current state of the workflow.
    Returns:
        Command: A command indicating the next step in the workflow.
    """
    cleanup_errors = []

    # Collect file list (if not already collected)
    extension_dir = state.get("extension_dir")
    extracted_files = state.get("extracted_files", [])

    if extension_dir and not extracted_files:
        try:
            import os

            files = []
            if os.path.exists(extension_dir):
                for root, _, filenames in os.walk(extension_dir):
                    for filename in filenames:
                        file_path = os.path.join(root, filename)
                        rel_path = os.path.relpath(file_path, extension_dir)
                        files.append(rel_path)
                extracted_files = files
                logger.info("Collected %d files for viewing", len(files))
        except Exception as exc:
            logger.warning("Failed to collect file list: %s", exc)

    # KEEP extracted directory for file viewing - don't clean it up
    # Users can view files through the web UI after analysis
    if extension_dir:
        logger.info("Keeping extension directory for file viewing: %s", extension_dir)

    # Clean up downloaded CRX file (only if downloaded by the tool)
    downloaded_crx_path = state.get("downloaded_crx_path")
    if downloaded_crx_path:
        try:
            logger.info("Cleaning up downloaded CRX file: %s", downloaded_crx_path)
            cleanup_downloaded_crx(downloaded_crx_path)
        except Exception as exc:
            logger.warning("Failed to cleanup CRX file %s: %s", downloaded_crx_path, exc)
            cleanup_errors.append(f"Failed to cleanup CRX file: {exc}")

    # Log warnings but don't fail the workflow
    if cleanup_errors:
        logger.warning("Cleanup completed with warnings: %s", "; ".join(cleanup_errors))

    # Preserve FAILED status if already set, otherwise mark as COMPLETED
    current_status = state.get("status")
    final_status = (
        current_status
        if current_status == WorkflowStatus.FAILED.value
        else WorkflowStatus.COMPLETED.value
    )

    return Command(
        goto=END,
        update={
            "status": final_status,
            "end_time": datetime.now().isoformat(),
            "extracted_files": extracted_files,
        },
    )
