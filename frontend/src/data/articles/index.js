/**
 * Article registry — research reports and guides.
 *
 * TWO COLLECTIONS, DELIBERATELY SEPARATE:
 *
 *   collection: "research"  ->  /research/<slug>
 *     Original work built on ExtensionShield's own scan corpus or on a first-hand
 *     audit. Primary evidence that exists nowhere else. These sit alongside the
 *     case studies and the published methodology.
 *
 *   collection: "guide"     ->  /guides/<slug>
 *     Reference material synthesised from public documentation. Genuinely useful
 *     and heavily sourced, but not original evidence.
 *
 * The split matters: calling synthesis "research" devalues the word for the
 * audits that depend on it. These were all previously under /blog, which claimed
 * neither thing accurately.
 *
 * ARTICLE SHAPE
 *   slug           string    URL segment within its collection
 *   collection     "research" | "guide"
 *   title          string
 *   description    string    meta description
 *   category       string
 *   datePublished  "YYYY-MM-DD"
 *   dateModified   "YYYY-MM-DD"   shown as "Last updated" when newer
 *   readingTime    number         minutes
 *   author         { name, jobTitle?, url?, sameAs?[] }   omit rather than invent
 *   keyFindings    string[]       summary shown above the article body
 *   sections       [{ heading, id, blocks: [...] }]   see components/article/ArticleBlocks.jsx
 *   sources        [{ title, publisher?, url, date? }] rendered + emitted as schema.org citation
 *   faq            [{ q, a }]
 *   internalLinks  [{ label, to }]
 */

import ratingsVsSecurityScore from "./chrome-web-store-ratings-do-not-prove-extension-safety";
import riskPatterns2026 from "./chrome-extension-risk-patterns-2026";
import canExtensionsStealData from "./can-chrome-extensions-steal-data";
import supplyChainAttacks from "./browser-extension-supply-chain-attacks";
import manifestV3Security from "./manifest-v3-extension-security";
import allowlistPolicy from "./chrome-extension-allowlist-policy";
import auditCrxBeforeRelease from "./audit-crx-zip-before-release";

/** Every article, most substantial first. */
export const articles = [
  ratingsVsSecurityScore,
  riskPatterns2026,
  canExtensionsStealData,
  supplyChainAttacks,
  manifestV3Security,
  allowlistPolicy,
  auditCrxBeforeRelease,
];

/** Canonical path for an article, derived from its collection. */
export const articlePath = (article) =>
  `/${article.collection === "research" ? "research" : "guides"}/${article.slug}`;

export const researchArticles = articles.filter((a) => a.collection === "research");
export const guideArticles = articles.filter((a) => a.collection === "guide");

/**
 * Look up by slug. Optionally constrain to a collection so that
 * /guides/<research-slug> does not resolve — each article has exactly one URL.
 */
export const getArticleBySlug = (slug, collection) =>
  articles.find((a) => a.slug === slug && (!collection || a.collection === collection)) || null;

export default articles;
