"""/api/scan/trigger must re-scan (not serve from cache) any scan that predates
the 2026-07-07 scoring/decision recalibration.

The cached path already re-scans on a store-version change or a stale
scoring_version. Those gates miss scans whose scoring_version is absent (very old
rows) or whose only stale field is the independently-versioned governance
decision. The freshness-cutoff gate closes that gap: any cached scan whose scan
time is before SCAN_FRESHNESS_CUTOFF is treated as stale and deep-rescanned, so
users never see pre-recalibration results.
"""
import importlib

import pytest

main = importlib.import_module("extension_shield.api.main")

# A fixed, unambiguous cutoff used by every test so results never depend on the
# shipped default constant.
CUTOFF = "2026-07-08T00:00:00+00:00"


@pytest.fixture(autouse=True)
def _pin_cutoff(monkeypatch):
    monkeypatch.setenv("SCAN_FRESHNESS_CUTOFF", CUTOFF)


def test_scan_before_cutoff_is_stale():
    payload = {"extension_id": "x" * 32, "timestamp": "2026-07-05T12:00:00+00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is True


def test_scan_after_cutoff_is_fresh():
    payload = {"extension_id": "x" * 32, "timestamp": "2026-07-09T12:00:00+00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is False


def test_scan_exactly_at_cutoff_is_fresh():
    # Strictly-before is stale; the cutoff instant itself is current.
    payload = {"extension_id": "x" * 32, "timestamp": CUTOFF}
    assert main._scan_predates_freshness_cutoff(payload) is False


def test_zulu_suffix_is_parsed():
    payload = {"extension_id": "x" * 32, "timestamp": "2026-07-05T12:00:00Z"}
    assert main._scan_predates_freshness_cutoff(payload) is True


def test_naive_timestamp_treated_as_utc():
    payload = {"extension_id": "x" * 32, "timestamp": "2026-07-05T12:00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is True


def test_supabase_style_scanned_at_fallback():
    # No top-level "timestamp"; falls back to scanned_at.
    payload = {"extension_id": "x" * 32, "scanned_at": "2026-07-01T00:00:00+00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is True


def test_missing_timestamp_is_not_stale():
    # Unknown scan time must NOT force a rescan (avoids a rescan storm); the
    # version gates still apply on their own.
    assert main._scan_predates_freshness_cutoff({"extension_id": "x" * 32}) is False


def test_unparseable_timestamp_is_not_stale():
    payload = {"extension_id": "x" * 32, "timestamp": "not-a-date"}
    assert main._scan_predates_freshness_cutoff(payload) is False


def test_non_dict_payload_is_not_stale():
    assert main._scan_predates_freshness_cutoff(None) is False


def test_empty_cutoff_disables_gate(monkeypatch):
    # Operators can disable the timestamp gate; even ancient scans then pass it.
    monkeypatch.setenv("SCAN_FRESHNESS_CUTOFF", "")
    payload = {"extension_id": "x" * 32, "timestamp": "2000-01-01T00:00:00+00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is False


def test_invalid_cutoff_disables_gate(monkeypatch):
    # A malformed cutoff must fail safe (disabled), never rescan everything.
    monkeypatch.setenv("SCAN_FRESHNESS_CUTOFF", "garbage")
    assert main._get_scan_freshness_cutoff() is None
    payload = {"extension_id": "x" * 32, "timestamp": "2000-01-01T00:00:00+00:00"}
    assert main._scan_predates_freshness_cutoff(payload) is False


def test_default_cutoff_is_valid_and_utc(monkeypatch):
    # The shipped default must parse to an aware UTC instant.
    monkeypatch.delenv("SCAN_FRESHNESS_CUTOFF", raising=False)
    cutoff = main._get_scan_freshness_cutoff()
    assert cutoff is not None
    assert cutoff.tzinfo is not None
    assert cutoff.utcoffset().total_seconds() == 0
