import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./ComparePage.scss";

const CompareSpinAiPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Spin.ai vs ExtensionShield | Browser Extension Security Comparison"
        description="Compare Spin.ai SpinMonitor and SpinCRX with ExtensionShield for browser extension security, governance, pre-install scanning, open-source trust, and private build audits."
        pathname="/compare/spin-ai"
        ogType="website"
        keywords="Spin.ai vs ExtensionShield, SpinMonitor alternative, SpinCRX alternative, browser extension security comparison"
      />

      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          <header className="compare-header">
            <h1>Spin.ai vs ExtensionShield</h1>
            <p>
              Spin.ai focuses on enterprise SaaS security programs. ExtensionShield focuses on a transparent, open-source, pre-install browser extension security and governance workflow. Below is a criteria-based comparison based on each product’s public docs as of June 2026.
            </p>
          </header>

          <div className="compare-prose">
            <h2>Where Spin.ai focuses</h2>
            <ul>
              <li>Enterprise SaaS security platform credibility across Google Workspace and Microsoft 365.</li>
              <li>Browser extension risk assessment integrated into broader SaaS posture workflows.</li>
              <li>Continuous monitoring, remediation, and enterprise console value for large organizations.</li>
            </ul>

            <h2>Where ExtensionShield is different</h2>
            <ul>
              <li><strong>Open-source core:</strong> trust comes from visible methodology and community-verifiable rules, not only vendor claims.</li>
              <li><strong>Pre-install scanning:</strong> anyone can scan a Chrome Web Store URL before installing, approving, or sharing an extension.</li>
              <li><strong>Private build audits:</strong> developers can upload CRX/ZIP builds before release to catch security, privacy, and policy issues.</li>
              <li><strong>Evidence-first reports:</strong> findings are tied to permissions, code, network indicators, disclosures, and governance checks.</li>
            </ul>

            <h2>Choosing by criteria</h2>
            <p>
              Consider Spin.ai if your priority is a broader SaaS security platform wrapped around browser extension monitoring. Consider ExtensionShield if your priority is transparent extension risk assessment, open-source trust, developer audits, and governance evidence before an extension reaches users.
            </p>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Scan an extension with ExtensionShield</Link>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Compare browser extension security tools</Link></li>
              <li><Link to="/compare/crxcavator">ExtensionShield vs CRXcavator</Link></li>
              <li><Link to="/compare/extension-auditor">ExtensionShield vs Extension Auditor</Link></li>
              <li><Link to="/compare/crxplorer">ExtensionShield vs CRXplorer</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default CompareSpinAiPage;
