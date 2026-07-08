"""
Regression tests for the partial-coverage guard (audit finding #11).

The bug: insufficient-data handling was all-or-nothing — it only fired when SAST,
VirusTotal, AND network analysis ALL produced no coverage. So a SAST-only scan
(SAST ran, found nothing) with NO VirusTotal and NO network analysis produced a
high-score clean ALLOW (~96/100), even though the two highest-signal analyzers
(malware + exfiltration) never ran.

The fix: when VirusTotal AND network coverage are both missing, the score is
capped into the review band and the verdict is forced to NEEDS_REVIEW — even when
SAST ran. This file pins that across the full coverage matrix.

Note: the in-repo network analyzer does not yet populate network signals, so in
practice "no network" is the common case; this guard means a scan without
VirusTotal cannot self-clear as a confident high-score ALLOW.
"""

import pytest

from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.models import Decision
from extension_shield.scoring.decision import DecisionPolicy
from extension_shield.governance.signal_pack import SastSignalPack, VirusTotalSignalPack
from tests.scoring.utils import (
    make_min_signal_pack,
    add_vt_detections,
    add_network_analysis,
    add_webstore_stats,
    make_test_manifest,
)


def _sast_clean(pack, files=12):
    pack.sast = SastSignalPack(deduped_findings=[], files_scanned=files, confidence=0.9)
    return pack


def _build(sast, vt, network):
    """Build an otherwise-clean, high-install pack with selectable coverage."""
    pack = make_min_signal_pack(scan_id=f"cov-{sast}-{vt}-{network}")
    if sast:
        _sast_clean(pack)
    if vt:
        add_vt_detections(pack, malicious_count=0, total_engines=70)
    else:
        pack.virustotal = VirusTotalSignalPack(enabled=False)
    if network:
        add_network_analysis(pack, domains=[], confidence=0.7)
    add_webstore_stats(
        pack, installs=500000, rating_avg=4.8, rating_count=5000,
        has_privacy_policy=True, last_updated="2025-12-01",
    )
    return pack


class TestPartialCoverageGuard:
    def test_sast_only_no_vt_no_network_is_not_clean_high_score_allow(self):
        """The exact audit #11 case: SAST-only, no VT, no network."""
        engine = ScoringEngine()
        pack = _build(sast=True, vt=False, network=False)
        result = engine.calculate_scores(pack, make_test_manifest())

        assert result.decision != Decision.ALLOW, "must not ALLOW without VT+network coverage"
        assert result.decision == Decision.NEEDS_REVIEW
        assert result.overall_score <= DecisionPolicy.REVIEW_SCORE
        assert result.coverage_cap_applied is True
        assert result.coverage_cap_reason and "coverage" in result.coverage_cap_reason.lower()

    def test_sast_plus_vt_can_allow(self):
        """With VT coverage present, a clean pack may ALLOW (cap does not fire)."""
        engine = ScoringEngine()
        pack = _build(sast=True, vt=True, network=False)
        result = engine.calculate_scores(pack, make_test_manifest())

        assert result.coverage_cap_applied is not True
        assert result.decision == Decision.ALLOW
        assert result.overall_score > DecisionPolicy.REVIEW_SCORE

    def test_sast_plus_network_can_allow(self):
        """With network coverage present (VT missing), the threat cap does not fire."""
        engine = ScoringEngine()
        pack = _build(sast=True, vt=False, network=True)
        result = engine.calculate_scores(pack, make_test_manifest())

        # The dedicated threat-coverage cap must not apply (network is present).
        assert result.coverage_cap_reason is None or "Limited threat coverage" not in (
            result.coverage_cap_reason or ""
        )
        assert result.decision == Decision.ALLOW

    def test_all_coverage_allows(self):
        engine = ScoringEngine()
        pack = _build(sast=True, vt=True, network=True)
        result = engine.calculate_scores(pack, make_test_manifest())
        assert result.decision == Decision.ALLOW
        assert result.coverage_cap_applied is not True

    def test_no_coverage_at_all_is_insufficient_data(self):
        """Existing all-or-nothing insufficient-data path still works."""
        engine = ScoringEngine()
        pack = _build(sast=False, vt=False, network=False)
        result = engine.calculate_scores(pack, make_test_manifest())
        assert result.insufficient_data is True
        assert result.decision == Decision.NEEDS_REVIEW
        assert result.overall_score <= 65

    def test_sast_missing_always_flags_partial_coverage(self):
        """SAST did not run but VT+network did: the coverage flag MUST be set so
        the UI can honestly show "Partial coverage" instead of "Full coverage",
        and the verdict must not ALLOW.

        Regression (recent-scans trust fix): previously coverage_cap_applied was
        only set on the SAST-missing branch when the score exceeded 80, so a
        SAST-missing scan that already computed <= 80 silently reported as fully
        covered. The flag must now be emitted for every SAST-missing scan.
        """
        engine = ScoringEngine()
        pack = _build(sast=False, vt=True, network=True)
        result = engine.calculate_scores(pack, make_test_manifest())
        assert result.coverage_cap_applied is True
        assert result.coverage_cap_reason and "sast" in result.coverage_cap_reason.lower()
        assert result.decision != Decision.ALLOW

    @pytest.mark.parametrize(
        "sast,vt,network,expect_allow",
        [
            (True, False, False, False),   # audit #11 case
            (True, True, False, True),
            (True, False, True, True),
            (True, True, True, True),
            (False, False, False, False),  # insufficient data
        ],
    )
    def test_coverage_matrix(self, sast, vt, network, expect_allow):
        engine = ScoringEngine()
        pack = _build(sast=sast, vt=vt, network=network)
        result = engine.calculate_scores(pack, make_test_manifest())
        if expect_allow:
            assert result.decision == Decision.ALLOW, (
                f"sast={sast} vt={vt} net={network}: expected ALLOW, got {result.decision}"
            )
        else:
            assert result.decision != Decision.ALLOW, (
                f"sast={sast} vt={vt} net={network}: must NOT ALLOW (got {result.decision})"
            )
