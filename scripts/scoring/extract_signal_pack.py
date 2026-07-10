"""Golden-fixture → SignalPack extraction utility for corpus labeling.

Converts existing ``tests/fixtures/*_results.json`` scan-OUTPUT payloads into
corpus-compatible ``inputs.signal_pack`` entries (the PR #274 schema), so real
scans can seed a labeled corpus. See ``docs/scoring/corpus_inventory.md``.

Design contract
---------------
* **Reuse production assembly, do not hand-roll.** The SignalPack is built by the
  same ``SignalPackBuilder`` the real pipeline uses
  (``extension_shield.governance.tool_adapters``), fed a reconstructed
  ``analysis_results`` dict. We do NOT re-implement the analyzer→sub-pack mapping,
  so the extracted pack matches what production would build. The only fixups are
  key names the adapters expect: identity for most sections, plus
  ``sast_results`` → ``javascript_analysis`` (what ``SastAdapter`` reads).
* **Fully offline.** ``build()`` is a pure dict→SignalPack transform — no scans,
  network, or DB. This module only reads local JSON and imports local code.
* **Never invents labels.** ``label`` defaults to ``"unknown"`` and
  ``expected_verdict`` to ``null`` unless a human passes one explicitly. The
  fixture's ``governance_verdict``/``overall_*`` are ENGINE OUTPUTS, never treated
  as ground truth (recorded only under a clearly-marked, non-authoritative field).
* **Best-effort reconstruction.** Re-scoring an extracted pack may NOT reproduce
  the fixture's stored score (fixtures may predate the current engine/normalizer;
  the persisted results view is not guaranteed identical to the raw
  ``analysis_results``). These entries are for LABELING, not score reproduction.
* **Tool-only PR.** This utility does not commit extracted real-extension corpus
  entries — output defaults to stdout; ``--output`` writes to a caller-specified
  path and refuses to write into the committed corpus dir. Committing labeled
  real-extension data is a separate, human-reviewed step.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import hmac
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from extension_shield.governance.signal_pack import SignalPack
from extension_shield.governance.tool_adapters import SignalPackBuilder
from scripts.scoring.compare_scoring_corpus import CorpusError, validate_entry

# Fixture analyzer-section keys that the adapters read from ``analysis_results``
# under the SAME name (identity mapping).
_IDENTITY_KEYS: Tuple[str, ...] = (
    "virustotal_analysis",
    "entropy_analysis",
    "webstore_analysis",
    "permissions_analysis",
    "chromestats_analysis",
    "network_analysis",
)
# Fixture key -> analysis_results key the adapter expects (non-identity fixups).
# SAST is persisted as ``sast_results`` but ``SastAdapter`` reads
# ``javascript_analysis`` (verified in tool_adapters.py:SastAdapter.adapt).
_REMAP: Dict[str, str] = {"sast_results": "javascript_analysis"}

# Engine OUTPUT fields that must NEVER be used as a human label. Recorded (some
# of them) only under entry["extraction"]["engine_outputs_not_ground_truth"].
_OUTPUT_ONLY_FIELDS: Tuple[str, ...] = (
    "governance_verdict",
    "governance_bundle",
    "governance_report",
    "overall_risk",
    "overall_security_score",
    "risk_distribution",
    "total_risk_score",
    "summary",
)


def reconstruct_analysis_results(
    fixture: Dict[str, Any],
) -> Tuple[Dict[str, Any], List[str]]:
    """Rebuild the ``analysis_results`` dict the adapters consume from a fixture.

    Returns (analysis_results, used_keys) where used_keys records what was mapped
    (for the extraction audit trail).
    """
    analysis_results: Dict[str, Any] = {}
    used: List[str] = []
    for key in _IDENTITY_KEYS:
        if fixture.get(key) is not None:
            analysis_results[key] = fixture[key]
            used.append(key)
    for src, dst in _REMAP.items():
        if fixture.get(src) is not None:
            analysis_results[dst] = fixture[src]
            used.append(f"{src}->{dst}")
    return analysis_results, used


def _coverage_warnings(fixture: Dict[str, Any], pack: SignalPack) -> List[str]:
    """Flag sections where the fixture HAD data but the built sub-pack is empty.

    A warning means the reconstruction likely lost data (a key mismatch) — the
    opposite of silent loss. Sections the fixture simply lacks are not warned.
    """
    warns: List[str] = []

    sast_findings = (fixture.get("sast_results") or {}).get("sast_findings") or {}
    had_sast = (
        any(bool(v) for v in sast_findings.values())
        if isinstance(sast_findings, dict)
        else bool(sast_findings)
    )
    if had_sast and not pack.sast.deduped_findings and not pack.sast.raw_findings:
        warns.append("sast: fixture had findings but built SAST pack is empty")

    if fixture.get("virustotal_analysis") and not pack.virustotal.enabled:
        warns.append("virustotal: fixture had data but built VT pack is disabled")

    if fixture.get("entropy_analysis") and pack.entropy.files_analyzed == 0:
        warns.append("entropy: fixture had data but files_analyzed=0")

    if fixture.get("permissions_analysis") and (
        pack.permissions.total_permissions == 0
        and not pack.permissions.api_permissions
        and not pack.permissions.host_permissions
    ):
        warns.append("permissions: fixture had data but built permissions pack is empty")

    return warns


def extract_entry(
    fixture: Dict[str, Any],
    *,
    source_path: str = "",
    expected_verdict: Optional[str] = None,
    anonymize: bool = False,
    salt: Optional[str] = None,
    redact_name: bool = False,
) -> Tuple[Dict[str, Any], List[str]]:
    """Build one corpus entry from a golden fixture. Returns (entry, warnings).

    Raises CorpusError if the fixture lacks an extension_id or the produced entry
    fails schema/SignalPack validation. When ``anonymize`` is set, the returned
    entry is fully anonymized (a non-empty ``salt`` is required).
    """
    ext_id = fixture.get("extension_id")
    if not ext_id or not isinstance(ext_id, str):
        raise CorpusError(f"fixture {source_path or '<unknown>'} has no usable extension_id")

    analysis_results, used_keys = reconstruct_analysis_results(fixture)
    pack = SignalPackBuilder().build(
        scan_id=ext_id,
        analysis_results=analysis_results,
        metadata=fixture.get("metadata") or {},
        manifest=fixture.get("manifest") or {},
        extension_id=ext_id,
    )
    warns = _coverage_warnings(fixture, pack)

    metadata = fixture.get("metadata") or {}
    user_count = metadata.get("user_count") or metadata.get("users")

    entry: Dict[str, Any] = {
        "id": f"golden-{ext_id}",
        "name": fixture.get("extension_name") or ext_id,
        "label": "unknown",  # never inferred from engine output
        "expected_verdict": expected_verdict,  # None unless a human passed one
        "confidence": None,
        "source_type": "real_scan",
        "rationale": (
            "Extracted from a committed golden scan-output fixture via the "
            "production SignalPackBuilder. Best-effort reconstruction for future "
            "human labeling; NOT evidence-backed and NOT a score-reproduction guarantee."
        ),
        "tags": ["extracted", "real_scan", "needs_labeling"],
        "known_signals": [],
        "notes": (
            "Auto-extracted; label='unknown' until a human reviews the evidence. "
            "engine outputs are recorded under 'extraction' but are NOT ground truth."
        ),
        "extraction": {
            "source_fixture": source_path,
            "reconstruction_used_keys": used_keys,
            "coverage_warnings": warns,
            "engine_outputs_not_ground_truth": {
                k: fixture[k] for k in ("governance_verdict",) if k in fixture
            },
        },
        "inputs": {
            "signal_pack": pack.model_dump(mode="json"),
            "manifest": fixture.get("manifest"),
            "user_count": user_count,
            "permissions_analysis": None,
        },
    }

    if anonymize:
        # anonymize_entry deep-copies, so ``entry`` stays the plain original for
        # the fail-closed safety guard (leak in a preserved field OR score drift).
        anon = anonymize_entry(entry, salt=salt or "", redact_name=redact_name)
        _assert_anon_safe(entry, anon, redact_name=redact_name)
        entry = anon

    # Validate the FINAL (possibly anonymized) entry against the #274 schema and
    # the SignalPack model before emitting.
    validate_entry(entry)
    SignalPack.model_validate(entry["inputs"]["signal_pack"])
    return entry, warns


def extract_entries(
    fixture_paths: List[str],
    *,
    expected_verdict: Optional[str] = None,
    anonymize: bool = False,
    salt: Optional[str] = None,
    redact_name: bool = False,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Extract entries for multiple fixture paths. Returns (entries, all_warnings)."""
    entries: List[Dict[str, Any]] = []
    all_warns: List[str] = []
    for i, path in enumerate(fixture_paths):
        fixture = json.loads(Path(path).read_text(encoding="utf-8"))
        try:
            entry, warns = extract_entry(
                fixture,
                source_path=path,
                expected_verdict=expected_verdict,
                anonymize=anonymize,
                salt=salt,
                redact_name=redact_name,
            )
        except AnonymizationNotSafe as exc:
            # Fail closed: skip this entry, record a PII-SAFE reason (positional
            # index + sanitized message only — never the path/id).
            all_warns.append(f"[entry {i}] not_usable: {exc}")
            continue
        entries.append(entry)
        all_warns.extend(f"[entry {i}] {w}" for w in warns)
    return entries, all_warns


# --- anonymization ----------------------------------------------------------
#
# Anonymization scrubs identifiers/PII across the ENTIRE entry (not just the
# header) via a TARGETED field allowlist plus a residual exact-token sweep. It
# deliberately PRESERVES scoring-relevant fields (host permissions, network
# domains, content_scripts matches, SAST findings) so the score/verdict are
# unchanged — proven by a neutrality test. Domains are NOT generalized here
# (deferred), so preserved host patterns may retain brand hints; that is the
# accepted trade-off for trivially-provable scoring neutrality. Hashing an
# already-public extension id is weak privacy; its value is breaking the direct
# name -> label association in a committed corpus.

# Scoring-relevant LEAF fields whose string values (host patterns / domains) may
# contain brand substrings that ARE scoring inputs; the residual token sweep must
# NOT touch these, so scoring neutrality holds. Everything else (developer
# metadata, chromestats/virustotal/entropy corners, evidence, notes) IS swept so
# brand names/ids/emails cannot hide there. manifest.name is handled separately by
# the targeted scrub (it is read by the capture-signals heuristic).
_SCORING_SUBTREE_KEYS = frozenset(
    {
        "host_permissions",
        "broad_host_patterns",
        "content_scripts",
        "domains",
    }
)
# Manifest metadata fields that carry identifiers/PII (scrubbed where present).
_MANIFEST_PII_KEYS = ("name", "description", "author", "homepage_url", "update_url")
_REDACTED = "[redacted]"

# Scored free-text keywords that must survive redaction so anonymization stays
# score-neutral. This is a best-effort YIELD optimization (fewer entries fail the
# neutrality self-check below); the enforceable guarantee is _assert_anon_safe,
# which fails closed on ANY residual score drift. Keep in sync with the scoring
# sources these mirror:
#   - abusive/malicious/covert: permission justification, normalizers.py:755
#     (normalize_permissions_baseline applies a x2.0 weight on a match)
#   - screenshot/capture/snap/screen grab/screen shot: manifest name/description,
#     normalizers.py:1008 (normalize_capture_signals: x0.3 disclosed / x1.5 covert)
#   - theme/color/font/wallpaper/new tab/offline: manifest name/description,
#     engine.py:678,690 (Consistency "benign_claim_risky_behavior" / "offline_
#     claim_network_access")
# name/description/justification can legitimately contain the extension or
# developer name, so they are swept for leak-freedom; preserving the scored
# keywords a removed token contained means scrubbing PII can never add or drop a
# multiplier.
_SCORED_FREETEXT_KEYWORDS = (
    "abusive",
    "malicious",
    "covert",
    "screenshot",
    "capture",
    "snap",
    "screen grab",
    "screen shot",
    "theme",
    "color",
    "font",
    "wallpaper",
    "new tab",
    "offline",
)


def _redaction_for(token: str) -> str:
    """Placeholder for a scrubbed PII token, preserving any scored free-text
    keyword the token contained (so free-text scoring signals are unchanged)."""
    lowered = token.lower()
    kept = [k for k in _SCORED_FREETEXT_KEYWORDS if k in lowered]
    return _REDACTED + ((" " + " ".join(kept)) if kept else "")


def _pseudonym(salt: str, real_id: str) -> str:
    """Deterministic, salted pseudonym for a real id. Stable per salt; different
    salt -> different pseudonym; never contains the original id."""
    digest = hmac.new(salt.encode("utf-8"), (real_id or "").encode("utf-8"), hashlib.sha256).hexdigest()
    return f"anon-{digest[:16]}"


def _collect_pii_tokens(entry: Dict[str, Any], *, redact_name: bool) -> List[str]:
    """Collect the exact real-PII strings to purge from free-text/metadata.

    Returns them longest-first so substring replacement is stable. Sourced from
    ``_pii_needle_map`` (which also handles structured/nested PII such as a
    ``manifest.author`` dict). A keyword-preserving redaction (``_redaction_for``)
    keeps any scored keyword a token contained, so replacing them is score-neutral.
    """
    tokens = set(_pii_needle_map(entry, redact_name=redact_name).values())
    return sorted((t for t in tokens if t), key=len, reverse=True)


def _scrub_tokens(obj: Any, tokens: List[str]) -> Any:
    """Recursively replace exact PII token substrings in string leaves.

    Scoring-VALUE fields (host patterns / domains) are skipped so they are never
    altered. Scored free-text (e.g. permission ``justification``) IS swept — it
    can name the extension/developer — but via a keyword-preserving redaction, so
    the permissions-baseline threat-keyword multiplier is unchanged. Result:
    scoring neutrality holds by construction, not only on the sample fixtures.
    """
    if isinstance(obj, dict):
        return {
            k: (v if k in _SCORING_SUBTREE_KEYS else _scrub_tokens(v, tokens))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_scrub_tokens(v, tokens) for v in obj]
    if isinstance(obj, str):
        s = obj
        for t in tokens:
            if t and t in s:
                s = s.replace(t, _redaction_for(t))
        return s
    return obj


class AnonymizationNotSafe(CorpusError):
    """Raised when an anonymized entry cannot be safely emitted — a PII needle
    survived in a preserved scoring field, or anonymization changed the score.
    The message is sanitized (field/category only, never the PII value)."""


def _pii_needle_map(entry: Dict[str, Any], *, redact_name: bool) -> Dict[str, str]:
    """Map of {category: real-PII-string} for token scrubbing and leak-guarding.

    Handles STRUCTURED PII (e.g. ``manifest.author`` as a dict ``{"email": …}``
    or a list), not only string fields, so nested emails/names/websites are
    caught. Values are the real strings; callers never print them.
    """
    out: Dict[str, str] = {}

    def put(cat: str, v: Any) -> None:
        if isinstance(v, str) and v:
            out[cat] = v

    def put_nested(prefix: str, obj: Any) -> None:
        if isinstance(obj, str):
            put(prefix, obj)
        elif isinstance(obj, dict):
            for k in ("email", "name", "website", "url", "homepage_url"):
                put(f"{prefix}.{k}", obj.get(k))
        elif isinstance(obj, list):
            for i, item in enumerate(obj):
                put_nested(f"{prefix}[{i}]", item)

    sp = (entry.get("inputs") or {}).get("signal_pack") or {}
    put("extension_id", sp.get("extension_id") or sp.get("scan_id"))
    ws = sp.get("webstore_stats") or {}
    for k in ("developer", "developer_email", "developer_website"):
        put(k, ws.get(k))
    prof = ws.get("developer_profile") or {}
    if isinstance(prof, dict):
        for k in ("name", "email", "website"):
            put(f"developer_profile.{k}", prof.get(k))
    mani = (entry.get("inputs") or {}).get("manifest") or {}
    put_nested("manifest.author", mani.get("author"))
    put("manifest.homepage_url", mani.get("homepage_url"))
    if redact_name:
        put("extension_name", entry.get("name"))
        put("manifest.name", mani.get("name"))
    return out


def _scrub_manifest_pii(value: Any) -> Any:
    """Keyword-preserving redaction that recurses into dict/list manifest values
    (so a structured ``author`` dict's nested email/name/website are scrubbed)."""
    if isinstance(value, str):
        return _redaction_for(value) if value else value
    if isinstance(value, dict):
        return {k: _scrub_manifest_pii(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub_manifest_pii(v) for v in value]
    return value


def _find_paths(obj: Any, needle: str, path: str = "$") -> List[str]:
    """JSON key-paths where ``needle`` occurs (for sanitized leak reporting)."""
    hits: List[str] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            hits += _find_paths(v, needle, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            hits += _find_paths(v, needle, f"{path}[{i}]")
    elif isinstance(obj, str) and needle and needle in obj:
        hits.append(path)
    return hits


def _assert_anon_safe(
    original_entry: Dict[str, Any],
    anon_entry: Dict[str, Any],
    *,
    redact_name: bool,
) -> None:
    """Fail closed if the anonymized entry is not safe to emit.

    (1) LEAK GUARD: no original PII needle may survive anywhere in the anonymized
        entry — the residual sweep already removed them from non-scoring fields,
        so a survivor is inside a PRESERVED scoring field (host pattern / domain /
        content_scripts match). Refuse rather than rewrite a scored value.
    (2) NEUTRALITY SELF-CHECK: score the original vs anonymized signal_pack (pure/
        offline) with each side's own manifest/user_count; refuse on any score or
        verdict drift. This enforces neutrality for Consistency and any other
        scored free-text without enumerating every normalizer's keywords.
    Both messages are sanitized — never the PII value.
    """
    # Check string VALUES only (via _find_paths), never a json.dumps() blob:
    # a blob escapes non-ASCII (ensure_ascii) so a non-ASCII PII value would be
    # MISSED, and it also matches dict keys / structural text (false refusals).
    # _find_paths compares raw Python strings at string leaves only.
    for cat, val in _pii_needle_map(original_entry, redact_name=redact_name).items():
        if not val:
            continue
        paths = _find_paths(anon_entry, val)
        if paths:
            raise AnonymizationNotSafe(
                f"PII ({cat}) survives in a preserved scoring field at "
                f"{sorted(set(paths))[:3]}; refusing to emit anonymized entry."
            )

    from extension_shield.scoring.engine import ScoringEngine  # offline, pure

    def _score(e: Dict[str, Any]):
        inp = e["inputs"]
        r = ScoringEngine(weights_version="v1").calculate_scores(
            SignalPack.model_validate(inp["signal_pack"]),
            manifest=inp.get("manifest"),
            user_count=inp.get("user_count"),
        )
        return (r.overall_score, r.decision.value)

    if _score(original_entry) != _score(anon_entry):
        raise AnonymizationNotSafe(
            "anonymization changed score/verdict (neutrality drift); refusing to emit."
        )


def anonymize_entry(
    entry: Dict[str, Any],
    *,
    salt: str,
    redact_name: bool = False,
) -> Dict[str, Any]:
    """Return a deep-copied, anonymized copy of a corpus entry.

    Scrubs the full entry (targeted fields + residual token sweep) while leaving
    scoring-relevant fields intact. Raises CorpusError if ``salt`` is empty.
    Does NOT itself fail closed — callers use ``_assert_anon_safe`` for that.
    """
    if not salt:
        raise CorpusError("anonymization requires a non-empty --anonymization-salt")
    entry = copy.deepcopy(entry)

    inputs = entry.get("inputs") or {}
    sp = inputs.get("signal_pack") or {}
    real_id = sp.get("extension_id") or sp.get("scan_id") or ""
    if not real_id and isinstance(entry.get("id"), str):
        real_id = entry["id"].split("golden-", 1)[-1]
    pseudo = _pseudonym(salt, real_id)

    tokens = _collect_pii_tokens(entry, redact_name=redact_name)

    # --- targeted scrub (explicit identifier/PII fields) ---
    entry["id"] = pseudo
    if isinstance(entry.get("extraction"), dict):
        entry["extraction"]["source_fixture"] = f"anonymized:{pseudo}"
    if isinstance(sp, dict):
        if "scan_id" in sp:
            sp["scan_id"] = pseudo
        if "extension_id" in sp:
            sp["extension_id"] = pseudo
        ws = sp.get("webstore_stats")
        if isinstance(ws, dict):
            for k in ("developer", "developer_email", "developer_website"):
                if k in ws:
                    ws[k] = ""  # empty (not None): some scoring paths call str ops
            if "developer_profile" in ws:
                ws["developer_profile"] = {}  # non-optional Dict field -> empty, not None
    mani = inputs.get("manifest")
    if isinstance(mani, dict):
        # manifest.name/description are scored free-text (capture-signals,
        # normalizers.py:1006-1019, and Consistency, engine.py:678,690). Redact via
        # the keyword-preserving, dict/list-aware _scrub_manifest_pii so the brand
        # is removed but scored keywords survive, and a STRUCTURED field (e.g.
        # author = {"email": …}) has its nested PII scrubbed too.
        for k in _MANIFEST_PII_KEYS:
            v = mani.get(k)
            if v is not None and v != "":
                mani[k] = _scrub_manifest_pii(v)
    if redact_name:
        entry["name"] = f"Real Extension {pseudo[len('anon-'):][:8]}"
    if isinstance(entry.get("tags"), list) and "anonymized" not in entry["tags"]:
        entry["tags"] = list(entry["tags"]) + ["anonymized"]

    # --- residual exact-token sweep over non-scoring subtrees (defense in depth) ---
    entry = _scrub_tokens(entry, tokens)
    return entry


_CORPUS_DIR_GUARD = "tests/fixtures/scoring_corpus"


def _is_within_corpus_dir(out: Path) -> bool:
    """True if ``out`` resolves inside the committed corpus dir.

    Uses the RESOLVED, absolute path so cwd-relative paths, ``..`` traversal, and
    symlinks cannot slip a write into ``tests/fixtures/scoring_corpus/`` (a plain
    substring check on the raw path is bypassable — e.g. ``--output out.json`` run
    from inside that directory).
    """
    resolved = out.resolve()
    try:
        repo_root = Path(__file__).resolve().parents[2]
        corpus_dir = (repo_root / _CORPUS_DIR_GUARD).resolve()
        if resolved == corpus_dir or resolved.is_relative_to(corpus_dir):
            return True
    except (IndexError, OSError, ValueError):
        pass
    # Fallback: substring on the normalized/absolute path (still catches the dir
    # even if the repo layout differs from the expected scripts/scoring/ anchor).
    return _CORPUS_DIR_GUARD in resolved.as_posix()


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Extract corpus signal_pack entries from golden scan-output fixtures "
            "(fully offline; reuses the production SignalPackBuilder). Defaults to "
            "stdout dry-run; does not commit real-extension corpus data."
        )
    )
    parser.add_argument("fixtures", nargs="+", help="Path(s) to *_results.json golden fixtures.")
    parser.add_argument(
        "--output",
        default=None,
        help=(
            "Write the corpus JSON array to this path. Default: stdout (dry-run). "
            f"Refuses to write into {_CORPUS_DIR_GUARD}/ (committing real-extension "
            "corpus is a separate, human-reviewed step)."
        ),
    )
    parser.add_argument(
        "--expected-verdict",
        default=None,
        choices=("ALLOW", "NEEDS_REVIEW", "BLOCK"),
        help="Optional human-provided expected_verdict for all entries (default: null).",
    )
    parser.add_argument(
        "--anonymize",
        action="store_true",
        help=(
            "Scrub identifiers/PII across the entire entry (ids, developer metadata, "
            "manifest name/author/homepage, source path). Requires --anonymization-salt. "
            "Preserves scoring-relevant fields (host permissions, etc.) so the score is "
            "unchanged; those may retain brand hints. Off by default."
        ),
    )
    parser.add_argument(
        "--anonymization-salt",
        default=None,
        help="Salt for deterministic pseudonymous ids. Required with --anonymize.",
    )
    parser.add_argument(
        "--redact-name",
        action="store_true",
        help="Also replace the extension name with a generic placeholder (with --anonymize).",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.anonymize and not args.anonymization_salt:
        raise SystemExit("--anonymize requires --anonymization-salt <value>.")
    entries, warns = extract_entries(
        args.fixtures,
        expected_verdict=args.expected_verdict,
        anonymize=args.anonymize,
        salt=args.anonymization_salt,
        redact_name=args.redact_name,
    )
    for w in warns:
        print(f"WARN {w}", file=sys.stderr)
    payload = json.dumps(entries, indent=2)
    if args.output:
        out = Path(args.output)
        if _is_within_corpus_dir(out):
            raise SystemExit(
                f"Refusing to write into {_CORPUS_DIR_GUARD}/ — committing extracted "
                "real-extension corpus entries is deferred to a human-reviewed labeling PR."
            )
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(payload, encoding="utf-8")
        print(f"Wrote {len(entries)} entrie(s) to {out}", file=sys.stderr)
    else:
        print(payload)
    print(f"extracted={len(entries)} warnings={len(warns)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
