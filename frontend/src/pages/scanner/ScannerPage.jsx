import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useScan } from "../../context/ScanContext";
import databaseService from "../../services/databaseService";
import realScanService from "../../services/realScanService";
import {
  getSignalColorClass,
  getSignalDisplayLabel,
  resolveScanVerdict,
} from "../../utils/signalMapper";
import RiskVerdictBadge from "../../components/report/RiskVerdictBadge";
import { enrichScans } from "../../utils/scanEnrichment";
import { EXTENSION_ICON_PLACEHOLDER, getExtensionIconUrl } from "../../utils/constants";
import { getScanResultsRoute } from "../../utils/slug";
import SEOHead from "../../components/SEOHead";
import DemoModal from "../../components/DemoModal";
import ScanActivityIndicator from "../../components/ScanActivityIndicator";
import "./ScannerPage.scss";

// Tooltip component for signal chips
const SignalTooltip = ({ type, children }) => {
  const tooltips = {
    security: "Security: Technical vulnerabilities, SAST findings, and code quality analysis",
    privacy: "Privacy: Data collection risks, permissions analysis, and exfiltration detection",
    governance: "Governance: Policy compliance, behavioral consistency, and regulatory adherence",
    // Legacy tooltips for backward compatibility
    code: "Code Analysis: SAST scanning, entropy detection, and obfuscation checks",
    perms: "Permissions: Analysis of requested browser permissions and access levels",
    intel: "Threat Intel: VirusTotal scan results and malware detection flags"
  };

  return (
    <div className="signal-chip-wrapper" title={tooltips[type] || tooltips.code}>
      {children}
    </div>
  );
};

// Signal chip component
const SignalChip = ({ type, signal }) => {
  const labels = { 
    security: "Security", 
    privacy: "Privacy", 
    governance: "Gov",  // Shortened for space
    // Legacy labels for backward compatibility
    code: "Code", 
    perms: "Perms", 
    intel: "Intel" 
  };
  
  const icons = {
    security: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    privacy: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
    ),
    governance: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <path d="M16 13H8" />
        <path d="M16 17H8" />
        <path d="M10 9H8" />
      </svg>
    ),
    // Legacy icons for backward compatibility
    code: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="16,18 22,12 16,6" />
        <polyline points="8,6 2,12 8,18" />
      </svg>
    ),
    perms: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
    intel: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    )
  };

  const colorClass = getSignalColorClass(signal?.level);

  const displayLabel = getSignalDisplayLabel(signal);
  return (
    <SignalTooltip type={type}>
      <div className={`signal-chip ${colorClass}`}>
        <span className="signal-icon">{icons[type] || icons.code}</span>
        <span className="signal-label">{labels[type] || labels.code}</span>
        <span className="signal-value">{displayLabel}</span>
      </div>
    </SignalTooltip>
  );
};

// Pure formatters — stable references, no re-creation per render
const formatUserCount = (count) => {
  if (!count) return "—";
  const num = typeof count === "string" ? parseInt(count.replace(/,/g, ""), 10) : count;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
};

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return "—";
  const now = new Date();
  const scanTime = new Date(timestamp);
  const diffMs = now - scanTime;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return scanTime.toLocaleDateString();
};

const ScannerPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, openSignInModal } = useAuth();
  const {
    url,
    setUrl,
    isScanning,
    error,
    setError,
    startScan,
  } = useScan();

  const [allScans, setAllScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // e.g. API unreachable
  const [sortConfig, setSortConfig] = useState({ key: "timestamp", direction: "desc" });
  const [hoveredRow, setHoveredRow] = useState(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const tableWrapperRef = useRef(null);
  const demoTriggerRef = useRef(null);

  const [deepScanLimit, setDeepScanLimit] = useState(null);
  const [cachedAvailable, setCachedAvailable] = useState(false);

  // Search autocomplete — queries /api/recent?search= for matching extensions
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const autocompleteTimerRef = useRef(null);

  const handleAutocomplete = useCallback((query) => {
    const q = (query || "").trim();

    // Skip autocomplete for URLs and extension IDs (32-char lowercase)
    if (!q || q.length < 2 || /^https?:\/\//.test(q) || /^[a-z]{32}$/i.test(q)) {
      setAutocompleteSuggestions([]);
      setAutocompleteLoading(false);
      return;
    }

    // Show dropdown immediately with loading state so it feels instant
    setAutocompleteLoading(true);
    setAutocompleteSuggestions([]);

    clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(async () => {
      try {
        const results = await databaseService.getRecentScans(6, q);
        setAutocompleteSuggestions(results || []);
        setAutocompleteIndex(0);
      } catch {
        setAutocompleteSuggestions([]);
      } finally {
        setAutocompleteLoading(false);
      }
    }, 80);
  }, []);

  const handleSelectSuggestion = useCallback((scan) => {
    setAutocompleteSuggestions([]);
    const route = getScanResultsRoute(scan.extension_id, scan.extension_name);
    navigate(route);
  }, [navigate]);

  const TEASER_LIMIT = 10;

  // Clean the URL input on mount so previous extension ID doesn't persist
  useEffect(() => {
    setUrl("");
  }, [setUrl]);

  // Shared load so we can refetch for live updates (visibility + polling)
  const loadScans = React.useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Request timeout")), 10000)
      );
      const history = await Promise.race([
        databaseService.getRecentScans(TEASER_LIMIT),
        timeoutPromise,
      ]);
      if (!history || history.length === 0) {
        setAllScans([]);
        return;
      }
      const enrichedScans = await enrichScans(history, { skipFullFetch: false });
      if (enrichedScans.length > 0) {
        setAllScans(enrichedScans);
      } else {
        const fallbackScans = await enrichScans(history, { skipFullFetch: false });
        setAllScans(fallbackScans.length > 0 ? fallbackScans : []);
      }
    } catch (err) {
      setAllScans([]);
      setLoadError(err?.message || "Failed to load recent scans");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and when navigating back to /scan (e.g., after completing a scan)
  useEffect(() => {
    loadScans(true);
  }, [loadScans, location.pathname]);

  // Live update: refetch when user returns to this tab or navigates back to /scan
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") loadScans(false);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [loadScans]);

  // Live update: poll every 10s so new scans appear shortly after completion (reduced from 20s)
  useEffect(() => {
    const interval = setInterval(() => loadScans(false), 10000);
    return () => clearInterval(interval);
  }, [loadScans]);

  // Load deep-scan limit status (best-effort)
  useEffect(() => {
    let cancelled = false;
    const loadLimit = async () => {
      try {
        const limit = await realScanService.getDeepScanLimitStatus();
        if (!cancelled) setDeepScanLimit(limit);
      } catch (e) {
        // Ignore - backend may be unavailable in some dev setups
      }
    };
    loadLimit();
    return () => {
      cancelled = true;
    };
  }, []);

  // If backend blocks a deep scan (429), refresh limit status so the button can disable immediately.
  useEffect(() => {
    if (!error || typeof error !== "string") return;
    if (!error.toLowerCase().includes("daily scan limit")) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const limit = await realScanService.getDeepScanLimitStatus();
        if (!cancelled) setDeepScanLimit(limit);
      } catch (e) {
        // ignore
      }
    };
    refresh();
    return () => {
      cancelled = true;
    };
  }, [error]);

  // If limit is reached, check whether this URL maps to an extension with cached results.
  useEffect(() => {
    if (!deepScanLimit || deepScanLimit.remaining > 0) {
      setCachedAvailable(false);
      return;
    }

    const raw = (url || "").trim();
    const extId = realScanService.extractExtensionId(raw);
    if (!raw || !extId) {
      setCachedAvailable(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const cached = await realScanService.hasCachedResults(extId);
        if (!cancelled) setCachedAvailable(Boolean(cached));
      } catch (e) {
        if (!cancelled) setCachedAvailable(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [url, deepScanLimit]);

  // Handle scroll shadows for horizontal scrolling on mobile
  useEffect(() => {
    const tableWrapper = tableWrapperRef.current;
    if (!tableWrapper) return;

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = tableWrapper;
      const isScrolledFromLeft = scrollLeft > 0;
      const isScrolledFromRight = scrollLeft < scrollWidth - clientWidth - 1;

      // Add/remove shadow classes
      if (isScrolledFromLeft) {
        tableWrapper.classList.add('show-left-shadow');
        tableWrapper.classList.add('scrolled');
      } else {
        tableWrapper.classList.remove('show-left-shadow');
        tableWrapper.classList.remove('scrolled');
      }

      if (isScrolledFromRight) {
        tableWrapper.classList.add('show-right-shadow');
      } else {
        tableWrapper.classList.remove('show-right-shadow');
      }
    };

    // Initial check
    handleScroll();

    // Add scroll listener
    tableWrapper.addEventListener('scroll', handleScroll);
    
    // Add resize listener to recalculate on window resize
    window.addEventListener('resize', handleScroll);

    return () => {
      tableWrapper.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [allScans]);

  // Legacy: if navigated with prefillUrl state (e.g. from old bookmarks), use it
  useEffect(() => {
    if (location.state?.prefillUrl) {
      setUrl(location.state.prefillUrl);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, setUrl]);

  const handleScanClick = useCallback(() => {
    if (!url.trim()) {
      setError("Please enter a Chrome Web Store URL");
      return;
    }
    startScan(url);
  }, [url, startScan, setError]);

  const deepScanLimitReached = deepScanLimit && deepScanLimit.remaining <= 0;
  const scanDisabledDueToLimit = Boolean(deepScanLimitReached && !cachedAvailable);
  const scanDisabledTooltip = "Daily scan limit reached (1 scan for guests). Sign in to get more scans or try again tomorrow.";

  const handleSort = useCallback((key) => {
    setSortConfig((prev) => {
      const direction = prev.key === key && prev.direction === "asc" ? "desc" : "asc";
      return { key, direction };
    });
  }, []);

  // Sort and paginate data
  const sortedAndPaginatedScans = useMemo(() => {
    let sorted = [...allScans];

    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];
        // For timestamp, use fallback chain (API maps scanned_at→timestamp)
        if (sortConfig.key === "timestamp" || sortConfig.key === "scanned_at") {
          aVal = a.timestamp ?? a.scanned_at ?? a.created_at ?? a.updated_at;
          bVal = b.timestamp ?? b.scanned_at ?? b.created_at ?? b.updated_at;
        }

        // Handle null/undefined values
        if (aVal == null) return 1;
        if (bVal == null) return -1;

        // Handle different data types
        if (sortConfig.key === "extension_name") {
          aVal = (aVal || "").toLowerCase();
          bVal = (bVal || "").toLowerCase();
        } else if (sortConfig.key === "timestamp" || sortConfig.key === "scanned_at") {
          aVal = new Date(aVal).getTime();
          bVal = new Date(bVal).getTime();
        } else if (sortConfig.key === "score" || sortConfig.key === "findings_count") {
          aVal = Number(aVal) || 0;
          bVal = Number(bVal) || 0;
        } else if (typeof aVal === "string") {
          const aNum = parseFloat(aVal);
          const bNum = parseFloat(bVal);
          if (!isNaN(aNum) && !isNaN(bNum)) {
            aVal = aNum;
            bVal = bNum;
          }
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    // Teaser: always show first TEASER_LIMIT rows, no pagination
    return sorted.slice(0, TEASER_LIMIT);
  }, [allScans, sortConfig]);

  const handleViewReport = useCallback((scan) => {
    const route = getScanResultsRoute(scan.extension_id, scan.extension_name);
    navigate(route);
  }, [navigate]);

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ExtensionShield",
    "applicationCategory": "SecurityApplication",
    "operatingSystem": "Web",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "description": "Free Chrome extension scanner and security audit"
    },
    "description": "Free Chrome extension scanner and security audit. Scan any extension by URL for risk score, permissions, malware check. For developers: audit extensions before release.",
    "url": "https://extensionshield.com/scan"
  };

  return (
    <>
      <SEOHead
        title="Scan a Chrome Extension — Free Security & Risk Report | ExtensionShield"
        description="Scan any Chrome extension by Web Store URL. Get a 0–100 risk score across security, privacy, and governance, with evidence for every finding. Free, no signup."
        pathname="/scan"
        ogType="website"
        schema={[softwareAppSchema]}
        keywords="free extension scanner, free extension audit, Chrome extension scanner, scan Chrome extension, extension risk score, extension security audit"
      />
      <div className="scanner-page">
        <section className="scanner-hero">
        {/* Main Content - Similar to hero layout (tagline, headline, sub, input, features) */}
        <div className="scanner-content">
          <div className="scanner-header">
            <p className="scanner-tagline">Extension Risk Check</p>
            <h1 className="scanner-headline">Know what your Chrome extensions can access.</h1>
          </div>

          <div className="scanner-search">
            <div className="scanner-search-container">
              <span className="scanner-search-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="chrome-logo">
                  <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
                  <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
                  <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
                  <circle cx="12" cy="12" r="4" fill="#34A853" />
                  <circle cx="12" cy="12" r="2.5" fill="white" />
                </svg>
              </span>
              <input
                type="text"
                id="scanner-url-input"
                placeholder="Search extension name or paste Store URL"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  handleAutocomplete(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (autocompleteSuggestions.length > 0 && autocompleteIndex >= 0 && autocompleteSuggestions[autocompleteIndex]) {
                      e.preventDefault();
                      handleSelectSuggestion(autocompleteSuggestions[autocompleteIndex]);
                      return;
                    }
                    setAutocompleteSuggestions([]);
                    handleScanClick();
                  }
                  if (e.key === "Escape") setAutocompleteSuggestions([]);
                  if (e.key === "ArrowDown" && autocompleteSuggestions.length > 0) {
                    e.preventDefault();
                    setAutocompleteIndex((i) => Math.min(i + 1, autocompleteSuggestions.length - 1));
                  }
                  if (e.key === "ArrowUp" && autocompleteSuggestions.length > 0) {
                    e.preventDefault();
                    setAutocompleteIndex((i) => Math.max(i - 1, 0));
                  }
                }}
                onFocus={() => { if (url.trim().length >= 2) handleAutocomplete(url); }}
                onBlur={() => { setTimeout(() => { setAutocompleteSuggestions([]); setAutocompleteLoading(false); }, 150); }}
                aria-label="Search extension name or paste Store URL"
                autoComplete="off"
                disabled={isScanning}
                role="combobox"
                aria-expanded={autocompleteSuggestions.length > 0 || autocompleteLoading}
                aria-autocomplete="list"
                aria-controls="scanner-autocomplete-list"
              />
              {(autocompleteSuggestions.length > 0 || autocompleteLoading) && (
                <ul className="scanner-autocomplete" id="scanner-autocomplete-list" role="listbox">
                  {autocompleteLoading && autocompleteSuggestions.length === 0 ? (
                    <li className="scanner-autocomplete-item scanner-autocomplete-loading" role="status">
                      <span className="autocomplete-name">Searching...</span>
                    </li>
                  ) : (
                    autocompleteSuggestions.map((s, i) => (
                    <li
                      key={s.extension_id}
                      role="option"
                      aria-selected={i === autocompleteIndex}
                      className={`scanner-autocomplete-item${i === autocompleteIndex ? " active" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(s);
                      }}
                    >
                      <img
                        src={getExtensionIconUrl(s.extension_id)}
                        alt=""
                        className="autocomplete-icon"
                        width="20"
                        height="20"
                        onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }}
                      />
                      <span className="autocomplete-name">{s.extension_name || s.extension_id}</span>
                    </li>
                  ))
                  )}
                </ul>
              )}
              <button
                type="button"
                className="scanner-scan-icon"
                onClick={handleScanClick}
                disabled={isScanning || !url.trim() || scanDisabledDueToLimit}
                title={scanDisabledDueToLimit ? scanDisabledTooltip : "Scan extension"}
                aria-label="Scan extension"
              >
                {isScanning ? (
                  <ScanActivityIndicator
                    variant="button"
                    title="Scan in progress"
                    hideText
                  />
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                )}
              </button>
            </div>
            <p className="scanner-scan-info">
              <svg className="scanner-scan-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Checks permissions, network access, code behavior, and known threats.
            </p>
            <button
              type="button"
              ref={demoTriggerRef}
              className="scanner-demo-link"
              title="Step-by-step guide to scanning an extension"
              onClick={() => setDemoModalOpen(true)}
            >
              <span className="scanner-demo-icon" aria-hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                </svg>
              </span>
              <span>Step-by-step guide</span>
            </button>
          </div>

          {scanDisabledDueToLimit && (
            <div className="deep-scan-limit-banner">
              Daily scan limit reached (1 scan for guests). Sign in to get more scans or try again tomorrow.
            </div>
          )}

          {/* Error Message */}
          {error && !error.includes("✅") && !error.includes("🔄") && (
            <div className="error-message">
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}
        </div>

        {/* Extensions Table */}
        <div className="extensions-table-container">
          <div className="table-header-section">
            {loading && <div className="loading-indicator">Loading...</div>}
            {!loading && allScans.length > 0 && (
              <div className="table-section-heading">
                <h2 className="table-section-title">Recent scans</h2>
                <p className="table-section-subtitle">Select a scan to open the report.</p>
              </div>
            )}
          </div>

          {!loading && allScans.length > 0 && (
            <>
              <div className="table-wrapper" ref={tableWrapperRef}>
                <table className="extensions-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort("extension_name")}>
                        <div className="th-content">
                          <svg className="th-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M12 8v8M8 12h8" />
                          </svg>
                          Extension
                          {sortConfig.key === "extension_name" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                      <th className="sortable hide-mobile" onClick={() => handleSort("user_count")}>
                        <div className="th-content">
                          Users
                          {sortConfig.key === "user_count" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                      <th className="sortable hide-mobile" onClick={() => handleSort("rating")}>
                        <div className="th-content">
                          Rating
                          {sortConfig.key === "rating" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                      <th className="sortable hide-tablet" onClick={() => handleSort("rating_count")}>
                        <div className="th-content">
                          Reviews
                          {sortConfig.key === "rating_count" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                      <th className="sortable" onClick={() => handleSort("score")}>
                        <div className="th-content">
                          <svg className="th-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          Risk
                          {sortConfig.key === "score" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                      <th>
                        <div className="th-content">
                          <svg className="th-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                          </svg>
                          Signals
                        </div>
                      </th>
                      <th className="sortable" onClick={() => handleSort("findings_count")}>
                        <div className="th-content">
                          <svg className="th-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <path d="M14 2v6h6" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                          Report
                          {sortConfig.key === "findings_count" && (
                            <span className="sort-arrow">{sortConfig.direction === "asc" ? "↑" : "↓"}</span>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAndPaginatedScans.map((scan, index) => (
                      <tr
                        key={scan.extension_id || index}
                        className={hoveredRow === scan.extension_id ? "row-hovered" : ""}
                        onMouseEnter={() => setHoveredRow(scan.extension_id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => handleViewReport(scan)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleViewReport(scan);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td className="extension-cell">
                          <div className="extension-info">
                            <img
                              src={getExtensionIconUrl(scan.extension_id)}
                              alt={scan.extension_name}
                              className="extension-icon"
                              onError={(e) => {
                                // On error, fallback to placeholder
                                e.target.onerror = null;
                                e.target.src = EXTENSION_ICON_PLACEHOLDER;
                              }}
                            />
                            <div className="extension-details">
                              <span className="extension-name">
                                {scan.extension_name || scan.metadata?.title || scan.metadata?.name || scan.manifest?.name || scan.extension_id}
                              </span>
                              <span className="extension-scanned">
                                {formatTimeAgo(scan.timestamp ?? scan.scanned_at ?? scan.created_at ?? scan.updated_at)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="hide-mobile">{formatUserCount(scan.user_count)}</td>
                        <td className="hide-mobile">
                          {scan.rating != null ? (
                            <span className="rating-value">{parseFloat(scan.rating).toFixed(1)}</span>
                          ) : (
                            <span className="no-data">—</span>
                          )}
                        </td>
                        <td className="hide-tablet">
                          {scan.rating_count != null ? (
                            <span>{formatUserCount(scan.rating_count)}</span>
                          ) : (
                            <span className="no-data">—</span>
                          )}
                        </td>
                        <td>
                          <RiskVerdictBadge level={scan.risk_level} score={scan.score} decision={resolveScanVerdict(scan)} />
                        </td>
                        <td className="signals-cell">
                          <div className="signals-container">
                            <SignalChip type="security" signal={scan.signals?.security_signal} />
                            <SignalChip type="privacy" signal={scan.signals?.privacy_signal} />
                            <SignalChip type="governance" signal={scan.signals?.governance_signal} />
                          </div>
                        </td>
                        <td className="evidence-cell">
                          <div className="evidence-container">
                            <span className="findings-count">
                              {scan.findings_count || 0} finding{scan.findings_count !== 1 ? "s" : ""}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Teaser footer: point users to full history */}
              <div className="table-pagination">
                <div className="pagination-info">
                  Showing {Math.min(sortedAndPaginatedScans.length, allScans.length)} most recent scans
                </div>
                <button
                  className="view-all-history-btn"
                  onClick={() => {
                    if (!isAuthenticated) {
                      sessionStorage.setItem("auth:returnTo", "/scan/history");
                      openSignInModal();
                      return;
                    }
                    navigate("/scan/history");
                  }}
                >
                  View All History →
                </button>
              </div>
            </>
          )}

          {!loading && allScans.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🛡️</div>
              <h3>No extensions scanned yet</h3>
              <p>Start by scanning your first Chrome extension above</p>
              {loadError ? (
                <>
                  <p className="empty-state-hint empty-state-error">
                    Could not load recent scans: {loadError}
                  </p>
                  <p className="empty-state-hint">
                    Make sure the API is running: run <code>make api</code> in a separate terminal (port 8007). If using a custom API URL, set <code>VITE_API_URL</code> in <code>frontend/.env</code> and restart the frontend.
                  </p>
                </>
              ) : (
                <>
                  <p className="empty-state-hint">
                    Only <strong>Chrome Web Store URL</strong> scans appear here. Uploaded extensions are private and do not show in this list. Paste a Web Store URL above, run the scan, and wait for it to complete—then the list will update.
                  </p>
                  {import.meta.env.DEV && (
                    <p className="empty-state-hint">
                      Local dev: ensure the API is running (<code>make api</code>) and <code>VITE_API_URL=http://localhost:8007</code> in <code>frontend/.env</code>, then restart the frontend.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <DemoModal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        triggerRef={demoTriggerRef}
      />
      </div>
    </>
  );
};

export default ScannerPage;
