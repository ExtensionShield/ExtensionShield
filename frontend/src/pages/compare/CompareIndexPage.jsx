import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./ComparePage.scss";

const CompareIndexPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Best Browser Extension Security Tools | Scanner & Governance Comparison"
        description="Compare browser extension security tools. ExtensionShield vs Spin.ai, CRXcavator, CRXplorer, and Extension Auditor for risk scoring, governance, and audits."
        pathname="/compare"
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
            <h1>Best Browser Extension Security Tools</h1>
            <p>
              Compare chrome extension security scanners, extension risk score tools, and governance platforms. See how ExtensionShield stacks up against Spin.ai, CRXcavator, CRXplorer, and Extension Auditor.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              Choosing the right <strong>chrome extension security scanner</strong> or <strong>browser extension security scanner</strong> matters for security, privacy, and compliance. ExtensionShield provides a <strong>chrome extension risk score</strong> built on three layers (Security, Privacy, Governance), plus a <strong>chrome extension permissions checker</strong>, malware scanning, and <strong>audit chrome extension security</strong> reports — so you can <strong>check if a chrome extension is safe</strong> before installing.
            </p>

            <p>
              Looking for <strong>CRXcavator alternatives</strong> or a <strong>Spin.ai alternative</strong> for extension-specific governance? ExtensionShield offers transparent scoring, open-source trust, SAST + VirusTotal, and pre-install extension governance. Below we compare ExtensionShield to other popular options.
            </p>
          </div>

          <div className="compare-links">
            <h3>ExtensionShield vs competitors</h3>
            <ul>
              <li><Link to="/compare/spin-ai">ExtensionShield vs Spin.ai</Link></li>
              <li><Link to="/compare/crxcavator">ExtensionShield vs CRXcavator</Link></li>
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

export default CompareIndexPage;
