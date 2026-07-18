"""Concurrency + cache behavior for the VirusTotal rate limiter (Issue 1).

These are white-box tests of the free-tier rate limiter and the process-level
verdict cache. They do NOT hit the network.
"""
import threading
import time

import extension_shield.core.analyzers.virustotal as vt


def _reset_cache():
    with vt._vt_hash_cache_lock:
        vt._vt_hash_cache.clear()
        vt._vt_cache_hits = 0


def test_rate_limiter_reserves_up_to_limit_then_nonblocking_false():
    lim = vt._VTRateLimiter(max_per_minute=2, max_per_day=500)
    assert lim.wait(max_wait=0) is True
    assert lim.wait(max_wait=0) is True
    # Window full -> non-blocking reservation must fail immediately.
    t0 = time.monotonic()
    assert lim.wait(max_wait=0) is False
    assert time.monotonic() - t0 < 0.2  # returned fast, did not sleep


def test_rate_limiter_bounded_wait_gives_up():
    lim = vt._VTRateLimiter(max_per_minute=1, max_per_day=500)
    assert lim.wait(max_wait=0) is True
    t0 = time.monotonic()
    assert lim.wait(max_wait=0.4) is False  # no slot frees within 0.4s
    elapsed = time.monotonic() - t0
    assert 0.3 <= elapsed <= 2.0


def test_rate_limiter_does_not_sleep_while_holding_lock():
    """A thread waiting for a slot must not hold the lock while it sleeps."""
    lim = vt._VTRateLimiter(max_per_minute=1, max_per_day=500)
    assert lim.wait(max_wait=0) is True  # window now full

    def waiter():
        lim.wait(max_wait=1.5)  # will loop-sleep outside the lock, then give up

    t = threading.Thread(target=waiter, daemon=True)
    t.start()
    time.sleep(0.1)  # let the waiter enter its sleep loop
    # If the lock were held during sleep, this would block ~1.5s.
    got = lim._lock.acquire(timeout=0.5)
    if got:
        lim._lock.release()
    t.join(timeout=3)
    assert got is True, "lock was held during sleep (serialization bug)"


def test_daily_quota_marks_rate_limited():
    lim = vt._VTRateLimiter(max_per_minute=100, max_per_day=2)
    assert lim.wait(max_wait=0) is True
    assert lim.wait(max_wait=0) is True
    assert lim.wait(max_wait=0) is False
    assert lim.is_rate_limited is True


def test_cache_put_get_and_hit_counter():
    _reset_cache()
    verdict = {"found": True, "detection_stats": {"malicious": 0, "total_engines": 70}}
    vt._vt_cache_put("abc123", verdict)
    got = vt._vt_cache_get("abc123")
    assert got == verdict
    got["found"] = False  # mutating the copy must not corrupt the cache
    assert vt._vt_cache_get("abc123")["found"] is True
    assert vt.vt_cache_stats()["hits"] == 2


def test_cache_never_stores_transient_states():
    _reset_cache()
    vt._vt_cache_put("h1", {"found": False, "status": "RATE_LIMITED"})
    vt._vt_cache_put("h2", {"found": False, "status": "INVALID_KEY"})
    vt._vt_cache_put("h3", {"found": False, "error": "connection reset"})
    assert vt._vt_cache_get("h1") is None
    assert vt._vt_cache_get("h2") is None
    assert vt._vt_cache_get("h3") is None
    assert vt.vt_cache_stats()["size"] == 0


def test_cache_ttl_expiry(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(vt, "_VT_HASH_CACHE_TTL", 0.05)
    vt._vt_cache_put("short", {"found": False, "message": "Hash not found in VirusTotal database"})
    assert vt._vt_cache_get("short") is not None
    time.sleep(0.1)
    assert vt._vt_cache_get("short") is None


def test_check_sync_short_circuits_on_cache_hit(monkeypatch):
    """A cached sha256 verdict is returned without ever consulting the key pool
    (so concurrent/repeat scans of the same file spend no quota)."""
    _reset_cache()
    analyzer = vt.VirusTotalAnalyzer()
    analyzer.enabled = True
    vt._vt_cache_put("deadbeef", {"found": True, "detection_stats": {"malicious": 0, "total_engines": 60}})

    def _boom():
        raise AssertionError("key pool must not be used on a cache hit")

    monkeypatch.setattr(vt, "_get_vt_key_pool", _boom)
    result = analyzer._check_hash_virustotal_sync("deadbeef")
    assert result["found"] is True
    assert vt.vt_cache_stats()["hits"] >= 1


def test_pool_nonblocking_then_bounded():
    pool = vt._VTKeyPool(["k1"], max_per_minute=1, max_per_day=500)
    idx, key = pool.wait_and_get_key(max_wait=0)
    assert key == "k1" and idx == 0
    # window full for the single key
    assert pool.wait_and_get_key(max_wait=0) == (None, None)
    t0 = time.monotonic()
    assert pool.wait_and_get_key(max_wait=0.4) == (None, None)
    assert time.monotonic() - t0 >= 0.3
