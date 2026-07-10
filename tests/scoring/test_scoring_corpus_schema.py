"""Schema tests for the offline scoring corpus.

These validate the corpus *structure* and that each entry's SignalPack input
deserializes. They deliberately do NOT assert engine output against corpus
labels — labels are advisory human ground-truth for future calibration, not a
current-engine golden assertion (that is what test_golden_snapshots.py is for).

Fully offline: no APIs, scans, or database access.
"""

from pathlib import Path

import pytest

from extension_shield.governance.signal_pack import SignalPack
from scripts.scoring.compare_scoring_corpus import (
    CorpusError,
    REQUIRED_FIELDS,
    VALID_LABELS,
    VALID_VERDICTS,
    build_inputs,
    load_corpus,
    validate_corpus,
    validate_entry,
)

FIXTURES = Path(__file__).parent.parent / "fixtures" / "scoring_corpus"
STARTER = FIXTURES / "starter_corpus.json"
TEMPLATE = FIXTURES / "template.json"
SYNTHETIC = FIXTURES / "synthetic_labeled_seed.json"


def test_starter_corpus_loads_and_validates():
    corpus = load_corpus(STARTER)
    assert isinstance(corpus, list) and len(corpus) >= 1


def test_template_corpus_loads_and_validates():
    corpus = load_corpus(TEMPLATE)
    assert isinstance(corpus, list) and len(corpus) >= 1


def test_every_entry_has_required_fields():
    for entry in load_corpus(STARTER):
        for field in REQUIRED_FIELDS:
            assert field in entry, f"{entry.get('id')} missing {field}"


def test_labels_and_verdicts_are_valid():
    for entry in load_corpus(STARTER):
        assert entry["label"] in VALID_LABELS
        expected = entry.get("expected_verdict")
        assert expected is None or expected in VALID_VERDICTS


def test_every_signal_pack_input_validates_to_signalpack():
    for entry in load_corpus(STARTER):
        pack, manifest, user_count, permissions_analysis = build_inputs(entry)
        assert isinstance(pack, SignalPack)
        # optional inputs are either None or their expected container types
        assert manifest is None or isinstance(manifest, dict)
        assert user_count is None or isinstance(user_count, int)
        assert permissions_analysis is None or isinstance(permissions_analysis, dict)


def test_missing_required_field_is_rejected():
    bad = {"id": "x", "name": "x", "label": "unknown"}  # no 'inputs'
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_invalid_label_is_rejected():
    bad = {
        "id": "x",
        "name": "x",
        "label": "definitely-not-a-label",
        "inputs": {"signal_pack": {"scan_id": "x"}},
    }
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_invalid_expected_verdict_is_rejected():
    bad = {
        "id": "x",
        "name": "x",
        "label": "unknown",
        "expected_verdict": "MAYBE",
        "inputs": {"signal_pack": {"scan_id": "x"}},
    }
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_inputs_without_signal_pack_is_rejected():
    bad = {"id": "x", "name": "x", "label": "unknown", "inputs": {"manifest": None}}
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_malformed_signal_pack_is_rejected():
    bad = {
        "id": "x",
        "name": "x",
        "label": "unknown",
        # scan_id is required by SignalPack; omitting it must fail validation.
        "inputs": {"signal_pack": {"extension_id": "e"}},
    }
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_non_string_id_is_rejected_with_corpus_error():
    # A list/dict id must raise CorpusError (not a bare unhashable TypeError).
    bad = {
        "id": ["not", "a", "string"],
        "name": "x",
        "label": "unknown",
        "inputs": {"signal_pack": {"scan_id": "x"}},
    }
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_empty_id_is_rejected():
    bad = {"id": "", "name": "x", "label": "unknown", "inputs": {"signal_pack": {"scan_id": "x"}}}
    with pytest.raises(CorpusError):
        validate_entry(bad, 0)


def test_duplicate_ids_are_rejected():
    dup = [
        {"id": "same", "name": "a", "label": "unknown", "inputs": {"signal_pack": {"scan_id": "a"}}},
        {"id": "same", "name": "b", "label": "unknown", "inputs": {"signal_pack": {"scan_id": "b"}}},
    ]
    with pytest.raises(CorpusError):
        validate_corpus(dup)


# ---------------------------------------------------------------------------
# Synthetic labeled seed (fully synthetic, PII-free calibration scaffolding).
# These are NOT real labeled cases; the real evidence-backed count stays 0.
# ---------------------------------------------------------------------------

import json  # noqa: E402  (local to the synthetic-seed section)
import re  # noqa: E402

# Allowed non-'unknown' labels for the synthetic seed.
_SEED_LABELS = {"benign", "malicious", "needs_review", "low_confidence"}


def test_synthetic_seed_loads_and_validates():
    corpus = load_corpus(SYNTHETIC)  # runs validate_corpus internally
    assert isinstance(corpus, list) and len(corpus) >= 6
    for entry in corpus:
        validate_entry(entry)
        SignalPack.model_validate(entry["inputs"]["signal_pack"])


def test_synthetic_seed_labels_are_from_allowed_set():
    for entry in load_corpus(SYNTHETIC):
        assert entry["label"] in _SEED_LABELS, entry["id"]
        assert entry["label"] in VALID_LABELS
        # These are intended ground-truth labels; expected_verdict stays advisory/null.
        assert entry.get("expected_verdict") is None


def test_synthetic_seed_covers_each_class():
    labels = {e["label"] for e in load_corpus(SYNTHETIC)}
    assert _SEED_LABELS.issubset(labels), f"seed missing classes: {_SEED_LABELS - labels}"


def test_synthetic_seed_has_no_real_identifiers():
    # PII/identifier leak guard: no real CWS extension id (32 chars a-p), no email,
    # no http(s) URL, and any real-TLD domain must be an example.* domain.
    blob = json.dumps(load_corpus(SYNTHETIC))
    assert not re.search(r"[a-p]{32}", blob), "looks like a real 32-char CWS extension id"
    assert not re.search(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", blob), "email present"
    assert not re.search(r"https?://", blob), "http(s) URL present"
    # Only match tokens ending in a real TLD (avoids false positives on file
    # extensions like background.js and dotted identifiers like a.b_c). Any such
    # domain must be an example.* domain.
    real_tlds = r"(?:com|net|org|io|co|dev|app|edu|gov|info|xyz|me|us|ai)"
    for host in re.findall(rf"\b[a-z0-9-]+\.{real_tlds}\b", blob):
        assert host.startswith("example."), f"non-example domain present: {host}"


def test_synthetic_seed_ids_are_synthetic_prefixed():
    for entry in load_corpus(SYNTHETIC):
        assert entry["id"].startswith("synthetic-"), entry["id"]
        # the real-id also must not leak into the in-pack identifiers
        sp = entry["inputs"]["signal_pack"]
        assert sp["scan_id"].startswith("synthetic-")
