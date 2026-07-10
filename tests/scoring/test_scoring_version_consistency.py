"""Regression guard: the explanation payload's ``scoring_version`` must always
match the canonical ``ScoringEngine.VERSION``.

Background (PR-1, scoring hygiene): ``explain.py`` used to hardcode a default of
``"2.0.0"`` while the engine was on ``"2.1.0"``. That default surfaced on any
path that built an explanation without explicitly passing a version (e.g.
``get_ui_explanation``), so the emitted metadata could silently drift behind the
engine. The defaults now resolve from ``ScoringEngine.VERSION``.

These tests fail if someone reintroduces a hardcoded/stale default. They assert
metadata only — no score, verdict, weight, threshold, or golden snapshot is
touched.
"""

from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.explain import (
    ExplanationBuilder,
    ExplanationPayload,
    build_explanation,
    _current_scoring_version,
)
from extension_shield.scoring.models import (
    Decision,
    ScoringResult,
    _current_scoring_version as _models_current_scoring_version,
)


def _minimal_explanation_dict():
    """Build an explanation via the real emission path with empty inputs."""
    payload = ExplanationBuilder().build(
        security_factors=[],
        privacy_factors=[],
        governance_factors=[],
        gate_results=[],
        layer_scores={"security": 100, "privacy": 100, "governance": 100},
        decision="ALLOW",
        reasons=["All checks passed"],
    )
    return payload.to_dict()


def test_helper_resolves_to_engine_version():
    assert _current_scoring_version() == ScoringEngine.VERSION


def test_builder_default_scoring_version_tracks_engine():
    # The stale hardcode ("2.0.0") must not come back as a default.
    assert ExplanationBuilder().scoring_version == ScoringEngine.VERSION
    assert ExplanationBuilder().scoring_version != "2.0.0"


def test_payload_default_scoring_version_tracks_engine():
    payload = ExplanationPayload(
        scan_id="s",
        extension_id="e",
        overall_score=100,
        decision="ALLOW",
        decision_rationale="",
    )
    assert payload.scoring_version == ScoringEngine.VERSION
    assert payload.to_dict()["scoring_version"] == ScoringEngine.VERSION


def test_emitted_explanation_metadata_matches_engine_version():
    assert _minimal_explanation_dict()["scoring_version"] == ScoringEngine.VERSION


def test_build_explanation_convenience_default_tracks_engine():
    # A minimal ScoringResult routed through the convenience function with no
    # explicit version must still emit the engine version.
    result = ScoringEngine().calculate_scores(_make_min_pack())
    payload = build_explanation(result, gate_results=[])
    assert payload.to_dict()["scoring_version"] == ScoringEngine.VERSION


def test_explicit_version_override_is_still_honored():
    # Engine passes scoring_version=self.VERSION explicitly; that path must be
    # unaffected by the default change.
    assert ExplanationBuilder(scoring_version="9.9.9").scoring_version == "9.9.9"


def _make_min_pack():
    # Local import to keep the module importable even if test utils move.
    from tests.scoring.utils import make_min_signal_pack

    return make_min_signal_pack()


# ---------------------------------------------------------------------------
# models.ScoringResult default coverage.
#
# ``ScoringResult`` used to hardcode ``scoring_version="2.0.0"``. The engine
# always overrode it (scoring_version=self.VERSION), so it was latent rather
# than live — but any ScoringResult built without an explicit version (tests,
# helpers, future callers) would emit stale metadata. The default now resolves
# from ScoringEngine.VERSION via a local lazy helper. These guards fail if the
# stale hardcode returns.
# ---------------------------------------------------------------------------

def _make_min_result():
    """A minimal ScoringResult built WITHOUT passing scoring_version."""
    return ScoringResult(
        scan_id="s",
        extension_id="e",
        security_score=100,
        privacy_score=100,
        governance_score=100,
        overall_score=100,
        decision=Decision.ALLOW,
    )


def test_models_helper_resolves_to_engine_version():
    assert _models_current_scoring_version() == ScoringEngine.VERSION


def test_scoring_result_default_scoring_version_tracks_engine():
    # The stale hardcode ("2.0.0") must not come back as a default.
    result = _make_min_result()
    assert result.scoring_version == ScoringEngine.VERSION
    assert result.scoring_version != "2.0.0"


def test_scoring_result_emitted_metadata_matches_engine_version():
    assert _make_min_result().model_dump_for_api()["scoring_version"] == ScoringEngine.VERSION


def test_scoring_result_explicit_version_override_is_still_honored():
    # The engine passes scoring_version=self.VERSION explicitly; that path must
    # remain unaffected by the default_factory change.
    result = ScoringResult(
        scan_id="s",
        extension_id="e",
        security_score=100,
        privacy_score=100,
        governance_score=100,
        overall_score=100,
        decision=Decision.ALLOW,
        scoring_version="9.9.9",
    )
    assert result.scoring_version == "9.9.9"
