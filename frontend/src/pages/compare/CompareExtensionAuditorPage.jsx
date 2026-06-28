import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./ComparePage.scss";

const CompareExtensionAuditorPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="ExtensionShield vs ExtensionAuditor | Chrome Extension Security Comparison"
        description="ExtensionShield vs ExtensionAuditor: compare chrome extension security scanners. Risk score, permissions checker, governance, and audit chrome extension security for enterprise."
        pathname="/compare/extension-auditor"
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
            <h1>ExtensionShield vs ExtensionAuditor</h1>
            <p>
              ExtensionAuditor is a privacy-focused browser extension scanner with on-device processing. Here’s how ExtensionShield compares for chrome extension risk score, extension security analysis, and enterprise extension governance.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              Based on its public docs as of June 2026, <strong>ExtensionAuditor</strong> offers real-time permission analysis, color-coded risk, review sentiment, and CSV export. It runs as a browser extension (Chrome, Edge, Opera, Brave) and processes data on-device. ExtensionShield takes a different approach: it publishes its scoring weights and methodology (scoring/weights.py) and adds Semgrep SAST, VirusTotal hash lookups, and a governance layer.
            </p>
            <p>
              <strong>ExtensionShield</strong> delivers a <strong>chrome extension risk score</strong> (0–100) with three documented, near-equally weighted layers: Security (34%), Privacy (33%), and Governance (33%) — plus hard gates that override the score to BLOCK severe findings. We combine a <strong>chrome extension permissions checker</strong> with SAST (Semgrep), VirusTotal, obfuscation detection, and a dedicated governance layer — so you can <strong>audit chrome extension security</strong> and inform <strong>extension governance</strong> decisions. Each finding includes evidence you can use to support a security review.
            </p>
            <ul>
              <li>Transparent three-layer scoring and methodology</li>
              <li>SAST + VirusTotal + chrome extension privacy scanner</li>
              <li>Governance layer for compliance and policy</li>
              <li>Web app: no extension install required to scan</li>
            </ul>
            <p>
              Try ExtensionShield to <strong>scan chrome extension for malware</strong>, get a <strong>chrome extension risk score</strong>, and <strong>check if a chrome extension is safe</strong> before installing.
            </p>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Compare chrome extension security scanners</Link></li>
              <li><Link to="/compare/crxcavator">ExtensionShield vs CRXcavator</Link></li>
              <li><Link to="/compare/crxplorer">ExtensionShield vs CRXplorer</Link></li>
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

export default CompareExtensionAuditorPage;
