import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

/**
 * SEO landing page: comparison intent — "crxcavator alternative"
 * Route: /crxcavator-alternative
 */
const CrxcavatorAlternativePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="CRXcavator Alternative | Chrome Extension Risk Score & Security | ExtensionShield"
        description="Looking for a CRXcavator alternative? ExtensionShield offers transparent chrome extension risk scoring, SAST, VirusTotal, and governance. Compare features and try free scans."
        pathname="/crxcavator-alternative"
        ogType="website"
      />
      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
          <button type="button" className="compare-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          </div>
          <header className="compare-header">
            <h1>CRXcavator Alternative</h1>
            <p>
              CRXcavator is a well-known Chrome extension security review tool. If you are comparing a <strong>CRXcavator alternative</strong>, ExtensionShield focuses on transparent scoring, SAST, private build audits, and governance evidence.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              CRXcavator is known for reviewing extension metadata, permissions, CSP, external JavaScript, vulnerable libraries, and related risk factors. Teams comparing alternatives should focus on methodology transparency, evidence quality, current workflow fit, and whether the tool supports a dedicated <strong>governance and compliance</strong> process.
            </p>
            <p>
              <strong>ExtensionShield</strong> gives you a single <strong>chrome extension risk score</strong> (0–100) with three dimensions: Security (40%), Privacy (35%), and Governance (25%). It adds SAST, threat signals, obfuscation detection, and explicit governance signals so you can audit extensions and support compliance review. The methodology is documented, and reports are evidence-based.
            </p>
            <ul>
              <li>Transparent weights and methodology (Security / Privacy / Governance)</li>
              <li>SAST + VirusTotal — not just permission-based scoring</li>
              <li>Chrome extension permissions checker and privacy analysis</li>
              <li>Extension risk assessment and governance for enterprise</li>
            </ul>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Scan an extension</Link>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Best browser extension security tools</Link></li>
              <li><Link to="/compare/crxcavator">CRXcavator vs ExtensionShield (detailed)</Link></li>
              <li><Link to="/compare/crxplorer">ExtensionShield vs CRXplorer</Link></li>
              <li><Link to="/compare/extension-auditor">Extension Auditor vs ExtensionShield</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default CrxcavatorAlternativePage;
