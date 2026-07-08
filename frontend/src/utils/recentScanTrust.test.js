/**
 * Regression tests for recent-scans trust/correctness fixes.
 *
 * Covers:
 *  - the recent-scans badge is driven by the authoritative verdict, not the score band
 *  - "Safe" is NEVER rendered when decision != ALLOW
 *  - missing SAST / partial coverage never resolves to "Full coverage"
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeVerdict,
  resolveScanVerdict,
  resolveVerdictBadge,
  isUnverifiedStoreUrl,
  resolveRowProvenance,
} from './signalMapper';
import {
  resolveCoverage,
  resolveProvenance,
  normalizeScanResult,
  topContributingFactors,
  resolveAnalyzerStatus,
  extractFindingsByLayer,
} from './normalizeScanResult';

describe('humanized finding titles (no raw check_id leakage)', () => {
  const rawWith = (checkId) => ({
    extension_id: 'x'.repeat(32),
    sast_results: {
      sast_findings: {
        'bg.js': [{ check_id: checkId, start: { line: 1 }, extra: { severity: 'ERROR', message: 'msg' } }],
      },
    },
  });

  it('maps a dotted custom rule id to a friendly behavior title', () => {
    const f = extractFindingsByLayer(rawWith('src.extension_shield.config.credential.theft.chrome_identity_api'));
    const titles = f.security.map((x) => x.title);
    expect(titles).toContain('Uses Chrome sign-in (identity)');
    // Never the raw dotted path.
    expect(titles.some((t) => /src\.extension|Config\./i.test(t))).toBe(false);
  });

  it('humanizes an unmapped custom rule to its last segment, not the full path', () => {
    const f = extractFindingsByLayer(rawWith('src.extension_shield.config.c2.exfiltration.some_new_behavior'));
    const titles = f.security.map((x) => x.title);
    expect(titles).toContain('Some New Behavior');
    expect(titles.some((t) => /src|extension_shield|config|c2/i.test(t))).toBe(false);
  });
});

describe('normalizeVerdict', () => {
  it('canonicalizes ALLOW / BLOCK', () => {
    expect(normalizeVerdict('ALLOW')).toBe('ALLOW');
    expect(normalizeVerdict('block')).toBe('BLOCK');
  });

  it('maps WARN / NEEDS_REVIEW / REVIEW to NEEDS_REVIEW', () => {
    expect(normalizeVerdict('WARN')).toBe('NEEDS_REVIEW');
    expect(normalizeVerdict('NEEDS_REVIEW')).toBe('NEEDS_REVIEW');
    expect(normalizeVerdict('review')).toBe('NEEDS_REVIEW');
  });

  it('returns null for unknown / empty', () => {
    expect(normalizeVerdict(undefined)).toBeNull();
    expect(normalizeVerdict('')).toBeNull();
    expect(normalizeVerdict('SOMETHING')).toBeNull();
  });
});

describe('resolveScanVerdict', () => {
  it('reads the nested scoring_v2 decision on a recent-scan row', () => {
    expect(resolveScanVerdict({ scoring_v2: { decision: 'NEEDS_REVIEW' } })).toBe('NEEDS_REVIEW');
  });

  it('prefers the governance/final verdict over the scoring-layer decision', () => {
    expect(
      resolveScanVerdict({ final_verdict: 'BLOCK', scoring_v2: { decision: 'ALLOW' } })
    ).toBe('BLOCK');
  });

  it('falls back to a nested summary.scoring_v2 (history rows)', () => {
    expect(resolveScanVerdict({ summary: { scoring_v2: { decision: 'ALLOW' } } })).toBe('ALLOW');
  });

  it('returns null when no verdict is present', () => {
    expect(resolveScanVerdict({ risk_level: 'low', security_score: 80 })).toBeNull();
  });
});

describe('resolveVerdictBadge — badge uses verdict, not score band', () => {
  it('ALLOW -> Safe (green)', () => {
    const b = resolveVerdictBadge({ decision: 'ALLOW', level: 'low', score: 80 });
    expect(b.label).toBe('Safe');
    expect(b.colorClass).toBe('risk-low');
  });

  it('NEEDS_REVIEW at a high score/LOW band -> Review, NOT Safe', () => {
    // The core bug: a SAST-capped 80 (risk_level "low") must not read "Safe".
    const b = resolveVerdictBadge({ decision: 'NEEDS_REVIEW', level: 'low', score: 80 });
    expect(b.label).toBe('Review');
    expect(b.colorClass).toBe('risk-medium');
    expect(b.label).not.toBe('Safe');
  });

  it('WARN alias -> Review', () => {
    expect(resolveVerdictBadge({ decision: 'WARN', level: 'low', score: 80 }).label).toBe('Review');
  });

  it('BLOCK -> Blocked (red) even at a high score', () => {
    const b = resolveVerdictBadge({ decision: 'BLOCK', level: 'low', score: 90 });
    expect(b.label).toBe('Blocked');
    expect(b.colorClass).toBe('risk-high');
  });

  it('no verdict + LOW band -> never "Safe" (neutral Unrated)', () => {
    const b = resolveVerdictBadge({ decision: null, level: 'low', score: 80 });
    expect(b.label).not.toBe('Safe');
    expect(b.label).toBe('Unrated');
  });

  it('no verdict falls back to the band for non-safe levels', () => {
    expect(resolveVerdictBadge({ decision: null, level: 'high', score: 40 }).label).toBe('Not safe');
    expect(resolveVerdictBadge({ decision: null, level: 'medium', score: 60 }).label).toBe('Review');
  });

  it('INVARIANT: "Safe" is only ever produced by an ALLOW verdict', () => {
    const cases = [
      { decision: 'NEEDS_REVIEW', level: 'low', score: 80 },
      { decision: 'BLOCK', level: 'low', score: 95 },
      { decision: 'WARN', level: 'low', score: 79 },
      { decision: null, level: 'low', score: 100 },
      { decision: null, level: 'high', score: 10 },
      { decision: 'garbage', level: 'low', score: 90 },
    ];
    for (const c of cases) {
      expect(resolveVerdictBadge(c).label).not.toBe('Safe');
    }
    expect(resolveVerdictBadge({ decision: 'ALLOW', level: 'low', score: 80 }).label).toBe('Safe');
  });
});

describe('resolveCoverage — missing SAST never shows Full coverage', () => {
  it('insufficient_data -> Limited coverage', () => {
    const c = resolveCoverage({ scoring_v2: { insufficient_data: true } });
    expect(c.level).toBe('limited');
    expect(c.label).toBe('Limited coverage');
  });

  it('coverage_cap_applied -> Partial coverage', () => {
    const c = resolveCoverage({ scoring_v2: { coverage_cap_applied: true } });
    expect(c.level).toBe('partial');
    expect(c.label).toBe('Partial coverage');
  });

  it('SAST did not run (no cap, not insufficient) -> Partial, NEVER Full', () => {
    // The exact production case: score computed but sast_results empty.
    const c = resolveCoverage({
      scoring_v2: { overall_score: 76, coverage_cap_applied: false, insufficient_data: false },
      sast_results: { files_scanned: 0, sast_findings: {} },
    });
    expect(c.level).toBe('partial');
    expect(c.label).not.toBe('Full coverage');
  });

  it('no sast_results at all -> conservatively Partial, never Full', () => {
    const c = resolveCoverage({ scoring_v2: { overall_score: 80 } });
    expect(c.level).toBe('partial');
    expect(c.label).not.toBe('Full coverage');
  });

  it('SAST confirmed ran (files_scanned > 0) + no cap -> Full coverage', () => {
    const c = resolveCoverage({
      scoring_v2: { overall_score: 92, coverage_cap_applied: false, insufficient_data: false },
      sast_results: { files_scanned: 12, sast_findings: {} },
    });
    expect(c.level).toBe('full');
    expect(c.label).toBe('Full coverage');
  });

  it('null raw -> Partial (never over-claims coverage)', () => {
    expect(resolveCoverage(null).level).toBe('partial');
  });
});

describe('resolveProvenance — listing trust edge cases surfaced honestly', () => {
  it('Edge-only build -> foreign listing', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/x/ifoakfbpdcdoeenechcleahebpibofpc',
      manifest: { update_url: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx' },
      metadata: {},
    });
    expect(p.level).toBe('foreign');
    expect(p.store).toBe('edge');
    expect(p.tone).toBe('warn');
  });

  it('fabricated /detail/x/ Chrome URL -> unverified', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/x/abcd',
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.0' },
      metadata: { user_count: 100, rating: 4.2, version: '1.0' },
    });
    expect(p.level).toBe('unverified');
  });

  it('missing metadata -> unverified (even with a valid detail URL)', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/page-marker/kablckeallljpgnkaifaeckgkaejhpjp',
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx' },
      metadata: {},
    });
    expect(p.level).toBe('unverified');
  });

  it('real Chrome listing with metadata -> verified', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/page-marker/kablckeallljpgnkaifaeckgkaejhpjp',
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.4' },
      metadata: { user_count: 10000, rating: 5.0, version: '1.4' },
    });
    expect(p.level).toBe('verified');
    expect(p.tone).toBe('good');
  });

  it('version mismatch ALONE downgrades verification (listing does not describe the scanned build)', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/page-marker/kablckeallljpgnkaifaeckgkaejhpjp',
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '2.0' },
      metadata: { user_count: 100, rating: 4, version: '1.0' },
    });
    expect(p.notes.some((n) => /differs from the listed version/i.test(n))).toBe(true);
    expect(p.level).toBe('unverified');
  });

  it('malformed and non-store URLs never resolve as verified', () => {
    const base = {
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.0' },
      metadata: { user_count: 100, rating: 4.2, version: '1.0' },
    };
    expect(resolveProvenance({ ...base, url: 'not a url' }).level).toBe('unverified');
    expect(resolveProvenance({ ...base, url: 'https://example.com/detail/slug/abcd' }).level).toBe('unverified');
    expect(resolveProvenance({ ...base, url: 'javascript:alert(1)' }).level).toBe('unverified');
  });

  it('stale extension (>1 year) is noted without changing the trust level', () => {
    const p = resolveProvenance({
      url: 'https://chromewebstore.google.com/detail/live-cricket/gnpcccdfbmbpdhheipohfipmmkpfclek',
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.0.5' },
      metadata: { user_count: 6000, rating: 3.2, version: '1.0.5', last_updated: 'April 18, 2023' },
    });
    expect(p.level).toBe('verified');
    expect(p.notes.some((n) => /may be unmaintained/i.test(n))).toBe(true);
  });

  it('store search/homepage URLs never resolve as verified even with full metadata', () => {
    const base = {
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.0' },
      metadata: { user_count: 100, rating: 4.2, version: '1.0' },
    };
    expect(resolveProvenance({ ...base, url: 'https://chromewebstore.google.com/' }).level).toBe('unverified');
    expect(resolveProvenance({ ...base, url: 'https://chromewebstore.google.com/search/foo' }).level).toBe('unverified');
    expect(resolveProvenance({ ...base, url: 'https://chromewebstore.google.com/category/extensions' }).level).toBe('unverified');
  });
});

describe('getScoringV2 layer graft — flattened payloads regain factors and gate overrides', () => {
  // Production rows persist a flattened top-level scoring_v2 (no *_layer objects,
  // no gate_results); the full detail lives only in governance_bundle.scoring_v2.
  const flattenedRaw = {
    extension_id: 'graftextgraftextgraftextgraftext',
    scoring_v2: {
      decision: 'NEEDS_REVIEW',
      decision_authority: 'score_threshold',
      overall_score: 76,
      security_score: 86,
      privacy_score: 43,
      governance_score: 100,
      overall_confidence: 0.82,
    },
    governance_bundle: {
      scoring_v2: {
        decision: 'NEEDS_REVIEW',
        overall_score: 76,
        security_layer: {
          score: 86, risk_level: 'low', confidence: 0.8,
          factors: [{ name: 'SAST', severity: 0, confidence: 0.9 }],
        },
        privacy_layer: {
          score: 43, risk_level: 'high', confidence: 0.81,
          factors: [{ name: 'PermissionCombos', severity: 0.5, confidence: 0.8, contribution: 0.125 }],
        },
        governance_layer: { score: 100, risk_level: 'none', confidence: 0.86, factors: [] },
        gate_results: [{ gate_id: 'SENSITIVE_EXFIL', triggered: true, decision: 'WARN' }],
      },
    },
  };

  it('factorsByLayer is populated from the governance-bundle copy', () => {
    const vm = normalizeScanResult(flattenedRaw);
    expect(vm.factorsByLayer.privacy.length).toBeGreaterThan(0);
    expect(vm.factorsByLayer.privacy[0].name).toBe('PermissionCombos');
    expect(vm.factorsByLayer.security.length).toBeGreaterThan(0);
  });

  it('per-layer bands reflect the grafted layer detail (privacy BAD, not NA)', () => {
    const vm = normalizeScanResult(flattenedRaw);
    expect(vm.scores.privacy.score).toBe(43);
    expect(vm.scores.privacy.band).toBe('BAD');
  });

  it('top-level fields (decision authority) are preserved over the bundle copy', () => {
    const vm = normalizeScanResult(flattenedRaw);
    expect(vm.scores.decisionAuthority).toBe('score_threshold');
    // Verdict still overrides the 76/GOOD score band on the overall gauge.
    expect(vm.scores.decision).toBe('WARN');
    expect(vm.scores.overall.band).not.toBe('GOOD');
  });
});

describe('isUnverifiedStoreUrl — hardened listing-URL validation', () => {
  it('flags placeholder and missing URLs as unverified', () => {
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/x/abcd')).toBe(true);
    expect(isUnverifiedStoreUrl('')).toBe(true);
    expect(isUnverifiedStoreUrl(null)).toBe(true);
  });

  it('flags malformed and non-http URLs as unverified', () => {
    expect(isUnverifiedStoreUrl('not a url')).toBe(true);
    expect(isUnverifiedStoreUrl('javascript:alert(1)')).toBe(true);
    expect(isUnverifiedStoreUrl('chromewebstore.google.com/detail/slug/abcd')).toBe(true); // no scheme
  });

  it('flags non-Chrome-store hosts as unverified', () => {
    expect(isUnverifiedStoreUrl('https://example.com/detail/slug/abcd')).toBe(true);
    expect(isUnverifiedStoreUrl('https://microsoftedge.microsoft.com/addons/detail/abcd')).toBe(true);
    expect(isUnverifiedStoreUrl('https://chrome.google.com/not-webstore/detail/slug/abcd')).toBe(true);
  });

  it('accepts only real Chrome Web Store DETAIL pages (slug + 32-char id)', () => {
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/page-marker/kablckeallljpgnkaifaeckgkaejhpjp')).toBe(false);
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/kablckeallljpgnkaifaeckgkaejhpjp')).toBe(false);
    expect(isUnverifiedStoreUrl('https://chrome.google.com/webstore/detail/textoptimizer/fdbbkmpdjmpnebmdgbhcodhlafiicnkd')).toBe(false);
    // Query strings on a valid detail page are fine (real stored URLs have ?pli=1 etc.)
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/slug/nealggaicoifpppkdhokdeneklkclcel?pli=1')).toBe(false);
  });

  it('rejects store pages that are not a listing detail page', () => {
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/')).toBe(true); // homepage
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/search/dark%20reader')).toBe(true);
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/category/extensions')).toBe(true);
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/')).toBe(true); // no id
    expect(isUnverifiedStoreUrl('https://chromewebstore.google.com/detail/slug/short-id')).toBe(true); // not a 32-char [a-p] id
    expect(isUnverifiedStoreUrl('https://chrome.google.com/webstore/')).toBe(true);
  });
});

describe('resolveRowProvenance — row payload provenance, no over-inference', () => {
  const VALID_URL = 'https://chromewebstore.google.com/detail/page-marker/kablckeallljpgnkaifaeckgkaejhpjp';

  it('fully consistent row -> no warnings', () => {
    const p = resolveRowProvenance({
      url: VALID_URL,
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.4' },
      metadata: { user_count: 10000, rating: 5.0, version: '1.4' },
    });
    expect(p.unverified).toBe(false);
    expect(p.warnings).toEqual([]);
  });

  it('Edge-only row (manifest update_url) -> "Edge listing", not the generic URL warning', () => {
    const p = resolveRowProvenance({
      url: 'https://chromewebstore.google.com/detail/x/ifoakfbpdcdoeenechcleahebpibofpc',
      manifest: { update_url: 'https://edge.microsoft.com/extensionwebstorebase/v1/crx', version: '4.9.128' },
      metadata: {},
    });
    expect(p.warnings).toContain('Edge listing');
    expect(p.warnings).not.toContain('Unverified listing');
  });

  it('version mismatch between manifest and listing metadata is flagged', () => {
    const p = resolveRowProvenance({
      url: VALID_URL,
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '2.0' },
      metadata: { user_count: 100, rating: 4.0, version: '1.0' },
    });
    expect(p.warnings).toContain('Version mismatch');
  });

  it('metadata object present but empty -> "No listing metadata"', () => {
    const p = resolveRowProvenance({
      url: VALID_URL,
      manifest: { update_url: 'https://clients2.google.com/service/update2/crx', version: '1.0' },
      metadata: {},
    });
    expect(p.warnings).toContain('No listing metadata');
  });

  it('row payload WITHOUT manifest/metadata infers nothing beyond the URL', () => {
    const good = resolveRowProvenance({ url: VALID_URL });
    expect(good.warnings).toEqual([]); // absence of fields proves nothing
    const bad = resolveRowProvenance({ url: 'https://chromewebstore.google.com/detail/x/abcd' });
    expect(bad.warnings).toEqual(['Unverified listing']);
  });

  it('handles JSON-string manifest/metadata (sqlite rows)', () => {
    const p = resolveRowProvenance({
      url: VALID_URL,
      manifest: JSON.stringify({ update_url: 'https://edge.microsoft.com/x', version: '1.0' }),
      metadata: JSON.stringify({ user_count: 5, rating: 4, version: '1.0' }),
    });
    expect(p.warnings).toContain('Edge listing');
  });
});

describe('verdict badge and provenance are separate concerns', () => {
  it('an ALLOW stays visibly "Safe" regardless of listing trust', () => {
    // Provenance must never replace or recolor the verdict badge.
    const b = resolveVerdictBadge({ decision: 'ALLOW', level: 'low', score: 90 });
    expect(b.label).toBe('Safe');
    expect(b.colorClass).toBe('risk-low');
  });

  it('resolveVerdictBadge has no provenance input — verdict only', () => {
    const withFlag = resolveVerdictBadge({ decision: 'ALLOW', level: 'low', score: 90, provenanceUnverified: true });
    expect(withFlag.label).toBe('Safe'); // extraneous key is ignored
  });
});

describe('topContributingFactors — hide zero-contribution factors', () => {
  it('drops factors with no severity/contribution (no default SAST/VirusTotal chips)', () => {
    const factors = [
      { name: 'SAST', severity: 0, riskContribution: 0 },
      { name: 'VirusTotal', severity: 0, riskContribution: 0 },
      { name: 'PermissionCombos', severity: 0.5, riskContribution: 0.125 },
      { name: 'Maintenance', severity: 0.6, riskContribution: 0.072 },
    ];
    const top = topContributingFactors(factors, 2);
    expect(top.map((f) => f.name)).toEqual(['PermissionCombos', 'Maintenance']);
    expect(top.some((f) => f.name === 'SAST')).toBe(false);
  });

  it('a fully clean layer yields no contributors (tile shows only its score)', () => {
    const factors = [
      { name: 'PermissionsBaseline', severity: 0, riskContribution: 0 },
      { name: 'PermissionCombos', severity: 0, riskContribution: 0 },
    ];
    expect(topContributingFactors(factors, 2)).toEqual([]);
  });

  it('ranks by contribution descending', () => {
    const factors = [
      { name: 'A', severity: 0.4, riskContribution: 0.05 },
      { name: 'B', severity: 0.3, riskContribution: 0.2 },
    ];
    expect(topContributingFactors(factors, 2).map((f) => f.name)).toEqual(['B', 'A']);
  });

  it('handles null/undefined input', () => {
    expect(topContributingFactors(null)).toEqual([]);
    expect(topContributingFactors(undefined)).toEqual([]);
  });
});

describe('resolveAnalyzerStatus — never treats a missing analyzer as clean', () => {
  const gb = (sast, vt, network) => ({
    governance_bundle: { signal_pack: { sast, virustotal: vt, network } },
  });

  it('SAST that did not run reads "did not run", not clean', () => {
    const st = resolveAnalyzerStatus(gb({ files_scanned: 0, scan_error: false }, { enabled: true, total_engines: 75 }, { enabled: false }));
    const sast = st.find((a) => a.key === 'sast');
    expect(sast.status).toMatch(/did not run/i);
    expect(sast.ok).toBe(false);
  });

  it('SAST failure reads "failed to run"', () => {
    const st = resolveAnalyzerStatus(gb({ files_scanned: 0, scan_error: true }, { enabled: true, total_engines: 75 }, {}));
    expect(st.find((a) => a.key === 'sast').status).toMatch(/failed/i);
  });

  it('VirusTotal with engines and no detections reads "checked", not "clean/unknown"', () => {
    const st = resolveAnalyzerStatus(gb({ files_scanned: 3 }, { enabled: true, total_engines: 75, malicious_count: 0 }, {}));
    expect(st.find((a) => a.key === 'vt').status).toMatch(/checked \(75 engines/i);
  });

  it('VirusTotal with no engine coverage reads "unknown", never clean', () => {
    const st = resolveAnalyzerStatus(gb({ files_scanned: 3 }, { enabled: true, total_engines: 0 }, {}));
    expect(st.find((a) => a.key === 'vt').status).toMatch(/unknown/i);
    expect(st.find((a) => a.key === 'vt').ok).toBe(false);
  });

  it('VirusTotal disabled reads "disabled / no API key"', () => {
    const st = resolveAnalyzerStatus(gb({ files_scanned: 3 }, { enabled: false }, {}));
    expect(st.find((a) => a.key === 'vt').status).toMatch(/disabled|no api key/i);
  });
});

describe('recent row verdict equals detail payload verdict', () => {
  // A recent row carries a flattened scoring_v2; the detail payload carries the
  // same decision (post-adoption). The normalizer must resolve the same verdict
  // from both shapes so the table badge and the report gauge never disagree.
  it('same decision resolves identically from row and from detail payload', () => {
    const recentRow = { extension_id: 'x', scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 80 } };
    const detail = {
      extension_id: 'x',
      scoring_v2: { decision: 'NEEDS_REVIEW', overall_score: 80, security_layer: { score: 91, factors: [] } },
    };
    expect(resolveScanVerdict(recentRow)).toBe(resolveScanVerdict(detail));
    const vm = normalizeScanResult(detail);
    expect(vm.scores.decision).toBe('WARN'); // NEEDS_REVIEW normalizes to WARN band
    // Row badge and detail verdict both map to "Review".
    expect(resolveVerdictBadge({ decision: resolveScanVerdict(recentRow) }).label).toBe('Review');
  });
});
