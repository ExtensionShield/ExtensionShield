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
  "description": "Open-source browser extension scanner with a governance scoring layer (Security, Privacy, Governance) for pre-install risk assessment. Enterprise governance workflows are planned.",
  "url": "https://extensionshield.com/extension-governance"
};

const ExtensionGovernancePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Extension Governance Platform | Browser Extension Compliance"
        description="Browser extension scanner with a governance scoring layer for pre-install risk assessment, with evidence attached to each finding. Enterprise governance workflows are planned."
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
              ExtensionShield helps teams assess browser extensions before they reach production browsers: each scan produces a scored report across Security, Privacy, and Governance, with evidence attached to every finding to support a security review. Enterprise governance workflows are planned.
            </p>
          </header>

          <div className="compare-prose">
            <h2>From scanner output to governance decisions</h2>
            <p>
              Security teams do not need another raw finding list. They need findings they can act on: each ExtensionShield scan produces a scored report across Security, Privacy, and Governance, and each finding includes evidence you can use to support a security review.
            </p>

            <h2>How ExtensionShield helps today</h2>
            <ul>
              <li><strong>Pre-install review:</strong> scan Chrome Web Store extensions before users install them.</li>
              <li><strong>Scored report:</strong> see Security, Privacy, and Governance findings to inform your own organizational policy.</li>
              <li><strong>Private build audit:</strong> review CRX/ZIP builds before release or internal rollout.</li>
              <li><strong>Re-review by re-scanning:</strong> re-scan an extension and review its current findings.</li>
              <li><strong>Evidence per finding:</strong> each finding includes evidence you can use to support a security review.</li>
            </ul>

            <p>
              Policy workflows, allow/block enforcement, fleet inventory, continuous monitoring, and audit-export are planned. See the <Link to="/enterprise">Enterprise page</Link> for what is on the roadmap.
            </p>

            <h2>Browser extension compliance</h2>
            <p>
              Browser extension compliance is not just whether an extension exists in inventory. It is whether the extension's access, disclosures, and claimed-vs-actual behavior match your acceptable risk policy. ExtensionShield scores Terms-of-Service alignment, disclosure and privacy-policy consistency, and claimed-vs-actual behavior, and each finding includes evidence you can use to support a security review.
            </p>
          </div>

          <div className="compare-cta">
            <Link to="/enterprise">Enterprise capabilities — planned</Link>
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
