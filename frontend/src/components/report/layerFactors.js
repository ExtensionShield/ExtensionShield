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

const FACTOR_HUMAN = {
  SAST:                 { label: 'Code Safety',           category: 'code',   desc: 'Scans source code for known vulnerability patterns' },
  VirusTotal:           { label: 'Malware Scan',          category: 'threat', desc: 'Checks against 70+ antivirus engines for malicious code' },
  Obfuscation:          { label: 'Hidden Code',           category: 'code',   desc: 'Detects deliberately obscured or unreadable code' },
  Manifest:             { label: 'Extension Config',      category: 'code',   desc: 'Validates security settings in the extension manifest' },
  ChromeStats:          { label: 'Threat Intel',          category: 'threat', desc: 'Cross-references known threat databases' },
  Webstore:             { label: 'Store Reputation',      category: 'trust',  desc: 'Chrome Web Store ratings and user reviews' },
  Maintenance:          { label: 'Publisher update age',   category: 'trust',  desc: 'How recently the extension was updated by its developer' },
  PermissionsBaseline:  { label: 'Permission Risk',       category: 'access', desc: 'Evaluates the sensitivity of requested browser permissions' },
  PermissionCombos:     { label: 'Dangerous Combos',      category: 'access', desc: 'Flags risky combinations of permissions that enable data theft' },
  NetworkExfil:         { label: 'Data Sharing',          category: 'data',   desc: 'Detects if data is sent to external servers' },
  CaptureSignals:       { label: 'Screen Capture',        category: 'data',   desc: 'Checks for screen or tab recording capabilities' },
  ToSViolations:        { label: 'Policy Violations',     category: 'policy', desc: 'Checks compliance with Chrome Web Store policies' },
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
  if (details.network_analysis_enabled === false) return true;
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
    statusType = 'issues';
    const isHigh = severity >= 0.7 && !isAdvisoryTrust;
    tone = isHigh ? 'bad' : 'warn';
    status = isHigh ? 'High severity' : isAdvisoryTrust ? 'Caution' : 'Issue';
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
