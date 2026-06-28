import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

/**
 * SEO landing page: enterprise intent — "browser extension risk assessment"
 * Route: /browser-extension-risk-assessment
 */
const BrowserExtensionRiskAssessmentPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Browser Extension Risk Assessment | Enterprise Extension Security | ExtensionShield"
        description="Browser extension risk assessment: scan extensions and get a scored report across Security, Privacy, and Governance, with evidence attached to each finding to support a security review. Enterprise governance workflows are planned."
        pathname="/browser-extension-risk-assessment"
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
            <h1>Browser Extension Risk Assessment</h1>
            <p>
              Assess browser extension risk before it reaches your organization. ExtensionShield helps IT and security teams evaluate extensions with a scored report across Security, Privacy, and Governance, where each finding includes evidence you can use to support a security review. Enterprise governance workflows are planned.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              <strong>Browser extension risk assessment</strong> is essential when employees install extensions outside of IT approval. Shadow IT extensions can expose data, violate compliance, and introduce malware. A structured program — with a <strong>browser extension allowlist policy</strong>, consistent scoring, and evidence-backed review — reduces that risk.
            </p>
            <p>
              ExtensionShield provides a single <strong>extension risk score</strong> (0–100) plus Security, Privacy, and Governance dimensions. Use it to evaluate extensions before allowlisting, and re-scan an extension to review its current findings. Policy workflows, allow/block enforcement, and audit-export are planned.
            </p>
            <ul>
              <li>Extension risk score and permission audit for every extension</li>
              <li>Governance signals (ToS alignment, disclosure consistency, claimed-vs-actual behavior)</li>
              <li>Re-scan an extension to review its current findings</li>
              <li>Each finding includes evidence you can use to support a security review</li>
            </ul>
          </div>

          <div className="compare-cta">
            <Link to="/enterprise">Request an Enterprise pilot →</Link>
          </div>

          <div className="compare-links">
            <h3>Related</h3>
            <ul>
              <li><Link to="/research/methodology">How we score extensions</Link></li>
              <li><Link to="/scan">Scan an extension</Link></li>
              <li><Link to="/extension-governance">Extension governance platform</Link></li>
              <li><Link to="/compare">Compare extension scanners</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default BrowserExtensionRiskAssessmentPage;
