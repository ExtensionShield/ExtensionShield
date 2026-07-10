# ADR 0002: Scoring Layer Ownership and Staged Cleanup

- **Status:** Accepted
- **Date:** 2026-07-09
- **Area:** Scoring engine (`scoring/`), governance pipeline (`governance/`, `workflow/`), report normalization (`frontend/`)

## Context

A source-backed audit of the backend scoring stack (weights, engine, gates,
decision, normalizers, governance nodes, payload/recompute paths) found that the
current model is coherent and safe, but mixes concerns in ways that make it hard
to explain and tune:

1. **Reputation/maintenance lives inside the Security scoring layer.**
   `ChromeStats`, `Webstore`, and `Maintenance` are each weighted `0.10` in
   `scoring/weights.py:26-28` — 30% of the Security layer is
   reputation/context, not direct technical-security evidence.
2. **A few signals are counted in more than one place** (duplicate-risk):
   - **privacy-policy** absence — **RESOLVED in PR-2 (scoring_version 2.1.1).**
     Was scored in `Webstore` (Security) *and* `DisclosureAlignment` (Governance).
     `normalize_webstore_trust` (`normalizers.py`) no longer adds severity for a
     missing privacy policy; `DisclosureAlignment` (`engine.py`) is now the sole
     scored owner. Webstore retains `no_privacy_policy` as listing context only.
     The `SENSITIVE_EXFIL` gate and the governance rulepacks still read the raw
     `has_privacy_policy` field independently — that is a separate hard-gate /
     policy concern (factor-vs-gate), unchanged here and tracked for PR-3.
   - **broad-host access** — bare-capability double-count **RESOLVED in PR-3a
     (scoring_version 2.1.2).** Was scored unconditionally by both `Manifest`
     posture (Security) *and* `PermissionCombos` (Privacy). `normalize_manifest_posture`
     no longer adds severity for bare broad-host; `PermissionCombos` is now the
     sole scored owner. Manifest retains `broad_host_access` as manifest context.
     The **compound** broad-host uses are intentionally distinct AND-conditions and
     remain unchanged: `ToSViolations` (broad-host **+ VT malicious**), `CaptureSignals`
     (broad-host **+ capture perm**), `NetworkExfil` (exfil risk **when analysis
     ran**), `DisclosureAlignment` (broad-host **+ no privacy policy**). Gates
     (`PURPOSE_MISMATCH`, `SENSITIVE_EXFIL`) read the raw `has_broad_host_access`
     field independently of any factor and are unchanged.
     *Second-order note:* removing the Manifest severity means a benign-named
     extension (e.g. "New Tab") with broad-host + missing CSP and no other
     high-severity signal no longer crosses the Governance/`Consistency`
     `has_high_security_risk` (> 0.5) boundary, so its `benign_claim_risky_behavior`
     flag no longer fires via the Manifest path. Expected and acceptable — broad-host
     is still scored once (PermissionCombos); no test-corpus verdict changed.
   - **purpose-mismatch**, **exfil**, and **ToS/policy** are each represented by
     both a scoring factor (`Consistency` / `NetworkExfil` / `ToSViolations`) and
     a hard gate (`PURPOSE_MISMATCH` / `SENSITIVE_EXFIL` / `TOS_VIOLATION`).
3. **Version metadata drifted.** `scoring/explain.py` defaulted
   `scoring_version` to `"2.0.0"` while `ScoringEngine.VERSION` was `"2.1.0"`
   (`engine.py:106`). The production scan path passes the engine version
   explicitly (`engine.py:856`), so stored scans and golden snapshots were
   unaffected, but any explanation built without an explicit version (e.g.
   `get_ui_explanation`) emitted stale metadata.

**Task C** (report/domain reclassification + verdict-authority label, PR #267)
is already merged and was **frontend/display-only**. It presents ChromeStats /
Webstore / Maintenance under a **"Reputation & Maintenance Context"** section and
shows the Decision Authority, but changed **no** backend score, weight, gate,
threshold, rulepack, analyzer, persistence, or API payload shape. The frontend
maps by backend `FactorScore.name`, so backend factor names and the
`scoring_v2.{security,privacy,governance}_layer` emission shape are now a
compatibility contract.

## Decision

Adopt a **staged** cleanup. This ADR records the current ownership and the
target, and commits to a version-gated migration so cached scans stay safe and
explainable. Best-practice basis: CVSS versions its scoring concepts and treats
confidence/temporal factors as modifiers that never inflate a base score; OWASP
Risk Rating separates technical from business/context impact; NIST CSF 2.0
(GOVERN) expects risk policy to be documented and monitored. An ADR + regression
tests **before** any recalibration is the OSS-safe order.

### 1. Current backend layers are unchanged (this PR)

- Backend scoring layers remain **Security / Privacy / Governance**.
- Layer weights remain **0.34 / 0.33 / 0.33** (`weights.py:65-68`).
- Factor weights are **unchanged**.
- Reputation/Maintenance (`ChromeStats`, `Webstore`, `Maintenance`) **still live
  in the Security scoring layer**. Task C only changes how they are *presented*.

### 2. Target direction (future PRs, not this one)

- **Reputation & Maintenance should become context/confidence**, not a co-equal
  heavy scoring input: a bounded, downward-biased modifier (like a CVSS temporal
  metric) that can nudge but never, on its own, drive `NEEDS_REVIEW`→`BLOCK`.
- **Each duplicated signal gets one scored owner**, with the others demoted to
  evidence-only or gate-only:
  - privacy-policy → single owner in Governance (`DisclosureAlignment`).
  - broad-host → single scored owner in Privacy (`PermissionCombos`).
  - purpose-mismatch / exfil / ToS → the graded factor and the hard gate must not
    double-penalize the **same** evidence without explicit intent.
- **Reputation/maintenance must never be a standalone BLOCK authority** — there
  is no reputation gate and no reputation rung in `decision.resolve()`, and that
  must stay true. Enforced by `tests/scoring/test_no_double_count.py`.

### 3. Versioning rules for any future scoring change

- Any **weight or scoring-formula change** requires bumping `weights_version`
  (`weights.py`) **and** `ScoringEngine.VERSION` (drives `scoring_version`), plus
  **regenerating golden snapshots** (`tests/test_golden_snapshots.py`) with a
  before/after verdict diff.
- Any **decision precedence or rulepack verdict/advisory change** requires
  bumping `DECISION_VERSION` (`governance/decision_refresh.py:42`).
- The read-time recompute paths (`api/payload_helpers.py`,
  `governance/decision_refresh.py`) already refresh cached rows when a stored
  version differs, so a version bump is the migration mechanism; a revert of the
  version constants is the rollback.

## Scope of this PR (PR-1)

Hygiene only — **no** score, verdict, weight, threshold, gate, rulepack,
analyzer, or golden-snapshot change:

- Fix the `scoring_version` drift: `explain.py` now sources the version from
  `ScoringEngine.VERSION` (via a lazy helper to avoid the `engine → explain`
  circular import) instead of a hardcoded `"2.0.0"` default.
- Add `tests/scoring/test_scoring_version_consistency.py` (fails if a stale
  version default is reintroduced).
- Add `tests/scoring/test_no_double_count.py` (tracks the duplicate-risk areas
  above and enforces the reputation-never-BLOCK invariant).
- Add this ADR.

## Consequences

- The emitted `scoring_version` metadata is now consistent everywhere; no stored
  score or verdict changes (the production path already emitted `2.1.0`).
- The duplicate-risk areas are now covered by tracking tests, so the future
  de-duplication PRs must update them deliberately (a visible, reviewed signal).
- A follow-up hygiene item: `scoring/models.py:327-328` also defaults
  `scoring_version` to `"2.0.0"`, but it is always overridden by the engine
  (`engine.py:473,857`) and never emitted stale in stored scans; consolidate it
  in a later pass.

## Follow-up PR sequence (planned)

1. **PR-2 — DONE (scoring_version 2.1.1)** — privacy-policy counted once
   (`DisclosureAlignment` owns it). Removed the `Webstore` severity contribution
   for a missing privacy policy; kept it as listing context/evidence. Golden
   snapshots unchanged (they read static fixture values, not live scoring).
2. **PR-3a — DONE (scoring_version 2.1.2)** — broad-host counted once
   (`PermissionCombos` owns the bare-capability signal). Removed the unconditional
   `Manifest` severity contribution; kept it as manifest context. Compound
   broad-host uses left intentionally separate. Golden snapshots unchanged.
   - **PR-3b (deferred)** — purpose-mismatch / exfil / ToS factor-vs-gate: these
     are graduated by design (small soft factor + large corroboration-gated hard
     gate), **not** naive duplicates. Requires a case-by-case audit and, for any
     gate-trigger change, a labeled corpus — deferred, not folded into PR-3a.
3. **PR-4** — optional Security internal rebalance (`weights_version` bump).
4. **PR-5** — reputation-as-modifier + layer re-weight, gated on a labeled
   benign/malicious/review corpus (`weights_version` + `scoring_version`, golden
   regen, rollback documented).
