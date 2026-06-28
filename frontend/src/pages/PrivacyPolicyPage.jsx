import React, { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ArrowLeft,
  FileText,
  Database,
  Eye,
  Users,
  Lock,
  Shield,
  Cookie,
  Baby,
  RefreshCw,
  Mail,
  ChevronDown,
  UserCircle,
  Activity,
  Package,
} from "lucide-react";
import SEOHead from "../components/SEOHead";
import { Button } from "../components/ui/button";
import "./PrivacyPolicyPage.scss";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "ExtensionShield",
  "url": "https://extensionshield.com",
  "logo": "https://extensionshield.com/logo.png",
  "description": "Chrome extension scanner — safety reports in seconds.",
  "sameAs": ["https://github.com/ExtensionShield/ExtensionShield"]
};

const SECTION_IDS = {
  intro: "intro",
  information: "information",
  use: "use",
  sharing: "sharing",
  retention: "retention",
  security: "security",
  rights: "rights",
  cookies: "cookies",
  children: "children",
  changes: "changes",
  contact: "contact",
};

const PrivacyPolicyPage = () => {
  const { isAuthenticated } = useAuth();
  const [openSections, setOpenSections] = useState(() => new Set([SECTION_IDS.intro]));

  const toggleSection = useCallback((id) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isOpen = useCallback((id) => openSections.has(id), [openSections]);

  return (
    <>
      <SEOHead
        title="Privacy Policy | ExtensionShield"
        description="ExtensionShield Privacy Policy — Learn how we collect, use, and protect your data."
        pathname="/privacy-policy"
        schema={organizationSchema}
      />
      <div className="privacy-policy-page">
      <div className="page-container">
        <div className="page-header">
          {isAuthenticated && (
            <Link to="/settings" className="back-link">
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Settings</span>
            </Link>
          )}
          <h1 className="page-title">
            <FileText className="w-6 h-6" />
            Privacy Policy
          </h1>
          <p className="page-subtitle">
            Last updated: February 7, 2026
          </p>
        </div>

        <div className="privacy-content">
          {/* Introduction */}
          <div className="glass-card surface-card accordion-item" data-accordion-id={SECTION_IDS.intro}>
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.intro)}
              aria-expanded={isOpen(SECTION_IDS.intro)}
              aria-controls="accordion-intro"
              id="accordion-intro-heading"
            >
              <span className="accordion-header-left">
                <FileText className="section-icon" aria-hidden />
                <h2 className="section-title">Introduction</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.intro) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.intro) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-intro"
              role="region"
              aria-labelledby="accordion-intro-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.intro) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
                <p className="section-text">
                  ExtensionShield ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard information when you use our extension security scanning service (the "Service").
                </p>
              </div>
            </div>
          </div>

          {/* Information We Collect */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.information)}
              aria-expanded={isOpen(SECTION_IDS.information)}
              aria-controls="accordion-information"
              id="accordion-information-heading"
            >
              <span className="accordion-header-left">
                <Database className="section-icon" aria-hidden />
                <h2 className="section-title">Information We Collect</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.information) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.information) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-information"
              role="region"
              aria-labelledby="accordion-information-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.information) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <div className="section-content">
                <div className="subsection subsection-you-provide">
                  <h3 className="subsection-title">
                    <UserCircle className="subsection-icon" aria-hidden />
                    Information you provide
                  </h3>
                  <ul className="section-list">
                    <li>Extension URLs or IDs you submit for scanning</li>
                    <li>Account information (such as name and email) when you sign in</li>
                    <li>Feedback, support requests, or other communications you send us</li>
                  </ul>
                </div>
                <div className="subsection subsection-automatic">
                  <h3 className="subsection-title">
                    <Activity className="subsection-icon" aria-hidden />
                    Information collected automatically
                  </h3>
                  <ul className="section-list">
                    <li>Scan results and analysis data for extensions you scan</li>
                    <li>Usage analytics (such as page views and feature usage) to improve the Service</li>
                    <li>Technical information (such as browser type, IP address, device information, and log data)</li>
                    <li>Cookies and similar technologies used for authentication, security, and analytics</li>
                  </ul>
                </div>
                <div className="subsection subsection-extension">
                  <h3 className="subsection-title">
                    <Package className="subsection-icon" aria-hidden />
                    Extension data we analyze
                  </h3>
                  <p className="section-text">
                    When you scan a Chrome extension, we analyze information that is publicly available (for example, Chrome Web Store listings, manifests, permissions, and related metadata).
                  </p>
                  <p className="section-text">
                    We do not intentionally collect personal data from an extension's end users.
                  </p>
                  <p className="section-text">
                    If you use an Enterprise feature that involves uploading extension packages or files (if applicable), we process those files only to provide the requested analysis and protect the Service.
                  </p>
                </div>
              </div>
              </div>
            </div>
          </div>

          {/* How We Use Your Information */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.use)}
              aria-expanded={isOpen(SECTION_IDS.use)}
              aria-controls="accordion-use"
              id="accordion-use-heading"
            >
              <span className="accordion-header-left">
                <Eye className="section-icon" aria-hidden />
                <h2 className="section-title">How We Use Your Information</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.use) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.use) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-use"
              role="region"
              aria-labelledby="accordion-use-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.use) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text mb-4">We use information to:</p>
              <ul className="section-list">
                <li>Provide, operate, maintain, and improve the Service</li>
                <li>Process scan requests and generate reports</li>
                <li>Authenticate users and manage preferences</li>
                <li>Send notifications you enable (e.g., scan completion alerts)</li>
                <li>Understand usage and improve performance and user experience</li>
                <li>Comply with legal obligations and protect our rights and safety</li>
                <li>Communicate with you about updates, support, and Service-related messages</li>
              </ul>
              </div>
            </div>
          </div>

          {/* Data Sharing and Disclosure */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.sharing)}
              aria-expanded={isOpen(SECTION_IDS.sharing)}
              aria-controls="accordion-sharing"
              id="accordion-sharing-heading"
            >
              <span className="accordion-header-left">
                <Users className="section-icon" aria-hidden />
                <h2 className="section-title">Data Sharing and Disclosure</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.sharing) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.sharing) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-sharing"
              role="region"
              aria-labelledby="accordion-sharing-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.sharing) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <div className="section-content">
                <p className="section-text">
                  We do not sell your personal information.
                </p>
                <p className="section-text">
                  We may share information in limited circumstances:
                </p>
                <ul className="section-list">
                  <li><strong>Service Providers:</strong> vendors who help us run the Service (e.g., hosting, authentication, analytics, email delivery, error monitoring)</li>
                  <li><strong>Legal Requirements:</strong> if required by law, regulation, or legal process, or to protect rights and safety</li>
                  <li><strong>Business Transfers:</strong> in connection with a merger, acquisition, or sale of assets</li>
                <li><strong>With Your Consent:</strong> when you ask or explicitly agree</li>
              </ul>
            </div>
              </div>
            </div>
          </div>

          {/* Data Retention */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.retention)}
              aria-expanded={isOpen(SECTION_IDS.retention)}
              aria-controls="accordion-retention"
              id="accordion-retention-heading"
            >
              <span className="accordion-header-left">
                <Database className="section-icon" aria-hidden />
                <h2 className="section-title">Data Retention</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.retention) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.retention) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-retention"
              role="region"
              aria-labelledby="accordion-retention-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.retention) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text">
                We retain personal information only as long as necessary for the purposes described in this policy, including to provide the Service, comply with legal obligations, resolve disputes, and enforce agreements.
              </p>
              <p className="section-text mt-4">
                Typical examples:
              </p>
              <ul className="section-list">
                <li>Account data is kept until you delete your account (subject to legal requirements).</li>
                <li>Scan history and logs may be retained for a limited period for security, debugging, and abuse prevention.</li>
              </ul>
              </div>
            </div>
          </div>

          {/* Data Security */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.security)}
              aria-expanded={isOpen(SECTION_IDS.security)}
              aria-controls="accordion-security"
              id="accordion-security-heading"
            >
              <span className="accordion-header-left">
                <Lock className="section-icon" aria-hidden />
                <h2 className="section-title">Data Security</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.security) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.security) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-security"
              role="region"
              aria-labelledby="accordion-security-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.security) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text">
                We use reasonable technical and organizational measures designed to protect information. However, no method of transmission or storage is 100% secure, and we cannot guarantee absolute security.
              </p>
              </div>
            </div>
          </div>

          {/* Your Rights and Choices */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.rights)}
              aria-expanded={isOpen(SECTION_IDS.rights)}
              aria-controls="accordion-rights"
              id="accordion-rights-heading"
            >
              <span className="accordion-header-left">
                <Shield className="section-icon" aria-hidden />
                <h2 className="section-title">Your Rights and Choices</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.rights) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.rights) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-rights"
              role="region"
              aria-labelledby="accordion-rights-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.rights) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text mb-4">
                Depending on your location, you may have rights regarding your personal information, such as:
              </p>
              <ul className="section-list">
                <li>Access, correction, deletion</li>
                <li>Portability</li>
                <li>Objection or restriction of certain processing</li>
                <li>Withdrawal of consent (where applicable)</li>
              </ul>
              <p className="section-text mt-4">
                You can also opt out of non-essential marketing emails by using the unsubscribe link (if provided) or contacting us.
              </p>
              <p className="section-text mt-4">
                To exercise rights, contact us using the details below.
              </p>
              </div>
            </div>
          </div>

          {/* Cookies and Similar Technologies */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.cookies)}
              aria-expanded={isOpen(SECTION_IDS.cookies)}
              aria-controls="accordion-cookies"
              id="accordion-cookies-heading"
            >
              <span className="accordion-header-left">
                <Cookie className="section-icon" aria-hidden />
                <h2 className="section-title">Cookies and Similar Technologies</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.cookies) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.cookies) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-cookies"
              role="region"
              aria-labelledby="accordion-cookies-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.cookies) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text">
                We use cookies and similar technologies to operate the Service, keep you signed in, enhance security, and understand usage. You can control cookies through your browser settings, but some features may not function properly if cookies are disabled.
              </p>
              </div>
            </div>
          </div>

          {/* Children's Privacy */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.children)}
              aria-expanded={isOpen(SECTION_IDS.children)}
              aria-controls="accordion-children"
              id="accordion-children-heading"
            >
              <span className="accordion-header-left">
                <Baby className="section-icon" aria-hidden />
                <h2 className="section-title">Children's Privacy</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.children) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.children) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-children"
              role="region"
              aria-labelledby="accordion-children-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.children) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text">
                The Service is not intended for children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child has provided personal information, contact us and we will take appropriate steps to delete it.
              </p>
              </div>
            </div>
          </div>

          {/* Changes to This Privacy Policy */}
          <div className="glass-card surface-card accordion-item">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.changes)}
              aria-expanded={isOpen(SECTION_IDS.changes)}
              aria-controls="accordion-changes"
              id="accordion-changes-heading"
            >
              <span className="accordion-header-left">
                <RefreshCw className="section-icon" aria-hidden />
                <h2 className="section-title">Changes to This Privacy Policy</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.changes) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.changes) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-changes"
              role="region"
              aria-labelledby="accordion-changes-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.changes) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <p className="section-text">
                We may update this Privacy Policy from time to time. We will post the updated version on this page and update the "Last updated" date.
              </p>
              </div>
            </div>
          </div>

          {/* Contact Us */}
          <div className="glass-card surface-card accordion-item contact-card">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection(SECTION_IDS.contact)}
              aria-expanded={isOpen(SECTION_IDS.contact)}
              aria-controls="accordion-contact"
              id="accordion-contact-heading"
            >
              <span className="accordion-header-left">
                <Mail className="section-icon" aria-hidden />
                <h2 className="section-title">Contact Us</h2>
              </span>
              <span className="accordion-toggle" aria-hidden>
                <ChevronDown className={`accordion-chevron ${isOpen(SECTION_IDS.contact) ? "open" : ""}`} />
                <span className="accordion-toggle-label">{isOpen(SECTION_IDS.contact) ? "Collapse" : "Expand"}</span>
              </span>
            </button>
            <div
              id="accordion-contact"
              role="region"
              aria-labelledby="accordion-contact-heading"
              className={`accordion-body ${isOpen(SECTION_IDS.contact) ? "open" : ""}`}
            >
              <div className="accordion-body-inner">
              <div className="contact-info">
                <p className="section-text">
                  <strong>For privacy questions or data requests:</strong>{" "}
                  <a href="mailto:privacy@extensionshield.com" className="contact-link">
                    privacy@extensionshield.com
                  </a>
                </p>
                <p className="section-text">
                  <strong>For general support:</strong>{" "}
                  <a href="mailto:support@extensionshield.com" className="contact-link">
                    support@extensionshield.com
                  </a>
                </p>
              </div>
              </div>
            </div>
          </div>

          {isAuthenticated && (
            <div className="back-button-container">
              <Link to="/settings">
                <Button variant="outline" className="back-button">
                  <ArrowLeft className="w-4 h-4" />
                  Back to Settings
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
};

export default PrivacyPolicyPage;
