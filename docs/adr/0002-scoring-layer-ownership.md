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

### 4. Factor-vs-gate audit outcomes (PR-3b docs/tests + PR-3c dedup)

PR-3b (docs/tests only — no scoring formula, weight, gate, threshold, rulepack,
or `ScoringEngine.VERSION` change) closed two of the three factor-vs-gate items
from §2 by proving, at the code level, that the factor and the gate consume
**disjoint evidence** — a graded soft signal plus a hard, corroboration-gated
stop — rather than double-penalizing the same input. PR-3c then resolved the
third (ToS bare prohibited-permission), the one genuine narrow duplicate,
bumping `ScoringEngine.VERSION` to `2.1.3`.

- **purpose-mismatch — AUDITED: intentionally layered, not a duplicate.**
  The `Consistency` factor (`engine.py` `_compute_governance_factors`, ~594-696)
  fires only on an **indirect aggregate**: a benign purpose claim
  (theme/color/font/wallpaper/new tab) combined with any security/privacy factor
  severity `> 0.5`, or an `"offline"` claim plus broad-host. Its only flags are
  `benign_claim_risky_behavior` and `offline_claim_network_access`; it never
  inspects SAST behavior. The `PURPOSE_MISMATCH` gate (`gates.py`
  `evaluate_purpose_mismatch`, 919-1107) BLOCKs only on **direct, SAST-classified
  behavior** — `remote_code`, `secret_read`+`exfil`, `key_capture`+`exfil`, or a
  corroborated `standalone_dangerous` behavior — classified by the concrete
  rule-suffix taxonomy (`_PM_*`, 252-288), never by keywords. The evidence sets
  are disjoint: a remote-code BLOCK leaves `Consistency` at severity 0 with no
  SAST-derived flag. Locked by
  `test_purpose_mismatch_gate_and_consistency_factor_use_disjoint_evidence`.

- **exfiltration — AUDITED: intentionally layered, not a duplicate.**
  The `NetworkExfil` factor (`normalizers.py` `normalize_network_exfil`,
  ~825-950) is driven by `NetworkSignalPack` domain/pattern analysis and returns
  **severity `0.0` whenever `network.enabled` is False** (early return,
  ~849-865). The `SENSITIVE_EXFIL` gate (`gates.py` `evaluate_sensitive_exfil`,
  1113-1233) is driven by a **permission count + coarse SAST text-regex +
  privacy-policy absence** (2+ risk factors → WARN), and is **structurally
  WARN-only by design**: its `decision` is the literal `"WARN"` (~line 1205) with
  no `BLOCK` path in the function. The only shared input is the `has_network`
  boolean; every other input is disjoint. A WARN with network analysis off leaves
  `NetworkExfil` at severity `0.0`. Locked by
  `test_sensitive_exfil_gate_and_network_factor_use_disjoint_evidence` and the
  WARN-only invariant `test_sensitive_exfil_gate_is_structurally_warn_only`.

- **ToS bare prohibited-permission declaration — RESOLVED in PR-3c
  (scoring_version 2.1.3).** `ToSViolations` (`engine.py`
  `_compute_governance_factors`, ~599-606) and the `TOS_VIOLATION` gate
  (`gates.py` `evaluate_tos_violation`, 607-847) both keyed a contribution off
  the **identical** `{"debugger", "proxy", "nativeMessaging"}` set for a *bare
  declaration* (no corroborating evidence) — a genuine narrow duplicate.
  `ToSViolations` no longer adds severity (`tos_severity += 0.5 * ...`) for a
  bare declaration; it still emits `prohibited_perm:{perm}` in `flags` and
  `details["violations"]` as evidence/context (unchanged emission shape). The
  **`TOS_VIOLATION` gate is untouched and is now the sole scored/decision
  owner**: a bare declaration still WARNs, and an aggravated declaration
  (`externally_connectable` wildcard, or SAST evidence tied to the specific
  restricted capability) still BLOCKs — no gate-trigger, threshold, or penalty
  logic changed. The compound `ToSViolations` use (broad-host **+ VT
  malicious**) and the **travel-docs/visa-portal heuristic** are both untouched
  and still contribute severity — only the bare-permission branch was touched.
  Locked by `test_tos_bare_prohibited_permission_scored_only_by_gate`,
  `test_tos_gate_still_blocks_aggravated_prohibited_permission`, and
  `test_tos_broad_host_vt_and_travel_docs_heuristics_unchanged_by_pr_3c`.
  Verified score/verdict impact (live before/after `calculate_scores()`
  comparison, not golden snapshots): a bare single prohibited permission with
  full analyzer coverage moves `governance_score` 49→75 and `overall_score`
  77→85; the worst case (all three prohibited permissions) moves
  `governance_score` 23→75 and `overall_score` 63→80 — in every probed case the
  final `decision` stayed `NEEDS_REVIEW`, because the still-triggered
  `TOS_VIOLATION` WARN gate forces review via the warning-gates path in
  `decision.resolve()` independent of score. No verdict flip observed.

- **travel-docs / visa-portal heuristic — OUT OF SCOPE, already tracked.**
  The travel-docs automation signal is represented in three places (the
  `ToSViolations` factor heuristic, a `TOS_VIOLATION` gate backstop, and the
  `PROTECTED_SERVICE_AUTOMATION` rulepack). That triplication and its
  gate-comment retirement plan are tracked under **ADR 0001** and are **not**
  touched by PR-3b or PR-3c.

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
   - **PR-3b — DONE (docs/tests only, no version bump)** — factor-vs-gate audit
     for **purpose-mismatch** and **exfil**: both proven intentionally layered on
     disjoint evidence (soft aggregate factor vs. hard corroboration-gated gate,
     see §4), now locked by real guardrail tests in
     `tests/scoring/test_no_double_count.py`. `SENSITIVE_EXFIL` is documented and
     tested as structurally WARN-only. No scoring formula changed.
   - **PR-3c — DONE (scoring_version 2.1.3)** — ToS bare prohibited-permission
     counted once (`TOS_VIOLATION` gate owns it). Removed the `ToSViolations`
     severity contribution (`tos_severity += 0.5 * len(found_prohibited)`) for a
     bare `debugger`/`proxy`/`nativeMessaging` declaration; kept
     `prohibited_perm:{perm}` as evidence/context. `gates.py` is byte-unchanged —
     the `TOS_VIOLATION` gate's WARN (bare) / BLOCK (aggravated) behavior and
     penalties are identical. Compound ToS use (broad-host + VT malicious) and
     the travel-docs/visa-portal heuristic are unchanged. `DECISION_VERSION` not
     bumped (no precedence/rulepack change). Golden snapshots unchanged (read
     static fixture values). Live before/after scoring comparison showed no
     verdict flip (see §4).
3. **PR-4** — optional Security internal rebalance (`weights_version` bump).
4. **PR-5** — reputation-as-modifier + layer re-weight, gated on a labeled
   benign/malicious/review corpus (`weights_version` + `scoring_version`, golden
   regen, rollback documented).
