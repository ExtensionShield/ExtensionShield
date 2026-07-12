"""Chrome Web Store liveness — mocked tests (no live network, no live Google endpoint).

Covers the probe classification, the pure precedence resolver, durable persistence,
curated precedence, the cached/fail-open payload resolver, and the additive API join.
Store status must never mutate scores.
"""
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

import pytest

from extension_shield.api.database import Database
from extension_shield.core import store_liveness as sl


class _FakeResp:
    def __init__(self, status_code):
        self.status_code = status_code

    def close(self):
        pass


def _iso(dt):
    return dt.isoformat()


# --------------------------------------------------------------------------- probe
@pytest.mark.parametrize(
    "status_code,expected",
    # A 302 (artifact served) is UNKNOWN, never AVAILABLE — the auto probe can only
    # DISPROVE availability (204/404), never confirm the storefront listing.
    [(302, sl.UNKNOWN), (204, sl.UNAVAILABLE), (404, sl.UNAVAILABLE),
     (200, sl.UNKNOWN), (429, sl.UNKNOWN), (500, sl.UNKNOWN)],
)
def test_probe_classifies_status_codes(status_code, expected):
    with patch.object(sl, "safe_get", return_value=_FakeResp(status_code)) as m:
        result = sl.probe_store_availability("bbnmecacdlabkdobimdkklpgmllebgip")
    assert result["status"] == expected
    # Never follows redirects / downloads the CRX body.
    _, kwargs = m.call_args
    assert kwargs.get("allow_redirects") is False
    assert kwargs.get("stream") is True


def test_probe_never_confirms_available_from_302():
    """The auto probe must NEVER emit 'available' — a 302 only proves an artifact is
    served (delisted-but-served extensions return 302 too)."""
    with patch.object(sl, "safe_get", return_value=_FakeResp(302)):
        result = sl.probe_store_availability("bbnmecacdlabkdobimdkklpgmllebgip")
    assert result["status"] == sl.UNKNOWN
    assert result["status"] != sl.AVAILABLE


def test_probe_fail_open_on_network_error():
    with patch.object(sl, "safe_get", side_effect=OSError("boom")):
        result = sl.probe_store_availability("bbnmecacdlabkdobimdkklpgmllebgip")
    assert result["status"] == sl.UNKNOWN  # never raises


# ------------------------------------------------------------------- resolver rules
def test_resolve_curated_never_overwritten_by_probe():
    current = {"store_status": "unavailable", "store_status_source": sl.SOURCE_CURATED}
    for probe_status in (sl.AVAILABLE, sl.UNAVAILABLE, sl.UNKNOWN):
        out = sl.resolve_store_status(current, {"status": probe_status, "reason": "x", "checked_at": "t"})
        assert out is None


def test_resolve_unknown_never_overwrites_confirmed():
    for confirmed in (sl.AVAILABLE, sl.UNAVAILABLE):
        current = {"store_status": confirmed, "store_status_source": sl.SOURCE_AUTO}
        out = sl.resolve_store_status(current, {"status": sl.UNKNOWN, "reason": "x", "checked_at": "t"})
        assert out is None


def test_resolve_unknown_writes_when_no_prior_confirmed():
    out = sl.resolve_store_status(None, {"status": sl.UNKNOWN, "reason": "x", "checked_at": "t"})
    assert out and out["store_status"] == sl.UNKNOWN


def test_resolve_unavailable_sets_first_detected_once():
    now = "2026-07-11T00:00:00+00:00"
    first = sl.resolve_store_status(None, {"status": sl.UNAVAILABLE, "reason": "r", "checked_at": now}, now=now)
    assert first["first_detected_unavailable_at"] == now
    # A later unavailable probe must PRESERVE the original first-detected timestamp.
    current = {"store_status": "unavailable", "store_status_source": "auto",
               "first_detected_unavailable_at": now}
    later = sl.resolve_store_status(current, {"status": sl.UNAVAILABLE, "reason": "r", "checked_at": "2026-08-01T00:00:00+00:00"})
    assert later["first_detected_unavailable_at"] == now


def test_resolve_available_updates_last_seen():
    now = "2026-07-11T00:00:00+00:00"
    out = sl.resolve_store_status(None, {"status": sl.AVAILABLE, "reason": "r", "checked_at": now}, now=now)
    assert out["store_status"] == sl.AVAILABLE and out["last_seen_available_at"] == now


# --------------------------------------------------------------------- persistence
def test_db_roundtrip_and_keyed_by_extension_id(tmp_path):
    db = Database(db_path=str(tmp_path / "liveness.db"))
    ext = "bbnmecacdlabkdobimdkklpgmllebgip"
    assert db.get_store_status(ext) is None
    db.upsert_store_status(ext, store_status="unavailable", store_status_reason="r",
                           store_status_source="auto", store_status_checked_at="t",
                           first_detected_unavailable_at="t", last_seen_available_at=None)
    row = db.get_store_status(ext)
    assert row["extension_id"] == ext and row["store_status"] == "unavailable"
    # Second upsert updates the SAME row (extension-level, not per-scan duplication).
    db.upsert_store_status(ext, store_status="available", store_status_source="auto",
                           store_status_checked_at="t2")
    assert db.get_store_status(ext)["store_status"] == "available"


def test_set_curated_status_wins_and_stamps_first_detected(tmp_path):
    db = Database(db_path=str(tmp_path / "curated.db"))
    ext = "ijickplbjolieoligpppakdmfdajmgij"
    assert sl.set_curated_status(db, ext, "unavailable", reason="delisted") is True
    row = db.get_store_status(ext)
    assert row["store_status"] == "unavailable"
    assert row["store_status_source"] == sl.SOURCE_CURATED
    assert row["first_detected_unavailable_at"] is not None


# --------------------------------------------------- cached / fail-open payload path
def test_payload_curated_skips_probe(tmp_path):
    db = Database(db_path=str(tmp_path / "c.db"))
    ext = "ijickplbjolieoligpppakdmfdajmgij"
    sl.set_curated_status(db, ext, "unavailable")
    with patch.object(sl, "probe_store_availability", side_effect=AssertionError("must not probe")):
        out = sl.get_store_status_for_payload(db, ext)
    assert out["status"] == "unavailable"


def test_payload_fresh_cache_skips_probe(tmp_path):
    db = Database(db_path=str(tmp_path / "f.db"))
    ext = "cjpalhdlnbpafiamejdnhcphjbkeiagm"
    fresh = _iso(datetime.now(timezone.utc))
    db.upsert_store_status(ext, store_status="available", store_status_source="auto",
                           store_status_checked_at=fresh, last_seen_available_at=fresh)
    with patch.object(sl, "probe_store_availability", side_effect=AssertionError("must not probe")):
        out = sl.get_store_status_for_payload(db, ext)
    assert out["status"] == "available"


def test_payload_stale_triggers_probe_and_persists(tmp_path):
    db = Database(db_path=str(tmp_path / "s.db"))
    ext = "cjpalhdlnbpafiamejdnhcphjbkeiagm"
    stale = _iso(datetime.now(timezone.utc) - timedelta(days=3))
    db.upsert_store_status(ext, store_status="available", store_status_source="auto",
                           store_status_checked_at=stale, last_seen_available_at=stale)
    with patch.object(sl, "probe_store_availability",
                      return_value={"status": sl.UNAVAILABLE, "reason": sl.REASON_UNAVAILABLE,
                                    "checked_at": _iso(datetime.now(timezone.utc))}):
        out = sl.get_store_status_for_payload(db, ext)
    assert out["status"] == "unavailable"
    assert db.get_store_status(ext)["store_status"] == "unavailable"


def test_payload_probe_error_fails_open(tmp_path):
    db = Database(db_path=str(tmp_path / "e.db"))
    ext = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    with patch.object(sl, "probe_store_availability", side_effect=RuntimeError("google down")):
        out = sl.get_store_status_for_payload(db, ext)  # must not raise
    assert out["status"] == "unknown"


def test_public_status_hides_internal_source():
    row = {"store_status": "unavailable", "store_status_reason": "r",
           "store_status_source": "curated", "store_status_checked_at": "t",
           "first_detected_unavailable_at": "t"}
    pub = sl.public_status(row)
    assert set(pub.keys()) == {"status", "reason", "checked_at", "first_detected_unavailable_at"}
    assert "store_status_source" not in pub


# ------------------------------------------------------- API join does not touch scores
def test_attach_store_status_is_additive_and_score_safe(tmp_path):
    import extension_shield.api.main as main
    db = Database(db_path=str(tmp_path / "join.db"))
    ext = "bbnmecacdlabkdobimdkklpgmllebgip"
    sl.set_curated_status(db, ext, "unavailable", reason="delisted")
    payload = {"extension_id": ext, "scoring_v2": {"overall_score": 94, "security_score": 92},
               "security_score": 94}
    with patch.object(main, "db", db):
        main._attach_store_status(payload)
    assert payload["store_status"]["status"] == "unavailable"
    # Historical scores are untouched by the availability join.
    assert payload["scoring_v2"] == {"overall_score": 94, "security_score": 92}
    assert payload["security_score"] == 94


# ------------------------------------------------ addendum: 302=unknown + view gating
def test_payload_302_yields_unknown_never_available(tmp_path):
    """A 302 probe (artifact served) leaves effective status UNKNOWN, never available;
    the normal report renders only because unknown fails open."""
    db = Database(db_path=str(tmp_path / "u.db"))
    ext = "cjpalhdlnbpafiamejdnhcphjbkeiagm"
    with patch.object(sl, "safe_get", return_value=_FakeResp(302)):
        out = sl.get_store_status_for_payload(db, ext)
    assert out["status"] == "unknown"
    assert out["status"] != "available"
    # Nothing durable claims availability from a 302.
    row = db.get_store_status(ext)
    assert (row or {}).get("store_status") != "available"


def test_curated_unavailable_wins_over_later_302(tmp_path):
    """Curated 'unavailable' must not be flipped by a later automatic 302 (which is
    only 'artifact served'). Curated short-circuits the probe entirely."""
    db = Database(db_path=str(tmp_path / "w.db"))
    ext = "bbnmecacdlabkdobimdkklpgmllebgip"
    sl.set_curated_status(db, ext, "unavailable", reason="delisted")
    with patch.object(sl, "safe_get", return_value=_FakeResp(302)):
        out = sl.get_store_status_for_payload(db, ext)
    assert out["status"] == "unavailable"
    assert db.get_store_status(ext)["store_status_source"] == "curated"


def test_attach_gates_already_scanned_removed_without_probe_or_rescan(tmp_path):
    """An already-scanned (completed) cached result that is curated-unavailable gates
    to unavailable on VIEW, with no probe/network/rescan and no score mutation."""
    import extension_shield.api.main as main
    db = Database(db_path=str(tmp_path / "g.db"))
    ext = "bbnmecacdlabkdobimdkklpgmllebgip"
    sl.set_curated_status(db, ext, "unavailable", reason="delisted")
    payload = {"extension_id": ext, "status": "completed",
               "scoring_v2": {"overall_score": 94}, "overall_security_score": 94}
    # If the view path tried to probe (network) or rescan, this would raise.
    with patch.object(main, "db", db), \
         patch.object(sl, "probe_store_availability", side_effect=AssertionError("no probe")):
        main._attach_store_status(payload)
    assert payload["store_status"]["status"] == "unavailable"
    assert payload["scoring_v2"] == {"overall_score": 94}      # scores unmutated
    assert payload["overall_security_score"] == 94


def test_attach_is_independent_of_scan_timestamp(tmp_path):
    """Result-view gating does not depend on the scan's freshness/timestamp: a
    pre-cutoff and a post-cutoff payload both receive the same effective store_status."""
    import extension_shield.api.main as main
    db = Database(db_path=str(tmp_path / "t.db"))
    ext = "ijickplbjolieoligpppakdmfdajmgij"
    sl.set_curated_status(db, ext, "unavailable")
    old = {"extension_id": ext, "timestamp": "2020-01-01T00:00:00+00:00"}
    new = {"extension_id": ext, "timestamp": "2026-12-31T00:00:00+00:00"}
    with patch.object(main, "db", db), \
         patch.object(sl, "probe_store_availability", side_effect=AssertionError("no probe")):
        main._attach_store_status(old)
        main._attach_store_status(new)
    assert old["store_status"]["status"] == "unavailable"
    assert new["store_status"]["status"] == old["store_status"]["status"]
