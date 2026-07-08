// Pure helpers for presenting a scoring layer's factors. Kept in a separate
// module (no React components) so they stay unit-testable and don't trip
// react-refresh/only-export-components in the LayerModal component file.

const FACTOR_HUMAN = {
  SAST:                 { label: 'Code Safety',           category: 'code',   desc: 'Scans source code for known vulnerability patterns' },
  VirusTotal:           { label: 'Malware Scan',          category: 'threat', desc: 'Checks against 70+ antivirus engines for malicious code' },
  Obfuscation:          { label: 'Hidden Code',           category: 'code',   desc: 'Detects deliberately obscured or unreadable code' },
  Manifest:             { label: 'Extension Config',      category: 'code',   desc: 'Validates security settings in the extension manifest' },
  ChromeStats:          { label: 'Threat Intel',          category: 'threat', desc: 'Cross-references known threat databases' },
  Webstore:             { label: 'Store Reputation',      category: 'trust',  desc: 'Chrome Web Store ratings and user reviews' },
  Maintenance:          { label: 'Update Freshness',      category: 'trust',  desc: 'How recently the extension was updated by its developer' },
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
  let status, statusType, tone;
  if (severity >= 0.4) {
    statusType = 'issues';
    tone = severity >= 0.7 ? 'bad' : 'warn';
    status = severity >= 0.7 ? 'High severity' : 'Issue';
  } else if (isNotAnalyzed(factor)) {
    statusType = 'unknown';
    tone = 'neutral';
    status = 'Not analyzed';
  } else {
    statusType = 'clear';
    tone = 'good';
    status = 'Clear';
  }
  return { ...info, status, statusType, tone, severity, raw: factor };
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
