// Pure helpers for presenting a scoring layer's factors. Kept in a separate
// module (no React components) so they stay unit-testable and don't trip
// react-refresh/only-export-components in the LayerModal component file.

import { toRelativeEvidencePath } from '../../utils/normalizeScanResult';

// Local-filesystem fragments that must never reach the UI (matches the audited
// LEAK_FRAGMENTS guard). Used to scrub free-text captions before display.
const LOCAL_PATH_RE = /\/Users\/|\/home\/|extensions_storage|extracted_|[A-Za-z]:[\\/]/;

/**
 * Scrub a free-text caption so it can never render a local absolute path.
 * Path-like tokens are rewritten to their extension-relative form; if anything
 * still looks local afterward, the caption is dropped entirely (returns '').
 */
function scrubLocalPaths(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  if (!LOCAL_PATH_RE.test(s)) return s;
  const cleaned = s.replace(/\S+/g, (tok) => (LOCAL_PATH_RE.test(tok) ? toRelativeEvidencePath(tok) : tok));
  return LOCAL_PATH_RE.test(cleaned) ? '' : cleaned;
}

function asStringArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(asStringArray).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

function humanizeSignalToken(token) {
  return String(token || '')
    .trim()
    .replace(/^prohibited_perm:/, '')
    .replace(/broad_host_access/g, 'broad host access')
    .replace(/travel_docs_tos_automation_risk/g, 'travel-docs automation policy risk')
    .replace(/travel_docs_third_party_processor_risk/g, 'travel-docs third-party processor policy risk')
    .replace(/broad_access_with_vt_detection/g, 'broad access with malware reputation detection')
    .replace(/\+/g, ' + ')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

function summarizeTokens(values, limit = 5) {
  const unique = Array.from(new Set(values.map(humanizeSignalToken).filter(Boolean)));
  if (!unique.length) return '';
  const shown = unique.slice(0, limit).join(', ');
  return unique.length > limit ? `${shown} +${unique.length - limit} more` : shown;
}

/**
 * Build a short, truthful evidence caption for a single factor from real
 * analyzer output only — never invents text. Preference order:
 *   1. an explicit human `description` from the analyzer,
 *   2. publisher update age (`days_since_update`),
 *   3. a file[:line] reference (path always made extension-relative),
 *   4. a `reason` string.
 * Returns '' when the factor carries no presentable evidence. Any path is run
 * through the leak guard so `/Users`, `/home`, `extensions_storage`, and
 * `extracted_` fragments can never render.
 */
export function factorEvidenceCaption(factor) {
  const details = (factor && typeof factor.details === 'object' && factor.details) || {};

  if (typeof details.description === 'string' && details.description.trim()) {
    return scrubLocalPaths(details.description);
  }

  if (factor?.name === 'PermissionsBaseline') {
    const permissions = [
      ...asStringArray(details.high_risk_permissions),
      ...asStringArray(details.unreasonable_permissions),
      ...asStringArray(details.permission),
      ...asStringArray(details.permission_name),
    ];
    const text = summarizeTokens(permissions);
    if (text) return `Sensitive permissions: ${text}`;
  }

  if (factor?.name === 'PermissionCombos') {
    const combos = [
      ...asStringArray(details.triggered_combos),
      ...asStringArray(details.combo),
      ...asStringArray(details.combination),
    ];
    const text = summarizeTokens(combos);
    if (text) return `Combination: ${text}`;
  }

  if (factor?.name === 'ToSViolations') {
    const text = summarizeTokens(asStringArray(details.violations));
    if (text) return `Potential policy flags: ${text}`;
  }

  const days = details.days_since_update;
  if (typeof days === 'number' && Number.isFinite(days) && days >= 0) {
    return `Last updated ${days} day${days === 1 ? '' : 's'} ago`;
  }

  const file = details.file ?? details.path ?? details.file_path;
  if (typeof file === 'string' && file.trim()) {
    const rel = toRelativeEvidencePath(file);
    const lineRaw = details.line ?? details.line_number;
    const line = Number(lineRaw);
    return Number.isFinite(line) && line > 0 ? `${rel}:${line}` : rel;
  }

  if (typeof details.reason === 'string' && details.reason.trim()) {
    return scrubLocalPaths(details.reason);
  }

  return '';
}

function pushEvidenceRow(rows, key, value, kind = 'text') {
  const safeValue = scrubLocalPaths(value);
  if (!safeValue) return;
  rows.push({ key, value: safeValue, kind });
}

function fileLineValue(file, lineRaw, lineEndRaw) {
  if (typeof file !== 'string' || !file.trim()) return '';
  const rel = toRelativeEvidencePath(file);
  const line = Number(lineRaw);
  const lineEnd = Number(lineEndRaw);
  if (!Number.isFinite(line) || line <= 0) return rel;
  return Number.isFinite(lineEnd) && lineEnd > line ? `${rel}:${line}-${lineEnd}` : `${rel}:${line}`;
}

function severityRank(statusType, severity) {
  if (statusType !== 'issues') return 0;
  if (severity >= 0.7) return 3;
  if (severity >= 0.4) return 2;
  return 1;
}

function normalizeTitle(title) {
  return String(title || '').trim().toLowerCase();
}

function findingLevel(finding) {
  const severity = finding?.severity;
  if (typeof severity === 'number') {
    if (severity >= 0.66) return 'high';
    if (severity >= 0.4) return 'medium';
    if (severity > 0) return 'low';
    return 'info';
  }
  const s = String(severity || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'high';
  if (s === 'moderate' || s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  return 'info';
}

function statusForFinding(finding) {
  const level = findingLevel(finding);
  if (level === 'high') return { status: 'High severity', tone: 'bad', severity: 0.8 };
  if (level === 'medium') return { status: 'Issue', tone: 'warn', severity: 0.5 };
  if (level === 'low') return { status: 'Low', tone: 'neutral', severity: 0.2 };
  return { status: 'Info', tone: 'neutral', severity: 0 };
}

export function factorEvidenceDetails(factor) {
  const details = (factor && typeof factor.details === 'object' && factor.details) || {};
  const rows = [];

  const permission = details.permission ?? details.permission_name ?? details.host_permission;
  pushEvidenceRow(rows, permission === details.host_permission ? 'Host permission' : 'Permission', permission);

  const hostPermission = details.hostPermission ?? details.host_permissions ?? details.host;
  if (hostPermission !== permission) pushEvidenceRow(rows, 'Host access', hostPermission);

  const highRiskPermissions = summarizeTokens([
    ...asStringArray(details.high_risk_permissions),
    ...asStringArray(details.unreasonable_permissions),
  ]);
  pushEvidenceRow(rows, 'Sensitive permissions', highRiskPermissions);

  const triggeredCombos = summarizeTokens([
    ...asStringArray(details.triggered_combos),
    ...asStringArray(details.combo),
    ...asStringArray(details.combination),
  ]);
  pushEvidenceRow(rows, 'Combination', triggeredCombos);

  const policyFlags = summarizeTokens(asStringArray(details.violations));
  pushEvidenceRow(rows, 'Policy flags', policyFlags);

  const manifestField = details.manifest_field ?? details.manifestField ?? details.field;
  pushEvidenceRow(rows, 'Manifest', manifestField);

  const ruleId = details.rule_id ?? details.ruleId;
  const rulepack = details.rulepack ?? details.rule_pack;
  if (rulepack || ruleId) {
    pushEvidenceRow(rows, 'Rule', rulepack ? `${rulepack}${ruleId ? `::${ruleId}` : ''}` : ruleId);
  }

  const file = details.file ?? details.path ?? details.file_path;
  const fileValue = fileLineValue(file, details.line ?? details.line_number, details.line_end ?? details.end_line);
  pushEvidenceRow(rows, 'File', fileValue);

  const snippet = details.snippet ?? details.code_snippet ?? details.sample_match;
  pushEvidenceRow(rows, 'Snippet', snippet, 'snippet');

  const malicious = details.malicious ?? details.total_malicious;
  const suspicious = details.suspicious ?? details.total_suspicious;
  const hash = details.hash ?? details.sha256;
  if (malicious != null || suspicious != null || hash) {
    const parts = [];
    if (malicious != null) parts.push(`${Number(malicious) || 0} malicious`);
    if (suspicious != null) parts.push(`${Number(suspicious) || 0} suspicious`);
    if (hash) parts.push(String(hash).slice(0, 16));
    pushEvidenceRow(rows, 'VirusTotal', parts.join(' · '));
  }

  const analyzer = details.analyzer ?? details.coverage_analyzer;
  const coverageReason = details.coverage_reason ?? details.reason;
  if (analyzer || details.network_analysis_enabled === false) {
    pushEvidenceRow(
      rows,
      'Coverage',
      `${analyzer || 'Analyzer'}${coverageReason ? ` - ${coverageReason}` : details.network_analysis_enabled === false ? ' - network analysis was not available' : ''}`
    );
  } else if (coverageReason && rows.length === 0) {
    pushEvidenceRow(rows, 'Reason', coverageReason);
  }

  return rows;
}

export function findingEvidenceDetails(finding) {
  const evidence = finding?.evidence || {};
  const rows = [];

  const fileValue = fileLineValue(
    evidence.filePath,
    evidence.lineStart ?? evidence.line,
    evidence.lineEnd
  );
  pushEvidenceRow(rows, 'File', fileValue);
  pushEvidenceRow(rows, 'Snippet', evidence.snippet, 'snippet');
  pushEvidenceRow(rows, 'Permission', evidence.permission);
  pushEvidenceRow(rows, 'Host access', evidence.hostPermission);
  pushEvidenceRow(rows, 'Manifest', evidence.manifestField);

  if (evidence.rulepack || evidence.ruleId) {
    pushEvidenceRow(rows, 'Rule', evidence.rulepack ? `${evidence.rulepack}${evidence.ruleId ? `::${evidence.ruleId}` : ''}` : evidence.ruleId);
  }
  pushEvidenceRow(rows, 'Reason', evidence.finalReason ?? evidence.reason ?? evidence.explanation);
  pushEvidenceRow(rows, 'Action', evidence.actionRequired);

  if (evidence.malicious != null || evidence.suspicious != null || evidence.hash || evidence.coverageState) {
    const parts = [];
    if (evidence.malicious != null) parts.push(`${Number(evidence.malicious) || 0} malicious`);
    if (evidence.suspicious != null) parts.push(`${Number(evidence.suspicious) || 0} suspicious`);
    if (evidence.coverageState) parts.push(evidence.coverageState);
    if (evidence.hash) parts.push(String(evidence.hash).slice(0, 16));
    pushEvidenceRow(rows, 'VirusTotal', parts.join(' · '));
  }

  if (evidence.analyzer || evidence.kind === 'coverage') {
    pushEvidenceRow(rows, 'Coverage', `${evidence.analyzer || 'Analyzer'}${evidence.reason ? ` - ${evidence.reason}` : ''}`);
  }

  return rows;
}

function factorIssueRow(item, index) {
  return {
    id: `factor-${normalizeTitle(item.label) || index}`,
    title: item.label,
    category: item.category,
    source: item.category,
    status: item.status,
    statusType: item.statusType,
    tone: item.tone,
    severity: item.severity,
    evidence: item.evidence,
    evidenceRows: factorEvidenceDetails(item.raw),
    description: item.desc,
    sortRank: severityRank(item.statusType, item.severity),
  };
}

function findingIssueRow(finding, index) {
  const status = statusForFinding(finding);
  const evidence = finding?.evidence || {};
  const evidenceCaption = scrubLocalPaths(evidence.label || finding?.summary || '');
  return {
    id: `finding-${normalizeTitle(finding?.title) || index}`,
    title: finding?.displayTitle || finding?.title || 'Issue',
    category: finding?.category || finding?.layer || 'issue',
    source: finding?.category || evidence.kind || finding?.layer || 'Finding',
    status: status.status,
    statusType: 'issues',
    tone: status.tone,
    severity: status.severity,
    evidence: evidenceCaption,
    evidenceRows: findingEvidenceDetails(finding),
    description: scrubLocalPaths(finding?.summary || ''),
    sortRank: severityRank('issues', status.severity),
  };
}

function gateIssueRow(gate, index) {
  const reasons = Array.isArray(gate?.reasons) ? gate.reasons : [];
  const rows = [];
  pushEvidenceRow(rows, 'Rule', gate?.gate_id);
  reasons.forEach((reason, idx) => pushEvidenceRow(rows, idx === 0 ? 'Reason' : 'Reason', reason));
  return {
    id: `gate-${gate?.gate_id || index}`,
    title: gate?.gate_id ? String(gate.gate_id).replace(/_/g, ' ') : 'Triggered gate',
    category: 'gate',
    source: 'Gate',
    status: gate?.decision || 'Issue',
    statusType: 'issues',
    tone: 'bad',
    severity: 0.8,
    evidence: scrubLocalPaths(reasons[0] || ''),
    evidenceRows: rows,
    sortRank: 3,
  };
}

export function buildLayerModalModel({ factors = [], keyFindings = [], gateResults = [], layerReasons = [] } = {}) {
  const { all, issues, notAnalyzed, cleared } = triageFactors(factors);
  const issueRows = [];
  const seen = new Set();

  (Array.isArray(keyFindings) ? keyFindings : [])
    .filter((finding) => finding && finding.title)
    .forEach((finding, index) => {
      const row = findingIssueRow(finding, index);
      const key = normalizeTitle(row.title);
      if (seen.has(key)) return;
      seen.add(key);
      issueRows.push(row);
    });

  issues.forEach((item, index) => {
    const row = factorIssueRow(item, index);
    const key = normalizeTitle(row.title);
    if (seen.has(key)) return;
    seen.add(key);
    issueRows.push(row);
  });

  (Array.isArray(gateResults) ? gateResults : [])
    .filter((gate) => gate && gate.triggered)
    .forEach((gate, index) => {
      const row = gateIssueRow(gate, index);
      const key = normalizeTitle(row.title);
      if (seen.has(key)) return;
      seen.add(key);
      issueRows.push(row);
    });

  issueRows.sort((a, b) => (b.sortRank - a.sortRank) || (b.severity - a.severity));

  return {
    all,
    issues: issueRows,
    notAnalyzed: notAnalyzed.map(factorIssueRow),
    cleared,
    about: (Array.isArray(layerReasons) ? layerReasons : [])
      .map((reason, index) => ({ id: `reason-${index}`, text: scrubLocalPaths(reason) }))
      .filter((reason) => reason.text),
  };
}

const FACTOR_HUMAN = {
  SAST:                 { label: 'Code Safety',           category: 'code',   desc: 'Scans source code for known vulnerability patterns' },
  VirusTotal:           { label: 'Malware Scan',          category: 'threat', desc: 'Checks against 70+ antivirus engines for malicious code' },
  Obfuscation:          { label: 'Hidden Code',           category: 'code',   desc: 'Detects deliberately obscured or unreadable code' },
  Manifest:             { label: 'Extension Config',      category: 'code',   desc: 'Validates security settings in the extension manifest' },
  ChromeStats:          { label: 'Threat Intel',          category: 'threat', desc: 'Cross-references known threat databases' },
  Webstore:             { label: 'Store Reputation',      category: 'trust',  desc: 'Chrome Web Store ratings and user reviews' },
  Maintenance:          { label: 'Publisher update age',   category: 'trust',  desc: 'How recently the extension was updated by its developer' },
  PermissionsBaseline:  { label: 'Permission Risk',       category: 'access', desc: 'Evaluates the sensitivity of requested browser permissions' },
  PermissionCombos:     { label: 'Dangerous Combos',      category: 'access', desc: 'Flags risky permission combinations or broad-access capability signals' },
  NetworkExfil:         { label: 'Data Sharing',          category: 'data',   desc: 'Detects if data is sent to external servers' },
  CaptureSignals:       { label: 'Screen Capture',        category: 'data',   desc: 'Checks for screen or tab recording capabilities' },
  ToSViolations:        { label: 'Potential Policy Issue', category: 'policy', desc: 'Surfaces potential Chrome Web Store policy issues from governance evidence' },
  Consistency:          { label: 'Behavior Match',        category: 'policy', desc: 'Compares stated purpose vs actual behavior' },
  DisclosureAlignment:  { label: 'Disclosure Accuracy',   category: 'policy', desc: 'Validates privacy policy against actual data collection' },
};

/**
 * A check whose underlying analysis did not run has no coverage and must not be
 * shown as "Clear" (that overstates certainty). The network/exfil analyzer
 * reports this via details.network_analysis_enabled === false.
 */
export function isNotAnalyzed(factor) {
  const details = factor?.details;
  if (!details || typeof details !== 'object') return false;
  // Network/exfil analyzer explicitly reports it did not run.
  if (details.network_analysis_enabled === false) return true;
  // VirusTotal returned no coverage (hash not in DB / unavailable / rate-limited):
  // zero engines scanned. A real clean scan reports dozens of engines, so a
  // severity-0 VT factor with 0 engines is "did not run", not "clean".
  if (factor?.name === 'VirusTotal' && Number(details.total_engines) === 0) return true;
  // SAST analyzed no code (minified/bundled-only, or the download failed):
  // 0 files scanned and nothing deduped means it could not clear code safety.
  if (factor?.name === 'SAST' && Number(details.files_scanned) === 0 && !details.deduped_findings) return true;
  return false;
}

/**
 * Map a factor to a truthful presentation status:
 *  - issues:  the check ran and found something material (severity >= 0.4).
 *             tone splits high (>= 0.7 -> bad/red) vs moderate (warn/amber).
 *  - unknown: the check could not run -> "Not analyzed" (never "Clear").
 *  - clear:   the check ran and found nothing material.
 */
export function humanizeFactor(factor) {
  const info = FACTOR_HUMAN[factor.name] || {
    label: factor.name,
    category: 'other',
    desc: '',
  };
  const severity = factor.severity ?? 0;
  // Publisher update age is a trust/caution signal, not a code-safety finding.
  // It must never present as standalone "High severity" — cap it at an advisory
  // "Caution" (amber) even when its raw severity is high (e.g. >365 days old).
  const isAdvisoryTrust = factor.name === 'Maintenance';
  let status, statusType, tone;
  if (severity >= 0.4) {
    const isHigh = severity >= 0.7 && !isAdvisoryTrust;
    tone = isHigh ? 'bad' : 'warn';
    status = isHigh ? 'High severity' : isAdvisoryTrust ? 'Caution' : 'Issue';
    // Publisher update age below the key-finding threshold (0.6, matching
    // buildKeyFindings in normalizeScanResult) is routine context, not an open
    // issue. Keep the "Caution" label but do not count it among issues, so the
    // modal agrees with the card / Issue Overview / Key Findings, which all
    // exclude it. At >= 0.6 (>180 days) it remains a visible caution.
    statusType = (isAdvisoryTrust && severity < 0.6) ? 'clear' : 'issues';
  } else if (isNotAnalyzed(factor)) {
    statusType = 'unknown';
    tone = 'neutral';
    status = 'Not analyzed';
  } else {
    statusType = 'clear';
    tone = 'good';
    status = 'Clear';
  }
  return { ...info, status, statusType, tone, severity, evidence: factorEvidenceCaption(factor), raw: factor };
}

/**
 * Triage a layer's factors into severity tiers for display:
 * issues (most severe first) -> not analyzed -> cleared (alphabetical).
 * Keeping this pure makes the "issues first / not-analyzed distinct" ordering testable.
 */
export function triageFactors(factors = []) {
  const humanised = (factors || []).map(humanizeFactor);
  return {
    all: humanised,
    issues: humanised
      .filter((i) => i.statusType === 'issues')
      .sort((a, b) => b.severity - a.severity),
    notAnalyzed: humanised.filter((i) => i.statusType === 'unknown'),
    cleared: humanised
      .filter((i) => i.statusType === 'clear')
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}
