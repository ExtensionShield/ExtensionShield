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
        description="Browser extension risk assessment for enterprises: govern extensions, review allowlist decisions, and get audit-ready reports. Evidence-backed compliance support for security teams."
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
              Manage browser extension risk across your organization. ExtensionShield helps IT and security teams run extension governance, support allowlist decisions with evidence, and get audit-ready extension risk assessments.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              <strong>Browser extension risk assessment</strong> is essential when employees install extensions outside of IT approval. Shadow IT extensions can expose data, violate compliance, and introduce malware. A structured program — with a <strong>browser extension allowlist policy</strong>, consistent scoring, and evidence-backed review — reduces that risk.
            </p>
            <p>
              ExtensionShield provides a single <strong>extension risk score</strong> (0–100) plus Security, Privacy, and Governance dimensions. Use it to evaluate extensions before allowlisting and re-scan after updates to compare findings against prior versions. Enterprise plans add policy workflows, governance evidence packs, and audit-ready exports.
            </p>
            <ul>
              <li>Extension risk score and permission audit for every extension</li>
              <li>Governance and compliance signals (ToS, disclosure, policy alignment)</li>
              <li>Re-scan after updates and compare findings against prior versions</li>
              <li>Audit-ready reports for security and compliance teams</li>
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
