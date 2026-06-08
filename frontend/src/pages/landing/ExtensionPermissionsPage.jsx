import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Which browser extension permissions are dangerous?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "High-risk permissions include all-site host access, cookies, history, debugger, downloads, clipboard read, management, webRequest, scripting, and broad tab access. The danger depends on how the permissions combine with code behavior and network access."
      }
    },
    {
      "@type": "Question",
      "name": "Is all website access always bad?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "No. Some extensions, such as ad blockers, need broad host access. The question is whether the permission is necessary, disclosed, and supported by safe behavior."
      }
    }
  ]
};

const ExtensionPermissionsPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Browser Extension Permissions Explained | Dangerous Permissions"
        description="Browser extension permissions explained: all-site access, cookies, history, clipboard, webRequest, scripting, and permission combinations that increase extension risk."
        pathname="/extension-permissions"
        ogType="website"
        keywords="extension permissions explained, dangerous chrome extension permissions, browser extension permissions, chrome extension permissions checker"
        schema={faqSchema}
      />
      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          <header className="compare-header">
            <h1>Browser Extension Permissions Explained</h1>
            <p>
              Permissions define the blast radius of a browser extension. ExtensionShield explains what each permission enables and whether the access matches the extension's purpose.
            </p>
          </header>

          <div className="compare-prose">
            <h2>High-risk permissions to review</h2>
            <ul>
              <li><strong>All-site host access:</strong> can read or modify content across every site the browser visits.</li>
              <li><strong>cookies:</strong> can interact with browser cookies, which may expose sensitive session context.</li>
              <li><strong>history:</strong> can read browsing history and reveal user behavior.</li>
              <li><strong>clipboardRead:</strong> can access copied data, including secrets accidentally placed on the clipboard.</li>
              <li><strong>debugger:</strong> can inspect and modify pages at a powerful level.</li>
              <li><strong>webRequest and scripting:</strong> can observe requests or inject behavior into pages depending on host access.</li>
              <li><strong>management:</strong> can interact with installed extensions and themes.</li>
            </ul>

            <h2>Permission combinations matter</h2>
            <p>
              A single permission rarely tells the whole story. The risky pattern is often a combination: broad page access plus external network calls, cookie access plus all-site host permissions, or scripting plus a weak privacy disclosure.
            </p>

            <h2>How to review permissions before install</h2>
            <ol style={{ marginLeft: "1.25rem", marginBottom: "1rem" }}>
              <li>Check whether the permission is required for the promised feature.</li>
              <li>Look for broad host access, sensitive APIs, and unclear privacy disclosures.</li>
              <li>Scan the extension to see code, network, and governance evidence beyond the permission prompt.</li>
            </ol>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Check extension permissions</Link>
          </div>

          <div className="compare-links">
            <h3>Related</h3>
            <ul>
              <li><Link to="/chrome-extension-permissions">Chrome extension permissions guide</Link></li>
              <li><Link to="/extension-risk-score">Extension risk score</Link></li>
              <li><Link to="/is-this-chrome-extension-safe">Is this Chrome extension safe?</Link></li>
              <li><Link to="/glossary">Security glossary</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExtensionPermissionsPage;
