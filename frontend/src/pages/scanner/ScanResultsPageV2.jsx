import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "../../components/ui/button";
import {
  DonutScore,
  EvidenceDrawer,
  LayerModal,
  ResultFeedback,
  EvidenceTechnicalDetails,
  SimilarExtensions,
} from "../../components/report";
import {
  Shield,
  Lock,
  Landmark,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import {
  resolveVerdictDisplay,
  resolveIssueOverview,
  findingSeverityLevel,
  severityLabel,
  severityBadge,
  severityTone,
  findingCategory,
  preciseFindingTitle,
  resolveFindingEvidenceLabel,
} from "../../utils/reportDisplay";
import FileViewerModal from "../../components/FileViewerModal";
import StatusMessage from "../../components/StatusMessage";
import SEOHead from "../../components/SEOHead";
import ScanActivityIndicator from "../../components/ScanActivityIndicator";
import { useScan } from "../../context/ScanContext";
import realScanService from "../../services/realScanService";
import AdminRescanButton from "../../components/report/AdminRescanButton";
import { normalizeScanResultSafe, validateEvidenceIntegrity, gateIdToLayer, extractFindingsByLayer } from "../../utils/normalizeScanResult";
import { getExtensionIconUrl, EXTENSION_ICON_PLACEHOLDER } from "../../utils/constants";
import { isUUID } from "../../utils/extensionId";
import { doesScanResultMatchIdentifier } from "../../utils/scanResultIdentity";
import { REPORT_QUICK_NAV_ITEMS } from "./ScanResultsPageV2.constants";
import "./ScanResultsPageV2.scss";

/** True if text is an unresolved Chrome i18n placeholder (e.g. __MSG_appDesc__). */
function isI18nPlaceholder(text) {
  return typeof text === "string" && /^__MSG_[A-Za-z0-9@_]+__$/.test(text.trim());
}

/** True if text is raw JSON chaff that should never be shown (e.g. "[]", "{}", "null"). */
function isRawJsonChaff(text) {
  if (typeof text !== "string") return false;
  const t = text.trim();
  return t === "[]" || t === "{}" || t === "null" || t === "undefined" || t === "false" || t === "true";
}

/** True if the string looks like a URL — catches pasted full result URLs used as scan IDs. */
function looksLikeUrl(str) {
  return typeof str === "string" && /^https?:\/\//i.test(str.trim());
}

/** Short overview: first 250 chars at word boundary, truncate the rest. No LLM, no cost. */
function shortOverview(text) {
  if (!text || typeof text !== "string") return "";
  if (isI18nPlaceholder(text)) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  const maxLen = 250;
  if (trimmed.length <= maxLen) return trimmed;
  const cut = trimmed.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  const end = lastSpace > maxLen * 0.6 ? lastSpace : maxLen;
  return cut.slice(0, end).trim() + "…";
}

/** Get displayable description: hide __MSG_* placeholders, prefer resolved manifest text. */
function getDisplayDescription(scanResults) {
  // Try multiple sources for description, in order of preference:
  // 1. metadata.description (Chrome Web Store scraped)
  // 2. manifest.description (from manifest.json, may be i18n placeholder)
  // 3. report_view_model.meta.description (injected by backend for legacy Supabase rows)
  // 4. summary.summary (LLM executive summary)
  // 5. report_view_model.scorecard.one_liner (LLM one-liner as last resort)
  // 6. summary.one_liner
  const candidates = [
    scanResults?.metadata?.description,
    scanResults?.manifest?.description,
    scanResults?.report_view_model?.meta?.description,
    scanResults?.summary?.summary,
    scanResults?.report_view_model?.scorecard?.one_liner,
    scanResults?.summary?.one_liner,
  ];
  
  for (const raw of candidates) {
    if (
      raw &&
      typeof raw === "string" &&
      !isI18nPlaceholder(raw) &&
      !isRawJsonChaff(raw) &&
      raw.trim()
    ) {
      return raw;
    }
  }
  return null;
}

export const LayerCards = ({ layerCards, onOpenLayer }) => (
  <section className="report-layers" id="layers" aria-label="Security, privacy, and governance breakdown">
    {layerCards.map(({ key, label, Icon, score, band, count, explain }) => (
      <button
        type="button"
        key={key}
        className={`layer-card band-${String(band).toLowerCase()}`}
        onClick={() => onOpenLayer(key)}
        aria-label={`${label} details: ${count > 0 ? `${count} ${count === 1 ? "issue" : "issues"}` : "no issues"}`}
      >
        <div className="layer-card-head">
          <span className="layer-card-name"><Icon size={16} aria-hidden="true" /> {label}</span>
          <span className="layer-card-score">
            {score ?? "—"}<span className="layer-card-score-max">/100</span>
          </span>
        </div>
        {count > 0 ? (
          <span className="layer-card-issues">{count} {count === 1 ? "issue" : "issues"}</span>
        ) : (
          <span className="layer-card-issues layer-card-issues--none">No issues</span>
        )}
        <div className="layer-card-bar" aria-hidden="true">
          <span className="layer-card-bar-fill" style={{ width: `${Math.max(0, Math.min(100, score ?? 0))}%` }} />
        </div>
        <p className="layer-card-explain">{explain}</p>
        <span className="layer-card-link">View details <ChevronRight size={14} aria-hidden="true" /></span>
      </button>
    ))}
  </section>
);

/**
 * ScanResultsPageV2 - Redesigned results dashboard
 * Uses ReportViewModel from normalizeScanResultSafe() - NO fake data
 */
const ScanResultsPageV2 = () => {
  const { scanId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    scanResults,
    error,
    setError,
    loadResultsById,
    currentExtensionId,
  } = useScan();

  const hasCachedResultsForThisScan = doesScanResultMatchIdentifier(
    scanResults,
    scanId,
    currentExtensionId
  );

  const [isLoading, setIsLoading] = useState(false);
  const [rawData, setRawData] = useState(null);
  const [viewModel, setViewModel] = useState(null);
  const [normalizationError, setNormalizationError] = useState(null);
  const [showHeroIcon, setShowHeroIcon] = useState(true);
  const [fileViewerModal, setFileViewerModal] = useState({
    isOpen: false,
    file: null,
  });
  
  // Evidence drawer state
  const [evidenceDrawer, setEvidenceDrawer] = useState({
    open: false,
    evidenceIds: [],
  });

  // Layer modal state
  const [layerModal, setLayerModal] = useState({
    open: false,
    layer: null, // 'security' | 'privacy' | 'governance'
  });

  // Track which scanId we've loaded to prevent double loading
  const loadedScanIdRef = useRef(null);
  const isLoadingRef = useRef(false);

  // Responsive donut size for small screens
  const [donutSize, setDonutSize] = useState(300);
  const [publisherDetailsOpen, setPublisherDetailsOpen] = useState(false);
  // Sidebar cards are open on desktop and collapsed by default on mobile (≤768px).
  const [issueOverviewOpen, setIssueOverviewOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 768
  );
  const [quickNavOpen, setQuickNavOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 768
  );
  const [expandedFinding, setExpandedFinding] = useState(null);
  const publisherDetailsRef = useRef(null);

  useEffect(() => {
    if (!publisherDetailsOpen) return;
    const onKey = (e) => { if (e.key === "Escape") setPublisherDetailsOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [publisherDetailsOpen]);

  useEffect(() => {
    const updateSize = () => setDonutSize(window.innerWidth <= 480 ? 220 : window.innerWidth <= 768 ? 260 : 300);
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  // Clear stale local state when scanId changes. If we already have this scan's
  // results in context (e.g. just completed scan), use them immediately so we don't show loading.
  useEffect(() => {
    if (loadedScanIdRef.current !== scanId) {
      if (hasCachedResultsForThisScan) {
        loadedScanIdRef.current = scanId;
        setRawData(scanResults);
        const vm = normalizeScanResultSafe(scanResults);
        setViewModel(vm);
        setNormalizationError(vm ? null : "Failed to normalize scan result data");
        return;
      }
      loadedScanIdRef.current = null;
      isLoadingRef.current = false;
      setViewModel(null);
      setRawData(null);
      setNormalizationError(null);
      setShowHeroIcon(true);
    }
  }, [scanId, hasCachedResultsForThisScan, scanResults]);

  // Load results - use context when already available (e.g. after completing scan), else fetch.
  // Only re-run when scanId changes; loadResultsById is now stable (no deps) and
  // hasCachedResultsForThisScan is checked inside the effect but must NOT be a dependency
  // because it changes when scanResults arrives, which would re-trigger fetching.
  useEffect(() => {
    let cancelled = false;

    const loadResults = async () => {
      // Bail out early for obviously invalid scan IDs (e.g., a full URL was pasted)
      if (!scanId || looksLikeUrl(scanId)) {
        return;
      }
      if (isLoadingRef.current || loadedScanIdRef.current === scanId) {
        return;
      }
      // Already have this scan's results in context (e.g. just finished scan, then "View results")
      if (hasCachedResultsForThisScan) {
        loadedScanIdRef.current = scanId;
        return;
      }

      isLoadingRef.current = true;
      setIsLoading(true);

      try {
        await loadResultsById(scanId);
        if (!cancelled) {
          loadedScanIdRef.current = scanId;
        }
      } finally {
        if (!cancelled) {
          isLoadingRef.current = false;
          setIsLoading(false);
        }
      }
    };

    loadResults();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanId]);

  // Normalize scan results when they change
  useEffect(() => {
    if (scanResults) {
      setRawData(scanResults);
      const vm = normalizeScanResultSafe(scanResults);
      setViewModel(vm);
      
      if (!vm) {
        setNormalizationError("Failed to normalize scan result data");
      } else {
        setNormalizationError(null);
        validateEvidenceIntegrity(vm);
      }
    }
  }, [scanResults]);


  const getFileContent = async (extensionId, filePath) => {
    return await realScanService.getFileContent(extensionId, filePath);
  };

  const openEvidenceDrawer = (evidenceIds) => {
    if (evidenceIds && evidenceIds.length > 0) {
      setEvidenceDrawer({ open: true, evidenceIds });
    }
  };

  const closeEvidenceDrawer = () => {
    setEvidenceDrawer({ open: false, evidenceIds: [] });
  };

  const openLayerModal = (layer) => {
    setLayerModal({ open: true, layer });
  };

  const closeLayerModal = () => {
    setLayerModal({ open: false, layer: null });
  };

  const extensionIdForIcon = viewModel?.meta?.extensionId || scanId;
  const heroIconUrl = extensionIdForIcon ? getExtensionIconUrl(extensionIdForIcon) : null;

  const isPrivateScan = scanId && isUUID(scanId);

  // Reset icon visibility when viewing a different extension
  useEffect(() => {
    setShowHeroIcon(true);
  }, [extensionIdForIcon]);

  const genericNoindexHead = (
    <SEOHead
      title="Scan results"
      description="Extension scan results."
      pathname={location.pathname}
      noindex
    />
  );

  // Guard: scanId is a URL (e.g. user pasted full results URL). Show friendly error.
  if (scanId && looksLikeUrl(scanId)) {
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <nav className="results-v2-nav">
            <Link to="/scan" className="nav-back">← Back</Link>
          </nav>
          <div className="results-v2-empty">
            <div className="empty-icon">🔗</div>
            <h2>That doesn't look like an extension ID</h2>
            <p>
              It looks like you followed a full URL instead of an extension ID. Try pasting the Chrome Web Store URL into the scanner to start a new scan.
            </p>
            <div className="empty-actions">
              <Button onClick={() => navigate("/scan")}>Go to Scanner</Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Loading state - smooth shield animation
  if (isLoading || isLoadingRef.current) {
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <div className="results-v2-loading">
            <ScanActivityIndicator
              title="Scan in progress"
              messages={[
                "Security report loading in progress",
                "Evidence hydration in progress",
                "Dashboard preparation in progress",
              ]}
              meta="Preparing your results view"
            />
          </div>
        </div>
      </>
    );
  }

  // No results (404 or not scanned yet)
  if (!scanResults && !isLoading && !isLoadingRef.current) {
    const isUploadScan = scanId && isUUID(scanId);
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <nav className="results-v2-nav">
          <Link to="/scan" className="nav-back">← Back</Link>
        </nav>
        <div className="results-v2-empty">
          <div className="empty-icon">📋</div>
          <h2>Scan results not found</h2>
          <p>
            {isUploadScan
              ? "If you just uploaded a ZIP/CRX, the scan may still be running. Check progress below or try again in a moment."
              : "This extension hasn't been scanned yet or the scan is still in progress."}
          </p>
          {error && (
            <div className="empty-error" style={{ marginTop: '1rem', color: 'var(--risk-bad)' }}>
              {error}
            </div>
          )}
          <div className="empty-actions">
            {isUploadScan && (
              <Button onClick={() => navigate(`/scan/progress/${scanId}`)} variant="default">
                Check scan progress
              </Button>
            )}
            <Button onClick={() => navigate("/scan")} variant={isUploadScan ? "outline" : "default"} style={isUploadScan ? { marginLeft: '0.5rem' } : undefined}>
              Start Scan
            </Button>
            {!isUploadScan && scanId && (
              <Button onClick={() => navigate(`/scan/progress/${scanId}`)} variant="outline" style={{ marginLeft: '0.5rem' }}>
                Check Progress
              </Button>
            )}
          </div>
        </div>
      </div>
      </>
    );
  }

  // Normalization failed - show error state
  if (!viewModel && normalizationError) {
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <nav className="results-v2-nav">
            <Link to="/scan" className="nav-back">← Back</Link>
          </nav>
          <div className="results-v2-error">
            <div className="error-icon">⚠️</div>
            <h2>Report Data Unavailable</h2>
            <p>{normalizationError}</p>
          <div className="error-extension-id">
            <span>Extension ID:</span>
            <code>{scanId}</code>
          </div>
          {import.meta.env.DEV && rawData && (
            <details className="error-raw-data">
              <summary>Raw Data (Dev Only)</summary>
              <pre>{JSON.stringify(rawData, null, 2)}</pre>
            </details>
          )}
          <div className="error-actions">
            <Button onClick={() => navigate("/scan")}>Back to Scanner</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
        </div>
      </div>
      </>
    );
  }

  // Extract data from viewModel - provide safe defaults
  const { meta, scores, factorsByLayer, keyFindings, evidenceIndex } = viewModel || {
    meta: {},
    scores: {},
    factorsByLayer: {},
    keyFindings: [],
    evidenceIndex: {}
  };

  // Extract all findings by layer from raw scan results (includes SAST, factors, gates, etc.)
  const findingsByLayer = extractFindingsByLayer(scanResults);
  
  // Combine keyFindings with extracted findings, deduplicating by title
  const allSecurityFindings = [
    ...(keyFindings?.filter(f => f.layer === 'security') || []),
    ...findingsByLayer.security,
  ];
  const allPrivacyFindings = [
    ...(keyFindings?.filter(f => f.layer === 'privacy') || []),
    ...findingsByLayer.privacy,
  ];
  const allGovernanceFindings = [
    ...(keyFindings?.filter(f => f.layer === 'governance') || []),
    ...findingsByLayer.governance,
  ];

  // Deduplicate findings by title
  const dedupeFindings = (findings) => {
    const seen = new Set();
    return findings.filter(f => {
      const key = f.title?.toLowerCase() || '';
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // Chrome Web Store URL: use meta.storeUrl if available, else build from extension ID
  const extensionIdForStore = viewModel?.meta?.extensionId || scanId;
  const chromeStoreUrl =
    viewModel?.meta?.storeUrl ||
    (extensionIdForStore
      ? `https://chromewebstore.google.com/detail/_/${extensionIdForStore}`
      : null);


  // Brief transition: scanResults loaded but viewModel not yet set
  if (!viewModel && scanResults && !normalizationError) {
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <div className="results-v2-loading">
            <ScanActivityIndicator
              title="Scan in progress"
              messages={[
                "Report formatting in progress",
                "Evidence rendering in progress",
                "Results preparation in progress",
              ]}
              meta="Preparing your results view"
            />
          </div>
        </div>
      </>
    );
  }

  // Normalization failed - show error state
  if (!viewModel && scanResults && normalizationError) {
    return (
      <>
        {genericNoindexHead}
        <div className="results-v2">
          <nav className="results-v2-nav">
            <Link to="/scan" className="nav-back">← Back</Link>
          </nav>
          <div className="results-v2-error">
            <div className="error-icon">⚠️</div>
            <h2>Unable to Display Results</h2>
            <p>The scan data is available but couldn't be formatted for display.</p>
            <div className="error-actions">
              <Button onClick={() => navigate("/scan")}>Back to Scanner</Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                Retry
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  const overallBand = scores?.overall?.band || scores?.security?.band || 'NA';
  const overallScore = scores?.overall?.score ?? scores?.security?.score ?? 0;

  const extensionName = meta?.name || null;
  const extensionSchema =
    !isPrivateScan &&
    extensionName &&
    typeof overallScore === "number"
      ? {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: extensionName,
          applicationCategory: "BrowserExtension",
          operatingSystem: "Chrome",
          ...(scanResults?.manifest?.version && { softwareVersion: scanResults.manifest.version }),
        }
      : null;

  const resultsSEOHead = isPrivateScan ? (
    genericNoindexHead
  ) : (
    <SEOHead
      title={
        extensionName
          ? `${extensionName} — Risk Score ${overallScore} Security Report | ExtensionShield`
          : "Scan results"
      }
      description={
        extensionName
          ? `Risk score, permissions, network indicators, and Security/Privacy/Governance findings for ${extensionName}.`
          : "Extension scan results."
      }
      pathname={location.pathname}
      schema={extensionSchema ? [extensionSchema] : undefined}
    />
  );

  // --- Redesign display model (verdict-first, evidence-backed) -------------
  // The verdict (ALLOW / NEEDS_REVIEW / BLOCK) is the single source of truth for
  // the hero badge, headline, and body. Never "Safe" once review/block.
  const verdict = resolveVerdictDisplay(scores?.decision);

  // Only count evidence the EvidenceDrawer can actually open — i.e. IDs present in
  // the evidence index. IDs that cannot be resolved are never counted or shown.
  const resolveEvidence = (ids) =>
    (Array.isArray(ids) ? ids : []).filter((id) => id && evidenceIndex && evidenceIndex[id]);

  // Key findings: dedup across layers, apply calm/precise wording, resolve evidence,
  // then sort by severity.
  const keyFindingsList = [
    ...dedupeFindings(allSecurityFindings),
    ...dedupeFindings(allPrivacyFindings),
    ...dedupeFindings(allGovernanceFindings),
  ]
    .filter((f) => f && f.title)
    .map((f) => {
      const resolvableEvidenceIds = resolveEvidence(f.evidenceIds);
      return {
        ...f,
        level: findingSeverityLevel(f),
        displayTitle: preciseFindingTitle(f.title),
        category: findingCategory(f),
        resolvableEvidenceIds,
        evidenceCount: resolvableEvidenceIds.length,
      };
    })
    .sort((a, b) => {
      const order = { high: 3, medium: 2, low: 1, info: 0 };
      return (order[b.level] || 0) - (order[a.level] || 0);
    });
  const topFindings = keyFindingsList.slice(0, 5);
  const issueOverview = resolveIssueOverview(keyFindingsList);

  // One consistent issue-count source: the same deduped findings rendered on the
  // page. Layer-card counts and the Issue Overview both derive from keyFindingsList,
  // so per-layer counts always sum to the overview total.
  const layerFindingCount = (key) => keyFindingsList.filter((f) => f.layer === key).length;

  // Per-layer short explanation: backend layer one-liner if present, else a calm
  // band-based fallback (never fabricated prose).
  const layerDetails = scanResults?.report_view_model?.layer_details || {};
  const bandExplain = (band) =>
    band === "GOOD" ? "No significant issues in this area."
    : band === "WARN" ? "Some patterns in this area need review."
    : band === "BAD" ? "High-severity issues found in this area."
    : "Limited data for this area.";
  const layerCards = [
    { key: "security", label: "Security", Icon: Shield, score: scores?.security?.score, band: scores?.security?.band || "NA", count: layerFindingCount("security"), explain: layerDetails?.security?.one_liner || bandExplain(scores?.security?.band) },
    { key: "privacy", label: "Privacy", Icon: Lock, score: scores?.privacy?.score, band: scores?.privacy?.band || "NA", count: layerFindingCount("privacy"), explain: layerDetails?.privacy?.one_liner || bandExplain(scores?.privacy?.band) },
    { key: "governance", label: "Governance", Icon: Landmark, score: scores?.governance?.score, band: scores?.governance?.band || "NA", count: layerFindingCount("governance"), explain: layerDetails?.governance?.one_liner || bandExplain(scores?.governance?.band) },
  ];
  // Similar extensions are OPTIONAL context and never influence the verdict.
  // Only rendered if the payload actually carries them.
  const similarItems = Array.isArray(scanResults?.similar_extensions)
    ? scanResults.similar_extensions
    : Array.isArray(scanResults?.metadata?.similar_extensions)
    ? scanResults.metadata.similar_extensions
    : [];

  const quickNavItems = REPORT_QUICK_NAV_ITEMS;

  const formatScanDate = (ts) =>
    ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return (
    <>
      {resultsSEOHead}
      <div className="results-v2 results-v2-dashboard">
      {/* Navigation Bar - Match screenshot: New scan, Share, Save */}
      <nav className="results-v2-nav">
        <Link to="/scan" className="nav-back">
          ← Back
        </Link>
        <AdminRescanButton url={isPrivateScan ? null : chromeStoreUrl} scanId={scanId} />
      </nav>

      {/* Status Messages */}
      {error && (
        <StatusMessage type="error" message={error} onDismiss={() => setError("")} />
      )}

      {/* Partial Report Banner - when scan failed but partial data (scoring_v2, report_view_model) is available */}
      {scanResults?.status === "failed" && scanResults?.scoring_v2 && (() => {
        const err = scanResults.error || "Some analysis steps failed";
        const isDownloadFail = typeof err === "string" && err.includes("download") && (err.includes("failed") || err.includes("sources failed") || err.includes("returned no file"));
        const bannerMessage = isDownloadFail
          ? "Partial report: We couldn't download the extension package. Scores and limited findings below are based on available data (e.g. store listing)."
          : `Partial report: ${err}. Scores and limited findings below are based on available data (e.g. manifest, webstore).`;
        return (
          <StatusMessage type="info" message={bannerMessage} />
        );
      })()}

      {/* Breadcrumb */}
      <nav className="report-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link to="/scan">Scan Results</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span className="report-breadcrumb-current">{meta?.name || "Report"}</span>
      </nav>

      <main className="report-v2">
        <div className="report-grid">
          {/* HERO — verdict-first: the verdict is the single source of truth */}
          <section
            className={`report-hero verdict-${verdict.tone}${publisherDetailsOpen ? " extension-card--popover-open" : ""}`}
            id="overview"
          >
            <ResultFeedback scanId={scanId} />
            <div className="report-hero-inner">
              <div className="report-hero-info">
                <div className="report-hero-title-row">
                  {showHeroIcon && heroIconUrl && (
                    <img
                      src={heroIconUrl}
                      alt=""
                      className="extension-card-icon"
                      loading="lazy"
                      onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }}
                    />
                  )}
                  <h1 className="extension-card-title">{meta?.name || "Extension Analysis"}</h1>
                </div>
                <div className="extension-card-details">
                  {meta?.users != null && (
                    <span className="ext-detail">
                      <span className="ext-detail-icon">👥</span>
                      {meta.users.toLocaleString()} users
                    </span>
                  )}
                  {meta?.rating != null && (
                    <span className="ext-detail">
                      <span className="ext-detail-icon">⭐</span>
                      {meta.rating.toFixed(1)} rating
                    </span>
                  )}
                  {meta?.version && (
                    <span className="ext-detail ext-detail-muted">
                      <span className="ext-detail-icon">🏷️</span>
                      Version {meta.version}
                    </span>
                  )}
                  {meta?.scanTimestamp && (
                    <span className="ext-detail ext-detail-muted">
                      <span className="ext-detail-icon">📅</span>
                      Last scanned {formatScanDate(meta.scanTimestamp)}
                    </span>
                  )}
                  {viewModel?.publisherDisclosures?.last_updated_iso && (
                    <span className="ext-detail ext-detail-muted">
                      <span className="ext-detail-icon">↻</span>
                      Updated {viewModel.publisherDisclosures.last_updated_iso}
                    </span>
                  )}
                  {viewModel?.publisherDisclosures?.user_count != null && meta?.users == null && (
                    <span className="ext-detail ext-detail-muted">
                      <span className="ext-detail-icon">👥</span>
                      {viewModel.publisherDisclosures.user_count >= 1000
                        ? `${(viewModel.publisherDisclosures.user_count / 1000).toFixed(0)}k users`
                        : `${viewModel.publisherDisclosures.user_count} users`}
                    </span>
                  )}
                </div>
                {getDisplayDescription(scanResults) && (
                  <p className="extension-card-description">
                    {shortOverview(getDisplayDescription(scanResults))}
                    {chromeStoreUrl && (
                      <>
                        {" "}
                        <a
                          href={chromeStoreUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="description-webstore-link"
                        >
                          Web Store
                        </a>
                      </>
                    )}
                  </p>
                )}
                {(chromeStoreUrl || viewModel?.publisherDisclosures) && (() => {
                  const pd = viewModel?.publisherDisclosures;
                  const traderLabel = pd?.trader_status === "TRADER" ? "Trader" : pd?.trader_status === "NON_TRADER" ? "Non-trader" : "Unknown";
                  const traderDescription = pd?.trader_status === "TRADER"
                    ? "This developer is registered as a trader in the EU. Consumer rights apply to purchases from this developer."
                    : pd?.trader_status === "NON_TRADER"
                    ? "This developer has not identified itself as a trader. Consumer rights may not apply to contracts with this developer."
                    : "Trader status unknown. Unable to determine if consumer rights apply.";
                  const getHost = (url) => {
                    try { return new URL(url).host; } catch { return url; }
                  };
                  const linkChips = [
                    pd?.developer_website_url && { key: "website", href: pd.developer_website_url, label: "Website", icon: "↗" },
                    pd?.support_email && { key: "support", href: `mailto:${pd.support_email}`, label: "Support", icon: "✉" },
                    pd?.privacy_policy_url && { key: "privacy", href: pd.privacy_policy_url, label: "Privacy", icon: "🔒" },
                  ].filter(Boolean);
                  const allChips = pd ? [{ key: "trader", label: traderLabel, icon: "◉", title: traderDescription, link: false }, ...linkChips] : [];
                  return (
                    <div className="publisher-disclosures">
                      <div className="publisher-disclosures-header">
                        <span className="publisher-disclosures-label">Publisher</span>
                        {pd && <button
                          type="button"
                          className="publisher-info-icon"
                          onClick={() => setPublisherDetailsOpen((o) => !o)}
                          aria-expanded={publisherDetailsOpen}
                          aria-haspopup="dialog"
                          title="About this publisher"
                          ref={publisherDetailsRef}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                          </svg>
                        </button>}
                        {pd && publisherDetailsOpen && (
                          <>
                            <div
                              className="publisher-details-backdrop"
                              role="presentation"
                              onClick={() => setPublisherDetailsOpen(false)}
                              onKeyDown={(e) => e.key === "Escape" && setPublisherDetailsOpen(false)}
                            />
                            <div className="publisher-info-popover" role="dialog" aria-label="Publisher information">
                              <p>
                                <span className="publisher-info-label">Trader status:</span>
                                <span className="publisher-info-value">{traderLabel}</span>
                              </p>
                              <p className="publisher-info-description">{traderDescription}</p>
                              {pd.privacy_policy_url && (
                                <p>
                                  <span className="publisher-info-label">Privacy:</span>
                                  <a href={pd.privacy_policy_url} target="_blank" rel="noopener noreferrer">{getHost(pd.privacy_policy_url)}</a>
                                </p>
                              )}
                              <p className="publisher-info-note">
                                Information from Chrome Web Store disclosures. Not a security guarantee.
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      {(allChips.length > 0 || chromeStoreUrl) && (
                      <div className="publisher-disclosures-chips">
                        {allChips.map((c) =>
                          c.link !== false ? (
                            <a
                              key={c.key}
                              href={c.href}
                              target={c.key !== "support" ? "_blank" : undefined}
                              rel={c.key !== "support" ? "noopener noreferrer" : undefined}
                              className="publisher-chip publisher-chip-link"
                            >
                              <span className="publisher-chip-icon" aria-hidden>{c.icon}</span>
                              <span>{c.label}</span>
                            </a>
                          ) : (
                            <span
                              key={c.key}
                              className="publisher-chip"
                              title={c.title}
                            >
                              <span className="publisher-chip-icon" aria-hidden>{c.icon}</span>
                              <span>{c.label}</span>
                            </span>
                          )
                        )}
                        {chromeStoreUrl && (
                          <a
                            href={chromeStoreUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="publisher-chip publisher-chip-link"
                            aria-label="View in Chrome Web Store"
                            title="View in Chrome Web Store"
                          >
                            <svg className="publisher-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            <span>Web Store</span>
                          </a>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              <div className="report-hero-verdict">
                <DonutScore
                  score={overallScore}
                  band={overallBand}
                  size={donutSize}
                />
              </div>

              <div className="report-hero-copy">
                <h2 className="report-hero-headline">{verdict.headline}</h2>
                <p className="report-hero-body">{verdict.body}</p>
              </div>
            </div>
          </section>

          <div className="report-main">
            {/* Layer cards: Security / Privacy / Governance */}
            <LayerCards layerCards={layerCards} onOpenLayer={openLayerModal} />

            {/* Key Findings */}
            <section className="report-findings" id="key-findings">
              <div className="report-section-head">
                <h2 className="report-section-title">Key Findings</h2>
                <span className="report-section-sub">Issues that need your attention</span>
              </div>
              {topFindings.length === 0 ? (
                <p className="report-findings-empty">No issues were found in this area.</p>
              ) : (
                <ul className="findings-list">
                  {topFindings.map((f, i) => {
                    const tone = severityTone(f.level);
                    const open = expandedFinding === i;
                    const evCount = f.evidenceCount || 0;
                    // Evidence label (display only — helper selects the existing
                    // finding.evidence.label, never generates one). Resolvable IDs keep
                    // the openable count + "View evidence"; otherwise fall back to the
                    // structured evidence reference; "Evidence not linked" only when
                    // neither IDs nor structured evidence exist.
                    const ev = f.evidence;
                    const evidenceText = resolveFindingEvidenceLabel(f, evCount);
                    const evidenceTitle = ev && ev.available
                      ? (ev.snippet || ev.reason || ev.finalReason || '')
                      : '';
                    return (
                      <li className="finding-row" key={`${f.displayTitle}-${i}`}>
                        <div className="finding-main">
                          <AlertTriangle size={16} className={`finding-icon tone-${tone}`} aria-hidden="true" />
                          <div className="finding-text">
                            <span className="finding-title">{f.displayTitle}</span>
                            {f.summary && open && <span className="finding-summary">{f.summary}</span>}
                            {open && ev && ev.available && (
                              <div className="finding-evidence-details">
                                {ev.filePath && (
                                  <div className="fed-row"><span className="fed-key">File</span>
                                    <span className="fed-val">{ev.filePath}{typeof ev.lineStart === "number" && ev.lineStart > 0 ? `:${ev.lineStart}${typeof ev.lineEnd === "number" && ev.lineEnd > ev.lineStart ? `–${ev.lineEnd}` : ""}` : ""}</span></div>
                                )}
                                {ev.snippet && <pre className="fed-snippet">{ev.snippet}</pre>}
                                {ev.permission && (<div className="fed-row"><span className="fed-key">Permission</span><span className="fed-val">{ev.permission}</span></div>)}
                                {ev.hostPermission && (<div className="fed-row"><span className="fed-key">Host access</span><span className="fed-val">{ev.hostPermission}</span></div>)}
                                {ev.kind === "manifest" && ev.manifestField && !ev.permission && (<div className="fed-row"><span className="fed-key">Manifest</span><span className="fed-val">{ev.manifestField}</span></div>)}
                                {(ev.rulepack || ev.ruleId) && (<div className="fed-row"><span className="fed-key">Rule</span><span className="fed-val">{ev.rulepack ? `${ev.rulepack}${ev.ruleId ? `::${ev.ruleId}` : ""}` : ev.ruleId}</span></div>)}
                                {ev.finalReason && (<div className="fed-row"><span className="fed-key">Reason</span><span className="fed-val">{ev.finalReason}</span></div>)}
                                {ev.actionRequired && ev.actionRequired !== ev.finalReason && (<div className="fed-row"><span className="fed-key">Action</span><span className="fed-val">{ev.actionRequired}</span></div>)}
                                {typeof ev.malicious === "number" && (<div className="fed-row"><span className="fed-key">VirusTotal</span><span className="fed-val">{ev.malicious} malicious · {ev.suspicious || 0} suspicious{ev.hash ? ` · ${String(ev.hash).slice(0, 12)}…` : ""}</span></div>)}
                                {ev.analyzer && (<div className="fed-row"><span className="fed-key">Coverage</span><span className="fed-val">{ev.analyzer}{ev.reason ? ` — ${ev.reason}` : ""}</span></div>)}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className={`finding-severity tone-${tone}`} title={severityLabel(f.level)}>
                          {severityBadge(f.level)}
                        </span>
                        <span className="finding-category">{f.category}</span>
                        <span className="finding-evidence" title={evidenceTitle}>{evidenceText}</span>
                        <div className="finding-actions">
                          {evCount > 0 && (
                            <button
                              type="button"
                              className="finding-view-evidence"
                              onClick={() => openEvidenceDrawer(f.resolvableEvidenceIds)}
                            >
                              View evidence <ExternalLink size={13} aria-hidden="true" />
                            </button>
                          )}
                          {(f.summary || (ev && ev.available)) && (
                            <button
                              type="button"
                              className={`finding-expand${open ? " is-open" : ""}`}
                              aria-expanded={open}
                              aria-label="Toggle finding details"
                              onClick={() => setExpandedFinding(open ? null : i)}
                            >
                              <ChevronDown size={16} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <EvidenceTechnicalDetails rawScanResult={scanResults} viewModel={viewModel} />
          </div>

          {/* Right sidebar: Issue Overview, Quick Navigation, Similar Extensions */}
          <aside className="report-sidebar">
            <div className="sidebar-card">
              <button
                type="button"
                className="sidebar-card-head"
                aria-expanded={issueOverviewOpen}
                onClick={() => setIssueOverviewOpen((o) => !o)}
              >
                <span className="sidebar-card-title">Issue Overview</span>
                <ChevronDown size={16} className="sidebar-card-chevron" aria-hidden="true" />
              </button>
              <div className={`sidebar-card-body${issueOverviewOpen ? " is-open" : ""}`}>
                <ul className="issue-overview-list">
                  <li><span className="io-dot tone-bad" aria-hidden="true" /><span className="io-label">High</span><span className="io-count">{issueOverview.high}</span></li>
                  <li><span className="io-dot tone-warn" aria-hidden="true" /><span className="io-label">Medium</span><span className="io-count">{issueOverview.medium}</span></li>
                  <li><span className="io-dot tone-neutral" aria-hidden="true" /><span className="io-label">Low</span><span className="io-count">{issueOverview.low}</span></li>
                  <li><span className="io-dot tone-info" aria-hidden="true" /><span className="io-label">Info</span><span className="io-count">{issueOverview.info}</span></li>
                </ul>
                <div className="issue-overview-total">
                  <span>Total issues</span>
                  <span>{issueOverview.total}</span>
                </div>
              </div>
            </div>

            <div className="sidebar-card">
              <button
                type="button"
                className="sidebar-card-head"
                aria-expanded={quickNavOpen}
                onClick={() => setQuickNavOpen((o) => !o)}
              >
                <span className="sidebar-card-title">Quick Navigation</span>
                <ChevronDown size={16} className="sidebar-card-chevron" aria-hidden="true" />
              </button>
              <nav className={`sidebar-card-body${quickNavOpen ? " is-open" : ""}`} aria-label="Report sections">
                <ul className="quick-nav-list">
                  {quickNavItems.map((item) => (
                    <li key={item.id}>
                      <a href={`#${item.id}`} className="quick-nav-link">
                        <ListChecks size={14} aria-hidden="true" /> {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>

            <SimilarExtensions items={similarItems} />
          </aside>
        </div>
      </main>

      {/* Evidence Drawer - Global, mounted once */}
      <EvidenceDrawer 
        open={evidenceDrawer.open}
        evidenceIds={evidenceDrawer.evidenceIds}
        evidenceIndex={evidenceIndex || {}}
        onClose={closeEvidenceDrawer}
      />

      {/* File Viewer Modal */}
      <FileViewerModal
        isOpen={fileViewerModal.isOpen}
        onClose={() => setFileViewerModal({ isOpen: false, file: null })}
        file={fileViewerModal.file}
        extensionId={meta?.extensionId || scanId}
        onGetFileContent={getFileContent}
      />

      {/* Layer modals use report_view_model.layer_details for per-layer insights */}
      {layerModal.layer === 'security' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="security"
          score={scores?.security?.score}
          band={scores?.security?.band || 'NA'}
          factors={factorsByLayer?.security || []}
          keyFindings={dedupeFindings(allSecurityFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'security') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('security') || r.toLowerCase().includes('sast') || r.toLowerCase().includes('malware')) || []}
          layerDetails={scanResults?.report_view_model?.layer_details}
          onViewEvidence={openEvidenceDrawer}
        />
      )}

      {layerModal.layer === 'privacy' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="privacy"
          score={scores?.privacy?.score}
          band={scores?.privacy?.band || 'NA'}
          factors={factorsByLayer?.privacy || []}
          keyFindings={dedupeFindings(allPrivacyFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'privacy') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('privacy') || r.toLowerCase().includes('exfil') || r.toLowerCase().includes('tracking')) || []}
          layerDetails={scanResults?.report_view_model?.layer_details}
          onViewEvidence={openEvidenceDrawer}
        />
      )}

      {layerModal.layer === 'governance' && (
        <LayerModal
          open={layerModal.open}
          onClose={closeLayerModal}
          layer="governance"
          score={scores?.governance?.score}
          band={scores?.governance?.band || 'NA'}
          factors={factorsByLayer?.governance || []}
          keyFindings={dedupeFindings(allGovernanceFindings)}
          gateResults={scanResults?.scoring_v2?.gate_results?.filter(g => g.triggered && gateIdToLayer(g.gate_id) === 'governance') || []}
          layerReasons={scores?.reasons?.filter(r => r.toLowerCase().includes('governance') || r.toLowerCase().includes('policy') || r.toLowerCase().includes('tos') || r.toLowerCase().includes('disclosure')) || []}
          layerDetails={scanResults?.report_view_model?.layer_details}
          onViewEvidence={openEvidenceDrawer}
        />
      )}
    </div>
    </>
  );
};

export default ScanResultsPageV2;
