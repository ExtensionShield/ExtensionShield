import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { useAuth } from "../../context/AuthContext";
import PrivateBuildDropzone from "../../components/PrivateBuildDropzone";
import PrivateBuildTrustPills from "../../components/PrivateBuildTrustPills";
import "./ScanUploadPage.scss";

const isDev = import.meta.env.DEV;

export default function ScanUploadPage() {
  const { isAuthenticated, openSignInModal } = useAuth();

  const canUpload = isDev || isAuthenticated;
  const showSignInOverlay = !isDev && !isAuthenticated;

  return (
    <div className="scan-upload-page">
      <SEOHead
        title="Scan a CRX File — Pre-release Chrome Extension Security Audit (Pro) | ExtensionShield"
        description="Scan a CRX or ZIP file for a pre-release Chrome extension security audit: SAST, permissions, network indicators, and policy checks — with evidence for every finding. Private by default."
        pathname="/scan/upload"
      />
      <section className="scan-upload-hero" aria-label="Private build upload">
        <div className="scan-upload-content">
          {/* 3-step indicator: 1 Upload → 2 Scan → 3 Report */}
          <nav className="scan-upload-steps" aria-label="Scan progress">
            <div className="scan-upload-steps__step scan-upload-steps__step--active">
              <span className="scan-upload-steps__circle" aria-hidden>1</span>
              <span className="scan-upload-steps__label">Upload</span>
            </div>
            <span className="scan-upload-steps__connector" aria-hidden />
            <div className="scan-upload-steps__step">
              <span className="scan-upload-steps__circle" aria-hidden>2</span>
              <span className="scan-upload-steps__label">Scan</span>
            </div>
            <span className="scan-upload-steps__connector" aria-hidden />
            <div className="scan-upload-steps__step">
              <span className="scan-upload-steps__circle" aria-hidden>3</span>
              <span className="scan-upload-steps__label">Report</span>
            </div>
          </nav>

          <p className="scan-upload-kicker">Pro • Private Build Audit</p>
          <h1 className="scan-upload-headline">Pre-release Chrome Extension Audit</h1>
          <p className="scan-upload-subhead">
            Find vulnerabilities, risky permissions, policy violations, and suspicious network behavior—each with evidence + fix guidance.
          </p>

          <div className="scan-upload-dropzone-wrap">
            {showSignInOverlay && (
              <div className="scan-upload-gate scan-upload-gate--signin">
                <p className="scan-upload-gate__text">Login required</p>
                <button type="button" className="action-signin scan-upload-gate__btn" onClick={openSignInModal}>
                  Sign In
                </button>
                <p className="scan-upload-gate__secondary">
                  <Link to="/scan">Or run a free extension risk check →</Link>
                </p>
              </div>
            )}
            <PrivateBuildDropzone disabled={!canUpload} />
          </div>

          <ul className="scan-upload-feature-strip" aria-label="Pro audit includes">
            <li>SAST checks</li>
            <li>Permission / host risk</li>
            <li>Network indicators + reputation</li>
            <li>Policy & governance checks</li>
          </ul>

          <PrivateBuildTrustPills />

          <p className="scan-upload-privacy">Reports are visible only to your account.</p>
        </div>
      </section>

      {/* Crawlable, indexable explainer — gives this page real content for the
          "scan crx file" / "audit extension before publishing" intent. The upload
          action above is auth-gated; this section is public. */}
      <section className="scan-upload-learn" aria-label="About scanning a CRX file" style={{ maxWidth: 760, margin: "0 auto", padding: "0 1.5rem 4rem", lineHeight: 1.65 }}>
        <h2>What scanning a CRX file checks</h2>
        <p>
          When you scan a <strong>CRX or ZIP file</strong> with ExtensionShield, it unpacks the
          package and analyzes the build you’re about to ship — not just the Chrome Web Store
          listing — across the same three layers as a public scan: Security, Privacy, and
          Governance. Every finding links to the evidence behind it, and the scoring method is
          open source.
        </p>
        <ul>
          <li>Static analysis (SAST) of the bundled JavaScript for risky APIs, obfuscation, and malware patterns</li>
          <li>Declared vs. used permissions and host access</li>
          <li>Network endpoints and data-exfiltration indicators</li>
          <li>Manifest, policy, and governance checks</li>
        </ul>

        <h2>CRX vs. ZIP — which do I upload?</h2>
        <p>
          A <strong>.crx</strong> is the packaged Chrome extension; a <strong>.zip</strong> is the
          unpacked build you submit to the Chrome Web Store. ExtensionShield accepts either, so you
          can audit a build <em>before</em> you publish it and catch issues a reviewer (or an
          attacker) would.
        </p>

        <h2>When to use it</h2>
        <p>
          Developers auditing a release candidate, security teams reviewing a vendor-supplied
          package, and researchers analyzing a sample. Uploads are <strong>private by default</strong> —
          scoped to your account and excluded from the public feed — and require a free account. To
          check an already-published extension without uploading, paste its Web Store URL into the{" "}
          <Link to="/scan">free scanner</Link> instead.
        </p>

        <p className="scan-upload-learn-links">
          Related: <Link to="/blog/audit-crx-zip-before-release">How to audit a CRX/ZIP before release</Link>{" "}
          · <Link to="/research/methodology">how we score</Link>{" "}
          · <Link to="/chrome-extension-security-scanner">Chrome extension security scanner</Link>
        </p>
      </section>
    </div>
  );
}
