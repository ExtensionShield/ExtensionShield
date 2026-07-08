"""Calibration regression tests for the PURPOSE_MISMATCH hard gate.

Bug fixed: the gate regex-matched credential/login/password keywords against the
SAST rule id / message / placeholder snippet and hard-BLOCKed at >=2 matches, so
benign behaviors (chrome.identity, hotkey keydown, first-party credentialed
fetch) produced false BLOCK verdicts. The gate is now behavior-based: BLOCK
requires concrete, corroborated dangerous behavior.
"""

import pytest

from extension_shield.governance.signal_pack import (
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
)
from extension_shield.scoring.gates import HardGates


def _finding(check_id, severity="ERROR", message="", snippet="requires login"):
    return SastFindingNormalized(
        check_id=check_id, file_path="bg.js", line_number=1,
        severity=severity, message=message, code_snippet=snippet,
    )


def _pm(check_ids, api_permissions=None, name="Tool", description="A helper", broad=False):
    gates = HardGates()
    sast = SastSignalPack(
        deduped_findings=[_finding(c) for c in check_ids],
        files_scanned=1, confidence=0.9,
    )
    perms = PermissionsSignalPack(
        api_permissions=api_permissions or [],
        has_broad_host_access=broad,
    )
    return gates.evaluate_purpose_mismatch(
        {"name": name, "description": description}, sast, perms
    )


# --- benign-compatible behaviors must NOT hard-block --------------------------

def test_chrome_identity_getprofileuserinfo_does_not_block():
    r = _pm(["src.extension_shield.config.credential.theft.chrome_identity_api"])
    assert r.decision != "BLOCK"          # Page Marker case
    assert r.decision == "WARN"


def test_hotkey_keydown_handler_does_not_block():
    # keylogger rule fires on a keydown/hotkey handler; without exfil it's REVIEW.
    r = _pm([
        "src.extension_shield.config.credential.theft.keylogger",
        "src.extension_shield.config.c2.exfiltration.chrome_runtime_external",
    ])
    assert r.decision != "BLOCK"          # Bulk Image Downloader case
    assert r.decision == "WARN"


def test_first_party_credentialed_fetch_does_not_block():
    r = _pm([
        "src.extension_shield.config.banking.third_party.external_api_calls",
        "src.extension_shield.config.c2.exfiltration.fetch_credentials_include",
    ])
    assert r.decision != "BLOCK"          # BookSeeker case
    assert r.decision == "WARN"


def test_scary_rule_names_alone_do_not_block():
    # Rule ids literally contain "credential"/"password"/"login" but the specific
    # behaviors are benign-compatible -> must not BLOCK from the names alone.
    r = _pm([
        "src.extension_shield.config.credential.theft.chrome_identity_api",
        "src.extension_shield.config.credential.theft.storage_access",
        "src.extension_shield.config.cookie.theft.document_cookie_access",
    ])
    assert r.decision != "BLOCK"


# --- concrete corroborated dangerous behavior MUST still hard-block -----------

def test_secret_read_plus_exfil_blocks():
    r = _pm([
        "src.extension_shield.config.credential.theft.password_extraction",
        "src.extension_shield.config.c2.exfiltration.periodic_beacon",
    ])
    assert r.decision == "BLOCK"
    assert any("external servers" in x for x in r.reasons)


def test_key_capture_plus_exfil_blocks():
    r = _pm([
        "src.extension_shield.config.credential.theft.keylogger",
        "src.extension_shield.config.c2.exfiltration.image_steganography",
    ])
    assert r.decision == "BLOCK"


def test_remote_code_loading_blocks():
    r = _pm(["src.extension_shield.config.c2.exfiltration.dynamic_script_loading"])
    assert r.decision == "BLOCK"          # Indian Visa case (also has secret+exfil)


def test_standalone_clipboard_hijack_blocks():
    r = _pm(["src.extension_shield.config.credential.theft.clipboard_hijack"])
    assert r.decision == "BLOCK"


# --- clean extension stays ALLOW ---------------------------------------------

def test_no_findings_allows():
    r = _pm([])
    assert r.decision == "ALLOW"
    assert r.triggered is False


# --- first-party vs suspicious external credentialed send --------------------

def test_first_party_credentialed_fetch_alone_reviews_not_blocks():
    r = _pm(["src.extension_shield.config.c2.exfiltration.fetch_credentials_include"])
    assert r.decision == "WARN"


def test_secret_read_plus_credentialed_send_blocks():
    # Reads credential values AND has a credentialed send channel -> the fetch is
    # the exfiltration vector -> BLOCK (even though the fetch alone is benign).
    r = _pm([
        "src.extension_shield.config.credential.theft.password_extraction",
        "src.extension_shield.config.c2.exfiltration.fetch_credentials_include",
    ])
    assert r.decision == "BLOCK"


def test_secret_read_plus_suspicious_domain_blocks():
    r = _pm([
        "src.extension_shield.config.credential.theft.password_extraction",
        "src.extension_shield.config.suspicious.random_domain_pattern",
    ])
    assert r.decision == "BLOCK"


def test_suspicious_domain_alone_reviews():
    r = _pm(["src.extension_shield.config.suspicious.random_domain_pattern"])
    assert r.decision == "WARN"


# --- placeholder snippet must never be surfaced as evidence ------------------

def test_sanitize_snippet_drops_placeholder_keeps_real_code():
    from extension_shield.governance.signal_pack import sanitize_code_snippet
    # Fake / non-code placeholders -> dropped.
    assert sanitize_code_snippet("requires login") is None
    assert sanitize_code_snippet("   ") is None
    assert sanitize_code_snippet("n/a") is None
    # Real matched code (has code punctuation) -> preserved, with line context intact.
    assert sanitize_code_snippet("chrome.identity.getProfileUserInfo(cb)") == \
        "chrome.identity.getProfileUserInfo(cb)"
    assert sanitize_code_snippet("document.addEventListener('keydown', fn)") is not None


def test_placeholder_snippet_dropped_by_adapter():
    from extension_shield.governance.tool_adapters import SastAdapter
    a = SastAdapter()
    assert a._truncate_snippet("requires login") is None
    assert a._truncate_snippet("chrome.identity.getProfileUserInfo(cb)") is not None
