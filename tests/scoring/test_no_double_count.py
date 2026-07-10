"""No-double-count guardrails (PR-1 tracking + one hard invariant).

These tests DO NOT change scoring behavior. They pin the *current* state of the
known duplicate-risk areas surfaced by the backend scoring audit so that the
future de-duplication PRs (PR-2/PR-3) are forced to update them deliberately,
and they enforce the one invariant that must hold in every version:

    reputation / maintenance context can never, by itself, produce a BLOCK.

Duplicate-risk trackers (documented, not yet fixed — see
docs/adr/0002-scoring-layer-ownership.md):

  * privacy-policy absence is scored in BOTH Security (Webstore) and Governance
    (DisclosureAlignment).
  * broad-host access is counted in BOTH Security (Manifest posture) and Privacy
    (PermissionCombos).
  * ToS bare prohibited-permission declaration is represented by BOTH a scoring
    factor (ToSViolations) and a hard gate (TOS_VIOLATION) — the one remaining
    open duplicate, deferred to PR-3c. (purpose-mismatch and exfil were audited
    in PR-3b as intentionally layered on DISJOINT evidence — a soft aggregate
    factor vs. a hard, corroboration-gated gate — and are now locked by the
    guardrail tests below, not trackers.)

When a future PR consolidates an owner, the corresponding assertion below will
flip — that is the intended signal to update the tracker (and the ADR).
"""

import pytest

from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.gates import HardGates
from extension_shield.scoring.decision import resolve, DecisionPolicy
from extension_shield.scoring.models import Decision
from extension_shield.scoring.weights import SECURITY_WEIGHTS_V1
from extension_shield.governance.signal_pack import (
    WebstoreStatsSignalPack,
    PermissionsSignalPack,
    SastSignalPack,
    VirusTotalSignalPack,
)
from tests.scoring.utils import make_min_signal_pack, make_sast_finding


MV3_MANIFEST = {"name": "Test Extension", "description": "a tool", "manifest_version": 3}
REPUTATION_FACTORS = {"Webstore", "ChromeStats", "Maintenance"}


def _factors_by_name(layer):
    return {f.name: f for f in (layer.factors if layer else [])}


def _all_factor_names(result):
    names = set()
    for layer in (result.security_layer, result.privacy_layer, result.governance_layer):
        names |= set(_factors_by_name(layer).keys())
    return names


# ---------------------------------------------------------------------------
# Duplicate-risk trackers (current state; flip when a single owner is chosen)
# ---------------------------------------------------------------------------

def test_privacy_policy_scored_only_by_governance_disclosure():
    """PR-2 (DONE): Governance/DisclosureAlignment is the SOLE scored owner of
    privacy-policy absence (scoring_version 2.1.1, ADR 0002).

    The Security/Webstore factor no longer adds severity for a missing privacy
    policy — it may still surface ``no_privacy_policy`` as listing context. This
    is a permanent regression guard: it fails if the Webstore double-count is
    reintroduced, or if DisclosureAlignment stops scoring it.
    """
    from extension_shield.scoring.normalizers import normalize_webstore_trust

    def _webstore(has_pp):
        # Identical listing (clean rating/installs) apart from privacy policy, so
        # any severity delta can only come from privacy-policy scoring.
        return WebstoreStatsSignalPack(
            has_privacy_policy=has_pp, rating_avg=4.5, installs=100_000,
            last_updated="June 1, 2026",
        )

    sev_with_pp = normalize_webstore_trust(_webstore(True)).severity
    sev_without_pp = normalize_webstore_trust(_webstore(False)).severity

    # Webstore must NOT score privacy-policy absence: severity is unchanged.
    assert sev_without_pp == sev_with_pp, (
        "Webstore/Security must not add severity for a missing privacy policy "
        "(owned by Governance/DisclosureAlignment)"
    )

    # ...but it may still carry the flag as listing context/evidence (kept intact).
    webstore_no_pp = normalize_webstore_trust(_webstore(False))
    assert "no_privacy_policy" in webstore_no_pp.flags
    assert webstore_no_pp.details.get("has_privacy_policy") is False

    # Governance/DisclosureAlignment IS the sole scored owner (with data collection).
    pack = make_min_signal_pack()
    pack.webstore_stats = _webstore(False)
    pack.permissions = PermissionsSignalPack(
        api_permissions=["cookies"], high_risk_permissions=["cookies"], total_permissions=1
    )
    result = ScoringEngine().calculate_scores(pack, manifest=MV3_MANIFEST)
    gov = _factors_by_name(result.governance_layer)
    assert any("no_privacy_policy" in flag for flag in gov["DisclosureAlignment"].flags)
    assert gov["DisclosureAlignment"].severity > 0


def _broad_host_perms(**overrides):
    kwargs = dict(
        api_permissions=["tabs"],
        host_permissions=["<all_urls>"],
        has_broad_host_access=True,
        broad_host_patterns=["<all_urls>"],
        total_permissions=1,
    )
    kwargs.update(overrides)
    return PermissionsSignalPack(**kwargs)


def test_broad_host_scored_only_by_permission_combos():
    """PR-3a (DONE): bare broad-host access is scored ONLY by
    Privacy/PermissionCombos (scoring_version 2.1.2, ADR 0002).

    The Security/Manifest posture factor no longer adds severity for bare
    broad-host access — it may still surface ``broad_host_access`` as manifest
    context. Permanent regression guard: fails if the Manifest double-count is
    reintroduced, or if PermissionCombos stops scoring broad-host.
    """
    from extension_shield.scoring.normalizers import (
        normalize_manifest_posture,
        normalize_permission_combos,
    )

    broad = _broad_host_perms()
    narrow = _broad_host_perms(host_permissions=[], has_broad_host_access=False,
                               broad_host_patterns=[])

    # Manifest posture must NOT score bare broad-host: severity unchanged.
    sev_broad = normalize_manifest_posture({"manifest_version": 3}, broad).severity
    sev_narrow = normalize_manifest_posture({"manifest_version": 3}, narrow).severity
    assert sev_broad == sev_narrow, (
        "Manifest/Security must not add severity for bare broad-host access "
        "(owned by Privacy/PermissionCombos)"
    )

    # ...but Manifest keeps broad_host_access as context/evidence (kept intact).
    manifest_broad = normalize_manifest_posture({"manifest_version": 3}, broad)
    assert "broad_host_access" in manifest_broad.flags
    assert manifest_broad.details.get("has_broad_host_access") is True

    # Privacy/PermissionCombos IS the sole scored owner: broad-host adds severity.
    combos = normalize_permission_combos(broad)
    assert combos.severity > 0
    assert "broad_host_access" in combos.details.get("triggered_combos", [])


def test_broad_host_compound_uses_unchanged():
    """PR-3a leaves the four COMPOUND (AND-conditioned) broad-host uses intact —
    these are distinct behaviors, not duplicates of the bare-capability signal.
    """
    from extension_shield.scoring.normalizers import (
        normalize_capture_signals,
        normalize_network_exfil,
    )
    from extension_shield.governance.signal_pack import NetworkSignalPack

    # (1) ToSViolations: broad-host + VirusTotal malicious detection (engine).
    tos_pack = make_min_signal_pack()
    tos_pack.permissions = _broad_host_perms()
    tos_pack.virustotal = VirusTotalSignalPack(enabled=True, total_engines=70, malicious_count=3)
    gov = _factors_by_name(
        ScoringEngine().calculate_scores(tos_pack, manifest=MV3_MANIFEST).governance_layer
    )
    assert "broad_access_with_vt_detection" in gov["ToSViolations"].flags

    # (2) CaptureSignals: capture permission + broad-host (normalizer). The
    #     compound signal is recorded in details["capture_signals"].
    capture = normalize_capture_signals(
        _broad_host_perms(api_permissions=["tabCapture"]),
        {"name": "Some Tool", "description": "does things"},
    )
    assert "capture_with_network" in capture.details.get("capture_signals", [])
    assert capture.details.get("has_network_access") is True

    # (3) NetworkExfil: broad-host contributes base exfil risk when analysis ran.
    net = normalize_network_exfil(
        NetworkSignalPack(enabled=True, confidence=0.9), _broad_host_perms()
    )
    assert net.details.get("has_network_permissions") is True
    assert net.severity > 0

    # (4) DisclosureAlignment: broad-host as governance qualifier when no privacy
    #     policy and no direct data-collection perms (engine, elif has_network).
    disc_pack = make_min_signal_pack()
    disc_pack.webstore_stats = WebstoreStatsSignalPack(has_privacy_policy=False)
    disc_pack.permissions = _broad_host_perms(high_risk_permissions=[])
    gov2 = _factors_by_name(
        ScoringEngine().calculate_scores(disc_pack, manifest=MV3_MANIFEST).governance_layer
    )
    assert "no_privacy_policy_with_network" in gov2["DisclosureAlignment"].flags


# PR-3b audited purpose-mismatch and exfil as intentionally layered on disjoint
# evidence (see the guardrail tests below and ADR 0002 §4). The ToS bare
# prohibited-permission case remains a genuine narrow duplicate and stays a
# tracker until PR-3c converts it — kept EXACTLY as-is here.
@pytest.mark.parametrize(
    "factor_name, gate_id",
    [
        ("ToSViolations", "TOS_VIOLATION"),   # ToS / policy — open duplicate, PR-3c
    ],
)
def test_tracker_concept_represented_by_both_factor_and_gate(factor_name, gate_id):
    """TRACKING: each concept is represented by BOTH a scoring factor and a gate.

    This is allowed by design (a graded factor + a hard-stop gate), but PR-3
    must ensure the SAME piece of evidence is not double-penalized (factor
    severity AND gate penalty) without explicit intent. This test documents the
    dual representation; refine it when the de-dup design lands.
    """
    result = ScoringEngine().calculate_scores(make_min_signal_pack(), manifest=MV3_MANIFEST)
    assert factor_name in _all_factor_names(result)
    assert gate_id in HardGates.GATES


# ---------------------------------------------------------------------------
# PR-3b: factor-vs-gate audited as intentionally layered (disjoint evidence).
# These are guardrails, not trackers — they must keep passing. They read only
# existing FactorScore / GateResult outputs; they change no scoring behavior.
# ---------------------------------------------------------------------------

def _remote_code_sast_pack():
    """A SAST finding classified as remote-code loading (concrete PURPOSE_MISMATCH
    BLOCK evidence), on a non-benign, non-offline manifest with no broad-host — so
    the Consistency factor's indirect aggregate trigger cannot fire."""
    pack = make_min_signal_pack()
    pack.sast = SastSignalPack(
        deduped_findings=[
            make_sast_finding(
                # Behavior suffix `dynamic_script_loading` is in gates._PM_REMOTE_CODE
                # -> classified as remote-code, a standalone-concrete BLOCK reason.
                check_id="custom.remote.dynamic_script_loading",
                file_path="src/loader.js",
                line_number=42,
                severity="MEDIUM",
                message="loads a script element from a remote URL",
                code_snippet="const s=document.createElement('script');s.src=cfg.remote;document.head.appendChild(s)",
            )
        ],
        files_scanned=5,
        confidence=0.9,
    )
    # A plain sensitive perm, no broad host — unrelated to the SAST classification.
    pack.permissions = PermissionsSignalPack(api_permissions=["storage"], total_permissions=1)
    return pack


def test_purpose_mismatch_gate_and_consistency_factor_use_disjoint_evidence():
    """PURPOSE_MISMATCH (gate) and Consistency (factor) read DISJOINT evidence, so
    they are intentionally layered — not a duplicate.

    * The gate BLOCKS on DIRECT SAST-classified behavior (remote-code loading,
      gates.py:1006-1007), via the concrete rule-suffix taxonomy.
    * The Consistency factor (engine.py ~651-695) only fires on an INDIRECT
      aggregate — a benign purpose claim + a high-severity signal, or an
      "offline" claim + broad-host — and never inspects SAST behavior.

    With a non-benign manifest the same fixture BLOCKS the gate while leaving
    Consistency at severity 0 with no flag referencing the SAST evidence.
    """
    pack = _remote_code_sast_pack()
    manifest = {
        "name": "Data Sync Pro",
        "description": "syncs your data across devices",
        "manifest_version": 3,
    }

    # Gate: DIRECT SAST remote-code behavior -> BLOCK/triggered.
    gate = HardGates().evaluate_purpose_mismatch(manifest, pack.sast, pack.permissions)
    assert gate.triggered is True
    assert gate.decision == "BLOCK"
    assert "dynamic_script_loading" in gate.details.get("remote_code", [])

    # Factor: INDIRECT aggregate did not fire (non-benign name, no "offline"
    # claim, no broad-host) -> severity 0 and no SAST-derived flag. This proves
    # Consistency never consumed the gate's SAST evidence.
    result = ScoringEngine().calculate_scores(pack, manifest=manifest)
    consistency = _factors_by_name(result.governance_layer)["Consistency"]
    assert consistency.severity == 0.0
    assert not any(
        ("dynamic_script_loading" in f) or ("remote" in f.lower()) or ("sast" in f.lower())
        for f in consistency.flags
    )


def test_sensitive_exfil_gate_and_network_factor_use_disjoint_evidence():
    """SENSITIVE_EXFIL (gate) and NetworkExfil (factor) read DISJOINT evidence.

    * The NetworkExfil factor (normalizers.py:849-865) is driven by
      NetworkSignalPack domain/pattern analysis and returns severity 0.0 whenever
      ``network.enabled`` is False.
    * The SENSITIVE_EXFIL gate (gates.py:1113-1233) WARNs from a permission +
      disclosure combination (sensitive perm + network perm + no privacy policy)
      that the factor never reads.

    Their only shared input is the ``has_network`` boolean; with network analysis
    off the gate still WARNs while the factor stays at 0.0.
    """
    from extension_shield.scoring.normalizers import normalize_network_exfil
    from extension_shield.governance.signal_pack import NetworkSignalPack

    perms = PermissionsSignalPack(
        api_permissions=["cookies", "webRequest"],  # sensitive perm + network perm
        total_permissions=2,
    )
    webstore = WebstoreStatsSignalPack(has_privacy_policy=False)  # 3rd risk factor

    # Gate: permission + disclosure combination (>= 2 risk factors) -> WARN/triggered.
    gate = HardGates().evaluate_sensitive_exfil(perms, SastSignalPack(), webstore)
    assert gate.triggered is True
    assert gate.decision == "WARN"
    assert gate.details.get("risk_factors", 0) >= 2

    # Factor: network analysis OFF -> severity 0.0 (a disjoint, analysis-driven signal).
    net = normalize_network_exfil(NetworkSignalPack(enabled=False, confidence=0.0), perms)
    assert net.severity == 0.0
    assert net.details.get("network_analysis_enabled") is False


def test_sensitive_exfil_gate_is_structurally_warn_only():
    """Invariant: SENSITIVE_EXFIL can never BLOCK — it is a capability/disclosure
    WARNING by design (its decision is the literal "WARN", gates.py ~1205).

    Iterate "worst case" inputs (every sensitive permission + broad-host/network +
    no privacy policy + SAST network-pattern findings) and assert the gate
    decision is never BLOCK. Locks the WARN-only structure against a future edit
    that adds a BLOCK path.
    """
    all_sensitive = [
        "cookies", "webRequest", "webRequestBlocking", "history",
        "browsingData", "clipboardRead", "tabs",
    ]
    network_sast = SastSignalPack(
        deduped_findings=[
            make_sast_finding(check_id="net.fetch.external_api",
                              message="fetch() to a third-party api", severity="HIGH"),
            make_sast_finding(check_id="net.ws.websocket_connection",
                              message="opens a websocket to send data", severity="HIGH"),
        ],
        files_scanned=5,
        confidence=0.9,
    )
    perm_cases = [
        PermissionsSignalPack(
            api_permissions=all_sensitive, host_permissions=["<all_urls>"],
            has_broad_host_access=True, total_permissions=len(all_sensitive),
        ),
        PermissionsSignalPack(api_permissions=all_sensitive, total_permissions=len(all_sensitive)),
    ]
    sast_cases = [network_sast, SastSignalPack()]

    for perms in perm_cases:
        for sast in sast_cases:
            gate = HardGates().evaluate_sensitive_exfil(
                perms, sast, WebstoreStatsSignalPack(has_privacy_policy=False)
            )
            assert gate.decision != "BLOCK", (
                "SENSITIVE_EXFIL is structurally WARN-only; it must never BLOCK"
            )


# ---------------------------------------------------------------------------
# Hard invariant (must hold in every version)
# ---------------------------------------------------------------------------

def test_no_reputation_hard_gate_exists():
    assert set(HardGates.GATES) == {
        "VT_MALWARE", "CRITICAL_SAST", "TOS_VIOLATION", "PURPOSE_MISMATCH", "SENSITIVE_EXFIL",
    }
    for rep in REPUTATION_FACTORS:
        assert rep not in HardGates.GATES


def test_reputation_factor_weights_are_capped_low():
    # Small weights => reputation alone cannot drive the overall score below the
    # BLOCK threshold. This is the numeric half of "reputation never BLOCKs".
    for rep in REPUTATION_FACTORS:
        assert SECURITY_WEIGHTS_V1[rep] <= 0.10


def test_resolve_never_blocks_from_a_reputation_driven_score():
    # No org block, no baseline governance BLOCK, no hard gate: a review-band
    # score (>= BLOCK_SCORE) can only reach NEEDS_REVIEW, never BLOCK.
    review = resolve(
        overall_score=70, security_score=70,
        blocking_gates=(), warning_gates=(),
        baseline_block_reasons=None, baseline_review_reasons=None,
    )
    assert review.verdict == Decision.NEEDS_REVIEW
    assert review.authority == "score_threshold"
    assert "reputation" not in review.authority

    clean = resolve(
        overall_score=90, security_score=90,
        blocking_gates=(), warning_gates=(), overall_confidence=1.0,
    )
    assert clean.verdict == Decision.ALLOW


def test_reputation_only_bad_extension_never_blocks_end_to_end():
    # Real code/malware coverage present (so the coverage cap is not the driver),
    # and ONLY reputation is bad: low rating, few installs, very stale, but a
    # privacy policy exists and there are no permission/code/malware issues.
    pack = make_min_signal_pack()
    pack.sast = SastSignalPack(files_scanned=5)
    pack.virustotal = VirusTotalSignalPack(
        enabled=True, total_engines=70, malicious_count=0, suspicious_count=0
    )
    pack.webstore_stats = WebstoreStatsSignalPack(
        has_privacy_policy=True, rating_avg=1.0, installs=10, last_updated="January 1, 2020"
    )
    result = ScoringEngine().calculate_scores(pack, manifest=MV3_MANIFEST)
    assert result.decision != Decision.BLOCK
