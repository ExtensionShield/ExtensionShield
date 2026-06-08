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
              CRXcavator (Duo/Cisco) is a well-known chrome extension security scanner. If you’re looking for a <strong>CRXcavator alternative</strong> with transparent scoring, SAST, and governance, ExtensionShield is built for that.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              CRXcavator provides permission-based scoring, RetireJS, and CSP checks for Chrome, Firefox, and Edge extensions. Teams often look for alternatives due to availability, limited transparency in how scores are calculated, or the need for a dedicated <strong>governance and compliance</strong> layer.
            </p>
            <p>
              <strong>ExtensionShield</strong> gives you a single <strong>chrome extension risk score</strong> (0–100) with three dimensions: Security (40%), Privacy (35%), and Governance (25%). We add SAST (Semgrep), VirusTotal integration, obfuscation detection, and explicit governance signals so you can audit extensions and support compliance. Our methodology is documented; reports are evidence-based and suitable for audits.
            </p>
            <ul>
              <li>Transparent weights and methodology (Security / Privacy / Governance)</li>
              <li>SAST + VirusTotal — not just permission-based scoring</li>
              <li>Chrome extension permissions checker and privacy analysis</li>
              <li>Extension risk assessment and governance for enterprise</li>
            </ul>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Try ExtensionShield free →</Link>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Best chrome extension security scanner</Link></li>
              <li><Link to="/compare/crxcavator">ExtensionShield vs CRXcavator (detailed)</Link></li>
              <li><Link to="/compare/crxplorer">ExtensionShield vs CRXplorer</Link></li>
              <li><Link to="/compare/extension-auditor">ExtensionShield vs ExtensionAuditor</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default CrxcavatorAlternativePage;
