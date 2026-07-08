/**
 * normalizeScanResult - Data Mapping Layer
 * 
 * Transforms RawScanResult API payload into ReportViewModel for UI consumption.
 * 
 * MAPPING RULES:
 * A) Primary source: raw.scoring_v2 (or governance_bundle.scoring_v2)
 *    - Scores from scoring_v2.overall_score/security_score/privacy_score/governance_score
 *    - Confidence from scoring_v2.overall_confidence
 *    - Decision + reasons from scoring_v2.decision / decision_reasons
 *    - Factors from scoring_v2.security_layer/privacy_layer/governance_layer.factors
 * B) Evidence index (source order - NO GUESSING):
 *    1. raw.governance_bundle?.signal_pack?.evidence (SignalPack - List<ToolEvidence>)
 *    2. raw.signal_pack?.evidence (if API returns it directly)
 *    3. raw.governance_bundle?.evidence_index?.evidence (legacy - dict keyed by evidence_id)
 *    -> Returns {} if no evidence exists (never throws)
 * C) Key findings: Hard gates + top factors by contribution + decision_reasons fallback
 * D) Bands: decision-based (ALLOW->GOOD, WARN->WARN, BLOCK->BAD) or score-based
 * E) Never compute scores client-side - only display what backend sent
 */

import type {
  RawScanResult,
  RawScoringV2,
  RawLayerScore,
  RawFactorScore,
  RawEvidenceItem,
  RawToolEvidence,
  RawSignalPack,
  ReportViewModel,
  MetaVM,
  ScoresVM,
  ScoreVM,
  ScoreBand,
  Decision,
  FactorsByLayerVM,
  FactorVM,
  KeyFindingVM,
  KeyFindingEvidence,
  FindingSeverity,
  PermissionsVM,
  EvidenceItemVM,
  ConsumerInsights,
} from './reportTypes';

/**
 * Normalized highlights for UI display
 */
export interface NormalizedHighlights {
  oneLiner: string;
  keyPoints: string[];
  whatToWatch: string[];
}

/**
 * normalizeHighlights - Extracts one-liner, key points, and what-to-watch with proper priority
 * 
 * Priority for Key Points:
 * 1. report_view_model.highlights.why_this_score (non-empty)
 * 2. report_view_model.highlights.key_points if present
 * 3. deterministic fallback from backend highlights
 *
 * Priority for What to watch:
 * 1. report_view_model.highlights.what_to_watch (non-empty)
 * 2. deterministic fallback from backend highlights
 */
export function normalizeHighlights(raw: RawScanResult | null | undefined): NormalizedHighlights {
  const result: NormalizedHighlights = {
    oneLiner: '',
    keyPoints: [],
    whatToWatch: []
  };

  if (!raw) return result;

  const reportViewModel = raw.report_view_model;
  const llmSummary = raw.summary || reportViewModel?.summary;

  // 1. One-liner
  result.oneLiner = reportViewModel?.scorecard?.one_liner 
    || llmSummary?.one_liner 
    || llmSummary?.summary
    || '';

  // 2. Key Points (why_this_score)
  const llmWhy = reportViewModel?.highlights?.why_this_score || llmSummary?.why_this_score || llmSummary?.key_findings;
  const llmKeyPoints = reportViewModel?.highlights?.key_points;
  
  if (Array.isArray(llmWhy) && llmWhy.length > 0) {
    result.keyPoints = llmWhy.filter(p => p && typeof p === 'string' && p.trim() !== '');
  } else if (Array.isArray(llmKeyPoints) && llmKeyPoints.length > 0) {
    result.keyPoints = llmKeyPoints.filter(p => p && typeof p === 'string' && p.trim() !== '');
  }

  // 3. What to watch
  const llmWatch = reportViewModel?.highlights?.what_to_watch || llmSummary?.what_to_watch || llmSummary?.recommendations;
  if (Array.isArray(llmWatch) && llmWatch.length > 0) {
    result.whatToWatch = llmWatch.filter(p => p && typeof p === 'string' && p.trim() !== '');
  }

  // If oneLiner is empty, use a placeholder based on decision
  if (!result.oneLiner) {
    const decision = resolveFinalVerdict(raw);
    if (decision === 'BLOCK') result.oneLiner = 'This extension was blocked by automated security checks.';
    else if (decision === 'WARN' || decision === 'NEEDS_REVIEW') result.oneLiner = 'This extension requires manual review before use.';
    else result.oneLiner = 'This extension has been analyzed for security, privacy, and compliance risks.';
  }

  return result;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Safely get a value or return a default
 */
function safeGet<T>(value: T | undefined | null, defaultValue: T): T {
  return value !== undefined && value !== null ? value : defaultValue;
}

/**
 * Resolve the final cross-system verdict.
 *
 * Precedence follows the single Decision Authority (ADR 0001): prefer
 * governance_verdict / final_verdict, and treat scoring_v2.decision /
 * decision_v2 as scoring-layer detail only. Never let the scoring-layer
 * decision override the governance authority.
 */
function resolveFinalVerdict(
  raw: RawScanResult,
  scoringV2?: RawScoringV2 | null
): string | undefined {
  const sv2 = scoringV2 ?? raw.scoring_v2;
  return (
    raw.final_verdict ||
    raw.governance_verdict ||
    raw.governance_bundle?.decision?.final_verdict ||
    sv2?.decision ||
    raw.decision_v2 ||
    undefined
  );
}

/**
 * Resolve whether this scan had insufficient analysis coverage. A low-coverage
 * scan must not be shown as confidently safe.
 */
function resolveInsufficientData(
  raw: RawScanResult,
  scoringV2?: RawScoringV2 | null
): boolean {
  const sv2 = scoringV2 ?? raw.scoring_v2;
  return Boolean(
    raw.insufficient_data ||
    sv2?.insufficient_data ||
    raw.governance_bundle?.decision?.insufficient_data
  );
}

/**
 * Resolve analysis coverage for display.
 *
 * A scan whose primary code analyzer (SAST) did not run must NEVER be shown as
 * "Full coverage" — that would make a "code was not analyzed" result look
 * confidently complete. Precedence:
 *   - limited: no substantive analyzer ran at all (insufficient_data)
 *   - partial: a coverage cap fired, OR SAST cannot be confirmed to have run
 *   - full:    SAST is positively confirmed to have run and no cap fired
 *
 * When SAST coverage cannot be positively confirmed we return `partial` rather
 * than over-claiming `full`. This is intentionally conservative: under-claiming
 * coverage is safe; over-claiming it is a trust failure.
 */
export function resolveCoverage(
  raw: RawScanResult | null | undefined
): { level: 'full' | 'partial' | 'limited'; label: string; tone: 'good' | 'warn' } {
  if (!raw) return { level: 'partial', label: 'Partial coverage', tone: 'warn' };

  const sv2 = getScoringV2(raw);

  if (resolveInsufficientData(raw, sv2)) {
    return { level: 'limited', label: 'Limited coverage', tone: 'warn' };
  }

  const capApplied = Boolean(
    (raw as { scoring_v2?: { coverage_cap_applied?: boolean } }).scoring_v2?.coverage_cap_applied ||
    sv2?.coverage_cap_applied ||
    raw.governance_bundle?.scoring_v2?.coverage_cap_applied
  );

  // Positive evidence that SAST (the primary code analyzer) actually ran.
  const sast = (raw.sast_results || {}) as {
    files_scanned?: number;
    filesScanned?: number;
    sast_findings?: Record<string, unknown>;
    sastFindings?: Record<string, unknown>;
  };
  const filesScanned = Number(sast.files_scanned ?? sast.filesScanned ?? 0);
  const findings = sast.sast_findings || sast.sastFindings;
  const findingsCount = findings && typeof findings === 'object' ? Object.keys(findings).length : 0;
  const sastRan = filesScanned > 0 || findingsCount > 0;

  if (capApplied || !sastRan) {
    return { level: 'partial', label: 'Partial coverage', tone: 'warn' };
  }
  return { level: 'full', label: 'Full coverage', tone: 'good' };
}

/**
 * Explicit per-analyzer status for the coverage/evidence UI. Never infers "clean"
 * from a missing analyzer: SAST that did not run is "not run", VirusTotal with no
 * hash hit is "unknown", not "clean". Reads the persisted signal pack
 * (governance_bundle.signal_pack) which records what each analyzer actually did.
 */
export function resolveAnalyzerStatus(
  raw: RawScanResult | null | undefined
): Array<{ key: string; label: string; status: string; ok: boolean }> {
  const anyRaw = (raw || {}) as {
    governance_bundle?: { signal_pack?: Record<string, unknown> };
    sast_results?: { files_scanned?: number; scan_error?: boolean };
    virustotal_analysis?: { enabled?: boolean };
  };
  const sp = (anyRaw.governance_bundle?.signal_pack || {}) as Record<string, any>;
  const out: Array<{ key: string; label: string; status: string; ok: boolean }> = [];

  // SAST
  const sast = sp.sast || {};
  const sastFiles = Number(sast.files_scanned ?? anyRaw.sast_results?.files_scanned ?? 0);
  if (sast.scan_error || anyRaw.sast_results?.scan_error) {
    out.push({ key: 'sast', label: 'Code analysis (SAST)', status: 'failed to run', ok: false });
  } else if (sastFiles > 0) {
    out.push({ key: 'sast', label: 'Code analysis (SAST)', status: `ran on ${sastFiles} file${sastFiles === 1 ? '' : 's'}`, ok: true });
  } else {
    out.push({ key: 'sast', label: 'Code analysis (SAST)', status: 'did not run — code not analyzed', ok: false });
  }

  // VirusTotal
  const vt = sp.virustotal || {};
  const vtEnabled = vt.enabled ?? anyRaw.virustotal_analysis?.enabled;
  const vtEngines = Number(vt.total_engines ?? 0);
  const vtMal = Number(vt.malicious_count ?? 0);
  if (vtEnabled === false) {
    out.push({ key: 'vt', label: 'Malware scan (VirusTotal)', status: 'disabled / no API key', ok: false });
  } else if (vtEngines > 0 && vtMal > 0) {
    out.push({ key: 'vt', label: 'Malware scan (VirusTotal)', status: `${vtMal} engine(s) flagged malicious`, ok: false });
  } else if (vtEngines > 0) {
    out.push({ key: 'vt', label: 'Malware scan (VirusTotal)', status: `checked (${vtEngines} engines, no detections)`, ok: true });
  } else {
    out.push({ key: 'vt', label: 'Malware scan (VirusTotal)', status: 'unknown — hash not in database', ok: false });
  }

  // Network
  const net = sp.network || {};
  out.push(net.enabled
    ? { key: 'network', label: 'Network / exfiltration', status: 'analyzed', ok: true }
    : { key: 'network', label: 'Network / exfiltration', status: 'did not run', ok: false });

  return out;
}

/**
 * Resolve store-listing provenance/trust. A result should never over-reassure
 * when the listing itself is unverified. Surfaces the honest edge cases:
 *   - foreign:    published on the Edge (non-Chrome) store
 *   - unverified: fabricated/placeholder Chrome URL, or no listing metadata
 *   - verified:   a real Chrome Web Store listing with captured metadata
 * `notes` explains *why*, for progressive disclosure in the UI.
 */
export function resolveProvenance(
  raw: RawScanResult | null | undefined
): {
  level: 'verified' | 'unverified' | 'foreign';
  label: string;
  tone: 'good' | 'warn';
  store: 'chrome' | 'edge' | 'unknown';
  notes: string[];
} {
  const notes: string[] = [];
  if (!raw) {
    return { level: 'unverified', label: 'Unverified listing', tone: 'warn', store: 'unknown', notes: ['No scan data available.'] };
  }

  const anyRaw = raw as unknown as {
    url?: string;
    metadata?: { user_count?: unknown; rating?: unknown; version?: unknown; last_updated?: unknown };
    manifest?: { update_url?: string; version?: string };
  };
  const url = typeof anyRaw.url === 'string' ? anyRaw.url : '';
  const updateUrl = anyRaw.manifest?.update_url || '';
  const meta = anyRaw.metadata || {};

  // Parse the listing URL strictly: a malformed URL, a non-http(s) scheme, or a
  // host that is not an actual store cannot support a "Verified listing" claim.
  let parsedUrl: URL | null = null;
  if (url) {
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') parsedUrl = null;
    } catch {
      parsedUrl = null;
    }
  }
  const urlHost = parsedUrl?.hostname.toLowerCase() ?? '';
  const urlIsChromeHost =
    urlHost === 'chromewebstore.google.com' ||
    (urlHost === 'chrome.google.com' && (parsedUrl?.pathname.toLowerCase().startsWith('/webstore') ?? false));
  const urlIsEdgeStore = urlHost === 'microsoftedge.microsoft.com';

  // Verification requires a real store DETAIL page (optional slug + 32-char
  // [a-p] extension ID) — homepages, search, and category pages identify no
  // listing. The literal slug "x" is the fabricated placeholder. (Kept in sync
  // with isUnverifiedStoreUrl in signalMapper.js.)
  let detailMatch: RegExpMatchArray | null = null;
  if (parsedUrl) {
    if (urlHost === 'chromewebstore.google.com') {
      detailMatch = parsedUrl.pathname.match(/^\/detail\/(?:([^/]+)\/)?([a-p]{32})\/?$/i);
    } else if (urlHost === 'chrome.google.com') {
      detailMatch = parsedUrl.pathname.match(/^\/webstore\/detail\/(?:([^/]+)\/)?([a-p]{32})\/?$/i);
    }
  }
  const urlIsChromeStoreDetail =
    Boolean(detailMatch) && (detailMatch?.[1] || '').toLowerCase() !== 'x';

  let store: 'chrome' | 'edge' | 'unknown' = 'unknown';
  if (/edge\.microsoft\.com/i.test(updateUrl) || urlIsEdgeStore) store = 'edge';
  else if (/clients2\.google\.com/i.test(updateUrl) || urlIsChromeHost) store = 'chrome';

  // The URL only supports verification when it parses and is an actual Chrome
  // Web Store detail page (placeholder slug excluded by the regex check).
  const placeholderUrl = !parsedUrl || !urlIsChromeStoreDetail;
  const missingMetadata = meta.user_count == null && meta.rating == null && meta.version == null;

  // Version mismatch: the listing metadata does not describe the scanned build,
  // so the listing cannot honestly be presented as verified for this scan.
  const manifestVersion = anyRaw.manifest?.version;
  const metaVersion = meta.version;
  const versionMismatch = Boolean(
    manifestVersion && metaVersion && String(manifestVersion) !== String(metaVersion)
  );
  if (versionMismatch) {
    notes.push(`Scanned build (v${manifestVersion}) differs from the listed version (v${metaVersion}).`);
  }

  // Staleness: an extension not updated in over a year is worth flagging in the
  // disclosure notes (it already feeds the Maintenance score factor; this only
  // surfaces it — it does not change the listing-trust level).
  const lastUpdated = (meta as { last_updated?: unknown }).last_updated;
  if (typeof lastUpdated === 'string' && lastUpdated.trim()) {
    const parsed = new Date(lastUpdated);
    if (!Number.isNaN(parsed.getTime()) && Date.now() - parsed.getTime() > 365 * 24 * 60 * 60 * 1000) {
      notes.push(`Not updated since ${lastUpdated} — may be unmaintained.`);
    }
  }

  if (store === 'edge') {
    notes.push('Published on the Microsoft Edge Add-ons store, not the Chrome Web Store.');
    return { level: 'foreign', label: 'Edge listing', tone: 'warn', store, notes };
  }
  if (placeholderUrl) notes.push('Store listing could not be verified (missing, malformed, or non-store URL).');
  if (missingMetadata) notes.push('No store listing metadata (installs, rating, version) was captured.');

  if (placeholderUrl || missingMetadata || versionMismatch) {
    return { level: 'unverified', label: 'Unverified listing', tone: 'warn', store, notes };
  }
  return { level: 'verified', label: 'Verified listing', tone: 'good', store, notes };
}

/**
 * Map decision string to normalized Decision type
 */
function normalizeDecision(decision?: string | null): Decision {
  if (!decision) return null;
  const upper = decision.toUpperCase();
  if (upper === 'ALLOW') return 'ALLOW';
  if (upper === 'BLOCK') return 'BLOCK';
  if (upper === 'WARN' || upper === 'NEEDS_REVIEW') return 'WARN';
  return null;
}

/**
 * Get score band from risk_level string (from backend scoring_v2)
 * Maps: "low" -> GOOD, "medium" -> WARN, "high"/"critical" -> BAD
 */
function bandFromRiskLevel(riskLevel: string | null | undefined): ScoreBand | null {
  if (!riskLevel) return null;
  const lower = riskLevel.toLowerCase();
  if (lower === 'low' || lower === 'none') return 'GOOD';
  if (lower === 'medium') return 'WARN';
  if (lower === 'high' || lower === 'critical') return 'BAD';
  return null;
}

/**
 * Get score band from score value
 * Thresholds: Green (75-100), Yellow (50-74), Red (0-49)
 */
function bandFromScore(score: number | null): ScoreBand {
  if (score === null) return 'NA';
  if (score >= 75) return 'GOOD';
  if (score >= 50) return 'WARN';
  return 'BAD';
}

/**
 * Map severity number [0,1] to finding severity
 */
function severityToFindingLevel(severity: number): FindingSeverity {
  if (severity >= 0.7) return 'high';
  if (severity >= 0.4) return 'medium';
  return 'low';
}

/**
 * Floor a displayed/serialized risk level so it can never contradict the
 * authoritative verdict. A BLOCK must not read as "low"/"none"; a NEEDS_REVIEW
 * (WARN) must not imply fully safe. ALLOW / unrated pass through unchanged.
 *
 * Display/serialization coherence only — it does NOT change any numeric score,
 * weight, or the stored risk_level; it only prevents the displayed band from
 * telling a different story than the verdict.
 */
export function coherentRiskLevel(
  decision: string | null | undefined,
  riskLevel: string | null | undefined
): string | null | undefined {
  const verdict = (decision || '').toUpperCase();
  const level = (riskLevel || '').toLowerCase();
  const readsSafe = level === 'low' || level === 'none' || level === '';
  if (verdict === 'BLOCK') return readsSafe ? 'high' : riskLevel;
  if (verdict === 'WARN' || verdict === 'NEEDS_REVIEW') return readsSafe ? 'medium' : riskLevel;
  return riskLevel;
}

const GATE_HUMAN_TITLE: Record<string, string> = {
  CRITICAL_SAST: 'Dangerous code pattern detected',
  SENSITIVE_EXFIL: 'May send your data to external servers',
  PURPOSE_MISMATCH: "Behavior doesn't match stated purpose",
  VT_MALWARE: 'Flagged by antivirus engines',
  TOS_VIOLATION: 'Chrome Web Store policy violation',
  MANIFEST_POSTURE: 'Suspicious extension configuration',
  CAPTURE_SIGNALS: 'May capture your screen or input',
};

// Keys MUST match the backend FactorName strings (scoring/weights.py). Labels
// are kept consistent with LayerModal's FACTOR_HUMAN so a factor reads the same
// in Key Findings and in the layer modal.
const FACTOR_HUMAN_TITLE: Record<string, string> = {
  SAST: 'Code Safety',
  VirusTotal: 'Malware Scan',
  Obfuscation: 'Hidden Code',
  Manifest: 'Extension Config',
  ChromeStats: 'Threat Intel',
  Webstore: 'Store Reputation',
  Maintenance: 'Publisher update age',
  PermissionsBaseline: 'Permission Risk',
  PermissionCombos: 'Dangerous Combos',
  NetworkExfil: 'Data Sharing',
  CaptureSignals: 'Screen Capture',
  ToSViolations: 'Policy Violations',
  Consistency: 'Behavior Match',
  DisclosureAlignment: 'Disclosure Accuracy',
};

const SAST_HUMAN_TITLE: Record<string, string> = {
  'extension-detects-incognito': 'Detects private browsing mode',
  'eval-usage': 'Runs dynamically created code',
  'dynamic-script-injection': 'Injects scripts into web pages',
  'remote-code-execution': 'Loads and runs code from the internet',
  'crypto-mining': 'May use your computer for crypto mining',
  'keylogger-pattern': 'May record your keystrokes',
  'data-exfiltration': 'Sends data to external servers',
  'obfuscated-code': 'Contains hidden or hard-to-read code',
  'cookie-access': 'Reads your browser cookies',
  'history-access': 'Reads your browsing history',
  'clipboard-access': 'Reads your clipboard',
  'screenshot-capture': 'Can take screenshots',
  'webcam-access': 'Can access your camera',
  'microphone-access': 'Can access your microphone',
  'password-access': 'May access saved passwords',
  'form-data-access': 'Reads data you type into forms',
};

// Friendly labels for the custom Semgrep rule behaviors (keyed on the specific
// last segment of the dotted rule id, e.g. `...credential.theft.chrome_identity_api`).
// Titles describe the behavior plainly — never the scary rule taxonomy.
const SAST_BEHAVIOR_TITLE: Record<string, string> = {
  chrome_identity_api: 'Uses Chrome sign-in (identity)',
  fetch_credentials_include: 'Sends authenticated network requests',
  chrome_runtime_external: 'Messages other extensions',
  external_api_calls: 'Calls external APIs',
  document_cookie_access: 'Reads cookies',
  chrome_cookies_api: 'Reads cookies',
  storage_access: 'Uses local storage',
  indexeddb_storage: 'Uses local storage',
  websocket_connection: 'Opens a websocket connection',
  keylogger: 'Listens to keyboard input',
  password_extraction: 'Reads password fields',
  password_input_hooks: 'Hooks password inputs',
  form_serialization: 'Reads form field values',
  submit_intercept: 'Intercepts form submissions',
  dynamic_script_loading: 'Loads and runs remote code',
  server_list: 'Contains hardcoded server list',
  periodic_beacon: 'Beacons to external servers',
  image_steganography: 'May hide data in images',
  base64_encoded_data: 'Sends encoded data',
  dns_tunneling: 'May tunnel data over DNS',
  url_and_userid: 'Sends user id to a URL',
  override_fetch_xhr: 'Intercepts network requests',
  cookie_exfiltration: 'Sends cookies externally',
  clipboard_hijack: 'Reads and replaces clipboard',
  silent_payment: 'May trigger silent payments',
  random_domain_pattern: 'Contacts unusual-looking domains',
};

function humanizeSastCheckId(checkId: string): string {
  if (!checkId || typeof checkId !== 'string') return 'Code finding';
  if (SAST_HUMAN_TITLE[checkId]) return SAST_HUMAN_TITLE[checkId];
  // Custom rules are dotted paths (src.extension_shield.config.<cat>.<sub>.<behavior>).
  // Humanize the specific behavior (last segment), not the whole path.
  const suffix = checkId.split('.').pop() || checkId;
  if (SAST_BEHAVIOR_TITLE[suffix]) return SAST_BEHAVIOR_TITLE[suffix];
  return suffix.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeGateId(gateId: string): string {
  return GATE_HUMAN_TITLE[gateId] || GATE_HUMAN_TITLE[gateId.toUpperCase()] || gateId.replace(/_/g, ' ').toLowerCase();
}

function humanizeFactorName(name: string): string {
  return FACTOR_HUMAN_TITLE[name] || name.replace(/([A-Z])/g, ' $1').trim();
}

function humanizeFactorSummary(factor: RawFactorScore, layer: string): string {
  const name = factor.name || 'Unknown';
  const severity = factor.severity ?? 0;
  const details = factor.details || {};
  const desc = typeof details === 'object' ? (details as any).description : '';

  if (desc) return desc;

  const level = severity >= 0.7 ? 'significant' : severity >= 0.4 ? 'moderate' : 'minor';
  const humanName = humanizeFactorName(name).toLowerCase();
  return `${level.charAt(0).toUpperCase() + level.slice(1)} findings in ${humanName}`;
}

/**
 * Map gate ID to layer classification
 * Used for Key Findings categorization and gate-based band overrides
 */
export function gateIdToLayer(gateId: string): 'security' | 'privacy' | 'governance' {
  const upper = gateId.toUpperCase();
  // Security gates
  if (upper === 'CRITICAL_SAST' || upper === 'VT_MALWARE') {
    return 'security';
  }
  // Privacy gates
  if (upper === 'SENSITIVE_EXFIL') {
    return 'privacy';
  }
  // Governance gates
  if (upper === 'PURPOSE_MISMATCH' || upper === 'TOS_VIOLATION') {
    return 'governance';
  }
  // Default to security for unknown gates
  return 'security';
}

/**
 * Extract all findings by layer from raw scan results
 * Includes SAST findings, factors, gates, and other analysis results
 */
export function extractFindingsByLayer(raw: RawScanResult | null | undefined): {
  security: KeyFindingVM[];
  privacy: KeyFindingVM[];
  governance: KeyFindingVM[];
} {
  const result = {
    security: [] as KeyFindingVM[],
    privacy: [] as KeyFindingVM[],
    governance: [] as KeyFindingVM[],
  };

  if (!raw) return result;

  // Get scoring_v2 from best source
  const scoringV2 = raw.scoring_v2 || raw.governance_bundle?.scoring_v2 || null;
  const sastResults = raw.sast_results;
  const permsAnalysis = raw.permissions_analysis;

  // 1. Extract SAST findings for Security layer (prioritize high severity)
  if (sastResults) {
    const sastFindings = sastResults.sast_findings || sastResults.sastFindings || {};
    const sastFindingsList: Array<{ severity: FindingSeverity; title: string; summary: string }> = [];
    
    if (typeof sastFindings === 'object' && !Array.isArray(sastFindings)) {
      Object.entries(sastFindings).forEach(([filePath, findings]) => {
        if (Array.isArray(findings)) {
          findings.forEach((finding: any) => {
            const extra = finding.extra || {};
            const severity = (extra.severity || 'INFO').toUpperCase();
            const message = extra.message || finding.check_id || 'SAST finding';
            const checkId = finding.check_id || 'unknown';
            const lineNum = finding.start?.line;
            
            // Map severity to finding level
            let findingSeverity: FindingSeverity = 'low';
            if (severity === 'CRITICAL' || severity === 'ERROR') {
              findingSeverity = 'high';
            } else if (severity === 'HIGH' || severity === 'WARNING') {
              findingSeverity = 'medium';
            }

            sastFindingsList.push({
              severity: findingSeverity,
              title: humanizeSastCheckId(checkId),
              summary: message,
            });
          });
        }
      });
    }
    
    // Sort by severity (high > medium > low) and take top 10
    sastFindingsList.sort((a, b) => {
      const order = { high: 3, medium: 2, low: 1 };
      return (order[b.severity] || 0) - (order[a.severity] || 0);
    });
    
    sastFindingsList.slice(0, 10).forEach(f => {
      result.security.push({
        title: f.title,
        severity: f.severity,
        layer: 'security',
        summary: f.summary.length > 100 ? `${f.summary.substring(0, 97)}...` : f.summary,
        evidenceIds: [],
      });
    });
  }

  // 2. Extract factors from scoring_v2 (already categorized by layer)
  // Only include factors with significant severity (>= 0.3) to avoid noise
  if (scoringV2) {
    // Security factors
    if (scoringV2.security_layer?.factors) {
      scoringV2.security_layer.factors.forEach((f: RawFactorScore) => {
        if ((f.severity ?? 0) >= 0.3) {
          result.security.push({
            title: humanizeFactorName(safeGet(f.name, 'Unknown')),
            severity: severityToFindingLevel(f.severity),
            layer: 'security',
            summary: humanizeFactorSummary(f, 'security'),
            evidenceIds: safeGet(f.evidence_ids, []),
          });
        }
      });
    }

    // Privacy factors
    if (scoringV2.privacy_layer?.factors) {
      scoringV2.privacy_layer.factors.forEach((f: RawFactorScore) => {
        if ((f.severity ?? 0) >= 0.3) {
          result.privacy.push({
            title: humanizeFactorName(safeGet(f.name, 'Unknown')),
            severity: severityToFindingLevel(f.severity),
            layer: 'privacy',
            summary: humanizeFactorSummary(f, 'privacy'),
            evidenceIds: safeGet(f.evidence_ids, []),
          });
        }
      });
    }

    // Governance factors
    if (scoringV2.governance_layer?.factors) {
      scoringV2.governance_layer.factors.forEach((f: RawFactorScore) => {
        if ((f.severity ?? 0) >= 0.3) {
          result.governance.push({
            title: humanizeFactorName(safeGet(f.name, 'Unknown')),
            severity: severityToFindingLevel(f.severity),
            layer: 'governance',
            summary: humanizeFactorSummary(f, 'governance'),
            evidenceIds: safeGet(f.evidence_ids, []),
          });
        }
      });
    }

    // Extract gates by layer
    const gateResults = scoringV2.gate_results || [];
    gateResults.forEach((gate: any) => {
      if (gate.triggered) {
        const layer = gateIdToLayer(gate.gate_id);
        result[layer].push({
          title: humanizeGateId(gate.gate_id),
          severity: gate.decision === 'BLOCK' ? 'high' : 'medium',
          layer: layer,
          summary: humanizeGateId(gate.gate_id),
          evidenceIds: [],
        });
      }
    });
  }

  // 3. Extract privacy-specific findings (permissions, exfil)
  if (permsAnalysis) {
    const PERM_HUMAN: Record<string, string> = {
      cookies: 'read your cookies',
      webRequest: 'see your web traffic',
      webRequestBlocking: 'intercept and modify your web traffic',
      tabs: 'access all your browser tabs',
      history: 'read your browsing history',
      bookmarks: 'read your bookmarks',
      clipboardRead: 'read your clipboard',
      downloads: 'access your downloads',
      management: 'manage other extensions',
      nativeMessaging: 'communicate with desktop apps',
      debugger: 'debug pages and extensions',
      proxy: 'modify proxy settings',
      geolocation: 'access your location',
    };
    const permsDetails = permsAnalysis.permissions_details || {};
    Object.entries(permsDetails).forEach(([permName, details]: [string, any]) => {
      if (details && details.is_reasonable === false) {
        const humanPerm = PERM_HUMAN[permName] || `use "${permName}"`;
        result.privacy.push({
          title: `Unnecessary permission to ${humanPerm}`,
          severity: 'medium',
          layer: 'privacy',
          summary: details.reason || `This extension may not need the ability to ${humanPerm}.`,
          evidenceIds: [],
        });
      }
    });
  }

  // 4. Extract governance findings (policy, disclosure)
  const privacyCompliance = raw.privacy_compliance || raw.report_view_model?.raw?.privacy_compliance;
  if (privacyCompliance) {
    const governanceChecks = privacyCompliance.governance_checks || [];
    governanceChecks.forEach((check: any) => {
      if (typeof check === 'object' && check.status && check.status !== 'PASS') {
        result.governance.push({
          title: check.check || 'Governance check',
          severity: check.status === 'FAIL' ? 'high' : 'medium',
          layer: 'governance',
          summary: check.note || check.reason || '',
          evidenceIds: [],
        });
      }
    });
  }

  return result;
}

/**
 * Map gate decision to band severity
 * BLOCK -> BAD, WARN/NEEDS_REVIEW -> WARN, ALLOW -> null (no override)
 */
function gateDecisionToBand(decision: string | null | undefined): ScoreBand | null {
  if (!decision) return null;
  const upper = (decision || '').toUpperCase();
  if (upper === 'BLOCK') return 'BAD';
  if (upper === 'WARN' || upper === 'NEEDS_REVIEW') return 'WARN';
  return null;
}

/**
 * Issue-level band for a layer: if any factor has an ISSUE-level severity
 * (>= 0.4, the same threshold the LayerModal rows and the tile finding-count
 * use), the layer tile must not present as "Safe". Returns WARN so the tile
 * shows at least "Needs Review"; never downgrades (a BLOCK gate still wins via
 * computeEffectiveBand). Returns null when the layer has no issue-level factor.
 */
function factorIssueBand(layer: RawLayerScore | null | undefined): ScoreBand | null {
  const factors = layer?.factors;
  if (!Array.isArray(factors)) return null;
  return factors.some((f) => (f?.severity ?? 0) >= 0.4) ? 'WARN' : null;
}

/**
 * Compute effective band by combining score-based band with gate-based band
 * Uses ordering: GOOD < WARN < BAD
 * Returns the more severe of the two bands
 */
function computeEffectiveBand(scoreBand: ScoreBand, gateBand: ScoreBand | null): ScoreBand {
  if (!gateBand || gateBand === 'NA') return scoreBand;
  if (scoreBand === 'NA') return gateBand;
  
  // Order: GOOD < WARN < BAD
  const severity: Record<ScoreBand, number> = {
    'GOOD': 1,
    'WARN': 2,
    'BAD': 3,
    'NA': 0,
  };
  
  return severity[gateBand] > severity[scoreBand] ? gateBand : scoreBand;
}

/**
 * Assert that a value exists and return it, or throw
 */
function assertExists<T>(value: T | undefined | null, name: string): T {
  if (value === undefined || value === null) {
    // console.warn(`[normalizeScanResult] Missing expected field: ${name}`); // prod: no console
    throw new Error(`Missing required field: ${name}`);
  }
  return value;
}

// =============================================================================
// EXTRACTION HELPERS
// =============================================================================

/**
 * Get scoring_v2 from the best source
 * Priority: raw.scoring_v2 > raw.governance_bundle.scoring_v2
 */
function getScoringV2(raw: RawScanResult): RawScoringV2 | null {
  const top = raw.scoring_v2 ?? null;
  const bundle = raw.governance_bundle?.scoring_v2 ?? null;
  if (!top) return bundle;
  if (!bundle) return top;
  // Persisted rows flatten the top-level copy: its *_layer objects and
  // gate_results are stripped, while the governance-bundle copy keeps the full
  // per-layer detail (factors, gate results). Keep top-level fields as the base
  // (it carries decision_authority / insufficient_data), but graft the layer
  // detail back in so factors, per-layer bands, and gate overrides work on
  // real payloads instead of silently rendering empty.
  if (top.security_layer || top.privacy_layer || top.governance_layer) return top;
  return {
    ...bundle,
    ...top,
    security_layer: top.security_layer ?? bundle.security_layer,
    privacy_layer: top.privacy_layer ?? bundle.privacy_layer,
    governance_layer: top.governance_layer ?? bundle.governance_layer,
    gate_results: top.gate_results ?? bundle.gate_results,
  };
}

/**
 * Select the real top contributing factors for a layer tile.
 *
 * Factors are stored in a fixed order (SAST, VirusTotal, ...), so slicing the
 * first N surfaces default labels ("SAST"/"VirusTotal") even when they scored
 * zero and did not contribute. This keeps only factors that actually added risk
 * (severity or contribution > 0), ranked by contribution. Returns [] when the
 * layer is clean — the tile then shows just its score, no misleading chips.
 */
export function topContributingFactors(
  factors: FactorVM[] | null | undefined,
  limit = 2
): FactorVM[] {
  if (!Array.isArray(factors)) return [];
  return factors
    .filter((f) => f && f.name && (((f.severity ?? 0) > 0) || ((f.riskContribution ?? 0) > 0)))
    .sort((a, b) => (b.riskContribution ?? b.severity ?? 0) - (a.riskContribution ?? a.severity ?? 0))
    .slice(0, Math.max(0, limit));
}

/**
 * Get layer factors from scoring_v2
 */
function getLayerFactors(layer?: RawLayerScore | null): FactorVM[] {
  if (!layer?.factors) return [];
  
  return layer.factors.map((f: RawFactorScore): FactorVM => ({
    name: safeGet(f.name, 'Unknown'),
    severity: safeGet(f.severity, 0),
    confidence: safeGet(f.confidence, 0),
    weight: f.weight,
    riskContribution: f.contribution,
    evidenceIds: safeGet(f.evidence_ids, []),
    details: f.details,
  }));
}

// =============================================================================
// EVIDENCE EXTRACTION - Stable, never throws
// =============================================================================

/**
 * Convert a single evidence item to EvidenceItemVM (safe, never throws)
 */
function toEvidenceItemVM(
  ev: RawToolEvidence | RawEvidenceItem | null | undefined,
  id?: string
): EvidenceItemVM | null {
  if (!ev || typeof ev !== 'object') return null;
  
  try {
    // Handle both ToolEvidence (array format) and EvidenceItem (dict format)
    const toolEvidence = ev as RawToolEvidence;
    const evidenceItem = ev as RawEvidenceItem;
    
    return {
      toolName: toolEvidence.tool_name || evidenceItem.provenance?.split(':')[0] || undefined,
      filePath: ev.file_path ?? undefined,
      lineStart: ev.line_start,
      lineEnd: ev.line_end,
      snippet: ev.snippet ?? undefined,
      timestamp: toolEvidence.timestamp || evidenceItem.created_at,
      rawData: ev,
    };
  } catch {
    // console.warn(`[buildEvidenceIndex] Failed to convert evidence item: ${id || 'unknown'}`); // prod: no console
    return null;
  }
}

/**
 * Extract evidence items from raw scan result
 * 
 * SOURCE ORDER (no guessing):
 * 1. raw.governance_bundle?.signal_pack?.evidence (SignalPack - List<ToolEvidence>)
 * 2. raw.signal_pack?.evidence (if API returns it directly at top level)
 * 3. raw.governance_bundle?.evidence_index?.evidence (legacy - dict keyed by evidence_id)
 * 
 * @returns Array of evidence items with their IDs, or empty array if no evidence
 */
export function extractEvidenceItems(
  raw: RawScanResult | null | undefined
): Array<{ id: string; evidence: EvidenceItemVM }> {
  const result: Array<{ id: string; evidence: EvidenceItemVM }> = [];
  
  if (!raw) return result;
  
  try {
    // Source 1: governance_bundle.signal_pack.evidence (LIST - primary source)
    const signalPackEvidence = raw.governance_bundle?.signal_pack?.evidence;
    if (Array.isArray(signalPackEvidence) && signalPackEvidence.length > 0) {
      signalPackEvidence.forEach((ev: RawToolEvidence) => {
        const id = ev.evidence_id;
        if (id) {
          const vm = toEvidenceItemVM(ev, id);
          if (vm) result.push({ id, evidence: vm });
        }
      });
      // If we found evidence in SignalPack, use it as primary source
      if (result.length > 0) return result;
    }
    
    // Source 2: top-level signal_pack.evidence (if API returns it directly)
    const topLevelSignalPack = raw.signal_pack?.evidence;
    if (Array.isArray(topLevelSignalPack) && topLevelSignalPack.length > 0) {
      topLevelSignalPack.forEach((ev: RawToolEvidence) => {
        const id = ev.evidence_id;
        if (id) {
          const vm = toEvidenceItemVM(ev, id);
          if (vm) result.push({ id, evidence: vm });
        }
      });
      // If we found evidence here, return it
      if (result.length > 0) return result;
    }
    
    // Source 3: governance_bundle.evidence_index.evidence (DICT - legacy fallback)
    const evidenceIndexEvidence = raw.governance_bundle?.evidence_index?.evidence;
    if (evidenceIndexEvidence && typeof evidenceIndexEvidence === 'object' && !Array.isArray(evidenceIndexEvidence)) {
      Object.entries(evidenceIndexEvidence).forEach(([id, ev]: [string, RawEvidenceItem]) => {
        const vm = toEvidenceItemVM(ev, id);
        if (vm) result.push({ id, evidence: vm });
      });
    }
  } catch (error) {
    // console.warn('[extractEvidenceItems] Error extracting evidence:', error); // prod: no console
    // Return whatever we have so far (empty is fine)
  }
  
  return result;
}

/**
 * Build evidence index from raw scan result
 * 
 * Always returns a stable object (defaults to {})
 * Uses extractEvidenceItems for proper source order
 */
function buildEvidenceIndex(raw: RawScanResult): Record<string, EvidenceItemVM> {
  const evidenceIndex: Record<string, EvidenceItemVM> = {};
  
  try {
    const items = extractEvidenceItems(raw);
    items.forEach(({ id, evidence }) => {
      evidenceIndex[id] = evidence;
    });
  } catch (error) {
    // console.warn('[buildEvidenceIndex] Error building evidence index:', error); // prod: no console
    // Return empty object - never throw
  }
  
  return evidenceIndex;
}

/**
 * Build "limited coverage" key findings from the coverage-cap / insufficient-data
 * state. When an analyzer could not clear the extension (SAST failed, no
 * analyzable code was scanned, or VirusTotal reputation was unavailable), THAT —
 * not an ordinary factor like publisher update age — is the real reason the
 * extension needs review. These are surfaced ahead of factor findings so the
 * headline reason matches the score driver. They are coverage limitations, not
 * confirmed threats (each summary says so explicitly).
 */
// =============================================================================
// KEY FINDING EVIDENCE — additive, verifiable references (never fabricated)
// =============================================================================

/** Parse a "[CWS_LIMITED_USE::R5]" rulepack::rule token from a governance rationale. */
function parseRulepackRule(rationale: unknown): { rulepack?: string; ruleId?: string } {
  if (typeof rationale !== 'string') return {};
  const m = rationale.match(/\[([A-Za-z0-9_]+)::([A-Za-z0-9_]+)\]/);
  return m ? { rulepack: m[1], ruleId: m[2] } : {};
}

function codeEvidenceLabel(filePath?: string, lineStart?: number | null): string | undefined {
  if (!filePath) return undefined;
  return typeof lineStart === 'number' && lineStart > 0 ? `${filePath}:${lineStart}` : filePath;
}

/**
 * Resolve a structured evidence reference for a scoring-factor finding using the
 * evidence the payload already carries. Never fabricates: returns
 * `{ available: false }` when nothing is resolvable.
 */
function resolveFactorEvidence(
  factor: FactorVM & { layer: string },
  raw: RawScanResult,
  evLookup: Record<string, EvidenceItemVM>,
): KeyFindingEvidence {
  const name = factor.name;
  const ids = Array.isArray(factor.evidenceIds) ? factor.evidenceIds : [];
  const anyRaw = raw as unknown as {
    virustotal_analysis?: any;
    manifest?: { permissions?: unknown; host_permissions?: unknown };
    metadata?: { last_updated?: unknown };
  };

  // SAST / obfuscation — resolve the first evidence item to file/line/snippet.
  if (name === 'SAST' || name === 'Obfuscation') {
    const first = ids.map((id) => evLookup[id]).find(Boolean);
    if (first && first.filePath) {
      return {
        kind: 'sast', available: true,
        filePath: first.filePath, lineStart: first.lineStart, lineEnd: first.lineEnd,
        snippet: first.snippet, evidenceIds: ids, sourceViewerPath: first.filePath,
        label: codeEvidenceLabel(first.filePath, first.lineStart),
      };
    }
    return { kind: 'sast', available: false, evidenceIds: ids };
  }

  // VirusTotal / threat intel — reputation counts + first file hash.
  if (name === 'VirusTotal' || name === 'ChromeStats') {
    const vt = anyRaw.virustotal_analysis || {};
    const fileResults = Array.isArray(vt.file_results) ? vt.file_results : [];
    const hash = fileResults[0]?.hashes?.sha256 || fileResults[0]?.hashes?.sha1;
    const threat = vt.summary?.threat_level;
    const available = vt.enabled !== false && (Number(vt.files_found_in_vt ?? 0) > 0 || Number(vt.files_analyzed ?? 0) > 0);
    if (available) {
      return {
        kind: 'virustotal', available: true, hash,
        malicious: Number(vt.total_malicious ?? 0), suspicious: Number(vt.total_suspicious ?? 0),
        coverageState: threat,
        label: threat ? `VirusTotal: ${threat}` : `VirusTotal: ${Number(vt.total_malicious ?? 0)} malicious`,
      };
    }
    return { kind: 'virustotal', available: false };
  }

  // Manifest / permission factors — permission + host permission references.
  if (['Manifest', 'PermissionsBaseline', 'PermissionCombos', 'CaptureSignals', 'NetworkExfil'].includes(name)) {
    const manifest = anyRaw.manifest || {};
    const perms: string[] = Array.isArray(manifest.permissions) ? manifest.permissions as string[] : [];
    const hosts: string[] = Array.isArray(manifest.host_permissions) ? manifest.host_permissions as string[] : [];
    const details = (factor.details || {}) as { description?: unknown };
    const explanation = typeof details.description === 'string' ? details.description : undefined;
    if (perms.length || hosts.length || explanation) {
      return {
        kind: 'manifest', available: true,
        permission: perms[0], hostPermission: hosts[0], manifestField: 'permissions',
        explanation, label: perms[0] || hosts[0] || 'manifest',
      };
    }
    return { kind: 'manifest', available: false };
  }

  // Publisher update age (Maintenance) — advisory context from the store listing.
  if (name === 'Maintenance') {
    const lastUpdated = anyRaw.metadata?.last_updated;
    return {
      kind: 'summary', available: Boolean(lastUpdated),
      explanation: 'Based on the store listing last-updated date.',
      label: typeof lastUpdated === 'string' ? `Updated ${lastUpdated}` : undefined,
    };
  }

  // Fallback: resolve any evidence ids to code, else mark unavailable (summary-only).
  const first = ids.map((id) => evLookup[id]).find(Boolean);
  if (first && first.filePath) {
    return {
      kind: 'sast', available: true, filePath: first.filePath,
      lineStart: first.lineStart, lineEnd: first.lineEnd, snippet: first.snippet,
      evidenceIds: ids, sourceViewerPath: first.filePath, label: codeEvidenceLabel(first.filePath, first.lineStart),
    };
  }
  return { kind: 'summary', available: false, evidenceIds: ids };
}

function buildCoverageKeyFindings(
  scoringV2: RawScoringV2 | null,
  raw: RawScanResult
): KeyFindingVM[] {
  const anyV2 = (scoringV2 || {}) as { coverage_cap_applied?: boolean; coverage_cap_reason?: string };
  const anyRaw = (raw || {}) as {
    scoring_v2?: { coverage_cap_applied?: boolean };
    governance_bundle?: { scoring_v2?: { coverage_cap_applied?: boolean; coverage_cap_reason?: string }; signal_pack?: Record<string, any> };
    sast_results?: { scan_error?: boolean; files_scanned?: number; filesScanned?: number; sast_findings?: Record<string, unknown>; sastFindings?: Record<string, unknown> };
    virustotal_analysis?: { enabled?: boolean; files_found_in_vt?: number };
  };

  const capApplied = Boolean(
    anyV2.coverage_cap_applied ||
    anyRaw.scoring_v2?.coverage_cap_applied ||
    anyRaw.governance_bundle?.scoring_v2?.coverage_cap_applied
  );
  const insufficient = resolveInsufficientData(raw, scoringV2);
  if (!capApplied && !insufficient) return [];

  const findings: KeyFindingVM[] = [];
  const mk = (title: string, summary: string, evidence: KeyFindingEvidence): KeyFindingVM => ({
    title, severity: 'high', layer: 'security', summary, evidenceIds: [], evidence,
  });

  const sp = (anyRaw.governance_bundle?.signal_pack || {}) as Record<string, any>;
  const sast = (sp.sast || anyRaw.sast_results || {}) as {
    scan_error?: boolean; files_scanned?: number; filesScanned?: number;
    sast_findings?: Record<string, unknown>; sastFindings?: Record<string, unknown>;
  };
  const sastFiles = Number(sast.files_scanned ?? sast.filesScanned ?? 0);
  const sastFindings = sast.sast_findings || sast.sastFindings;
  const sastFindingsCount = sastFindings && typeof sastFindings === 'object' ? Object.keys(sastFindings).length : 0;
  const sastRan = sastFiles > 0 || sastFindingsCount > 0;

  if (sast.scan_error) {
    findings.push(mk('Limited code coverage',
      'The code analyzer (SAST) did not complete, so the extension’s code could not be checked. This is why it needs review — not a confirmed threat.',
      { kind: 'coverage', available: true, analyzer: 'SAST', reason: 'Code analysis (SAST) failed to complete', coverageState: 'failed', label: 'Coverage: SAST failed' }));
  } else if (!sastRan) {
    findings.push(mk('No analyzable code scanned',
      'No analyzable code was scanned (often minified or bundled code). The code was not statically analyzed, so it cannot be cleared as safe.',
      { kind: 'coverage', available: true, analyzer: 'SAST', reason: 'No analyzable code was scanned', coverageState: 'no_code_scanned', label: 'Coverage: no code scanned' }));
  }

  const vt = (sp.virustotal || {}) as { enabled?: boolean; total_engines?: number; files_found_in_vt?: number };
  const vtSummary = anyRaw.virustotal_analysis || {};
  const vtEnabled = vt.enabled ?? vtSummary.enabled;
  const vtEngines = Number(vt.total_engines ?? 0);
  const vtFound = Number(vtSummary.files_found_in_vt ?? vt.files_found_in_vt ?? 0);
  const vtAvailable = vtEnabled !== false && (vtEngines > 0 || vtFound > 0);
  if (!vtAvailable) {
    findings.push(mk('Limited malware reputation coverage',
      'The extension’s files were not found in VirusTotal (or the malware scan was unavailable), so malware reputation could not be confirmed.',
      { kind: 'coverage', available: true, analyzer: 'VirusTotal', reason: 'Files not found in VirusTotal, or the malware scan was unavailable', coverageState: 'unavailable', label: 'Coverage: VirusTotal unavailable' }));
  }

  if (findings.length === 0) {
    const reason = anyV2.coverage_cap_reason || anyRaw.governance_bundle?.scoring_v2?.coverage_cap_reason;
    const reasonText = typeof reason === 'string' && reason.trim()
      ? reason
      : 'Some analyzers did not run at scan time, so this extension could not be fully cleared.';
    findings.push(mk('Limited analysis coverage', reasonText,
      { kind: 'coverage', available: true, analyzer: 'multiple', reason: reasonText, coverageState: 'limited', label: 'Coverage limited' }));
  }
  return findings;
}

/**
 * Promote the governance Decision Authority's review/block reasons into Key
 * Findings when a governance RULE (rulepack) — not a hard gate — drives the
 * final verdict. Without this, a NEEDS_REVIEW/BLOCK caused by e.g. "Verify
 * clipboard access is limited to user-initiated copy/paste" is invisible in Key
 * Findings, leaving only an advisory factor (like publisher update age) showing.
 *
 * A triggered hard gate already produces its own prominent Key Finding, so this
 * only fires when no gate did — the exact case where the real reason is hidden.
 */
function buildGovernanceReasonKeyFindings(
  scoringV2: RawScoringV2 | null,
  raw: RawScanResult
): KeyFindingVM[] {
  const hardGates = scoringV2?.hard_gates_triggered || [];
  if (hardGates.length > 0) return [];

  const verdict = (resolveFinalVerdict(raw, scoringV2) || '').toUpperCase();
  if (verdict !== 'NEEDS_REVIEW' && verdict !== 'WARN' && verdict !== 'BLOCK') return [];

  const decision = (raw.governance_bundle?.decision || {}) as {
    final_reasons?: unknown; action_required?: unknown; rationale?: unknown;
  };
  let reasons = (Array.isArray(decision.final_reasons) ? decision.final_reasons : [])
    .filter((r): r is string => typeof r === 'string' && r.trim() !== '');
  if (reasons.length === 0 && typeof decision.action_required === 'string' && decision.action_required.trim()) {
    reasons = [decision.action_required];
  }
  if (reasons.length === 0) return [];

  const severity: FindingSeverity = verdict === 'BLOCK' ? 'high' : 'medium';
  const { rulepack, ruleId } = parseRulepackRule(decision.rationale);
  const actionRequired = typeof decision.action_required === 'string' ? decision.action_required : undefined;
  const label = rulepack && ruleId ? `Rule ${rulepack}::${ruleId}` : 'Governance rule';
  return reasons.slice(0, 3).map((reason) => ({
    title: reason,
    severity,
    layer: 'governance' as const,
    summary: reason,
    evidenceIds: [],
    evidence: {
      kind: 'governance' as const,
      available: true,
      rulepack, ruleId, finalReason: reason, actionRequired, label,
    },
  }));
}

/**
 * Build key findings from scoring_v2 data
 */
function buildKeyFindings(
  scoringV2: RawScoringV2 | null,
  raw: RawScanResult
): KeyFindingVM[] {
  const findings: KeyFindingVM[] = [];
  // Resolve evidence ids -> file/line/snippet once for factor findings below.
  const evLookup = buildEvidenceIndex(raw);

  // 1. Add hard gates as high severity findings with correct layer classification
  const hardGates = scoringV2?.hard_gates_triggered || [];
  hardGates.forEach((gate: string) => {
    const layer = gateIdToLayer(gate);
    findings.push({
      title: humanizeGateId(gate),
      severity: 'high',
      layer: layer,
      summary: humanizeGateId(gate),
      evidenceIds: [],
      evidence: {
        kind: 'governance',
        available: true,
        ruleId: gate,
        label: `Gate: ${humanizeGateId(gate)}`,
      },
    });
  });

  // 1b. Promote coverage-cap / insufficient-data reasons ahead of ordinary factor
  // findings (e.g. publisher update age) so the primary Key Finding explains the
  // real reason the extension needs review.
  buildCoverageKeyFindings(scoringV2, raw).forEach((f) => findings.push(f));

  // 1c. Promote the governance Decision Authority's review/block reasons when a
  // rulepack rule (not a hard gate) drives the verdict, so the actual review
  // cause appears ahead of ordinary factor findings.
  buildGovernanceReasonKeyFindings(scoringV2, raw).forEach((f) => findings.push(f));

  // 2. Add top 3 factors by riskContribution where severity >= 0.4
  const allFactors: Array<FactorVM & { layer: 'security' | 'privacy' | 'governance' }> = [];
  
  if (scoringV2?.security_layer?.factors) {
    scoringV2.security_layer.factors.forEach((f: RawFactorScore) => {
      const sev = f.severity ?? 0;
      if (sev < 0.4) return;
      // Publisher update age (Maintenance) under ~180 days (severity <= 0.4) is
      // routine context, not direct security evidence — keep it as layer detail,
      // never a Key Finding. It becomes eligible only at >180 days (severity >=
      // 0.6), and even then stays advisory (capped below) unless corroborated.
      if (f.name === 'Maintenance' && sev < 0.6) return;
      allFactors.push({
        name: safeGet(f.name, 'Unknown'),
        severity: safeGet(f.severity, 0),
        confidence: safeGet(f.confidence, 0),
        weight: f.weight,
        riskContribution: f.contribution,
        evidenceIds: safeGet(f.evidence_ids, []),
        details: f.details,
        layer: 'security',
      });
    });
  }

  if (scoringV2?.privacy_layer?.factors) {
    scoringV2.privacy_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
        allFactors.push({
          name: safeGet(f.name, 'Unknown'),
          severity: safeGet(f.severity, 0),
          confidence: safeGet(f.confidence, 0),
          weight: f.weight,
          riskContribution: f.contribution,
          evidenceIds: safeGet(f.evidence_ids, []),
          details: f.details,
          layer: 'privacy',
        });
      }
    });
  }
  
  if (scoringV2?.governance_layer?.factors) {
    scoringV2.governance_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
        allFactors.push({
          name: safeGet(f.name, 'Unknown'),
          severity: safeGet(f.severity, 0),
          confidence: safeGet(f.confidence, 0),
          weight: f.weight,
          riskContribution: f.contribution,
          evidenceIds: safeGet(f.evidence_ids, []),
          details: f.details,
          layer: 'governance',
        });
      }
    });
  }
  
  // Publisher update age (Maintenance) is an advisory trust signal, not a
  // code-safety finding. It must not be the SOLE high-severity key finding on its
  // own — cap it at "medium" unless corroborated by a triggered gate or another
  // genuinely high-severity factor.
  const hasStrongEvidence =
    hardGates.length > 0 ||
    allFactors.some((f) => f.name !== 'Maintenance' && (f.severity ?? 0) >= 0.7);

  // Sort by contribution (descending) and take top 3
  allFactors
    .sort((a, b) => (b.riskContribution ?? 0) - (a.riskContribution ?? 0))
    .slice(0, 3)
    .forEach((factor) => {
      const humanTitle = humanizeFactorName(factor.name);
      const details = factor.details || {};
      const desc = typeof details === 'object' ? (details as any).description : '';

      let findingSeverity = severityToFindingLevel(factor.severity);
      if (factor.name === 'Maintenance' && findingSeverity === 'high' && !hasStrongEvidence) {
        findingSeverity = 'medium';
      }

      const level = findingSeverity === 'high' ? 'significant' : findingSeverity === 'medium' ? 'moderate' : 'minor';
      const summary = desc || `${level.charAt(0).toUpperCase() + level.slice(1)} findings in ${humanTitle.toLowerCase()}`;

      findings.push({
        title: humanTitle,
        severity: findingSeverity,
        layer: factor.layer,
        summary,
        evidenceIds: factor.evidenceIds,
        evidence: resolveFactorEvidence(factor, raw, evLookup),
      });
    });
  
  // 3. If no findings yet, add decision_reasons as low severity
  if (findings.length === 0) {
    const reasons = scoringV2?.decision_reasons || scoringV2?.reasons || [];
    reasons.forEach((reason: string) => {
      findings.push({
        title: reason,
        severity: 'low',
        layer: 'governance',
        summary: reason,
        evidenceIds: [],
        evidence: { kind: 'summary', available: false },
      });
    });
  }

  // 4. If still no findings, add from legacy summary.key_findings
  if (findings.length === 0 && raw.summary?.key_findings) {
    raw.summary.key_findings.forEach((finding: string) => {
      findings.push({
        title: finding,
        severity: 'medium',
        layer: 'security',
        summary: finding,
        evidenceIds: [],
        evidence: { kind: 'summary', available: false },
      });
    });
  }

  return findings;
}

/**
 * Build permissions view model
 */
function buildPermissions(raw: RawScanResult): PermissionsVM {
  const manifest = raw.manifest;
  const permsAnalysis = raw.permissions_analysis;
  
  // Support both raw API format (manifest.permissions as string[]) 
  // and formatted data (permissions as array of {name, description, risk})
  const formattedPerms = (raw as unknown as { 
    permissions?: Array<{ name: string; description?: string; risk?: string }> 
  }).permissions;
  
  let apiPermissions: string[] = manifest?.permissions || [];
  let hostPermissions: string[] = manifest?.host_permissions || [];
  
  // If formatted permissions exist, extract permission names
  if (formattedPerms && Array.isArray(formattedPerms) && formattedPerms.length > 0 && typeof formattedPerms[0] === 'object') {
    apiPermissions = formattedPerms.map(p => p.name || String(p));
  }
  
  // Identify high-risk permissions
  const highRiskPerms = [
    '<all_urls>', 'webRequest', 'webRequestBlocking', 'clipboardRead',
    'clipboardWrite', 'history', 'management', 'nativeMessaging', 
    'debugger', 'cookies', 'tabs', 'webNavigation',
  ];
  const highRiskPermissions = apiPermissions.filter((p: string) =>
    highRiskPerms.some((hrp) => p.toLowerCase().includes(hrp.toLowerCase()))
  );
  
  // Find unreasonable permissions from analysis or formatted data
  const unreasonablePermissions: string[] = [];
  if (permsAnalysis?.permissions_details) {
    Object.entries(permsAnalysis.permissions_details).forEach(([name, details]) => {
      if (details && details.is_reasonable === false) {
        unreasonablePermissions.push(name);
      }
    });
  } else if (formattedPerms && Array.isArray(formattedPerms)) {
    // Formatted data has risk field - HIGH risk permissions are unreasonable
    formattedPerms.forEach(p => {
      if (typeof p === 'object' && p.risk === 'HIGH') {
        unreasonablePermissions.push(p.name);
      }
    });
  }
  
  // Identify broad host patterns
  const broadPatterns = ['<all_urls>', '*://*/*', 'http://*/*', 'https://*/*'];
  const broadHostPatterns = hostPermissions.filter((p: string) =>
    broadPatterns.some((bp) => p.includes(bp))
  );
  
  return {
    apiPermissions: apiPermissions.length > 0 ? apiPermissions : undefined,
    hostPermissions: hostPermissions.length > 0 ? hostPermissions : undefined,
    highRiskPermissions: highRiskPermissions.length > 0 ? highRiskPermissions : undefined,
    unreasonablePermissions: unreasonablePermissions.length > 0 ? unreasonablePermissions : undefined,
    broadHostPatterns: broadHostPatterns.length > 0 ? broadHostPatterns : undefined,
  };
}

// =============================================================================
// MAIN NORMALIZER
// =============================================================================

/**
 * Normalize a raw scan result into a ReportViewModel
 * 
 * @param raw - The raw API response
 * @returns ReportViewModel - Normalized data for UI consumption
 * @throws Error if critical fields are missing (extensionId)
 */
export function normalizeScanResult(raw: RawScanResult): ReportViewModel {
  // Validate critical fields
  // Support both snake_case (raw API) and camelCase (formatted data)
  const extensionId = raw.extension_id || (raw as unknown as { extensionId?: string }).extensionId;
  if (!extensionId) {
    // console.error('[normalizeScanResult] Missing extension_id in raw result'); // prod: no console
    throw new Error('Invalid scan result: missing extension_id');
  }
  
  // Get scoring v2 data (primary source)
  const scoringV2 = getScoringV2(raw);
  
  // Cast to support both raw API fields and formatted camelCase fields
  const formatted = raw as unknown as {
    name?: string;
    version?: string;
    securityScore?: number;
    riskLevel?: string;
  };

  // Chrome extension IDs are exactly 32 lowercase letters [a-p] - don't use as display name
  function looksLikeExtensionId(s: string | undefined | null): boolean {
    if (!s || typeof s !== 'string') return false;
    return /^[a-p]{32}$/.test(s.trim());
  }

  const isI18nPlaceholderStr = (s: string): boolean => /^__MSG_[A-Za-z0-9@_]+__$/.test(s.trim());
  const isRawJsonChaffStr = (s: string): boolean => {
    const t = s.trim();
    return t === '[]' || t === '{}' || t === 'null' || t === 'undefined';
  };

  const nameCandidates = [
    raw.extension_name,
    formatted.name,
    raw.metadata?.title,
    raw.metadata?.name,
    (raw.metadata as { chrome_stats?: { name?: string } })?.chrome_stats?.name,
    raw.manifest?.name,
  ].filter((n): n is string =>
    typeof n === 'string' &&
    n.trim() !== '' &&
    !looksLikeExtensionId(n) &&
    !isI18nPlaceholderStr(n) &&
    !isRawJsonChaffStr(n)
  );

  let resolvedName = nameCandidates[0] || null;

  // Fallback: derive name from one-liner/summary when it's in the form "Extension Name appears safe for general use"
  if (!resolvedName) {
    const oneLiner =
      (raw.report_view_model as { scorecard?: { one_liner?: string }; summary?: string })?.scorecard?.one_liner
      || (raw.report_view_model as { summary?: string })?.summary
      || (raw.summary as { one_liner?: string; summary?: string })?.one_liner
      || (raw.summary as { summary?: string })?.summary;
    if (typeof oneLiner === 'string' && oneLiner.trim()) {
      const match = oneLiner.match(/^(.+?)\s+(?:appears|is)\s+(?:safe|unsafe|not safe|for general use)/i)
        || oneLiner.match(/^(.+?)\s+for general use/i);
      if (match && match[1]) {
        const extracted = match[1].trim();
        if (extracted.length > 1 && !looksLikeExtensionId(extracted)) {
          resolvedName = extracted;
        }
      }
    }
  }

  // Build meta information (icon URL: use getExtensionIconUrl(extensionId) at display time)
  const meta: MetaVM = {
    extensionId,
    name: resolvedName || 'Unknown Extension',
    version: raw.metadata?.version || raw.manifest?.version || formatted.version,
    updatedAt: raw.metadata?.last_updated,
    users: raw.metadata?.user_count,
    rating: raw.metadata?.rating,
    ratingCount: raw.metadata?.ratings_count,
    storeUrl: raw.url,
    scanTimestamp: raw.timestamp,
  };
  
  // Build scores
  // Final verdict prefers the governance Decision Authority over scoring-layer detail.
  const decision = normalizeDecision(resolveFinalVerdict(raw, scoringV2));
  const insufficientData = resolveInsufficientData(raw, scoringV2);
  const decisionAuthority =
    raw.decision_authority ||
    scoringV2?.decision_authority ||
    raw.governance_bundle?.decision?.final_authority ||
    null;
  
  // Get scores from scoring_v2 or fallback to legacy (also support formatted camelCase)
  const securityScore = scoringV2?.security_score ?? raw.security_score ?? raw.overall_security_score ?? formatted.securityScore ?? null;
  const privacyScore = scoringV2?.privacy_score ?? raw.privacy_score ?? null;
  const governanceScore = scoringV2?.governance_score ?? raw.governance_score ?? null;
  const overallScore = scoringV2?.overall_score ?? raw.overall_security_score ?? formatted.securityScore ?? null;
  const overallConfidence = scoringV2?.overall_confidence ?? raw.overall_confidence ?? null;
  
  // Helper: get band for a layer (prefer risk_level from scoring_v2, fallback to score thresholds)
  const getLayerBand = (layer: RawLayerScore | null | undefined, score: number | null): ScoreBand => {
    const riskLevelBand = bandFromRiskLevel(layer?.risk_level);
    if (riskLevelBand !== null) return riskLevelBand;
    return bandFromScore(score);
  };
  
  // Helper: get overall band (prefer overall risk_level, fallback to score thresholds).
  // The risk_level is floored by the authoritative verdict first, so a BLOCK/
  // NEEDS_REVIEW can never render a "low"/"none" (green) overall band.
  const getOverallBand = (): ScoreBand => {
    const riskLevelBand = bandFromRiskLevel(
      coherentRiskLevel(resolveFinalVerdict(raw, scoringV2), scoringV2?.risk_level)
    );
    if (riskLevelBand !== null) return riskLevelBand;
    return bandFromScore(overallScore);
  };
  
  // Compute gate-based bands per layer
  // Gate severity should visually affect the corresponding layer tile (without changing numeric score)
  const gateResults = scoringV2?.gate_results || [];
  const gateBandsByLayer: Record<'security' | 'privacy' | 'governance', ScoreBand | null> = {
    security: null,
    privacy: null,
    governance: null,
  };
  
  // Process gate results: if ANY BLOCK-level gate belongs to a layer -> BAD
  // Else if ANY WARN/NEEDS_REVIEW gate belongs to that layer -> WARN
  for (const gateResult of gateResults) {
    if (!gateResult.gate_id || !gateResult.triggered) continue;
    
    const layer = gateIdToLayer(gateResult.gate_id);
    const gateBand = gateDecisionToBand(gateResult.decision);
    
    if (gateBand) {
      // Use the most severe gate band for this layer
      const current = gateBandsByLayer[layer];
      if (!current || current === 'NA') {
        gateBandsByLayer[layer] = gateBand;
      } else {
        // Order: GOOD < WARN < BAD
        const severity: Record<ScoreBand, number> = {
          'GOOD': 1,
          'WARN': 2,
          'BAD': 3,
          'NA': 0,
        };
        if (severity[gateBand] > severity[current]) {
          gateBandsByLayer[layer] = gateBand;
        }
      }
    }
  }
  
  // Compute effective bands: max(scoreBand, gateBand) using ordering GOOD < WARN < BAD
  const securityScoreBand = getLayerBand(scoringV2?.security_layer, securityScore);
  const privacyScoreBand = getLayerBand(scoringV2?.privacy_layer, privacyScore);
  const governanceScoreBand = getLayerBand(scoringV2?.governance_layer, governanceScore);
  const overallScoreBand = getOverallBand();
  
  // Effective band = max(scoreBand, gateBand, factorIssueBand). The last term
  // prevents a layer that lists an ISSUE-level row from rendering as "Safe".
  const securityEffectiveBand = computeEffectiveBand(
    computeEffectiveBand(securityScoreBand, gateBandsByLayer.security),
    factorIssueBand(scoringV2?.security_layer),
  );
  const privacyEffectiveBand = computeEffectiveBand(
    computeEffectiveBand(privacyScoreBand, gateBandsByLayer.privacy),
    factorIssueBand(scoringV2?.privacy_layer),
  );
  const governanceEffectiveBand = computeEffectiveBand(
    computeEffectiveBand(governanceScoreBand, gateBandsByLayer.governance),
    factorIssueBand(scoringV2?.governance_layer),
  );

  // The headline (overall) gauge MUST reflect the authoritative verdict, never
  // just the score. A BLOCK or NEEDS_REVIEW with a high score must not render as
  // a green "Safe" gauge. Map the final decision to a band and take the more
  // severe of (score band, verdict band). ALLOW maps to null (no override) so a
  // genuinely-clean extension still uses its score band. (Audit Fix #3.)
  const verdictBand = gateDecisionToBand(decision);
  const overallEffectiveBand = computeEffectiveBand(overallScoreBand, verdictBand);
  
  const scores: ScoresVM = {
    security: {
      score: securityScore,
      band: securityEffectiveBand, // effectiveBand includes gate override
      confidence: scoringV2?.security_layer?.confidence ?? null,
    },
    privacy: {
      score: privacyScore,
      band: privacyEffectiveBand, // effectiveBand includes gate override
      confidence: scoringV2?.privacy_layer?.confidence ?? null,
    },
    governance: {
      score: governanceScore,
      band: governanceEffectiveBand, // effectiveBand includes gate override
      confidence: scoringV2?.governance_layer?.confidence ?? null,
    },
    overall: {
      score: overallScore,
      band: overallEffectiveBand, // headline gauge reflects the authoritative verdict
      confidence: overallConfidence,
    },
    decision,
    reasons: scoringV2?.decision_reasons || scoringV2?.reasons || raw.decision_reasons_v2 || [],
    insufficientData,
    decisionAuthority,
  };
  
  // Build factors by layer
  const factorsByLayer: FactorsByLayerVM = {
    security: getLayerFactors(scoringV2?.security_layer),
    privacy: getLayerFactors(scoringV2?.privacy_layer),
    governance: getLayerFactors(scoringV2?.governance_layer),
  };
  
  // Build key findings
  const keyFindings = buildKeyFindings(scoringV2, raw);
  
  // Build permissions
  const permissions = buildPermissions(raw);
  
  // Build evidence index
  const evidenceIndex = buildEvidenceIndex(raw);

  // Map consumer insights (from backend report_view_model or top-level fallback)
  const consumerRaw = raw?.report_view_model?.consumer_insights || raw?.consumer_insights;
  const consumerInsights: ConsumerInsights | undefined = (
    consumerRaw && typeof consumerRaw === 'object'
  ) ? {
    safety_label: Array.isArray(consumerRaw.safety_label) ? consumerRaw.safety_label : [],
    scenarios: Array.isArray(consumerRaw.scenarios) ? consumerRaw.scenarios : [],
    top_drivers: Array.isArray(consumerRaw.top_drivers) ? consumerRaw.top_drivers : [],
  } : undefined;

  const pd = raw.publisher_disclosures;
  const publisherDisclosures = pd
    ? {
        trader_status: (pd.trader_status === 'TRADER' || pd.trader_status === 'NON_TRADER'
          ? pd.trader_status
          : 'UNKNOWN') as 'TRADER' | 'NON_TRADER' | 'UNKNOWN',
        developer_website_url: pd.developer_website_url ?? null,
        support_email: pd.support_email ?? null,
        privacy_policy_url: pd.privacy_policy_url ?? null,
        user_count: pd.user_count ?? null,
        rating_value: pd.rating_value ?? null,
        rating_count: pd.rating_count ?? null,
        last_updated_iso: pd.last_updated_iso ?? null,
      }
    : undefined;

  return {
    meta,
    scores,
    factorsByLayer,
    keyFindings,
    permissions,
    evidenceIndex,
    consumerInsights,
    publisherDisclosures,
  };
}

/**
 * Safe normalizer that returns null instead of throwing
 * Use this when you want to handle missing data gracefully
 */
export function normalizeScanResultSafe(raw: RawScanResult | null | undefined): ReportViewModel | null {
  if (!raw) {
    // console.warn('[normalizeScanResultSafe] Received null or undefined raw result'); // prod: no console
    return null;
  }
  
  try {
    return normalizeScanResult(raw);
  } catch (error) {
    // console.error('[normalizeScanResultSafe] Failed to normalize scan result:', error); // prod: no console
    return null;
  }
}

/**
 * Create an empty/placeholder view model for loading states
 */
export function createEmptyReportViewModel(extensionId: string = ''): ReportViewModel {
  return {
    meta: {
      extensionId,
      name: 'Loading...',
    },
    scores: {
      security: { score: null, band: 'NA', confidence: null },
      privacy: { score: null, band: 'NA', confidence: null },
      governance: { score: null, band: 'NA', confidence: null },
      overall: { score: null, band: 'NA', confidence: null },
      decision: null,
      reasons: [],
    },
    factorsByLayer: {
      security: [],
      privacy: [],
      governance: [],
    },
    keyFindings: [],
    permissions: {},
    evidenceIndex: {},
  };
}

/**
 * Check if a ReportViewModel has scoring data
 */
export function hasScoring(vm: ReportViewModel): boolean {
  return vm.scores.overall.score !== null;
}

/**
 * Check if a ReportViewModel has scoring_v2 data (vs legacy)
 */
export function hasScoringV2(vm: ReportViewModel): boolean {
  return (
    vm.scores.security.confidence !== null ||
    vm.scores.privacy.score !== null ||
    vm.scores.governance.score !== null
  );
}

/**
 * Collect all evidence IDs referenced in the view model
 */
export function collectReferencedEvidenceIds(vm: ReportViewModel): string[] {
  const ids = new Set<string>();
  
  // From factors
  [...vm.factorsByLayer.security, ...vm.factorsByLayer.privacy, ...vm.factorsByLayer.governance]
    .forEach((factor) => {
      factor.evidenceIds.forEach((id) => ids.add(id));
    });
  
  // From key findings
  vm.keyFindings.forEach((finding) => {
    finding.evidenceIds.forEach((id) => ids.add(id));
  });
  
  return Array.from(ids);
}

/**
 * Validate evidence integrity - warns if evidence_ids are referenced but evidenceIndex is empty
 * Call this after normalization to detect data issues early
 */
export function validateEvidenceIntegrity(vm: ReportViewModel): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  const referencedIds = collectReferencedEvidenceIds(vm);
  const indexKeys = Object.keys(vm.evidenceIndex);
  
  // Check if evidence_ids exist but evidenceIndex is empty
  if (referencedIds.length > 0 && indexKeys.length === 0) {
    const warning = `Evidence IDs exist (${referencedIds.length}) but evidenceIndex is empty`;
    // console.warn(`[validateEvidenceIntegrity] ${warning}`); // prod: no console
    warnings.push(warning);
  }
  
  // Check for orphaned evidence IDs (referenced but not in index)
  const orphanedIds = referencedIds.filter((id) => !vm.evidenceIndex[id]);
  if (orphanedIds.length > 0 && indexKeys.length > 0) {
    const warning = `${orphanedIds.length} evidence ID(s) referenced but not found in evidenceIndex: ${orphanedIds.slice(0, 3).join(', ')}${orphanedIds.length > 3 ? '...' : ''}`;
    // console.warn(`[validateEvidenceIntegrity] ${warning}`); // prod: no console
    warnings.push(warning);
  }
  
  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Check if we're in development mode
 */
export function isDevelopmentMode(): boolean {
  try {
    // Vite dev mode check
    return import.meta.env?.DEV === true || import.meta.env?.MODE === 'development';
  } catch {
    // Fallback for non-Vite environments
    return process.env.NODE_ENV === 'development';
  }
}

// Default export
export default normalizeScanResult;

