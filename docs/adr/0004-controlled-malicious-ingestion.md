# ADR 0004: Controlled Malicious Ingestion — Scope Decision

- **Status:** Proposed (awaiting sign-off; not yet Accepted)
- **Date:** 2026-07-10
- **Area:** Corpus tooling (`scripts/scoring/`), existing analyzers (`src/extension_shield/core/analyzers/`, `governance/tool_adapters.py`), docs (`docs/scoring/`, `docs/adr/`)
- **Related:** [ADR 0003](0003-scoring-calibration-corpus.md) (corpus sourcing / labeling / anonymization / sign-off — status unchanged by this ADR), [`malicious_source_decision.md`](../scoring/malicious_source_decision.md) (#282 — malicious source-of-record + deferral), [ADR 0002](0002-scoring-layer-ownership.md) (weight changes gated on a labeled corpus)

## Context

The scoring calibration corpus needs a `malicious` class (MVP target **15**;
currently **0** real). Per [`malicious_source_decision.md`](../scoring/malicious_source_decision.md)
(#282), **no verified, licensed, scan-free source ships `inputs.signal_pack`-
compatible malicious analyzer signals.** The only verified malicious-label source
of record ([chrome-mal-ids](https://github.com/The-Privacy-Commons-Institute/chrome-mal-ids),
CC BY 4.0) ships **extension IDs + disclosure citations only — no signals and no
CRX**. Producing malicious calibration signals therefore requires *scanning the
artifacts behind those IDs*, which is out of scope under current policy.

This ADR decides **only** whether to authorize designing a controlled, offline,
one-time scan-ingestion that would run a constrained subset of the project's
**already-existing** static analyzers over externally-acquired malicious
artifacts. It is critical to frame this accurately:

- **This does not build a scanner.** The analyzer/adapter pipeline already exists
  in-repo (`src/extension_shield/core/analyzers/`, `governance/tool_adapters.py`).
- **The new risk surface is not analysis — it is malware acquisition, storage,
  and handling, plus unresolved legal/ToS questions.** Those, not the scoring
  code, are what this decision weighs.

### Why this gate must clear first

Weight work (PR-4/PR-5) is blocked on a labeled corpus with a real `malicious`
class. The local pool contributes **0** malicious (it is popular/benign-leaning),
and no scan-free source exists. So the malicious gap cannot close without *some*
scanning path — and that path must not be opened casually. This ADR exists to make
that a deliberate, gated decision rather than an incremental drift.

## Decision

**DEFER.** Do **not** authorize acquisition, storage, extraction, analysis, or
scanning of any malicious artifact at this time. Verified legal/ToS clearance
could not be established (see *Legal / ToS / ethics*), and per the project's
standing rule, **uncertain legal clearance means defer, not approve.**

This ADR records the *shape* of a future controlled pilot so the deferral is
actionable, but authorizes **none** of it. Lifting the deferral requires **both**
hard gates below to pass, in writing:

1. **Independent counsel / human legal sign-off** on the CWS/Google ToS and
   malware-handling questions (no analyst may substitute for this).
2. **Security review sign-off** on the malware-handling controls (Guardrails).

### Staged authorization (each action is separately gated)

Approval of any one step **never** implies the next. Even after the deferral is
lifted, each of these six actions requires its own explicit authorization:

1. **Reading / citing** a public malicious-ID dataset (this is already allowed for
   docs; commits **no** IDs).
2. **Downloading** an extension package (CRX/artifact) — *not authorized.*
3. **Retaining** it in quarantine — *not authorized.*
4. **Extracting / parsing** it — *not authorized.*
5. **Running allowlisted static analyzers** over the extracted files — *not
   authorized.*
6. **Committing only anonymized, derived signals** (never the artifact, never IDs)
   — *not authorized; gated on ADR 0003 §5 + §7.*

This ADR concerns only whether step-2-onward may ever be *designed*; it green-lights
none of them.

### Analyzer allowlist boundary (critical)

Any future approval may cover **only an explicit allowlist of analyzers
demonstrated — not assumed — to operate statically and fully offline.** Verified
against the current tree:

- **Known network-bound → excluded** (they contact external services by design):
  `virustotal` (VirusTotal API), `chromestats` (ChromeStats API), and the
  webstore / network adapters (Chrome Web Store retrieval, network-behavior
  signals). These stay out of scope until separately reviewed.
- **Candidate static analyzers → allowlist only after an offline-behavior
  demonstration:** `sast`, `entropy`, `permissions` operate over already-extracted
  files/manifest and show no network calls on inspection (the only URL-looking
  strings are an attribution comment and a host-normalization docstring example) —
  **but this must be *proven*, not assumed.** Before allowlisting, each must be run
  under network-deny with an asserted zero-egress result and confirmed to spawn no
  subprocess, browser, or native code. No analyzer is pre-approved by this ADR.

Any analyzer/adapter that can make network requests, launch a browser, execute
extension JavaScript, load native code, or perform unbounded archive extraction
remains **out of scope** until separately reviewed and approved.

## Options considered

- **APPROVE-WITH-STRICT-CONSTRAINTS** (unblock only a later pilot-design doc;
  authorize no acquisition/storage/extraction/analysis/scanning; keep legal +
  security as hard gates). *Rejected for now* — even this soft form frames the
  direction as approved, and the mandatory legal rule requires deferral while
  clearance is uncertain. The pilot design is recorded here regardless, so nothing
  is lost by deferring rather than soft-approving.
- **DEFER** (pending documented legal/ToS review **and** security review).
  **Chosen.** Legal clearance is unverified and at least one official clause is
  potentially adverse; the honest position is to defer.
- **REJECT** (never ingest malicious artifacts). *Not chosen* — this would
  permanently strand the `malicious` class and, with it, PR-4/PR-5, without first
  seeking the legal/security clearance that could make a safe pilot possible.
  Deferral keeps the door open under proper gates without authorizing anything.

## Consequences

- The `malicious` class stays at **0**; the shortfall stays **15**; **PR-4/PR-5
  remain BLOCKED.** This is the accepted cost of not opening a malware-handling /
  legally-uncertain path prematurely.
- The path to a `malicious` class is now explicit and gated, not ad hoc: it
  becomes a sequenced set of separately-authorized steps behind legal + security
  sign-off.
- **Real evidence-backed labeled count remains 0.** This ADR commits no data.
- **ADR 0003's status is unchanged.**

## Guardrails

### Legal / security are hard gates
No step 2–6 proceeds until **both** independent legal sign-off **and** security
review sign-off exist in writing. Analyst judgment cannot substitute for either.

### Malware-handling controls (required of any future pilot)
Even *static* analyzers face zip bombs, malformed archives, path traversal, and
parser bugs, so a pilot must require **all** of:

- **Network-deny isolation** (no egress; enforced, not best-effort).
- **Non-root execution** in a **disposable workspace**, destroyed after use.
- **Per-sample SHA-256 hashing + chain-of-custody** record.
- **CPU / memory / wall-clock limits** on every analyzer run.
- **Archive limits:** bounded file-count, bounded expanded size, bounded nesting
  depth; **reject symlinks and path-traversal** entries.
- **No browser rendering, no extension installation**, **no execution of any
  script/executable/native code from the acquired artifact** (static parse only).
- **Quarantine separated from the repo** (never under the working tree; never in
  `extensions_storage/` or any committed path).
- **Verified deletion** after an approved, documented retention period.
- **Sanitized logs** — no IDs, names, developer info, URLs, paths, or PII.

### Privacy (ADR 0003 §5)
Any derived entry is **fail-closed anonymized** before commit: full-entry scrub,
leak-freedom, and `score(anonymized) == score(original)` neutrality. No real ID,
name, developer, or URL may appear in a committed entry; unsafe entries are
**refused**, surfaced as `not_usable`, never emitted.

### Labeling (ADR 0003 §4)
`malicious` requires the **strongest external evidence**; **engine output is never
ground truth.** A label = the disclosure citation **plus** corroborating signal
values (e.g. VirusTotal detections, critical SAST / remote-code / credential-exfil
findings). **Two-review sign-off** (ADR 0003 §7) is required. The real count stays
0 until reviewed, anonymized entries are **deliberately** committed in a later
corpus-data PR.

### Feasibility — outcome states
Many malicious CWS extensions are removed/taken down, so CRX availability may be
low/inconsistent and scans may be partial. A pilot must classify every attempted
sample into exactly one state, and **only the first is committable**:

- `usable_signal_pack` — acquired, extracted, allowlisted-scanned, anonymizable.
- `unavailable` — artifact could not be lawfully/technically obtained.
- `scan_failed` — analyzer errored / timed out / hit a resource limit.
- `not_usable` — anonymization fail-closed (PII in a preserved field or score
  drift).
- `excluded` — out of allowlist/scope, or missing evidence.

## Non-goals

- Not building or modifying a scanner (the pipeline already exists).
- Not changing scoring weights/formulas/gates/decision/normalizers/rulepacks,
  schema/harness/version constants/golden scores, frontend/API payloads, or
  tests/fixtures.
- Not authorizing any download, retention, extraction, analysis, or scan.
- Not committing any corpus entry, `signal_pack` JSON, malicious ID/hash/name/URL,
  or per-extension list.
- Not changing ADR 0003's status.

## Legal / ToS / ethics

**This ADR asserts no legal conclusion.** It surfaces relevant official clauses and
open questions; resolving them is counsel's job, and their sign-off is a hard gate.

Relevant official policy (minimally quoted; publisher **Google**; *Google Chrome
Web Store Developer Agreement*, last updated **2021-05-04**, accessed **2026-07-10**,
<https://developer.chrome.com/docs/webstore/program-policies/terms>):

- On use/redistribution — the end-user grant is *"a non-exclusive, worldwide, and
  perpetual license to perform, display, and use the Products … in connection with
  Google Chrome."* (Analyst reading: a use license to end users in the Chrome
  context; it does not, on its face, speak to a third party retaining and
  statically analyzing others' extensions — an open question.)
- On access — *"You agree not to access (or attempt to access) the Web Store by any
  means other than through the interface that is provided by Google, unless you have
  been specifically allowed to do so in a separate agreement with Google."*
  (Analyst reading: potentially adverse to programmatic acquisition; whether it
  reaches CRX retrieval outside the Web Store UI, and whether this developer-facing
  agreement even binds a non-developer researcher, are open questions.)

See also the Chrome Web Store **Program Policies** index (publisher Google,
accessed 2026-07-10, <https://developer.chrome.com/docs/webstore/program-policies>).

### Open legal / ToS / ethics questions (for counsel)
1. Does any Google/CWS term permit or prohibit **downloading** a specific
   third-party extension package for security research (staged action 2)?
2. Does the Developer Agreement bind a **non-developer** acting as a researcher,
   or only publishers?
3. Is there a **security-research / fair-use** basis, and any jurisdictional
   variation, for **retaining** (3) and **statically analyzing** (4–5) a malicious
   sample?
4. Are there obligations toward the **chrome-mal-ids** CC BY 4.0 license
   (attribution) and toward any upstream disclosure sources?
5. What **retention period** and **deletion proof** are defensible?
6. Are there ethical/responsible-handling duties (e.g. not re-distributing live
   malware, not de-anonymizing victims)?

Each staged action (1→6) is a distinct legal question; clearing one does not clear
the next. **If clearance remains uncertain after review, the deferral stands.**

## Proposed pilot workflow (only if the deferral is later lifted under both gates)

Recorded for planning only — **authorizes nothing**:

1. Select a **small** pilot subset of IDs from the verified source
   (chrome-mal-ids 990 human-reviewed subset), preferring strongly-cited entries.
2. **Controlled acquisition** strictly within approved legal scope and the
   malware-handling controls above.
3. Run **only allowlisted static analyzers** (post-demonstration: candidates
   `sast` / `entropy` / `permissions`), offline, in the disposable quarantine.
4. Produce **candidate** `signal_pack`s; classify each into an outcome state.
5. **Anonymize + validate, fail-closed** (ADR 0003 §5).
6. **Human two-review** (ADR 0003 §7); label from disclosure citation +
   corroborating signals.
7. Commit **only** reviewed, anonymized entries — never the artifact, never IDs —
   in a later, separate corpus-data PR.

## Follow-up tasks

1. **Legal review** of the six staged actions and the open questions above →
   written sign-off or a documented no-go.
2. **Security review** of the malware-handling controls → written sign-off.
3. **Analyzer offline-behavior demonstration** for `sast` / `entropy` /
   `permissions` (network-deny zero-egress + no subprocess/browser) → the concrete
   allowlist.
4. Only if 1–3 pass: a separate **pilot-design ADR/doc** with retention period,
   quarantine design, and acceptance criteria — still authorizing no bulk work.
5. `malicious` corpus data remains a later, deliberately-committed step; **PR-4/PR-5
   stay blocked** until a real labeled corpus exists.

---

**Sources verified 2026-07-10:**
[chrome-mal-ids](https://github.com/The-Privacy-Commons-Institute/chrome-mal-ids)
— publisher The Privacy Commons Institute; **CC BY 4.0** (attribution required);
IDs + disclosure metadata only, **no CRX**.
[CWS Developer Agreement](https://developer.chrome.com/docs/webstore/program-policies/terms)
— publisher Google; last updated 2021-05-04.
[CWS Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
— publisher Google. No source was relied on unverified.
