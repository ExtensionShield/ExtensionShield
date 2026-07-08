"""Regression tests for WebstoreStatsAdapter reputation-signal capture.

Guards the `installs` mapping fix: the webstore metadata key is `user_count`,
not `users`. Reading the wrong key made `installs` default to 0 for every
extension, so popular extensions were falsely treated as "very few users".
"""

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.governance.tool_adapters import WebstoreStatsAdapter


def _adapt(metadata):
    pack = SignalPack(scan_id="webstore-test")
    WebstoreStatsAdapter().adapt(metadata, pack)
    return pack.webstore_stats


def test_installs_read_from_user_count_key():
    """A 300k-user extension must record installs=300000, not 0."""
    stats = _adapt(
        {
            "user_count": 300000,
            "rating": 4.9,
            "ratings_count": 1600,
            "privacy_policy": "This developer discloses ...",
            "last_updated": "June 29, 2026",
        }
    )
    assert stats.installs == 300000
    # And the reputation signal is not falsely tripping the low-user penalty.
    assert stats.installs is not None and stats.installs >= 1000


def test_installs_parses_formatted_counts_and_legacy_key():
    assert _adapt({"user_count": "1,000,000+"}).installs == 1_000_000
    # Legacy `users` key still works as a fallback.
    assert _adapt({"users": "40000"}).installs == 40000


def test_has_privacy_policy_captured_when_present_and_absent():
    """Privacy-policy capture works: truthy disclosure text -> True; missing -> False."""
    assert _adapt({"user_count": 100, "privacy_policy": "discloses data ..."}).has_privacy_policy is True
    assert _adapt({"user_count": 100}).has_privacy_policy is False


def test_installs_none_when_no_user_count():
    """No user data at all -> installs is None (unknown), not a misleading 0."""
    assert _adapt({"rating": 4.0}).installs is None
