"""Issue 2: history rows for missing/failed scans must be flagged needs_rescan
instead of rendering as a misleading 'NOT SAFE'/'Partial' report."""
from extension_shield.api.database import _annotate_needs_rescan


def test_orphan_supabase_stub_flagged_not_scanned():
    rows = [{"extension_id": "fpkbnjejghdcncegfglnapabnljcimdc"}]  # bare stub (no scan_results row)
    _annotate_needs_rescan(rows)
    assert rows[0]["needs_rescan"] is True
    assert rows[0]["rescan_reason"] == "not_scanned"


def test_orphan_sqlite_leftjoin_nulls_flagged_not_scanned():
    rows = [{"extension_id": "abcdefghijklmnopabcdefghijklmnop", "extension_name": None, "status": None, "security_score": None}]
    _annotate_needs_rescan(rows)
    assert rows[0]["needs_rescan"] is True
    assert rows[0]["rescan_reason"] == "not_scanned"


def test_uuid_upload_orphan_flagged_unavailable_not_rescan():
    # Uploaded/private scans use a UUID id and cannot be re-fetched from the store.
    rows = [{"extension_id": "6e441b7f-eb48-413c-823b-000000000000", "status": None, "extension_name": None}]
    _annotate_needs_rescan(rows)
    assert rows[0].get("needs_rescan") is None
    assert rows[0]["unavailable"] is True


def test_failed_row_flagged_failed():
    rows = [{"extension_id": "lhipdkibljepmfojllcfflfflhflcbgi", "extension_name": "Moonlight", "status": "failed", "security_score": 65}]
    _annotate_needs_rescan(rows)
    assert rows[0]["needs_rescan"] is True
    assert rows[0]["rescan_reason"] == "failed"


def test_completed_row_not_flagged():
    rows = [{"extension_id": "x", "extension_name": "Dark Reader", "status": "completed", "security_score": 92}]
    _annotate_needs_rescan(rows)
    assert "needs_rescan" not in rows[0]


def test_running_row_not_flagged_as_failed():
    rows = [{"extension_id": "x", "extension_name": "Foo", "status": "running"}]
    _annotate_needs_rescan(rows)
    # 'running' is neither missing nor failed → no rescan flag (it is in progress)
    assert "needs_rescan" not in rows[0]
