import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { useScan } from "../../context/ScanContext";
import realScanService from "../../services/realScanService";
import { getScanResultsRoute } from "../../utils/slug";
import SEOHead from "../../components/SEOHead";
import { normalizeExtensionId } from "../../utils/extensionId";
import { doesScanResultMatchIdentifier } from "../../utils/scanResultIdentity";
import { logger } from "../../utils/logger";
import ScanActivityIndicator from "../../components/ScanActivityIndicator";
import "./ScanProgressPage.scss";

const ScanProgressPage = () => {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Read scanId from any possible param key (scanId, extensionId, id)
  const rawScanId = params.scanId || params.extensionId || params.id || '';
  
  // Use Chrome extension ID (32 a-p) or upload scan ID (UUID) from URL
  // normalizeExtensionId now handles both formats
  const scanId = normalizeExtensionId(rawScanId) || rawScanId;
  
  // Dev-only logging
  useEffect(() => {
    if (import.meta.env.DEV) {
      logger.log("[ScanProgressPage] Params:", params);
      logger.log("[ScanProgressPage] Raw scanId:", rawScanId);
      logger.log("[ScanProgressPage] Normalized scanId:", scanId);
    }
  }, [params, rawScanId, scanId]);
  const {
    scanStage,
    error,
    setError,
    setScanResults,
    setCurrentExtensionId,
    scanResults,
    currentExtensionId,
    startScan,
  } = useScan();

  const [extensionName, setExtensionName] = useState(null);
  const [alreadyScanned, setAlreadyScanned] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const hasSeenInProgressRef = useRef(false);
  const startTimeRef = useRef(Date.now());

  // Show progress feedback while a scan runs, and stop with a clear message
  // instead of spinning forever if a scan never reports back.
  const SOFT_NUDGE_SEC = 120;   // after 2 min, offer "try again"
  const HARD_TIMEOUT_SEC = 300; // after 5 min, show a terminal state
  const formatElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // Apply extension name from location state immediately.
  useEffect(() => {
    if (!scanId) return;
    const stateName = location.state?.extensionName;
    if (stateName != null) setExtensionName(stateName);
  }, [scanId, location.state]);

  // Fetch extension name when available while the scan is running.
  useEffect(() => {
    if (!scanId) return;
    let cancelled = false;

    const fetchExtensionInfo = async () => {
      try {
        const results = await realScanService.getRealScanResults(scanId);
        if (cancelled) return;
        if (results?.extension_name) {
          setExtensionName(results.extension_name);
        } else if (results?.metadata?.title) {
          setExtensionName(results.metadata.title);
        }
      } catch (e) {
        // Silently fail - results might not exist yet (scan still running)
      }
    };
    fetchExtensionInfo();

    return () => { cancelled = true; };
  }, [scanId]);

  // When results were already loaded (e.g. fetch-first cached path), skip polling and go to results.
  useEffect(() => {
    if (!scanId || !scanResults) return;
    if (!doesScanResultMatchIdentifier(scanResults, scanId, currentExtensionId)) return;
    const route = getScanResultsRoute(scanId, scanResults.extension_name);
    if (route) navigate(route, { replace: true });
  }, [scanId, scanResults, currentExtensionId, navigate]);

  // Poll scan status while on this page (supports direct refresh/back navigation)
  // Stops polling once scan completes or fails to save server resources.
  // Also detects "already scanned" extensions (first poll returns scanned=true
  // before any in-progress state was observed).
  useEffect(() => {
    if (!scanId) return;
    if (timedOut) return;  // stop polling once we've shown the terminal timeout state
    // If we already have results for this scan (e.g. fetch-first), don't poll.
    if (doesScanResultMatchIdentifier(scanResults, scanId, currentExtensionId)) return;

    let cancelled = false;
    let intervalId = null;

    const checkStatus = async () => {
      if (cancelled) return;

      try {
        const status = await realScanService.checkScanStatus(scanId);
        if (cancelled) return;

        // Check for API key errors (401)
        if (status.error_code === 401 || (status.status === "failed" && (status.error?.includes("API key") || status.error?.includes("Connection is down")))) {
          setError("Connection is down try back in a while");
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
          return;
        }
        if (status.status === "failed") {
          if (status.error) setError(status.error);
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
          // Fetch partial results when available (API returns scoring_v2, report_view_model even on failure)
          try {
            const results = await realScanService.getRealScanResults(scanId);
            if (!cancelled && results) setScanResults(results);
          } catch (_e) {
            // Results may not be ready yet
          }
          return;
        }

        // Track whether we've ever seen an in-progress (non-complete) state.
        if (!status.scanned) {
          hasSeenInProgressRef.current = true;
        }

        if (status.scanned) {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }

          const wasAlreadyScanned = !hasSeenInProgressRef.current;
          if (wasAlreadyScanned) {
            setAlreadyScanned(true);
          }

          // Fetch results then auto-redirect to results page (no "View Results" step).
          try {
            const results = await realScanService.getRealScanResults(scanId);
            if (!cancelled && results) {
              setScanResults(results);
              setCurrentExtensionId(scanId);
            }
            const extId = results?.extension_id || scanId;
            const extName = results?.extension_name;
            const route = getScanResultsRoute(extId, extName);
            if (route) navigate(route, { replace: true });
          } catch (_e) {
            const route = getScanResultsRoute(scanId);
            if (route) navigate(route, { replace: true });
          }
        }
      } catch (e) {
        if (cancelled) return;
        if (e.message?.includes("401") || e.message?.includes("API key") || e.message?.includes("Connection is down")) {
          setError("Connection is down try back in a while");
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
      }
    };

    // Kick once immediately and then poll
    checkStatus();
    intervalId = setInterval(checkStatus, 2500);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [scanId, navigate, setError, setScanResults, setCurrentExtensionId, scanResults, currentExtensionId, timedOut]);

  // Reset state when scanId changes or on mount
  useEffect(() => {
    if (scanId) {
      setAlreadyScanned(false);
      hasSeenInProgressRef.current = false;
      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setTimedOut(false);
    }
  }, [scanId]);

  // Tick the elapsed timer while scanning; flip to a terminal state after the
  // hard timeout so the page never spins forever (e.g. when a scan is lost).
  useEffect(() => {
    if (!scanId || errorMessage || timedOut) return;
    if (doesScanResultMatchIdentifier(scanResults, scanId, currentExtensionId)) return;
    const id = setInterval(() => {
      const sec = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSec(sec);
      if (sec >= HARD_TIMEOUT_SEC) setTimedOut(true);
    }, 1000);
    return () => clearInterval(id);
  }, [scanId, errorMessage, timedOut, scanResults, currentExtensionId, HARD_TIMEOUT_SEC]);

  const handleRetry = useCallback(() => {
    setTimedOut(false);
    setErrorMessage("");
    setError(null);
    setElapsedSec(0);
    startTimeRef.current = Date.now();
    hasSeenInProgressRef.current = false;
    if (/^[a-p]{32}$/.test(scanId) && typeof startScan === "function") {
      startScan(`https://chromewebstore.google.com/detail/${scanId}`);
    } else {
      navigate("/scan");
    }
  }, [scanId, startScan, setError, navigate]);

  const shouldShowLoading = !!scanId;

  // Handle errors (show inline on progress page)
  useEffect(() => {
    if (error && shouldShowLoading) {
      let displayError = error;
      if (error.includes("API key") || error.includes("Invalid API key") || error.includes("Authentication") || error.includes("401") || error.includes("sk-proj")) {
        displayError = "Connection is down try back in a while";
      }
      setErrorMessage(displayError);
    }
  }, [error, shouldShowLoading]);

  // Catch any unhandled errors (parsing, network, etc.)
  useEffect(() => {
    const handleError = (event) => {
      if (shouldShowLoading) {
        let errorMsg = "Something went wrong";
        
        // Handle different error types
        if (event.error) {
          errorMsg = event.error?.message || String(event.error);
        } else if (event.message) {
          errorMsg = event.message;
        }
        
        // Check for common error patterns
        if (errorMsg.includes("401") || errorMsg.includes("API key") || errorMsg.includes("Invalid API key") || errorMsg.includes("Connection is down")) {
          errorMsg = "Connection is down try back in a while";
        } else if (errorMsg.includes("quota") || errorMsg.includes("token_quota") || (errorMsg.includes("403") && errorMsg.includes("token"))) {
          errorMsg = "Scan analysis quota exceeded. Check your provider limits or try again later.";
        } else if (errorMsg.includes("Connection refused") || errorMsg.includes("Errno 61") || errorMsg.includes("LLM service")) {
          errorMsg = "Scan analysis service unavailable. Check your provider configuration.";
        } else if (errorMsg.includes("JSON") || errorMsg.includes("parse")) {
          errorMsg = "Failed to parse server response. The scan may still be running.";
        } else if (errorMsg.includes("fetch") || errorMsg.includes("network") || errorMsg.includes("Failed to fetch")) {
          errorMsg = "Network error occurred. Check your connection and try again.";
        }
        
        setErrorMessage(errorMsg);
        event.preventDefault();
      }
    };

    const handleUnhandledRejection = (event) => {
      if (shouldShowLoading) {
        let errorMsg = "Something went wrong";
        
        if (event.reason) {
          if (typeof event.reason === "string") {
            errorMsg = event.reason;
          } else if (event.reason?.message) {
            errorMsg = event.reason.message;
          } else {
            errorMsg = String(event.reason);
          }
        }
        
        // Check for API key errors first
        if (errorMsg.includes("401") || errorMsg.includes("API key") || errorMsg.includes("Invalid API key") || errorMsg.includes("Authentication") || errorMsg.includes("sk-proj") || errorMsg.includes("Connection is down")) {
          errorMsg = "Connection is down try back in a while";
        } else if (errorMsg.includes("quota") || errorMsg.includes("token_quota") || (errorMsg.includes("403") && errorMsg.includes("token"))) {
          errorMsg = "Scan analysis quota exceeded. Check your provider limits or try again later.";
        } else if (errorMsg.includes("Connection refused") || errorMsg.includes("Errno 61") || errorMsg.includes("LLM service")) {
          errorMsg = "Scan analysis service unavailable. Check your provider configuration.";
        } else if (errorMsg.includes("JSON") || errorMsg.includes("parse")) {
          errorMsg = "Failed to parse server response. The scan may still be running.";
        } else if (errorMsg.includes("fetch") || errorMsg.includes("network") || errorMsg.includes("Failed to fetch")) {
          errorMsg = "Network error occurred. Check your connection and try again.";
        }
        
        setErrorMessage(errorMsg);
        event.preventDefault();
      }
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [shouldShowLoading]);

  const handleDismissError = useCallback(() => {
    setError(null);
    setErrorMessage("");
  }, [setError]);

  // Always render something - never show blank page
  // Show error if normalized ID is empty (invalid format or missing)
  if (!scanId) {
    if (import.meta.env.DEV) {
      logger.warn("[ScanProgressPage] No valid scanId found. Raw params:", params);
    }
    return (
      <div className="scan-progress-page">
        <div className="progress-container">
          <div className="no-scan-state">
            <div className="no-scan-icon">⚠️</div>
            <h2>Invalid Scan ID</h2>
            <p>
              {rawScanId 
                ? `The scan ID "${rawScanId}" is not in a valid format. Expected a Chrome extension ID (32 characters a-p) or upload scan UUID.`
                : "No scan ID provided in the URL."}
            </p>
            <Button onClick={() => navigate("/scan")} variant="default">
              Go to Scanner
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const showLoadingScreen = shouldShowLoading;
  const hasError = Boolean(errorMessage);
  const scanMeta = extensionName
    ? `${extensionName} · ${alreadyScanned ? "cached result found" : "live scan"}`
    : (alreadyScanned ? "Cached result found" : null);
  // Only show meta when we have extension name or cached result; never show scan ID at bottom

  // Friendly message for download/extension fetch failures (no internal service names)
  const isDownloadError =
    hasError &&
    errorMessage.includes("download") &&
    (errorMessage.includes("failed") || errorMessage.includes("returned no file") || errorMessage.includes("sources failed"));
  const displayError = hasError
    ? (isDownloadError ? "We couldn't download the extension package. Scores below are based on store data only." : errorMessage)
    : "";

  return (
    <>
      <SEOHead
        title="Scan in progress"
        description="Extension scan in progress."
        pathname={location.pathname}
        noindex
      />
      <div className="scan-progress-page">
        {showLoadingScreen ? (
        <>
          {!hasError && timedOut && (
            <div className="scan-progress-center" style={{ textAlign: "center" }}>
              <h2 style={{ marginBottom: "0.5rem" }}>We couldn't finish this scan</h2>
              <p style={{ color: "var(--extensionshield-text-muted)", maxWidth: "440px", margin: "0 auto 1.25rem" }}>
                The scan didn't complete. This can happen with a very large extension or a busy server.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center" }}>
                <Button onClick={handleRetry} variant="default">Try again</Button>
                <Button onClick={() => navigate("/scan")} variant="outline">Back to scan</Button>
              </div>
            </div>
          )}

          {!hasError && !timedOut && (
          <div className="scan-progress-center">
            <ScanActivityIndicator
              title="Scan in progress"
              stage={scanStage}
              meta={scanMeta}
            />
            <div style={{ marginTop: "1rem", textAlign: "center" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 12px", borderRadius: "999px", border: "1px solid var(--extensionshield-border)", fontSize: "0.85rem", color: "var(--extensionshield-text-muted)" }}>
                Elapsed {formatElapsed(elapsedSec)}
              </span>
              <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "var(--extensionshield-text-muted)" }}>
                Large or busy extensions can take a few minutes.
              </p>
              {elapsedSec >= SOFT_NUDGE_SEC && (
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "center", fontSize: "0.85rem", color: "var(--extensionshield-text-muted)" }}>
                  <span>Taking longer than usual.</span>
                  <Button onClick={handleRetry} variant="outline" style={{ padding: "4px 12px" }}>Try again</Button>
                </div>
              )}
            </div>
          </div>
          )}

          {displayError && (
            <div className="scan-progress-inline-error">
              <h3>Something went wrong</h3>
              <p>{displayError}</p>
              <div className="scan-progress-inline-error-actions">
                <Button onClick={handleDismissError} variant="default">
                  Dismiss
                </Button>
                <Button
                  onClick={() => {
                    navigate(getScanResultsRoute(scanId));
                  }}
                  variant="secondary"
                >
                  View Partial Report
                </Button>
                <Button onClick={() => navigate("/scan")} variant="outline">
                  Go to Scanner
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="progress-container" />
      )}
      </div>
    </>
  );
};

export default ScanProgressPage;
