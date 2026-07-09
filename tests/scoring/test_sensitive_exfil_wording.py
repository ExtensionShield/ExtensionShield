"""SENSITIVE_EXFIL wording calibration (audit follow-up).

The gate fires on a capability + disclosure combination (sensitive permission +
network capability + no privacy policy) with no destination evidence. Its wording
must present it as a capability warning, not confirmed exfiltration, and it must
stay WARN (never BLOCK on capability alone).
"""

from extension_shield.governance.signal_pack import (
    PermissionsSignalPack,
    SastSignalPack,
    WebstoreStatsSignalPack,
)
from extension_shield.scoring.gates import HardGates


def test_sensitive_exfil_uses_capability_wording_not_confirmed_exfil():
    gates = HardGates()
    perms = PermissionsSignalPack(api_permissions=["cookies"], has_broad_host_access=True)
    sast = SastSignalPack(deduped_findings=[], files_scanned=1, confidence=0.9)
    webstore = WebstoreStatsSignalPack(has_privacy_policy=False)

    r = gates.evaluate_sensitive_exfil(perms, sast, webstore)

    assert r.decision == "WARN"  # capability only -> review, never BLOCK
    text = " ".join(r.reasons).lower()
    assert "could send data externally" in text
    assert "not confirmed exfiltration" in text
    # Must not claim confirmed exfiltration.
    assert "sends your data to external servers" not in text
