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

  // --- Thin stubs retired to the page that already answers the query ---
  // 61-115 words each, all duplicating a long-form landing page targeting the
  // same search. Three separate URLs competed on permissions alone. Each 301
  // points at the page that covers the intent in depth; the two permission
  // phrases are answered by anchor sections on the destination, so this is not
  // a soft 404.
  { from: "/blog/how-to-check-if-chrome-extension-is-safe", to: "/is-this-chrome-extension-safe" },
  { from: "/blog/dangerous-chrome-extension-permissions", to: "/chrome-extension-permissions" },
  { from: "/blog/read-and-change-all-your-data-extension-permission", to: "/chrome-extension-permissions" },
  { from: "/blog/all-urls-chrome-extension-permission", to: "/chrome-extension-permissions" },
  { from: "/blog/chrome-extension-scanner-vs-governance-platform", to: "/extension-governance" },
  { from: "/blog/extension-security-scoring-explained", to: "/research/methodology" },

  // --- Pre-existing legacy redirects, migrated out of routes.jsx ---
  // These were client-side <Navigate> entries only, so they never returned a
  // real 301 and passed no link equity. Moving them into the map fixes that.
  // Two of them pointed at posts, and how-to-audit-… pointed at
  // how-to-check-if-chrome-extension-is-safe, which is retired directly above —
  // that would have been a chain, so it is flattened to the final destination.
  { from: "/blog/how-to-check-chrome-extension-permissions", to: "/chrome-extension-permissions" },
  { from: "/blog/how-to-audit-chrome-extension-before-installing", to: "/is-this-chrome-extension-safe" },
  // Retargeted now that the articles exist — these previously pointed at posts
  // that are retired below, which would have been chains.
  { from: "/blog/enterprise-browser-extension-risk-management", to: "/guides/chrome-extension-allowlist-policy" },
  { from: "/blog/how-to-detect-malicious-chrome-extensions", to: "/guides/can-chrome-extensions-steal-data" },

  // --- /blog retired entirely (2026-07) ---
  // The surviving posts were never really blog posts. Two are original research
  // built on our own scan corpus and now live under /research beside the case
  // studies and methodology; the other five are reference guides synthesised
  // from public documentation and live under /guides. Calling synthesis
  // "research" would devalue the word for the audits that depend on it.
  { from: "/blog", to: "/guides" },
  { from: "/blog/chrome-web-store-ratings-do-not-prove-extension-safety", to: "/research/chrome-web-store-ratings-do-not-prove-extension-safety" },
  // Slug realigned with the retitled piece: it reports risk PATTERNS from the
  // corpus and deliberately names no extension, so "top-risky" oversold it.
  { from: "/blog/top-risky-chrome-extensions-2026", to: "/research/chrome-extension-risk-patterns-2026" },
  { from: "/blog/can-chrome-extensions-steal-data", to: "/guides/can-chrome-extensions-steal-data" },
  { from: "/blog/browser-extension-supply-chain-attacks", to: "/guides/browser-extension-supply-chain-attacks" },
  { from: "/blog/manifest-v3-extension-security", to: "/guides/manifest-v3-extension-security" },
  { from: "/blog/chrome-extension-allowlist-policy", to: "/guides/chrome-extension-allowlist-policy" },
  { from: "/blog/audit-crx-zip-before-release", to: "/guides/audit-crx-zip-before-release" },

  // --- Merged into surviving articles ---
  // Both former posts are now first-class sections of the merged article.
  { from: "/blog/how-hackers-use-browser-extensions-to-steal-data", to: "/guides/can-chrome-extensions-steal-data" },
  { from: "/blog/can-chrome-extensions-steal-cookies-sessions", to: "/guides/can-chrome-extensions-steal-data" },
  { from: "/blog/browser-extension-compliance-checklist", to: "/guides/chrome-extension-allowlist-policy" },

  // --- Thin landing pages retired (2026-07) ---
  // 86-143 words each, thinner than the blog stubs retired above, and each a
  // strict subset of a longer page targeting the same intent. Keeping them
  // split the same query across two URLs and gave a searcher the shallower one
  // roughly half the time.
  //
  // /extension-permissions was additionally an orphan — nothing on the site
  // linked to it — and every one of its headings mapped 1:1 onto
  // /chrome-extension-permissions, which answers the same query in ~1,650 words.
  { from: "/extension-permissions", to: "/chrome-extension-permissions" },
  { from: "/chrome-extension-security-scanner", to: "/free-extension-scanner" },
  { from: "/browser-extension-risk-assessment", to: "/extension-risk-score" },

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
  // data-theft guide answers directly — and its thesis, that capability is not
  // conduct, is the exact correction this page needed.
  { from: "/research/case-studies/pdf-converters", to: "/guides/can-chrome-extensions-steal-data" },

  // --- Retired benchmarks page (2026-08) ---
  // /research/benchmarks rendered mock data that was never replaced. Its own
  // metadata said so: benchmarks.json carried the note "TODO: Replace with live
  // API data. Current data is representative mock data for UI development."
  //
  // What it published on that basis:
  //   - A coverage comparison against "competitor_a" and "competitor_b" scoring
  //     0 on Governance, Privacy and ToS Compliance against our 95/90/85. We
  //     retired every competitor comparison in 2026-07 (see the top of this
  //     file); this one survived because the competitors were unnamed.
  //   - Two trend charts whose values were attributed to Verizon DBIR, FBI IC3,
  //     CISA, Mandiant and Google, each citing only that organisation's
  //     homepage. No report backs any of the figures.
  //   - A stated sample_size of "1,247 extensions across 6 categories". The
  //     real corpus is 57 completed scans.
  //   - A footer reading "Compiled from public reporting", which vouched for
  //     all of the above.
  //
  // It also contradicted our own published position: the risk-patterns article
  // lists "detection rates, benchmarks or comparisons with other tools" under
  // what we explicitly do not claim.
  //
  // /research/methodology is the honest destination — it is what the page's
  // "How We Score" half was duplicating, and it is sourced.
  { from: "/research/benchmarks", to: "/research/methodology" },
];

/** Flat { from: to } map — the shape written to public/redirects.json. */
export const REDIRECT_MAP = Object.fromEntries(REDIRECTS.map((r) => [r.from, r.to]));

export default REDIRECTS;
