"""
Regression tests for D2: the SAST analyzer failed open on Semgrep execution
failure (timeout/crash/empty output), silently returning empty findings that
the scoring engine treated as a clean SAST layer.

A failed scan is MISSING coverage, not a clean result. The analyzer now emits an
explicit error sentinel, the adapter records ``scan_error`` on the signal pack,
and the engine forces NEEDS_REVIEW so a failed malware scan can never clear an
extension as safe — even when VirusTotal coverage is clean.
"""

import subprocess

from extension_shield.core.analyzers.sast import JavaScriptAnalyzer
from extension_shield.governance.tool_adapters import SignalPackBuilder
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.models import Decision

CLEAN_VT = {
    "enabled": True,
    "files_analyzed": 1,
    "files_found_in_vt": 1,
    "total_malicious": 0,
    "total_suspicious": 0,
    "file_results": [
        {
            "file_name": "x.js",
            "virustotal": {
                "found": True,
                "detection_stats": {
                    "malicious": 0,
                    "suspicious": 0,
                    "undetected": 70,
                    "harmless": 0,
                    "total_engines": 70,
                },
                "malware_families": [],
            },
        }
    ],
    "summary": {"threat_level": "clean", "detected_families": [], "recommendation": ""},
}

MANIFEST = {"manifest_version": 3, "name": "t", "version": "1.0"}


def _score(analysis_results):
    sp = SignalPackBuilder().build(
        scan_id="t", analysis_results=analysis_results, manifest=MANIFEST, metadata={}
    )
    res = ScoringEngine(weights_version="v1").calculate_scores(sp, manifest=MANIFEST)
    return sp, res


# --- runner emits the sentinel on a genuine failure -------------------------

def test_batch_runner_emits_error_sentinel_on_timeout(monkeypatch):
    import extension_shield.core.analyzers.sast as sast_mod

    def boom(*a, **k):
        raise subprocess.TimeoutExpired(cmd="semgrep", timeout=1)

    monkeypatch.setattr(sast_mod.subprocess, "run", boom)
    result = JavaScriptAnalyzer._run_semgrep_batch_scan(
        ["/tmp/x.js"], "/tmp", "config.yaml", 1
    )
    assert "__sast_error__" in result


def test_batch_runner_emits_error_sentinel_on_empty_output(monkeypatch):
    import extension_shield.core.analyzers.sast as sast_mod

    class _R:
        stdout = ""  # semgrep --json always emits JSON; empty == failure
        returncode = 2

    monkeypatch.setattr(sast_mod.subprocess, "run", lambda *a, **k: _R())
    result = JavaScriptAnalyzer._run_semgrep_batch_scan(
        ["/tmp/x.js"], "/tmp", "config.yaml", 30
    )
    assert "__sast_error__" in result


def test_resolve_semgrep_from_active_python_venv(monkeypatch, tmp_path):
    import extension_shield.core.analyzers.sast as sast_mod

    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    semgrep_bin = bin_dir / "semgrep"
    semgrep_bin.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    semgrep_bin.chmod(0o755)

    monkeypatch.delenv("SEMGREP_BIN", raising=False)
    monkeypatch.setattr(sast_mod.shutil, "which", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(sast_mod.sys, "executable", str(bin_dir / "python3"))

    assert JavaScriptAnalyzer._resolve_semgrep_executable() == str(semgrep_bin)


def test_batch_runner_uses_resolved_semgrep_executable(monkeypatch, tmp_path):
    import extension_shield.core.analyzers.sast as sast_mod

    semgrep_bin = tmp_path / "semgrep"
    semgrep_bin.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    semgrep_bin.chmod(0o755)

    class _R:
        stdout = '{"results": []}'
        returncode = 0

    calls = {}

    def fake_run(cmd, **_kwargs):
        calls["cmd"] = cmd
        return _R()

    monkeypatch.setattr(
        JavaScriptAnalyzer,
        "_resolve_semgrep_executable",
        staticmethod(lambda: str(semgrep_bin)),
    )
    monkeypatch.setattr(sast_mod.subprocess, "run", fake_run)

    result = JavaScriptAnalyzer._run_semgrep_batch_scan(
        [str(tmp_path / "x.js")], str(tmp_path), "config.yaml", 30
    )

    assert calls["cmd"][0] == str(semgrep_bin)
    assert result == {"x.js": []}


# --- analyze() propagates scan_error and strips the sentinel ----------------

def test_analyze_propagates_scan_error_and_strips_sentinel(tmp_path, monkeypatch):
    (tmp_path / "bg.js").write_text("console.log(1);", encoding="utf-8")
    manifest = {**MANIFEST, "background": {"service_worker": "bg.js"}}

    monkeypatch.setattr(
        JavaScriptAnalyzer, "_is_semgrep_installed", staticmethod(lambda: True)
    )
    monkeypatch.setattr(
        JavaScriptAnalyzer,
        "_run_semgrep_batch_scan",
        staticmethod(lambda *a, **k: {"__sast_error__": [{"detail": "timeout"}]}),
    )

    result = JavaScriptAnalyzer().analyze(str(tmp_path), manifest=manifest)

    assert result.get("scan_error") is True
    assert result.get("scan_error_detail") == "timeout"
    # The sentinel must never leak into findings as a fake "file".
    assert "__sast_error__" not in (result.get("sast_findings") or {})


def test_analyze_reports_scan_error_when_semgrep_unavailable(tmp_path, monkeypatch):
    (tmp_path / "bg.js").write_text("console.log(1);", encoding="utf-8")
    manifest = {**MANIFEST, "background": {"service_worker": "bg.js"}}

    monkeypatch.setattr(
        JavaScriptAnalyzer, "_is_semgrep_installed", staticmethod(lambda: False)
    )

    result = JavaScriptAnalyzer().analyze(str(tmp_path), manifest=manifest)

    assert result["scan_error"] is True
    assert result["scan_error_detail"] == "Semgrep executable unavailable"
    assert result["sast_findings"] == {}


# --- engine forces NEEDS_REVIEW on scan_error (the false-safe is closed) -----

def test_scan_error_forces_review_even_with_clean_vt():
    sp, res = _score(
        {
            "javascript_analysis": {
                "sast_findings": {},
                "scan_error": True,
                "scan_error_detail": "timeout",
            },
            "virustotal_analysis": CLEAN_VT,
        }
    )
    assert sp.sast.scan_error is True
    assert res.decision == Decision.NEEDS_REVIEW
    assert res.decision != Decision.ALLOW


def test_clean_scan_with_clean_vt_still_allows():
    """Control: identical inputs but no scan error must still clear as ALLOW,
    proving the NEEDS_REVIEW above is caused specifically by scan_error."""
    sp, res = _score(
        {
            "javascript_analysis": {"sast_findings": {"app.js": []}, "scan_error": False},
            "virustotal_analysis": CLEAN_VT,
        }
    )
    assert sp.sast.scan_error is False
    assert res.decision == Decision.ALLOW
