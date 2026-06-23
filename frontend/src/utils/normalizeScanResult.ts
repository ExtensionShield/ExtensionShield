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
  Maintenance: 'Update Freshness',
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

function humanizeGateId(gateId: string): string {
  return GATE_HUMAN_TITLE[gateId] || GATE_HUMAN_TITLE[gateId.toUpperCase()] || gateId.replace(/_/g, ' ').toLowerCase();
}

function humanizeFactorName(name: string): string {
  return FACTOR_HUMAN_TITLE[name] || name.replace(/([A-Z])/g, ' $1').trim();
}

function humanizeSastCheckId(checkId: string): string {
  return SAST_HUMAN_TITLE[checkId] || checkId.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
  if (raw.scoring_v2) return raw.scoring_v2;
  if (raw.governance_bundle?.scoring_v2) return raw.governance_bundle.scoring_v2;
  return null;
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
 * Build key findings from scoring_v2 data
 */
function buildKeyFindings(
  scoringV2: RawScoringV2 | null,
  raw: RawScanResult
): KeyFindingVM[] {
  const findings: KeyFindingVM[] = [];
  
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
    });
  });
  
  // 2. Add top 3 factors by riskContribution where severity >= 0.4
  const allFactors: Array<FactorVM & { layer: 'security' | 'privacy' | 'governance' }> = [];
  
  if (scoringV2?.security_layer?.factors) {
    scoringV2.security_layer.factors.forEach((f: RawFactorScore) => {
      if ((f.severity ?? 0) >= 0.4) {
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
      }
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
  
  // Sort by contribution (descending) and take top 3
  allFactors
    .sort((a, b) => (b.riskContribution ?? 0) - (a.riskContribution ?? 0))
    .slice(0, 3)
    .forEach((factor) => {
      const humanTitle = humanizeFactorName(factor.name);
      const details = factor.details || {};
      const desc = typeof details === 'object' ? (details as any).description : '';
      const level = factor.severity >= 0.7 ? 'significant' : factor.severity >= 0.4 ? 'moderate' : 'minor';
      const summary = desc || `${level.charAt(0).toUpperCase() + level.slice(1)} findings in ${humanTitle.toLowerCase()}`;

      findings.push({
        title: humanTitle,
        severity: severityToFindingLevel(factor.severity),
        layer: factor.layer,
        summary,
        evidenceIds: factor.evidenceIds,
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
  
  // Helper: get overall band (prefer overall risk_level, fallback to score thresholds)
  const getOverallBand = (): ScoreBand => {
    const riskLevelBand = bandFromRiskLevel(scoringV2?.risk_level);
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

