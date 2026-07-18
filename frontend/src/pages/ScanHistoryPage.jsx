import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import databaseService from "../services/databaseService";
import realScanService from "../services/realScanService";
import {
  getSignalColorClass,
  getSignalDisplayLabel,
  resolveScanVerdict,
} from "../utils/signalMapper";
import RiskVerdictBadge from "../components/report/RiskVerdictBadge";
import { enrichScans } from "../utils/scanEnrichment";
import { EXTENSION_ICON_PLACEHOLDER, getExtensionIconUrl } from "../utils/constants";
import { getScanResultsRoute } from "../utils/slug";
import SEOHead from "../components/SEOHead";
import "./ScanHistoryPage.scss";

const SHOW_TABLE_WITHOUT_SIGN_IN = false;
const HISTORY_LIMIT = 100;
const REQUEST_TIMEOUT_MS = 5000;

const SignalTooltip = ({ type, children }) => {
  const tooltips = {
    security: "Security: Technical vulnerabilities, SAST findings, and code quality analysis",
    privacy: "Privacy: Data collection risks, permissions analysis, and exfiltration detection",
    governance: "Governance: Policy compliance, behavioral consistency, and regulatory adherence",
    code: "Code Analysis: SAST scanning, entropy detection, and obfuscation checks",
    perms: "Permissions: Analysis of requested browser permissions and access levels",
    intel: "Threat Intel: VirusTotal scan results and malware detection flags",
  };

  return (
    <div className="signal-chip-wrapper" title={tooltips[type] || tooltips.code}>
      {children}
    </div>
  );
};

const SignalChip = ({ type, signal }) => {
  const labels = {
    security: "Security",
    privacy: "Privacy",
    governance: "Gov",
    code: "Code",
    perms: "Perms",
    intel: "Intel",
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
    ),
  };

  return (
    <SignalTooltip type={type}>
      <div className={`signal-chip ${getSignalColorClass(signal?.level)}`}>
        <span className="signal-icon">{icons[type] || icons.code}</span>
        <span className="signal-label">{labels[type] || labels.code}</span>
        <span className="signal-value">{getSignalDisplayLabel(signal)}</span>
      </div>
    </SignalTooltip>
  );
};

const withTimeout = (promise, timeoutMs = REQUEST_TIMEOUT_MS) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
    }),
  ]);

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

// Shown for history rows whose scan is missing (orphaned by a DB reset) or
// failed — those get a fresh scan kicked off instead of a misleading verdict.
const RescanPill = () => (
  <span
    className="rescan-pill"
    title="This scan is missing or incomplete and is being re-run"
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      color: "#7a5b00",
      background: "#fff4d6",
      border: "1px solid #f0d488",
      whiteSpace: "nowrap",
    }}
  >
    Rescanning…
  </span>
);

// Shown for rows that can't be re-fetched from the store (e.g. uploaded/private
// builds whose scan was lost) — a neutral state instead of a misleading verdict.
const UnavailablePill = () => (
  <span
    className="unavailable-pill"
    title="This scan isn't available and can't be re-fetched from the Chrome Web Store"
    style={{
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 10px",
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      color: "#555",
      background: "#ececec",
      border: "1px solid #ccc",
      whiteSpace: "nowrap",
    }}
  >
    Unavailable
  </span>
);

const ScanHistoryPage = () => {
  const [allScans, setAllScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: "timestamp", direction: "desc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [hoveredRow, setHoveredRow] = useState(null);
  const tableWrapperRef = useRef(null);
  const rescanTriggeredRef = useRef(new Set()); // ext ids we've kicked a rescan for this session
  const navigate = useNavigate();
  const { isAuthenticated, openSignInModal, accessToken } = useAuth();

  const supabaseConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL);
  const canLoadHistory = isAuthenticated || !supabaseConfigured || SHOW_TABLE_WITHOUT_SIGN_IN;

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      if (!canLoadHistory) {
        if (isMounted) {
          setAllScans([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);

      try {
        let scans = [];

        if (isAuthenticated) {
          scans = await withTimeout(
            databaseService.getScanHistory(HISTORY_LIMIT, accessToken)
          ).catch(() => []);
        } else if (SHOW_TABLE_WITHOUT_SIGN_IN) {
          scans = await withTimeout(databaseService.getRecentScans(HISTORY_LIMIT, debouncedSearch)).catch(() => []);
        }

        const enrichedFast = await enrichScans(scans, { skipFullFetch: true });
        const enrichedScans =
          enrichedFast.length > 0 || scans.length === 0
            ? enrichedFast
            : await enrichScans(scans, { skipFullFetch: false });

        if (isMounted) {
          setAllScans(enrichedScans);
        }
      } catch (error) {
        if (isMounted) {
          setAllScans([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      isMounted = false;
    };
  }, [accessToken, canLoadHistory, debouncedSearch, isAuthenticated]);

  // Issue 2: kick off bounded rescans for orphaned/failed history rows so they
  // resolve to real reports instead of a stale/missing verdict. Capped and
  // de-duped per session; the backend adds its own concurrency + VirusTotal-quota
  // guards, so this cannot become a rescan storm.
  useEffect(() => {
    const MAX_PER_LOAD = 8;
    const CONCURRENCY = 2;
    const isStoreId = (id) => /^[a-p]{32}$/.test(id || ""); // only CWS ids are rescannable from a store URL
    const queue = allScans
      .filter((s) => s?.needs_rescan && isStoreId(s.extension_id) && !rescanTriggeredRef.current.has(s.extension_id))
      .slice(0, MAX_PER_LOAD);
    if (queue.length === 0) return;

    let cancelled = false;
    const worker = async () => {
      while (!cancelled && queue.length) {
        const scan = queue.shift();
        if (!scan || rescanTriggeredRef.current.has(scan.extension_id)) continue;
        // Mark right before firing (not the whole batch up front) so ids a
        // cancelled run never reached stay eligible on the next load.
        rescanTriggeredRef.current.add(scan.extension_id);
        try {
          await realScanService.triggerScan(
            `https://chromewebstore.google.com/detail/_/${scan.extension_id}`,
            { historyRefresh: true }
          );
        } catch {
          // Leave it marked: a rate-limit/backpressure failure must not re-fire
          // on every history reload (e.g. each search keystroke). A fresh session
          // (component remount) resets the ref and retries.
        }
      }
    };
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i += 1) worker();

    return () => {
      cancelled = true;
    };
  }, [allScans]);

  useEffect(() => {
    const tableWrapper = tableWrapperRef.current;
    if (!tableWrapper) return;

    const handleScroll = () => {
      const { scrollLeft, scrollWidth, clientWidth } = tableWrapper;
      const isScrolledFromLeft = scrollLeft > 0;
      const isScrolledFromRight = scrollLeft < scrollWidth - clientWidth - 1;

      if (isScrolledFromLeft) {
        tableWrapper.classList.add("show-left-shadow");
        tableWrapper.classList.add("scrolled");
      } else {
        tableWrapper.classList.remove("show-left-shadow");
        tableWrapper.classList.remove("scrolled");
      }

      if (isScrolledFromRight) {
        tableWrapper.classList.add("show-right-shadow");
      } else {
        tableWrapper.classList.remove("show-right-shadow");
      }
    };

    handleScroll();
    tableWrapper.addEventListener("scroll", handleScroll);
    window.addEventListener("resize", handleScroll);

    return () => {
      tableWrapper.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);
    };
  }, [allScans]);

  const filteredScans = useMemo(() => {
    if (SHOW_TABLE_WITHOUT_SIGN_IN && !isAuthenticated) {
      return allScans;
    }
    if (!searchTerm.trim()) return allScans;
    const term = searchTerm.toLowerCase();
    return allScans.filter(
      (scan) =>
        scan.extension_name?.toLowerCase().includes(term) ||
        scan.extension_id?.toLowerCase().includes(term)
    );
  }, [allScans, isAuthenticated, searchTerm]);

  const handleSort = (key) => {
    let direction = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedAndPaginatedScans = useMemo(() => {
    const sorted = [...filteredScans];

    if (sortConfig.key) {
      sorted.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        if (sortConfig.key === "timestamp" || sortConfig.key === "scanned_at") {
          aVal = a.timestamp ?? a.scanned_at ?? a.created_at ?? a.updated_at;
          bVal = b.timestamp ?? b.scanned_at ?? b.created_at ?? b.updated_at;
        }

        if (aVal == null) return 1;
        if (bVal == null) return -1;

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
          if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
            aVal = aNum;
            bVal = bNum;
          }
        }

        if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }

    const startIndex = (currentPage - 1) * rowsPerPage;
    return sorted.slice(startIndex, startIndex + rowsPerPage);
  }, [currentPage, filteredScans, rowsPerPage, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(filteredScans.length / rowsPerPage));
  const isPublicView = !isAuthenticated;
  const showLoginRequiredGate = !isAuthenticated && !SHOW_TABLE_WITHOUT_SIGN_IN;

  const handleViewReport = (scan) => {
    const route = getScanResultsRoute(scan.extension_id, scan.extension_name);
    navigate(route);
  };

  return (
    <>
      <SEOHead
        title="Scan History"
        description="View your Chrome extension scan history and past security reports. Track risk scores, findings, and monitor extension security over time."
        pathname="/scan/history"
        ogType="website"
        noindex
      />
      <div className="history-page">
        <div className="history-content">
          {showLoginRequiredGate && (
            <div className="history-login-gate">
              <p className="history-login-gate__text">Login required to view scan history.</p>
              <button type="button" className="action-signin" onClick={openSignInModal}>
                Sign In
              </button>
            </div>
          )}

          {!showLoginRequiredGate && (
            <>
              <div className="history-header">
                <p className="history-tagline">Scan History</p>
                <h1 className="history-headline">Review your scanned Chrome extensions.</h1>
                <p className="history-subtitle">
                  Every extension you scan while signed in appears here in your personal history.
                </p>
              </div>

              <div className="history-toolbar">
                <div className="toolbar-left">
                  <div className="scan-count-badge">
                    <span>Available scans</span>
                    <span className="count-number">{filteredScans.length}</span>
                  </div>
                </div>

                <div className="toolbar-right">
                  <div className="search-input-wrapper">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                    <input
                      type="text"
                      className="search-input"
                      placeholder="Search extensions by name or ID"
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="extensions-table-container">
                <div className="table-header-section">
                  {loading && <div className="loading-indicator">Loading...</div>}
                  {!loading && filteredScans.length > 0 && (
                    <div className="table-section-heading">
                      <h2 className="table-section-title">Scanned extensions</h2>
                      <p className="table-section-subtitle">Click View to open the evidence report.</p>
                    </div>
                  )}
                </div>

                {loading && (
                  <div className="loading-state">
                    <div className="loading-spinner" />
                    <span className="loading-text">Loading scan history...</span>
                  </div>
                )}

                {!loading && filteredScans.length > 0 && (
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
                              Evidence
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
                              {scan.needs_rescan ? (
                                <RescanPill />
                              ) : scan.unavailable ? (
                                <UnavailablePill />
                              ) : (
                                <RiskVerdictBadge level={scan.risk_level} score={scan.score} decision={resolveScanVerdict(scan)} />
                              )}
                            </td>
                            <td className="signals-cell">
                              {scan.needs_rescan || scan.unavailable ? (
                                <span className="no-data">{scan.needs_rescan ? "Pending rescan" : "—"}</span>
                              ) : (
                                <div className="signals-container">
                                  <SignalChip type="security" signal={scan.signals?.security_signal} />
                                  <SignalChip type="privacy" signal={scan.signals?.privacy_signal} />
                                  <SignalChip type="governance" signal={scan.signals?.governance_signal} />
                                </div>
                              )}
                            </td>
                            <td className="evidence-cell">
                              <div className="evidence-container">
                                <span className="findings-count">
                                  {scan.needs_rescan || scan.unavailable
                                    ? "—"
                                    : `${scan.findings_count || 0} finding${scan.findings_count !== 1 ? "s" : ""}`}
                                </span>
                                <button
                                  className="view-report-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewReport(scan);
                                  }}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                    <circle cx="12" cy="12" r="3" />
                                  </svg>
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!loading && filteredScans.length > 0 && (
                  <div className="table-pagination">
                    <div className="pagination-info">
                      Showing {(currentPage - 1) * rowsPerPage + 1} to{" "}
                      {Math.min(currentPage * rowsPerPage, filteredScans.length)} of {filteredScans.length} rows
                    </div>
                    <div className="pagination-controls">
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
                        </svg>
                      </button>
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M15 18l-6-6 6-6" />
                        </svg>
                      </button>
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                      </button>
                      <button
                        className="pagination-btn"
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
                        </svg>
                      </button>
                    </div>
                    <div className="pagination-rows">
                      <label>Rows per page:</label>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                      >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                  </div>
                )}

                {!loading && filteredScans.length === 0 && (
                  <div className="empty-state">
                    <div className="empty-icon">🛡️</div>
                    <h3>{searchTerm ? "No matching scans found" : isPublicView ? "Sign in to view your scan history" : "No scan history yet"}</h3>
                    <p>
                      {searchTerm
                        ? `No scans match "${searchTerm}". Try a different search term.`
                        : isPublicView
                          ? "Your saved scans are tied to your account."
                          : "Start by scanning a Chrome Web Store extension from the main scan page."}
                    </p>
                    {!searchTerm && !isPublicView && (
                      <button className="empty-action-btn" onClick={() => navigate("/scan")}>
                        <span>⚡</span>
                        Go To Scan Page
                      </button>
                    )}
                    {!searchTerm && isPublicView && (
                      <button type="button" className="empty-action-btn action-signin" onClick={openSignInModal}>
                        Sign In
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default ScanHistoryPage;
