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
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import LayerModal from './LayerModal';
import {
  buildLayerModalModel,
  factorEvidenceCaption,
  humanizeFactor,
  isNotAnalyzed,
  triageFactors,
} from './layerFactors';

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

  it('advisory publisher update age below 0.6 is NOT counted as an open issue', () => {
    // Under the key-finding threshold (0.6, ~180 days) it is routine context,
    // so the modal must not count it among "Open Issues" (matches the card /
    // Issue Overview / Key Findings, which all exclude it). At >= 0.6 it stays a
    // visible caution in the issues tier.
    const routine = humanizeFactor({ name: 'Maintenance', severity: 0.4 });
    expect(routine.statusType).not.toBe('issues');
    expect(routine.status).toBe('Caution');

    const olderThan180d = humanizeFactor({ name: 'Maintenance', severity: 0.6 });
    expect(olderThan180d.statusType).toBe('issues');
    expect(olderThan180d.status).toBe('Caution');
  });

  it('an actual finding wins over the not-analyzed flag', () => {
    const result = humanizeFactor({
      name: 'NetworkExfil',
      severity: 0.6,
      details: { network_analysis_enabled: false },
    });
    expect(result.statusType).toBe('issues');
  });

  it('isNotAnalyzed fires on real did-not-run signals, not on clean scans', () => {
    // Network/exfil analyzer coverage flag.
    expect(isNotAnalyzed({ details: { network_analysis_enabled: false } })).toBe(true);
    expect(isNotAnalyzed({ details: { network_analysis_enabled: true } })).toBe(false);
    // VirusTotal with zero engines = no coverage (hash not in DB / rate-limited).
    expect(isNotAnalyzed({ name: 'VirusTotal', details: { total_engines: 0 } })).toBe(true);
    // A real clean VT scan reports dozens of engines -> genuinely "Clear".
    expect(isNotAnalyzed({ name: 'VirusTotal', details: { total_engines: 75 } })).toBe(false);
    // SAST that scanned no code (minified-only / download failed).
    expect(isNotAnalyzed({ name: 'SAST', details: { files_scanned: 0, deduped_findings: 0 } })).toBe(true);
    // SAST that actually scanned files with no findings -> genuinely "Clear".
    expect(isNotAnalyzed({ name: 'SAST', details: { files_scanned: 8, deduped_findings: 0 } })).toBe(false);
    // No details / unrelated factor -> not flagged.
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

describe('buildLayerModalModel', () => {
  it('builds open, cleared, and not-analyzed sections from real layer factors/findings', () => {
    const model = buildLayerModalModel({
      factors: [
        { name: 'Manifest', severity: 0.6, details: { description: 'missing CSP in manifest' } },
        { name: 'SAST', severity: 0.1 },
        { name: 'NetworkExfil', severity: 0, details: { network_analysis_enabled: false } },
      ],
      keyFindings: [
        {
          title: 'Extension Config missing CSP',
          severity: 'medium',
          layer: 'security',
          summary: 'missing CSP in manifest',
          evidence: { available: true, kind: 'manifest', manifestField: 'content_security_policy', label: 'missing CSP in manifest' },
        },
      ],
    });

    expect(model.issues.map((row) => row.title)).toContain('Extension Config missing CSP');
    expect(model.cleared.map((row) => row.label)).toContain('Code Safety');
    expect(model.notAnalyzed.map((row) => row.title)).toContain('Data Sharing');
  });

  it('renders relative evidence details without local absolute paths', () => {
    const model = buildLayerModalModel({
      keyFindings: [{
        title: 'Static analysis finding',
        severity: 'high',
        layer: 'security',
        evidence: {
          available: true,
          kind: 'sast',
          filePath: '/Users/stanzin/ExtensionShield/extensions_storage/extracted_a/js/background.js',
          lineStart: 9,
          snippet: 'chrome.tabs.query({})',
          label: '/Users/stanzin/ExtensionShield/extensions_storage/extracted_a/js/background.js:9',
        },
      }],
    });

    const text = JSON.stringify(model);
    expect(text).toContain('js/background.js:9');
    expect(text).not.toMatch(/\/Users|\/home|extensions_storage|extracted_/);
  });
});

describe('LayerModal rendering', () => {
  const renderModal = (props = {}) => render(
    <LayerModal
      open
      onClose={vi.fn()}
      layer="security"
      score={90}
      band="WARN"
      factors={[
        { name: 'Manifest', severity: 0.6, details: { description: 'missing CSP in manifest', manifest_field: 'content_security_policy' } },
        { name: 'SAST', severity: 0.1 },
        { name: 'VirusTotal', severity: 0.1 },
        { name: 'NetworkExfil', severity: 0, details: { network_analysis_enabled: false, reason: 'Rate limited' } },
      ]}
      keyFindings={[
        {
          title: 'Extension Config missing CSP',
          severity: 'medium',
          layer: 'security',
          summary: 'missing CSP in manifest',
          evidence: { available: true, kind: 'manifest', manifestField: 'content_security_policy', label: 'missing CSP in manifest' },
        },
      ]}
      layerReasons={['Security layer reason from scoring']}
      {...props}
    />
  );

  it('opens a Security modal with open, cleared, and not-analyzed tabs', () => {
    renderModal();

    expect(screen.getByText('Security')).toBeInTheDocument();
    expect(screen.getByText('90')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Open Issues/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cleared/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Not Analyzed/i })).toBeInTheDocument();
    expect(screen.getByText('Extension Config missing CSP')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Cleared/i }));
    expect(screen.getByText('Code Safety')).toBeInTheDocument();
    expect(screen.getByText('Malware Scan')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Not Analyzed/i }));
    expect(screen.getByText('Data Sharing')).toBeInTheDocument();
  });

  it('opens Privacy and Governance modals with the same section structure', () => {
    renderModal({
      layer: 'privacy',
      score: 58,
      factors: [
        { name: 'PermissionsBaseline', severity: 0.8, details: { permission: 'tabs' } },
        { name: 'NetworkExfil', severity: 0, details: { network_analysis_enabled: false } },
      ],
      keyFindings: [],
    });
    expect(screen.getByText('Privacy')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Open Issues/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cleared/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Not Analyzed/i })).toBeInTheDocument();

    renderModal({
      layer: 'governance',
      score: 100,
      band: 'GOOD',
      factors: [
        { name: 'ToSViolations', severity: 0.1 },
        { name: 'DisclosureAlignment', severity: 0.1 },
      ],
      keyFindings: [],
    });
    expect(screen.getByText('Governance')).toBeInTheDocument();
    expect(screen.getAllByRole('tab', { name: /Open Issues/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: /Cleared/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('tab', { name: /Not Analyzed/i }).length).toBeGreaterThan(0);
  });

  it('renders expandable evidence detail when data exists', () => {
    renderModal();

    const issue = screen.getByText('Extension Config missing CSP').closest('.lm-check');
    expect(within(issue).getByText('Evidence')).toBeInTheDocument();
    fireEvent.click(within(issue).getByRole('button', { name: /Toggle evidence/i }));
    expect(within(issue).getByText('Manifest')).toBeInTheDocument();
    expect(within(issue).getByText('content_security_policy')).toBeInTheDocument();
  });

  it('shows a safe empty state when an issue has no structured evidence', () => {
    renderModal({
      factors: [{ name: 'Obfuscation', severity: 0.7 }],
      keyFindings: [],
    });

    expect(screen.getByText('Hidden Code')).toBeInTheDocument();
    expect(screen.getByText('No structured evidence is available for this item.')).toBeInTheDocument();
  });

  it('does not render local absolute paths in modal text', () => {
    renderModal({
      factors: [],
      keyFindings: [{
        title: 'Code path finding',
        severity: 'high',
        layer: 'security',
        evidence: {
          available: true,
          kind: 'sast',
          filePath: '/Users/stanzin/ExtensionShield/extensions_storage/extracted_a/background.js',
          lineStart: 12,
          label: '/Users/stanzin/ExtensionShield/extensions_storage/extracted_a/background.js:12',
        },
      }],
    });

    expect(document.body.textContent).toContain('background.js:12');
    expect(document.body.textContent).not.toMatch(/\/Users|\/home|extensions_storage|extracted_/);
  });
});
