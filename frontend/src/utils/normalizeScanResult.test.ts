/**
 * normalizeScanResult Tests & Runtime Assertions
 * 
 * This module provides:
 * 1. Jest-compatible test suites (when Jest/Vitest is configured)
 * 2. Runtime assertions that can be called directly
 * 3. Test fixtures for manual validation
 * 
 * To run runtime assertions in browser console:
 *   window.__runNormalizerAssertions()
 */

import {
  normalizeScanResult,
  normalizeScanResultSafe,
  createEmptyReportViewModel,
  hasScoring,
  hasScoringV2,
  coherentRiskLevel,
} from './normalizeScanResult';
import type { RawScanResult, ReportViewModel } from './reportTypes';

// Polyfill for environments without Jest
const describe = typeof global !== 'undefined' && (global as Record<string, unknown>).describe 
  ? (global as Record<string, unknown>).describe as (name: string, fn: () => void) => void
  : (name: string, fn: () => void) => { /* no-op in non-test environments */ };
const it = typeof global !== 'undefined' && (global as Record<string, unknown>).it
  ? (global as Record<string, unknown>).it as (name: string, fn: () => void) => void  
  : (name: string, fn: () => void) => { /* no-op in non-test environments */ };
const expect = typeof global !== 'undefined' && (global as Record<string, unknown>).expect
  ? (global as Record<string, unknown>).expect as (value: unknown) => {
      toBe: (expected: unknown) => void;
      toBeNull: () => void;
      toBeDefined: () => void;
      toEqual: (expected: unknown) => void;
      toContain: (expected: unknown) => void;
      toBeGreaterThan: (expected: number) => void;
      toThrow: () => void;
    }
  : (value: unknown) => ({
      toBe: () => {},
      toBeNull: () => {},
      toBeDefined: () => {},
      toEqual: () => {},
      toContain: () => {},
      toBeGreaterThan: () => {},
      toThrow: () => {},
    });

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Minimal valid raw result (only required field)
 */
const minimalRawResult: RawScanResult = {
  extension_id: 'test123',
};

/**
 * Complete raw result with scoring_v2
 */
const completeRawResult: RawScanResult = {
  extension_id: 'beepaenfejnphdgnkmccjcfiieihhogl',
  extension_name: 'Check US Visa Slots - USVisaScheduling',
  url: 'https://chromewebstore.google.com/detail/check-us-visa-slots-usvis/beepaenfejnphdgnkmccjcfiieihhogl',
  timestamp: '2026-02-02T18:03:14.904402',
  status: 'completed',
  metadata: {
    title: 'Check US Visa Slots - USVisaScheduling',
    user_count: 70000,
    rating: 4.6,
    ratings_count: 1000,
    last_updated: 'December 24, 2025',
    version: '4.6.6',
  },
  manifest: {
    name: 'Check US Visa Slots - USVisaScheduling',
    version: '4.6.6',
    manifest_version: 3,
    permissions: ['storage', 'activeTab', 'scripting'],
    host_permissions: ['https://*.usvisascheduling.com/*'],
  },
  scoring_v2: {
    scoring_version: 'v2',
    security_score: 75,
    privacy_score: 70,
    governance_score: 80,
    overall_score: 74,
    overall_confidence: 0.85,
    decision: 'ALLOW',
    decision_reasons: ['Overall score 74/100 - extension passes all checks'],
    hard_gates_triggered: [],
    risk_level: 'medium',
    security_layer: {
      layer_name: 'security',
      score: 75,
      risk: 0.25,
      risk_level: 'low',
      confidence: 0.9,
      factors: [
        {
          name: 'SAST',
          severity: 0.2,
          confidence: 0.9,
          weight: 0.4,
          contribution: 0.072,
          evidence_ids: ['ev_001'],
        },
        {
          name: 'VirusTotal',
          severity: 0.0,
          confidence: 1.0,
          weight: 0.3,
          contribution: 0,
          evidence_ids: [],
        },
      ],
    },
    privacy_layer: {
      layer_name: 'privacy',
      score: 70,
      risk: 0.3,
      confidence: 0.8,
      factors: [
        {
          name: 'Permissions',
          severity: 0.35,
          confidence: 0.7,
          weight: 0.5,
          contribution: 0.1225,
          evidence_ids: ['ev_002'],
        },
      ],
    },
    governance_layer: {
      layer_name: 'governance',
      score: 80,
      risk: 0.2,
      confidence: 0.75,
      factors: [],
    },
  },
  governance_bundle: {
    evidence_index: {
      evidence: {
        ev_001: {
          evidence_id: 'ev_001',
          file_path: 'js/content.js',
          line_start: 1,
          line_end: 1,
          snippet: 'function e(e){...',
          provenance: 'SAST: banking.third_party.external_api_calls [ERROR]',
          created_at: '2026-02-03T00:03:14.883037',
        },
        ev_002: {
          evidence_id: 'ev_002',
          file_path: 'manifest.json',
          snippet: '"permissions": ["scripting"]',
          provenance: 'Permission: scripting',
          created_at: '2026-02-03T00:03:14.883443',
        },
      },
    },
  },
  permissions_analysis: {
    permissions_details: {
      scripting: {
        permission_name: 'scripting',
        is_reasonable: false,
        justification_reasoning: 'High risk permission',
      },
      storage: {
        permission_name: 'storage',
        is_reasonable: true,
        justification_reasoning: 'Standard permission',
      },
    },
  },
};

/**
 * Legacy raw result (no scoring_v2)
 */
const legacyRawResult: RawScanResult = {
  extension_id: 'legacy123',
  extension_name: 'Legacy Extension',
  overall_security_score: 65,
  total_findings: 2,
  risk_distribution: { high: 0, medium: 2, low: 0 },
  overall_risk: 'medium',
  manifest: {
    permissions: ['storage', 'tabs'],
  },
  summary: {
    key_findings: [
      'Found external API calls',
      'Unreasonable permissions detected',
    ],
  },
};

/**
 * Raw result with hard gates triggered
 */
const blockedRawResult: RawScanResult = {
  extension_id: 'blocked123',
  extension_name: 'Blocked Extension',
  scoring_v2: {
    security_score: 15,
    privacy_score: 20,
    governance_score: 40,
    overall_score: 21,
    overall_confidence: 0.95,
    decision: 'BLOCK',
    decision_reasons: ['VirusTotal: 8 malware detections'],
    hard_gates_triggered: ['VT_MALWARE'],
    risk_level: 'critical',
  },
};

// =============================================================================
// TESTS
// =============================================================================

describe('normalizeScanResult', () => {
  describe('basic functionality', () => {
    it('should normalize a minimal raw result', () => {
      const result = normalizeScanResult(minimalRawResult);
      expect(result.meta.extensionId).toBe('test123');
      expect(result.meta.name).toBe('Unknown Extension');
      expect(result.scores.decision).toBeNull();
    });

    it('should normalize a complete raw result with scoring_v2', () => {
      const result = normalizeScanResult(completeRawResult);
      
      // Meta
      expect(result.meta.extensionId).toBe('beepaenfejnphdgnkmccjcfiieihhogl');
      expect(result.meta.name).toBe('Check US Visa Slots - USVisaScheduling');
      expect(result.meta.version).toBe('4.6.6');
      expect(result.meta.users).toBe(70000);
      expect(result.meta.rating).toBe(4.6);
      
      // Scores
      expect(result.scores.security.score).toBe(75);
      expect(result.scores.privacy.score).toBe(70);
      expect(result.scores.governance.score).toBe(80);
      expect(result.scores.overall.score).toBe(74);
      expect(result.scores.overall.confidence).toBe(0.85);
      expect(result.scores.decision).toBe('ALLOW');
      // Score 74 in 50-74, so band is WARN (score-based, not decision-based)
      expect(result.scores.overall.band).toBe('WARN');
      
      // Factors
      expect(result.factorsByLayer.security.length).toBeGreaterThan(0);
      expect(result.factorsByLayer.privacy.length).toBeGreaterThan(0);
      
      // Evidence
      expect(Object.keys(result.evidenceIndex).length).toBe(2);
      expect(result.evidenceIndex['ev_001']).toBeDefined();
      expect(result.evidenceIndex['ev_001'].filePath).toBe('js/content.js');
      
      // Permissions
      expect(result.permissions.apiPermissions).toContain('storage');
      expect(result.permissions.unreasonablePermissions).toContain('scripting');
    });

    // -------------------------------------------------------------------------
    // Audit Fix #3: the overall (headline) band must reflect the authoritative
    // verdict, never just the score. A high-scoring BLOCK/NEEDS_REVIEW must not
    // render as a green "Safe" gauge.
    // -------------------------------------------------------------------------
    it('high-scoring BLOCK must produce a BAD overall band (not green/Safe)', () => {
      const raw: RawScanResult = {
        extension_id: 'blockhigh',
        extension_name: 'High Score Blocked',
        scoring_v2: {
          security_score: 92,
          privacy_score: 95,
          governance_score: 90,
          overall_score: 92, // would be GOOD by score alone
          overall_confidence: 0.9,
          decision: 'BLOCK',
          decision_reasons: ['Visa-slot automation detected'],
        },
      };
      const result = normalizeScanResult(raw);
      expect(result.scores.decision).toBe('BLOCK');
      expect(result.scores.overall.band).toBe('BAD');
    });

    it('high-scoring NEEDS_REVIEW must produce at least a WARN overall band', () => {
      const raw: RawScanResult = {
        extension_id: 'reviewhigh',
        extension_name: 'High Score Review',
        scoring_v2: {
          security_score: 88,
          privacy_score: 90,
          governance_score: 85,
          overall_score: 88, // GOOD by score alone
          overall_confidence: 0.6,
          decision: 'NEEDS_REVIEW',
          decision_reasons: ['Insufficient analysis coverage'],
        },
      };
      const result = normalizeScanResult(raw);
      expect(result.scores.decision).toBe('WARN');
      expect(result.scores.overall.band).toBe('WARN');
    });

    it('high-scoring ALLOW keeps its score band (no verdict downgrade)', () => {
      const raw: RawScanResult = {
        extension_id: 'allowhigh',
        extension_name: 'High Score Allow',
        scoring_v2: {
          security_score: 95,
          privacy_score: 95,
          governance_score: 95,
          overall_score: 95,
          overall_confidence: 0.9,
          decision: 'ALLOW',
          decision_reasons: ['All checks passed'],
        },
      };
      const result = normalizeScanResult(raw);
      expect(result.scores.decision).toBe('ALLOW');
      expect(result.scores.overall.band).toBe('GOOD');
    });

    it('should handle legacy raw result without scoring_v2', () => {
      const result = normalizeScanResult(legacyRawResult);
      
      expect(result.meta.extensionId).toBe('legacy123');
      expect(result.scores.overall.score).toBe(65);
      expect(result.scores.security.score).toBe(65); // Falls back to overall
      expect(result.scores.privacy.score).toBeNull();
      expect(result.scores.decision).toBeNull();
      
      // Should pick up legacy key_findings
      expect(result.keyFindings.length).toBeGreaterThan(0);
    });

    it('should handle blocked extension with hard gates', () => {
      const result = normalizeScanResult(blockedRawResult);
      
      expect(result.scores.decision).toBe('BLOCK');
      expect(result.scores.overall.band).toBe('BAD');
      expect(result.keyFindings.some(f => f.title === 'Flagged by antivirus engines')).toBe(true);
      expect(result.keyFindings[0].severity).toBe('high');
    });

    it('should normalize publisher_disclosures with NON_TRADER and links', () => {
      const rawWithDisclosures: RawScanResult = {
        extension_id: 'ext-with-disclosures',
        publisher_disclosures: {
          trader_status: 'NON_TRADER',
          developer_website_url: 'https://example.com',
          support_email: 'support@example.com',
          privacy_policy_url: 'https://example.com/privacy',
          user_count: 50000,
          rating_value: 4.5,
          rating_count: 1200,
          last_updated_iso: 'March 2025',
        },
      };
      const result = normalizeScanResult(rawWithDisclosures);
      expect(result.publisherDisclosures).toBeDefined();
      expect(result.publisherDisclosures!.trader_status).toBe('NON_TRADER');
      expect(result.publisherDisclosures!.developer_website_url).toBe('https://example.com');
      expect(result.publisherDisclosures!.support_email).toBe('support@example.com');
      expect(result.publisherDisclosures!.privacy_policy_url).toBe('https://example.com/privacy');
      expect(result.publisherDisclosures!.user_count).toBe(50000);
      expect(result.publisherDisclosures!.rating_value).toBe(4.5);
      expect(result.publisherDisclosures!.rating_count).toBe(1200);
      expect(result.publisherDisclosures!.last_updated_iso).toBe('March 2025');
    });

    it('should map missing trader_status to UNKNOWN and null links to null', () => {
      const rawMinimalDisclosures: RawScanResult = {
        extension_id: 'ext-minimal',
        publisher_disclosures: {
          trader_status: 'UNKNOWN',
          developer_website_url: null,
          support_email: null,
          privacy_policy_url: null,
        },
      };
      const result = normalizeScanResult(rawMinimalDisclosures);
      expect(result.publisherDisclosures).toBeDefined();
      expect(result.publisherDisclosures!.trader_status).toBe('UNKNOWN');
      expect(result.publisherDisclosures!.developer_website_url).toBeNull();
      expect(result.publisherDisclosures!.support_email).toBeNull();
      expect(result.publisherDisclosures!.privacy_policy_url).toBeNull();
    });
  });

  describe('error handling', () => {
    it('should throw on missing extension_id', () => {
      expect(() => normalizeScanResult({} as RawScanResult)).toThrow();
    });

    it('should handle null/undefined gracefully with safe variant', () => {
      expect(normalizeScanResultSafe(null as unknown as RawScanResult)).toBeNull();
      expect(normalizeScanResultSafe(undefined as unknown as RawScanResult)).toBeNull();
      expect(normalizeScanResultSafe({} as RawScanResult)).toBeNull();
    });

    it('should not crash on deeply nested missing fields', () => {
      const sparse: RawScanResult = {
        extension_id: 'sparse123',
        governance_bundle: {
          // Empty bundle
        },
        permissions_analysis: {
          // Empty analysis
        },
      };
      
      const result = normalizeScanResult(sparse);
      expect(result.meta.extensionId).toBe('sparse123');
      expect(result.evidenceIndex).toEqual({});
      expect(result.factorsByLayer.security).toEqual([]);
    });
  });

  describe('band calculation', () => {
    it('overall band reflects the authoritative verdict (Fix #3)', () => {
      // ALLOW does not downgrade: score 40 is already BAD by score.
      const allowResult = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: { decision: 'ALLOW', overall_score: 40 },
      });
      expect(allowResult.scores.overall.band).toBe('BAD');
      expect(allowResult.scores.decision).toBe('ALLOW');

      // NEEDS_REVIEW with a mid score stays WARN.
      const warnResult = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 70 },
      });
      expect(warnResult.scores.overall.band).toBe('WARN');

      // A high-scoring BLOCK must NOT render green/Safe: the verdict forces BAD.
      // (Previously this returned GOOD — the audit #3 "green Safe BLOCK" bug.)
      const blockResult = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: { decision: 'BLOCK', overall_score: 80 },
      });
      expect(blockResult.scores.overall.band).toBe('BAD');
    });

    it('should use score-based bands when no decision exists', () => {
      const result90 = normalizeScanResult({
        extension_id: 'test',
        overall_security_score: 90,
      });
      expect(result90.scores.overall.band).toBe('GOOD');

      const result70 = normalizeScanResult({
        extension_id: 'test',
        overall_security_score: 70,
      });
      expect(result70.scores.overall.band).toBe('WARN');

      const result40 = normalizeScanResult({
        extension_id: 'test',
        overall_security_score: 40,
      });
      expect(result40.scores.overall.band).toBe('BAD');
    });
  });

  describe('helper functions', () => {
    it('createEmptyReportViewModel should return valid empty model', () => {
      const empty = createEmptyReportViewModel('test123');
      expect(empty.meta.extensionId).toBe('test123');
      expect(empty.meta.name).toBe('Loading...');
      expect(empty.scores.overall.band).toBe('NA');
      expect(empty.keyFindings).toEqual([]);
    });

    it('hasScoring should detect presence of scores', () => {
      const withScore = normalizeScanResult(completeRawResult);
      const withoutScore = createEmptyReportViewModel();
      
      expect(hasScoring(withScore)).toBe(true);
      expect(hasScoring(withoutScore)).toBe(false);
    });

    it('hasScoringV2 should detect v2 scoring data', () => {
      const v2Result = normalizeScanResult(completeRawResult);
      const legacyResult = normalizeScanResult(legacyRawResult);
      
      expect(hasScoringV2(v2Result)).toBe(true);
      expect(hasScoringV2(legacyResult)).toBe(false);
    });
  });

  describe('key findings extraction', () => {
    it('should prioritize hard gates as high severity', () => {
      const result = normalizeScanResult(blockedRawResult);
      const hardGateFinding = result.keyFindings.find(f => f.title === 'Flagged by antivirus engines');

      expect(hardGateFinding).toBeDefined();
      expect(hardGateFinding?.severity).toBe('high');
      expect(hardGateFinding?.layer).toBe('security');
    });

    it('should extract top factors by contribution', () => {
      // Create result with high-severity factors
      const result = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: {
          decision: 'WARN',
          security_layer: {
            factors: [
              { name: 'Low', severity: 0.1, confidence: 0.9, contribution: 0.01 },
              { name: 'High', severity: 0.8, confidence: 0.9, contribution: 0.5 },
              { name: 'Medium', severity: 0.5, confidence: 0.9, contribution: 0.2 },
            ],
          },
          privacy_layer: { factors: [] },
          governance_layer: { factors: [] },
        },
      });
      
      // High severity factor should be in findings
      expect(result.keyFindings.some(f => f.title === 'High')).toBe(true);
      // Low severity factor should not be (severity < 0.4)
      expect(result.keyFindings.some(f => f.title === 'Low')).toBe(false);
    });

    it('should map gates to correct layers (SENSITIVE_EXFIL -> privacy)', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: {
          decision: 'WARN',
          hard_gates_triggered: ['SENSITIVE_EXFIL'],
          security_layer: { factors: [] },
          privacy_layer: { factors: [] },
          governance_layer: { factors: [] },
        },
      });
      
      const sensitiveExfilFinding = result.keyFindings.find(f => f.title === 'May send your data to external servers');
      expect(sensitiveExfilFinding).toBeDefined();
      expect(sensitiveExfilFinding?.layer).toBe('privacy');
    });

    it('should apply gate-based band override to layer tiles (CRITICAL_SAST -> Security tile becomes BAD)', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: {
          decision: 'BLOCK',
          security_score: 75, // Score would normally be GOOD (75+)
          security_layer: {
            score: 75,
            risk_level: 'low', // Aligned with 75+ = green
            factors: [],
          },
          privacy_layer: { factors: [] },
          governance_layer: { factors: [] },
          gate_results: [
            {
              gate_id: 'CRITICAL_SAST',
              decision: 'BLOCK',
              triggered: true,
              confidence: 0.9,
              reasons: ['Critical SAST finding detected'],
            },
          ],
        },
      });
      
      // Security tile should be BAD (from gate) even though score is 75 (GOOD)
      expect(result.scores.security.score).toBe(75); // Numeric score unchanged
      expect(result.scores.security.band).toBe('BAD'); // Band overridden by gate
    });

    it('should fallback to decision_reasons when no factors', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        scoring_v2: {
          decision: 'ALLOW',
          decision_reasons: ['Extension passes all checks'],
          security_layer: { factors: [] },
          privacy_layer: { factors: [] },
          governance_layer: { factors: [] },
        },
      });
      
      expect(result.keyFindings.length).toBeGreaterThan(0);
      expect(result.keyFindings[0].title).toBe('Extension passes all checks');
      expect(result.keyFindings[0].severity).toBe('low');
    });
  });

  describe('permissions extraction', () => {
    it('should identify high-risk permissions', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        manifest: {
          permissions: ['storage', 'tabs', 'webRequest', 'clipboardRead'],
        },
      });
      
      expect(result.permissions.highRiskPermissions).toContain('webRequest');
      expect(result.permissions.highRiskPermissions).toContain('clipboardRead');
      expect(result.permissions.highRiskPermissions).not.toContain('storage');
    });

    it('should identify unreasonable permissions', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        manifest: { permissions: ['scripting'] },
        permissions_analysis: {
          permissions_details: {
            scripting: { is_reasonable: false },
          },
        },
      });
      
      expect(result.permissions.unreasonablePermissions).toContain('scripting');
    });

    it('should identify broad host patterns', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        manifest: {
          host_permissions: ['<all_urls>', 'https://specific.com/*'],
        },
      });
      
      expect(result.permissions.broadHostPatterns).toContain('<all_urls>');
      expect(result.permissions.broadHostPatterns?.length).toBe(1);
    });
  });

  describe('evidence index building', () => {
    it('should extract evidence from governance_bundle.evidence_index', () => {
      const result = normalizeScanResult(completeRawResult);
      
      expect(result.evidenceIndex['ev_001']).toBeDefined();
      expect(result.evidenceIndex['ev_001'].filePath).toBe('js/content.js');
      expect(result.evidenceIndex['ev_001'].lineStart).toBe(1);
      expect(result.evidenceIndex['ev_001'].snippet).toBeDefined();
    });

    it('should handle missing evidence gracefully', () => {
      const result = normalizeScanResult({
        extension_id: 'test',
        governance_bundle: {},
      });
      
      expect(result.evidenceIndex).toEqual({});
    });
  });
});

// =============================================================================
// DECISION AUTHORITY CONSUMER CONSISTENCY (ADR 0001)
// =============================================================================

describe('normalizeScanResult - decision authority consistency', () => {
  it('prefers governance_verdict over scoring_v2.decision', () => {
    // Scoring layer says ALLOW, but the governance authority says BLOCK.
    const raw: RawScanResult = {
      extension_id: 'authority1',
      governance_verdict: 'BLOCK',
      scoring_v2: {
        security_score: 80,
        privacy_score: 80,
        governance_score: 80,
        overall_score: 80,
        overall_confidence: 0.9,
        decision: 'ALLOW', // scoring-layer detail only
      },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.decision).toBe('BLOCK');
  });

  it('prefers governance_bundle.decision.final_verdict over legacy bundle verdict', () => {
    const raw: RawScanResult = {
      extension_id: 'authority2',
      governance_bundle: {
        decision: { final_verdict: 'NEEDS_REVIEW', verdict: 'ALLOW' },
      } as unknown as RawScanResult['governance_bundle'],
      scoring_v2: { overall_score: 90, decision: 'ALLOW' },
    };
    const result = normalizeScanResult(raw);
    // NEEDS_REVIEW normalizes to the 'WARN' band in the VM.
    expect(result.scores.decision).toBe('WARN');
  });

  it('falls back to scoring_v2.decision when no governance verdict exists', () => {
    const raw: RawScanResult = {
      extension_id: 'authority3',
      scoring_v2: { overall_score: 21, decision: 'BLOCK' },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.decision).toBe('BLOCK');
  });

  it('surfaces insufficient_data so a low-coverage scan is not shown as confidently safe', () => {
    const raw: RawScanResult = {
      extension_id: 'lowcov',
      insufficient_data: true,
      governance_verdict: 'NEEDS_REVIEW',
      scoring_v2: {
        overall_score: 65,
        overall_confidence: 0.46,
        decision: 'NEEDS_REVIEW',
        insufficient_data: true,
        decision_authority: 'insufficient_data',
      },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.insufficientData).toBe(true);
    // NEEDS_REVIEW normalizes to the 'WARN' band in the VM.
    expect(result.scores.decision).toBe('WARN');
    expect(result.scores.decisionAuthority).toBe('insufficient_data');
  });
});

// =============================================================================
// LAYER BAND <-> ISSUE ROW CONSISTENCY (Phase 1 follow-up)
// A layer tile must not present as "Safe" (GOOD) when it lists an ISSUE-level
// factor row (severity >= 0.4) — the threshold the LayerModal rows and the tile
// finding-count both use.
// =============================================================================

describe('normalizeScanResult - layer band issue consistency', () => {
  it('a privacy layer with an ISSUE-level factor is not GOOD/Safe', () => {
    const raw: RawScanResult = {
      extension_id: 'privacy-issue',
      scoring_v2: {
        decision: 'ALLOW',
        overall_score: 90,
        privacy_score: 80,
        privacy_layer: {
          layer_name: 'privacy',
          score: 80,
          risk_level: 'low', // GOOD by score/risk alone
          factors: [
            // e.g. Screen Capture flagged but layer score still high
            { name: 'CaptureSignals', severity: 0.6, confidence: 0.8, weight: 0.15, contribution: 0.072 },
          ],
        },
        security_layer: { factors: [] },
        governance_layer: { factors: [] },
      },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.privacy.band).toBe('WARN');
  });

  it('a layer with only sub-threshold factors keeps its GOOD score band', () => {
    const raw: RawScanResult = {
      extension_id: 'privacy-clean',
      scoring_v2: {
        decision: 'ALLOW',
        overall_score: 90,
        privacy_score: 80,
        privacy_layer: {
          layer_name: 'privacy',
          score: 80,
          risk_level: 'low',
          factors: [
            { name: 'CaptureSignals', severity: 0.1, confidence: 0.8, weight: 0.15, contribution: 0.012 },
          ],
        },
        security_layer: { factors: [] },
        governance_layer: { factors: [] },
      },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.privacy.band).toBe('GOOD');
  });

  it('a BLOCK gate on a layer still wins over the issue bump (BAD, not WARN)', () => {
    const raw: RawScanResult = {
      extension_id: 'privacy-gate',
      scoring_v2: {
        decision: 'BLOCK',
        overall_score: 80,
        privacy_score: 80,
        privacy_layer: {
          layer_name: 'privacy',
          score: 80,
          risk_level: 'low',
          factors: [
            { name: 'CaptureSignals', severity: 0.6, confidence: 0.8, weight: 0.15, contribution: 0.072 },
          ],
        },
        security_layer: { factors: [] },
        governance_layer: { factors: [] },
        gate_results: [
          { gate_id: 'SENSITIVE_EXFIL', decision: 'BLOCK', triggered: true, confidence: 0.9, reasons: ['exfil'] },
        ],
      },
    };
    const result = normalizeScanResult(raw);
    expect(result.scores.privacy.band).toBe('BAD');
  });
});

// =============================================================================
// RUNTIME ASSERTIONS (can be run independently)
// =============================================================================

/**
 * Run runtime assertions to validate normalizer behavior
 * Call this during development/testing to catch issues early
 */
export function runRuntimeAssertions(): void {
  console.log('[normalizeScanResult] Running runtime assertions...');
  
  // 1. Minimal input should not throw
  try {
    normalizeScanResult(minimalRawResult);
    console.log('✓ Minimal input handled');
  } catch (e) {
    console.error('✗ Minimal input failed:', e);
  }
  
  // 2. Complete input should produce valid output
  try {
    const result = normalizeScanResult(completeRawResult);
    if (!result.meta.extensionId) throw new Error('Missing extensionId');
    if (typeof result.scores.overall.score !== 'number') throw new Error('Invalid score type');
    console.log('✓ Complete input handled');
  } catch (e) {
    console.error('✗ Complete input failed:', e);
  }
  
  // 3. Legacy input should work
  try {
    const result = normalizeScanResult(legacyRawResult);
    if (!result.scores.overall.score) throw new Error('Missing legacy score');
    console.log('✓ Legacy input handled');
  } catch (e) {
    console.error('✗ Legacy input failed:', e);
  }
  
  // 4. Safe variant should not throw
  try {
    normalizeScanResultSafe(null as unknown as RawScanResult);
    normalizeScanResultSafe({} as RawScanResult);
    console.log('✓ Safe variant handled edge cases');
  } catch (e) {
    console.error('✗ Safe variant failed:', e);
  }
  
  // 5. Empty model should be valid
  try {
    const empty = createEmptyReportViewModel('test');
    if (!empty.scores.overall.band) throw new Error('Missing band');
    console.log('✓ Empty model valid');
  } catch (e) {
    console.error('✗ Empty model failed:', e);
  }
  
  console.log('[normalizeScanResult] Runtime assertions complete');
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__runNormalizerAssertions = runRuntimeAssertions;
}


// =============================================================================
// NARROW REPORTING/COVERAGE FIX TESTS (audit follow-up)
// =============================================================================

describe('Publisher update age (Maintenance) presentation', () => {
  it('publisher age >365 days alone does NOT create a standalone HIGH key finding', () => {
    const raw: RawScanResult = {
      extension_id: 'staleonly1234567890abcdefghijklmn',
      extension_name: 'Old But Clean',
      scoring_v2: {
        overall_score: 88,
        security_score: 84,
        privacy_score: 100,
        governance_score: 100,
        decision: 'NEEDS_REVIEW',
        risk_level: 'low',
        hard_gates_triggered: [],
        security_layer: {
          layer_name: 'security', score: 84, risk: 0.16, confidence: 0.9,
          factors: [
            { name: 'Maintenance', severity: 0.8, confidence: 0.9, weight: 0.1, contribution: 0.072, flags: ['stale_extension'] },
          ],
        },
        privacy_layer: { layer_name: 'privacy', score: 100, risk: 0, confidence: 1, factors: [] },
        governance_layer: { layer_name: 'governance', score: 100, risk: 0, confidence: 1, factors: [] },
      },
    } as unknown as RawScanResult;

    const vm = normalizeScanResult(raw);
    const maint = vm.keyFindings.find((f) => f.title === 'Publisher update age');
    expect(maint).toBeDefined();
    expect(maint!.severity).toBe('medium'); // advisory, NOT high
    // No HIGH key finding at all (nothing corroborates the staleness).
    expect(vm.keyFindings.some((f) => f.severity === 'high')).toBe(false);
    // Renamed label — "Update Freshness" must not appear.
    expect(vm.keyFindings.some((f) => /Update Freshness/i.test(f.title))).toBe(false);
  });

  it('publisher age CAN stay high when corroborated by a triggered gate', () => {
    const raw: RawScanResult = {
      extension_id: 'stalegate1234567890abcdefghijklmn',
      scoring_v2: {
        overall_score: 60, decision: 'BLOCK', risk_level: 'medium',
        hard_gates_triggered: ['SENSITIVE_EXFIL'],
        security_layer: { layer_name: 'security', score: 70, risk: 0.3, confidence: 0.9,
          factors: [{ name: 'Maintenance', severity: 0.8, confidence: 0.9, weight: 0.1, contribution: 0.072 }] },
        privacy_layer: { layer_name: 'privacy', score: 40, risk: 0.6, confidence: 0.9, factors: [] },
        governance_layer: { layer_name: 'governance', score: 100, risk: 0, confidence: 1, factors: [] },
      },
    } as unknown as RawScanResult;
    const vm = normalizeScanResult(raw);
    const maint = vm.keyFindings.find((f) => f.title === 'Publisher update age');
    expect(maint!.severity).toBe('high'); // corroborated by the SENSITIVE_EXFIL gate
  });
});

describe('Coverage-cap reasons are promoted into Key Findings', () => {
  it('coverage_cap_applied + Maintenance 0.8 surfaces the coverage reason FIRST (no-code)', () => {
    const raw: RawScanResult = {
      extension_id: 'nocode1234567890abcdefghijklmnop',
      scoring_v2: {
        overall_score: 80, decision: 'NEEDS_REVIEW', risk_level: 'low',
        coverage_cap_applied: true,
        coverage_cap_reason: 'SAST coverage missing; score capped at 80',
        hard_gates_triggered: [],
        security_layer: { layer_name: 'security', score: 85, risk: 0.15, confidence: 0.9,
          factors: [{ name: 'Maintenance', severity: 0.8, confidence: 0.9, weight: 0.1, contribution: 0.072 }] },
        privacy_layer: { layer_name: 'privacy', score: 100, risk: 0, confidence: 1, factors: [] },
        governance_layer: { layer_name: 'governance', score: 100, risk: 0, confidence: 1, factors: [] },
      },
      sast_results: { scan_error: false, files_scanned: 0, sast_findings: {} },
      virustotal_analysis: { enabled: true, files_found_in_vt: 5 },
    } as unknown as RawScanResult;

    const vm = normalizeScanResult(raw);
    // The PRIMARY key finding explains the real reason, not publisher update age.
    expect(vm.keyFindings[0].title).toBe('No analyzable code scanned');
    expect(vm.keyFindings[0].severity).toBe('high');
    // Publisher update age is still present but demoted to advisory.
    const maint = vm.keyFindings.find((f) => f.title === 'Publisher update age');
    expect(maint!.severity).toBe('medium');
  });

  it('VirusTotal unavailable surfaces "Limited malware reputation coverage", not malware', () => {
    const raw: RawScanResult = {
      extension_id: 'vtunknown1234567890abcdefghijklmn',
      scoring_v2: {
        overall_score: 65, decision: 'NEEDS_REVIEW', risk_level: 'medium',
        coverage_cap_applied: true,
        hard_gates_triggered: [],
        security_layer: { layer_name: 'security', score: 84, risk: 0.16, confidence: 0.9, factors: [] },
        privacy_layer: { layer_name: 'privacy', score: 100, risk: 0, confidence: 1, factors: [] },
        governance_layer: { layer_name: 'governance', score: 100, risk: 0, confidence: 1, factors: [] },
      },
      sast_results: { scan_error: false, files_scanned: 8, sast_findings: { 'a.js': [{}] } },
      virustotal_analysis: { enabled: true, files_found_in_vt: 0 },
    } as unknown as RawScanResult;

    const vm = normalizeScanResult(raw);
    const cov = vm.keyFindings.find((f) => f.title === 'Limited malware reputation coverage');
    expect(cov).toBeDefined();
    expect(/malware reputation could not be confirmed/i.test(cov!.summary)).toBe(true);
    // Never presented as a confirmed malware finding.
    expect(vm.keyFindings.some((f) => /flagged by antivirus/i.test(f.title))).toBe(false);
  });
});

describe('Microsoft Defender-style regression: coverage cap, not Update Freshness', () => {
  it('SAST-failure cap surfaces "Limited code coverage" as primary, not "Update Freshness HIGH"', () => {
    const raw: RawScanResult = {
      extension_id: 'defenderlike1234567890abcdefghij',
      extension_name: 'Microsoft Defender-like',
      metadata: { last_updated: 'February 15, 2025' },
      scoring_v2: {
        overall_score: 65, decision: 'NEEDS_REVIEW', risk_level: 'medium',
        coverage_cap_applied: true,
        coverage_cap_reason: 'SAST scan failed or was incomplete; cannot clear as safe without code-analysis coverage',
        hard_gates_triggered: [],
        security_layer: { layer_name: 'security', score: 84, risk: 0.16, confidence: 0.9,
          factors: [{ name: 'Maintenance', severity: 0.8, confidence: 0.9, weight: 0.1, contribution: 0.072, flags: ['stale_extension'] }] },
        privacy_layer: { layer_name: 'privacy', score: 100, risk: 0, confidence: 1, factors: [] },
        governance_layer: { layer_name: 'governance', score: 100, risk: 0, confidence: 1, factors: [] },
      },
      sast_results: { scan_error: true, files_scanned: 0, sast_findings: {} },
      virustotal_analysis: { enabled: true, files_found_in_vt: 5 },
    } as unknown as RawScanResult;

    const vm = normalizeScanResult(raw);
    expect(vm.keyFindings[0].title).toBe('Limited code coverage');
    // "Update Freshness" wording is gone; publisher update age is NOT the HIGH driver.
    expect(vm.keyFindings.some((f) => /Update Freshness/i.test(f.title))).toBe(false);
    const maint = vm.keyFindings.find((f) => f.title === 'Publisher update age');
    expect(maint!.severity).toBe('medium');
  });
});

describe('Verdict / risk-label coherence (coherentRiskLevel)', () => {
  it('floors low/none risk under BLOCK and NEEDS_REVIEW', () => {
    expect(coherentRiskLevel('BLOCK', 'low')).toBe('high');
    expect(coherentRiskLevel('BLOCK', 'none')).toBe('high');
    expect(coherentRiskLevel('BLOCK', '')).toBe('high');
    expect(coherentRiskLevel('NEEDS_REVIEW', 'low')).toBe('medium');
    expect(coherentRiskLevel('WARN', 'none')).toBe('medium');
  });

  it('does not downgrade an already-severe level, and passes ALLOW/unrated through', () => {
    expect(coherentRiskLevel('BLOCK', 'high')).toBe('high');
    expect(coherentRiskLevel('NEEDS_REVIEW', 'medium')).toBe('medium');
    expect(coherentRiskLevel('ALLOW', 'low')).toBe('low');
    expect(coherentRiskLevel(null, 'low')).toBe('low');
  });

  it('a BLOCK with a high score never renders a GOOD overall band', () => {
    const raw: RawScanResult = {
      extension_id: 'blockhigh1234567890abcdefghijklmn',
      scoring_v2: { overall_score: 85, decision: 'BLOCK', risk_level: 'low' },
    } as unknown as RawScanResult;
    const vm = normalizeScanResult(raw);
    expect(vm.scores.overall.band).toBe('BAD');
  });

  it('a NEEDS_REVIEW with a high score renders a WARN (never GOOD) overall band', () => {
    const raw: RawScanResult = {
      extension_id: 'reviewhigh1234567890abcdefghijklm',
      scoring_v2: { overall_score: 97, decision: 'NEEDS_REVIEW', risk_level: 'none' },
    } as unknown as RawScanResult;
    const vm = normalizeScanResult(raw);
    expect(vm.scores.overall.band).toBe('WARN');
  });
});
