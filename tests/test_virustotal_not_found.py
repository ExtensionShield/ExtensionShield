"""
Regression tests for VirusTotal not-found handling.

Correctness rule: a file that is NOT present in VirusTotal is missing
intelligence, NOT a clean result. The analyzer summary must report
threat_level="unknown" (not "clean") when no scanned file was found in VT.
"""

from extension_shield.core.analyzers.virustotal import VirusTotalAnalyzer


def _analyzer_with_file(tmp_path):
    """Build an enabled analyzer pointed at a dir containing one JS file."""
    (tmp_path / "background.js").write_text("console.log('hello');", encoding="utf-8")
    analyzer = VirusTotalAnalyzer()
    # Force enabled so analyze() runs the aggregation path without real keys.
    analyzer.enabled = True
    return analyzer


def test_not_found_is_unknown_not_clean(tmp_path, monkeypatch):
    """All files absent from VirusTotal -> threat_level 'unknown', never 'clean'."""
    analyzer = _analyzer_with_file(tmp_path)
    monkeypatch.setattr(
        analyzer,
        "_check_hash_virustotal_sync",
        lambda _h: {"found": False, "message": "Hash not found in VirusTotal database"},
    )

    result = analyzer.analyze(str(tmp_path))

    assert result["files_analyzed"] >= 1
    assert result["files_found_in_vt"] == 0
    assert result["summary"]["threat_level"] == "unknown"
    assert result["summary"]["threat_level"] != "clean"


def test_found_with_zero_detections_is_clean(tmp_path, monkeypatch):
    """File present in VT with engine coverage and no detections -> 'clean'."""
    analyzer = _analyzer_with_file(tmp_path)
    monkeypatch.setattr(
        analyzer,
        "_check_hash_virustotal_sync",
        lambda _h: {
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
    )

    result = analyzer.analyze(str(tmp_path))

    assert result["files_found_in_vt"] >= 1
    assert result["summary"]["threat_level"] == "clean"


def test_malicious_detection_is_malicious(tmp_path, monkeypatch):
    """File flagged by engines -> 'malicious'."""
    analyzer = _analyzer_with_file(tmp_path)
    monkeypatch.setattr(
        analyzer,
        "_check_hash_virustotal_sync",
        lambda _h: {
            "found": True,
            "detection_stats": {
                "malicious": 8,
                "suspicious": 0,
                "undetected": 62,
                "harmless": 0,
                "total_engines": 70,
            },
            "malware_families": ["Trojan.Gen"],
        },
    )

    result = analyzer.analyze(str(tmp_path))

    assert result["total_malicious"] == 8
    assert result["summary"]["threat_level"] == "malicious"
