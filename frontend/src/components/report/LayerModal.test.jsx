/**
 * LayerModal status + triage tests (presentation correctness).
 *
 * Truthful statuses:
 *  - "Issue"/"High severity" only when the check ran and found something (severity >= 0.4)
 *  - "Not analyzed" when coverage is absent (never "Clear")
 *  - "Clear" only when the check ran and found nothing material
 * Triage ordering: issues (most severe first) -> not analyzed -> cleared.
 *
 * Pure logic only — no rendering required.
 */
import { describe, it, expect } from 'vitest';
import { factorEvidenceCaption, humanizeFactor, isNotAnalyzed, triageFactors } from './layerFactors';

describe('LayerModal status mapping', () => {
  it('Data Sharing with no network coverage is "Not analyzed", not "Clear"', () => {
    const result = humanizeFactor({
      name: 'NetworkExfil',
      severity: 0,
      confidence: 0.5,
      details: { network_analysis_enabled: false },
    });
    expect(result.status).toBe('Not analyzed');
    expect(result.statusType).toBe('unknown');
    expect(result.tone).toBe('neutral');
    expect(result.label).toBe('Data Sharing');
  });

  it('Data Sharing WITH coverage and no findings reads "Clear"', () => {
    const result = humanizeFactor({
      name: 'NetworkExfil',
      severity: 0,
      details: { network_analysis_enabled: true, domains_analyzed: 3 },
    });
    expect(result.status).toBe('Clear');
    expect(result.statusType).toBe('clear');
    expect(result.tone).toBe('good');
  });

  it('a moderate finding (>=0.4) is an amber "Issue"', () => {
    const result = humanizeFactor({ name: 'Obfuscation', severity: 0.5 });
    expect(result.status).toBe('Issue');
    expect(result.statusType).toBe('issues');
    expect(result.tone).toBe('warn');
  });

  it('a severe finding (>=0.7) is a red "High severity"', () => {
    const result = humanizeFactor({ name: 'ToSViolations', severity: 0.8 });
    expect(result.status).toBe('High severity');
    expect(result.statusType).toBe('issues');
    expect(result.tone).toBe('bad');
  });

  it('publisher update age (Maintenance) is advisory "Caution", never standalone "High severity"', () => {
    // Even at a high raw severity (e.g. >365 days old = 0.8) it must not read as
    // a red "High severity" code-safety finding — it is a trust/caution signal.
    const stale = humanizeFactor({ name: 'Maintenance', severity: 0.8 });
    expect(stale.status).toBe('Caution');
    expect(stale.tone).toBe('warn');
    expect(stale.label).toBe('Publisher update age');

    const moderate = humanizeFactor({ name: 'Maintenance', severity: 0.5 });
    expect(moderate.status).toBe('Caution');
    expect(moderate.tone).toBe('warn');
  });

  it('an actual finding wins over the not-analyzed flag', () => {
    const result = humanizeFactor({
      name: 'NetworkExfil',
      severity: 0.6,
      details: { network_analysis_enabled: false },
    });
    expect(result.statusType).toBe('issues');
  });

  it('isNotAnalyzed only fires on the explicit coverage flag', () => {
    expect(isNotAnalyzed({ details: { network_analysis_enabled: false } })).toBe(true);
    expect(isNotAnalyzed({ details: { network_analysis_enabled: true } })).toBe(false);
    expect(isNotAnalyzed({ details: {} })).toBe(false);
    expect(isNotAnalyzed({})).toBe(false);
  });
});

describe('LayerModal triage ordering', () => {
  const factors = [
    { name: 'SAST', severity: 0.1 },                                            // clear
    { name: 'CaptureSignals', severity: 0.5 },                                  // issue (warn)
    { name: 'NetworkExfil', severity: 0, details: { network_analysis_enabled: false } }, // not analyzed
    { name: 'ToSViolations', severity: 0.9 },                                   // issue (bad)
    { name: 'Webstore', severity: 0.2 },                                        // clear
  ];

  it('separates the three tiers correctly', () => {
    const { issues, notAnalyzed, cleared } = triageFactors(factors);
    expect(issues.map((i) => i.label)).toEqual(['Policy Violations', 'Screen Capture']); // severe first
    expect(notAnalyzed.map((i) => i.label)).toEqual(['Data Sharing']);
    expect(cleared.map((i) => i.label)).toEqual(['Code Safety', 'Store Reputation']); // alphabetical
  });

  it('a not-analyzed check never lands in the cleared tier', () => {
    const { cleared, notAnalyzed } = triageFactors(factors);
    expect(cleared.some((i) => i.label === 'Data Sharing')).toBe(false);
    expect(notAnalyzed.some((i) => i.label === 'Data Sharing')).toBe(true);
  });

  it('handles an empty layer without throwing', () => {
    const { all, issues, notAnalyzed, cleared } = triageFactors([]);
    expect(all).toEqual([]);
    expect(issues).toEqual([]);
    expect(notAnalyzed).toEqual([]);
    expect(cleared).toEqual([]);
  });
});

describe('factorEvidenceCaption', () => {
  it('prefers an explicit analyzer description', () => {
    expect(factorEvidenceCaption({ name: 'SAST', details: { description: 'Reads document.cookie' } }))
      .toBe('Reads document.cookie');
  });

  it('renders publisher update age from days_since_update', () => {
    expect(factorEvidenceCaption({ name: 'Maintenance', details: { days_since_update: 508 } }))
      .toBe('Last updated 508 days ago');
    expect(factorEvidenceCaption({ name: 'Maintenance', details: { days_since_update: 1 } }))
      .toBe('Last updated 1 day ago');
  });

  it('renders a relative file:line reference and never a local absolute path', () => {
    const cap = factorEvidenceCaption({
      name: 'SAST',
      details: { file: '/Users/x/ExtensionShield/extensions_storage/extracted_a/js/background.js', line: 42 },
    });
    expect(cap).toBe('js/background.js:42');
    expect(cap).not.toMatch(/\/Users|\/home|extensions_storage|extracted_/);
  });

  it('drops a free-text caption that would leak a local path', () => {
    expect(factorEvidenceCaption({ name: 'SAST', details: { description: 'see /Users/stanzin/secret/app.js' } }))
      .toBe('see app.js');
  });

  it('falls back to reason, then to empty string when no evidence exists', () => {
    expect(factorEvidenceCaption({ name: 'X', details: { reason: 'Rate limited' } })).toBe('Rate limited');
    expect(factorEvidenceCaption({ name: 'X', details: {} })).toBe('');
    expect(factorEvidenceCaption({ name: 'X' })).toBe('');
    expect(factorEvidenceCaption(null)).toBe('');
  });

  it('is attached to humanized factors', () => {
    const h = humanizeFactor({ name: 'Maintenance', severity: 0.8, details: { days_since_update: 400 } });
    expect(h.evidence).toBe('Last updated 400 days ago');
  });
});
