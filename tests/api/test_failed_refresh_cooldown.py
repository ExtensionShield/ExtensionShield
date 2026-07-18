"""A fresh scan failure (no prior good report) must record the failed-refresh
cooldown, so failed_stale rescans of an unfetchable extension are throttled to
once per cooldown instead of firing on every history load."""
from unittest.mock import patch

import extension_shield.api.main as main


def test_fresh_failure_records_cooldown():
    ext = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    main._failed_refresh_at.pop(ext, None)
    with patch.object(main.db, "get_scan_result", return_value=None), \
         patch.object(main.db, "save_scan_result", return_value=None):
        assert main._in_failed_refresh_cooldown(ext) is False
        main._persist_scan_failure(ext, {"extension_id": ext, "status": "failed", "security_score": 0})
        assert main._in_failed_refresh_cooldown(ext) is True
    main._failed_refresh_at.pop(ext, None)


def test_preserved_good_report_still_records_cooldown():
    ext = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    main._failed_refresh_at.pop(ext, None)
    good = {"extension_id": ext, "status": "completed", "security_score": 90}
    with patch.object(main.db, "get_scan_result", return_value=good):
        main._persist_scan_failure(ext, {"extension_id": ext, "status": "failed", "security_score": 0})
        assert main._in_failed_refresh_cooldown(ext) is True
    main._failed_refresh_at.pop(ext, None)
