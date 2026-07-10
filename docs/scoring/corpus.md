# Scoring calibration corpus + before/after harness

This document describes the offline corpus and the before/after scoring
comparison harness that together form the prerequisite for any future weight or
layer change (PR-4 conservative weights, PR-5 reputation modifier / v2 model).

**Why this exists.** Weight/layer changes move scores and verdicts. We cannot
prove a change is safe from intuition — every authoritative source (NIST, OWASP,
CVSS) calibrates risk weights against data. The golden snapshots
(`tests/test_golden_snapshots.py`) are frozen *outputs* of a handful of pinned
fixtures; they pin stability but cannot be recomputed under a new model, so they
are not a calibration corpus. This corpus stores scoring **inputs** so any future
model can be re-run against it and diffed.

## Corpus format

A corpus file is a JSON array of entries (an object with an `entries` array is
also accepted). Each entry:

| Field | Required | Type | Meaning |
| --- | --- | --- | --- |
| `id` | yes | string | Unique id within the corpus. |
| `name` | yes | string | Human-readable name. |
| `label` | yes | enum | Human ground-truth: `benign`, `malicious`, `needs_review`, `low_confidence`, `unknown`. **Advisory only** — never asserted against engine output. |
| `inputs` | yes | object | The scoring inputs (see below). Must contain `signal_pack`. |
| `expected_verdict` | no | enum/null | `ALLOW`, `NEEDS_REVIEW`, `BLOCK`, or null. Advisory ground-truth; not asserted. |
| `confidence` | no | number/null | Reviewer confidence in the label `[0,1]` or null. |
| `rationale` | no | string | Why the label was assigned; cite evidence. |
| `tags` | no | string[] | Free-form tags (e.g. `broad-host`, `synthetic`). |
| `known_signals` | no | string[] | Notable signals present, for reviewer context. |
| `notes` | no | string | Anything else. |

### `inputs` — SignalPack-shaped inputs, not outputs

`inputs` mirrors the arguments to `ScoringEngine.calculate_scores`:

| Key | Required | Meaning |
| --- | --- | --- |
| `signal_pack` | yes | A JSON object that deserializes via `SignalPack.model_validate(...)`. May be minimal — omitted sub-packs fall back to their model defaults. |
| `manifest` | no | Optional manifest dict passed to the engine (or null). |
| `user_count` | no | Optional install count for popularity-based confidence (or null). |
| `permissions_analysis` | no | Optional raw permissions-analysis dict (or null). |

Store **inputs, never a pre-scored `ScoringResult`.** Outputs cannot be recomputed
under a different weight model, which defeats the purpose of the corpus.

To serialize a real `SignalPack` into an entry, use
`pack.model_dump(mode="json")`. Set a fixed `created_at` (e.g.
`"2024-01-01T00:00:00+00:00"`) so committed fixtures are stable and never embed a
wall-clock time.

## Adding a labeled case

1. Copy an entry from `tests/fixtures/scoring_corpus/template.json`.
2. Fill `inputs.signal_pack` with real (offline) SignalPack data. Do **not**
   include CRX binaries, secrets, API-derived payloads, or private scan
   artifacts.
3. Assign `label` / `expected_verdict` **only** when a real human review backs
   the claim. If unsure, leave `label: "unknown"` and `expected_verdict: null`.
   Do not invent labels.
4. Keep `id` unique.

## Running the harness

Fully offline — it imports only the local `ScoringEngine` and `SignalPack` and
reads local JSON. No network, scans, or database access.

```
uv run python -m scripts.scoring.compare_scoring_corpus \
  --corpus tests/fixtures/scoring_corpus/starter_corpus.json \
  --baseline v1 --candidate v1 --format md
```

- `--baseline` / `--candidate` are `weights_version` presets. Today only `v1`
  exists, so the default is **identity mode** (`v1` vs `v1`) and the report shows
  a zero diff — that is the machinery self-check. When a future preset lands
  (e.g. `v1.1`), pass `--candidate v1.1` to see the real before/after.
- Reports are written to the git-ignored `scoring_reports/` directory by default
  (override with `--out`). **Generated reports are not committed.**

## Reading the report

Each row reports: baseline and candidate score/verdict, the score delta, the
verdict-flip type, per-layer score deltas, and per-factor contribution deltas.

Flip types: `ALLOW<->NEEDS_REVIEW`, `NEEDS_REVIEW<->BLOCK`, `ALLOW<->BLOCK`.

## Sign-off rules for future weight/model changes

The harness measures movement; humans decide if it is acceptable. Before shipping
a weight/model change:

- **`ALLOW<->BLOCK` flips require explicit human review.** The report flags them.
- **Every verdict flip must list its driver** — the layer/factor deltas in the
  report identify it; record it in the PR.
- **Reputation-only changes must never create a `BLOCK`.** Reputation/maintenance
  is a bounded, downward-biased context/confidence modifier, not a verdict driver.
- **Low-confidence cases stay conservative** — a change should not turn a
  low-confidence case into a stronger verdict without cause.
- **Version bumps are mandatory:** any weight/formula change requires a
  `weights_version` bump **and** a `ScoringEngine.VERSION` bump (which drives the
  emitted `scoring_version`); any decision-precedence or rulepack-verdict change
  requires a `DECISION_VERSION` bump. Recompute-on-read then refreshes cached rows.

This harness introduces **no** scoring change: it only reads inputs and runs the
existing engine. It never edits weights, gates, rulepacks, thresholds, or version
constants.
