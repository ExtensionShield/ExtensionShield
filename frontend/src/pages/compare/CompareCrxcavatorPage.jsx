import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./ComparePage.scss";

const CompareCrxcavatorPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="ExtensionShield vs CRXcavator | CRXcavator Alternative Comparison"
        description="Compare ExtensionShield vs CRXcavator: chrome extension risk score, security audit, and governance. CRXcavator alternatives with transparent scoring and enterprise extension security."
        pathname="/compare/crxcavator"
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
            <h1>ExtensionShield vs CRXcavator</h1>
            <p>
              CRXcavator (Duo/Cisco) is an enterprise chrome extension security scanner. Here’s how ExtensionShield compares as a CRXcavator alternative for chrome extension risk score and extension security analysis.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              Based on its public docs as of June 2026, <strong>CRXcavator</strong> offers permission-based scoring, RetireJS for vulnerable libraries, CSP checks, and enterprise allowlisting, and scans Chrome, Firefox, and Edge extensions. Teams evaluating <strong>CRXcavator alternatives</strong> often want published scoring weights plus SAST and a dedicated governance layer. ExtensionShield publishes its scoring weights and methodology (scoring/weights.py) and adds Semgrep SAST, VirusTotal hash lookups, and a governance layer for ToS alignment, disclosure, and consistency.
            </p>
            <p>
              <strong>ExtensionShield</strong> gives you a single <strong>chrome extension risk score</strong> (0–100) with three near-equally weighted layers: Security (34%), Privacy (33%), and Governance (33%), plus hard gates that override the score to BLOCK severe findings. We add SAST (Semgrep), VirusTotal integration, obfuscation detection, and explicit governance (ToS alignment, disclosure, consistency) so you can <strong>audit chrome extension security</strong> and support <strong>extension governance and compliance</strong>. Our methodology is fully documented; you get evidence-based reports suitable for audits.
            </p>
            <ul>
              <li>Transparent weights and methodology (Security / Privacy / Governance)</li>
              <li>SAST + VirusTotal — not just permission-based scoring</li>
              <li>Chrome extension permissions checker and privacy scanner</li>
              <li>Extension risk assessment and governance for enterprise</li>
            </ul>
            <p>
              Try ExtensionShield for free to <strong>scan chrome extension for malware</strong> and get a <strong>chrome extension risk score</strong> — typically in well under a minute.
            </p>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Compare chrome extension security scanners</Link></li>
              <li><Link to="/compare/crxplorer">ExtensionShield vs CRXplorer</Link></li>
              <li><Link to="/compare/extension-auditor">ExtensionShield vs ExtensionAuditor</Link></li>
            </ul>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Scan an extension with ExtensionShield →</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default CompareCrxcavatorPage;
