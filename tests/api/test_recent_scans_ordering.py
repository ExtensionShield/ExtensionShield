"""Recent scans must be ordered by ACTUAL last-scan time, not updated_at.

A re-scanned extension (newer scan timestamp) must appear above one that was
merely touched/refreshed more recently (newer updated_at but older scan time).
This guards against reverting the ORDER BY to updated_at, which let non-scan
events (report views, metadata refresh, batch scripts) reorder the list.
"""
from extension_shield.api.database import Database


def _completed(ext_id, name, timestamp):
    return {
        "extension_id": ext_id,
        "extension_name": name,
        "url": f"https://chromewebstore.google.com/detail/{name}/{ext_id}",
        "timestamp": timestamp,        # actual scan time -> scanned_at / timestamp col
        "status": "completed",
        "overall_security_score": 80,
        "overall_risk": "low",
        "total_findings": 0,
    }


def test_recent_ordered_by_scan_time_not_updated_at(tmp_path):
    db = Database(db_path=str(tmp_path / "order.db"))

    # 'older_scan' is scanned earlier; 'newer_scan' is scanned later.
    db.save_scan_result(_completed("a" * 32, "older-scan", "2026-06-01T00:00:00+00:00"))
    db.save_scan_result(_completed("b" * 32, "newer-scan", "2026-06-10T00:00:00+00:00"))

    # Now bump the OLDER-scanned row's updated_at to "just now" (simulates a report
    # view / metadata refresh / batch script touch — NOT a re-scan).
    db.touch_scan_result("a" * 32)

    names = [r["extension_name"] for r in db.get_recent_scans(limit=10)]
    # Scan time wins: the more-recently-SCANNED extension is on top, even though the
    # other one has a fresher updated_at.
    assert names.index("newer-scan") < names.index("older-scan")


def test_rescan_moves_extension_to_top(tmp_path):
    db = Database(db_path=str(tmp_path / "rescan.db"))
    db.save_scan_result(_completed("a" * 32, "ext-a", "2026-06-01T00:00:00+00:00"))
    db.save_scan_result(_completed("b" * 32, "ext-b", "2026-06-02T00:00:00+00:00"))
    assert db.get_recent_scans(limit=10)[0]["extension_name"] == "ext-b"

    # Re-scan ext-a with a newer scan time -> it must jump to the top.
    db.save_scan_result(_completed("a" * 32, "ext-a", "2026-06-05T00:00:00+00:00"))
    assert db.get_recent_scans(limit=10)[0]["extension_name"] == "ext-a"
