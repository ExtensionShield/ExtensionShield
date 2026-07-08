"""
PDF Report Generator

This module generates professional PDF reports for Chrome extension security analysis.
Uses ReportLab for pure-Python PDF generation (no system dependencies).
"""

import io
import logging
from datetime import datetime
from typing import Dict, Optional, Any, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)
from reportlab.lib.enums import TA_CENTER

from extension_shield.utils.verdict_risk import coherent_risk_level_for_payload

logger = logging.getLogger(__name__)


class ReportGenerator:
    """
    Generates professional PDF security reports for Chrome extension analysis.
    Uses ReportLab for pure-Python PDF generation.
    """

    def __init__(self):
        """Initialize the ReportGenerator."""
        self.enabled = True
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()

    def _setup_custom_styles(self):
        """Setup custom paragraph styles."""
        self.styles.add(ParagraphStyle(
            name='ReportTitle',
            parent=self.styles['Heading1'],
            fontSize=24,
            spaceAfter=30,
            alignment=TA_CENTER,
            textColor=colors.HexColor('#1e40af'),
        ))
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=14,
            spaceBefore=20,
            spaceAfter=10,
            textColor=colors.HexColor('#1f2937'),
        ))
        self.styles.add(ParagraphStyle(
            name='BodyTextCustom',
            parent=self.styles['Normal'],
            fontSize=10,
            spaceAfter=8,
            leading=14,
        ))
        self.styles.add(ParagraphStyle(
            name='SmallText',
            parent=self.styles['Normal'],
            fontSize=8,
            textColor=colors.HexColor('#6b7280'),
        ))

    def _get_risk_color(self, risk_level: str) -> colors.Color:
        """Get color for risk level."""
        risk_colors = {
            "high": colors.HexColor('#dc2626'),
            "medium": colors.HexColor('#f59e0b'),
            "low": colors.HexColor('#22c55e'),
            "normal": colors.HexColor('#22c55e'),
            "clean": colors.HexColor('#22c55e'),
            "suspicious": colors.HexColor('#f59e0b'),
            "malicious": colors.HexColor('#dc2626'),
        }
        return risk_colors.get(risk_level.lower(), colors.HexColor('#6b7280'))

    # -- Authoritative verdict ------------------------------------------------
    # The PDF MUST display the single authoritative verdict (BLOCK / NEEDS_REVIEW
    # / ALLOW) produced by scoring.decision.resolve() and surfaced as
    # governance_bundle.decision.final_verdict. It must never recompute a verdict
    # from the score. See ADR 0001 and audit finding #14.

    _VERDICT_COLORS = {
        "BLOCK": '#dc2626',
        "NEEDS_REVIEW": '#f59e0b',
        "ALLOW": '#22c55e',
    }
    _VERDICT_LABELS = {
        "BLOCK": "BLOCK — Do not install",
        "NEEDS_REVIEW": "NEEDS REVIEW — Manual review required",
        "ALLOW": "ALLOW — No blocking issues found",
    }

    @staticmethod
    def _coerce_int(value: Any) -> Optional[int]:
        """Best-effort integer coercion for score fields."""
        try:
            if value is None:
                return None
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _coerce_float(value: Any) -> Optional[float]:
        """Best-effort float coercion for confidence fields."""
        try:
            if value is None:
                return None
            return float(value)
        except (TypeError, ValueError):
            return None

    @classmethod
    def _risk_level_from_score(cls, score: Optional[int]) -> str:
        """Fallback risk band when a layer does not ship an explicit label."""
        if score is None:
            return "unknown"
        if score < 30:
            return "critical"
        if score < 50:
            return "high"
        if score < 75:
            return "medium"
        if score >= 95:
            return "none"
        return "low"

    @classmethod
    def _extract_scoring_snapshot(cls, scan_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract overall + three-layer scoring data for PDF rendering.

        Prefer ``scoring_v2`` (the real ExtensionShield three-layer model) and
        fall back to legacy top-level fields for older rows.
        """
        scoring_v2 = scan_results.get("scoring_v2")
        if not isinstance(scoring_v2, dict):
            scoring_v2 = {}

        overall_score = cls._coerce_int(scoring_v2.get("overall_score"))
        if overall_score is None:
            overall_score = cls._coerce_int(scan_results.get("overall_security_score"))
        if overall_score is None:
            overall_score = cls._coerce_int(scan_results.get("security_score"))
        if overall_score is None:
            overall_score = 0

        overall_risk = (
            scoring_v2.get("risk_level")
            or scan_results.get("overall_risk")
            or scan_results.get("risk_level")
            or "unknown"
        )
        overall_risk = coherent_risk_level_for_payload(scan_results, overall_risk)
        overall_confidence = cls._coerce_float(
            scoring_v2.get("overall_confidence", scan_results.get("overall_confidence"))
        )

        def _layer_snapshot(layer_key: str, score_key: str, label: str) -> Dict[str, Any]:
            layer_obj = scoring_v2.get(layer_key)
            if not isinstance(layer_obj, dict):
                layer_obj = {}

            score = cls._coerce_int(scoring_v2.get(score_key))
            if score is None:
                score = cls._coerce_int(layer_obj.get("score"))
            if score is None:
                score = cls._coerce_int(scan_results.get(score_key))

            risk_level = layer_obj.get("risk_level") or cls._risk_level_from_score(score)
            confidence = cls._coerce_float(layer_obj.get("confidence"))

            return {
                "label": label,
                "score": score,
                "risk_level": str(risk_level or "unknown"),
                "confidence": confidence,
            }

        return {
            "overall_score": overall_score,
            "overall_risk": str(overall_risk or "unknown"),
            "overall_confidence": overall_confidence,
            "layers": [
                _layer_snapshot("security_layer", "security_score", "Security"),
                _layer_snapshot("privacy_layer", "privacy_score", "Privacy"),
                _layer_snapshot("governance_layer", "governance_score", "Governance"),
            ],
        }

    @staticmethod
    def _resolve_authoritative_verdict(scan_results: Dict) -> Dict[str, Any]:
        """Extract the authoritative verdict/reasons from scan results.

        Prefers the governance bundle's Decision Authority output
        (``governance_bundle.decision.final_verdict`` / ``final_reasons``) and
        falls back to the top-level ``governance_verdict``. Never derived from the
        numeric score.
        """
        bundle = scan_results.get("governance_bundle") or {}
        decision = bundle.get("decision") or {}
        verdict = (
            scan_results.get("final_verdict")
            or scan_results.get("governance_verdict")
            or decision.get("final_verdict")
        )
        reasons = decision.get("final_reasons") or []
        authority = decision.get("final_authority")
        return {
            "verdict": (verdict or "").upper() or None,
            "reasons": list(reasons) if isinstance(reasons, (list, tuple)) else [],
            "authority": authority,
        }

    def _create_verdict_section(self, scan_results: Dict) -> List:
        """Create the authoritative verdict banner (headline of the report)."""
        elements: List = []
        info = self._resolve_authoritative_verdict(scan_results)
        verdict = info["verdict"]

        if not verdict:
            # No governance verdict available (e.g. governance did not run). Be
            # explicit rather than implying a passing verdict.
            elements.append(Paragraph(
                "<b>Verdict:</b> Not available (governance decision did not run). "
                "This report is informational only.",
                self.styles['BodyTextCustom'],
            ))
            elements.append(Spacer(1, 20))
            return elements

        color = colors.HexColor(self._VERDICT_COLORS.get(verdict, '#6b7280'))
        label = self._VERDICT_LABELS.get(verdict, verdict)

        banner = Table(
            [[Paragraph(
                f"<b>{label}</b>",
                ParagraphStyle('VerdictStyle', fontSize=18, textColor=colors.white,
                               alignment=TA_CENTER, leading=22),
            )]],
            colWidths=[6.5 * inch],
        )
        banner.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), color),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 14),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 14),
        ]))
        elements.append(banner)
        elements.append(Spacer(1, 10))

        # Reasons that justify the verdict (from the Decision Authority).
        reasons = info["reasons"]
        if reasons:
            elements.append(Paragraph("Why this verdict:", self.styles['BodyTextCustom']))
            for reason in reasons[:8]:
                elements.append(Paragraph(f"  - {reason}", self.styles['SmallText']))
        if info["authority"]:
            elements.append(Spacer(1, 4))
            elements.append(Paragraph(
                f"Deciding authority: {info['authority']}", self.styles['SmallText']
            ))
        elements.append(Spacer(1, 20))
        return elements

    def _create_header(self, extension_name: str, extension_id: str, timestamp: str) -> List:
        """Create report header elements."""
        elements = []

        # Title
        elements.append(Paragraph("ExtensionShield", self.styles['ReportTitle']))
        elements.append(Paragraph("Extension Risk Analysis Report", self.styles['Heading2']))
        elements.append(Spacer(1, 20))

        # Extension info table
        info_data = [
            ["Extension:", extension_name],
            ["ID:", extension_id],
            ["Generated:", timestamp],
        ]
        info_table = Table(info_data, colWidths=[1.5 * inch, 5 * inch])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#6b7280')),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 30))

        return elements

    def _create_score_section(self, scoring_snapshot: Dict[str, Any]) -> List:
        """Create overall + layer score section for the three-layer model."""
        elements = []

        overall_score = self._coerce_int(scoring_snapshot.get("overall_score")) or 0
        overall_risk = str(scoring_snapshot.get("overall_risk") or "unknown")
        overall_confidence = self._coerce_float(scoring_snapshot.get("overall_confidence"))
        layers = scoring_snapshot.get("layers") or []

        score_color = self._get_risk_color(overall_risk)

        overall_data = [
            [Paragraph(f"<b>{overall_score}</b>/100", ParagraphStyle(
                'ScoreStyle',
                fontSize=28,
                textColor=score_color,
                alignment=TA_CENTER,
            ))],
            [Paragraph("Overall Score", self.styles['SmallText'])],
        ]

        risk_data = [
            [Paragraph(f"<b>{overall_risk.upper()}</b>", ParagraphStyle(
                'RiskStyle',
                fontSize=18,
                textColor=score_color,
                alignment=TA_CENTER,
            ))],
            [Paragraph("Overall Risk", self.styles['SmallText'])],
        ]

        confidence_label = "N/A"
        if overall_confidence is not None:
            confidence_label = f"{round(overall_confidence * 100):d}%"
        confidence_data = [
            [Paragraph(f"<b>{confidence_label}</b>", ParagraphStyle(
                'ConfidenceStyle',
                fontSize=18,
                textColor=colors.HexColor('#1f2937'),
                alignment=TA_CENTER,
            ))],
            [Paragraph("Confidence", self.styles['SmallText'])],
        ]

        # Create side-by-side tables
        combined_data = [[
            Table(overall_data, colWidths=[2.0 * inch]),
            Table(risk_data, colWidths=[2.0 * inch]),
            Table(confidence_data, colWidths=[2.0 * inch]),
        ]]
        combined_table = Table(combined_data, colWidths=[2.15 * inch, 2.15 * inch, 2.15 * inch])
        combined_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, 0), 1, colors.HexColor('#e5e7eb')),
            ('INNERGRID', (0, 0), (-1, 0), 0.5, colors.HexColor('#e5e7eb')),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f9fafb')),
            ('TOPPADDING', (0, 0), (-1, -1), 15),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 15),
        ]))

        elements.append(combined_table)

        layer_rows = [["Layer", "Score", "Risk", "Confidence"]]
        for layer in layers:
            score = self._coerce_int(layer.get("score"))
            layer_conf = self._coerce_float(layer.get("confidence"))
            layer_rows.append([
                str(layer.get("label") or "Unknown"),
                str(score) if score is not None else "N/A",
                str(layer.get("risk_level") or "unknown").upper(),
                f"{round(layer_conf * 100):d}%" if layer_conf is not None else "N/A",
            ])

        layer_table = Table(layer_rows, colWidths=[2.1 * inch, 1.0 * inch, 1.4 * inch, 1.4 * inch])
        layer_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 7),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
            ('ALIGN', (1, 1), (-1, -1), 'CENTER'),
        ]))
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("Layer Overview", self.styles['SectionHeader']))
        elements.append(layer_table)
        elements.append(Spacer(1, 20))

        return elements

    def _create_executive_summary(self, summary: Dict) -> List:
        """Create executive summary section."""
        elements = []
        elements.append(Paragraph("1. Executive Summary", self.styles['SectionHeader']))

        summary_text = summary.get("summary", "No executive summary available.")
        # Clean up the text for ReportLab
        summary_text = summary_text.replace('\n', '<br/>')
        elements.append(Paragraph(summary_text, self.styles['BodyTextCustom']))
        elements.append(Spacer(1, 15))

        return elements

    def _create_virustotal_section(self, vt_analysis: Dict) -> List:
        """Create VirusTotal section."""
        elements = []
        elements.append(Paragraph("2. VirusTotal Threat Intelligence", self.styles['SectionHeader']))

        if not vt_analysis or not vt_analysis.get("enabled", True):
            elements.append(Paragraph(
                "VirusTotal analysis not available or disabled.",
                self.styles['BodyTextCustom']
            ))
            return elements

        summary = vt_analysis.get("summary", {})
        threat_level = summary.get("threat_level", "unknown")

        # Stats table
        stats_data = [
            ["Files Scanned", "With Detections", "Malicious", "Suspicious"],
            [
                str(vt_analysis.get("files_analyzed", 0)),
                str(vt_analysis.get("files_with_detections", 0)),
                str(vt_analysis.get("total_malicious", 0)),
                str(vt_analysis.get("total_suspicious", 0)),
            ],
        ]
        stats_table = Table(stats_data, colWidths=[1.5 * inch] * 4)
        stats_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(stats_table)
        elements.append(Spacer(1, 10))

        # Threat level
        threat_color = self._get_risk_color(threat_level)
        elements.append(Paragraph(
            f"Threat Level: <b><font color='{threat_color.hexval()}'>{threat_level.upper()}</font></b>",
            self.styles['BodyTextCustom']
        ))

        # Malware families
        families = summary.get("detected_families", [])
        if families:
            elements.append(Paragraph(
                f"Detected Families: {', '.join(families[:10])}",
                self.styles['BodyTextCustom']
            ))

        # Recommendation
        recommendation = summary.get("recommendation", "")
        if recommendation:
            elements.append(Spacer(1, 5))
            elements.append(Paragraph(recommendation, self.styles['SmallText']))

        elements.append(Spacer(1, 15))
        return elements

    def _create_entropy_section(self, entropy_analysis: Dict) -> List:
        """Create entropy/obfuscation section."""
        elements = []
        elements.append(Paragraph("3. Obfuscation Analysis", self.styles['SectionHeader']))

        if not entropy_analysis:
            elements.append(Paragraph(
                "Entropy analysis not available.",
                self.styles['BodyTextCustom']
            ))
            return elements

        summary = entropy_analysis.get("summary", {})
        overall_risk = summary.get("overall_risk", "normal")

        # Stats table
        stats_data = [
            ["Files Analyzed", "Skipped", "Obfuscated", "Suspicious"],
            [
                str(entropy_analysis.get("files_analyzed", 0)),
                str(entropy_analysis.get("files_skipped", 0)),
                str(entropy_analysis.get("obfuscated_files", 0)),
                str(entropy_analysis.get("suspicious_files", 0)),
            ],
        ]
        stats_table = Table(stats_data, colWidths=[1.5 * inch] * 4)
        stats_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(stats_table)
        elements.append(Spacer(1, 10))

        # Risk level
        risk_color = self._get_risk_color(overall_risk)
        elements.append(Paragraph(
            f"Obfuscation Risk: <b><font color='{risk_color.hexval()}'>{overall_risk.upper()}</font></b>",
            self.styles['BodyTextCustom']
        ))

        # High entropy files
        high_entropy_files = summary.get("high_entropy_files", [])
        if high_entropy_files:
            elements.append(Paragraph("High Entropy Files:", self.styles['BodyTextCustom']))
            for f in high_entropy_files[:5]:
                elements.append(Paragraph(
                    f"  - {f.get('file', 'Unknown')}: Entropy {f.get('entropy', 0):.2f}",
                    self.styles['SmallText']
                ))

        # Recommendation
        recommendation = summary.get("recommendation", "")
        if recommendation:
            elements.append(Spacer(1, 5))
            elements.append(Paragraph(recommendation, self.styles['SmallText']))

        elements.append(Spacer(1, 15))
        return elements

    def _create_permissions_section(self, permissions_analysis: Dict) -> List:
        """Create permissions section."""
        elements = []
        elements.append(Paragraph("4. Permissions Analysis", self.styles['SectionHeader']))

        details = permissions_analysis.get("permissions_details", {})
        if not details:
            elements.append(Paragraph(
                "No permissions data available.",
                self.styles['BodyTextCustom']
            ))
            return elements

        # Permissions table. Tri-state (D4): True=reasonable, False=unreasonable,
        # None=analysis unavailable. A failed/missing analysis must render as
        # "Unknown", never as a verified-safe "Yes / Low".
        table_data = [["Permission", "Reasonable", "Risk"]]
        for perm_name, perm_info in list(details.items())[:15]:
            is_reasonable = perm_info.get("is_reasonable", None)
            if is_reasonable is True:
                reasonable_cell, risk = "Yes", "Low"
            elif is_reasonable is False:
                reasonable_cell, risk = "No", "High"
            else:
                reasonable_cell, risk = "Unknown", "Not analyzed"
            table_data.append([perm_name, reasonable_cell, risk])

        perm_table = Table(table_data, colWidths=[3 * inch, 1.5 * inch, 1 * inch])
        perm_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(perm_table)

        if len(details) > 15:
            elements.append(Paragraph(
                f"... and {len(details) - 15} more permissions",
                self.styles['SmallText']
            ))

        elements.append(Spacer(1, 15))
        return elements

    def _create_sast_section(self, sast_results: Dict) -> List:
        """Create SAST findings section."""
        elements = []
        elements.append(Paragraph("5. SAST Findings", self.styles['SectionHeader']))

        # The analyzer emits findings as {file_path: [semgrep_finding, ...]} under
        # the "sast_findings" key. Flatten to (file, finding) rows. Fall back to
        # legacy flat-list shapes for backward compatibility.
        findings: List = []  # list of (file_path, finding_dict)
        findings_by_file = sast_results.get("sast_findings")
        if isinstance(findings_by_file, dict):
            for file_path, file_findings in findings_by_file.items():
                for f in (file_findings or []):
                    findings.append((file_path, f))
        else:
            legacy = (
                sast_results.get("findings")
                or sast_results.get("javascript_analysis")
                or []
            )
            if isinstance(legacy, list):
                for f in legacy:
                    fp = f.get("file", f.get("path", "Unknown")) if isinstance(f, dict) else "Unknown"
                    findings.append((fp, f))

        if not findings:
            elements.append(Paragraph(
                "No security findings detected.",
                self.styles['BodyTextCustom']
            ))
            return elements

        # Findings table
        table_data = [["File", "Line", "Severity", "Rule"]]
        for file_path, finding in findings[:20]:
            finding = finding if isinstance(finding, dict) else {}
            extra = finding.get("extra", {}) or {}
            start = finding.get("start", {}) or {}
            severity = (
                extra.get("severity")
                or finding.get("risk_level")
                or finding.get("severity")
                or "medium"
            )
            line_no = (
                start.get("line")
                or finding.get("line_number")
                or finding.get("line")
                or "-"
            )
            rule = (
                finding.get("check_id")
                or finding.get("pattern_name")
                or finding.get("rule")
                or "-"
            )
            file_label = str(file_path or finding.get("file", "Unknown"))
            table_data.append([
                file_label[:30],
                str(line_no),
                str(severity).upper(),
                str(rule)[:25],
            ])

        findings_table = Table(table_data, colWidths=[2 * inch, 0.6 * inch, 0.8 * inch, 2 * inch])
        findings_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f3f4f6')),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e5e7eb')),
            ('TOPPADDING', (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ]))
        elements.append(findings_table)

        if len(findings) > 20:
            elements.append(Paragraph(
                f"... and {len(findings) - 20} more findings",
                self.styles['SmallText']
            ))

        elements.append(Spacer(1, 15))
        return elements

    def _create_recommendations_section(self, summary: Dict) -> List:
        """Create recommendations section."""
        elements = []
        elements.append(Paragraph("6. Recommendations", self.styles['SectionHeader']))

        recommendations = summary.get("recommendations", [])
        if recommendations:
            for rec in recommendations:
                elements.append(Paragraph(f"- {rec}", self.styles['BodyTextCustom']))
        else:
            elements.append(Paragraph("- Review all high-risk findings before installation", self.styles['BodyTextCustom']))
            elements.append(Paragraph("- Verify the extension developer's reputation", self.styles['BodyTextCustom']))
            elements.append(Paragraph("- Monitor extension behavior after installation", self.styles['BodyTextCustom']))

        elements.append(Spacer(1, 30))
        return elements

    def _create_footer(self) -> List:
        """Create report footer."""
        elements = []
        elements.append(Paragraph(
            "Generated by ExtensionShield - Chrome Extension Security Analyzer",
            ParagraphStyle('Footer', fontSize=9, textColor=colors.HexColor('#9ca3af'), alignment=TA_CENTER)
        ))
        elements.append(Paragraph(
            "This report is for informational purposes only.",
            ParagraphStyle('Footer2', fontSize=8, textColor=colors.HexColor('#9ca3af'), alignment=TA_CENTER)
        ))
        return elements

    def generate_pdf(self, scan_results: Dict, output_path: Optional[str] = None) -> bytes:
        """
        Generate PDF report from scan results.

        Args:
            scan_results: Complete scan results dictionary
            output_path: Optional path to save the PDF file

        Returns:
            PDF content as bytes
        """
        # Extract data
        extension_name = scan_results.get("extension_name", scan_results.get("metadata", {}).get("title", "Unknown Extension"))
        extension_id = scan_results.get("extension_id", "Unknown")
        timestamp = scan_results.get("timestamp", datetime.now().isoformat())
        scoring_snapshot = self._extract_scoring_snapshot(scan_results)

        # Get analysis sections
        permissions_analysis = scan_results.get("permissions_analysis", {})
        sast_results = scan_results.get("sast_results", scan_results.get("javascript_analysis", {}))
        vt_analysis = scan_results.get("virustotal_analysis", {})
        entropy_analysis = scan_results.get("entropy_analysis", {})
        summary = scan_results.get("summary", {})

        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=0.75 * inch,
            leftMargin=0.75 * inch,
            topMargin=0.75 * inch,
            bottomMargin=0.75 * inch,
        )

        # Build document elements
        elements = []
        elements.extend(self._create_header(extension_name, extension_id, timestamp))
        # Authoritative verdict banner FIRST (the headline). Sourced from the
        # single Decision Authority, never recomputed from the score.
        elements.extend(self._create_verdict_section(scan_results))
        elements.extend(self._create_score_section(scoring_snapshot))
        elements.extend(self._create_executive_summary(summary))
        elements.extend(self._create_virustotal_section(vt_analysis))
        elements.extend(self._create_entropy_section(entropy_analysis))
        elements.extend(self._create_permissions_section(permissions_analysis))
        elements.extend(self._create_sast_section(sast_results))
        elements.extend(self._create_recommendations_section(summary))
        elements.extend(self._create_footer())

        # Build PDF
        doc.build(elements)

        # Get PDF bytes
        pdf_bytes = buffer.getvalue()
        buffer.close()

        # Save to file if path provided
        if output_path:
            with open(output_path, "wb") as f:
                f.write(pdf_bytes)
            logger.info("PDF report saved to: %s", output_path)

        return pdf_bytes
