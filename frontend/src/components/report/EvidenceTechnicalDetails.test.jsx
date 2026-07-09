import React from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import EvidenceTechnicalDetails from './EvidenceTechnicalDetails';

const rawScanResult = {
  timestamp: '2026-07-08T12:00:00Z',
  manifest: {
    manifest_version: 3,
    permissions: ['tabs', 'storage'],
    host_permissions: ['https://example.com/*'],
    optional_permissions: ['downloads'],
    content_security_policy: { extension_pages: "script-src 'self'; object-src 'self'" },
    content_scripts: [{ matches: ['https://example.com/*'], js: ['content.js'] }],
    web_accessible_resources: [{ resources: ['images/icon.png'], matches: ['https://example.com/*'] }],
    externally_connectable: { matches: ['https://partner.example/*'] },
  },
  sast_results: {
    files_scanned: 2,
    sast_findings: {
      '/Users/dev/ExtensionShield/extensions_storage/extracted_abc/js/background.js': [
        {
          check_id: 'dangerous.eval',
          path: '/Users/dev/ExtensionShield/extensions_storage/extracted_abc/js/background.js',
          start: { line: 42 },
          end: { line: 43 },
          extra: {
            severity: 'ERROR',
            message: 'Avoid eval',
            lines: 'eval(userInput);',
          },
        },
      ],
    },
  },
  virustotal_analysis: {
    enabled: true,
    files_analyzed: 2,
    files_found_in_vt: 1,
    files_with_detections: 1,
    total_malicious: 1,
    total_suspicious: 0,
    summary: { threat_level: 'malicious' },
    file_results: [
      {
        file_name: 'background.js',
        file_path: '/Users/dev/ExtensionShield/extensions_storage/extracted_abc/js/background.js',
        hashes: { sha256: 'abc123def456' },
        virustotal: {
          found: true,
          detection_stats: { malicious: 1, suspicious: 0, harmless: 20, undetected: 4, total_engines: 25 },
        },
      },
    ],
  },
  governance_bundle: {
    rule_results: {
      rule_results: [
        {
          rulepack: 'CWS_LIMITED_USE',
          rule_id: 'R5',
          verdict: 'REVIEW',
          explanation: 'Sensitive permission requires disclosure.',
          recommended_action: 'Verify privacy disclosure.',
        },
      ],
    },
    signal_pack: {
      sast: { files_scanned: 2 },
      virustotal: { enabled: true, files_analyzed: 2, malicious_count: 1 },
    },
  },
  metadata: { user_count: 1000, rating: 4.5, version: '1.0.0' },
};

const viewModel = {
  permissions: {
    apiPermissions: ['tabs', 'storage'],
    hostPermissions: ['https://example.com/*'],
    highRiskPermissions: ['tabs'],
    unreasonablePermissions: [],
    broadHostPatterns: [],
  },
  evidenceIndex: {},
};

function renderDetails(raw = rawScanResult, vm = viewModel) {
  return render(<EvidenceTechnicalDetails rawScanResult={raw} viewModel={vm} />);
}

function clickTab(name) {
  fireEvent.click(screen.getByRole('tab', { name }));
}

describe('EvidenceTechnicalDetails', () => {
  it('renders the section with available normalized data', () => {
    renderDetails();
    expect(screen.getByRole('heading', { name: 'Evidence & Technical Details' })).toBeInTheDocument();
    expect(screen.getByText('tabs')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/*')).toBeInTheDocument();
  });

  it('renders permissions and host permissions in the Permissions tab', () => {
    renderDetails();
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('tabs')).toBeInTheDocument();
    expect(within(panel).getAllByText('API').length).toBeGreaterThan(0);
    expect(within(panel).getByText('https://example.com/*')).toBeInTheDocument();
    expect(within(panel).getByText('Host')).toBeInTheDocument();
  });

  it('explains broad host, debugger, and capture permissions as capabilities without claiming abuse', () => {
    renderDetails(
      {
        manifest: { permissions: ['debugger', 'tabCapture', 'desktopCapture'], host_permissions: ['*://*/*'] },
      },
      {
        permissions: {
          apiPermissions: ['debugger', 'tabCapture', 'desktopCapture'],
          hostPermissions: ['*://*/*'],
          highRiskPermissions: ['debugger'],
          broadHostPatterns: ['*://*/*'],
        },
        evidenceIndex: {},
      }
    );

    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText(/DevTools protocol/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Capture audio or video from a browser tab/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Request capture of a screen, window, or tab/i)).toBeInTheDocument();
    expect(within(panel).getByText(/capability increases review scope, but is not proof of misuse/i)).toBeInTheDocument();
  });

  it('renders manifest, CSP, host, and content script fields', () => {
    renderDetails();
    clickTab(/Manifest/);
    expect(screen.getByText('Manifest V3')).toBeInTheDocument();
    expect(screen.getByText(/script-src 'self'/)).toBeInTheDocument();
    expect(screen.getAllByText(/https:\/\/example\.com\/\*/).length).toBeGreaterThan(0);
    expect(screen.getByText(/content\.js/)).toBeInTheDocument();
  });

  it('renders Code/SAST file, line, and snippet without local absolute paths', () => {
    const { container } = renderDetails();
    clickTab(/Code\/SAST/);
    expect(screen.getByText('dangerous.eval')).toBeInTheDocument();
    expect(screen.getByText('js/background.js')).toBeInTheDocument();
    expect(screen.getByText('Line 42-43')).toBeInTheDocument();
    expect(screen.getByText('eval(userInput);')).toBeInTheDocument();
    expect(container.textContent).not.toContain('/Users/');
    expect(container.textContent).not.toContain('extensions_storage');
  });

  it('shows failed/not-analyzed Code/SAST status when no SAST findings are present', () => {
    renderDetails(
      {
        timestamp: '2026-07-08T12:00:00Z',
        sast_results: { scan_error: true, files_scanned: 0, sast_findings: {} },
      },
      { permissions: {}, evidenceIndex: {} }
    );
    clickTab(/Code\/SAST/);
    expect(screen.getByText(/Code\/SAST did not complete/i)).toBeInTheDocument();
    expect(screen.queryByText(/code is clean/i)).toBeNull();
  });

  it('renders VirusTotal coverage, counts, hash, and file details', () => {
    renderDetails();
    clickTab(/VirusTotal/);
    expect(screen.getByText('Files analyzed')).toBeInTheDocument();
    expect(screen.getByText('Malicious')).toBeInTheDocument();
    expect(screen.getByText('js/background.js')).toBeInTheDocument();
    expect(screen.getByText(/abc123def456/)).toBeInTheDocument();
    expect(screen.getByText('1 malicious')).toBeInTheDocument();
  });

  it('renders governance rulepack, rule, reason, and action', () => {
    renderDetails();
    clickTab(/Governance/);
    expect(screen.getByText(/CWS_LIMITED_USE/)).toBeInTheDocument();
    expect(screen.getByText(/R5/)).toBeInTheDocument();
    expect(screen.getByText('Sensitive permission requires disclosure.')).toBeInTheDocument();
    expect(screen.getByText('Verify privacy disclosure.')).toBeInTheDocument();
  });

  it('renders analyzer coverage status and reason', () => {
    renderDetails();
    clickTab(/Coverage/);
    const panel = screen.getByRole('tabpanel');
    expect(within(panel).getByText('SAST')).toBeInTheDocument();
    expect(within(panel).getByText('VirusTotal')).toBeInTheDocument();
    expect(within(panel).getByText(/Code patterns, security anti-patterns, risky functions/)).toBeInTheDocument();
    expect(within(panel).getByText(/Known malicious files, URLs, and domains/)).toBeInTheDocument();
    expect(within(panel).getByText(/Completed on scanned files/)).toBeInTheDocument();
    expect(within(panel).getAllByText('Jul 8, 2026').length).toBeGreaterThan(0);
  });

  it('renders a safe empty state when data is missing', () => {
    renderDetails({}, { permissions: {}, evidenceIndex: {} });
    expect(screen.getByText('No permissions were included in the normalized report.')).toBeInTheDocument();
    clickTab(/Manifest/);
    expect(screen.getByText('No manifest details were included in the scan payload.')).toBeInTheDocument();
  });
});
