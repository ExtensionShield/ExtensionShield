import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

const CANONICAL_DOMAIN = "https://extensionshield.com";

const breadcrumbSchema = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": `${CANONICAL_DOMAIN}/` },
    { "@type": "ListItem", "position": 2, "name": "Is this Chrome extension safe?", "item": `${CANONICAL_DOMAIN}/is-this-chrome-extension-safe` }
  ]
};

/**
 * Educational hub: consumer intent "is this Chrome extension safe?"
 * Route: /is-this-chrome-extension-safe
 */
const IsThisChromeExtensionSafePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Is This Chrome Extension Safe? | ExtensionShield"
        description="How to tell if a Chrome extension is safe: check permissions, network access, and updates. A simple guide and free scanner to see risk before you install."
        pathname="/is-this-chrome-extension-safe"
        ogType="website"
        schema={[breadcrumbSchema]}
      />
      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
          <button type="button" className="compare-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          </div>
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span aria-hidden>/</span>
            <span>Guide</span>
          </nav>

          <header className="compare-header">
            <h1>Is this Chrome extension safe?</h1>
            <p>
              “Safe” means the extension only gets the access it needs, doesn’t talk to shady domains, and hasn’t been caught doing something bad. Here’s how to check before you install—and how ExtensionShield helps.
            </p>
          </header>

          <nav className="hub-toc" aria-label="On this page">
            <h2 className="hub-toc-title">On this page</h2>
            <ul>
              <li><a href="#checklist">3-step checklist</a></li>
              <li><a href="#what-we-check">What ExtensionShield checks</a></li>
              <li><a href="#examples">Real examples</a></li>
              <li><a href="#scan">Scan an extension</a></li>
            </ul>
          </nav>

          <div className="compare-prose" id="checklist">
            <h2>A simple 3-step checklist</h2>
            <ol style={{ marginLeft: "1.25rem", marginBottom: "1rem" }}>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong>Check permissions.</strong> On the Chrome Web Store page, look at what the extension can do. Access to “all your data on all websites” or “read and change your data” is a big deal—make sure it matches what the extension claims to do.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong>See what it can connect to.</strong> Extensions can send data to external servers. You want to know which domains they use. A scanner that lists network access helps you spot data going somewhere you don’t expect.
              </li>
              <li style={{ marginBottom: "0.5rem" }}>
                <strong>Remember: extensions can change.</strong> They update automatically. One day it’s fine; the next it might request new permissions or new domains. Re-check after major updates.
              </li>
            </ol>

            <div className="compare-cta" id="scan" style={{ marginTop: "1.5rem", marginBottom: "1.5rem" }}>
              <Link to="/scan">Try it now — scan an extension</Link>
            </div>

            <p>
              Paste a Chrome Web Store URL on our scanner page. You’ll get a risk score, permission breakdown, and a list of domains the extension can contact—typically in well under a minute.
            </p>

            <h2 id="what-we-check">What ExtensionShield checks</h2>
            <p>
              We don’t just list permissions. We analyze the extension and combine several signals into one report:
            </p>
            <ul>
              <li><strong>Permissions</strong> — What the extension can access (tabs, storage, cookies, etc.) and how risky that is for its stated purpose.</li>
              <li><strong>Network domains</strong> — Which servers the extension can talk to, so you can spot data leaving your browser.</li>
              <li><strong>Code quality</strong> — Static analysis (SAST) to flag suspicious patterns, obfuscation, and known bad behavior.</li>
              <li><strong>Threat intelligence</strong> — Whether the extension or its versions have been flagged by security tools.</li>
              <li><strong>Governance</strong> — Policy alignment, disclosure, and consistency (especially useful for enterprises).</li>
            </ul>
            <p>
              You get a single risk score (0–100) plus Security, Privacy, and Governance breakdowns, with evidence you can click into.
            </p>

            <section id="examples" className="hub-examples" style={{ marginTop: "2rem" }}>
              <h2>Real examples</h2>
              <p style={{ marginBottom: "1rem", color: "var(--theme-text-secondary)", fontSize: "0.9375rem" }}>
                See how risky behavior shows up in real extensions we’ve analyzed.
              </p>
              <div className="hub-examples-grid">
                <Link to="/research/case-studies/honey" className="hub-example-card">
                  <h3>Honey</h3>
                  <p>Reported affiliate link hijacking and shopping tracking—17M+ users. Why star ratings aren’t enough.</p>
                  <span className="hub-example-link">Read case study →</span>
                </Link>
                <Link to="/research/case-studies/pdf-converters" className="hub-example-card">
                  <h3>PDF converter extensions</h3>
                  <p>Networks of extensions that harvest document contents and user data via remote configuration.</p>
                  <span className="hub-example-link">Read case study →</span>
                </Link>
                <Link to="/research/case-studies/fake-ad-blockers" className="hub-example-card">
                  <h3>Fake ad blockers</h3>
                  <p>Ad blocker clones that inject ads instead of blocking them—20M–80M+ users affected.</p>
                  <span className="hub-example-link">Read case study →</span>
                </Link>
              </div>
            </section>
          </div>

          <div className="compare-links" style={{ marginTop: "2rem" }}>
            <h3>Related</h3>
            <ul>
              <li><Link to="/scan">Scan an extension</Link></li>
              <li><Link to="/chrome-extension-permissions">Chrome extension permissions explained</Link></li>
              <li><Link to="/research/methodology">How we score extensions</Link></li>
              <li><Link to="/research/case-studies">Case studies: real extension risks</Link></li>
              <li><Link to="/compare">Compare Tools</Link></li>
              <li><Link to="/crxcavator-alternative">Comparing scanners? See CRXcavator alternative</Link></li>
              <li><Link to="/enterprise">Enterprise extension security</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default IsThisChromeExtensionSafePage;
