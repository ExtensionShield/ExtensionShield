# Malicious calibration-class source — decision

Decision record executing the **deferred malicious-class decision** left open by
[`corpus_sourcing_plan.md`](corpus_sourcing_plan.md) ("The `malicious` class
remains unsolved by any in-scope source"), under
[ADR 0003](../adr/0003-scoring-calibration-corpus.md). This is a **docs-only
decision**: it adds no data, no code, no corpus entries, and triggers no scans.
The real evidence-backed labeled count remains **0** (see
[`corpus_inventory.md`](corpus_inventory.md), the source of truth).

## Question

The `malicious` class (MVP target 15, currently **0**) cannot come from the local
pool — it is popular/benign-leaning with 0 evidence-backed malicious cases. This
record decides **where a real, evidence-gated `malicious` class should come from**,
and answers one gating question: **can malicious `inputs.signal_pack` signals be
obtained without scanning CRX?**

## Method

Candidates are scored on ADR 0003's criteria: license/provenance,
convertibility to `inputs.signal_pack` (analyzer signals, not just ids/metadata),
PII/anonymization burden, labeling-evidence strength (ADR 0003 §4 —
`malicious` needs the **strongest** external evidence; engine output is never
ground truth), and whether the source requires **scanning or CRX handling**
(out of scope for corpus work). Every external source below was checked by an
actual web fetch on the date noted; anything not verified is marked **unverified**
and does not drive the decision. No CRX was fetched and no scan was run.

## Source evaluation (verified 2026-07-10)

| Source | License / provenance (verified) | Convertible to `inputs.signal_pack`? | Scanning / CRX needed? | Labeling evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| **chrome-mal-ids** — The Privacy Commons Institute ([github.com/The-Privacy-Commons-Institute/chrome-mal-ids](https://github.com/The-Privacy-Commons-Institute/chrome-mal-ids)) | **CC BY 4.0** (verified). 2,708 malicious IOCs / 44 campaigns; **990 human-reviewed with citations** + 1,796 third-party imports (weaker) | **No** — ships extension **ids + threat type + citations only**; no permissions/SAST/VT/entropy/manifest signals | **Yes** — signals exist only by scanning the CRX behind each id | **Strong for the label** (esp. the 990 human-reviewed, cited subset); third-party-import subset is weaker per §4 | **Selected as the label / disclosure source-of-record — but yields NO signals; signals require scanning (path a below)** |
| **MalExt Sentry** ([malext.io](https://malext.io/), feeds toborrm9/malicious_extension_sentry) | **License unverified** | No — ids + threat category + source + date only | Yes | Disclosure-grade; feeds chrome-mal-ids | **Not a signal source** (ids-only); license unverified → not relied on |
| **"Did I Vet You Before?"** — Zenodo ([zenodo.org/records/10977708](https://zenodo.org/records/10977708)) | **CC BY 4.0** (verified); anonymous authors; 2025-02-23 | **No** — Parquet **metadata + 1.1 GB vector embeddings**, not analyzer signals | No (but wrong format) | Label is *infringement by similarity*, not malicious behavior | **Rejected** — wrong format (embeddings); label ≠ malicious behavior |
| **"A Study on Malicious Browser Extensions in 2025"** — arXiv ([arxiv.org/abs/2503.04292](https://arxiv.org/abs/2503.04292)) | **No released, licensed artifact** (verified); PoC/lab-focused; 2025-03-06 | N/A — nothing usable released | Would need scanning | In-paper only | **Rejected** — no released licensed dataset |
| **palant/chrome-extension-manifests-dataset** — Codeberg ([codeberg.org/palant/chrome-extension-manifests-dataset](https://codeberg.org/palant/chrome-extension-manifests-dataset)) | **License not specified** (verified → no redistribution rights) | **Partial only** — `manifest.json` permissions/host_permissions for ~120k ext; **no** SAST/VT/entropy | No | **Unlabeled** (not malicious-specific) | **Rejected** — no license; unlabeled; partial features only |
| **refade/GoogleChromeExtension** (per [`corpus_sourcing_plan.md`](corpus_sourcing_plan.md)) | **No license stated** | No — CRX + sandbox features (their format) | Yes | benign/malware folders | **Rejected** — no license; CRX-derived |
| **Local pool `extensions_storage/`** | Local scans; git-ignored | Yes (already scanned) | No | **0 evidence-backed malicious** | **Cannot supply** the malicious class |
| **Synthetic malicious** (`synthetic_labeled_seed.json`) | In-repo | Yes | No | Constructed | **Does not count** — scaffolding, not real |

**Unverified / not relied on:** MalExt Sentry's license; `mandatoryprogrammer/chrome-extension-manifests-dataset` (manifests-only, license unchecked — redundant with Palant's category and rejected on the same grounds). Neither drives this decision.

## Central question: can malicious signals be obtained scan-free?

**No.** No verified, licensed source ships `inputs.signal_pack`-convertible
analyzer signals (SAST / VirusTotal / entropy / permissions in the scan-output
shape) for malicious extensions. The verified malicious-label sources
(chrome-mal-ids, MalExt Sentry) ship **ids + disclosures only**; the licensed
academic dataset (Zenodo) ships **embeddings**, not signals; the manifest
datasets ship **partial features** but are unlicensed and unlabeled.

Therefore malicious sourcing requires **one of**:

- **(a) A scanning-enabled ingestion brought into scope** — scan the CRX behind
  ids from a verified disclosure list (the chrome-mal-ids 990-entry human-reviewed
  subset) to produce real `signal_pack`s. This brings **CRX fetch + scanning**
  into scope, which is currently **out of scope** for corpus tooling. It is a
  **distinct, separately-scoped decision — not decided here.**
- **(b) A verified, licensed dataset shipping scan-mappable malicious signals** —
  **none verified to exist** as of this record.

## Decision

**Defer committing any malicious corpus data.** Because path (b) has no verified
source and path (a) requires a scanning-in-scope decision this record must not
make, no malicious entry can be produced in scope today.

**Record of source-of-truth for when path (a) is approved:** select
**chrome-mal-ids (CC BY 4.0), 990 human-reviewed subset with citations** as the
malicious **label / disclosure source-of-record**. It provides ADR 0003 §4
"strongest evidence" (independent research + citations) for the *label*; it does
**not** provide signals. This is a source *of record*, not a commitment of data.

This is an honest deferral with a concrete named path — not a fabricated source.
No source that is simultaneously **licensed + signal-convertible + scan-free** was
found; saying so is the correct outcome, not a gap to paper over.

## First-batch acquisition & labeling plan (conditional on path (a) approval)

Executable **only after** a separate decision brings CRX scanning into scope; not
authorized by this record.

1. Draw a small id set from the **chrome-mal-ids 990 human-reviewed subset**,
   preferring entries with strong cited evidence (VT detections, credential-exfil
   / remote-code disclosures).
2. Under the (separately approved) scanning ingestion, produce each id's real
   `inputs.signal_pack` via the production pipeline.
3. **Label from the strongest external evidence per ADR 0003 §4** — the disclosure
   citation **plus** corroborating signal values (e.g. `virustotal.malicious_count`,
   `sast.counts_by_severity.CRITICAL`, credential-exfil network flags). Engine
   `governance_verdict`/`overall_*` are **never** the label; any label↔engine
   divergence is calibration evidence.
4. **Anonymize per ADR 0003 §5 before any commit** — full-entry scrub +
   leak-freedom + `score(anonymized) == score(original)`; fail-closed on any
   residual PII or score drift.
5. Two-review sign-off (ADR 0003 §7) before the entry counts.

Only reviewed, evidence-backed, anonymized entries deliberately committed move the
real count off 0.

## MVP impact & status

- **Malicious target 15, current real 0.** This decision commits **no** entries;
  the shortfall stays **15**.
- **Real evidence-backed labeled count remains 0** overall (source of truth:
  [`corpus_inventory.md`](corpus_inventory.md)).
- **PR-4 (v1.1 weights): BLOCKED. PR-5 (v2 reputation modifier): BLOCKED.**
  Selecting a source-of-record adds no data; the malicious gap persists and the
  scanning-in-scope prerequisite is undecided.
- **ADR 0003 status is unchanged** by this record.

## Status

**Decided (source-of-record + deferral).** Next: a separate decision on whether
CRX scanning of the verified chrome-mal-ids disclosure subset is brought into
scope. Until then the malicious class stays at 0 by design.

Sources verified 2026-07-10:
[chrome-mal-ids](https://github.com/The-Privacy-Commons-Institute/chrome-mal-ids)
(CC BY 4.0, ids/disclosures only),
[Zenodo 10977708](https://zenodo.org/records/10977708) (CC BY 4.0, embeddings),
[arXiv 2503.04292](https://arxiv.org/abs/2503.04292) (no artifact),
[palant manifests](https://codeberg.org/palant/chrome-extension-manifests-dataset)
(no license, unlabeled), [MalExt Sentry](https://malext.io/) (license unverified).
