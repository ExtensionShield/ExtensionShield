import { afterEach, describe, expect, it, vi } from 'vitest';
import databaseService from '../services/databaseService';
import { countReportFindings, enrichScan } from './scanEnrichment';

const makeRawScan = () => ({
  extension_id: 'eimadpbcbfnmbkopoojfekhnkhdbieeh',
  extension_name: 'Dark Reader',
  total_findings: 30,
  security_score: 71,
  risk_level: 'MEDIUM',
  metadata: {
    title: 'Dark Reader',
    user_count: 6000000,
    rating: 4.7,
  },
  manifest: {
    permissions: [],
    host_permissions: [],
  },
  scoring_v2: {
    overall_score: 71,
    security_score: 66,
    privacy_score: 81,
    governance_score: 65,
    decision: 'NEEDS_REVIEW',
    security_layer: {
      score: 66,
      factors: [
        { name: 'Code Safety', severity: 0.9, contribution: 12 },
        { name: 'External network requests detected', severity: 0.8, contribution: 10 },
        { name: 'Dynamic Dom Hook', severity: 0.5, contribution: 5 },
        { name: 'May hide data in images', severity: 0.5, contribution: 4 },
      ],
    },
    privacy_layer: {
      score: 81,
      factors: [
        { name: 'Data access review', severity: 0.45, contribution: 4 },
        { name: 'Host access review', severity: 0.45, contribution: 3 },
      ],
    },
    governance_layer: {
      score: 65,
      factors: [
        { name: "Behavior doesn't match stated purpose", severity: 0.9, contribution: 12 },
        { name: 'Disclosure review', severity: 0.45, contribution: 4 },
      ],
    },
  },
});

describe('scanEnrichment report finding count', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('counts normalized report findings instead of raw backend total_findings', () => {
    expect(countReportFindings(makeRawScan())).toBe(8);
  });

  it('uses normalized report count when enriching recent scans', async () => {
    const enriched = await enrichScan(makeRawScan(), { skipFullFetch: true });
    expect(enriched.findings_count).toBe(8);
  });

  it('uses the full report count when recent row data is stale', async () => {
    const recentRow = makeRawScan();
    recentRow.scoring_v2.security_layer.factors.push({
      name: 'Stale recent-only finding',
      severity: 0.5,
      contribution: 2,
    });

    vi.spyOn(databaseService, 'getScanResult').mockResolvedValue(makeRawScan());

    const enriched = await enrichScan(recentRow, { skipFullFetch: false });
    expect(enriched.findings_count).toBe(8);
  });
});
