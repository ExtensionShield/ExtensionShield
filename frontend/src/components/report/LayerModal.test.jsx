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
import { humanizeFactor, isNotAnalyzed, triageFactors } from './layerFactors';

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
    const result = humanizeFactor({ name: 'Maintenance', severity: 0.5 });
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
