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
from scripts.scoring.compare_scoring_corpus import CorpusError, validate_entry
from scripts.scoring.extract_signal_pack import (
    _CORPUS_DIR_GUARD,
    _coverage_warnings,
    _is_within_corpus_dir,
    extract_entries,
    extract_entry,
    main,
    reconstruct_analysis_results,
)

FIXTURE_DIR = Path(__file__).parent.parent / "fixtures"
GOLDEN = sorted(FIXTURE_DIR.glob("*_results.json"))


def _load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


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
