import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "./ComparePage.scss";

const CompareCrxplorerPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="ExtensionShield vs CRXplorer | Chrome Extension Security Scanner Comparison"
        description="ExtensionShield vs CRXplorer: compare chrome extension security scanners. Transparent risk score, SAST, VirusTotal, and extension governance vs AI-only scoring."
        pathname="/compare/crxplorer"
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
            <h1>ExtensionShield vs CRXplorer</h1>
            <p>
              CRXplorer is a free Chrome extension security scanner with AI-powered risk scoring. Here’s how ExtensionShield compares for chrome extension risk score, audit chrome extension security, and extension security analysis.
            </p>
          </header>

          <div className="compare-prose">
            <p>
              <strong>CRXplorer</strong> offers a single risk score, full source code viewer, and fast results. Its AI reads the code to produce a score, but the methodology and weights are not fully transparent. It does not document SAST, VirusTotal, or a dedicated governance/compliance layer.
            </p>
            <p>
              <strong>ExtensionShield</strong> provides a <strong>chrome extension risk score</strong> (0–100) with three documented layers: Security (40%), Privacy (35%), and Governance (25%). We use Semgrep SAST, VirusTotal, obfuscation detection, and ChromeStats — plus a dedicated governance layer for ToS alignment and disclosure — so you can <strong>check if a chrome extension is safe</strong> with evidence you can cite. Ideal for <strong>browser extension security audit</strong> and <strong>extension risk assessment</strong>.
            </p>
            <ul>
              <li>Transparent three-layer scoring (Security / Privacy / Governance)</li>
              <li>SAST (Semgrep) and VirusTotal integration</li>
              <li>Chrome extension permissions checker and privacy scanner</li>
              <li>Governance and compliance signals for enterprise</li>
            </ul>
            <p>
              Use ExtensionShield to <strong>scan chrome extension for malware</strong> and get a clear, auditable <strong>chrome extension risk score</strong>.
            </p>
          </div>

          <div className="compare-links">
            <h3>More comparisons</h3>
            <ul>
              <li><Link to="/compare">Best chrome extension security scanner</Link></li>
              <li><Link to="/compare/crxcavator">ExtensionShield vs CRXcavator</Link></li>
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

export default CompareCrxplorerPage;
