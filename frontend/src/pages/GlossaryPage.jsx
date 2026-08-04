import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import SEOHead from "../components/SEOHead";
import "./GlossaryPage.scss";

const GlossaryPage = () => {
  const glossaryTerms = [
    {
      term: "Extension Permissions",
      definition: "Browser extension permissions are capabilities that extensions request to access user data or browser features. Common permissions include access to browsing history, tabs, cookies, and the ability to read or modify web pages.",
      relatedTerms: ["MV3", "Service Worker", "Risk Score"]
    },
    {
      term: "MV3 (Manifest V3)",
      definition: "Manifest V3 is the latest version of Chrome's extension manifest format. It introduces stricter security policies, replaces background pages with service workers, and limits the use of certain APIs to improve security and performance.",
      relatedTerms: ["Service Worker", "Extension Permissions"]
    },
    {
      term: "Service Worker",
      definition: "A service worker is a JavaScript file that runs in the background of a browser extension. In Manifest V3, service workers replace background pages and handle extension events, but they are more limited and ephemeral than background pages.",
      relatedTerms: ["MV3", "Extension Permissions"]
    },
    {
      term: "Risk Score",
      definition: "The extension risk score is a numerical rating (typically 0-100) that indicates the overall security risk of a Chrome extension. It's calculated based on multiple factors including code analysis, permission requests, threat intelligence, and compliance signals.",
      relatedTerms: ["SAST", "Threat Intelligence", "Privacy Signals"]
    },
    {
      term: "Governance",
      definition: "Extension governance refers to the policies, processes, and controls that organizations use to manage browser extensions across their workforce. This includes allow/block lists, policy enforcement, compliance monitoring, and audit reporting.",
      relatedTerms: ["Compliance Signals", "Risk Score"]
    },
    {
      term: "SAST (Static Application Security Testing)",
      definition: "SAST is a security analysis technique that examines source code or compiled code without executing it. ExtensionShield uses SAST to detect vulnerabilities, suspicious patterns, and potential security issues in extension code.",
      relatedTerms: ["Risk Score", "Threat Intelligence"]
    },
    {
      term: "Threat Intelligence",
      definition: "Threat intelligence involves gathering and analyzing information about potential security threats. For extensions, this includes malware detection, known malicious patterns, and reputation data from sources like VirusTotal.",
      relatedTerms: ["SAST", "Risk Score", "Privacy Signals"]
    },
    {
      term: "Privacy Signals",
      definition: "Privacy signals are indicators that suggest how an extension handles user privacy. These include data collection practices, tracking-related capability, third-party destinations referenced in code, and compliance with privacy regulations like GDPR or CCPA.",
      relatedTerms: ["Compliance Signals", "Risk Score", "Threat Intelligence"]
    },
    {
      term: "Compliance Signals",
      definition: "Compliance signals indicate whether an extension meets specific regulatory or organizational requirements. This includes checks for data protection regulations, security standards, and governance policies.",
      relatedTerms: ["Privacy Signals", "Governance", "Risk Score"]
    }
  ];

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://extensionshield.com/"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Glossary",
        "item": "https://extensionshield.com/glossary"
      }
    ]
  };

  return (
    <>
      <SEOHead
        title="Browser Extension Security Glossary"
        description="Learn extension security terms: permissions, MV3, service workers, risk scores, governance, SAST, threat intelligence, privacy signals, and compliance."
        pathname="/glossary"
        ogType="website"
        schema={breadcrumbSchema}
      />
      <div className="glossary-page">
        <div className="glossary-content">
          <header className="glossary-header">
            <h1>Browser Extension Security Glossary</h1>
            <p>
              Understand key terms and concepts related to Chrome extension security, 
              risk assessment, and governance.
            </p>
          </header>

          <div className="glossary-terms">
            {glossaryTerms.map((item, index) => (
              <div key={index} className="glossary-term" id={item.term.toLowerCase().replace(/\s+/g, '-')}>
                <h2 className="term-title">{item.term}</h2>
                <p className="term-definition">{item.definition}</p>
                {item.relatedTerms && item.relatedTerms.length > 0 && (
                  <div className="term-related">
                    <span className="related-label">Related:</span>
                    <div className="related-terms">
                      {item.relatedTerms.map((related, idx) => (
                        <Link
                          key={idx}
                          to={`/glossary#${related.toLowerCase().replace(/\s+/g, '-')}`}
                          className="related-link"
                        >
                          {related}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="glossary-cta">
            <h3>Ready to scan an extension?</h3>
            <p>Use ExtensionShield to analyze any Chrome extension for security risks.</p>
            <Link to="/scan" className="cta-button">
              Scan Extension Now
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default GlossaryPage;

