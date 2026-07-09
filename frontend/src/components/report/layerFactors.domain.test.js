/**
 * Report domain classification tests (presentation-only reclassification).
 *
 * Verifies the concept-first grouping used by the report: reputation/maintenance
 * signals (Webstore, ChromeStats, Publisher update age) are presented under
 * "Reputation & Maintenance Context" even though they are scored inside the
 * Security layer. Pure logic — no score is read or changed here.
 */
import { describe, it, expect } from 'vitest';
import {
  REPORT_DOMAIN,
  REPORT_DOMAINS,
  domainForFactor,
  groupFactorsByDomain,
  humanizeFactor,
} from './layerFactors';

describe('domainForFactor', () => {
  it('maps technical-security factors (code/malware/manifest) to Technical Security', () => {
    ['SAST', 'VirusTotal', 'Obfuscation', 'Manifest'].forEach((name) => {
      expect(domainForFactor(name).id).toBe(REPORT_DOMAIN.TECHNICAL_SECURITY);
    });
  });

  it('maps permission/capture/network factors to Privacy & Data Access', () => {
    ['PermissionsBaseline', 'PermissionCombos', 'NetworkExfil', 'CaptureSignals'].forEach((name) => {
      expect(domainForFactor(name).id).toBe(REPORT_DOMAIN.PRIVACY_DATA_ACCESS);
    });
  });

  it('maps policy factors to Governance / Policy / Disclosure', () => {
    ['ToSViolations', 'Consistency', 'DisclosureAlignment'].forEach((name) => {
      expect(domainForFactor(name).id).toBe(REPORT_DOMAIN.GOVERNANCE_POLICY);
    });
  });

  it('maps Webstore, ChromeStats, and Maintenance to Reputation & Maintenance Context', () => {
    ['Webstore', 'ChromeStats', 'Maintenance'].forEach((name) => {
      expect(domainForFactor(name).id).toBe(REPORT_DOMAIN.REPUTATION_MAINTENANCE);
    });
  });

  it('overrides category for ChromeStats: threat-intel is reputation CONTEXT, not Technical Security', () => {
    // VirusTotal and ChromeStats share the FACTOR_HUMAN category 'threat', but
    // only VirusTotal is technical malware evidence.
    expect(domainForFactor('VirusTotal').id).toBe(REPORT_DOMAIN.TECHNICAL_SECURITY);
    expect(domainForFactor('ChromeStats').id).toBe(REPORT_DOMAIN.REPUTATION_MAINTENANCE);
  });

  it('accepts either a factor object or a bare name', () => {
    expect(domainForFactor({ name: 'Maintenance', severity: 0.6 }).id).toBe(REPORT_DOMAIN.REPUTATION_MAINTENANCE);
    expect(domainForFactor('Maintenance').id).toBe(REPORT_DOMAIN.REPUTATION_MAINTENANCE);
  });

  it('falls back to Technical Security for an unknown factor', () => {
    expect(domainForFactor('SomethingNew').id).toBe(REPORT_DOMAIN.TECHNICAL_SECURITY);
    expect(domainForFactor(undefined).id).toBe(REPORT_DOMAIN.TECHNICAL_SECURITY);
  });

  it('exposes the reputation context disclaimer note', () => {
    const rep = REPORT_DOMAINS.find((d) => d.id === REPORT_DOMAIN.REPUTATION_MAINTENANCE);
    expect(rep.note).toMatch(/Context signal — informs confidence, not a standalone verdict/);
    // Chip labels stay distinct from the Security/Privacy/Governance layer titles.
    REPORT_DOMAINS.forEach((d) => {
      expect(['Security', 'Privacy', 'Governance']).not.toContain(d.shortLabel);
    });
  });
});

describe('groupFactorsByDomain', () => {
  it('splits the Security-layer factors into Technical Security and Reputation & Maintenance Context', () => {
    // The real Security scoring layer: technical checks + reputation/maintenance.
    const securityFactors = [
      { name: 'SAST', severity: 0.1 },
      { name: 'VirusTotal', severity: 0 },
      { name: 'Obfuscation', severity: 0.2 },
      { name: 'Manifest', severity: 0.3 },
      { name: 'ChromeStats', severity: 0 },
      { name: 'Webstore', severity: 0.1 },
      { name: 'Maintenance', severity: 0.6 },
    ];
    const groups = groupFactorsByDomain(securityFactors);
    const byId = Object.fromEntries(groups.map((g) => [g.domain.id, g.factors.map((f) => f.name)]));

    expect(byId[REPORT_DOMAIN.TECHNICAL_SECURITY]).toEqual(['SAST', 'VirusTotal', 'Obfuscation', 'Manifest']);
    expect(byId[REPORT_DOMAIN.REPUTATION_MAINTENANCE]).toEqual(['ChromeStats', 'Webstore', 'Maintenance']);
  });

  it('returns domains in canonical order and omits empty domains', () => {
    const groups = groupFactorsByDomain([
      { name: 'Maintenance', severity: 0.6 },
      { name: 'SAST', severity: 0.1 },
    ]);
    // Technical Security precedes Reputation in REPORT_DOMAINS order, even though
    // Maintenance was listed first.
    expect(groups.map((g) => g.domain.id)).toEqual([
      REPORT_DOMAIN.TECHNICAL_SECURITY,
      REPORT_DOMAIN.REPUTATION_MAINTENANCE,
    ]);
  });

  it('handles empty / non-array input without throwing', () => {
    expect(groupFactorsByDomain([])).toEqual([]);
    expect(groupFactorsByDomain(undefined)).toEqual([]);
  });
});

describe('humanizeFactor domain annotation', () => {
  it('attaches the domain id and chip label to a humanized factor', () => {
    const webstore = humanizeFactor({ name: 'Webstore', severity: 0.5 });
    expect(webstore.domain).toBe(REPORT_DOMAIN.REPUTATION_MAINTENANCE);
    expect(webstore.domainLabel).toBe('Reputation');

    const sast = humanizeFactor({ name: 'SAST', severity: 0.5 });
    expect(sast.domain).toBe(REPORT_DOMAIN.TECHNICAL_SECURITY);
    expect(sast.domainLabel).toBe('Technical Security');
  });
});
