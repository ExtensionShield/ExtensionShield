from typing import Any, Dict
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from extension_shield.api.main import app, scan_results


def _row(ext_id: str, verdict: str, risk_level: str = "low", score: int = 86) -> Dict[str, Any]:
    return {
        "extension_id": ext_id,
        "extension_name": "Verdict Fixture",
        "url": f"https://chromewebstore.google.com/detail/verdict-fixture/{ext_id}",
        "timestamp": "2026-07-08T12:00:00+00:00",
        "status": "completed",
        "security_score": score,
        "risk_level": risk_level,
        "total_findings": 1,
        "high_risk_count": 0,
        "medium_risk_count": 1,
        "low_risk_count": 0,
        "metadata": {},
        "manifest": {
            "name": "Verdict Fixture",
            "version": "1.0.0",
            "manifest_version": 3,
            "permissions": [],
            "host_permissions": [],
        },
        "permissions_analysis": {},
        "sast_results": {},
        "webstore_analysis": {},
        "summary": {},
        "impact_analysis": {},
        "privacy_compliance": {},
        "extracted_path": None,
        "extracted_files": [],
        "scoring_v2": {
            "scoring_version": "2.1.0",
            "overall_score": score,
            "risk_level": risk_level,
            "decision": "ALLOW",
        },
        "governance_bundle": {
            "decision": {
                "final_verdict": verdict,
                "final_authority": "test",
                "final_reasons": ["fixture"],
            }
        },
        "governance_verdict": verdict,
        "final_verdict": verdict,
    }


def test_block_result_and_recent_risk_labels_are_not_safe():
    client = TestClient(app)
    ext_id = "abcdefghijklmnopabcdefghijklmnop"
    scan_results.pop(ext_id, None)
    row = _row(ext_id, "BLOCK", "low", 86)

    with patch("extension_shield.api.main.db") as mock_db:
        mock_db.get_scan_result = MagicMock(return_value=row)
        mock_db.get_recent_scans = MagicMock(return_value=[dict(row)])

        result_response = client.get(f"/api/scan/results/{ext_id}")
        recent_response = client.get("/api/recent?limit=1")

    assert result_response.status_code == 200
    assert recent_response.status_code == 200
    assert result_response.json()["overall_risk"] not in {"low", "none"}
    assert recent_response.json()["recent"][0]["risk_level"] not in {"low", "none"}
    assert result_response.json()["overall_risk"] == recent_response.json()["recent"][0]["risk_level"]


def test_needs_review_result_and_recent_risk_labels_are_at_least_medium():
    client = TestClient(app)
    ext_id = "bcdefghijklmnopabcdefghijklmnopa"
    scan_results.pop(ext_id, None)
    row = _row(ext_id, "NEEDS_REVIEW", "low", 94)

    with patch("extension_shield.api.main.db") as mock_db:
        mock_db.get_scan_result = MagicMock(return_value=row)
        mock_db.get_recent_scans = MagicMock(return_value=[dict(row)])

        result_response = client.get(f"/api/scan/results/{ext_id}")
        recent_response = client.get("/api/recent?limit=1")

    assert result_response.status_code == 200
    assert recent_response.status_code == 200
    assert result_response.json()["overall_risk"] == "medium"
    assert recent_response.json()["recent"][0]["risk_level"] == "medium"


def test_allow_low_risk_label_is_preserved():
    client = TestClient(app)
    ext_id = "cdefghijklmnopabcdefghijklmnopab"
    scan_results.pop(ext_id, None)
    row = _row(ext_id, "ALLOW", "low", 92)
    row["scoring_v2"]["decision"] = "ALLOW"

    with patch("extension_shield.api.main.db") as mock_db:
        mock_db.get_scan_result = MagicMock(return_value=row)
        mock_db.get_recent_scans = MagicMock(return_value=[dict(row)])

        result_response = client.get(f"/api/scan/results/{ext_id}")
        recent_response = client.get("/api/recent?limit=1")

    assert result_response.status_code == 200
    assert recent_response.status_code == 200
    assert result_response.json()["overall_risk"] == "low"
    assert recent_response.json()["recent"][0]["risk_level"] == "low"
