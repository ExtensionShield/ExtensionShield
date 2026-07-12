#!/usr/bin/env python3
"""
Command line interface for ExtensionShield - Chrome Extension Security Analysis Tool.

Usage:
    extension-shield analyze --url <chrome_web_store_url>
    extension-shield analyze --url <url> --output <output_file>
"""

# Provenance: derived from ThreatXtension (https://github.com/barvhaim/ThreatXtension),
# MIT per its upstream README (no LICENSE file is published upstream).
# See docs/NOTICE for attribution.

import json
import uuid
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from extension_shield.workflow.graph import build_graph
from extension_shield.workflow.state import WorkflowStatus


console = Console()
logger = logging.getLogger(__name__)


def configure_logging(verbose: bool = False):
    """Configure logging for the CLI.

    Args:
        verbose: Enable verbose logging.
    """
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )


def print_header():
    """Print CLI header."""
    console.print(
        Panel.fit(
            "[bold cyan]ExtensionShield - Chrome Extension Security Analyzer[/bold cyan]",
            border_style="cyan",
        )
    )


def create_initial_state(chrome_extension_path: str) -> dict:
    """Create initial workflow state.

    Args:
        chrome_extension_path: Chrome Web Store URL of the extension to analyze.

    Returns:
        Initial workflow state dictionary.
    """
    return {
        "workflow_id": str(uuid.uuid4()),
        "chrome_extension_path": chrome_extension_path,
        "extension_dir": None,
        "extension_metadata": None,
        "manifest_data": None,
        "analysis_results": None,
        "executive_summary": None,
        "status": WorkflowStatus.PENDING.value,
        "start_time": datetime.now().isoformat(),
        "end_time": None,
        "error": None,
    }


def calculate_duration(start_time: str, end_time: str) -> float:
    """Calculate workflow duration in seconds.

    Args:
        start_time: ISO 8601 formatted start time.
        end_time: ISO 8601 formatted end time.

    Returns:
        Duration in seconds.
    """
    start = datetime.fromisoformat(start_time)
    end = datetime.fromisoformat(end_time)
    return (end - start).total_seconds()


def build_metadata_table(metadata: dict) -> Table:
    """Build a rich table with extension metadata.

    Args:
        metadata: Extension metadata dictionary.

    Returns:
        Formatted rich Table object.
    """
    table = Table(
        title="Extension Metadata",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Field", style="cyan", width=25)
    table.add_column("Value", style="white")

    # Display all available metadata fields
    field_mapping = {
        "title": "Name",
        "version": "Version",
        "user_count": "Users",
        "rating": "Rating",
        "ratings_count": "Ratings Count",
        "last_updated": "Last Updated",
        "size": "Size",
        "developer_name": "Developer Name",
        "developer_email": "Developer Email",
        "developer_website": "Developer Website",
        "follows_best_practices": "Follows Best Practices",
        "is_featured": "Featured",
        "category": "Category",
    }

    for key, label in field_mapping.items():
        value = metadata.get(key)
        if value is not None:
            # Format specific fields
            if key == "rating":
                table.add_row(label, f"{value} / 5")
            elif key == "user_count":
                table.add_row(label, f"{value:,}")
            elif key == "ratings_count":
                table.add_row(label, f"{value:,}")
            elif key in ("follows_best_practices", "is_featured"):
                table.add_row(label, "Yes" if value else "No")
            else:
                table.add_row(label, str(value))

    # Display privacy policy (truncated if too long)
    privacy_policy = metadata.get("privacy_policy")
    if privacy_policy:
        privacy_text = str(privacy_policy)
        if len(privacy_text) > 150:
            privacy_text = privacy_text[:150] + "..."
        table.add_row("Privacy Policy", privacy_text)

    return table


def build_virustotal_table(vt_results: dict) -> Table:
    """Build a rich table with VirusTotal analysis results.

    Args:
        vt_results: VirusTotal analysis results dictionary.

    Returns:
        Formatted rich Table object.
    """
    table = Table(
        title="VirusTotal Analysis",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Metric", style="cyan", width=25)
    table.add_column("Value", style="white")

    if not vt_results.get("enabled", False):
        table.add_row("Status", "[yellow]Disabled (API key not configured)[/yellow]")
        return table

    table.add_row("Files Analyzed", str(vt_results.get("files_analyzed", 0)))
    table.add_row("Files with Detections", str(vt_results.get("files_with_detections", 0)))

    total_malicious = vt_results.get("total_malicious", 0)
    total_suspicious = vt_results.get("total_suspicious", 0)

    mal_color = "red" if total_malicious > 0 else "green"
    sus_color = "yellow" if total_suspicious > 0 else "green"

    table.add_row("Malicious Detections", f"[{mal_color}]{total_malicious}[/{mal_color}]")
    table.add_row("Suspicious Detections", f"[{sus_color}]{total_suspicious}[/{sus_color}]")

    summary = vt_results.get("summary", {})
    threat_level = summary.get("threat_level", "unknown")
    threat_color = {"clean": "green", "suspicious": "yellow", "malicious": "red"}.get(
        threat_level, "white"
    )
    table.add_row("Threat Level", f"[{threat_color}]{threat_level.upper()}[/{threat_color}]")

    if summary.get("detected_families"):
        families = ", ".join(summary["detected_families"][:5])
        table.add_row("Detected Families", families)

    return table


def build_entropy_table(entropy_results: dict) -> Table:
    """Build a rich table with entropy analysis results.

    Args:
        entropy_results: Entropy analysis results dictionary.

    Returns:
        Formatted rich Table object.
    """
    table = Table(
        title="Entropy Analysis",
        show_header=True,
        header_style="bold magenta",
    )
    table.add_column("Metric", style="cyan", width=25)
    table.add_column("Value", style="white")

    table.add_row("Files Analyzed", str(entropy_results.get("files_analyzed", 0)))
    table.add_row("Files Skipped", str(entropy_results.get("files_skipped", 0)))

    obfuscated = entropy_results.get("obfuscated_files", 0)
    suspicious = entropy_results.get("suspicious_files", 0)

    obf_color = "red" if obfuscated > 0 else "green"
    sus_color = "yellow" if suspicious > 0 else "green"

    table.add_row("Obfuscated Files", f"[{obf_color}]{obfuscated}[/{obf_color}]")
    table.add_row("Suspicious Files", f"[{sus_color}]{suspicious}[/{sus_color}]")

    summary = entropy_results.get("summary", {})
    overall_risk = summary.get("overall_risk", "unknown")
    risk_color = {"normal": "green", "low": "green", "medium": "yellow", "high": "red"}.get(
        overall_risk, "white"
    )
    table.add_row("Overall Risk", f"[{risk_color}]{overall_risk.upper()}[/{risk_color}]")

    obf_detected = summary.get("obfuscation_detected", False)
    obf_status = "[red]Yes[/red]" if obf_detected else "[green]No[/green]"
    table.add_row("Obfuscation Detected", obf_status)

    # Show high entropy files if any
    high_entropy_files = summary.get("high_entropy_files", [])
    if high_entropy_files:
        files_str = ", ".join([f["file"] for f in high_entropy_files[:3]])
        table.add_row("High Entropy Files", files_str)

    return table


def print_results(result: dict):
    """Print workflow results to console.

    Args:
        result: Workflow result dictionary.
    """
    console.print("\n")

    # Status and basic info
    status = result.get("status", "unknown")
    status_color = {"completed": "green", "failed": "red"}.get(status, "yellow")
    console.print(f"Status: [{status_color}]{status.upper()}[/{status_color}]")

    if result.get("error"):
        console.print(f"\n[red]Error: {result['error']}[/red]\n")
        return

    # Duration
    if result.get("end_time"):
        duration = calculate_duration(result["start_time"], result["end_time"])
        console.print(f"Duration: [cyan]{duration:.2f}[/cyan] seconds")

    # Extension metadata
    if result.get("extension_metadata"):
        console.print("\n")
        metadata_table = build_metadata_table(result["extension_metadata"])
        console.print(metadata_table)

    # Analysis results section
    analysis_results = result.get("analysis_results", {})

    # VirusTotal results
    if analysis_results.get("virustotal_analysis"):
        console.print("\n")
        vt_table = build_virustotal_table(analysis_results["virustotal_analysis"])
        console.print(vt_table)

        # Print recommendation if available
        vt_summary = analysis_results["virustotal_analysis"].get("summary", {})
        if vt_summary.get("recommendation"):
            console.print(f"\n[dim]{vt_summary['recommendation']}[/dim]")

    # Entropy results
    if analysis_results.get("entropy_analysis"):
        console.print("\n")
        entropy_table = build_entropy_table(analysis_results["entropy_analysis"])
        console.print(entropy_table)

        # Print recommendation if available
        entropy_summary = analysis_results["entropy_analysis"].get("summary", {})
        if entropy_summary.get("recommendation"):
            console.print(f"\n[dim]{entropy_summary['recommendation']}[/dim]")

    # Executive summary
    if result.get("executive_summary"):
        console.print("\n")
        console.print(Panel.fit("[bold cyan]Executive Summary[/bold cyan]", border_style="cyan"))

        summary = result["executive_summary"]

        # Risk level with color coding
        risk_level = summary.get("overall_risk_level", "unknown")
        risk_color = {"low": "green", "medium": "yellow", "high": "red"}.get(risk_level, "white")
        console.print(
            f"\n[bold]Risk Level:[/bold] [{risk_color}]{risk_level.upper()}[/{risk_color}]\n"
        )

        # Summary
        if summary.get("summary"):
            console.print("[bold]Summary:[/bold]")
            console.print(f"{summary['summary']}\n")

        # Key findings
        if summary.get("key_findings"):
            console.print("[bold]Key Findings:[/bold]")
            for i, finding in enumerate(summary["key_findings"], 1):
                console.print(f"  {i}. {finding}")
            console.print()

        # Recommendations
        if summary.get("recommendations"):
            console.print("[bold]Recommendations:[/bold]")
            for i, rec in enumerate(summary["recommendations"], 1):
                console.print(f"  {i}. {rec}")
            console.print()

    console.print("[bold green]✓[/bold green] Analysis completed\n")


def save_results_json(result: dict, output_path: Path):
    """Save workflow results to JSON file.

    Args:
        result: Workflow result dictionary.
        output_path: Path to save the JSON file.
    """
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    console.print(f"\n[green]Results saved to:[/green] {output_path}")


@click.group()
@click.version_option(version="0.1.0", prog_name="extension-shield")
def cli():
    """ExtensionShield - Chrome Extension Security Analyzer.

    Analyzes Chrome extensions for security threats using LangGraph workflows
    and LLM-powered analysis.
    """


@cli.command()
@click.option(
    "--url",
    help="Chrome Web Store URL of the extension to analyze",
)
@click.option(
    "--file",
    "-f",
    type=click.Path(exists=True),
    help="Local CRX or ZIP file to analyze",
)
@click.option(
    "--output",
    "-o",
    type=click.Path(),
    help="Output file path to save results as JSON",
)
@click.option(
    "--verbose",
    "-v",
    is_flag=True,
    help="Enable verbose logging",
)
def analyze(url: Optional[str], file: Optional[str], output: Optional[str], verbose: bool):
    """Analyze a Chrome extension for security threats.

    Example:
        extension-shield analyze --url https://chromewebstore.google.com/detail/example/abcdef
        extension-shield analyze --file /path/to/extension.crx
        extension-shield analyze --file /path/to/extension.zip
    """
    # Validate input
    if not url and not file:
        raise click.UsageError("Either --url or --file must be provided")

    if url and file:
        raise click.UsageError("Cannot specify both --url and --file")

    configure_logging(verbose)
    print_header()

    # Use file path if provided, otherwise use URL
    chrome_extension_path = file if file else url
    
    # This should never happen due to validation above, but satisfy type checker
    if not chrome_extension_path:
        raise click.UsageError("No extension path provided")

    console.print(f"\n[bold]Analyzing:[/bold] [blue]{chrome_extension_path}[/blue]\n")

    # Build workflow graph
    graph = build_graph()

    # Create initial state
    initial_state = create_initial_state(chrome_extension_path=chrome_extension_path)

    # Execute workflow with spinner
    try:
        with console.status("[bold green]Running analysis...", spinner="dots"):
            result = graph.invoke(initial_state)
    except Exception as e:
        console.print(f"\n[red]Analysis failed: {e}[/red]\n")
        logger.exception("Workflow execution failed")
        raise click.Abort()

    # Print results
    print_results(result)

    # Save to file if requested
    if output:
        output_path = Path(output)
        save_results_json(result, output_path)

    # Persistence note: `analyze` is a one-shot CLI run — it does NOT write to the
    # scan database or the recent-scans list. Use `--output` to keep the JSON, or
    # scan through the running API (`extension-shield serve` + POST /api/scan/trigger)
    # to persist to SQLite/Supabase and appear in recent scans.
    if not output:
        console.print(
            "[dim]Note: CLI analysis is not persisted to the database or recent "
            "scans. Re-run with --output <file.json> to save, or scan via the API "
            "(extension-shield serve) to persist.[/dim]"
        )


@cli.command()
@click.option(
    "--host",
    default="0.0.0.0",
    help="Host to bind the API server to (default: 0.0.0.0)",
)
@click.option(
    "--port",
    default=8007,
    type=int,
    help="Port to bind the API server to (default: 8007)",
)
@click.option(
    "--reload",
    is_flag=True,
    help="Enable auto-reload for development",
)
def serve(host: str, port: int, reload: bool):
    """Start the FastAPI server for the web frontend.

    Example:
        extension-shield serve
        extension-shield serve --port 8080 --reload
    """
    import uvicorn

    console.print(
        Panel.fit(
            f"[bold cyan]Starting ExtensionShield API Server[/bold cyan]\n"
            f"[white]Host:[/white] [green]{host}[/green]\n"
            f"[white]Port:[/white] [green]{port}[/green]\n"
            f"[white]Reload:[/white] [green]{'Enabled' if reload else 'Disabled'}[/green]",
            border_style="cyan",
        )
    )

    console.print(
        f"\n[bold green]✓[/bold green] Server running at [blue]http://{host}:{port}[/blue]"
    )
    console.print("[dim]Press CTRL+C to stop[/dim]\n")

    uvicorn.run(
        "extension_shield.api.main:app", host=host, port=port, reload=reload, log_level="info"
    )


@cli.group("store-status")
def store_status():
    """Curate Chrome Web Store availability metadata (availability only — never
    affects scoring, recompute-on-read, or any corpus/Track A label).

    Use `set ... unavailable` to mark a storefront-delisted extension (which has no
    automated signal) so its report shows the "Extension not available" state.
    """


@store_status.command("set")
@click.argument("extension_id")
@click.argument("status", type=click.Choice(["available", "unavailable", "unknown"]))
@click.option("--reason", default=None, help="Optional human note (e.g. 'delisted from store').")
def store_status_set(extension_id: str, status: str, reason: Optional[str]):
    """Set a CURATED store status for EXTENSION_ID. Curated status wins over the probe."""
    from extension_shield.api.database import db
    from extension_shield.core import store_liveness

    ok = store_liveness.set_curated_status(db, extension_id, status, reason)
    if ok:
        console.print(f"[green]✓[/green] {extension_id} → store_status=[cyan]{status}[/cyan] (curated)")
    else:
        console.print(f"[red]✗[/red] Failed to set store status for {extension_id}")


@store_status.command("get")
@click.argument("extension_id")
def store_status_get(extension_id: str):
    """Show the stored store-status row for EXTENSION_ID."""
    from extension_shield.api.database import db

    row = db.get_store_status(extension_id)
    if not row:
        console.print(f"[yellow]No store status recorded for {extension_id}[/yellow]")
        return
    console.print(row)


@store_status.command("probe")
@click.argument("extension_id")
def store_status_probe(extension_id: str):
    """Run the live availability probe for EXTENSION_ID (read-only; no DB write)."""
    from extension_shield.core import store_liveness

    result = store_liveness.probe_store_availability(extension_id)
    console.print(result)


@cli.command()
def version():
    """Show version information."""
    console.print("[cyan]ExtensionShield[/cyan] version [green]0.1.0[/green]")


def main():
    """Main entry point for the CLI."""
    cli()


if __name__ == "__main__":
    main()
