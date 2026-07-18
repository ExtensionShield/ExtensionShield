import { getScanResultsUrl } from "../utils/constants";
import { fetchJson, buildFetchError } from "./requestHelpers";

// User-friendly message for service unavailability
const SERVICE_UNAVAILABLE_MESSAGE = "ExtensionShield is temporarily unavailable. We're working to restore service and will be back shortly. Please try again in a few minutes.";

class RealScanService {
  constructor() {
    // Use environment variable for API URL, default to empty string for same-origin (production)
    // For local development, set VITE_API_URL=http://localhost:8007 in .env.local
    this.baseURL = import.meta.env.VITE_API_URL || "";
    this.userIdStorageKey = "extensionshield_user_id";
    this.accessToken = null;
    // In-flight request deduplication to prevent duplicate API calls
    // from concurrent polling loops (ScanContext + ScanProgressPage).
    this._inflightStatus = new Map();  // extensionId → Promise
    this._inflightResults = new Map(); // extensionId → Promise
  }

  getOrCreateUserId() {
    try {
      const existing = localStorage.getItem(this.userIdStorageKey);
      if (existing) return existing;

      const id =
        (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function")
          ? globalThis.crypto.randomUUID()
          : `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(this.userIdStorageKey, id);
      return id;
    } catch (e) {
      // If localStorage is unavailable, fall back to an ephemeral id.
      return `anon-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  getUserHeaders() {
    return { "X-User-Id": this.getOrCreateUserId() };
  }

  setAccessToken(token) {
    this.accessToken = token || null;
  }

  getAuthHeaders() {
    if (!this.accessToken) return {};
    return { Authorization: `Bearer ${this.accessToken}` };
  }

  getRequestHeaders() {
    return { ...this.getUserHeaders(), ...this.getAuthHeaders() };
  }

  // Admin force-rescan token. An admin sets it once via the browser console:
  //   localStorage.setItem('es_rescan_admin_token', '<RESCAN_ADMIN_TOKEN>')
  // It is sent only on force rescans and the server still verifies it matches
  // RESCAN_ADMIN_TOKEN, so possession alone grants nothing without the server env.
  getAdminRescanToken() {
    try {
      return (localStorage.getItem("es_rescan_admin_token") || "").trim();
    } catch {
      return "";
    }
  }

  // Extract extension ID from Chrome Web Store URL
  extractExtensionId(url) {
    const match = url.match(/\/detail\/(?:[^/]+\/)?([a-z]{32})/);
    return match ? match[1] : null;
  }

  async getDeepScanLimitStatus() {
    const CACHE_MS = 60 * 1000;
    const now = Date.now();
    if (this._deepScanLimitCache && now - this._deepScanLimitCacheAt < CACHE_MS) {
      return this._deepScanLimitCache;
    }
    const { response, body } = await fetchJson(`${this.baseURL}/api/limits/deep-scan`, {
      method: "GET",
      headers: {
        ...this.getRequestHeaders(),
      },
    });

    if (!response.ok) {
      throw buildFetchError(response, body, "Failed to fetch deep-scan limit status");
    }

    this._deepScanLimitCache = body;
    this._deepScanLimitCacheAt = Date.now();
    return body;
  }

  async hasCachedResults(extensionId) {
    try {
      const url = getScanResultsUrl(extensionId);
      if (!url) return false;
      const response = await fetch(url, {
        method: "GET",
        headers: { ...this.getRequestHeaders() },
      });
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  // Trigger a scan for an extension URL. Pass { force: true } to bypass the cached
  // fast path and force a fresh deep scan — server-gated: honored only in dev or
  // when the admin rescan token matches RESCAN_ADMIN_TOKEN, ignored otherwise.
  async triggerScan(url, { force = false, historyRefresh = false } = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...this.getRequestHeaders(),
    };
    const adminToken = force ? this.getAdminRescanToken() : "";
    if (adminToken) headers["X-Admin-Rescan-Token"] = adminToken;

    const payload = { url };
    if (force) payload.force = true;
    if (historyRefresh) payload.history_refresh = true;

    const { response, body } = await fetchJson(`${this.baseURL}/api/scan/trigger`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return body;
    }

    throw buildFetchError(response, body, "Failed to trigger scan");
  }

  // Upload and scan a CRX/ZIP file
  async uploadAndScan(file) {
    const formData = new FormData();
    formData.append("file", file);

    const { response, body } = await fetchJson(`${this.baseURL}/api/scan/upload`, {
      method: "POST",
      headers: {
        ...this.getRequestHeaders(),
      },
      body: formData,
    });

    if (response.ok) {
      return body;
    }

    throw buildFetchError(response, body, "Failed to upload file");
  }

  // Get real scan results from CLI analysis.
  // Single API: GET /api/scan/results/{extensionId} (URL from constants).
  // Returns payload as-is from backend (no legacy transformation).
  async getRealScanResults(extensionId) {
    // Deduplicate concurrent calls for the same extensionId
    if (this._inflightResults.has(extensionId)) {
      return this._inflightResults.get(extensionId);
    }
    const promise = this._getRealScanResultsInner(extensionId);
    this._inflightResults.set(extensionId, promise);
    promise.finally(() => this._inflightResults.delete(extensionId));
    return promise;
  }

  async _getRealScanResultsInner(extensionId) {
    const url = getScanResultsUrl(extensionId);
    if (!url) return null;
    const { response, body } = await fetchJson(url, {
      headers: {
        ...this.getRequestHeaders(),
      },
    });

    if (response.ok) {
      return body;
    }

    if (response.status === 404) {
      return null;
    }

    throw buildFetchError(response, body, "Failed to fetch scan results");
  }

  async checkScanStatus(extensionId) {
    // Deduplicate: if a request for the same extensionId is already in-flight, reuse it.
    if (this._inflightStatus.has(extensionId)) {
      return this._inflightStatus.get(extensionId);
    }
    const promise = this._checkScanStatusInner(extensionId);
    this._inflightStatus.set(extensionId, promise);
    promise.finally(() => this._inflightStatus.delete(extensionId));
    return promise;
  }

  async _checkScanStatusInner(extensionId) {
    const url = `${this.baseURL}/api/scan/status/${extensionId}`;
    try {
      const { response, body } = await fetchJson(url);
      const data = body || {};

      if (response.ok) {
        // Check for service errors and return user-friendly message
        if (
          data.error &&
          (data.error_code === 401 ||
            data.error_code === 503 ||
            data.error?.includes("API key") ||
            data.error?.includes("Invalid API key") ||
            data.error?.includes("SERVICE_UNAVAILABLE") ||
            data.error?.includes("temporarily unavailable"))
        ) {
          return {
            scanned: false,
            status: "failed",
            error: SERVICE_UNAVAILABLE_MESSAGE,
            error_code: 503,
          };
        }
        return data;
      }

      // Handle service unavailability errors
      if (response.status === 401 || response.status === 503) {
        return {
          scanned: false,
          status: "failed",
          error: SERVICE_UNAVAILABLE_MESSAGE,
          error_code: 503,
        };
      }

      return { scanned: false };
    } catch (error) {
      // All network/connection errors should show user-friendly message
      if (
        error?.message?.includes("fetch") ||
        error?.message?.includes("network") ||
        error?.message?.includes("Failed to fetch")
      ) {
        return {
          scanned: false,
          status: "failed",
          error: SERVICE_UNAVAILABLE_MESSAGE,
          error_code: 503,
        };
      }
      if (
        error?.status === 401 ||
        error?.status === 503 ||
        error?.message?.includes("401") ||
        error?.message?.includes("API key") ||
        error?.message?.includes("SERVICE_UNAVAILABLE")
      ) {
        return {
          scanned: false,
          status: "failed",
          error: SERVICE_UNAVAILABLE_MESSAGE,
          error_code: 503,
        };
      }
      return {
        scanned: false,
        status: "error",
        error: error?.message,
      };
    }
  }

  // Format real CLI results for web display
  formatRealResults(cliResults) {
    try {
      // Extract the main analysis results
      const sastResults = cliResults.sast_results || {};

      // Flatten SAST findings from object to array
      const sastFindings = [];
      if (sastResults.sast_findings) {
        for (const [filePath, findings] of Object.entries(sastResults.sast_findings)) {
          if (Array.isArray(findings)) {
            findings.forEach(finding => {
              sastFindings.push({
                ...finding,
                file: finding.file || filePath
              });
            });
          }
        }
      }

      return {
        // Map CLI fields to frontend fields
        securityScore:
          cliResults.overall_security_score ||
          sastResults.overall_security_score ||
          0,
        riskLevel: this.determineRiskLevel(
          cliResults.overall_security_score ||
          sastResults.overall_security_score ||
          0,
        ),
        totalFiles: cliResults.extracted_files?.length || 0,
        totalFindings:
          cliResults.total_findings || sastFindings.length || 0,

        // Files information
        files: this.formatFileResults(cliResults.extracted_files || []),

        // SAST results from CLI analysis - use flattened findings
        sastResults: this.formatSASTResults(sastFindings),

        // Additional CLI data
        extensionId: cliResults.extension_id,
        url: cliResults.url,
        downloadResult: cliResults.download_result,

        // Metadata mapping
        name: cliResults.metadata?.title || cliResults.manifest?.name || "Unknown Extension",
        description: cliResults.metadata?.description || cliResults.manifest?.description || "",
        version: cliResults.metadata?.version || cliResults.manifest?.version || "0.0.0",
        developer: cliResults.metadata?.developer_name || cliResults.manifest?.author || "Unknown",
        lastUpdated: cliResults.metadata?.last_updated || "Unknown",

        // Permissions mapping
        permissions: this.formatPermissions(cliResults.permissions_analysis || {}),

        // Recommendations mapping
        recommendations: this.formatRecommendations(cliResults.summary || {}),

        // AI Summary
        executiveSummary: cliResults.summary?.summary || "No summary available",

        // Risk distribution
        riskDistribution:
          cliResults.risk_distribution || sastResults.risk_distribution || {},

        // Overall risk assessment
        overallRisk:
          cliResults.overall_risk || sastResults.overall_risk || "unknown",
        totalRiskScore:
          cliResults.total_risk_score || sastResults.total_risk_score || 0,

        // VirusTotal threat intelligence
        virustotalAnalysis: cliResults.virustotal_analysis || null,

        // Entropy/Obfuscation analysis
        entropyAnalysis: cliResults.entropy_analysis || null,
        
        // V2 Scoring - preserve raw fields for normalizer
        security_score: cliResults.security_score,
        privacy_score: cliResults.privacy_score,
        governance_score: cliResults.governance_score,
        overall_confidence: cliResults.overall_confidence,
        decision_v2: cliResults.decision_v2,
        decision_reasons_v2: cliResults.decision_reasons_v2,
        insufficient_data: cliResults.insufficient_data,
        decision_authority: cliResults.decision_authority,
        scoring_v2: cliResults.scoring_v2,

        // Governance bundle - needed for factors and evidence
        governance_bundle: cliResults.governance_bundle,
        // Authoritative final verdict (single Decision Authority)
        governance_verdict: cliResults.governance_verdict,
        
        // Preserve raw manifest and metadata for permissions
        manifest: cliResults.manifest,
        metadata: cliResults.metadata,
        permissions_analysis: cliResults.permissions_analysis,
        
        // Timestamp
        timestamp: cliResults.timestamp,
      };
    } catch (error) {
      // console.error("Error formatting CLI results:", error); // prod: no console
      return {
        securityScore: 0,
        riskLevel: "UNKNOWN",
        totalFiles: 0,
        totalFindings: 0,
        files: [],
        sastResults: [],
        error: "Failed to format results",
      };
    }
  }

  // Calculate security score from CLI results
  calculateSecurityScore(analysis) {
    if (analysis.security_score !== undefined) {
      return analysis.security_score;
    }

    // Calculate based on findings
    const totalFindings = analysis.total_findings || 0;
    const highRiskFindings = analysis.high_risk_findings || 0;

    if (totalFindings === 0) return 100;

    let score = 100;
    score -= highRiskFindings * 20; // High risk findings heavily penalize score
    score -= totalFindings * 2; // Each finding reduces score

    return Math.max(0, Math.round(score));
  }

  // Determine risk level from CLI results
  // Thresholds: Green (75-100), Yellow (50-74), Red (0-49)
  determineRiskLevel(score) {
    if (score >= 75) return "LOW";
    if (score >= 50) return "MEDIUM";
    return "HIGH";
  }

  // Format file analysis results
  formatFileResults(files) {
    if (!Array.isArray(files)) {
      return [];
    }

    return files.map((file, index) => {
      // Extract just the filename for display
      const fileName = file.split("/").pop();

      return {
        name: fileName,
        path: file, // Keep full path for API calls
        fullPath: file, // Store full path separately
        size: "Unknown", // CLI doesn't provide file sizes
        type: this.getFileType(fileName),
        riskLevel: this.getFileRiskLevel(fileName),
        index: index,
      };
    });
  }

  // Get file type based on extension
  getFileType(filename) {
    if (filename.endsWith(".js")) return "JavaScript";
    if (filename.endsWith(".html")) return "HTML";
    if (filename.endsWith(".css")) return "CSS";
    if (filename.endsWith(".json")) return "JSON";
    if (filename.endsWith(".xml")) return "XML";
    if (
      filename.endsWith(".png") ||
      filename.endsWith(".jpg") ||
      filename.endsWith(".gif")
    )
      return "Image";
    if (filename.endsWith(".ttf") || filename.endsWith(".woff")) return "Font";
    return "Other";
  }

  // Get file risk level based on type and name
  getFileRiskLevel(filename) {
    if (
      filename.includes("background") ||
      filename.includes("content") ||
      filename.includes("inject")
    ) {
      return "HIGH";
    }
    if (filename.endsWith(".js") || filename.endsWith(".html")) {
      return "MEDIUM";
    }
    return "LOW";
  }

  // Format SAST results
  formatSASTResults(sastResults) {
    if (!Array.isArray(sastResults)) {
      return [];
    }

    return sastResults.map((finding) => ({
      file: finding.file || "Unknown",
      line: finding.line_number || finding.line || 0,
      title: finding.pattern_name || finding.title || "Security Finding",
      description: finding.description || "No description available",
      severity: this.mapRiskLevelToSeverity(
        finding.risk_level || finding.severity || "medium",
      ),
      riskScore: finding.risk_score || 0,
      context: finding.context || "",
      matchText: finding.match_text || "",
    }));
  }

  // Map CLI risk levels to frontend severity levels
  mapRiskLevelToSeverity(riskLevel) {
    const level = riskLevel.toLowerCase();
    if (level === "high" || level === "malicious") return "HIGH";
    if (level === "medium" || level === "suspicious") return "MEDIUM";
    if (level === "low" || level === "info") return "LOW";
    return "MEDIUM";
  }

  // Get file content from extracted files
  async getFileContent(extensionId, filePath) {
    // Encode each path segment separately to preserve forward slashes
    const encodedPath = filePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    const response = await fetch(
      `${this.baseURL}/api/scan/file/${extensionId}/${encodedPath}`,
    );

    if (response.ok) {
      const result = await response.json();
      return result.content || "File content not available";
    } else {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || "Failed to fetch file content");
    }
  }

  // Get file list from extracted directory
  async getFileList(extensionId) {
    const response = await fetch(
      `${this.baseURL}/api/scan/files/${extensionId}`,
    );

    if (response.ok) {
      const result = await response.json();
      return result.files || [];
    } else {
      throw new Error("Failed to fetch file list");
    }
  }

  // Format permissions from CLI analysis
  formatPermissions(permissionsAnalysis) {
    if (!permissionsAnalysis || !permissionsAnalysis.permissions_details) {
      return [];
    }

    const details = permissionsAnalysis.permissions_details;
    return Object.keys(details).map(name => {
      const info = details[name];
      return {
        name: name,
        description: info.justification_reasoning || "No details available",
        risk: info.is_reasonable ? "LOW" : "HIGH" // Infer risk if not provided
      };
    });
  }

  // Format recommendations from CLI summary
  formatRecommendations(summary) {
    if (!summary || !summary.recommendations) {
      return [];
    }

    return summary.recommendations.map(rec => ({
      title: rec,
      priority: "MEDIUM", // Default priority
      description: ""
    }));
  }

  // ============================================================================
  // COMPLIANCE METHODS
  // ============================================================================

  // Get compliance report (report.json) - uses same GET /api/scan/results/:id
  async getComplianceReport(scanId) {
    const url = getScanResultsUrl(scanId);
    if (!url) throw new Error("Invalid scan id");
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return this.formatComplianceResults(data);
    }
    throw new Error("Failed to fetch compliance report");
  }

  // Map backend verdicts to frontend verdicts
  mapVerdict(backendVerdict) {
    const verdictMap = {
      "ALLOW": "PASS",
      "BLOCK": "FAIL",
      "NEEDS_REVIEW": "NEEDS_REVIEW",
      "ERROR": "FAIL",
    };
    return verdictMap[backendVerdict] || backendVerdict;
  }

  // Format compliance results from report.json or governance_bundle
  formatComplianceResults(reportData) {
    try {
      // Check if governance_bundle is available (new structure)
      const bundle = reportData.governance_bundle;
      if (bundle) {
        // Map rule verdicts from backend format (ALLOW/BLOCK) to frontend format (PASS/FAIL)
        const mappedRuleResults = (bundle.rule_results?.rule_results || []).map(rule => ({
          ...rule,
          verdict: this.mapVerdict(rule.verdict),
        }));

        return {
          scan_id: reportData.extension_id,
          timestamp: reportData.timestamp,
          extension: {
            id: reportData.extension_id,
            name: reportData.extension_name || reportData.metadata?.title,
          },
          // Extract from governance bundle with mapped verdicts
          rule_results: mappedRuleResults,
          evidence_index: bundle.evidence_index?.items || [],
          signals: bundle.signals?.signals || [],
          disclosure_claims: bundle.store_listing?.declared_data_categories || null,
          context: bundle.context || {},
          summary: bundle.report?.decision || {},
          facts: bundle.facts || null,
          // New governance-specific fields (mapped verdict)
          // Prefer the single Decision Authority; the legacy rules-engine
          // bundle.decision.verdict is a fallback only (must not override it).
          verdict: this.mapVerdict(
            bundle.decision?.final_verdict ||
            reportData.governance_verdict ||
            bundle.decision?.verdict
          ),
          rationale: bundle.decision?.rationale,
          action_required: bundle.decision?.action_required,
          store_listing: bundle.store_listing,
          citations: bundle.report?.citations || {},
        };
      }
      
      // Fallback to old structure (backwards compatibility)
      return {
        scan_id: reportData.scan_id || reportData.extension_id,
        timestamp: reportData.timestamp,
        extension: reportData.extension || {},
        rule_results: reportData.rule_results?.rule_results || [],
        evidence_index: reportData.evidence_index?.evidence_index || {},
        signals: reportData.signals?.signals || [],
        disclosure_claims: reportData.disclosure_claims || null,
        context: reportData.context?.context || {},
        summary: reportData.summary || {},
        facts: reportData.facts || null,
      };
    } catch (error) {
      // console.error("Error formatting compliance results:", error); // prod: no console
      return {
        scan_id: null,
        rule_results: [],
        evidence_index: {},
        signals: [],
        disclosure_claims: null,
        context: {},
        summary: {},
      };
    }
  }

  // Download enforcement bundle as JSON
  async downloadEnforcementBundle(scanId) {
    const response = await fetch(
      `${this.baseURL}/api/scan/enforcement_bundle/${scanId}`
    );
    if (response.ok) {
      const data = await response.json();
      // Create a downloadable JSON file
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `enforcement_bundle_${scanId}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      return true;
    } else {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to download enforcement bundle");
    }
  }

  // Get enforcement bundle data
  async getEnforcementBundle(scanId) {
    const response = await fetch(
      `${this.baseURL}/api/scan/enforcement_bundle/${scanId}`
    );
    if (response.ok) {
      return await response.json();
    } else {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to get enforcement bundle");
    }
  }
}

export default new RealScanService();
