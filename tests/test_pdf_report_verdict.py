"""
Regression tests for the PDF report authoritative-verdict banner (audit #14, Fix #3).

The PDF must display the single authoritative verdict (BLOCK / NEEDS_REVIEW /
ALLOW) from governance_bundle.decision.final_verdict and its reasons, and must
NOT recompute or imply a conflicting verdict from the score. A high-scoring BLOCK
must render as BLOCK, never as a clean/safe-looking report.

These tests assert on the generated ReportLab flowables (no PDF-text-parsing
dependency). An optional deep-text check runs only if pdfminer.six is installed.
"""

import pytest

pytest.importorskip("reportlab")

from reportlab.platypus import Paragraph, Table

from extension_shield.core.report_generator import ReportGenerator


def _collect_text(flowables) -> str:
    """Recursively collect plain text from Paragraph / Table flowables."""
    parts = []
    for f in flowables or []:
        if isinstance(f, Paragraph):
            parts.append(f.getPlainText())
        elif isinstance(f, Table):
            for row in getattr(f, "_cellvalues", []) or []:
                for cell in row:
                    if isinstance(cell, (list, tuple)):
                        parts.append(_collect_text(cell))
                    else:
                        parts.append(_collect_text([cell]))
        elif isinstance(f, (str, int, float)):
            parts.append(str(f))
    return "\n".join(parts)


def _results(verdict, reasons, *, overall_score=92, risk_level="low"):
    return {
        "extension_id": "abcdefghabcdefghabcdefghabcdefgh",
        "extension_name": "Test Extension",
        "overall_security_score": overall_score,
        "risk_level": risk_level,
        "governance_verdict": verdict,
        "governance_bundle": {
            "decision": {
                "final_verdict": verdict,
                "final_authority": "hard_gate",
                "final_reasons": reasons,
            }
        },
        "summary": {"summary": "Test summary."},
        "sast_results": {},
        "virustotal_analysis": {},
        "entropy_analysis": {},
        "permissions_analysis": {},
    }


class TestVerdictResolution:
    def test_resolve_prefers_bundle_decision(self):
        info = ReportGenerator._resolve_authoritative_verdict(
            _results("BLOCK", ["automation of a protected portal"])
        )
        assert info["verdict"] == "BLOCK"
        assert info["reasons"] == ["automation of a protected portal"]

    def test_resolve_falls_back_to_top_level(self):
        info = ReportGenerator._resolve_authoritative_verdict({"governance_verdict": "needs_review"})
        assert info["verdict"] == "NEEDS_REVIEW"

    def test_resolve_none_when_absent(self):
        info = ReportGenerator._resolve_authoritative_verdict({})
        assert info["verdict"] is None


class TestVerdictSection:
    def test_high_score_block_section_shows_block_and_reason(self):
        """A BLOCK with a high score (92) must render BLOCK + reason, not Safe."""
        gen = ReportGenerator()
        section = gen._create_verdict_section(
            _results("BLOCK", ["Visa-slot automation detected"], overall_score=92, risk_level="low")
        )
        text = _collect_text(section)
        assert "BLOCK" in text
        assert "Visa-slot automation detected" in text
        assert "No blocking issues found" not in text  # the ALLOW label must not appear

    def test_needs_review_section(self):
        gen = ReportGenerator()
        text = _collect_text(gen._create_verdict_section(
            _results("NEEDS_REVIEW", ["Insufficient analysis coverage"])
        ))
        assert "NEEDS REVIEW" in text
        assert "Insufficient analysis coverage" in text

    def test_allow_section(self):
        gen = ReportGenerator()
        text = _collect_text(gen._create_verdict_section(
            _results("ALLOW", ["All checks passed"])
        ))
        assert "ALLOW" in text

    def test_missing_verdict_does_not_imply_pass(self):
        gen = ReportGenerator()
        text = _collect_text(gen._create_verdict_section({"extension_id": "x" * 32}))
        assert "Not available" in text
        assert "No blocking issues found" not in text


class TestScoreSection:
    def test_score_section_surfaces_three_layer_scoring(self):
        gen = ReportGenerator()
        results = _results("BLOCK", ["Policy block"], overall_score=77, risk_level="medium")
        results["scoring_v2"] = {
            "overall_score": 77,
            "overall_confidence": 0.86,
            "risk_level": "medium",
            "security_score": 81,
            "privacy_score": 49,
            "governance_score": 92,
            "security_layer": {"score": 81, "risk_level": "low", "confidence": 0.95},
            "privacy_layer": {"score": 49, "risk_level": "high", "confidence": 0.72},
            "governance_layer": {"score": 92, "risk_level": "none", "confidence": 0.91},
        }

        text = _collect_text(gen._create_score_section(gen._extract_scoring_snapshot(results)))
        assert "Overall Score" in text
        assert "Confidence" in text
        assert "Layer Overview" in text
        assert "Security" in text
        assert "Privacy" in text
        assert "Governance" in text
        assert "81" in text
        assert "49" in text
        assert "92" in text

    def test_block_score_section_does_not_render_low_overall_risk(self):
        gen = ReportGenerator()
        results = _results("BLOCK", ["Policy block"], overall_score=86, risk_level="low")
        results["scoring_v2"] = {
            "overall_score": 86,
            "risk_level": "low",
        }

        text = _collect_text(gen._create_score_section(gen._extract_scoring_snapshot(results)))
        assert "Overall Risk" in text
        assert "HIGH" in text
        assert "LOW" not in text

    def test_needs_review_score_section_does_not_render_low_overall_risk(self):
        gen = ReportGenerator()
        results = _results("NEEDS_REVIEW", ["Needs review"], overall_score=94, risk_level="low")
        results["scoring_v2"] = {
            "overall_score": 94,
            "risk_level": "low",
        }

        text = _collect_text(gen._create_score_section(gen._extract_scoring_snapshot(results)))
        assert "Overall Risk" in text
        assert "MEDIUM" in text
        assert "LOW" not in text

    def test_header_is_extension_risk_report_not_security_only(self):
        gen = ReportGenerator()
        text = _collect_text(gen._create_header("Example", "a" * 32, "2026-06-24T00:00:00Z"))
        assert "Extension Risk Analysis Report" in text
        assert "Security Analysis Report" not in text


class TestGeneratePdfSmoke:
    @pytest.mark.parametrize("verdict", ["BLOCK", "NEEDS_REVIEW", "ALLOW"])
    def test_generate_pdf_returns_pdf_bytes(self, verdict):
        gen = ReportGenerator()
        pdf = gen.generate_pdf(_results(verdict, ["reason one"]))
        assert isinstance(pdf, bytes) and pdf.startswith(b"%PDF")


class TestPdfDeepText:
    """Optional: verify the rendered PDF text if pdfminer.six is installed."""

    def test_block_appears_in_rendered_pdf(self):
        high_level = pytest.importorskip("pdfminer.high_level")
        import io
        gen = ReportGenerator()
        pdf = gen.generate_pdf(_results("BLOCK", ["Visa-slot automation detected"], overall_score=92))
        text = high_level.extract_text(io.BytesIO(pdf))
        assert "BLOCK" in text
