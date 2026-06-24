"""
Regression tests for D3: PDF SAST section read the wrong keys and always
rendered "No security findings detected", silently dropping CRITICAL findings.

The analyzer emits findings under "sast_findings" as {file_path: [finding, ...]}
where each finding uses Semgrep's shape (check_id / start.line / extra.severity).
The PDF section must surface those findings, not claim the scan was clean.
"""

from reportlab.platypus import Table

from extension_shield.core.report_generator import ReportGenerator


def _semgrep_finding(check_id, line, severity, message="bad"):
    return {
        "check_id": check_id,
        "path": "background.js",
        "start": {"line": line},
        "extra": {"severity": severity, "message": message, "lines": "evil()"},
    }


def _table_text(elements):
    """Flatten all reportlab Table cell values in the section to one string."""
    out = []
    for el in elements:
        if isinstance(el, Table):
            for row in getattr(el, "_cellvalues", []) or []:
                out.extend(str(c) for c in row)
    return " ".join(out)


def _has_no_findings_paragraph(elements):
    for el in elements:
        text = getattr(el, "text", "") or ""
        if "No security findings detected" in text:
            return True
    return False


def test_sast_section_renders_findings_from_sast_findings_dict():
    """CRITICAL findings under sast_findings must appear in the table, not be lost."""
    sast_results = {
        "sast_findings": {
            "background.js": [
                _semgrep_finding("c2.exfiltration.websocket_connection", 12, "CRITICAL"),
                _semgrep_finding("cookie.theft.document_cookie_access", 30, "ERROR"),
            ]
        }
    }

    elements = ReportGenerator()._create_sast_section(sast_results)

    assert not _has_no_findings_paragraph(elements), (
        "SAST section falsely reported no findings despite CRITICAL findings present"
    )
    text = _table_text(elements)
    assert "CRITICAL" in text
    # Rule column is truncated to 25 chars in the table; assert the check_id prefix
    # reached the row (proving the finding was surfaced, not dropped).
    assert "c2.exfiltration.websocket" in text
    assert "background.js" in text
    assert "12" in text  # line number surfaced


def test_sast_section_truly_empty_says_no_findings():
    """A genuinely empty scan still renders the 'no findings' message."""
    elements = ReportGenerator()._create_sast_section({"sast_findings": {}})
    assert _has_no_findings_paragraph(elements)


def test_sast_section_ignores_empty_file_lists():
    """Files scanned with empty finding lists are not findings."""
    elements = ReportGenerator()._create_sast_section(
        {"sast_findings": {"a.js": [], "b.js": []}}
    )
    assert _has_no_findings_paragraph(elements)
