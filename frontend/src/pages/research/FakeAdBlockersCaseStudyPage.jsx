import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./HoneyCaseStudyPage.scss";

/**
 * Fake ad blockers case study.
 *
 * Every factual claim below traces to one of SOURCES. Fact-checked 2026-07-30;
 * the following were corrected in that pass and must not be reintroduced:
 *
 *  - "20M-80M+ users affected" fused two non-cumulative AdGuard studies two
 *    years apart into a range no source states, then added a "+". The 80M
 *    figure carries its own author's caveat that it is partly bot-inflated.
 *    We now cite the 2018 figure alone, dated and attributed.
 *  - A stat tile rendered "Adblock Plus / AdGuard" at 32px under a CRITICAL /
 *    Malware badge. Both are legitimate shipping products and neither was the
 *    subject of this research; the five extensions behind the 20M figure were
 *    not clones of either. AdGuard is also the publisher of the research.
 *  - "sent every visited URL to a remote server" overstated Imperva, which
 *    documents link harvesting from the rendered page plus that page's URL,
 *    and notes major search engines were excluded.
 *  - "Users leave positive reviews and the extension climbs rankings" inverted
 *    the cited finding: AdGuard identified implausibly FEW reviews as the tell.
 *  - The 2021-2025 date badge was unsupported; the load-bearing evidence is
 *    2018-2021.
 */

const SOURCES = [
  {
    title: "Over 20,000,000 of Chrome Users are Victims of Fake Ad Blockers",
    publisher: "AdGuard — Andrey Meshkov",
    date: "17 April 2018",
    url: "https://adguard.com/en/blog/over-20-000-000-of-chrome-users-are-victims-of-fake-ad-blockers/",
  },
  {
    title: "The Ad Blocker That Injects Ads (AllBlock)",
    publisher: "Imperva",
    date: "October 2021",
    url: "https://www.imperva.com/blog/the-ad-blocker-that-injects-ads/",
  },
  {
    title: "Malicious browser extensions (16 trojanized extensions, 3.2M+ users)",
    publisher: "GitLab Threat Intelligence",
    date: "13 February 2025",
    url: "https://gitlab-com.gitlab.io/gl-security/security-tech-notes/threat-intelligence-tech-notes/malicious-browser-extensions-feb-2025/",
  },
  {
    title: "Fake ad blockers, part 3",
    publisher: "AdGuard — Andrey Meshkov",
    date: "August 2020",
    url: "https://adguard.com/en/blog/fake-ad-blockers-part-3.html",
  },
];

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Fake Ad Blocker Chrome Extensions: Malware That Injects Ads",
  "description":
    "Case study on ad blocker clones that inject ads instead of blocking them: the documented payload, signature matching, and anti-debugging techniques, with sources.",
  "author": { "@type": "Organization", "name": "ExtensionShield" },
  "datePublished": "2025-02-01",
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

const FakeAdBlockersCaseStudyPage = () => {
  return (
    <>
      <SEOHead
        title="Fake Ad Blocker Extensions Case Study | ExtensionShield"
        description="How ad blocker clones inject ads instead of blocking them: the documented jQuery payload, signature matching, and anti-debugging techniques. Sourced case study."
        pathname="/research/case-studies/fake-ad-blockers"
        schema={articleSchema}
      />

      <div className="honey-case-study-page">
        <div className="honey-content">
          <nav className="breadcrumb">
            <Link to="/research">Research</Link>
            <span>/</span>
            <Link to="/research/case-studies">Case Studies</Link>
            <span>/</span>
            <span>Fake Ad Blockers</span>
          </nav>

          <header className="honey-header">
            <div className="honey-meta">
              <span className="severity-badge case-study">CASE STUDY</span>
              <span className="category-badge">Ad Injection</span>
              <span className="date-badge">2018–2021</span>
            </div>
            <h1>Fake Ad Blockers: Wolves in Sheep&apos;s Clothing</h1>
            <p className="honey-subtitle">
              How Chrome extensions marketed as ad blockers were found injecting ads and rewriting links—and what the published analyses actually established.
            </p>
          </header>

          <p className="case-study-scope">
            Editorial write-up of a threat pattern documented by third-party researchers. Not an ExtensionShield scan
            result for any specific extension, and not a statement about any ad blocker currently on the Chrome Web Store.
          </p>

          <div className="honey-stats">
            <div className="stat">
              <span className="stat-value">20M+</span>
              <span className="stat-label">Installs across five extensions (AdGuard, 2018)</span>
            </div>
            <div className="stat">
              <span className="stat-value">Impersonation</span>
              <span className="stat-label">Clones borrow the look of trusted blockers</span>
            </div>
            <div className="stat danger">
              <span className="stat-value">Inject</span>
              <span className="stat-label">Ads instead of blocking them</span>
            </div>
          </div>

          <article className="honey-article">
            <section>
              <h2>Scale of the Problem</h2>
              <p>
                In April 2018 AdGuard reported that five ad blocker clones on the Chrome Web Store had accumulated more
                than 20 million installs between them—AdRemover for Google Chrome (10M+), uBlock Plus (8M+), Adblock Pro
                (2M+), HD for YouTube, and Webutation. AdGuard is both the publisher of that research and a maker of ad
                blocking software, which is worth stating plainly when citing it.
              </p>
              <p>
                A larger figure circulates from AdGuard&apos;s 2020 follow-up—a cluster of 295 extensions with roughly 80
                million combined users—but that set is mostly not ad blockers, and its own author wrote that he suspected
                the number was &ldquo;in part caused by bots.&rdquo; We cite the 2018 figure because it is the one the
                evidence on this page actually rests on.
              </p>
            </section>

            <section>
              <h2>How Fake Ad Blockers Work</h2>
              <div className="findings-grid">
                <div className="finding-card">
                  <div className="finding-icon">🎭</div>
                  <h3>Look Legitimate</h3>
                  <p>
                    The clones were forks of genuine open-source blockers, so they really did block ads. AdGuard found
                    the malicious logic hidden inside a modified jQuery library, with a further obfuscated script pulled
                    from an image hosted on a third-party domain and executed in the extension&apos;s privileged
                    background context.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">🔗</div>
                  <h3>Link Harvesting &amp; Affiliate Rewriting</h3>
                  <p>
                    Imperva&apos;s 2021 analysis of AllBlock found it collecting the links present on each rendered page,
                    including that page&apos;s own URL, and sending them to a remote server that returned replacements.
                    Clicking a rewritten link routed the user through an affiliate link. Major search engines were
                    excluded from targeting. AllBlock&apos;s own code was not obfuscated.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">📄</div>
                  <h3>Signature Matching &amp; iframe Injection</h3>
                  <p>
                    The best-documented mechanism: AdGuard found a hidden script listening to every browser request and
                    comparing a salted MD5 of the URL against a signature list loaded from a remote{" "}
                    <code>coupons.txt</code>. On a match—Google.com among them—it loaded an iframe from a third-party
                    domain and re-initialised.
                  </p>
                </div>
                <div className="finding-card">
                  <div className="finding-icon">📢</div>
                  <h3>Ranking Manipulation</h3>
                  <p>
                    Operators stuffed keywords into extension names and descriptions to surface in Chrome Web Store
                    search. Notably, positive reviews were not the mechanism—AdGuard flagged the opposite as the tell,
                    citing extensions with over a million claimed users and only a handful of reviews.
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2>Red Flags &amp; How to Protect Your Organization</h2>
              <ul className="lessons-list">
                <li>
                  <strong>Scan before allowing extensions.</strong> Check for obfuscation, excessive permissions, and
                  suspicious network behavior. ExtensionShield&apos;s three-layer model (security, privacy, governance)
                  gives teams evidence for allow/block decisions.
                </li>
                <li>
                  <strong>Install counts and ratings can be gamed.</strong> A high install count with very few reviews is
                  itself a signal worth checking, not a reassurance.
                </li>
                <li>
                  <strong>Audit &ldquo;read and change data on all sites&rdquo;.</strong> Ad blockers legitimately need
                  broad host access—and that same permission is what allows content injection. The permission does not
                  distinguish the two; only behavior does.
                </li>
                <li>
                  <strong>Rescan on update.</strong> Every case here involved code that arrived or changed after install.
                  A one-time review at install does not cover the extension you end up running.
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

          <div className="honey-cta">
            <h3>Scan Extensions Before You Install or Allow</h3>
            <p>
              Get a risk score and evidence-linked report for any Chrome extension, so you can review what an extension
              can reach before you allow it.
            </p>
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

export default FakeAdBlockersCaseStudyPage;
