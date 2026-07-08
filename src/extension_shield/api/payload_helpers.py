"""
Helper utilities that keep FastAPI endpoints lean by handling legacy payload upgrades,
report view model construction, and logging the shape of scan results.
"""

import re
import logging
from typing import Any, Dict, Optional

from extension_shield.core.report_view_model import (
    build_consumer_insights,
    build_report_view_model,
)
from extension_shield.governance.tool_adapters import SignalPackBuilder
from extension_shield.scoring.engine import ScoringEngine

logger = logging.getLogger(__name__)


def build_publisher_disclosures(
    metadata: Optional[Dict[str, Any]],
    governance_bundle: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build publisher_disclosures from CWS metadata for the extension card."""
    meta = metadata or {}
    store_listing = {}
    if governance_bundle and isinstance(governance_bundle.get("store_listing"), dict):
        store_listing = governance_bundle["store_listing"]

    trader = meta.get("trader_status")
    if trader in ("TRADER", "NON_TRADER"):
        trader_status = trader
    else:
        trader_status = "UNKNOWN"

    privacy_policy_url = store_listing.get("privacy_policy_url")
    if not privacy_policy_url and meta.get("privacy_policy"):
        text = meta["privacy_policy"]
        if isinstance(text, str):
            urls = re.findall(r"https?://[^\s<>\"']+", text)
            for u in urls:
                if "privacy" in u.lower() or "policy" in u.lower() or "legal" in u.lower():
                    privacy_policy_url = u.rstrip(".,)")
                    break
            if not privacy_policy_url and urls:
                privacy_policy_url = urls[0].rstrip(".,)")

    user_count = meta.get("user_count")
    if user_count is not None and not isinstance(user_count, int):
        try:
            user_count = int(user_count) if user_count is not None else None
        except (TypeError, ValueError):
            user_count = None

    rating_value = meta.get("rating")
    if rating_value is not None and not isinstance(rating_value, (int, float)):
        try:
            rating_value = float(rating_value) if rating_value is not None else None
        except (TypeError, ValueError):
            rating_value = None

    rating_count = meta.get("ratings_count") or meta.get("rating_count")
    if rating_count is not None and not isinstance(rating_count, int):
        try:
            rating_count = int(rating_count) if rating_count is not None else None
        except (TypeError, ValueError):
            rating_count = None

    return {
        "trader_status": trader_status,
        "developer_website_url": meta.get("developer_website") or None,
        "support_email": meta.get("developer_email") or None,
        "privacy_policy_url": privacy_policy_url or None,
        "user_count": user_count,
        "rating_value": float(rating_value) if rating_value is not None else None,
        "rating_count": rating_count,
        "last_updated_iso": meta.get("last_updated") or None,
    }


def governance_verdict_from_payload(payload: Optional[Dict[str, Any]]) -> Optional[str]:
    """Extract the authoritative governance verdict from a scan payload (D1).

    Prefers governance_bundle['decision']['final_verdict'] (the Decision
    Authority result that includes org-policy and baseline-governance rungs),
    falling back to a top-level governance_verdict. Returns None when absent.
    """
    if not isinstance(payload, dict):
        return None
    bundle = payload.get("governance_bundle")
    if isinstance(bundle, dict):
        decision = bundle.get("decision")
        if isinstance(decision, dict) and decision.get("final_verdict"):
            return decision.get("final_verdict")
    return payload.get("governance_verdict")


def build_report_view_model_safe(
    manifest: Dict[str, Any],
    analysis_results: Dict[str, Any],
    metadata: Optional[Dict[str, Any]],
    extension_id: str,
    scan_id: str,
    skip_llm: bool = False,
    governance_verdict: Optional[str] = None,
) -> Dict[str, Any]:
    """Safely build the report view model, returning an empty dict on failure."""
    try:
        return build_report_view_model(
            manifest=manifest,
            analysis_results=analysis_results,
            metadata=metadata,
            extension_id=extension_id,
            scan_id=scan_id,
            skip_llm=skip_llm,
            governance_verdict=governance_verdict,
        )
    except Exception as exc:
        logger.warning("Failed to build report_view_model, using empty dict: %s", exc)
        return {}


def refresh_governance_decision(payload: Optional[Dict[str, Any]]) -> bool:
    """Refresh a stale governance final_verdict in-place from the persisted bundle.

    The governance decision (governance_bundle.decision) is stamped with a
    decision_version. When that stamp is missing or differs from the current
    DECISION_VERSION, the stored verdict predates a decision-logic change and is
    recomputed deterministically from the bundle's own inputs (no re-download).
    Mirrors the scoring_version self-heal for scoring_v2. Returns True if the
    stored final_verdict changed.
    """
    if not isinstance(payload, dict):
        return False
    gb = payload.get("governance_bundle")
    if not isinstance(gb, dict):
        return False
    decision = gb.get("decision")
    if not isinstance(decision, dict):
        return False

    from extension_shield.governance.decision_refresh import (
        DECISION_VERSION,
        recompute_final_decision,
    )

    if decision.get("decision_version") == DECISION_VERSION:
        return False  # already current — no recompute

    # Conservative insufficient-data input: the scoring engine's own flag if
    # available, OR the previously-stored decision flag (so a prior review
    # downgrade is never silently lost).
    top_sv2 = payload.get("scoring_v2") or {}
    insufficient = bool(top_sv2.get("insufficient_data", False)) or bool(
        decision.get("insufficient_data", False)
    )

    refreshed = recompute_final_decision(gb, insufficient_data=insufficient)
    if not refreshed:
        return False

    prev = decision.get("final_verdict")
    decision.update(refreshed)
    changed = refreshed["final_verdict"] != prev
    if changed:
        logger.info(
            "[UPGRADE] refreshed stale governance final_verdict %s -> %s "
            "(decision_version -> %s) for extension_id=%s",
            prev,
            refreshed["final_verdict"],
            refreshed["decision_version"],
            payload.get("extension_id"),
        )
    return changed


def upgrade_legacy_payload(payload: Optional[Dict[str, Any]], extension_id: str) -> Dict[str, Any]:
    """Upgrade legacy payloads to include scoring_v2 and report_view_model."""
    if payload is None:
        logger.warning(
            "[UPGRADE] upgrade_legacy_payload called with None payload for extension_id=%s",
            extension_id,
        )
        return {}

    # Self-heal a stale governance final_verdict before any scoring fast-path
    # returns, so the authoritative verdict reflects current decision logic even
    # when scoring_v2 is already current (the two are versioned independently).
    refresh_governance_decision(payload)
    has_scoring_v2_before = bool(
        payload.get("scoring_v2")
        or (payload.get("governance_bundle") or {}).get("scoring_v2")
    )
    has_report_view_model_before = bool(payload.get("report_view_model"))
    report_view_model_before = payload.get("report_view_model")
    has_consumer_insights_before = bool(
        isinstance(report_view_model_before, dict)
        and report_view_model_before.get("consumer_insights")
    )
    upgraded = False

    # ------------------------------------------------------------------
    # Single authoritative source. The governance node computes the canonical
    # scoring_v2 from the full signal pack (VirusTotal / SAST coverage included)
    # and stores it under governance_bundle.scoring_v2 (the "single source of
    # truth"). A GET-time recompute rebuilds from the top-level analysis fields,
    # which are frequently empty on hydrated rows (the real analyzer output lives
    # under summary/governance_bundle) — silently degrading a good 80 into a
    # false "insufficient data / 65" and making /api/recent and
    # /api/scan/results disagree. If a current-version governance-bundle scoring
    # exists but the top-level copy is stale/degraded, adopt the governance copy
    # as the top-level scoring_v2 and skip the recompute.
    gb_scoring = (payload.get("governance_bundle") or {}).get("scoring_v2") or {}
    top_scoring = payload.get("scoring_v2") or {}
    gb_is_current = (
        isinstance(gb_scoring, dict)
        and gb_scoring.get("overall_score") is not None
        and bool(gb_scoring.get("decision"))
        and gb_scoring.get("scoring_version") == ScoringEngine.VERSION
    )
    top_is_current = (
        isinstance(top_scoring, dict)
        and top_scoring.get("scoring_version") == ScoringEngine.VERSION
    )
    if gb_is_current and not top_is_current:
        adopted = dict(gb_scoring)
        # The governance-bundle copy omits a few top-level-only fields; carry
        # them over so the UI keeps decision-authority / insufficient-data.
        for _k in ("decision_authority", "insufficient_data", "insufficient_data_reason"):
            if adopted.get(_k) is None and top_scoring.get(_k) is not None:
                adopted[_k] = top_scoring.get(_k)
        payload["scoring_v2"] = adopted
        has_scoring_v2_before = True
        logger.info(
            "[UPGRADE] extension_id=%s adopted governance_bundle.scoring_v2 as authoritative (overall=%s, no degrading recompute)",
            extension_id,
            adopted.get("overall_score"),
        )

    force_recompute = False
    try:
        existing_scoring = (
            payload.get("scoring_v2")
            or (payload.get("governance_bundle") or {}).get("scoring_v2")
            or {}
        )
        existing_version = (existing_scoring or {}).get("scoring_version")
        if isinstance(existing_version, str) and existing_version and existing_version != ScoringEngine.VERSION:
            force_recompute = True
    except Exception:
        force_recompute = False

    # Fast path: skip expensive recompute (SignalPack + ScoringEngine) when we already
    # have scoring_v2 and report_view_model. consumer_insights can be added by
    # ensure_consumer_insights() which is lightweight. Requiring consumer_insights here
    # caused 10-20s delays for scans that had scoring_v2/report_view_model but lacked it.
    if (
        has_scoring_v2_before
        and has_report_view_model_before
        and not force_recompute
    ):
        payload["publisher_disclosures"] = build_publisher_disclosures(
            payload.get("metadata"), payload.get("governance_bundle")
        )
        logger.info(
            "[UPGRADE] extension_id=%s, results_payload_upgraded=false (fast path), has_scoring_v2=%s, has_report_view_model=%s",
            extension_id,
            has_scoring_v2_before,
            has_report_view_model_before,
        )
        return payload

    import time as _time
    _upgrade_start = _time.monotonic()
    _UPGRADE_BUDGET_SECONDS = 5  # max wall-clock time for on-the-fly upgrade

    logger.info(
        "[UPGRADE] Upgrading legacy payload for extension_id=%s (has_scoring_v2=%s, has_report_view_model=%s)",
        extension_id,
        has_scoring_v2_before,
        has_report_view_model_before,
    )

    try:
        manifest = payload.get("manifest") or {}
        metadata = payload.get("metadata") or {}
        _summary = payload.get("summary") or {}

        # Source analyzer output with a summary fallback: on hydrated rows the
        # top-level virustotal_analysis / sast_results are frequently empty while
        # the real output is nested under summary. Reading only the top level made
        # the recompute lose VirusTotal coverage and report false "insufficient
        # data". Never drop present analyzer coverage during recompute.
        def _analyzer(field: str) -> Dict[str, Any]:
            top = payload.get(field)
            if top:
                return top
            nested = _summary.get(field) if isinstance(_summary, dict) else None
            return nested or {}

        analysis_results = {
            "permissions_analysis": _analyzer("permissions_analysis"),
            "javascript_analysis": _analyzer("sast_results"),
            "webstore_analysis": _analyzer("webstore_analysis"),
            "virustotal_analysis": _analyzer("virustotal_analysis"),
            "entropy_analysis": _analyzer("entropy_analysis"),
            "impact_analysis": _analyzer("impact_analysis"),
            "privacy_compliance": _analyzer("privacy_compliance"),
            "executive_summary": _summary,
        }

        signal_pack_builder = SignalPackBuilder()
        signal_pack = signal_pack_builder.build(
            scan_id=extension_id,
            analysis_results=analysis_results,
            metadata=metadata,
            manifest=manifest,
            extension_id=extension_id,
        )

        if (not has_scoring_v2_before) or force_recompute:
            user_count = (
                metadata.get("user_count")
                or metadata.get("users")
                or signal_pack.webstore_stats.installs
            )
            scoring_engine = ScoringEngine(weights_version="v1")
            scoring_result = scoring_engine.calculate_scores(
                signal_pack=signal_pack,
                manifest=manifest,
                user_count=user_count if isinstance(user_count, int) else None,
                permissions_analysis=analysis_results.get("permissions_analysis"),
            )

            scoring_v2_payload = scoring_result.model_dump_for_api()
            scoring_v2_payload["weights_version"] = "v1"
            gate_results = scoring_engine.get_gate_results() or []
            scoring_v2_payload["gate_results"] = [
                {
                    "gate_id": g.gate_id,
                    "decision": g.decision,
                    "triggered": g.triggered,
                    "confidence": g.confidence,
                    "reasons": g.reasons,
                }
                for g in gate_results
            ]

            payload["scoring_v2"] = scoring_v2_payload
            logger.info(
                "[UPGRADE] Built scoring_v2 for extension_id=%s (force=%s)",
                extension_id,
                force_recompute,
            )
            upgraded = True

        if (not has_report_view_model_before) or force_recompute:
            _elapsed = _time.monotonic() - _upgrade_start
            if _elapsed > _UPGRADE_BUDGET_SECONDS:
                logger.warning(
                    "[UPGRADE] Skipping report_view_model build — budget exhausted (%.1fs > %ds) for extension_id=%s",
                    _elapsed, _UPGRADE_BUDGET_SECONDS, extension_id,
                )
            else:
                report_view_model = build_report_view_model(
                    manifest=manifest,
                    analysis_results=analysis_results,
                    metadata=metadata,
                    extension_id=extension_id,
                    scan_id=extension_id,
                    skip_llm=True,
                    governance_verdict=governance_verdict_from_payload(payload),
                )
                payload["report_view_model"] = report_view_model
                logger.info(
                    "[UPGRADE] Built report_view_model for extension_id=%s (force=%s, skip_llm=True, %.1fs)",
                    extension_id, force_recompute, _time.monotonic() - _upgrade_start,
                )
                upgraded = True

        ensure_consumer_insights(payload)

        final_has_scoring_v2 = bool(payload.get("scoring_v2"))
        final_has_report_view_model = bool(payload.get("report_view_model"))
        final_report_view_model = payload.get("report_view_model")
        final_has_consumer_insights = bool(
            isinstance(final_report_view_model, dict)
            and final_report_view_model.get("consumer_insights")
        )
        payload["publisher_disclosures"] = build_publisher_disclosures(
            payload.get("metadata"), payload.get("governance_bundle")
        )
        logger.info(
            "[UPGRADE] extension_id=%s, results_payload_upgraded=%s, has_scoring_v2=%s→%s, has_report_view_model=%s→%s, has_consumer_insights=%s→%s",
            extension_id,
            upgraded,
            has_scoring_v2_before,
            final_has_scoring_v2,
            has_report_view_model_before,
            final_has_report_view_model,
            has_consumer_insights_before,
            final_has_consumer_insights,
        )
        return payload

    except Exception as exc:
        logger.error(
            "[UPGRADE] Failed to upgrade legacy payload for extension_id=%s: %s",
            extension_id,
            exc,
        )
        try:
            ensure_consumer_insights(payload)
        except Exception:
            pass
        payload["publisher_disclosures"] = build_publisher_disclosures(
            payload.get("metadata"), payload.get("governance_bundle")
        )
        final_has_scoring_v2 = bool(
            payload.get("scoring_v2")
            or (payload.get("governance_bundle") or {}).get("scoring_v2")
        )
        final_has_report_view_model = bool(payload.get("report_view_model"))
        final_report_view_model = payload.get("report_view_model")
        final_has_consumer_insights = bool(
            isinstance(final_report_view_model, dict)
            and final_report_view_model.get("consumer_insights")
        )
        logger.info(
            "[UPGRADE] extension_id=%s, results_payload_upgraded=false (error), has_scoring_v2=%s→%s, has_report_view_model=%s→%s, has_consumer_insights=%s→%s",
            extension_id,
            has_scoring_v2_before,
            final_has_scoring_v2,
            has_report_view_model_before,
            final_has_report_view_model,
            has_consumer_insights_before,
            final_has_consumer_insights,
        )
        return payload


def ensure_consumer_insights(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Add consumer_insights to report_view_model when missing."""
    if not isinstance(payload.get("report_view_model"), dict):
        payload["report_view_model"] = {}

    rvm = payload["report_view_model"]
    if rvm.get("consumer_insights") is not None:
        logger.info("consumer_insights_attached=true (already present)")
        return payload

    scoring_v2 = payload.get("scoring_v2")
    if not scoring_v2:
        governance_bundle = payload.get("governance_bundle", {})
        if isinstance(governance_bundle, dict):
            scoring_v2 = governance_bundle.get("scoring_v2")

    capability_flags = None
    if isinstance(rvm.get("evidence"), dict):
        capability_flags = rvm["evidence"].get("capability_flags")
    if not capability_flags:
        capability_flags = payload.get("capability_flags")

    host_access_summary = None
    if isinstance(rvm.get("evidence"), dict):
        host_access_summary = rvm["evidence"].get("host_access_summary")
    if not host_access_summary:
        host_access_summary = payload.get("host_access_summary")

    permissions_analysis = payload.get("permissions_analysis")
    if not permissions_analysis and isinstance(rvm.get("evidence"), dict):
        permissions_analysis = rvm["evidence"].get("permissions_summary")

    webstore_metadata = payload.get("metadata")
    if not webstore_metadata and isinstance(rvm.get("evidence"), dict):
        webstore_metadata = rvm["evidence"].get("webstore_metadata")

    network_evidence = payload.get("network_evidence")
    if not network_evidence and isinstance(rvm.get("evidence"), dict):
        network_evidence = rvm["evidence"].get("network_evidence")

    external_domains = payload.get("external_domains")
    if not external_domains and isinstance(rvm.get("evidence"), dict):
        external_domains = rvm["evidence"].get("external_domains")

    try:
        consumer_insights = build_consumer_insights(
            scoring_v2=scoring_v2,
            capability_flags=capability_flags,
            host_access_summary=host_access_summary,
            permissions_analysis=permissions_analysis or {},
            webstore_metadata=webstore_metadata or {},
            network_evidence=network_evidence,
            external_domains=external_domains,
        )
        rvm["consumer_insights"] = consumer_insights
        logger.info("consumer_insights_attached=true (computed)")
    except Exception as exc:
        logger.warning("Failed to compute consumer_insights: %s", exc)
        logger.info("consumer_insights_attached=false")

    if rvm.get("consumer_summary") is None:
        try:
            from extension_shield.core.report_view_model import build_consumer_summary

            rvm["consumer_summary"] = build_consumer_summary(
                report_view_model=rvm,
                scoring_v2=scoring_v2,
            )
            logger.info("consumer_summary_attached=true (computed)")
        except Exception as exc:
            logger.warning("Failed to compute consumer_summary: %s", exc)

    return payload


def _is_i18n_placeholder(text: Any) -> bool:
    """True if text is an unresolved Chrome i18n placeholder (e.g. __MSG_appDesc__)."""
    if not isinstance(text, str):
        return False
    return bool(re.match(r"^__MSG_[A-Za-z0-9@_]+__$", text.strip()))


def _is_extension_id(text: Any) -> bool:
    """True if text looks like a Chrome extension ID (32 lowercase a-p)."""
    if not isinstance(text, str):
        return False
    s = text.strip()
    return len(s) == 32 and all(c in "abcdefghijklmnop" for c in s.lower())


def ensure_description_in_meta(payload: Dict[str, Any]) -> None:
    """Populate meta.description from manifest/metadata when missing (legacy Supabase fix)."""
    rvm = payload.get("report_view_model")
    if not isinstance(rvm, dict):
        return
    meta = rvm.get("meta")
    if not isinstance(meta, dict):
        rvm["meta"] = meta = {}
    if meta.get("description") and not _is_i18n_placeholder(meta.get("description")):
        return  # Already has valid description
    manifest = payload.get("manifest") or {}
    metadata = payload.get("metadata") or {}
    for raw in (manifest.get("description"), metadata.get("description")):
        if raw and isinstance(raw, str) and raw.strip() and not _is_i18n_placeholder(raw):
            meta["description"] = raw.strip()
            return
    # Don't set empty string - let frontend fall through to summary/one_liner


def ensure_name_in_payload(payload: Dict[str, Any]) -> None:
    """Resolve extension_name from metadata/manifest when missing."""
    metadata = payload.get("metadata") or {}
    manifest = payload.get("manifest") or {}
    chrome_stats = metadata.get("chrome_stats") if isinstance(metadata, dict) else {}
    if not isinstance(chrome_stats, dict):
        chrome_stats = {}

    candidates = [
        payload.get("extension_name"),
        metadata.get("title") if isinstance(metadata, dict) else None,
        metadata.get("name") if isinstance(metadata, dict) else None,
        chrome_stats.get("name"),
        manifest.get("name") if isinstance(manifest, dict) else None,
    ]
    resolved = next(
        (n for n in candidates if n and isinstance(n, str) and n.strip()
         and n.strip() != "Unknown" and not _is_i18n_placeholder(n) and not _is_extension_id(n)),
        None,
    )
    if resolved:
        resolved = resolved.strip()
        if not payload.get("extension_name") or payload["extension_name"] == payload.get("extension_id"):
            payload["extension_name"] = resolved
        rvm = payload.get("report_view_model")
        if isinstance(rvm, dict):
            meta = rvm.get("meta")
            if isinstance(meta, dict):
                if not meta.get("name") or meta["name"] == "Unknown Extension":
                    meta["name"] = resolved


def log_scan_results_return_shape(path: str, payload: Dict[str, Any]) -> None:
    """Log payload shape for traceability."""
    if not isinstance(payload, dict):
        logger.info(
            "[DEBUG get_scan_results return_shape] path=%s payload_type=%s (non-dict)",
            path,
            type(payload).__name__,
        )
        return

    payload_keys = sorted(list(payload.keys()))
    report_view_model = payload.get("report_view_model")
    has_report_view_model = "report_view_model" in payload
    has_consumer_insights = bool(
        isinstance(report_view_model, dict) and report_view_model.get("consumer_insights") is not None
    )
    has_scoring_v2 = "scoring_v2" in payload

    rvm_type = type(report_view_model).__name__ if report_view_model is not None else None
    rvm_keys = sorted(list(report_view_model.keys())) if isinstance(report_view_model, dict) else None

    logger.info(
        "[DEBUG get_scan_results return_shape] path=%s keys=%s has_report_view_model=%s "
        "has_consumer_insights=%s has_scoring_v2=%s report_view_model_type=%s report_view_model_keys=%s",
        path,
        payload_keys,
        has_report_view_model,
        has_consumer_insights,
        has_scoring_v2,
        rvm_type,
        rvm_keys,
    )
