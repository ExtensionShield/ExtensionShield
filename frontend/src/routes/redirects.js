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
