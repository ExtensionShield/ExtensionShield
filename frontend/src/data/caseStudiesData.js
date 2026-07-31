/**
 * Case studies data for Research > Case Studies.
 * Used for listing, pagination, and correct links to detail pages.
 *
 * POLICY: every entry here must correspond to a page that actually exists and
 * cites its sources. Three "Coming Soon" placeholders (cryptominers, fake
 * password managers, rogue VPN extensions) were removed in 2026-07 — they
 * promised research that was never written and carried keyword-stuffed
 * descriptions for URLs that did not resolve. A research index that advertises
 * work it has not done undercuts the work it has. Add an entry when the page
 * ships, not before.
 */
export const CASE_STUDIES_PER_PAGE = 4;

export const caseStudies = [
  {
    id: "honey",
    slug: "honey",
    path: "/research/case-studies/honey",
    title: "Honey Extension Case Study",
    subtitle: "17M monthly users at acquisition. $4B deal.",
    date: "December 2024",
    category: "Affiliate Practices",
    severity: "CASE STUDY",
    description:
      "What the December 2024 reporting on PayPal's Honey extension established, what the affiliate industry disputes, and why a high star rating said nothing about any of it.",
    keywords: ["Chrome extension security", "affiliate marketing", "browser extension privacy", "PayPal Honey"],
    featured: true,
  },
  {
    id: "fake-ad-blockers",
    slug: "fake-ad-blockers",
    path: "/research/case-studies/fake-ad-blockers",
    title: "Fake Ad Blockers",
    subtitle: "Wolves in Sheep's Clothing",
    date: "2018–2021",
    category: "Ad Injection",
    severity: "CASE STUDY",
    description:
      "How ad blocker clones were found injecting ads instead of blocking them: the jQuery-hidden payload, signature matching against a remote list, and anti-debugging. 20M+ installs across five extensions.",
    keywords: ["fake ad blocker", "Chrome extension malware", "ad injection", "malicious extension"],
    featured: false,
  },
];
