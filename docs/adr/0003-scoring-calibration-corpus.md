# ADR 0003: Scoring Calibration Corpus — Sourcing, Labeling, Anonymization & Sign-off

- **Status:** Proposed (awaiting sign-off; not yet Accepted)
- **Date:** 2026-07-09
- **Area:** Scoring engine (`scoring/`), corpus tooling (`scripts/scoring/`, `tests/fixtures/scoring_corpus/`), docs (`docs/scoring/`)
- **Related:** [ADR 0001](0001-scoring-governance-decision-authority.md) (single decision authority, confidence gating), [ADR 0002](0002-scoring-layer-ownership.md) (layer ownership; §"Follow-up PR sequence" gates weight changes on a labeled corpus)

## Context

The backend scoring stack has completed its "ready-now, non-weight" cleanup and
its calibration **tooling**, but not its calibration **data**:

- **#274** — corpus schema + offline before/after harness
  (`scripts/scoring/compare_scoring_corpus.py`, `docs/scoring/corpus.md`).
- **#275** — signal-pack extraction utility (`scripts/scoring/extract_signal_pack.py`)
  that converts scan-output fixtures into `inputs.signal_pack` corpus entries.
- **#276** — a small **synthetic** labeled seed
  (`tests/fixtures/scoring_corpus/synthetic_labeled_seed.json`).

The live inventory and its counts are maintained in
[`docs/scoring/corpus_inventory.md`](../scoring/corpus_inventory.md) — treat that
file as the source of truth, not this ADR. As recorded there, the
**real, evidence-backed labeled count is 0**, and both PR-4 (conservative v1.1
weights) and PR-5 (v2 reputation modifier) are **blocked**. The synthetic seed is
harness-coverage scaffolding; it is **not** real-world calibration data.

ADR 0002 already established that weight/layer changes must be calibrated against
data, not intuition (per NIST SP 800-30 and OWASP risk-rating guidance), and left
the labeled corpus as the outstanding prerequisite. This ADR defines **how that
real corpus is sourced, labeled, anonymized, and gated** so that PR-4/PR-5 can be
attempted safely — and only when the data is actually sufficient.

The audits behind this ADR surfaced two concrete hazards that the policy must
address:

1. **Synthetic ≠ real.** Calibrating weights on constructed signals optimizes for
   the constructor's assumptions, not observed behavior. The synthetic seed must
   never be counted toward the real corpus target.
2. **Real extractions leak PII.** A readiness audit found that an extracted entry
   for a real extension carries the raw extension id (in `entry.id`,
   `signal_pack.scan_id`, and `signal_pack.extension_id`), the developer name and
   a **real personal email address** (`webstore_stats.developer_email`), a
   personal homepage URL (`manifest.homepage_url`), the brand name
   (`manifest.name`), and brand-bearing host patterns — far more than the entry
   header. Any real-data path must treat this as the anonymization surface.

## Decision

Adopt the following policy. It is **docs-only**; it changes no scoring behavior,
weights, gates, thresholds, rulepacks, schema, harness, or fixtures.

### 1. End goal

Build a safe, real, evidence-backed labeled corpus; use it to evaluate **PR-4**
(conservative v1.1 weight rebalance) with a before/after diff; then, with PR-4
learnings and a separate reputation-modifier design, evaluate **PR-5** (v2
reputation-as-modifier / cleaner architecture).

### 2. Approved source categories

Each source is allowed only under the stated requirements.

| Source | Usefulness | Risk | Requirements before use |
| --- | --- | --- | --- |
| Public/academic labeled extension datasets | High — provides malicious/benign ground truth | Licensing; format mismatch | Confirm license permits redistribution; convert to `inputs.signal_pack`; record provenance |
| Local git-ignored extracted artifacts (`extensions_storage/`) | Medium — real scans on hand | **Untracked, CRX-derived, unanonymized, PII** | Anonymize per §5; evidence-gate labels; never commit CRX/source trees |
| Public takedown / advisory lists | Medium — known-malicious ids | Requires scanning (out of scope here); CRX handling | Obtain signals without committing CRX; cite the advisory as evidence |
| Existing golden fixtures (`tests/fixtures/*_results.json`) | Low — 5 popular, low-finding, likely-benign, real-named | Reputational (label claim on a named product) | Anonymize per §5; treat clean signals as weak evidence for benign |
| Synthetic cases | Medium — deterministic class coverage | Not real-world | Clearly marked synthetic; **does not count** toward the real target |
| Future user-submitted reports (if ever allowed) | Potentially high | Consent, PII, provenance | Explicit consent + anonymization policy before any use |

### 3. Disallowed sources / data (never committed)

- CRX binaries or raw extracted extension source trees.
- Private/user data; personal emails; developer identities used as label evidence.
- Labels inferred from brand, reputation, popularity, or name recognition.
- `governance_verdict` / `overall_risk` / `overall_security_score` treated as
  human ground truth (they are engine outputs).
- Local rescan artifacts (`extensions_storage/`, `local_rescan_reports/`,
  `EXTENSIONSHIELD_ENGINE_STATE.md`, `scripts/local_rescan_and_compare.py`) as
  committed corpus data.

### 4. Labeling rubric

Labels: `benign`, `malicious`, `needs_review`, `low_confidence`, `unknown`
(the schema's `VALID_LABELS`).

- **Default to `unknown`.** A label is a claim; absence of a label is safe.
- **`benign` is evidence-gated** — clean/absent signals are weak evidence, not
  proof; do not assume benign from a familiar name or clean static scan.
- **`malicious` requires the strongest evidence** — e.g. VirusTotal detections,
  critical SAST / remote-code / credential-exfil findings; and an explicit
  rationale.
- **`needs_review` requires concrete policy/privacy/governance evidence** (a
  sensitive capability combo, a disclosure/ToS gap), not mere capability.
- **`low_confidence` requires an explicit coverage/analyzer gap** (e.g.
  `sast.files_scanned = 0`, analyzer disabled).
- **Every label cites the specific signal values** from its `inputs.signal_pack`
  (e.g. `virustotal.malicious_count`, `sast.counts_by_severity.CRITICAL`).
  `label` is intended ground truth; `expected_verdict` stays advisory/`null`, and
  any label↔engine-output divergence is calibration evidence, not a bug.

### 5. Anonymization policy

Anonymization is **non-trivial** because identifiers are scattered through the
entry, not just its header. Before committing any real labeled entry, scrub /
pseudonymize **all** of:

- `entry.id`, `entry.name`
- `inputs.signal_pack.scan_id`, `inputs.signal_pack.extension_id`
- `inputs.manifest` fields (`name`, `author`, `homepage_url`, `update_url`,
  brand-bearing `description`)
- `webstore_stats.developer`, `developer_email`, `developer_website`,
  `developer_profile`
- brand-bearing host permissions / domains

**Scoring-neutrality is mandatory.** Some brand host patterns are also scoring
inputs; identifiers such as `scan_id`/`extension_id` are not. Any generalization
of a scoring-relevant field must be proven to leave the score and verdict
unchanged, or it is disallowed. **Honesty caveat:** the golden fixtures' ids are
already public, and hashing an already-public id is weakly reversible — the value
of anonymization here is breaking the direct *name → label* association in the
committed corpus, not making the source unrecoverable.

**Anonymization code must not be written until this policy is accepted.** Once
accepted, it is implemented as a mode that produces a full-entry-scrubbed output
(with a leakage test that scans the entire serialized entry) and a
score-equivalence test (`score(anonymized) == score(original)`).

### 6. MVP corpus target & "sufficient"

The minimum-viable target and current shortfall live in
[`corpus_inventory.md`](../scoring/corpus_inventory.md): **benign 15 / malicious
15 / needs_review 10 / low_confidence 10** (~50), currently **0 real**. The
synthetic seed **does not count** toward this target. PR-4/PR-5 remain **blocked**
until the real inventory meets this target (or a documented, signed-off
exception).

### 7. Before/after sign-off process

Every scoring change attaches the harness before/after report to its PR, and a
reviewer checks:

- overall and per-layer **score deltas**;
- **verdict flips**, by type: `ALLOW ↔ NEEDS_REVIEW`, `NEEDS_REVIEW ↔ BLOCK`, and
  `ALLOW ↔ BLOCK` (the last requires the **strongest** review and explicit
  sign-off);
- that **reputation-only changes never produce a `BLOCK`** on their own
  (reputation/maintenance is a bounded, downward-biased context modifier, per
  ADR 0002 and CVSS "report confidence gates, never inflates");
- that each flip lists its **driver** (the layer/factor delta that caused it).

No scoring change merges without this report.

### 8. PR gating rules

- **PR-4** cannot proceed until the real corpus meets §6 (or a written,
  signed-off exception). It carries a `weights_version` bump and a
  `ScoringEngine.VERSION` bump (which drives the emitted `scoring_version`), plus
  a before/after report.
- **PR-5** cannot proceed until the real corpus is sufficient **and** PR-4
  learnings exist **and** a separate reputation-modifier **design ADR** is
  accepted. It carries the appropriate version bumps (plus `DECISION_VERSION` if
  decision precedence or a rulepack verdict changes).
- No scoring change merges without a before/after corpus report.

## Consequences

- Weight/model work stays gated on **data**, not effort or intuition — the safe
  outcome that ADR 0002 anticipated.
- The path to unblock is explicit and ordered (next section), so contributors do
  not jump to PR-4 prematurely or commit unsafe/real-PII data.
- The synthetic seed remains useful for harness coverage without ever inflating
  the real count.

## Next steps after this ADR

1. Accept this ADR (flip Status → Accepted).
2. Decide the first source category (§2) to pursue.
3. Implement anonymization support **only if** real entries will be committed
   (§5), with leakage + score-equivalence tests.
4. Collect a first small real, evidence-backed corpus batch (labeled per §4).
5. Run the before/after harness and attach the report.
6. Only then revisit **PR-4**.

This ADR introduces **no** scoring, schema, harness, or fixture change, and does
not add any real corpus entry; the real labeled count remains **0**.
