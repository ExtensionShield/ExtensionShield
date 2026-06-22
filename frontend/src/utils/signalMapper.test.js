/**
 * Unit Tests for Signal Mapper
 * 
 * Tests the signal mapping utilities that convert scan results
 * to ExtensionShield's three-engine signal system.
 */

import {
  calculateCodeSignal,
  calculatePermsSignal,
  calculateIntelSignal,
  calculateAllSignals,
  getRiskLevel,
  getRiskColorClass,
  getSignalColorClass,
  countFindings,
  getTopFindingSummary,
  enrichScanWithSignals,
  SIGNAL_LEVELS
} from './signalMapper';

describe('Signal Mapper', () => {
  describe('SIGNAL_LEVELS', () => {
    it('should export correct signal levels', () => {
      expect(SIGNAL_LEVELS.OK).toBe('ok');
      expect(SIGNAL_LEVELS.WARN).toBe('warn');
      expect(SIGNAL_LEVELS.HIGH).toBe('high');
    });
  });

  describe('calculateCodeSignal', () => {
    it('should return OK for clean scan with no findings', () => {
      const scanResult = {
        sast_results: { sast_findings: {} },
        entropy_analysis: { obfuscated_files: 0 }
      };
      const signal = calculateCodeSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('Clean');
    });

    it('should return HIGH for critical SAST findings', () => {
      const scanResult = {
        sast_results: {
          sast_findings: {
            'file.js': [
              { extra: { severity: 'CRITICAL' }, check_id: 'test-critical' }
            ]
          }
        },
        entropy_analysis: { obfuscated_files: 0 }
      };
      const signal = calculateCodeSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.HIGH);
      expect(signal.label).toContain('critical');
    });

    it('should return WARN for medium severity findings', () => {
      const scanResult = {
        sast_results: {
          sast_findings: {
            'file.js': [
              { extra: { severity: 'MEDIUM' }, check_id: 'test-1' },
              { extra: { severity: 'MEDIUM' }, check_id: 'test-2' },
              { extra: { severity: 'MEDIUM' }, check_id: 'test-3' },
              { extra: { severity: 'MEDIUM' }, check_id: 'test-4' },
              { extra: { severity: 'MEDIUM' }, check_id: 'test-5' }
            ]
          }
        },
        entropy_analysis: { obfuscated_files: 0 }
      };
      const signal = calculateCodeSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.WARN);
    });

    it('should return HIGH for multiple obfuscated files', () => {
      const scanResult = {
        sast_results: { sast_findings: {} },
        entropy_analysis: { obfuscated_files: 4 }
      };
      const signal = calculateCodeSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.HIGH);
      expect(signal.label).toContain('obfusc');
    });

    it('should handle null/undefined input gracefully', () => {
      const signal = calculateCodeSignal(null);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('Clean');
    });
  });

  describe('calculatePermsSignal', () => {
    it('should return OK for minimal permissions', () => {
      const scanResult = {
        permissions_analysis: {
          permissions_details: [
            { name: 'storage', risk: 'low' }
          ]
        },
        manifest: { permissions: ['storage'] }
      };
      const signal = calculatePermsSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('Minimal');
    });

    it('should return WARN for some high-risk permissions', () => {
      const scanResult = {
        permissions_analysis: {
          permissions_details: [
            { name: 'history', risk: 'high' },
            { name: 'clipboardRead', risk: 'high' }
          ]
        },
        manifest: { permissions: ['history', 'clipboardRead'] }
      };
      const signal = calculatePermsSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.WARN);
    });

    it('should return HIGH for many high-risk permissions', () => {
      const scanResult = {
        permissions_analysis: {
          permissions_details: [
            { name: 'history', risk: 'high' },
            { name: 'clipboardRead', risk: 'high' },
            { name: 'management', risk: 'high' },
            { name: 'identity', risk: 'high' }
          ]
        },
        manifest: { 
          permissions: ['history', 'clipboardRead', 'management', 'identity'],
          host_permissions: ['<all_urls>']
        }
      };
      const signal = calculatePermsSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.HIGH);
    });

    it('should handle null/undefined input gracefully', () => {
      const signal = calculatePermsSignal(null);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('Minimal');
    });
  });

  describe('calculateIntelSignal', () => {
    it('should return OK with 0 flags for clean VirusTotal', () => {
      const scanResult = {
        virustotal_analysis: {
          total_malicious: 0,
          total_suspicious: 0
        }
      };
      const signal = calculateIntelSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('0 flags');
    });

    it('should return WARN for suspicious detections', () => {
      const scanResult = {
        virustotal_analysis: {
          total_malicious: 0,
          total_suspicious: 3
        }
      };
      const signal = calculateIntelSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.WARN);
    });

    it('should return HIGH for malicious detections', () => {
      const scanResult = {
        virustotal_analysis: {
          total_malicious: 3,
          total_suspicious: 0
        }
      };
      const signal = calculateIntelSignal(scanResult);
      expect(signal.level).toBe(SIGNAL_LEVELS.HIGH);
    });

    it('should handle null/undefined input gracefully', () => {
      const signal = calculateIntelSignal(null);
      expect(signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signal.label).toBe('0 flags');
    });
  });

  describe('calculateAllSignals', () => {
    it('should return all three signals', () => {
      const scanResult = {
        sast_results: { sast_findings: {} },
        entropy_analysis: { obfuscated_files: 0 },
        permissions_analysis: { permissions_details: [] },
        manifest: { permissions: [] },
        virustotal_analysis: { total_malicious: 0, total_suspicious: 0 }
      };
      const signals = calculateAllSignals(scanResult);
      expect(signals).toHaveProperty('code_signal');
      expect(signals).toHaveProperty('perms_signal');
      expect(signals).toHaveProperty('intel_signal');
      expect(signals.code_signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signals.perms_signal.level).toBe(SIGNAL_LEVELS.OK);
      expect(signals.intel_signal.level).toBe(SIGNAL_LEVELS.OK);
    });
  });

  describe('getRiskLevel', () => {
    it('should return LOW for scores >= 75', () => {
      expect(getRiskLevel(75)).toBe('LOW');
      expect(getRiskLevel(100)).toBe('LOW');
      expect(getRiskLevel(90)).toBe('LOW');
    });

    it('should return MEDIUM for scores >= 50 and < 75', () => {
      expect(getRiskLevel(50)).toBe('MEDIUM');
      expect(getRiskLevel(60)).toBe('MEDIUM');
      expect(getRiskLevel(74)).toBe('MEDIUM');
    });

    it('should return HIGH for scores < 50', () => {
      expect(getRiskLevel(40)).toBe('HIGH');
      expect(getRiskLevel(49)).toBe('HIGH');
    });

    it('should return HIGH for lower scores as well', () => {
      expect(getRiskLevel(0)).toBe('HIGH');
      expect(getRiskLevel(39)).toBe('HIGH');
      expect(getRiskLevel(20)).toBe('HIGH');
    });
  });

  describe('getRiskColorClass', () => {
    it('should return correct CSS classes', () => {
      expect(getRiskColorClass('LOW')).toBe('risk-low');
      expect(getRiskColorClass('MED')).toBe('risk-medium');
      expect(getRiskColorClass('MEDIUM')).toBe('risk-medium');
      expect(getRiskColorClass('MODERATE')).toBe('risk-high');
      expect(getRiskColorClass('HIGH')).toBe('risk-high');
      expect(getRiskColorClass('CRITICAL')).toBe('risk-high');
      expect(getRiskColorClass('UNKNOWN')).toBe('risk-unknown');
      expect(getRiskColorClass(null)).toBe('risk-unknown');
    });
  });

  describe('getSignalColorClass', () => {
    it('should return correct CSS classes', () => {
      expect(getSignalColorClass(SIGNAL_LEVELS.OK)).toBe('signal-ok');
      expect(getSignalColorClass(SIGNAL_LEVELS.WARN)).toBe('signal-warn');
      expect(getSignalColorClass(SIGNAL_LEVELS.HIGH)).toBe('signal-high');
      expect(getSignalColorClass('unknown')).toBe('signal-unknown');
    });
  });

  describe('countFindings', () => {
    it('should sum findings from risk distribution', () => {
      const scanResult = {
        risk_distribution: { high: 2, medium: 3, low: 5 }
      };
      expect(countFindings(scanResult)).toBe(10);
    });

    it('should handle missing fields gracefully', () => {
      expect(countFindings(null)).toBe(0);
      expect(countFindings({})).toBe(0);
    });
  });

  describe('getTopFindingSummary', () => {
    it('should return highest severity finding message', () => {
      const scanResult = {
        sast_results: {
          sast_findings: {
            'file.js': [
              { extra: { severity: 'LOW', message: 'Low issue' } },
              { extra: { severity: 'CRITICAL', message: 'Critical security vulnerability detected' } }
            ]
          }
        }
      };
      const summary = getTopFindingSummary(scanResult);
      expect(summary).toContain('Critical');
    });

    it('should truncate long messages', () => {
      const longMessage = 'A'.repeat(100);
      const scanResult = {
        sast_results: {
          sast_findings: {
            'file.js': [
              { extra: { severity: 'HIGH', message: longMessage } }
            ]
          }
        }
      };
      const summary = getTopFindingSummary(scanResult);
      expect(summary.length).toBeLessThanOrEqual(60);
      expect(summary).toContain('...');
    });

    it('should return null for no findings', () => {
      expect(getTopFindingSummary({})).toBeNull();
      expect(getTopFindingSummary(null)).toBeNull();
    });
  });

  describe('enrichScanWithSignals', () => {
    it('should enrich scan with all signal data', () => {
      const scan = {
        extension_id: 'test-ext',
        extension_name: 'Test Extension',
        timestamp: '2024-01-01T00:00:00Z'
      };
      const fullResult = {
        overall_security_score: 75,
        overall_risk: 'MED',
        total_findings: 5,
        sast_results: { sast_findings: {} },
        entropy_analysis: { obfuscated_files: 0 },
        permissions_analysis: { permissions_details: [] },
        manifest: { permissions: [] },
        virustotal_analysis: { total_malicious: 0, total_suspicious: 0 }
      };

      const enriched = enrichScanWithSignals(scan, fullResult);

      expect(enriched.extension_id).toBe('test-ext');
      expect(enriched.score).toBe(75);
      expect(enriched.risk_level).toBe('MEDIUM');
      expect(enriched.findings_count).toBe(5);
      expect(enriched.signals).toBeDefined();
      expect(enriched.signals.code_signal).toBeDefined();
      expect(enriched.signals.perms_signal).toBeDefined();
      expect(enriched.signals.intel_signal).toBeDefined();
      expect(enriched.last_scanned_at).toBe('2024-01-01T00:00:00Z');
    });
  });
});

