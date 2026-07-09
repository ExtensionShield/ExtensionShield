import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import SummaryPanel from './SummaryPanel';

describe('SummaryPanel', () => {
  it('renders the risk callout and provided key findings, and opens evidence on click', () => {
    const onViewEvidence = vi.fn();
    const onViewRiskyPermissions = vi.fn();

    render(
      <SummaryPanel
        scores={{
          overall: { score: 62, band: 'WARN', confidence: 0.81 },
          decision: 'WARN',
          insufficientData: false,
          decisionAuthority: 'coverage_cap',
        }}
        rawScanResult={{
          scoring_v2: { coverage_cap_applied: true },
        }}
        topFindings={[
          {
            title: 'Broad host access',
            summary: 'The extension can run on many pages you visit.',
            severity: 'medium',
            evidenceIds: ['perm:all_urls'],
          },
        ]}
        onViewEvidence={onViewEvidence}
        onViewRiskyPermissions={onViewRiskyPermissions}
      />
    );

    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.getByText('62/100')).toBeInTheDocument();
    expect(screen.getByText('81%')).toBeInTheDocument();
    expect(screen.getByText('Partial coverage')).toBeInTheDocument();
    // Provenance stat (this fixture has no valid store URL -> unverified listing).
    expect(screen.getByText('Unverified listing')).toBeInTheDocument();
    // Decision basis moved into the collapsed "Why is this ...?" disclosure.
    expect(screen.getByText(/Why is this/i)).toBeInTheDocument();
    expect(screen.getByText(/Decision basis:\s*Coverage Cap/i)).toBeInTheDocument();
    // Expert evidence: explicit analyzer status; SAST-missing must read "did not run", never clean.
    expect(screen.getByText('Analyzer coverage')).toBeInTheDocument();
    expect(screen.getAllByText(/did not run/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Broad host access')).toBeInTheDocument();
    expect(screen.getByText('The extension can run on many pages you visit.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /view evidence/i }));
    expect(onViewEvidence).toHaveBeenCalledWith(['perm:all_urls']);
  });

  it('never contradicts a review verdict with an "appears safe" lead, and shows Partial coverage when SAST did not run', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 80, band: 'WARN', confidence: 0.82 },
          decision: 'WARN',
          insufficientData: false,
        }}
        // LLM one-liner asserts safety, but the authoritative verdict is NEEDS_REVIEW.
        // No sast_results => SAST did not run => coverage must be Partial, not Full.
        rawScanResult={{
          summary: { one_liner: 'This extension appears safe for general use.' },
          scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 80 },
        }}
      />
    );

    // Verdict-driven headline is shown...
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    // ...and the contradictory "appears safe" LLM lead is NOT surfaced.
    expect(screen.queryByText(/appears safe for general use/i)).toBeNull();
    // Coverage must never read "Full coverage" when SAST did not run.
    expect(screen.getByText('Partial coverage')).toBeInTheDocument();
    expect(screen.queryByText('Full coverage')).toBeNull();
  });

  it('uses blocked-first wording for a blocking verdict instead of the softer "High Risk" summary', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 42, band: 'BAD', confidence: 0.77 },
          decision: 'BLOCK',
          insufficientData: false,
          reasons: ['Sensitive data may be sent to external servers.'],
        }}
        rawScanResult={{
          scoring_v2: { decision: 'BLOCK', overall_score: 42 },
          sast_results: { files_scanned: 3, sast_findings: {} },
        }}
        topFindings={[
          {
            title: 'Sensitive data transfer risk',
            summary: 'The extension can transmit browsing data to remote services.',
            severity: 'high',
            evidenceIds: [],
          },
        ]}
      />
    );

    expect(screen.getByText('BLOCKED')).toBeInTheDocument();
    expect(screen.getByText('Blocked')).toBeInTheDocument();
    expect(screen.getAllByText(/blocked by automated security checks/i)).toHaveLength(2);
    expect(screen.getByText(/Why is this Blocked\?/i)).toBeInTheDocument();
    expect(screen.queryByText('High Risk')).toBeNull();
  });

  it('renders summary-only finding evidence without placeholder wording', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 57, band: 'WARN', confidence: 0.7 },
          decision: 'WARN',
        }}
        rawScanResult={{ scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 57 } }}
        topFindings={[
          {
            title: 'Policy Review',
            summary: 'Potential policy issue needs review.',
            severity: 'medium',
            evidenceIds: [],
            evidence: { available: false, kind: 'summary' },
          },
        ]}
      />
    );

    expect(screen.getByText('Based on summary only')).toBeInTheDocument();
    expect(screen.queryByText(/Evidence: summary only/i)).toBeNull();
  });

  it('UX calibration: a high-score REVIEW shows a plain evidence-backed bridge, not a failure', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 89, band: 'WARN', confidence: 0.84 },
          governance: { score: 60, band: 'WARN' },
          decision: 'WARN',
          insufficientData: false,
          reasons: [],
        }}
        rawScanResult={{
          scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 89 },
          sast_results: { files_scanned: 2, sast_findings: {} },
          manifest: { host_permissions: ['<all_urls>'] },
        }}
      />
    );

    // Plain bridging reason: high score AND the concrete driver (broad host).
    const lead = screen.getByText(/High score \(89\/100\), but review recommended because/i);
    expect(lead).toBeInTheDocument();
    expect(lead.textContent).toMatch(/run on every website/i);
    // Not harsh block language on a review.
    expect(screen.queryByText(/do not install/i)).toBeNull();
  });

  it('explains a governance rulepack verdict as a Policy decision, distinct from the score', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 65, band: 'WARN', confidence: 0.78 },
          decision: 'BLOCK',
          decisionAuthority: 'baseline_governance',
          reasons: ['Block — Limited Use policy requires explicit PII declaration'],
        }}
        rawScanResult={{
          scoring_v2: { decision: 'BLOCK', overall_score: 65 },
          governance_bundle: {
            decision: { final_reasons: ['Block — Limited Use policy requires explicit PII declaration'] },
          },
        }}
        keyFindings={[
          {
            title: 'Limited Use policy',
            severity: 'high',
            layer: 'governance',
            evidence: { kind: 'governance', rulepack: 'CWS_LIMITED_USE', ruleId: 'R2' },
          },
        ]}
      />
    );

    // The verdict basis is surfaced as a governance policy review with its rule id...
    expect(
      screen.getByText(/Decided by Chrome Web Store policy review \(governance rule CWS_LIMITED_USE::R2\)\./i)
    ).toBeInTheDocument();
    // ...and tagged a "Policy decision" so it reads as separate from the numeric score.
    expect(screen.getByText(/Policy decision:/i)).toBeInTheDocument();
  });

  it('names the hard gate that drove the verdict, and does not tag it a Policy decision', () => {
    render(
      <SummaryPanel
        scores={{
          overall: { score: 85, band: 'WARN', confidence: 0.8 },
          decision: 'BLOCK',
          decisionAuthority: 'hard_gate',
          reasons: ['Loads and runs code from a remote/external source'],
        }}
        rawScanResult={{
          scoring_v2: { decision: 'BLOCK', overall_score: 85, hard_gates_triggered: ['PURPOSE_MISMATCH'] },
        }}
      />
    );

    expect(
      screen.getByText(/Decided by a hard security\/privacy gate \(PURPOSE_MISMATCH\)\./i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Policy decision:/i)).toBeNull();
  });
});
