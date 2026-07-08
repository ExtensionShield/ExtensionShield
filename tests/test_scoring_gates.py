import pytest

from extension_shield.governance.signal_pack import (
    NetworkSignalPack,
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
    SignalPack,
    VirusTotalSignalPack,
)
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.gates import HardGates


def _eval_tos(api_permissions, host_permissions=None, manifest=None, sast=None):
    """Helper: evaluate the TOS gate for a given permission/manifest shape."""
    gates = HardGates()
    perms = PermissionsSignalPack(
        api_permissions=api_permissions,
        host_permissions=host_permissions or [],
    )
    return gates.evaluate_tos_violation(
        perms,
        sast or SastSignalPack(),
        NetworkSignalPack(enabled=False),
        manifest or {},
    )


def test_tos_bare_proxy_is_review_not_block():
    """A legitimate VPN declaring `proxy` (no any-site bridge, no code evidence)
    must be REVIEWED, not auto-blocked. Regression: the blanket
    proxy/nativeMessaging/debugger block was too harsh (it blocked Malus VPN)."""
    result = _eval_tos(["proxy", "webRequest", "tabs", "storage"], ["http://*/*", "https://*/*"])
    assert result.triggered is True
    assert result.decision == "WARN"


def test_tos_bare_native_messaging_is_review_not_block():
    """A password manager declaring `nativeMessaging` alone is a review signal."""
    result = _eval_tos(["nativeMessaging", "storage"])
    assert result.decision == "WARN"


def test_tos_native_messaging_plus_wildcard_ext_connectable_blocks():
    """nativeMessaging + externally_connectable:<all_urls> is a real web->native
    bridge and stays a BLOCK (the 'Super' case)."""
    result = _eval_tos(
        ["nativeMessaging", "storage"],
        ["<all_urls>"],
        {"externally_connectable": {"matches": ["<all_urls>"]}},
    )
    assert result.decision == "BLOCK"


def test_tos_restricted_perm_with_unrelated_high_sast_stays_review():
    """An UNRELATED high/critical SAST finding (eval in a UI file) must NOT
    escalate a restricted-permission declaration to BLOCK. Only evidence tied to
    the privileged capability counts. (Unrelated criticals still block via the
    separate CRITICAL_SAST gate.)"""
    unrelated = SastSignalPack(
        deduped_findings=[
            SastFindingNormalized(
                check_id="EVAL_USAGE", file_path="ui/popup.js", line_number=1,
                severity="CRITICAL", message="Use of eval for template rendering",
            )
        ],
        files_scanned=5,
        confidence=0.9,
    )
    for perm in ("proxy", "nativeMessaging", "debugger"):
        result = _eval_tos([perm, "storage"], sast=unrelated)
        assert result.decision == "WARN", f"{perm}: unrelated SAST must not BLOCK"


def test_tos_restricted_perm_with_capability_tied_sast_blocks():
    """HIGH/CRITICAL evidence tied to the restricted capability itself escalates
    to BLOCK (e.g. debugger perm + chrome.debugger attach usage in code)."""
    cases = {
        "debugger": "Attaches chrome.debugger to all tabs to inspect requests",
        "nativeMessaging": "Calls connectNative to relay page data to a native host",
        "proxy": "Rewrites chrome.proxy settings and intercepts traffic",
    }
    for perm, message in cases.items():
        tied = SastSignalPack(
            deduped_findings=[
                SastFindingNormalized(
                    check_id="PRIVILEGED_API_ABUSE", file_path="bg.js", line_number=1,
                    severity="HIGH", message=message,
                )
            ],
            files_scanned=5,
            confidence=0.9,
        )
        result = _eval_tos([perm, "storage"], sast=tied)
        assert result.decision == "BLOCK", f"{perm}: capability-tied SAST must BLOCK"


def test_tos_no_restricted_permissions_allows():
    result = _eval_tos(["storage", "tabs", "activeTab"])
    assert result.triggered is False
    assert result.decision == "ALLOW"


def test_benign_high_findings_do_not_block_without_corroboration():
    """A pile of HIGH/ERROR findings that match NO dangerous pattern must NOT hard-BLOCK.

    Prevents the false-BLOCK on benign extensions that legitimately accumulate
    several capability-level findings (e.g. internal messaging + IndexedDB + a
    fetch). These lower the score toward NEEDS_REVIEW; they do not trip CRITICAL_SAST.
    """
    benign_high = [
        SastFindingNormalized(
            check_id=f"capability.signal_{i}",
            file_path="src/app.js",
            line_number=i,
            severity="ERROR",
            message=msg,
        )
        for i, msg in enumerate([
            "Uses chrome.runtime messaging within the extension",
            "Writes application data to IndexedDB",
            "Calls a first-party API endpoint via fetch",
            "Reads a value from local settings",
            "Registers a navigation observer",
        ], start=1)
    ]
    sast_pack = SastSignalPack(
        raw_findings={"src/app.js": len(benign_high)},
        deduped_findings=benign_high,
        counts_by_severity={"CRITICAL": 0, "ERROR": len(benign_high), "WARNING": 0, "INFO": 0},
        confidence=0.9,
        files_scanned=3,
        files_with_findings=1,
    )
    result = HardGates().evaluate_critical_sast(sast_pack)
    assert result.gate_id == "CRITICAL_SAST"
    assert result.triggered is False
    assert result.decision != "BLOCK"


def test_critical_high_sast_pattern_triggers_block():
    """HIGH/ERROR SAST finding matching a critical pattern should BLOCK even if count < threshold."""
    finding = SastFindingNormalized(
        check_id="EVAL_USAGE",
        file_path="src/content.js",
        line_number=42,
        severity="HIGH",
        message="Use of eval('...') for dynamic code execution",
    )

    sast_pack = SastSignalPack(
        raw_findings={"src/content.js": 1},
        deduped_findings=[finding],
        counts_by_severity={"CRITICAL": 0, "ERROR": 0, "WARNING": 0, "INFO": 0},
        confidence=0.9,
        files_scanned=1,
        files_with_findings=1,
    )

    gates = HardGates()
    result = gates.evaluate_critical_sast(sast_pack)

    assert result.gate_id == "CRITICAL_SAST"
    assert result.triggered is True
    assert result.decision == "BLOCK"
    assert any(
        "Dangerous code pattern found" in reason for reason in result.reasons
    )


def test_sast_missing_coverage_caps_score_and_sets_review():
    """When SAST coverage is missing, overall score is capped and decision is at least NEEDS_REVIEW."""
    signal_pack = SignalPack(scan_id="test-scan")

    # Ensure SAST coverage is missing: default SastSignalPack has files_scanned == 0
    assert signal_pack.sast.files_scanned == 0
    assert signal_pack.sast.deduped_findings == []
    # Provide VirusTotal coverage so this exercises the SAST-only cap (80), not the
    # broader insufficient-data path (which applies only when SAST+VT+network are all absent).
    signal_pack.virustotal = VirusTotalSignalPack(
        enabled=True, malicious_count=0, total_engines=70
    )

    engine = ScoringEngine()
    result = engine.calculate_scores(signal_pack, manifest={})

    assert result.overall_score <= 80
    assert result.decision.name == "NEEDS_REVIEW"
    assert any(
        "SAST coverage missing; score capped at 80" in reason
        for reason in result.reasons
    )



