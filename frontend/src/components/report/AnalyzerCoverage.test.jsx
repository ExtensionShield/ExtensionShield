import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AnalyzerCoverage from './AnalyzerCoverage';

describe('AnalyzerCoverage', () => {
  it('shows "No code scanned" (not clean) when SAST scanned 0 files, with a visible coverage-gap note', () => {
    render(
      <AnalyzerCoverage
        rawScanResult={{
          timestamp: '2026-07-07T00:00:00Z',
          governance_bundle: { signal_pack: { sast: { scan_error: false, files_scanned: 0 } } },
          metadata: { user_count: 100 },
        }}
      />
    );
    expect(screen.getByText('No code scanned')).toBeInTheDocument();
    // Appears in both the coverage-gap note and the SAST status — never as "clean".
    expect(screen.getAllByText(/does not mean the code is clean/i).length).toBeGreaterThan(0);
  });

  it('renders all four analyzers with coverage labels', () => {
    render(
      <AnalyzerCoverage
        rawScanResult={{
          governance_bundle: { signal_pack: { sast: { files_scanned: 5 }, virustotal: { enabled: true, files_analyzed: 5, malicious_count: 0 } } },
          virustotal_analysis: { enabled: true, files_analyzed: 5, files_found_in_vt: 5 },
          metadata: { user_count: 1000, rating: 4.5, version: '1.0' },
        }}
      />
    );
    expect(screen.getByText('SAST')).toBeInTheDocument();
    expect(screen.getByText('VirusTotal')).toBeInTheDocument();
    expect(screen.getByText('Chrome Web Store')).toBeInTheDocument();
    expect(screen.getByText('ChromeStats')).toBeInTheDocument();
    expect(screen.getAllByText('Full coverage').length).toBeGreaterThan(0);
    // ChromeStats has no data in this payload -> honestly "Not run"
    expect(screen.getByText('Not run')).toBeInTheDocument();
  });

  it('renders nothing when there is no scan data', () => {
    const { container } = render(<AnalyzerCoverage rawScanResult={null} />);
    expect(container.firstChild).toBeNull();
  });
});
