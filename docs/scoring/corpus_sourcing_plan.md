# Calibration corpus — first source selection & acquisition plan

Decision record executing [ADR 0003](../adr/0003-scoring-calibration-corpus.md)
"Next steps" **step 2** (choose the first real corpus source). This is a
**docs-only decision**; it adds no data, no code, and no corpus entries. The real
evidence-backed labeled count remains **0** (see
[`corpus_inventory.md`](corpus_inventory.md), the source of truth).

## Method

Candidate sources are the six categories in ADR 0003 §2, scored on ADR 0003's
criteria: license/provenance, format-convertibility to `inputs.signal_pack`,
PII/anonymization burden, labeling-evidence strength, and whether the source
requires scanning or CRX handling (both **out of scope** for corpus work — no
scans, no CRX fetch). External sources below were checked by web fetch; anything
not verifiable is marked **unverified** and does not drive the decision.

## Source evaluation

| Source | License / provenance (verified) | Convertible to `inputs.signal_pack`? | Scanning/CRX needed? | Labeling evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Public academic — "Did I Vet You Before?"** ([zenodo.org/records/10977708](https://zenodo.org/records/10977708)) | **CC-BY-4.0** (verified); authors listed anonymous; dated 2025-02-23 | **No** — ships `ground-truth`/`infringing`/`embeddings` Parquet (metadata + pipeline vector embeddings), not analyzer signals | Would need their pipeline or re-scan | "vetted by Google / infringing by pipeline" (pairs) | **Rejected** — good license, wrong format (embeddings, not signals) |
| **Public — `refade/GoogleChromeExtension`** ([github.com/refade/GoogleChromeExtension](https://github.com/refade/GoogleChromeExtension)) | **No license stated** (verified) | No — CRX + behavioral sandbox features (their format) | Yes (CRX + dynamic analysis) | benign/malware folders | **Rejected** — no license (no usage/redistribution rights); CRX-derived |
| **Public study — "A Study on Malicious Browser Extensions in 2025"** ([arxiv.org/abs/2503.04292](https://arxiv.org/abs/2503.04292)) | **No downloadable artifact / no license** (verified) | N/A — nothing released | Would need scanning | 341 malicious from public disclosures (in-paper only) | **Rejected** — no released, licensed artifact |
| **Local pool `extensions_storage/`** (repo-local, git-ignored — verified `git check-ignore`) | Local scans; no redistribution license; CRX-derived | **Yes now** — contains **30 `*_results.json`** in the exact scan-output shape the #275 extractor consumes (no scanning needed) | No (already scanned locally) | **Weak** — folder names (AdGuard, Grammarly, …) are **not** evidence per ADR 0003 §4; carries real ids/PII (like the golden fixtures: `developer_email`, `scan_id`) | **Conditional** — usable only after anonymization (§5) + independent signal-based labeling |
| **Golden fixtures** (`tests/fixtures/*_results.json`) | In-repo already | Yes (via #275) | No | Weak; 5 popular, low-finding, real-named | **Conditional** — same anonymization/labeling gates; likely-benign only |
| **Synthetic** (`synthetic_labeled_seed.json`) | In-repo | Yes | No | N/A — constructed | **Not real** — does not count toward the target (already merged as scaffolding) |
| **Public takedown/advisory lists** | Advisories are citeable, but signals are not published | No — only ids/disclosures | **Yes** (must scan CRX for signals) | Strong for `malicious` label, but no signals | **Deferred** — needs scanning brought in-scope |
| **User-submitted reports** | n/a | n/a | n/a | n/a | **Out of scope** — needs consent policy |

**Note on unverified counts:** web-search snippets reported conflicting sample
counts (e.g. "22 benign / 990 malware" vs "22 malicious / 990 benign") for the
same GitHub repo. These are **unverified** and are not used; the repo is rejected
on license grounds regardless.

## Decision

**No public dataset clears the bar** for a directly committable first batch under
the corpus constraints (licensed **and** convertible to `inputs.signal_pack`
**and** no scanning/CRX). The verified candidates are either wrongly-formatted
(embeddings), unlicensed, or release no artifact.

The **only source convertible today with existing tooling and no scanning** is the
local `extensions_storage/` pool (30 `*_results.json`, extractor-ready). It is
therefore selected as the **primary near-term source — conditionally**, gated on:

1. **Anonymization support (ADR 0003 §5)** — these results carry real ids and PII
   (the same surface found in the golden fixtures: `signal_pack.scan_id`/
   `extension_id`, `webstore_stats.developer_email`, `manifest.*`, brand host
   patterns). **Anonymization code is REQUIRED before any entry is committed.**
2. **Independent, signal-based labeling** — labels must come from the extracted
   signals per ADR 0003 §4, **never** from the folder/extension name. On these
   inputs that realistically yields `benign` / `needs_review` / `low_confidence`
   entries, **not** `malicious`.

**The `malicious` class remains unsolved by any in-scope source.** No verified,
licensed, scan-free, signal-convertible source of malicious examples exists. The
honest path to malicious ground truth is to scan CRX from a verified public
disclosure list — which requires **bringing CRX scanning into scope**, a separate
decision outside corpus tooling. Until then, PR-4 cannot reach a balanced corpus.

## First-batch acquisition & labeling plan

Toward the MVP mix in [`corpus_inventory.md`](corpus_inventory.md) (not restated
here as a fixed number):

1. Convert a small set of local `*_results.json` via the #275 extractor →
   `inputs.signal_pack`.
2. **Anonymize** each entry per ADR 0003 §5 (full-entry scrub incl. in-pack PII),
   with a leakage test and a score-equivalence check — requires new code (below).
3. **Label from signals only** (ADR 0003 §4): default `unknown`; `benign` only
   when evidence-gated; `needs_review`/`low_confidence` per concrete
   signal/coverage evidence. Record the cited signal values per entry.
4. This batch seeds the `benign`/`needs_review`/`low_confidence` classes only.
5. Run the before/after harness (identity mode) to confirm entries load and score.
6. `malicious` examples are acquired separately, only after a CRX-scanning
   ingestion decision is made and approved.

## Is anonymization code now required?

**Yes.** The selected near-term source (local pool) contains real ids and PII, so
ADR 0003 §5 anonymization support is a hard prerequisite for committing any real
entry.

## Next implementation step

**Add anonymization support to the extractor** (ADR 0003 §5): a scrub-all-
identifiers mode with (a) a full-entry leakage test asserting no real id/email/
name/URL survives, and (b) a `score(anonymized) == score(original)` invariant.
Separately, open a decision on whether CRX scanning of a verified public
disclosure list is brought in-scope to source the `malicious` class.

## Status

- Real evidence-backed labeled count: **0** (unchanged).
- **PR-4 (v1.1 weights): BLOCKED.** **PR-5 (v2 reputation modifier): BLOCKED.**
  Selecting a source adds no data; the `malicious` gap remains.

Sources verified: [Zenodo 10977708](https://zenodo.org/records/10977708) (CC-BY-4.0),
[refade/GoogleChromeExtension](https://github.com/refade/GoogleChromeExtension)
(no license), [arXiv 2503.04292](https://arxiv.org/abs/2503.04292) (no artifact).
