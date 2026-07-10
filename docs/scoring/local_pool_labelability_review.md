# Local-pool labelability & candidate review

Companion to [`corpus_inventory.md`](corpus_inventory.md) and
[ADR 0003](../adr/0003-scoring-calibration-corpus.md). This file defines the
**method** for turning the local, git-ignored scan-result pool into real,
human-reviewed, evidence-gated corpus labels. It is **methodology + a blank
worksheet template only** — it contains no pool data, no per-candidate
enumeration, no signal-pack JSON, and no identifiers.

## Purpose

The extractor can anonymize a local scan result and emit a schema-valid corpus
entry, and a signal-only heuristic can *triage* those entries. Neither produces a
**label**. A label is a human claim about an extension's real behavior, cited to
evidence, per [ADR 0003 §4](../adr/0003-scoring-calibration-corpus.md). This
review process is the bridge: it takes the provisional, machine triage as a
worklist and requires a reviewer to gather external evidence and assign (or
withhold) a label by hand. Nothing here changes the scoring model.

## Dry-run safety result (aggregate only)

A local-only, in-memory dry-run exercised the anonymizer + validators over the
whole pool. The point of the table below is narrow: **the anonymizer is proven
safe on this pool** (it emits valid, leak-free, score-neutral entries and fails
closed otherwise). It is **not** a finding about any specific extension.

| Metric | Count |
| --- | ---: |
| Files inspected | 30 |
| Anonymized-valid emitted | 28 |
| Fail-closed `not_usable` | 2 |
| Extraction failures | 0 |
| Validation failures | 0 |
| Leak failures | 0 |
| Score/verdict-neutrality failures | 0 |

The 2 `not_usable` entries are the expected counterexamples: PII that coincides
with a *preserved* scoring field, which the extractor refuses to emit rather than
leak or rewrite. That is correct fail-closed behavior, not a defect.

## Provisional triage is NOT a label

> **Warning.** The signal-only triage is an advisory worklist, not a labeling
> result. It is derived from anonymized signals by a fixed heuristic and has **no
> evidentiary weight**. Do not copy a triage bucket into the `label` field.

Provisional signal-only triage over the 28 emitted candidates:

| Provisional bucket | Count |
| --- | ---: |
| `candidate_benign` | 5 |
| `candidate_needs_review` | 20 |
| `candidate_low_confidence` | 0 |
| `unknown` | 3 |
| evidence-backed malicious | 0 |

> **Over-flagging caveat.** The `candidate_needs_review = 20` is dominated by the
> entropy/obfuscation and broad-host heuristics firing on **minified/bundled code
> in benign-leaning extensions**. This is advisory noise, not 20 real review
> candidates. Expect most of it to resolve to `benign` or `unknown` once a human
> checks coverage and external evidence. Treat the bucket sizes as triage load,
> never as label counts.

**Real evidence-backed labeled count remains 0.** No label is created by this
document.

## Labeling rules (source of truth: ADR 0003 §4)

Summarized — see [ADR 0003 §4](../adr/0003-scoring-calibration-corpus.md) for the
authoritative rubric. Do not re-derive it here.

- **Default to `unknown`.** Absence of a label is safe; a label is a claim.
- **`benign`** — evidence of normal behavior / no strong risk. Clean or absent
  signals are *weak* evidence, not proof; a familiar name is not evidence.
- **`needs_review`** — concrete policy/privacy/governance evidence or risky
  signals (a sensitive capability combo, a disclosure/ToS gap), not mere
  capability.
- **`low_confidence`** — an explicit coverage/analyzer gap (e.g. SAST not run,
  analyzer disabled).
- **`malicious`** — the **strongest external evidence** only (e.g. VirusTotal
  detections, critical SAST / remote-code / credential-exfil), with rationale.
- **Engine output is never ground truth.** `governance_verdict` / `overall_*`
  and this doc's triage buckets are inputs to review, not labels. Every label
  cites specific signal values and its external evidence.

## Review-worksheet template (blank)

Fill this **locally only**; a filled worksheet is corpus-adjacent data and is
itself ADR-0003 + anonymization-gated (see "Next decisions"). Row ids below are
generic placeholders (`candidate-01…`), **not** the pool's pseudonymous hashes,
and are **not** populated with pool items. One row per candidate under review.

| Row id | Anonymized signal summary | Coverage status | External evidence source | Reviewer rationale | Proposed label | Reviewer / date | Second-review status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| candidate-01 | | | | | | | |
| candidate-02 | | | | | | | |
| candidate-03 | | | | | | | |
| … | | | | | | | |

### Column definitions (required evidence fields)

- **Anonymized signal summary** — the brand-redacted signal profile in prose
  (permission posture, SAST severity counts, VT enablement/hits, entropy, network
  flags). No raw host patterns, no signal-pack JSON, no identifiers.
- **Coverage status** — which analyzers actually ran (SAST files scanned, VT
  enabled, network enabled) and any gaps. Drives eligibility for `low_confidence`.
- **External evidence source** — the off-engine basis for the label (store
  listing behavior, published CVE/advisory, VT vendor consensus, code review of a
  specific behavior). Required for any label other than `unknown`; **mandatory and
  strongest** for `malicious`.
- **Reviewer rationale** — why the evidence supports the proposed label, citing
  the specific signals/evidence. Engine verdict is not a rationale.
- **Proposed label** — one of `benign` / `malicious` / `needs_review` /
  `low_confidence` / `unknown` per ADR 0003 §4. Default `unknown`.
- **Reviewer / date** — who reviewed and when.
- **Second-review status** — independent sign-off state (`pending` /
  `confirmed` / `disputed`) per the ADR 0003 §7 two-review process.

## MVP gap analysis

Target and current shortfall live in
[`corpus_inventory.md`](corpus_inventory.md): **benign 15 / malicious 15 /
needs_review 10 / low_confidence 10** (~50), currently **0 real**. What this pool
can plausibly contribute, as a *ceiling before* human evidence review:

| Class | Pool ceiling (provisional) | Target | Note |
| --- | ---: | ---: | --- |
| benign | ≤ 5 | 15 | shortfall ≥ 10 even if all provisional-benign survive review |
| needs_review | soft / over-flagged | 10 | heuristic noise; real count unknown until reviewed |
| low_confidence | 0 | 10 | pool has coverage; needs deliberate sourcing (shortfall 10) |
| malicious | 0 | 15 | **pool cannot supply this** — needs a separate evidence-backed source (shortfall 15) |

The pool is structurally benign-leaning (popular extensions with analyzer
coverage), so it cannot supply the malicious class and does not naturally supply
coverage-limited (`low_confidence`) cases.

## Next decisions

1. **Human review of the emitted candidates** — a reviewer works the ~28
   candidates through the blank template above, locally, producing proposed
   labels + evidence. This does not commit anything by itself.
2. **Separate malicious-source acquisition** — a distinct decision, because the
   pool structurally cannot supply the malicious class. Needs an evidence-backed
   external source.
3. **Separate low-confidence sourcing** — the pool does not naturally contain
   coverage-limited cases; sourcing them is its own decision.

**Committing any filled worksheet, or any real label, is itself ADR-0003 §5 +
§7 gated** (anonymization proven safe, evidence cited, two-review sign-off). This
document commits neither.

## Blocker status

- **Real evidence-backed labeled count remains 0.** This is methodology, not data.
- **PR-4 (v1.1 weights): BLOCKED** — 0 real labeled cases vs the ~50 target.
- **PR-5 (v2 reputation modifier): BLOCKED** — machinery exists; corpus data does
  not. This review process is a step toward the data, not the data.
