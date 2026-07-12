/**
 * reportDisplay — pure presentation helpers for the scan report page.
 *
 * These functions turn the existing scan-result payload (governance_bundle,
 * scoring_v2, virustotal_analysis, metadata) into the calm, evidence-backed
 * display model the redesign needs. They invent no backend fields: every value
 * is read from data the API already returns, and missing data yields an honest
 * fallback state rather than an over-confident one.
 *
 * The verdict (ALLOW / NEEDS_REVIEW / BLOCK) is the single source of truth for
 * every badge, headline, and summary line — never "Safe" once a verdict is
 * NEEDS_REVIEW or BLOCK.
 */

/** Normalize any decision string to one of the three canonical verdicts. */
export function normalizeVerdictKey(decision) {
  const d = String(decision || '').toUpperCase();
  if (d === 'ALLOW' || d === 'SAFE' || d === 'PASS') return 'ALLOW';
  if (d === 'BLOCK' || d === 'BLOCKED' || d === 'FAIL') return 'BLOCK';
  if (d === 'WARN' || d === 'NEEDS_REVIEW' || d === 'REVIEW') return 'NEEDS_REVIEW';
  return null;
}

/**
 * Verdict-first hero copy. Single source of truth for the badge label, headline,
 * and body across the whole page. Copy is evidence-backed and never fear-based.
 * A missing/unknown verdict resolves conservatively to NEEDS_REVIEW so the page
 * can never imply "safe" without an explicit ALLOW.
 */
export function resolveVerdictDisplay(decision) {
  const key = normalizeVerdictKey(decision) || 'NEEDS_REVIEW';
  switch (key) {
    case 'ALLOW':
      return {
        key,
        label: 'ALLOW',
        tone: 'good',
        headline: 'Allowed based on current evidence.',
        body:
          'We found no high-risk issues and had adequate analyzer visibility. ' +
          'Continue to review permissions and updates over time.',
      };
    case 'BLOCK':
      return {
        key,
        label: 'BLOCK',
        tone: 'bad',
        headline: 'Block recommended.',
        body:
          'We found strong evidence of malicious or policy-breaking behavior. ' +
          'Do not install this extension, or remove it if already installed.',
      };
    case 'NEEDS_REVIEW':
    default:
      return {
        key: 'NEEDS_REVIEW',
        label: 'NEEDS REVIEW',
        tone: 'warn',
        headline: 'Review recommended before installing.',
        body:
          'We found issues that need your attention or had limited visibility into ' +
          'the extension. Review the findings and evidence before deciding to install ' +
          'or continue using it.',
      };
  }
}

/** Map a coverage state to its user-facing label and color tone (design §3). */
const COVERAGE_STATES = {
  full: { label: 'Full coverage', tone: 'good' },
  // "scanned" = the analyzer completed on the files it saw, but the payload does
  // not prove it covered every scannable file — so we never claim "Full coverage".
  scanned: { label: 'Scan completed', tone: 'good' },
  partial: { label: 'Partial coverage', tone: 'warn' },
  limited: { label: 'Limited coverage', tone: 'warn' },
  not_run: { label: 'Not run', tone: 'neutral' },
  failed: { label: 'Failed', tone: 'bad' },
  no_code_scanned: { label: 'No code scanned', tone: 'info' },
};

function coverageRow(key, label, whatItChecks, state, statusText, lastUpdated, coverageLabelOverride) {
  const meta = COVERAGE_STATES[state] || COVERAGE_STATES.not_run;
  return {
    key,
    label,
    whatItChecks,
    state,
    coverageLabel: coverageLabelOverride || meta.label,
    tone: meta.tone,
    statusText,
    lastUpdated: lastUpdated || null,
  };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Per-analyzer coverage rows for the Analyzer Coverage section. Reads only
 * existing payload fields. Honest by construction: an analyzer that did not run
 * is "Not run" (never implied clean), a SAST scan of 0 files is "No code
 * scanned" (explicitly not "clean"), and a crashed analyzer is "Failed".
 */
export function resolveAnalyzerCoverage(raw) {
  if (!raw || typeof raw !== 'object') return [];
  const sp = (raw.governance_bundle && raw.governance_bundle.signal_pack) || raw.signal_pack || {};
  const lastUpdated = raw.timestamp || raw.scanned_at || null;
  const rows = [];

  // --- SAST (primary code analyzer) ---------------------------------------
  const sast = sp.sast || raw.sast_results || null;
  {
    const checks = 'Code patterns, security anti-patterns, risky functions';
    if (!sast) {
      rows.push(coverageRow('sast', 'SAST', checks, 'not_run',
        'Analyzer did not run at scan time.', lastUpdated));
    } else if (sast.scan_error) {
      rows.push(coverageRow('sast', 'SAST', checks, 'failed',
        'Analyzer encountered an error; results unavailable.', lastUpdated));
    } else {
      const files = num(sast.files_scanned ?? sast.filesScanned);
      const capApplied = Boolean(
        raw.scoring_v2?.coverage_cap_applied ||
        raw.governance_bundle?.scoring_v2?.coverage_cap_applied
      );
      if (files <= 0) {
        rows.push(coverageRow('sast', 'SAST', checks, 'no_code_scanned',
          'SAST analyzed 0 files. This does not mean the code is clean.', lastUpdated));
      } else if (capApplied) {
        rows.push(coverageRow('sast', 'SAST', checks, 'partial',
          `Partial scan — ${files} file${files === 1 ? '' : 's'} analyzed; some files were not analyzed.`, lastUpdated));
      } else {
        // We know how many files were scanned but not the total scannable count,
        // so we report what was done ("Analyzed N files") rather than claiming
        // "Full coverage" the payload cannot prove.
        rows.push(coverageRow('sast', 'SAST', checks, 'scanned',
          'Completed on scanned files.', lastUpdated,
          `Analyzed ${files} file${files === 1 ? '' : 's'}`));
      }
    }
  }

  // --- VirusTotal ---------------------------------------------------------
  {
    const checks = 'Known malicious files, URLs, and domains';
    const vt = sp.virustotal || {};
    const vtSummary = raw.virustotal_analysis || {};
    const enabled = vt.enabled ?? vtSummary.enabled;
    const analyzed = num(vt.files_analyzed ?? vtSummary.files_analyzed);
    const found = num(vtSummary.files_found_in_vt ?? vt.files_found_in_vt);
    const engines = num(vt.total_engines);
    const malicious = num(vt.malicious_count ?? vtSummary.total_malicious);
    // "Scanned" = VirusTotal actually returned engine verdicts (engines>0) or the
    // scan explicitly recorded files found in the database.
    const scanned = engines > 0 || found > 0;
    if (enabled === false) {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'not_run',
        'Not run — analyzer disabled at scan time.', lastUpdated));
    } else if (malicious > 0) {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'full',
        `${malicious} engine${malicious === 1 ? '' : 's'} flagged this extension.`, lastUpdated));
    } else if (scanned && analyzed > 0 && found > 0 && found < analyzed) {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'partial',
        `No detections on ${found} of ${analyzed} files; some files were not in the database.`, lastUpdated));
    } else if (scanned) {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'full',
        'No detections.', lastUpdated));
    } else if (analyzed > 0) {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'limited',
        'Files were submitted but not found in the VirusTotal database.', lastUpdated));
    } else {
      rows.push(coverageRow('virustotal', 'VirusTotal', checks, 'not_run',
        'Not run — no results at scan time.', lastUpdated));
    }
  }

  // --- Chrome Web Store listing -------------------------------------------
  {
    const checks = 'Permissions, metadata, store compliance';
    const md = raw.metadata || {};
    const hasListing = md.user_count != null || md.rating != null || md.version != null;
    if (hasListing) {
      rows.push(coverageRow('listing', 'Chrome Web Store', checks, 'full',
        'Listing data captured.', lastUpdated));
    } else if (raw.url) {
      rows.push(coverageRow('listing', 'Chrome Web Store', checks, 'limited',
        'Some listing fields could not be retrieved.', lastUpdated));
    } else {
      rows.push(coverageRow('listing', 'Chrome Web Store', checks, 'not_run',
        'Listing was not retrieved at scan time.', lastUpdated));
    }
  }

  // --- ChromeStats (only shown if the payload carries it) -----------------
  {
    const cs = sp.chromestats || sp.chrome_stats || raw.metadata?.chrome_stats || null;
    const checks = 'Install trends, ratings history, developer signals';
    const csHasData = cs && typeof cs === 'object' && Object.keys(cs).length > 0;
    const nonEmpty = (o) => o && typeof o === 'object' && Object.keys(o).length > 0;
    // A default/empty ChromeStats object (enabled but no indicators, zero risk
    // score, empty trends/patterns) carries NO signal — it must not read as
    // "Full coverage".
    const csMeaningful = csHasData && (
      (Array.isArray(cs.risk_indicators) && cs.risk_indicators.length > 0) ||
      num(cs.total_risk_score) > 0 ||
      nonEmpty(cs.install_trends) ||
      nonEmpty(cs.rating_patterns) ||
      nonEmpty(cs.developer_reputation)
    );
    if (csHasData && cs.enabled !== false && csMeaningful) {
      rows.push(coverageRow('chromestats', 'ChromeStats', checks, 'full',
        'Signals available.', lastUpdated));
    } else if (csHasData && cs.enabled !== false) {
      rows.push(coverageRow('chromestats', 'ChromeStats', checks, 'not_run',
        'No additional ChromeStats signals.', lastUpdated));
    } else {
      rows.push(coverageRow('chromestats', 'ChromeStats', checks, 'not_run',
        'Analyzer did not run at scan time.', lastUpdated));
    }
  }

  return rows;
}

// Analyzer-coverage states that mean the analyzer produced a usable result the
// report may lean on. Anything else (not_run / failed / limited / no_code_scanned)
// is a coverage GAP, never evidence of a clean result. Kept in sync with the
// COVERAGE_STATES the Analyzer Coverage section renders.
const PRODUCTIVE_COVERAGE_STATES = new Set(['full', 'scanned', 'partial']);

/**
 * Which underlying evidence each scoring factor actually needs. Presentation
 * only — used to decide "Cleared" vs "Not analyzed" from the SAME coverage the
 * Analyzer Coverage section reports (never a new/parallel classifier).
 */
export function resolveEvidenceAvailability(raw) {
  if (!raw || typeof raw !== 'object') {
    // No payload: assume nothing is missing so callers fall back to their own
    // per-factor signals rather than mass-marking everything "Not analyzed".
    return { code: true, malware: true, threatIntel: true, listing: true, manifest: true };
  }

  const stateByKey = {};
  resolveAnalyzerCoverage(raw).forEach((row) => { stateByKey[row.key] = row.state; });
  const productive = (key) => PRODUCTIVE_COVERAGE_STATES.has(stateByKey[key]);

  // Store listing presence uses the EXACT check the Coverage section's listing
  // row uses (see resolveAnalyzerCoverage), so the two never disagree.
  const md = (raw.metadata && typeof raw.metadata === 'object') ? raw.metadata : {};
  const hasListing = md.user_count != null || md.rating != null || md.version != null;

  // A parsed manifest is the minimum evidence for manifest/permission/governance
  // factors. An empty {} (download/extract failed) carries none.
  const manifest = (raw.manifest && typeof raw.manifest === 'object') ? raw.manifest : {};
  const hasManifest = Boolean(
    manifest.manifest_version != null ||
    manifest.name != null ||
    manifest.version != null ||
    Array.isArray(manifest.permissions) ||
    Array.isArray(manifest.host_permissions)
  );

  return {
    code: productive('sast'),
    malware: productive('virustotal'),
    threatIntel: productive('chromestats'),
    listing: hasListing,
    manifest: hasManifest,
  };
}

/**
 * Decide whether a scan result represents an extension we could actually
 * analyze. A definitively UNAVAILABLE extension — acquisition failed AND no real
 * evidence of any kind was captured — must not render a normal scored report
 * (the recompute-on-read still emits an insufficient-data score, but that score
 * describes nothing). A failed scan that DID capture real evidence (e.g. the
 * store listing) is a legitimate partial report and stays available.
 *
 * Derived entirely from existing payload fields + the shared coverage adapter;
 * never mutates and never invents a verdict. A valid/`completed` scan (even a
 * historical one being served) is always available.
 */
export function resolveScanAvailability(raw) {
  if (!raw || typeof raw !== 'object') {
    return { available: true, unavailable: false, reason: null };
  }
  const acquisitionFailed = String(raw.status || '').toLowerCase() === 'failed';
  const ev = resolveEvidenceAvailability(raw);
  const hasAnyEvidence = ev.code || ev.malware || ev.threatIntel || ev.listing || ev.manifest;
  const unavailable = acquisitionFailed && !hasAnyEvidence;
  const rawReason = typeof raw.error === 'string' ? raw.error.trim() : '';
  return {
    available: !unavailable,
    unavailable,
    reason: unavailable
      ? (rawReason || 'The extension package and store listing could not be retrieved.')
      : null,
  };
}

/**
 * Chrome Web Store liveness (Part 4): read the additive `store_status` metadata the
 * API attaches (never a scoring field). An extension the Store now reports
 * unavailable must render the unavailable state even when a valid historical scan
 * exists. Availability only — it never reads or changes any score. Only a confirmed
 * `unavailable` gates the UI; `available` / `unknown` / missing render normally.
 */
export function resolveStoreStatus(raw) {
  const s = raw && typeof raw === 'object' ? raw.store_status : null;
  const status = (s && typeof s === 'object' && typeof s.status === 'string') ? s.status : 'unknown';
  return {
    status,
    unavailable: status === 'unavailable',
    reason: (s && typeof s === 'object' && typeof s.reason === 'string') ? s.reason : null,
  };
}

/** Compact severity band from a finding's severity (string level or 0..1 number). */
export function findingSeverityLevel(finding) {
  const s = finding == null ? undefined : (typeof finding === 'object' ? finding.severity : finding);
  if (typeof s === 'number') {
    if (s >= 0.66) return 'high';
    if (s >= 0.4) return 'medium';
    if (s > 0) return 'low';
    return 'info';
  }
  const str = String(s || '').toLowerCase();
  if (str === 'high' || str === 'critical') return 'high';
  if (str === 'medium' || str === 'moderate') return 'medium';
  if (str === 'low') return 'low';
  return 'info';
}

/** Human severity label — "High Severity", not "High Risk" (design §4). */
export function severityLabel(level) {
  switch (level) {
    case 'high': return 'High Severity';
    case 'medium': return 'Medium Severity';
    case 'low': return 'Low Severity';
    default: return 'Info';
  }
}

/** Short pill label for a severity level. */
export function severityBadge(level) {
  switch (level) {
    case 'high': return 'HIGH';
    case 'medium': return 'MEDIUM';
    case 'low': return 'LOW';
    default: return 'INFO';
  }
}

/** Tone for a severity level (drives color). */
export function severityTone(level) {
  switch (level) {
    case 'high': return 'bad';
    case 'medium': return 'warn';
    case 'low': return 'neutral';
    default: return 'info';
  }
}

/** Categorize a finding for the Key Findings "category" column. */
export function findingCategory(finding) {
  const title = String(finding?.title || '').toLowerCase();
  const layer = String(finding?.layer || '').toLowerCase();
  if (/network|external|endpoint|server|domain|exfil|request|beacon/.test(title)) return 'Network';
  if (/permission|host|<all_urls>|access/.test(title)) return 'Permissions';
  if (/code|script|sast|static|obfuscat|eval|remote/.test(title)) return 'Code';
  if (layer === 'privacy') return 'Privacy';
  if (layer === 'governance') return 'Governance';
  if (layer === 'security') return 'Security';
  return 'General';
}

/**
 * Calm, precise finding title. Prefers neutral evidence wording over speculative
 * threat language (design §4): "External network requests detected" instead of
 * "Potential C2 beacons", and "code patterns that need review" instead of
 * generic scary code-safety claims. Only rewrites known speculative phrasings.
 */
export function preciseFindingTitle(title) {
  const t = String(title || '').trim();
  if (!t) return t;
  if (/\b(c2|command[- ]?and[- ]?control|beacons?)\b/i.test(t)) {
    return 'External network requests detected';
  }
  if (/steganograph/i.test(t)) {
    return 'Image data handling flagged for review';
  }
  if (/^\s*code safety\s*$/i.test(t)) {
    return 'Code patterns need review';
  }
  if (/malicious code|dangerous code|code is (unsafe|malicious)/i.test(t)) {
    return 'Static analysis found code patterns that need review';
  }
  return t;
}

/**
 * Grammatical label for a resolvable-evidence count. Uses "item"/"items" (never
 * "evidences"), and states plainly when a finding has no openable evidence.
 */
export function evidenceCountLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return 'Evidence not linked';
  return `${n} evidence ${n === 1 ? 'item' : 'items'}`;
}

/**
 * Resolve the evidence label shown on a Key Findings row (display only).
 *
 * Precedence:
 *  - resolvable evidence IDs (count > 0) -> the existing openable count label
 *    (the "View evidence" button is gated on the same count, unchanged).
 *  - else structured finding.evidence:
 *      available + label -> "Evidence: <label>"
 *      otherwise (available:false, or present but unlabelled) -> a plain
 *      summary/reason-only label, not placeholder text
 *  - else (no IDs and no structured evidence) -> "Evidence not linked".
 *
 * Never generates a new label — it only selects the existing finding.evidence.label.
 */
export function resolveFindingEvidenceLabel(finding, evidenceCount) {
  const n = Number(evidenceCount) || 0;
  if (n > 0) return evidenceCountLabel(n);
  const ev = finding && finding.evidence;
  if (ev && ev.available === true && ev.label) return `Evidence: ${ev.label}`;
  if (ev && ev.available === true) return 'Based on reported reason only';
  if (ev) return 'Based on summary only';
  return evidenceCountLabel(0);
}

/**
 * Issue Overview counts by severity from a list of findings. Info stays 0 unless
 * findings are explicitly informational. Total is the sum of all buckets.
 */
export function resolveIssueOverview(findings) {
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  (Array.isArray(findings) ? findings : []).forEach((f) => {
    counts[findingSeverityLevel(f)] += 1;
  });
  return { ...counts, total: counts.high + counts.medium + counts.low + counts.info };
}

/**
 * Labels that keep the numeric governance-layer SCORE distinct from the
 * governance rulepack POLICY DECISION — they are separate concepts and can
 * disagree (a high governance score can still carry a policy review/block).
 */
export const GOVERNANCE_SCORE_LABEL = 'Governance score';
export const POLICY_DECISION_LABEL = 'Policy decision';

/** Title-case an unknown authority token as a readable fallback. */
function humanizeAuthorityToken(authority) {
  return String(authority || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .trim();
}

/**
 * Explain WHICH authority produced the final verdict, in one plain sentence.
 *
 * The backend Decision Authority (src/extension_shield/scoring/decision.py)
 * resolves the verdict through a fixed precedence chain; this surfaces that
 * precedence to the reader so a governance-rule or coverage-driven review is
 * never mistaken for a technical-security or reputation finding. Display only.
 *
 * A reputation/maintenance signal is never an authority in the chain, so it can
 * never be rendered here as the decision basis.
 *
 * Returns a rich sentence for a known authority, or `null` for an unrecognized
 * token (callers fall back to a humanized label).
 */
export function describeDecisionAuthority(authority, context = {}) {
  const {
    coverageCapApplied = false,
    ruleId = null,
    rulepack = null,
    gate = null,
  } = context;

  const rule = rulepack && ruleId ? `${rulepack}::${ruleId}` : (ruleId || rulepack || null);

  switch (authority) {
    case 'org_block':
      return 'Decided by organization policy (blocklist).';
    case 'org_allow_exception':
      return 'Decided by organization policy (allow exception).';
    case 'baseline_governance':
      return rule
        ? `Decided by Chrome Web Store policy review (governance rule ${rule}).`
        : 'Decided by Chrome Web Store policy review (governance policy rule).';
    case 'hard_gate':
      return `Decided by a hard security/privacy gate${gate ? ` (${gate})` : ''}.`;
    case 'score_threshold':
      return coverageCapApplied
        ? 'Limited by analysis coverage; needs review.'
        : 'Decided by overall score threshold.';
    case 'insufficient_data':
    case 'low_confidence':
      return 'Limited by analysis coverage; needs review.';
    case 'score_pass':
      return 'All checks passed.';
    default:
      return null;
  }
}

/**
 * Full "why this verdict" element model: the plain sentence, whether a
 * governance rulepack drove it (so the UI can tag it a POLICY_DECISION distinct
 * from the governance score), and a humanized fallback label for unknown
 * authorities. Returns null when there is no authority to explain.
 */
export function resolveDecisionAuthorityDisplay(authority, context = {}) {
  if (!authority) return null;
  const description = describeDecisionAuthority(authority, context);
  return {
    authority,
    description,
    fallbackLabel: humanizeAuthorityToken(authority),
    isPolicyDecision: authority === 'baseline_governance',
  };
}
