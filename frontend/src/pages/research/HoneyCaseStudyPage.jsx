import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./HoneyCaseStudyPage.scss";

/**
 * Honey case study.
 *
 * This page describes CONTESTED, REPORTED conduct by a named, live product owned
 * by a public company. Fact-checked 2026-07-30. The hedging here is deliberate
 * and load-bearing — do not "tighten" it into flat assertions.
 *
 * Removed in that pass, because the cited sources did not support them:
 *  - "Data was reportedly shared with retailers" — Honey's own privacy page says
 *    it never shares user information with third parties for their own use.
 *  - A "Retailer Kickbacks" card claiming retailers paid to prioritise deals —
 *    the merchant FAQ it rested on describes coupon control as free and
 *    unconditioned on payment; "prioritize" appears nowhere.
 *  - "The coupon-search animation was questioned by investigators" — absent from
 *    Edelman entirely.
 *  - "silent" overwriting — Edelman explicitly writes that Honey "didn't quite
 *    stuff cookies as that term is usually used—the user did click something."
 *  - "all while actively harming users" and "Static analysis would have caught
 *    Honey's affiliate hijacking years ago" — the first drops the hedging the
 *    rest of the page maintains; the second is an unfalsifiable claim about our
 *    own scanner (the mechanism is a checkout-time cookie write, not a manifest
 *    artifact).
 *
 * The 17M figure is a point-in-time MAU from the Nov 2019 acquisition release,
 * not a running total. It is labelled as such.
 */

const SOURCES = [
  {
    title: "PayPal to Acquire Honey",
    publisher: "PayPal Newsroom",
    date: "20 November 2019",
    url: "https://newsroom.paypal-corp.com/2019-11-20-PayPal-to-Acquire-Honey",
  },
  {
    title: "Honey browser extension scam explainer",
    publisher: "Snopes",
    date: "30 December 2024",
    url: "https://www.snopes.com/news/2024/12/30/honey-browser-extension-scam/",
  },
  {
    title: "The Honey extension drama, explained",
    publisher: "Fortune",
    date: "23 December 2024",
    url: "https://fortune.com/2024/12/23/honey-extension-scam-drama/",
  },
  {
    title: "Honey's affiliate marketing practices",
    publisher: "Benjamin Edelman",
    date: "13 January 2025",
    url: "https://www.benedelman.org/honey-breaches/",
  },
  {
    title: "Chrome Web Store policy update: affiliate ads",
    publisher: "Chrome for Developers",
    date: "2025",
    url: "https://developer.chrome.com/blog/cws-policy-update-affiliate-ads-2025",
  },
];

const honeyArticleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Honey Extension Case Study",
  "description":
    "Reported analysis of PayPal's Honey extension: alleged affiliate link practices and disputed savings claims, with sources and the disputes noted.",
  "author": { "@type": "Organization", "name": "ExtensionShield" },
  "datePublished": "2025-03-11",
  "dateModified": "2026-07-30",
  "publisher": { "@type": "Organization", "name": "ExtensionShield" },
  "image": "https://extensionshield.com/og.png",
  "citation": SOURCES.map((s) => ({
    "@type": "CreativeWork",
    "name": s.title,
    "url": s.url,
    "publisher": { "@type": "Organization", "name": s.publisher },
  })),
};

const HoneyCaseStudyPage = () => {
  return (
    <>
      <SEOHead
        title="Honey Extension Case Study | ExtensionShield"
        description="What the December 2024 reporting on PayPal's Honey extension established, what remains disputed, and what it means for judging extensions by their ratings."
        pathname="/research/case-studies/honey"
        schema={honeyArticleSchema}
      />

      <div className="honey-case-study-page">
        <div className="honey-content">
          {/* Breadcrumb */}
          <nav className="breadcrumb">
            <Link to="/research">Research</Link>
            <span>/</span>
            <Link to="/research/case-studies">Case Studies</Link>
            <span>/</span>
            <span>Honey</span>
          </nav>

          {/* Header */}
          <header className="honey-header">
            <div className="honey-meta">
              <span className="severity-badge case-study">CASE STUDY</span>
              <span className="category-badge">Affiliate Practices</span>
              <span className="date-badge">Reported December 2024</span>
            </div>
            <h1>Honey Extension Case Study</h1>
            <p className="honey-subtitle">
              A highly rated extension, a contested set of affiliate practices, and what ratings did not tell anyone.
            </p>
          </header>

          <p className="case-study-scope">
            The findings below are <strong>as reported</strong> by the December 2024 MegaLag video and subsequent
            coverage and analysis. ExtensionShield has not independently verified them, and several are disputed by
            affiliate-industry figures. This is an editorial write-up, not an ExtensionShield scan result.
          </p>

          {/* Stats */}
          <div className="honey-stats">
            <div className="stat">
              <span className="stat-value">17M</span>
              <span className="stat-label">Monthly active users at acquisition (Nov 2019)</span>
            </div>
            <div className="stat">
              <span className="stat-value">$4B</span>
              <span className="stat-label">PayPal acquisition price (announced Nov 2019)</span>
            </div>
            <div className="stat danger">
              <span className="stat-value">Disputed</span>
              <span className="stat-label">Savings claims</span>
            </div>
          </div>

          {/* Content */}
          <article className="honey-article">
            <section>
              <h2>What Honey Promised</h2>
              <p>
                Honey marketed itself as a free browser extension that automatically finds and applies the best coupon
                codes at checkout. Promoted heavily by large creators, it reported roughly 17 million monthly active
                users when PayPal announced its acquisition for approximately $4 billion in November 2019.
              </p>
            </section>

            <section>
              <h2>What the Reporting Alleged</h2>
              <div className="findings-grid">
                <div className="finding-card">
                  <div className="finding-icon">🔗</div>
                  <h3>Affiliate Attribution</h3>
                  <p>
                    Snopes reported that it independently confirmed, across several tests, that using Honey changed the
                    affiliate cookie to a value indicating PayPal would receive the commission. Analyst Benjamin Edelman
                    characterised the behavior as a stand-down violation on last-click attribution—while noting the user
                    did click something, so it was not cookie stuffing in the usual sense.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">🎫</div>
                  <h3>Merchant Control Over Coupons</h3>
                  <p>
                    Honey&apos;s own merchant documentation stated that partners &ldquo;have control over the coupon
                    codes made available to Honey members.&rdquo; Edelman argued this sits awkwardly against a consumer
                    promise to find every working code—a mechanism confirmed by the vendor itself, rather than an
                    allegation.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">⚖️</div>
                  <h3>Disputed by the Industry</h3>
                  <p>
                    The characterisation is contested. On the same page that documents the analysis, affiliate-industry
                    figures including Brook Schaaf are quoted saying Honey &ldquo;appears to be in compliance with
                    network standards.&rdquo; This case is genuinely unresolved, not settled.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">📜</div>
                  <h3>A Platform-Level Outcome</h3>
                  <p>
                    Whatever the merits, Chrome responded at the platform level: a 2025 Chrome Web Store policy update
                    restricted affiliate-ads behavior in extensions, requiring that affiliate links only be included when
                    the extension provides a direct, transparent user benefit.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2>The Aftermath</h2>
              <p>
                MegaLag&apos;s 23-minute video, published 21 December 2024, drew over six million views within two days.
                Creators alleged diverted commissions, and litigation followed. Honey continues to operate under PayPal;
                its Chrome Web Store listing remains active and still carries a rating above 4.5 stars.
              </p>
            </section>

            <section>
              <h2>Lessons Learned</h2>
              <ul className="lessons-list">
                <li>
                  <strong>Ratings measure whether a feature worked.</strong> Honey held a high rating throughout, because
                  the coupon feature did function. A rating cannot express a dispute about where a commission went.
                </li>
                <li>
                  <strong>Free products have a revenue model.</strong> Worth understanding what it is before granting an
                  extension access to checkout pages.
                </li>
                <li>
                  <strong>Permissions matter.</strong> &ldquo;Read and change all your data on all websites&rdquo; is
                  what makes checkout-time behavior possible at all. It is a capability worth reviewing—on any
                  extension, not just this one.
                </li>
                <li>
                  <strong>Behavior is not always visible in the package.</strong> The conduct at issue here was a
                  checkout-time affiliate cookie write. That is a useful reminder of what static review does and does not
                  cover.
                </li>
              </ul>
            </section>

            <section className="case-study-sources">
              <h2>Sources</h2>
              <ol>
                {SOURCES.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                      {s.title}
                    </a>
                    <span className="source-meta">
                      {s.publisher} · {s.date}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          </article>

          {/* CTA */}
          <div className="honey-cta">
            <h3>Check Before You Install</h3>
            <p>Scan any extension before installing. ExtensionShield helps flag risk indicators—not a guarantee of protection.</p>
            <Link to="/scan" className="cta-button">
              Scan an Extension
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <p className="honey-cta-secondary">
              <Link to="/is-this-chrome-extension-safe">Learn how to check if an extension is safe</Link>
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default HoneyCaseStudyPage;
