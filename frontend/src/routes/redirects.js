/**
 * Permanent (301) redirect map — single source of truth.
 *
 * Consumed by three places, all from this one file:
 *   1. src/routes/routes.jsx       -> client-side <Navigate replace> so in-app
 *                                     navigation to a retired URL still works.
 *   2. scripts/generate-sitemap.js -> emits public/redirects.json (shipped in
 *                                     dist/) and adds every `from` path to
 *                                     routes-manifest.json so a retired URL is
 *                                     a known route, never a 404.
 *   3. api/main.py serve_spa       -> reads redirects.json and returns a REAL
 *                                     HTTP 301 before any HTML is served.
 *
 * The server-side 301 is what actually consolidates ranking signals. The
 * client-side <Navigate> is a convenience fallback for SPA navigation only —
 * a JS redirect alone does not reliably pass link equity.
 *
 * RULES
 * - `to` MUST be a live, indexable route. Never point at another redirect:
 *   redirect chains dilute the signal and waste crawl budget. The unit test in
 *   src/routes/__tests__/redirects.test.js enforces this.
 * - Retired URLs must NOT appear in sitemap.xml (they have no `seo` block in
 *   routes.jsx, so the generator excludes them automatically).
 */

export const REDIRECTS = [
  // --- Competitor comparison pages, retired entirely (2026-07) ---
  // ExtensionShield publishes its own extension research; it does not publish
  // competitor comparisons. Every page that named, described or linked a
  // competitor is gone, and no redirect target names one either.
  //
  // These pages also carried claims that can no longer be verified:
  // /compare/crxcavator and /crxcavator-alternative described CRXcavator in the
  // present tense and cited "public docs as of June 2026", but the service is
  // gone — crxcavator.io has no A record, its API returns 502, and both Cisco's
  // product page and the duo-labs GitHub repo 404 (checked 2026-07-28).
  //
  // Everything lands on /extension-security: the topical home for extension
  // security tooling, and substantial enough (~1,450 words) to be a legitimate
  // destination rather than a soft-404 risk.
  { from: "/compare", to: "/extension-security" },
  { from: "/compare/spin-ai", to: "/extension-security" },
  { from: "/compare/crxcavator", to: "/extension-security" },
  { from: "/compare/crxplorer", to: "/extension-security" },
  { from: "/compare/extension-auditor", to: "/extension-security" },
  { from: "/crxcavator-alternative", to: "/extension-security" },

  // --- Retired competitor-comparison blog stubs ---
  // 61-83 words each, named a competitor, concluded we win. These pointed at
  // the /compare pages until those were retired too; they now go straight to
  // the final destination, because a 301 into another 301 dilutes the signal.
  { from: "/blog/spin-ai-vs-extensionshield", to: "/extension-security" },
  { from: "/blog/crxcavator-vs-extensionshield-2026", to: "/extension-security" },
  { from: "/blog/extension-auditor-vs-extensionshield", to: "/extension-security" },
  { from: "/blog/crxplorer-vs-extensionshield", to: "/extension-security" },
  { from: "/blog/best-chrome-extension-security-scanner-tools-2026", to: "/extension-security" },

  // --- Retired case study (2026-07) ---
  // /research/case-studies/pdf-converters asserted that PDF converter
  // extensions are a documented document-harvesting category. Fact-checking on
  // 2026-07-30 found no published source establishing that: Palant's
  // 34-extension network contains exactly one PDF tool, and the Secure Annex,
  // DomainTools and 7ai clusters contain none. The page also named a live
  // listed product ("Flexi PDF Reader") as enabling surveillance, credential
  // harvesting and document exfiltration, while the single report behind it
  // concluded "No evidence of data exfiltration, backdoors, or malicious code
  // execution was found". Its two headline stats were unsourceable, and one
  // restated a single 11-extension network as "10+ extension networks".
  //
  // Reader intent here is "can this extension read my documents", which the
  // data-theft post answers directly.
  { from: "/research/case-studies/pdf-converters", to: "/blog/can-chrome-extensions-steal-data" },
];

/** Flat { from: to } map — the shape written to public/redirects.json. */
export const REDIRECT_MAP = Object.fromEntries(REDIRECTS.map((r) => [r.from, r.to]));

export default REDIRECTS;
