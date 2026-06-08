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
      "name": "What is browser extension security?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Browser extension security is the process of reviewing what an extension can access, how its code behaves, which domains it can contact, and whether it aligns with organizational policy before it is installed or allowed."
      }
    },
    {
      "@type": "Question",
      "name": "Why are browser extensions risky?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Extensions can request powerful permissions, read page content, modify websites, access browsing activity, and change after installation through automatic updates. The risk depends on permissions, code behavior, publisher trust, and the data exposed in your environment."
      }
    },
    {
      "@type": "Question",
      "name": "How does ExtensionShield help?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "ExtensionShield analyzes extension security, privacy, and governance signals before install, before release, or before allowlisting. Reports include a risk score and evidence so teams can decide whether to allow, block, monitor, or fix an extension."
      }
    }
  ]
};

const ExtensionSecurityPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Browser Extension Security | Open-Source Extension Governance"
        description="Browser extension security platform for pre-install risk assessment, private CRX/ZIP audits, and enterprise extension governance. Scan extensions before they reach users."
        pathname="/extension-security"
        ogType="website"
        keywords="browser extension security, extension security audit, chrome extension security, browser extension security platform"
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
            <h1>Browser Extension Security</h1>
            <p>
              ExtensionShield is an open-source browser extension security and governance platform for pre-install risk assessment, private build audits, and enterprise allow/block decisions.
            </p>
          </header>

          <div className="compare-prose">
            <h2>Why browser extension security needs a platform</h2>
            <p>
              Browser extensions run close to the data users care about: pages, tabs, cookies, clipboard, downloads, history, and SaaS sessions. A Chrome Web Store listing or star rating does not explain whether an extension is safe for your threat model.
            </p>
            <p>
              ExtensionShield turns an extension into a decision record. It analyzes code, permissions, host access, network indicators, known threat signals, disclosure quality, and policy fit so you can decide whether to install, block, monitor, or request a fix.
            </p>

            <h2>What ExtensionShield checks</h2>
            <ul>
              <li><strong>Security:</strong> SAST findings, suspicious APIs, obfuscation, vulnerable patterns, malware and threat-intel signals.</li>
              <li><strong>Privacy:</strong> broad host access, sensitive permissions, external communication, data collection risk, and disclosure gaps.</li>
              <li><strong>Governance:</strong> policy alignment, permission justification, developer reputation signals, audit evidence, and allow/block workflow context.</li>
            </ul>

            <h2>Pre-install security, not after-the-fact cleanup</h2>
            <p>
              The safest extension decision happens before installation. ExtensionShield supports public Chrome Web Store scans, private CRX/ZIP audits for developers, and enterprise governance workflows for teams evaluating extensions before they become shadow IT.
            </p>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Run a pre-install extension scan</Link>
          </div>

          <div className="compare-links">
            <h3>Related</h3>
            <ul>
              <li><Link to="/extension-risk-score">Extension risk score</Link></li>
              <li><Link to="/extension-permissions">Extension permissions explained</Link></li>
              <li><Link to="/extension-governance">Extension governance platform</Link></li>
              <li><Link to="/research/methodology">Scoring methodology</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExtensionSecurityPage;
