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

    </div>
  );
}
