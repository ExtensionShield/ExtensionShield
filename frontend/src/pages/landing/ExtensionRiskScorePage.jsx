import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

const scoreSchema = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Extension Risk Score",
  "description": "How ExtensionShield scores browser extension risk across security, privacy, and governance signals.",
  "about": ["extension risk assessment", "extension security scoring", "browser extension security"]
};

const ExtensionRiskScorePage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Extension Risk Score | Security, Privacy, Governance Scoring"
        description="Understand ExtensionShield's extension risk score: security, privacy, and governance scoring for browser extension risk assessment before install or allowlisting."
        pathname="/extension-risk-score"
        ogType="website"
        keywords="extension risk score, extension risk assessment, extension security scoring, extension trust analysis"
        schema={scoreSchema}
      />
      <div className="compare-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          <header className="compare-header">
            <h1>Extension Risk Score</h1>
            <p>
              A single score is useful only when the evidence is visible. ExtensionShield scores extensions across Security, Privacy, and Governance so every verdict can be traced back to concrete signals.
            </p>
          </header>

          <div className="compare-prose">
            <h2>What the score means</h2>
            <p>
              The ExtensionShield risk score summarizes the likelihood and impact of risky extension behavior. It is not a malware-only verdict. It combines what the extension can do, what the code appears to do, what the publisher discloses, and whether the extension fits a policy-controlled environment.
            </p>

            <h2>The three scoring layers</h2>
            <ul>
              <li><strong>Security - 40%:</strong> suspicious code patterns, SAST rules, vulnerable libraries, obfuscation, threat-intel findings, and exploit-relevant APIs.</li>
              <li><strong>Privacy - 35%:</strong> sensitive permissions, all-site access, cookies, history, clipboard, storage, network destinations, and data exfiltration paths.</li>
              <li><strong>Governance - 25%:</strong> policy alignment, permission justification, disclosure accuracy, developer reputation, update risk, and audit readiness.</li>
            </ul>

            <h2>Why this is different from a scanner score</h2>
            <p>
              A scanner can tell you that an extension requests broad permissions. A governance score explains whether that access is justified, whether behavior matches the listing, whether the evidence should trigger a block, and which finding should be fixed first.
            </p>

            <h2>How to use it</h2>
            <ol style={{ marginLeft: "1.25rem", marginBottom: "1rem" }}>
              <li>Scan the Chrome Web Store URL before install or allowlisting.</li>
              <li>Review the Security, Privacy, and Governance drivers instead of relying only on the number.</li>
              <li>Accept, block, monitor, or request a private build fix based on the evidence.</li>
            </ol>
          </div>

          <div className="compare-cta">
            <Link to="/scan">Get an extension risk score</Link>
          </div>

          <div className="compare-links">
            <h3>Related</h3>
            <ul>
              <li><Link to="/research/methodology">Full methodology</Link></li>
              <li><Link to="/extension-security">Browser extension security</Link></li>
              <li><Link to="/extension-governance">Extension governance</Link></li>
              <li><Link to="/chrome-extension-security-scanner">Chrome extension security scanner</Link></li>
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default ExtensionRiskScorePage;
