"""Tests for the golden-fixture → signal_pack extraction utility.

These verify the extractor reuses the production SignalPackBuilder to produce
valid, schema-conforming corpus entries with default 'unknown' labels, surfaces
coverage warnings instead of silently losing data, and stays fully offline.

Deliberately absent: any assertion that a re-scored extracted pack reproduces the
fixture's stored overall_security_score/governance_verdict. Extracted entries are
best-effort reconstructions for labeling, not score-reproduction guarantees.
"""

import json
from pathlib import Path

import pytest

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.scoring.engine import ScoringEngine
from scripts.scoring.compare_scoring_corpus import CorpusError, validate_entry
from scripts.scoring.extract_signal_pack import (
    _CORPUS_DIR_GUARD,
    _coverage_warnings,
    _is_within_corpus_dir,
    _redaction_for,
    anonymize_entry,
    extract_entries,
    extract_entry,
    main,
    reconstruct_analysis_results,
)

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"
GOLDEN = sorted(FIXTURE_DIR.glob("*_results.json"))


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _pii_needles(fixture, entry):
    """The real-PII strings that must NOT survive anonymization — derived at
    runtime from the fixture/original entry, never hardcoded."""
    sp = entry["inputs"]["signal_pack"]
    ws = sp["webstore_stats"]
    mani = entry["inputs"].get("manifest") or {}
    needles = []
    for v in (fixture.get("extension_id"), fixture.get("extension_name")):
        if v:
            needles.append(v)
    for k in ("developer", "developer_email", "developer_website"):
        if ws.get(k):
            needles.append(ws[k])
    for k in ("author", "homepage_url"):
        if mani.get(k):
            needles.append(mani[k])
    return needles


def _score(sp_dict, manifest, user_count):
    r = ScoringEngine(weights_version="v1").calculate_scores(
        SignalPack.model_validate(sp_dict), manifest=manifest, user_count=user_count
    )
    return (r.overall_score, r.decision.value)


def test_golden_fixtures_present():
    # Guard: the extractor is meaningless if the fixtures moved.
    assert len(GOLDEN) >= 1, "expected at least one tests/fixtures/*_results.json"


@pytest.mark.parametrize("path", GOLDEN, ids=lambda p: p.name)
def test_every_golden_fixture_extracts_to_valid_entry(path):
    entry, warns = extract_entry(_load(path), source_path=str(path))
    # validate_entry is also called inside extract_entry, but assert explicitly.
    validate_entry(entry)
    SignalPack.model_validate(entry["inputs"]["signal_pack"])
    assert entry["label"] == "unknown"
    assert entry["expected_verdict"] is None
    assert entry["source_type"] == "real_scan"
    assert entry["id"].startswith("golden-")


def test_reuse_populates_signal_pack_where_fixture_had_data():
    # The whole point of reusing SignalPackBuilder: real data must flow through,
    # not silently vanish. Every golden fixture carries entropy + permissions +
    # webstore installs, so the built pack must reflect at least one of them.
    for path in GOLDEN:
        entry, _ = extract_entry(_load(path), source_path=str(path))
        sp = entry["inputs"]["signal_pack"]
        entropy_files = sp["entropy"]["files_analyzed"]
        total_perms = sp["permissions"]["total_permissions"]
        installs = sp["webstore_stats"]["installs"]
        assert (entropy_files > 0) or (total_perms > 0) or (installs not in (None, 0)), (
            f"{path.name}: built pack lost all analyzer data -> silent-loss regression"
        )


def test_sast_remap_maps_findings_for_a_fixture_with_sast():
    # Pinterest fixture is known (verified) to have a SAST finding; the
    # sast_results->javascript_analysis remap must carry it into the pack.
    target = next((p for p in GOLDEN if p.name.startswith("nkabool")), None)
    if target is None:
        pytest.skip("expected SAST-bearing fixture not present")
    entry, _ = extract_entry(_load(target), source_path=str(target))
    sast = entry["inputs"]["signal_pack"]["sast"]
    assert sast["files_scanned"] > 0
    # This fixture has a finding; the remap must not drop it.
    assert len(sast["deduped_findings"]) >= 1


def test_governance_verdict_is_never_used_as_label():
    path = GOLDEN[0]
    fixture = _load(path)
    entry, _ = extract_entry(fixture, source_path=str(path))
    assert entry["label"] == "unknown"
    assert entry["expected_verdict"] is None
    # If the fixture carries an engine verdict, it may be recorded ONLY under the
    # clearly-marked non-authoritative field — never as label/expected_verdict.
    recorded = entry["extraction"]["engine_outputs_not_ground_truth"]
    if "governance_verdict" in fixture:
        assert recorded.get("governance_verdict") == fixture["governance_verdict"]
    assert entry["label"] != fixture.get("governance_verdict")


def test_real_extension_name_and_id_carried_safely():
    path = GOLDEN[0]
    fixture = _load(path)
    entry, _ = extract_entry(fixture, source_path=str(path))
    assert entry["name"] == (fixture.get("extension_name") or fixture["extension_id"])
    assert fixture["extension_id"] in entry["id"]


def test_human_expected_verdict_is_honored_when_passed():
    path = GOLDEN[0]
    entry, _ = extract_entry(_load(path), source_path=str(path), expected_verdict="NEEDS_REVIEW")
    assert entry["expected_verdict"] == "NEEDS_REVIEW"


def test_missing_extension_id_fails_loudly():
    with pytest.raises(CorpusError):
        extract_entry({"extension_name": "no id here"}, source_path="synthetic")


def test_coverage_warning_when_fixture_data_does_not_map():
    # Unit-test the warning path directly: a fixture that HAS sast findings paired
    # with an empty built pack must warn (not silently drop).
    fake_fixture = {"sast_results": {"sast_findings": {"a.js": [{"check_id": "x"}]}}}
    empty_pack = SignalPack.model_validate({"scan_id": "s"})
    warns = _coverage_warnings(fake_fixture, empty_pack)
    assert any("sast" in w for w in warns)


def test_no_warnings_for_a_clean_extraction():
    # Real golden fixtures reconstruct cleanly; none should warn (regression guard
    # on the remap staying correct).
    _, warns = extract_entries([str(p) for p in GOLDEN])
    assert warns == [], f"unexpected coverage warnings: {warns}"


def test_reconstruct_remaps_sast_key():
    fixture = _load(GOLDEN[0])
    ar, used = reconstruct_analysis_results(fixture)
    if fixture.get("sast_results") is not None:
        assert "javascript_analysis" in ar
        assert "sast_results->javascript_analysis" in used


def test_cli_dry_run_prints_json_array(capsys):
    rc = main([str(GOLDEN[0])])
    assert rc == 0
    out = capsys.readouterr().out
    parsed = json.loads(out)
    assert isinstance(parsed, list) and len(parsed) == 1
    assert parsed[0]["label"] == "unknown"


def test_cli_refuses_to_write_into_committed_corpus_dir(tmp_path):
    bad = f"{_CORPUS_DIR_GUARD}/should_not_write.json"
    with pytest.raises(SystemExit):
        main([str(GOLDEN[0]), "--output", bad])


def test_corpus_dir_guard_resolves_paths():
    # Direct path into the corpus dir -> blocked.
    assert _is_within_corpus_dir(Path(f"{_CORPUS_DIR_GUARD}/x.json")) is True
    # `..` traversal that resolves into the corpus dir -> blocked.
    assert _is_within_corpus_dir(
        Path(f"tests/fixtures/../fixtures/scoring_corpus/x.json")
    ) is True
    # An absolute path landing in the corpus dir -> blocked.
    repo_root = Path(__file__).resolve().parents[2]
    assert _is_within_corpus_dir(repo_root / _CORPUS_DIR_GUARD / "x.json") is True


def test_corpus_dir_guard_allows_paths_outside(tmp_path):
    assert _is_within_corpus_dir(tmp_path / "extracted.json") is False


def test_cli_refuses_cwd_relative_bypass(tmp_path, monkeypatch):
    # Regression for the substring-guard bypass: run from inside the corpus dir
    # with a cwd-relative --output; the resolved path is inside the dir -> refuse.
    corpus_dir = Path(__file__).resolve().parents[2] / _CORPUS_DIR_GUARD
    monkeypatch.chdir(corpus_dir)
    with pytest.raises(SystemExit):
        main([str(GOLDEN[0]), "--output", "sneaked_in.json"])
    assert not (corpus_dir / "sneaked_in.json").exists()


def test_cli_output_writes_to_allowed_path(tmp_path):
    out = tmp_path / "extracted.json"
    rc = main([str(GOLDEN[0]), "--output", str(out)])
    assert rc == 0 and out.exists()
    data = json.loads(out.read_text(encoding="utf-8"))
    assert isinstance(data, list) and data[0]["label"] == "unknown"


def test_extraction_is_offline(monkeypatch):
    # Prove no network: make socket construction explode, then extract anyway.
    import socket

    def _boom(*a, **k):
        raise AssertionError("network access attempted during offline extraction")

    monkeypatch.setattr(socket, "socket", _boom)
    entry, _ = extract_entry(_load(GOLDEN[0]), source_path=str(GOLDEN[0]))
    assert entry["label"] == "unknown"


# --- anonymization (ADR 0003 §5): full-entry scrub, leak-free, score-neutral ---

_SALT = "unit-test-salt"


@pytest.mark.parametrize("path", GOLDEN, ids=lambda p: p.name)
def test_anonymized_entry_validates(path):
    entry, _ = extract_entry(
        _load(path), source_path=str(path), anonymize=True, salt=_SALT, redact_name=True
    )
    validate_entry(entry)
    SignalPack.model_validate(entry["inputs"]["signal_pack"])
    assert entry["label"] == "unknown"
    assert entry["expected_verdict"] is None
    # pseudonymous id must not carry the real id or the golden- prefix
    assert entry["id"].startswith("anon-")
    assert entry["inputs"]["signal_pack"]["scan_id"] == entry["inputs"]["signal_pack"]["extension_id"]


@pytest.mark.parametrize("path", GOLDEN, ids=lambda p: p.name)
def test_full_entry_leak_test_runtime_needles(path):
    fixture = _load(path)
    original, _ = extract_entry(fixture, source_path=str(path))
    needles = _pii_needles(fixture, original)  # derived at runtime, not hardcoded
    anon, _ = extract_entry(
        fixture, source_path=str(path), anonymize=True, salt=_SALT, redact_name=True
    )
    blob = json.dumps(anon)  # entire serialized entry, recursively
    for needle in needles:
        assert needle not in blob, f"PII leaked in {path.name}: {needle!r}"
    # the real id must be gone from the source_fixture pointer too
    assert fixture["extension_id"] not in anon["extraction"]["source_fixture"]


@pytest.mark.parametrize("path", GOLDEN, ids=lambda p: p.name)
def test_score_and_verdict_neutrality(path):
    fixture = _load(path)
    original, _ = extract_entry(fixture, source_path=str(path))
    anon, _ = extract_entry(
        fixture, source_path=str(path), anonymize=True, salt=_SALT, redact_name=True
    )
    o = original["inputs"]
    a = anon["inputs"]
    # each side scores with ITS OWN (original vs anonymized) auxiliary inputs, so
    # manifest anonymization is included in the neutrality proof.
    assert _score(o["signal_pack"], o["manifest"], o["user_count"]) == _score(
        a["signal_pack"], a["manifest"], a["user_count"]
    )


def test_scoring_relevant_host_patterns_preserved():
    # Pinterest fixture has a brand-bearing host pattern that IS a scoring input;
    # it must be preserved (brand-hint retained) for neutrality, not scrubbed.
    target = next((p for p in GOLDEN if p.name.startswith("nkabool")), None)
    if target is None:
        pytest.skip("expected broad-host fixture not present")
    orig, _ = extract_entry(_load(target), source_path=str(target))
    anon, _ = extract_entry(
        _load(target), source_path=str(target), anonymize=True, salt=_SALT, redact_name=True
    )
    assert (
        anon["inputs"]["signal_pack"]["permissions"]["host_permissions"]
        == orig["inputs"]["signal_pack"]["permissions"]["host_permissions"]
    )


def test_anonymization_stable_with_same_salt_and_differs_with_different_salt():
    fixture = _load(GOLDEN[0])
    a1 = extract_entry(fixture, anonymize=True, salt="A", redact_name=True)[0]
    a1b = extract_entry(fixture, anonymize=True, salt="A", redact_name=True)[0]
    a2 = extract_entry(fixture, anonymize=True, salt="B", redact_name=True)[0]
    assert a1["id"] == a1b["id"]
    assert a1["inputs"]["signal_pack"]["scan_id"] == a1b["inputs"]["signal_pack"]["scan_id"]
    assert a1["id"] != a2["id"]


def test_redact_name_replaces_original_name():
    fixture = _load(GOLDEN[0])
    real_name = fixture["extension_name"]
    with_redact = extract_entry(fixture, anonymize=True, salt=_SALT, redact_name=True)[0]
    assert with_redact["name"] != real_name
    assert real_name not in json.dumps(with_redact)
    # Without --redact-name the entry is NOT leak-free (name retained) — documents
    # that full leak-freedom requires --redact-name.
    without = extract_entry(fixture, anonymize=True, salt=_SALT, redact_name=False)[0]
    assert without["name"] == real_name


def test_anonymize_requires_salt():
    with pytest.raises(CorpusError):
        anonymize_entry({"inputs": {"signal_pack": {"scan_id": "x"}}}, salt="")
    # CLI path: --anonymize without a salt must error.
    with pytest.raises(SystemExit):
        main([str(GOLDEN[0]), "--anonymize"])


def test_default_non_anonymized_behavior_unchanged():
    # No anonymization by default: real id/name still present, id keeps golden- prefix.
    fixture = _load(GOLDEN[0])
    entry, _ = extract_entry(fixture, source_path=str(GOLDEN[0]))
    assert entry["id"].startswith("golden-")
    assert fixture["extension_id"] in entry["id"]
    assert entry["name"] == fixture["extension_name"]


def test_redaction_preserves_scored_threat_keywords():
    # A PII token that itself contains a scored keyword ('abusive'/'malicious'/
    # 'covert') must keep that keyword in the redaction, so scrubbing it cannot
    # drop the permissions-baseline x2.0 multiplier.
    assert _redaction_for("Google Analytics") == "[redacted]"
    r = _redaction_for("CovertGrab")
    assert "covert" in r and "CovertGrab" not in r


def test_anonymization_neutral_when_pii_token_contains_threat_keyword():
    # Regression for the latent gap: a developer name containing 'covert' that is
    # echoed inside a scored permission justification. Anonymization must remove
    # the PII but keep the keyword, leaving the abuse signal intact.
    entry = {
        "id": "golden-covertgrabextensionaaaaaaaaaaaa",
        "name": "CovertGrab",
        "label": "unknown",
        "expected_verdict": None,
        "tags": ["extracted"],
        "extraction": {"source_fixture": "x"},
        "inputs": {
            "signal_pack": {
                "scan_id": "covertgrabextensionaaaaaaaaaaaa",
                "extension_id": "covertgrabextensionaaaaaaaaaaaa",
                "webstore_stats": {"developer": "CovertGrab"},
                "permissions": {
                    "permission_analysis": [
                        {"justification": "the tabs permission requested by CovertGrab is covert"}
                    ]
                },
            },
            "manifest": None,
        },
    }
    anon = anonymize_entry(entry, salt="s", redact_name=True)
    just = anon["inputs"]["signal_pack"]["permissions"]["permission_analysis"][0]["justification"]
    assert "CovertGrab" not in just              # PII gone
    assert "covert" in just.lower()              # scored keyword preserved -> score-neutral
    assert "CovertGrab" not in json.dumps(anon)  # gone everywhere


def _capture_factor_severity(entry):
    inp = entry["inputs"]
    r = ScoringEngine(weights_version="v1").calculate_scores(
        SignalPack.model_validate(inp["signal_pack"]),
        manifest=inp["manifest"],
        user_count=inp["user_count"],
    )
    factors = r.privacy_layer.factors if r.privacy_layer else []
    sev = next((f.severity for f in factors if f.name == "CaptureSignals"), None)
    return (r.overall_score, r.decision.value, round(sev, 4) if sev is not None else None)


def test_manifest_capture_keyword_redaction_is_score_neutral():
    # Regression for the MEDIUM gap: manifest.name/description are scored by the
    # capture-signals heuristic. A capture signal is present (tabCapture + broad
    # host) so the branch is actually exercised; anonymization must remove the
    # brand token but preserve the capture keyword -> capture severity unchanged.
    from extension_shield.governance.signal_pack import PermissionsSignalPack
    from tests.scoring.utils import make_min_signal_pack

    pack = make_min_signal_pack(
        scan_id="synbrandaaaaaaaaaaaaaaaaaaaaaaaa", extension_id="synbrandaaaaaaaaaaaaaaaaaaaaaaaa"
    )
    pack.permissions = PermissionsSignalPack(
        api_permissions=["tabCapture"],
        host_permissions=["<all_urls>"],
        has_broad_host_access=True,
        broad_host_patterns=["<all_urls>"],
        total_permissions=2,
    )
    entry = {
        "id": "golden-synbrandaaaaaaaaaaaaaaaaaaaaaaaa",
        "name": "BrandCam Screenshot Tool",
        "label": "unknown",
        "expected_verdict": None,
        "tags": ["extracted"],
        "extraction": {"source_fixture": "x"},
        "inputs": {
            "signal_pack": pack.model_dump(mode="json"),
            "manifest": {
                "name": "BrandCam Screenshot Tool",
                "description": "capture your screen with BrandCam",
                "permissions": ["tabCapture"],
                "host_permissions": ["<all_urls>"],
                "manifest_version": 3,
            },
            "user_count": 1000,
            "permissions_analysis": None,
        },
    }
    anon = anonymize_entry(entry, salt="s", redact_name=True)
    # capture branch is engaged (non-zero severity) -> the gap would show here
    orig_sev = _capture_factor_severity(entry)
    anon_sev = _capture_factor_severity(anon)
    assert orig_sev[2] not in (None, 0.0), "test must exercise the capture branch"
    assert orig_sev == anon_sev  # overall score + verdict + capture severity identical
    # brand token gone, capture keyword preserved
    blob = json.dumps(anon)
    assert "BrandCam" not in blob
    assert "screenshot" in anon["inputs"]["manifest"]["name"].lower()
    assert "capture" in anon["inputs"]["manifest"]["description"].lower()


def test_cli_anonymize_dry_run_is_leak_free(capsys):
    fixture = _load(GOLDEN[0])
    needles = _pii_needles(fixture, extract_entry(fixture, source_path=str(GOLDEN[0]))[0])
    rc = main([str(GOLDEN[0]), "--anonymize", "--anonymization-salt", _SALT, "--redact-name"])
    assert rc == 0
    out = capsys.readouterr().out
    parsed = json.loads(out)  # stdout is still a JSON array
    assert isinstance(parsed, list) and parsed[0]["label"] == "unknown"
    for needle in needles:
        assert needle not in out
