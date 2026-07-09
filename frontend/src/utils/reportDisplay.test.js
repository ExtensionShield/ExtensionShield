import { describe, it, expect } from 'vitest';
import {
  resolveVerdictDisplay,
  resolveAnalyzerCoverage,
  resolveIssueOverview,
  severityLabel,
  findingCategory,
  preciseFindingTitle,
  normalizeVerdictKey,
  evidenceCountLabel,
  resolveFindingEvidenceLabel,
} from './reportDisplay';

const CHROMESTATS_DEFAULT = {
  enabled: true,
  risk_indicators: [],
  total_risk_score: 0,
  overall_risk_level: 'low',
  install_trends: {},
  rating_patterns: {},
  developer_reputation: {},
};

describe('resolveVerdictDisplay — verdict is the single source of truth', () => {
  it('ALLOW is calm and evidence-backed', () => {
    const v = resolveVerdictDisplay('ALLOW');
    expect(v.key).toBe('ALLOW');
    expect(v.label).toBe('ALLOW');
    expect(v.tone).toBe('good');
    expect(v.headline).toMatch(/Allowed based on current evidence/i);
  });

  it('NEEDS_REVIEW (and WARN alias) never says "Safe"', () => {
    for (const d of ['NEEDS_REVIEW', 'WARN', 'REVIEW']) {
      const v = resolveVerdictDisplay(d);
      expect(v.key).toBe('NEEDS_REVIEW');
      expect(v.label).toBe('NEEDS REVIEW');
      expect(v.tone).toBe('warn');
      expect(v.headline).toMatch(/Review recommended before installing/i);
      expect(`${v.label} ${v.headline} ${v.body}`).not.toMatch(/\bsafe\b/i);
    }
  });

  it('BLOCK never says "Safe" and recommends blocking', () => {
    const v = resolveVerdictDisplay('BLOCK');
    expect(v.key).toBe('BLOCK');
    expect(v.label).toBe('BLOCK');
    expect(v.tone).toBe('bad');
    expect(v.headline).toMatch(/Block recommended/i);
    expect(`${v.label} ${v.headline} ${v.body}`).not.toMatch(/\bsafe\b/i);
  });

  it('unknown/missing verdict falls back conservatively to NEEDS REVIEW (never ALLOW)', () => {
    expect(resolveVerdictDisplay(null).key).toBe('NEEDS_REVIEW');
    expect(resolveVerdictDisplay(undefined).key).toBe('NEEDS_REVIEW');
    expect(normalizeVerdictKey('nonsense')).toBeNull();
  });
});

describe('resolveAnalyzerCoverage — honest coverage states', () => {
  const at = (rows, key) => rows.find((r) => r.key === key);

  it('SAST scanning 0 files shows "No code scanned", not clean', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { sast: { scan_error: false, files_scanned: 0 } } },
    });
    const sast = at(rows, 'sast');
    expect(sast.state).toBe('no_code_scanned');
    expect(sast.coverageLabel).toBe('No code scanned');
    expect(sast.statusText).toMatch(/does not mean the code is clean/i);
  });

  it('SAST error shows Failed', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { sast: { scan_error: true, files_scanned: 0 } } },
    });
    expect(at(rows, 'sast').state).toBe('failed');
    expect(at(rows, 'sast').coverageLabel).toBe('Failed');
  });

  it('SAST with scanned files but unknown total says "Analyzed N files", never "Full coverage"', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { sast: { scan_error: false, files_scanned: 5 } } },
    });
    const sast = at(rows, 'sast');
    expect(sast.state).toBe('scanned');
    expect(sast.coverageLabel).toBe('Analyzed 5 files');
    expect(sast.coverageLabel).not.toBe('Full coverage');
    expect(sast.tone).toBe('good');
  });

  it('SAST with a coverage cap is Partial coverage', () => {
    const rows = resolveAnalyzerCoverage({
      scoring_v2: { coverage_cap_applied: true },
      governance_bundle: { signal_pack: { sast: { scan_error: false, files_scanned: 2 } } },
    });
    expect(at(rows, 'sast').state).toBe('partial');
    expect(at(rows, 'sast').coverageLabel).toBe('Partial coverage');
  });

  it('VirusTotal disabled is Not run (never implied clean)', () => {
    const rows = resolveAnalyzerCoverage({
      virustotal_analysis: { enabled: false },
    });
    expect(at(rows, 'virustotal').state).toBe('not_run');
  });

  it('VirusTotal that analyzed all files with no detections is Full coverage', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { virustotal: { enabled: true, files_analyzed: 5, malicious_count: 0 } } },
      virustotal_analysis: { enabled: true, files_analyzed: 5, files_found_in_vt: 5 },
    });
    expect(at(rows, 'virustotal').state).toBe('full');
    expect(at(rows, 'virustotal').statusText).toMatch(/no detections/i);
  });

  it('VirusTotal with partial file coverage is Partial', () => {
    const rows = resolveAnalyzerCoverage({
      virustotal_analysis: { enabled: true, files_analyzed: 5, files_found_in_vt: 2 },
    });
    expect(at(rows, 'virustotal').state).toBe('partial');
  });

  it('VirusTotal hash-not-found is Limited coverage — never malware, never clean/full', () => {
    const rows = resolveAnalyzerCoverage({
      virustotal_analysis: { enabled: true, files_analyzed: 5, files_found_in_vt: 0 },
    });
    const vt = at(rows, 'virustotal');
    expect(vt.state).toBe('limited');
    expect(vt.statusText).toMatch(/not found in the VirusTotal database/i);
    // Unknown reputation must not read as a malware detection...
    expect(vt.statusText).not.toMatch(/flagged|malicious|malware/i);
    // ...nor as a clean/full pass.
    expect(vt.state).not.toBe('full');
  });

  it('Chrome Web Store listing with metadata is Full; ChromeStats absent is Not run', () => {
    const rows = resolveAnalyzerCoverage({
      metadata: { user_count: 1000, rating: 4.5, version: '1.0' },
    });
    expect(at(rows, 'listing').state).toBe('full');
    expect(at(rows, 'chromestats').state).toBe('not_run');
  });

  it('a default/empty ChromeStats object is never "Full coverage"', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { chromestats: CHROMESTATS_DEFAULT } },
    });
    const cs = at(rows, 'chromestats');
    expect(cs.state).not.toBe('full');
    expect(cs.coverageLabel).not.toBe('Full coverage');
    expect(cs.statusText).toMatch(/no additional chromestats signals/i);
  });

  it('ChromeStats with real signal data is Full coverage', () => {
    const rows = resolveAnalyzerCoverage({
      governance_bundle: { signal_pack: { chromestats: { enabled: true, risk_indicators: ['install-spike'], total_risk_score: 12 } } },
    });
    expect(at(rows, 'chromestats').state).toBe('full');
  });

  it('every row exposes a coverage label and tone, and includes all four analyzers', () => {
    const rows = resolveAnalyzerCoverage({ metadata: {} });
    expect(rows.map((r) => r.key)).toEqual(['sast', 'virustotal', 'listing', 'chromestats']);
    rows.forEach((r) => {
      expect(typeof r.coverageLabel).toBe('string');
      expect(['good', 'warn', 'bad', 'info', 'neutral']).toContain(r.tone);
    });
  });

  it('returns [] for empty input without throwing', () => {
    expect(resolveAnalyzerCoverage(null)).toEqual([]);
    expect(resolveAnalyzerCoverage(undefined)).toEqual([]);
  });
});

describe('finding wording guardrails', () => {
  it('severityLabel uses "Severity" not "Risk"', () => {
    expect(severityLabel('high')).toBe('High Severity');
    expect(severityLabel('high')).not.toMatch(/risk/i);
  });

  it('preciseFindingTitle prefers neutral evidence wording over speculative C2', () => {
    expect(preciseFindingTitle('Potential C2 beacons')).toBe('External network requests detected');
    expect(preciseFindingTitle('Beacons to external servers')).toBe('External network requests detected');
    expect(preciseFindingTitle('Broad host access')).toBe('Broad host access');
  });

  it('preciseFindingTitle renames vague "Code Safety" to something concrete', () => {
    expect(preciseFindingTitle('Code Safety')).toBe('Code patterns need review');
    expect(preciseFindingTitle('code safety')).toBe('Code patterns need review');
  });

  it('evidenceCountLabel uses "item"/"items", never "evidences"', () => {
    expect(evidenceCountLabel(0)).toBe('Evidence not linked');
    expect(evidenceCountLabel(1)).toBe('1 evidence item');
    expect(evidenceCountLabel(2)).toBe('2 evidence items');
    expect(evidenceCountLabel(3)).not.toMatch(/evidences/);
  });

  it('findingCategory maps by title/layer', () => {
    expect(findingCategory({ title: 'External network requests detected' })).toBe('Network');
    expect(findingCategory({ title: 'Permissions broader than necessary' })).toBe('Permissions');
    expect(findingCategory({ title: 'Code Safety', layer: 'security' })).toBe('Code');
  });
});

describe('resolveIssueOverview', () => {
  it('counts by severity and totals', () => {
    const o = resolveIssueOverview([
      { severity: 'high' }, { severity: 'medium' }, { severity: 'low' }, { severity: 'low' },
    ]);
    expect(o).toEqual({ high: 1, medium: 1, low: 2, info: 0, total: 4 });
  });

  it('handles numeric severities and empty input', () => {
    expect(resolveIssueOverview([{ severity: 0.9 }, { severity: 0.5 }]).total).toBe(2);
    expect(resolveIssueOverview([]).total).toBe(0);
  });
});

describe('resolveFindingEvidenceLabel — Key Findings row evidence label', () => {
  it('shows the structured evidence label when there are no resolvable evidence IDs', () => {
    const finding = { title: 'Limited malware reputation coverage', evidence: { available: true, label: 'Coverage: VirusTotal unavailable' } };
    expect(resolveFindingEvidenceLabel(finding, 0)).toBe('Evidence: Coverage: VirusTotal unavailable');
  });

  it('shows a SAST file:line structured label when IDs are empty', () => {
    const finding = { title: 'Code Safety', evidence: { available: true, kind: 'sast', label: 'js/content.js:12' } };
    expect(resolveFindingEvidenceLabel(finding, 0)).toBe('Evidence: js/content.js:12');
  });

  it('keeps the existing openable count label when resolvable evidence IDs exist (gates the View evidence button)', () => {
    const finding = { title: 'Code Safety', evidence: { available: true, label: 'js/content.js:12' } };
    expect(resolveFindingEvidenceLabel(finding, 2)).toBe('2 evidence items');
    expect(resolveFindingEvidenceLabel(finding, 1)).toBe('1 evidence item');
  });

  it('shows "Evidence: summary only" for available:false findings', () => {
    const finding = { title: 'Passes checks', evidence: { available: false } };
    expect(resolveFindingEvidenceLabel(finding, 0)).toBe('Evidence: summary only');
  });

  it('shows "Evidence: summary only" when structured evidence exists but has no label (never "not linked")', () => {
    const finding = { title: 'x', evidence: { available: true } };
    expect(resolveFindingEvidenceLabel(finding, 0)).toBe('Evidence: summary only');
  });

  it('shows "Evidence not linked" only when there are no IDs and no structured evidence', () => {
    expect(resolveFindingEvidenceLabel({ title: 'x' }, 0)).toBe('Evidence not linked');
    expect(resolveFindingEvidenceLabel({ title: 'x', evidence: null }, 0)).toBe('Evidence not linked');
    expect(resolveFindingEvidenceLabel(null, 0)).toBe('Evidence not linked');
  });

  it('is label-only and never mutates the finding (ordering/severity unaffected)', () => {
    const finding = { title: 'x', severity: 'high', evidence: { available: true, label: 'Rule CWS_LIMITED_USE::R5' } };
    const before = JSON.stringify(finding);
    resolveFindingEvidenceLabel(finding, 0);
    expect(JSON.stringify(finding)).toBe(before);
  });
});
