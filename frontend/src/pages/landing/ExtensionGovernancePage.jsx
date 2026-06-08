import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

const governanceSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "ExtensionShield",
  "applicationCategory": "SecurityApplication",
  "operatingSystem": "Web",
  "description": "Open-source browser extension security and governance platform for extension risk assessment, compliance evidence, monitoring, and allow/block decisions.",
  "url": "https://extensionshield.com/extension-governance"
};

const ExtensionGovernancePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Extension Governance Platform | Browser Extension Compliance"
        description="Extension governance platform for browser extension compliance, allow/block decisions, update monitoring, policy evidence, and pre-install risk assessment."
        pathname="/extension-governance"
        ogType="website"
        keywords="extension governance platform, browser extension compliance, extension governance, browser extension governance, extension policy"
        schema={governanceSchema}
      />
      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          <header className="compare-header">
            <h1>Extension Governance Platform</h1>
            <p>
              ExtensionShield helps teams govern browser extensions before they reach production browsers: assess risk, document evidence, enforce policy, and monitor changes.
            </p>
          </header>

          <div className="compare-prose">
            <h2>From scanner output to governance decisions</h2>
            <p>
              Security teams do not need another raw finding list. They need a repeatable decision process: request, assess, approve, block, monitor, and re-review when risk changes. ExtensionShield turns extension analysis into that process.
            </p>

            <h2>Governance workflows ExtensionShield supports</h2>
            <ul>
              <li><strong>Pre-install review:</strong> scan Chrome Web Store extensions before users install them.</li>
              <li><strong>Allow/block decisions:</strong> map Security, Privacy, and Governance findings to an organizational policy.</li>
              <li><strong>Private build audit:</strong> review CRX/ZIP builds before release or internal rollout.</li>
              <li><strong>Update monitoring:</strong> re-check extensions when versions, permissions, ownership, or behavior changes.</li>
              <li><strong>Audit evidence:</strong> preserve the score drivers and findings behind every decision.</li>
            </ul>

            <h2>Browser extension compliance</h2>
            <p>
              Browser extension compliance is not just whether an extension exists in inventory. It is whether the extension's access, disclosures, data flows, and update behavior match your acceptable risk policy. ExtensionShield provides the evidence needed for that review.
            </p>
          </div>

          <div className="compare-cta">
            <Link to="/enterprise">Request a governance pilot</Link>
          </div>

          <div className="compare-links">
            <h3>Related</h3>
            <ul>
              <li><Link to="/browser-extension-risk-assessment">Browser extension risk assessment</Link></li>
              <li><Link to="/extension-risk-score">Extension risk score</Link></li>
              <li><Link to="/scan/upload">Private CRX/ZIP audit</Link></li>
              <li><Link to="/blog/browser-extension-compliance-checklist">Browser extension compliance checklist</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExtensionGovernancePage;
