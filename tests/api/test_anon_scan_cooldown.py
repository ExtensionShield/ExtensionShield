"""Anonymous per-IP deep-scan cooldown (3 minutes by default)."""
import importlib
from datetime import datetime, timezone, timedelta

import pytest

main = importlib.import_module("extension_shield.api.main")


class _ProdSettings:
    def is_prod(self):
        return True


@pytest.fixture(autouse=True)
def _prod_and_clean(monkeypatch):
    monkeypatch.setattr(main, "get_settings", lambda: _ProdSettings())
    monkeypatch.setattr(main, "ANONYMOUS_SCAN_COOLDOWN_SECONDS", 180)
    main._last_deep_scan_at.clear()
    yield
    main._last_deep_scan_at.clear()


def test_cooldown_active_returns_remaining():
    main._last_deep_scan_at["ip:1.2.3.4"] = datetime.now(timezone.utc) - timedelta(seconds=60)
    r = main._anon_scan_cooldown_remaining("ip:1.2.3.4")
    assert 115 <= r <= 120  # ~120s left of a 180s window


def test_authenticated_users_are_exempt():
    main._last_deep_scan_at["user-abc"] = datetime.now(timezone.utc)
    assert main._anon_scan_cooldown_remaining("user-abc") == 0  # not an ip: key


def test_no_prior_scan_no_cooldown():
    assert main._anon_scan_cooldown_remaining("ip:9.9.9.9") == 0


def test_elapsed_past_window_no_cooldown():
    main._last_deep_scan_at["ip:1.1.1.1"] = datetime.now(timezone.utc) - timedelta(seconds=200)
    assert main._anon_scan_cooldown_remaining("ip:1.1.1.1") == 0


def test_disabled_when_zero(monkeypatch):
    monkeypatch.setattr(main, "ANONYMOUS_SCAN_COOLDOWN_SECONDS", 0)
    main._last_deep_scan_at["ip:1.1.1.1"] = datetime.now(timezone.utc)
    assert main._anon_scan_cooldown_remaining("ip:1.1.1.1") == 0


def test_dev_has_no_cooldown(monkeypatch):
    class _Dev:
        def is_prod(self):
            return False
    monkeypatch.setattr(main, "get_settings", lambda: _Dev())
    main._last_deep_scan_at["ip:1.1.1.1"] = datetime.now(timezone.utc)
    assert main._anon_scan_cooldown_remaining("ip:1.1.1.1") == 0
