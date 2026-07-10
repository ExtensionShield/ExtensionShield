# Scoring corpus inventory & labeling guide

Companion to [`corpus.md`](corpus.md) (the #274 schema + harness). This file
records **what labeled data exists**, how to grow it safely, and how the
golden-fixture extraction utility fits in. Every count below is backed by a
command you can re-run — do not restate numbers without verifying them.

## Current inventory (verified)

| Source | Count | Labels |
| --- | --- | --- |
| `tests/fixtures/scoring_corpus/starter_corpus.json` | 2 entries | `unknown` ×2 (synthetic) |
| `tests/fixtures/scoring_corpus/template.json` | 1 entry | `unknown` (template) |
| `tests/fixtures/scoring_corpus/synthetic_labeled_seed.json` | 8 entries | `benign` ×2, `malicious` ×2, `needs_review` ×2, `low_confidence` ×2 (all **synthetic**) |
| **Real, evidence-backed labeled cases** | **0** | — |

Verify:

```
python3 -c "import json,collections; d=json.load(open('tests/fixtures/scoring_corpus/synthetic_labeled_seed.json')); print(len(d), collections.Counter(e['label'] for e in d))"
# -> 8 Counter({'benign': 2, 'malicious': 2, 'needs_review': 2, 'low_confidence': 2})
```

**The synthetic seed does not change the real labeled count — it is still 0.** The
seed's entries are fully synthetic calibration scaffolding (see below), not real
extensions. The starter/template entries remain `unknown` and self-identify as
synthetic.

## Synthetic labeled seed (calibration scaffolding, not real data)

`synthetic_labeled_seed.json` is a small, **fully synthetic, PII-free** set that
exercises the harness across the four scored classes. Every entry is generated
from a constructed `SignalPack` (`model_dump(mode="json")`), uses only
`synthetic-*` ids/names and `example.*` domains, and carries **no** real
extension id, brand, developer name, email, URL, or CRX data. Each `label` is
justified by concrete synthetic signal values in the entry's `rationale` (e.g.
`virustotal.malicious_count=8`, `sast.counts_by_severity.CRITICAL=1`,
`sast.files_scanned=0`).

`expected_verdict` is `null` for every entry: `label` is the intended
ground-truth class, not the engine's output. Each entry's `notes` records the
**observed current engine behavior (non-authoritative)** so future weight work
can diff against it. Where the observed verdict differs from the label intent
(e.g. `low_confidence` entries currently score `NEEDS_REVIEW` via the coverage
cap), that mismatch is intended calibration evidence — not a bug and not asserted
by any test.

This seed is for **harness coverage and calibration scaffolding only**. It is not
evidence of real-world model quality, and it does not substitute for a real
labeled corpus.

## Golden fixtures are OUTPUTS, not inputs

`tests/fixtures/*_results.json` are **5 pre-scored scan-output payloads** for real
named extensions (e.g. "Equalizer for Chrome browser", "Session Buddy"). They
carry engine outputs (`governance_verdict`, `overall_security_score`, …) and have
**no** top-level `signal_pack`. A raw `SignalPack.model_validate` on one **fails**
(missing `scan_id`), and their analyzer sections are shaped differently from the
SignalPack sub-packs — so they need conversion, not a direct load.

Verify (representative):

```
python3 -c "import json; d=json.load(open('tests/fixtures/abikfbojmghmfjdjlbagiamkinbmbaic_results.json')); print('signal_pack' in d, 'governance_verdict' in d)"
# -> False True   (output payload, not an input)
```

## The extraction utility (`scripts/scoring/extract_signal_pack.py`)

Converts a golden fixture into a corpus entry by **reusing the production
`SignalPackBuilder`** (`extension_shield.governance.tool_adapters`) — the same
builder the real scan pipeline uses (`report_view_model.py`, `governance_nodes.py`,
`payload_helpers.py`, `api/main.py`). It reconstructs the `analysis_results` dict
from the fixture sections (identity for most; `sast_results` → `javascript_analysis`,
the key `SastAdapter` reads), builds the pack, and serializes it with
`model_dump(mode="json")` into `inputs.signal_pack`.

```
# dry-run to stdout (offline):
uv run python -m scripts.scoring.extract_signal_pack tests/fixtures/abikfbojmghmfjdjlbagiamkinbmbaic_results.json
# write to an uncommitted path (never into tests/fixtures/scoring_corpus/):
uv run python -m scripts.scoring.extract_signal_pack tests/fixtures/*_results.json --output /tmp/extracted_corpus.json
```

- Fully offline: `SignalPackBuilder.build()` is a pure dict→SignalPack transform
  (no scans/network/DB).
- `label` is always `unknown`; `expected_verdict` is `null` unless a human passes
  `--expected-verdict`. The fixture's `governance_verdict`/`overall_*` are recorded
  only under a non-authoritative `extraction.engine_outputs_not_ground_truth` field
  and are **never** used as a label.
- **No silent data loss:** it warns (stderr) when a fixture section had data but
  the built sub-pack came back empty (a key mismatch), rather than dropping it.

### Fidelity caveat

Extracted packs are **best-effort reconstructions for labeling**, not a
score-reproduction guarantee. Re-scoring one may not reproduce the fixture's
stored `overall_security_score`/`governance_verdict`: the fixtures may predate the
current engine/normalizer, and the persisted results view is not guaranteed
identical to the raw `analysis_results` the builder originally consumed. The
harness's job is before/after comparison of a *fixed* input under two models — not
matching a historical score.

## Labeling rules (for the future data-population PR)

- Default to `label: "unknown"`; assign a real label only when the fixture signals
  provide **evidence-backed** support. Do not infer labels from filenames.
- `malicious` requires the **strongest** evidence and an explicit rationale.
- **Never** treat `governance_verdict`/`overall_risk` as ground truth — they are
  engine outputs, not human labels.
- Real extension IDs/names carry accuracy/reputation risk: **anonymize or
  evidence-gate** them before committing labeled real-extension corpus data.
- **Do not commit** CRX binaries, `extensions_storage/`, `local_rescan_reports/`,
  `EXTENSIONSHIELD_ENGINE_STATE.md`, or any private/user data. This utility ships
  the tool only — it does not commit extracted real-extension entries.

## Minimum viable corpus (proposed target)

A defensible first-pass calibration target (a starting proposal, to refine — per
OWASP, "not necessary to be over-precise"):

| Label | Target | Have (real) | Shortfall |
| --- | --- | ---: | ---: |
| benign | 15 | 0 | 15 |
| malicious | 15 | 0 | 15 |
| needs_review | 10 | 0 | 10 |
| low_confidence / coverage-limited | 10 | 0 | 10 |
| **Total** | **~50** | **0** | **~50** |

## Blocker status

- **PR-4 (v1.1 weights): BLOCKED** — 0 real labeled cases vs the ~50 target; churn
  cannot be proven without a labeled before/after corpus.
- **PR-5 (v2 reputation modifier): BLOCKED** — machinery exists, corpus data does
  not. The extraction utility (this PR) is a prerequisite step toward the data,
  not the data itself.
