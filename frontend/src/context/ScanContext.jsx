import React, { createContext, useContext, useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import realScanService from "../services/realScanService";
import databaseService from "../services/databaseService";
import { normalizeExtensionId } from "../utils/extensionId";
import { getScanResultsRoute } from "../utils/slug";
import { useAuth } from "./AuthContext";

// User-friendly message for service unavailability (matches backend)
const SERVICE_UNAVAILABLE_MESSAGE = "ExtensionShield is temporarily unavailable. We're working to restore service and will be back shortly. Please try again in a few minutes.";

const ScanContext = createContext(null);

// Context modules co-locate the Provider and its hook by design; this is the
// canonical React pattern. react-refresh/only-export-components is a Fast-Refresh
// DX heuristic, not a correctness check, so a scoped disable is the right choice.
// eslint-disable-next-line react-refresh/only-export-components
export const useScan = () => {
  const context = useContext(ScanContext);
  if (!context) {
    throw new Error("useScan must be used within a ScanProvider");
  }
  return context;
};

export const ScanProvider = ({ children }) => {
  const navigate = useNavigate();
  const { isAuthenticated, accessToken, openSignInModal } = useAuth();

  // Mount guard — prevents setState on unmounted component during long async flows
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  
  // Scan state
  const [url, setUrl] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanStage, setScanStage] = useState(null);
  const [scanResults, setScanResults] = useState(null);
  const [error, setError] = useState(null);
  const [currentExtensionId, setCurrentExtensionId] = useState(null);
  
  // Dashboard stats
  const [dashboardStats, setDashboardStats] = useState({
    totalScans: { value: 0, sparkline: [0] },
    highRisk: { value: 0, sparkline: [0] },
    totalFiles: { value: 0, sparkline: [0] },
    totalVulnerabilities: { value: 0, sparkline: [0] },
  });

  // Scan history
  const [scanHistory, setScanHistory] = useState([]);

  // Load dashboard stats
  const loadDashboardStats = useCallback(async () => {
    try {
      const metrics = await databaseService.getDashboardMetrics();
      setDashboardStats(metrics);
    } catch (err) {
      // console.error("Error loading dashboard stats:", err); // prod: no console
    }
  }, []);

  // Load scan history (only when authenticated to avoid 401 in console)
  const loadScanHistory = useCallback(async () => {
    if (!isAuthenticated) {
      setScanHistory([]);
      return [];
    }
    try {
      const history = await databaseService.getScanHistory(50, accessToken);
      setScanHistory(history);
      return history;
    } catch (err) {
      setScanHistory([]);
      return [];
    }
  }, [isAuthenticated, accessToken]);

  // Extract extension ID from URL
  const extractExtensionId = useCallback((url) => {
    return realScanService.extractExtensionId(url);
  }, []);

  // Wait for scan completion by polling status. Uses a long timeout so heavy extensions
  // (VirusTotal, LLM, etc.) can finish; the progress page shows "Scan in progress" meanwhile.
  const waitForScanCompletion = useCallback(async (extensionId) => {
    const POLL_INTERVAL_MS = 2500;
    const MAX_WAIT_MS = 10 * 60 * 1000; // 10 minutes — backend can take several minutes for large extensions
    const start = Date.now();
    let lastStageIndex = -1;
    const stages = [
      "extracting",
      "security_scan",
      "building_evidence",
      "applying_rules",
      "generating_report",
    ];

    while (Date.now() - start < MAX_WAIT_MS) {
      if (!mountedRef.current) return;

      // Advance displayed stage roughly every 90s so the UI doesn't look stuck
      const elapsed = Date.now() - start;
      const stageIndex = Math.min(
        Math.floor(elapsed / 90000),
        stages.length - 1
      );
      if (stageIndex !== lastStageIndex) {
        lastStageIndex = stageIndex;
        setScanStage(stages[stageIndex]);
      }

      const status = await realScanService.checkScanStatus(extensionId);
      if (!mountedRef.current) return;

      if (status.scanned) {
        setScanStage("generating_report");
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return;
      }

      if (status.status === "failed") {
        if (
          status.error_code === 401 ||
          status.error_code === 503 ||
          status.error_code === 403 ||
          status.error?.includes("API key") ||
          status.error?.includes("Invalid API key") ||
          status.error?.includes("Authentication") ||
          status.error?.includes("sk-proj") ||
          status.error?.includes("Connection refused") ||
          status.error?.includes("Errno 61") ||
          status.error?.includes("LLM service") ||
          status.error?.includes("quota") ||
          status.error?.includes("token_quota") ||
          status.error?.includes("SERVICE_UNAVAILABLE") ||
          status.error?.includes("temporarily unavailable")
        ) {
          throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
        }
        throw new Error(status.error || "Scan failed on the server.");
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    const status = await realScanService.checkScanStatus(extensionId);
    if (status.scanned) return;

    throw new Error("Scan timeout - extension analysis took too long");
  }, []);

  // Start scan from URL
  const startScan = useCallback(async (scanUrl, options = {}) => {
    const urlToScan = scanUrl || url;
    
    if (!urlToScan.trim()) {
      setError("Please enter a Chrome Web Store URL");
      return;
    }

    // No authentication required for scanning - anonymous users can scan with IP-based rate limiting
    // Authentication is only required to view saved scan history

    // Clear input state so /scan page starts clean after scan completes
    setUrl("");
    setIsScanning(true);
    setError(null);
    setScanResults(null);
    setCurrentExtensionId(null);
    setScanStage("extracting");

    try {
      const extIdRaw = extractExtensionId(urlToScan);
      if (!extIdRaw) {
        throw new Error("Invalid Chrome Web Store URL format");
      }

      // Normalize the extension ID to ensure it's exactly 32 chars (a-p) and remove any trailing characters
      const extId = normalizeExtensionId(extIdRaw);
      if (!extId) {
        throw new Error("Invalid Chrome extension ID format");
      }

      setCurrentExtensionId(extId);

      // Fetch-first: if extension was already scanned, use cached results and skip trigger (minimal delay).
      const existingResults = await realScanService.getRealScanResults(extId);
      if (existingResults) {
        const syncCachedScanPromise = isAuthenticated
          ? realScanService.triggerScan(urlToScan).catch(() => null)
          : Promise.resolve(null);

        navigate(`/scan/progress/${extId}`, {
          state: {
            extensionName: options.extensionName ?? undefined,
            extensionLogoUrl: options.extensionLogoUrl ?? undefined,
          },
        });
        setScanResults(existingResults);
        setError("");
        setScanStage(null);
        setIsScanning(false);
        void syncCachedScanPromise.then(() =>
          Promise.all([loadScanHistory(), loadDashboardStats()])
        );
        return;
      }

      // Daily scan limit check (cached lookups still allowed) - skip in development
      const isDev = import.meta.env.DEV || import.meta.env.MODE === 'development';
      if (!isDev) {
        try {
          const limit = await realScanService.getDeepScanLimitStatus();
          if (limit?.remaining <= 0) {
            const cached = await realScanService.hasCachedResults(extId);
            if (!cached) {
              // If user is not authenticated, prompt them to sign in (anonymous = 1 scan)
              if (!isAuthenticated) {
                setError("You've reached your daily scan limit (1 scan). Sign in to get more scans or try again tomorrow.");
                setScanStage(null);
                setIsScanning(false);
                // Open sign-in modal to prompt user to log in
                if (openSignInModal) {
                  openSignInModal();
                }
                return;
              }
              setError("Daily scan limit reached (3 scans per day). Try again tomorrow.");
              setScanStage(null);
              setIsScanning(false);
              return;
            }
          }
        } catch (e) {
          // If the limit check fails, fall back to backend enforcement.
        }
      }

      // Navigate to the progress/game screen ASAP for best UX.
      // The progress page will poll status until the scan is running/completed.
      navigate(`/scan/progress/${extId}`, {
        state: {
          extensionName: options.extensionName ?? undefined,
          extensionLogoUrl: options.extensionLogoUrl ?? undefined,
        },
      });

      // Trigger scan (backend returns immediately with already_scanned if cached)
      const scanTrigger = await realScanService.triggerScan(urlToScan);

      if (!scanTrigger.already_scanned && scanTrigger.status !== "running" && scanTrigger.status !== "completed") {
        throw new Error(scanTrigger.error || "Failed to start scan");
      }

      if (!scanTrigger.already_scanned && scanTrigger.status !== "completed") {
        await waitForScanCompletion(extId);
      }

      // Fetch results (via realScanService.getRealScanResults → GET /api/scan/results/:id)
      const maxAttempts = 10;
      let results = null;
      for (let i = 0; i < maxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        results = await realScanService.getRealScanResults(extId);
        if (results) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      // Results are already in correct format (no transformation needed)
      setScanResults(results);
      setError("");
      setScanStage(null);
      setIsScanning(false);

      // Refresh stats and history in parallel (best-effort, non-blocking)
      void Promise.all([loadScanHistory(), loadDashboardStats()]);

      // IMPORTANT: Do not auto-navigate to results.
      // The progress page will show a "Scan complete" prompt allowing users
      // to keep playing or view results.
    } catch (err) {
      // Handle different error types with user-friendly messages
      let errorMessage = err.message || "Failed to scan extension.";
      let shouldPromptLogin = false;
      
      // Check if error response includes requires_login flag (from backend)
      const requiresLogin = err.detail?.requires_login || err.requires_login;
      
      // Rate limit error (429) - daily scan limit reached (use backend message if present)
      if (err.status === 429 || err.message?.includes("Daily scan limit") || err.message?.includes("DAILY_DEEP_SCAN_LIMIT") || err.message?.includes("daily scan limit")) {
        if (!isAuthenticated) {
          errorMessage = err.detail?.message || "You've reached your daily scan limit (1 scan). Sign in to get more scans or try again tomorrow.";
          shouldPromptLogin = true;
        } else {
          errorMessage = err.detail?.message || "Daily scan limit reached (3 scans per day). Try again tomorrow.";
        }
      } else if (
        err.message?.includes("API key") || 
        err.message?.includes("Invalid API key") || 
        err.message?.includes("Authentication") || 
        err.message?.includes("401") ||
        err.message?.includes("SERVICE_UNAVAILABLE") ||
        err.message?.includes("temporarily unavailable")
      ) {
        errorMessage = SERVICE_UNAVAILABLE_MESSAGE;
      } else if (
        err.message?.includes("Connection refused") || 
        err.message?.includes("Errno 61") || 
        err.message?.includes("LLM service") ||
        err.message?.includes("connection error") ||
        err.message?.includes("network")
      ) {
        errorMessage = SERVICE_UNAVAILABLE_MESSAGE;
      } else if (err.message?.includes("quota") || err.message?.includes("token_quota") || err.message?.includes("403")) {
        errorMessage = SERVICE_UNAVAILABLE_MESSAGE;
      }
      
      setError(errorMessage);
      setScanStage(null);
      setIsScanning(false);
      
      // Open sign-in modal if user needs to log in
      if ((shouldPromptLogin || requiresLogin) && !isAuthenticated && openSignInModal) {
        openSignInModal();
      }
      // Stay on progress page to show error
    }
  }, [url, extractExtensionId, navigate, waitForScanCompletion, loadScanHistory, loadDashboardStats, isAuthenticated, openSignInModal]);

  // Handle file upload
  // No authentication required - anonymous users can upload with IP-based rate limiting
  const handleFileUpload = useCallback(async (file) => {
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development';

    setUrl("");
    setIsScanning(true);
    setError(null);
    setScanResults(null);
    setCurrentExtensionId(null);
    setScanStage("extracting");

    try {
      // Daily scan limit check (uploads are always deep scans) - skip in development
      if (!isDevelopment) {
        try {
          const limit = await realScanService.getDeepScanLimitStatus();
          if (limit?.remaining <= 0) {
            // If user is not authenticated, prompt them to sign in
            if (!isAuthenticated) {
              setError("You've reached your daily scan limit (1 scan). Sign in to get more scans or try again tomorrow.");
              setScanStage(null);
              setIsScanning(false);
              // Open sign-in modal to prompt user to log in
              if (openSignInModal) {
                openSignInModal();
              }
              return;
            }
            setError("Daily scan limit reached (3 scans per day). Try again tomorrow.");
            setScanStage(null);
            setIsScanning(false);
            return;
          }
        } catch (e) {
          // If the limit check fails, fall back to backend enforcement.
        }
      }

      const uploadResult = await realScanService.uploadAndScan(file);

      if (!uploadResult || !uploadResult.extension_id) {
        throw new Error("Failed to upload file");
      }

      // Use scan ID: Chrome extension ID (32 a-p) or upload scan ID (UUID)
      // For uploads, the backend returns a UUID - use it directly
      const extensionId = uploadResult.extension_id;
      if (!extensionId) {
        throw new Error("Invalid extension ID from upload");
      }

      setCurrentExtensionId(extensionId);

      // Same route as URL scans: /scan/progress/:scanId then /scan/results/:scanId
      navigate(`/scan/progress/${extensionId}`);

      await waitForScanCompletion(extensionId);

      // Via realScanService.getRealScanResults → GET /api/scan/results/:id
      const maxAttempts = 10;
      let results = null;
      for (let i = 0; i < maxAttempts; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        results = await realScanService.getRealScanResults(extensionId);
        if (results) break;
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      // Results are already in correct format (no transformation needed)
      setScanResults(results);
      setError("");
      setScanStage(null);
      setIsScanning(false);

      void Promise.all([loadScanHistory(), loadDashboardStats()]);
      // Do not auto-navigate; progress page will prompt.
    } catch (err) {
      // Handle rate limit error (429) with user-friendly message
      let errorMessage = err.message || "Failed to upload and scan file.";
      let shouldPromptLogin = false;
      
      // Check if error response includes requires_login flag (from backend)
      const requiresLogin = err.detail?.requires_login || err.requires_login;
      
      if (err.status === 429 || err.message?.includes("Daily scan limit") || err.message?.includes("DAILY_DEEP_SCAN_LIMIT") || err.message?.includes("daily scan limit")) {
        if (!isAuthenticated) {
          errorMessage = err.detail?.message || "You've reached your daily scan limit (1 scan). Sign in to get more scans or try again tomorrow.";
          shouldPromptLogin = true;
        } else {
          errorMessage = err.detail?.message || "Daily scan limit reached (3 scans per day). Try again tomorrow.";
        }
      } else if (
        err.message?.includes("API key") || 
        err.message?.includes("SERVICE_UNAVAILABLE") ||
        err.message?.includes("temporarily unavailable") ||
        err.message?.includes("Connection refused") ||
        err.message?.includes("connection error")
      ) {
        errorMessage = SERVICE_UNAVAILABLE_MESSAGE;
      }
      
      setError(errorMessage);
      setScanStage(null);
      setIsScanning(false);
      
      // Open sign-in modal if user needs to log in
      if ((shouldPromptLogin || requiresLogin) && !isAuthenticated && openSignInModal) {
        openSignInModal();
      }
    }
  }, [navigate, waitForScanCompletion, loadScanHistory, loadDashboardStats, isAuthenticated, openSignInModal]);

  // Load scan from history (single API: realScanService.getRealScanResults)
  const loadScanFromHistory = useCallback(async (extId, extensionName) => {
    try {
      const data = await realScanService.getRealScanResults(extId);
      if (!data) {
        setError("Scan results not found.");
        return;
      }
      setScanResults(data);
      setCurrentExtensionId(extId);
      setError("");
      const route = getScanResultsRoute(extId, extensionName || data?.extension_name);
      navigate(route);
    } catch (err) {
      setError("Failed to load scan results from history.");
    }
  }, [navigate]);

  // Load results by extension ID or slug (single API: realScanService.getRealScanResults)
  // Uses cached results when already loaded for this extension (e.g. after completing a scan).
  // Uses a ref for the cache check to avoid recreating this callback on every state change,
  // which would cause infinite re-render loops in consuming useEffects.
  const currentExtensionIdRef = useRef(currentExtensionId);
  const scanResultsRef = useRef(scanResults);
  currentExtensionIdRef.current = currentExtensionId;
  scanResultsRef.current = scanResults;

  const loadResultsById = useCallback(async (extId) => {
    try {
      // If we already have results for this identifier, return without refetching.
      // Check both the raw identifier and the resolved extension_id from prior results.
      const cachedId = currentExtensionIdRef.current;
      const cachedResults = scanResultsRef.current;
      if (cachedResults && (extId === cachedId || extId === cachedResults.extension_id)) {
        return cachedResults;
      }

      setScanResults(null);
      setCurrentExtensionId(extId);
      setError("");

      const data = await realScanService.getRealScanResults(extId);
      if (!data) {
        setError("Scan results not found. The extension may not have been scanned yet.");
        return null;
      }
      setScanResults(data);
      // Store the real extension_id from backend response so subsequent cache checks
      // match even when the page was loaded via slug URL.
      const resolvedId = data.extension_id || extId;
      setCurrentExtensionId(resolvedId);
      return data;
    } catch (err) {
      setError("Failed to load scan results.");
      return null;
    }
  }, []);

  // Clear scan state
  const clearScan = useCallback(() => {
    setUrl("");
    setIsScanning(false);
    setScanStage(null);
    setScanResults(null);
    setError(null);
    setCurrentExtensionId(null);
  }, []);

  const value = useMemo(() => ({
    // State
    url,
    setUrl,
    isScanning,
    scanStage,
    scanResults,
    setScanResults,
    error,
    setError,
    currentExtensionId,
    setCurrentExtensionId,
    dashboardStats,
    scanHistory,
    
    // Actions
    startScan,
    handleFileUpload,
    loadScanFromHistory,
    loadResultsById,
    loadDashboardStats,
    loadScanHistory,
    extractExtensionId,
    clearScan,
  }), [
    url, isScanning, scanStage, scanResults, error,
    currentExtensionId, setCurrentExtensionId, dashboardStats, scanHistory,
    startScan, handleFileUpload, loadScanFromHistory,
    loadResultsById, loadDashboardStats, loadScanHistory,
    extractExtensionId, clearScan,
  ]);

  return (
    <ScanContext.Provider value={value}>
      {children}
    </ScanContext.Provider>
  );
};

export default ScanContext;
