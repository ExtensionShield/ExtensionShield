"""Endpoint-level guards for the recent-list self-heal and the Safe forced rescan.

These exercise the wiring that unit tests of the helpers cannot:
  * GET /api/recent must self-heal a stale governance verdict on the emitted row.
  * POST /api/scan/trigger must deep-rescan a cached scan that predates the
    freshness cutoff (incl. legacy rows with no scoring_version that model_stale
    misses), and must NOT rescan a post-cutoff row.
  * A cutoff/model staleness rescan is system-initiated: it must not consume the
    user's daily deep-scan credit.
  * A failed rescan must not overwrite a previously-good cached report.
"""
import copy
import importlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

main = importlib.import_module("extension_shield.api.main")
from extension_shield.scoring.engine import ScoringEngine

EXT_ID = "a" * 32
STORE_URL = f"https://chromewebstore.google.com/detail/test/{EXT_ID}"
CUTOFF = "2026-07-08T00:00:00+00:00"
PRE_CUTOFF = "2026-07-01T00:00:00+00:00"
POST_CUTOFF = "2026-07-20T00:00:00+00:00"


@pytest.fixture
def client():
    return TestClient(main.app)


@pytest.fixture(autouse=True)
def _pin_cutoff(monkeypatch):
    monkeypatch.setenv("SCAN_FRESHNESS_CUTOFF", CUTOFF)


@pytest.fixture(autouse=True)
def _clean_caches():
    for d in (main.scan_results, main.scan_status, main._failed_refresh_at):
        d.pop(EXT_ID, None)
    yield
    for d in (main.scan_results, main.scan_status, main._failed_refresh_at):
        d.pop(EXT_ID, None)


def _dataflow_bundle(stale_final="BLOCK", decision_version=None):
    """A real, recomputable bundle: DATAFLOW_TRACE + no declared categories recomputes
    a stale BLOCK to NEEDS_REVIEW under the current rulepacks (see the sibling
    test_governance_decision_selfheal scenario)."""
    decision = {"final_verdict": stale_final, "final_authority": "stale", "final_reasons": []}
    if decision_version is not None:
        decision["decision_version"] = decision_version
    return {
        "signals": {"signals": [{"type": "DATAFLOW_TRACE"}]},
        "store_listing": {
            "extraction": {"status": "ok"},
            "declared_third_parties": [],
            "declared_data_categories": [],
        },
        "facts": {},
        "context": {"rulepacks": ["CWS_LIMITED_USE", "ENTERPRISE_GOV_BASELINE"]},
        "scoring_v2": {
            "overall_score": 90, "security_score": 90,
            "privacy_score": 90, "governance_score": 90,
            "overall_confidence": 0.85, "decision": "ALLOW",
            "gate_results": [], "scoring_version": "2.0.0",
            "security_layer": {"score": 90, "factors": []},
            "privacy_layer": {"score": 90, "factors": []},
            "governance_layer": {"score": 90, "factors": []},
        },
        "decision": decision,
    }


# --------------------------------------------------------------------------- #
# GET /api/recent self-heal
# --------------------------------------------------------------------------- #
def test_recent_endpoint_selfheals_stale_verdict(client):
    bundle = _dataflow_bundle(stale_final="BLOCK")  # no decision_version -> stale
    row = {
        "extension_id": EXT_ID,
        "extension_name": "Dataflow Ext",
        "governance_bundle": bundle,               # DB lifts summary.governance_bundle here
        "summary": {"governance_bundle": bundle},
        "scoring_v2": bundle["scoring_v2"],
    }
    with patch.object(main.db, "get_recent_scans", return_value=[copy.deepcopy(row)]):
        r = client.get("/api/recent?limit=5")
    assert r.status_code == 200
    emitted = r.json()["recent"][0]
    # The endpoint must serve the RECOMPUTED verdict, not the stale stored BLOCK.
    assert emitted["final_verdict"] == "NEEDS_REVIEW"
    assert emitted["governance_verdict"] == "NEEDS_REVIEW"
    assert emitted["governance_bundle"]["decision"]["final_verdict"] == "NEEDS_REVIEW"


# --------------------------------------------------------------------------- #
# POST /api/scan/trigger freshness gate
# --------------------------------------------------------------------------- #
def _seed_cached(timestamp, scoring_version):
    sv2 = {"scoring_version": scoring_version} if scoring_version is not None else {}
    main.scan_results[EXT_ID] = {
        "extension_id": EXT_ID,
        "url": STORE_URL,
        "status": "completed",
        "timestamp": timestamp,
        "manifest": {"version": "1.0.0"},
        "scoring_v2": sv2,
    }


def test_trigger_rescans_precutoff_cached_row_without_consuming_credit(client):
    # Current scoring_version (model_stale=False) + pre-cutoff timestamp: only the
    # freshness cutoff makes it stale.
    _seed_cached(PRE_CUTOFF, ScoringEngine.VERSION)
    consume = MagicMock()
    with patch.object(main, "_fast_live_version_check", return_value=None), \
         patch.object(main, "run_analysis_workflow", AsyncMock()), \
         patch.object(main, "_consume_deep_scan", consume):
        r = client.post("/api/scan/trigger", json={"url": STORE_URL})
    assert r.status_code == 200
    body = r.json()
    # A rescan was started (NOT an instant cached lookup) — this is the gate contract.
    assert body["already_scanned"] is False
    assert body["scan_type"] == "deep_scan"
    # System-initiated staleness refresh must not spend the user's daily credit.
    consume.assert_not_called()


def test_trigger_rescans_none_version_precutoff_row(client):
    # scoring_version=None: model_stale can NOT see this row; only cutoff_stale can.
    _seed_cached(PRE_CUTOFF, None)
    with patch.object(main, "_fast_live_version_check", return_value=None), \
         patch.object(main, "run_analysis_workflow", AsyncMock()), \
         patch.object(main, "_consume_deep_scan", MagicMock()):
        r = client.post("/api/scan/trigger", json={"url": STORE_URL})
    assert r.status_code == 200
    assert r.json()["already_scanned"] is False


def test_failed_refresh_cooldown_suppresses_repeat_rescan(client):
    # A recently-failed staleness refresh of a still-pre-cutoff row must NOT rescan
    # again on the next lookup — serve the preserved cached report instead.
    _seed_cached(PRE_CUTOFF, ScoringEngine.VERSION)
    main._note_failed_refresh(EXT_ID)
    with patch.object(main, "_fast_live_version_check", return_value=None), \
         patch.object(main, "run_analysis_workflow", AsyncMock()) as rw:
        r = client.post("/api/scan/trigger", json={"url": STORE_URL})
    assert r.status_code == 200
    body = r.json()
    assert body["already_scanned"] is True
    assert body["scan_type"] == "lookup"
    rw.assert_not_called()


def test_persist_scan_failure_records_cooldown_when_preserving():
    failed = {"extension_id": EXT_ID, "status": "failed"}
    good_row = {"extension_id": EXT_ID, "status": "completed"}
    with patch.object(main.db, "get_scan_result", return_value=good_row), \
         patch.object(main.db, "save_scan_result", MagicMock()):
        main._persist_scan_failure(EXT_ID, failed)
    assert main._in_failed_refresh_cooldown(EXT_ID) is True


def test_trigger_serves_postcutoff_cached_row_instantly(client):
    _seed_cached(POST_CUTOFF, ScoringEngine.VERSION)
    with patch.object(main, "_fast_live_version_check", return_value=None), \
         patch.object(main, "run_analysis_workflow", AsyncMock()) as rw:
        r = client.post("/api/scan/trigger", json={"url": STORE_URL})
    assert r.status_code == 200
    body = r.json()
    # Fresh cached scan: instant lookup, no rescan queued.
    assert body["already_scanned"] is True
    assert body["scan_type"] == "lookup"
    rw.assert_not_called()


# --------------------------------------------------------------------------- #
# Non-destructive failure guard
# --------------------------------------------------------------------------- #
def test_persist_scan_failure_preserves_prior_good_result():
    failed = {"extension_id": EXT_ID, "status": "failed", "overall_security_score": 0}
    good_row = {"extension_id": EXT_ID, "status": "completed", "security_score": 80}
    save = MagicMock()
    with patch.object(main.db, "get_scan_result", return_value=good_row), \
         patch.object(main.db, "save_scan_result", save):
        main._persist_scan_failure(EXT_ID, failed)
    # The good result must NOT be overwritten with the failed placeholder...
    save.assert_not_called()
    assert main.scan_results.get(EXT_ID) != failed
    # ...and the status stays completed so users still see the last good report.
    assert main.scan_status.get(EXT_ID) == "completed"


def test_persist_scan_failure_stores_when_no_prior_result():
    failed = {"extension_id": EXT_ID, "status": "failed", "overall_security_score": 0}
    save = MagicMock()
    with patch.object(main.db, "get_scan_result", return_value=None), \
         patch.object(main.db, "save_scan_result", save):
        main._persist_scan_failure(EXT_ID, failed)
    # No prior good result -> the failure is recorded as before.
    save.assert_called_once()
    assert main.scan_results.get(EXT_ID) == failed
    assert main.scan_status.get(EXT_ID) == "failed"
