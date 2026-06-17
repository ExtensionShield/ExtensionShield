import React from "react";
import { Navigate, useParams } from "react-router-dom";
import GlossaryPage from "../pages/GlossaryPage";

// Lazy load pages for better code splitting
const HomePage = React.lazy(() => import("../pages/HomePage"));
const ScannerPage = React.lazy(() => import("../pages/scanner/ScannerPage"));
const ScanUploadPage = React.lazy(() => import("../pages/scanner/ScanUploadPage"));
const ScanProgressPage = React.lazy(() => import("../pages/scanner/ScanProgressPage"));
const ScanResultsPageV2 = React.lazy(() => import("../pages/scanner/ScanResultsPageV2"));
const ScanHistoryPage = React.lazy(() => import("../pages/ScanHistoryPage"));
const EnterprisePage = React.lazy(() => import("../pages/EnterprisePage"));
const SettingsPage = React.lazy(() => import("../pages/SettingsPage"));
const PrivacyPolicyPage = React.lazy(() => import("../pages/PrivacyPolicyPage"));
const AuthCallbackPage = React.lazy(() => import("../pages/auth/AuthCallbackPage"));
const AuthDiagnosticsPage = React.lazy(() => import("../pages/auth/AuthDiagnosticsPage"));

// Research Pages
const ResearchPage = React.lazy(() => import("../pages/research/ResearchPage"));
const MethodologyPage = React.lazy(() => import("../pages/research/MethodologyPage"));
const CaseStudiesPage = React.lazy(() => import("../pages/research/CaseStudiesPage"));
const HoneyCaseStudyPage = React.lazy(() => import("../pages/research/HoneyCaseStudyPage"));
const PdfConvertersCaseStudyPage = React.lazy(() => import("../pages/research/PdfConvertersCaseStudyPage"));
const FakeAdBlockersCaseStudyPage = React.lazy(() => import("../pages/research/FakeAdBlockersCaseStudyPage"));
const BenchmarksPage = React.lazy(() => import("../pages/research/BenchmarksPage"));

// GSoC / Open Source Pages
const GSoCIdeasPage = React.lazy(() => import("../pages/gsoc/GSoCIdeasPage"));
const ContributePage = React.lazy(() => import("../pages/gsoc/ContributePage"));
const CommunityLandingPage = React.lazy(() => import("../pages/community/CommunityLandingPage"));
const OpenSourcePage = React.lazy(() => import("../pages/open-source/OpenSourcePage"));
const OpenSourceProgramsPage = React.lazy(() => import("../pages/open-source/OpenSourceProgramsPage"));
const AboutUsPage = React.lazy(() => import("../pages/AboutUsPage"));

// Compare pages (SEO: best scanner, CRXcavator alternatives)
const CompareIndexPage = React.lazy(() => import("../pages/compare/CompareIndexPage"));
const CompareCrxcavatorPage = React.lazy(() => import("../pages/compare/CompareCrxcavatorPage"));
const CompareCrxplorerPage = React.lazy(() => import("../pages/compare/CompareCrxplorerPage"));
const CompareExtensionAuditorPage = React.lazy(() => import("../pages/compare/CompareExtensionAuditorPage"));
const CompareSpinAiPage = React.lazy(() => import("../pages/compare/CompareSpinAiPage"));

// SEO keyword landing pages (high-intent) + educational hub
const FreeExtensionScannerPage = React.lazy(() => import("../pages/landing/FreeExtensionScannerPage"));
const IsThisChromeExtensionSafePage = React.lazy(() => import("../pages/landing/IsThisChromeExtensionSafePage"));
const ChromeExtensionPermissionsPage = React.lazy(() => import("../pages/landing/ChromeExtensionPermissionsPage"));
const ChromeExtensionSecurityScannerPage = React.lazy(() => import("../pages/landing/ChromeExtensionSecurityScannerPage"));
const BrowserExtensionRiskAssessmentPage = React.lazy(() => import("../pages/landing/BrowserExtensionRiskAssessmentPage"));
const CrxcavatorAlternativePage = React.lazy(() => import("../pages/landing/CrxcavatorAlternativePage"));
const ExtensionSecurityPage = React.lazy(() => import("../pages/landing/ExtensionSecurityPage"));
const ExtensionRiskScorePage = React.lazy(() => import("../pages/landing/ExtensionRiskScorePage"));
const ExtensionPermissionsPage = React.lazy(() => import("../pages/landing/ExtensionPermissionsPage"));
const ExtensionGovernancePage = React.lazy(() => import("../pages/landing/ExtensionGovernancePage"));

// Blog (SEO long-tail)
const BlogIndexPage = React.lazy(() => import("../pages/blog/BlogIndexPage"));
const BlogPostPage = React.lazy(() => import("../pages/blog/BlogPostPage"));

// Careers
const CareersPage = React.lazy(() => import("../pages/careers/CareersPage"));
const CareersApplyPage = React.lazy(() => import("../pages/careers/CareersApplyPage"));

// Redirect /extension/:id to /scan/results/:id (extension route removed)
const RedirectExtensionToScanResults = () => {
  const { extensionId } = useParams();
  return <Navigate to={`/scan/results/${encodeURIComponent(extensionId || "")}`} replace />;
};

// Report detail (individual report view)
const ReportDetailPage = React.lazy(() => import("../pages/reports/ReportDetailPage"));

// Dev / Debug (not in nav)
const ThemeDebugPage = React.lazy(() => import("../pages/debug/ThemeDebugPage"));

/**
 * Route Configuration
 * 
 * Each route object can have:
 * - path: string (required)
 * - element: React component (required)
 * - seo: { title, description, canonical } (optional, for sitemap generation)
 * - priority: number 0-1 (optional, for sitemap)
 * - changefreq: string (optional, for sitemap)
 */
export const routes = [
  // ============ CORE ROUTES ============
  {
    path: "/",
    element: <HomePage />,
    seo: {
      title: "Free Chrome Extension Scanner — Security, Privacy & Risk Score | ExtensionShield",
      description: "Free Chrome extension scanner. Paste a Web Store URL to check permissions, privacy risks, malware signals, and a 0–100 risk score before you install—no signup. Open-source security & governance.",
      canonical: "/"
    },
    priority: 1.0,
    changefreq: "weekly"
  },

  // ============ SCAN ROUTES ============
  {
    path: "/scan",
    element: <ScannerPage />,
    seo: {
      title: "Is This Chrome Extension Safe? Free Extension Risk Check | ExtensionShield",
      description: "Free extension risk check by Chrome Web Store URL. Get risk score, permissions, privacy and governance signals. See if a Chrome extension is safe before you install.",
      canonical: "/scan"
    },
    priority: 0.9,
    changefreq: "weekly"
  },
  {
    path: "/scan/upload",
    element: <ScanUploadPage />,
    seo: {
      title: "Chrome Extension Security Audit (CRX/ZIP) — Pre-release Build Scan (Pro) | ExtensionShield",
      description: "Private CRX/ZIP upload for pre-release Chrome extension security audit. Vulnerabilities, evidence per finding, fix guidance. SAST, permissions, policy checks. Private by default.",
      canonical: "/scan/upload"
    },
    priority: 0.8,
    changefreq: "weekly"
  },
  {
    path: "/scan/history",
    element: <ScanHistoryPage />,
    seo: {
      title: "Chrome Extension Scan History | ExtensionShield",
      description: "View your Chrome extension scan history and past security reports. Track extension risk assessments and security audits.",
      canonical: "/scan/history"
    },
    priority: 0.7,
    changefreq: "weekly"
  },
  {
    path: "/scan/progress/:scanId",
    element: <ScanProgressPage />
  },
  {
    path: "/scan/results/:scanId",
    element: <ScanResultsPageV2 />
  },

  // /extension/:id → scan results (backward compatibility)
  {
    path: "/extension/:extensionId",
    element: <RedirectExtensionToScanResults />
  },
  {
    path: "/extension/:extensionId/version/:buildHash",
    element: <RedirectExtensionToScanResults />
  },

  // ============ RESEARCH ROUTES ============
  {
    path: "/research",
    element: <ResearchPage />,
    seo: {
      title: "Extension Threat Research & Case Studies | ExtensionShield",
      description: "In-depth security research on Chrome extension threats, malware analysis, and case studies.",
      canonical: "/research"
    },
    priority: 0.8,
    changefreq: "weekly"
  },
  {
    path: "/research/case-studies",
    element: <CaseStudiesPage />,
    seo: {
      title: "Extension Security Case Studies | ExtensionShield",
      description: "Real-world case studies of malicious Chrome extensions.",
      canonical: "/research/case-studies"
    },
    priority: 0.8,
    changefreq: "weekly"
  },
  {
    path: "/research/case-studies/honey",
    element: <HoneyCaseStudyPage />,
    seo: {
      title: "Honey Extension Case Study | ExtensionShield",
      description: "Reported analysis of PayPal's Honey extension: alleged affiliate link hijacking, shopping tracking, and disputed savings claims.",
      canonical: "/research/case-studies/honey"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/case-studies/pdf-converters",
    element: <PdfConvertersCaseStudyPage />,
    seo: {
      title: "PDF Converter Extensions Data Harvesting Case Study | ExtensionShield",
      description: "Chrome extension security case study: malicious PDF converter extensions that harvest document contents and user data. Enterprise extension risk.",
      canonical: "/research/case-studies/pdf-converters"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/case-studies/fake-ad-blockers",
    element: <FakeAdBlockersCaseStudyPage />,
    seo: {
      title: "Fake Ad Blocker Extensions Case Study | ExtensionShield",
      description: "Chrome extension malware case study: fake ad blockers that inject ads. 20M–80M+ users affected. Extension security research for enterprises.",
      canonical: "/research/case-studies/fake-ad-blockers"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/methodology",
    element: <MethodologyPage />,
    seo: {
      title: "Chrome Extension Risk Score & Security Analysis Methodology | ExtensionShield",
      description: "How we calculate chrome extension risk score: static analysis, threat intelligence, and extension security analysis. Transparent methodology for auditing chrome extension security.",
      canonical: "/research/methodology"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/research/benchmarks",
    element: <BenchmarksPage />,
    seo: {
      title: "Benchmarks & Industry Trends | ExtensionShield",
      description: "Transparent metrics: coverage, disagreement, speed, and governance/privacy signals. Open, reproducible comparisons across scanners.",
      canonical: "/research/benchmarks"
    },
    priority: 0.7,
    changefreq: "monthly"
  },

  // ============ SEO KEYWORD LANDING PAGES + EDUCATIONAL HUB ============
  {
    path: "/free-extension-scanner",
    element: <FreeExtensionScannerPage />,
    seo: {
      title: "Free Chrome Extension Scanner — Check Any Extension | ExtensionShield",
      description: "Free Chrome extension scanner. Paste a Web Store URL to check permissions, privacy risks, malware signals, and a 0–100 risk score before you install. No signup. Open-source.",
      canonical: "/free-extension-scanner"
    },
    priority: 0.95,
    changefreq: "weekly"
  },
  {
    path: "/is-this-chrome-extension-safe",
    element: <IsThisChromeExtensionSafePage />,
    seo: {
      title: "Is This Chrome Extension Safe? | ExtensionShield",
      description: "How to tell if a Chrome extension is safe: check permissions, network access, and updates. A simple guide and free scanner to see risk before you install.",
      canonical: "/is-this-chrome-extension-safe"
    },
    priority: 0.9,
    changefreq: "monthly"
  },
  {
    path: "/chrome-extension-permissions",
    element: <ChromeExtensionPermissionsPage />,
    seo: {
      title: "Chrome Extension Permissions Explained | What to Allow | ExtensionShield",
      description: "Understand Chrome extension permissions: which are risky, red flags to watch, and how to review before you install. Plus a free scanner to check any extension.",
      canonical: "/chrome-extension-permissions"
    },
    priority: 0.85,
    changefreq: "monthly"
  },
  {
    path: "/chrome-extension-security-scanner",
    element: <ChromeExtensionSecurityScannerPage />,
    seo: {
      title: "Chrome Extension Security Scanner | Free Scan & Risk Score | ExtensionShield",
      description: "Free Chrome extension scanner and security audit. Scan any extension for malware, risk score, permissions & threats in under 60 seconds. For developers: audit extensions before release.",
      canonical: "/chrome-extension-security-scanner"
    },
    priority: 0.85,
    changefreq: "monthly"
  },
  {
    path: "/extension-security",
    element: <ExtensionSecurityPage />,
    seo: {
      title: "Browser Extension Security | Open-Source Extension Governance",
      description: "Browser extension security platform for pre-install risk assessment, private CRX/ZIP audits, and enterprise extension governance.",
      canonical: "/extension-security"
    },
    priority: 0.9,
    changefreq: "monthly"
  },
  {
    path: "/extension-risk-score",
    element: <ExtensionRiskScorePage />,
    seo: {
      title: "Extension Risk Score | Security, Privacy, Governance Scoring",
      description: "Understand ExtensionShield's extension risk score: security, privacy, and governance scoring for browser extension risk assessment.",
      canonical: "/extension-risk-score"
    },
    priority: 0.85,
    changefreq: "monthly"
  },
  {
    path: "/extension-permissions",
    element: <ExtensionPermissionsPage />,
    seo: {
      title: "Browser Extension Permissions Explained | Dangerous Permissions",
      description: "Browser extension permissions explained: all-site access, cookies, history, clipboard, webRequest, scripting, and permission combinations.",
      canonical: "/extension-permissions"
    },
    priority: 0.85,
    changefreq: "monthly"
  },
  {
    path: "/extension-governance",
    element: <ExtensionGovernancePage />,
    seo: {
      title: "Extension Governance Platform | Browser Extension Compliance",
      description: "Extension governance platform for browser extension compliance, allow/block decisions, update monitoring, policy evidence, and pre-install risk assessment.",
      canonical: "/extension-governance"
    },
    priority: 0.9,
    changefreq: "monthly"
  },
  {
    path: "/browser-extension-risk-assessment",
    element: <BrowserExtensionRiskAssessmentPage />,
    seo: {
      title: "Browser Extension Risk Assessment | Enterprise Extension Security | ExtensionShield",
      description: "Browser extension risk assessment for enterprises: govern extensions, enforce allowlists, and get audit-ready reports. Extension security and compliance monitoring at scale.",
      canonical: "/browser-extension-risk-assessment"
    },
    priority: 0.8,
    changefreq: "monthly"
  },
  {
    path: "/crxcavator-alternative",
    element: <CrxcavatorAlternativePage />,
    seo: {
      title: "CRXcavator Alternative | Chrome Extension Risk Score & Security | ExtensionShield",
      description: "Looking for a CRXcavator alternative? Compare Chrome extension risk scoring, SAST, private build audits, and governance evidence with ExtensionShield.",
      canonical: "/crxcavator-alternative"
    },
    priority: 0.8,
    changefreq: "monthly"
  },

  // ============ COMPARE ROUTES (SEO: best scanner, alternatives) ============
  {
    path: "/compare",
    element: <CompareIndexPage />,
    seo: {
      title: "Best Browser Extension Security Tools | Scanner & Governance Comparison",
      description: "Compare browser extension security tools. ExtensionShield vs Spin.ai, CRXcavator, CRXplorer, and Extension Auditor for risk scoring, governance, and audits.",
      canonical: "/compare"
    },
    priority: 0.8,
    changefreq: "monthly"
  },
  {
    path: "/compare/crxcavator",
    element: <CompareCrxcavatorPage />,
    seo: {
      title: "CRXcavator Alternative | CRXcavator vs ExtensionShield",
      description: "Compare CRXcavator and ExtensionShield for Chrome extension risk scores, permission analysis, SAST, pre-install scanning, private CRX/ZIP audits, and governance evidence.",
      canonical: "/compare/crxcavator"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/compare/crxplorer",
    element: <CompareCrxplorerPage />,
    seo: {
      title: "CRXplorer Alternative | CRXplorer vs ExtensionShield",
      description: "Compare CRXplorer and ExtensionShield for Chrome extension security analysis, risk scores, code review, pre-install scanning, private audits, and governance workflows.",
      canonical: "/compare/crxplorer"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/compare/extension-auditor",
    element: <CompareExtensionAuditorPage />,
    seo: {
      title: "Extension Auditor Alternative | Extension Auditor vs ExtensionShield",
      description: "Compare Extension Auditor and ExtensionShield for browser extension security, risk scores, permission analysis, monitoring, API workflows, private audits, and governance.",
      canonical: "/compare/extension-auditor"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/compare/spin-ai",
    element: <CompareSpinAiPage />,
    seo: {
      title: "Spin.ai vs ExtensionShield | Browser Extension Security Comparison",
      description: "Compare Spin.ai SpinMonitor and SpinCRX with ExtensionShield for browser extension security, governance, pre-install scanning, open-source trust, and private build audits.",
      canonical: "/compare/spin-ai"
    },
    priority: 0.7,
    changefreq: "monthly"
  },

  // ============ CAREERS ROUTES ============
  {
    path: "/careers",
    element: <CareersPage />,
    seo: {
      title: "Careers | ExtensionShield",
      description: "Join ExtensionShield. We're building the security, privacy, and governance layer for browser extensions. View open roles and apply.",
      canonical: "/careers"
    },
    priority: 0.75,
    changefreq: "monthly"
  },
  {
    path: "/careers/apply",
    element: <CareersApplyPage />,
    seo: {
      title: "Apply | Careers | ExtensionShield",
      description: "Apply to join ExtensionShield. Submit your application for open engineering and security roles.",
      canonical: "/careers/apply"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  // ============ BLOG ROUTES (SEO long-tail) ============
  {
    path: "/blog",
    element: <BlogIndexPage />,
    seo: {
      title: "Browser Extension Security Blog | Permissions, Risk & Governance",
      description: "Browser extension security guides: dangerous permissions, risky Chrome extensions, data theft, extension risk scores, governance, and honest scanner comparisons.",
      canonical: "/blog"
    },
    priority: 0.75,
    changefreq: "weekly"
  },
  {
    path: "/blog/how-to-check-chrome-extension-permissions",
    element: <Navigate to="/chrome-extension-permissions" replace />,
  },
  {
    path: "/blog/how-to-audit-chrome-extension-before-installing",
    element: <Navigate to="/blog/how-to-check-if-chrome-extension-is-safe" replace />,
  },
  {
    path: "/blog/enterprise-browser-extension-risk-management",
    element: <Navigate to="/blog/chrome-extension-allowlist-policy" replace />,
  },
  {
    path: "/blog/how-to-detect-malicious-chrome-extensions",
    element: <Navigate to="/blog/how-hackers-use-browser-extensions-to-steal-data" replace />,
  },
  {
    path: "/blog/top-risky-chrome-extensions-2026",
    element: <BlogPostPage />,
    seo: {
      title: "Top Risky Chrome Extensions in 2026: What to Check Before You Install",
      description: "A practical 2026 guide to risky Chrome extension patterns: broad permissions, data access, suspicious updates, and how to check risk before installing.",
      canonical: "/blog/top-risky-chrome-extensions-2026"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/dangerous-chrome-extension-permissions",
    element: <BlogPostPage />,
    seo: {
      title: "What Permissions Are Dangerous in Chrome Extensions?",
      description: "Dangerous Chrome extension permissions explained: all-site access, cookies, history, clipboard, scripting, webRequest, debugger, and risky combinations.",
      canonical: "/blog/dangerous-chrome-extension-permissions"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/can-chrome-extensions-steal-data",
    element: <BlogPostPage />,
    seo: {
      title: "Can Chrome Extensions Steal Data? What Users and Teams Need to Know",
      description: "Can Chrome extensions steal data? Learn how extension permissions, page access, cookies, clipboard access, and network calls can expose sensitive information.",
      canonical: "/blog/can-chrome-extensions-steal-data"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/how-to-check-if-chrome-extension-is-safe",
    element: <BlogPostPage />,
    seo: {
      title: "How to Check if a Chrome Extension Is Safe Before Installing",
      description: "A simple checklist to check if a Chrome extension is safe: permissions, publisher, reviews, updates, privacy policy, network behavior, and risk score.",
      canonical: "/blog/how-to-check-if-chrome-extension-is-safe"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/chrome-extension-scanner-vs-governance-platform",
    element: <BlogPostPage />,
    seo: {
      title: "Chrome Extension Scanner vs Extension Governance Platform",
      description: "A scanner finds extension risk. A governance platform turns extension findings into allow, block, monitor, and audit decisions.",
      canonical: "/blog/chrome-extension-scanner-vs-governance-platform"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/how-hackers-use-browser-extensions-to-steal-data",
    element: <BlogPostPage />,
    seo: {
      title: "How Hackers Use Browser Extensions to Steal Data",
      description: "Browser extension attack paths explained: malicious permissions, injected scripts, cookies, clipboard theft, update abuse, and data exfiltration.",
      canonical: "/blog/how-hackers-use-browser-extensions-to-steal-data"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/spin-ai-vs-extensionshield",
    element: <BlogPostPage />,
    seo: {
      title: "Spin.ai vs ExtensionShield: Honest Browser Extension Security Comparison",
      description: "Compare Spin.ai SpinMonitor and SpinCRX with ExtensionShield for extension risk assessment, governance, open-source trust, and pre-install scanning.",
      canonical: "/blog/spin-ai-vs-extensionshield"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/crxcavator-vs-extensionshield-2026",
    element: <BlogPostPage />,
    seo: {
      title: "CRXcavator vs ExtensionShield in 2026",
      description: "Compare CRXcavator and ExtensionShield for Chrome extension risk scores, transparent methodology, SAST, governance, and pre-install scanning.",
      canonical: "/blog/crxcavator-vs-extensionshield-2026"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/extension-auditor-vs-extensionshield",
    element: <BlogPostPage />,
    seo: {
      title: "Extension Auditor vs ExtensionShield: Which Extension Security Tool Fits?",
      description: "Compare Extension Auditor and ExtensionShield for extension security, privacy review, monitoring, governance, open-source trust, and developer audits.",
      canonical: "/blog/extension-auditor-vs-extensionshield"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/crxplorer-vs-extensionshield",
    element: <BlogPostPage />,
    seo: {
      title: "CRXplorer vs ExtensionShield: Free Scanner or Governance Platform?",
      description: "Compare CRXplorer and ExtensionShield for Chrome extension risk scoring, code review, methodology transparency, and governance workflows.",
      canonical: "/blog/crxplorer-vs-extensionshield"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/chrome-web-store-ratings-do-not-prove-extension-safety",
    element: <BlogPostPage />,
    seo: {
      title: "Why Chrome Web Store Ratings Do Not Prove an Extension Is Safe",
      description: "Star ratings and reviews are useful, but they do not prove Chrome extension safety. Learn what ratings miss and what evidence to check instead.",
      canonical: "/blog/chrome-web-store-ratings-do-not-prove-extension-safety"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/read-and-change-all-your-data-extension-permission",
    element: <BlogPostPage />,
    seo: {
      title: "Read and Change All Your Data: Chrome Extension Permission Explained",
      description: "What the 'read and change all your data' Chrome extension permission means, why it can be risky, and when it may be justified.",
      canonical: "/blog/read-and-change-all-your-data-extension-permission"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/all-urls-chrome-extension-permission",
    element: <BlogPostPage />,
    seo: {
      title: "What Is all_urls in Chrome Extensions?",
      description: "Learn what the all_urls Chrome extension permission means, why all-site access is risky, and how to decide if it is justified.",
      canonical: "/blog/all-urls-chrome-extension-permission"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/can-chrome-extensions-steal-cookies-sessions",
    element: <BlogPostPage />,
    seo: {
      title: "Can Chrome Extensions Steal Cookies or Sessions?",
      description: "Can browser extensions steal cookies or sessions? Learn how cookie permissions, page access, and token exposure can create session risk.",
      canonical: "/blog/can-chrome-extensions-steal-cookies-sessions"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/browser-extension-supply-chain-attacks",
    element: <BlogPostPage />,
    seo: {
      title: "Browser Extension Supply Chain Attacks Explained",
      description: "Browser extension supply chain attacks explained: ownership changes, malicious updates, compromised publishers, remote configuration, and extension governance controls.",
      canonical: "/blog/browser-extension-supply-chain-attacks"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/manifest-v3-extension-security",
    element: <BlogPostPage />,
    seo: {
      title: "Manifest V3 Extension Security: What Changed and What Still Matters",
      description: "Manifest V3 changed Chrome extension architecture, but permissions, host access, data flows, updates, and governance still determine extension risk.",
      canonical: "/blog/manifest-v3-extension-security"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/chrome-extension-allowlist-policy",
    element: <BlogPostPage />,
    seo: {
      title: "How to Build a Chrome Extension Allowlist Policy",
      description: "Build a Chrome extension allowlist policy with risk scoring, permission thresholds, exception handling, monitoring, and audit evidence.",
      canonical: "/blog/chrome-extension-allowlist-policy"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/browser-extension-compliance-checklist",
    element: <BlogPostPage />,
    seo: {
      title: "Browser Extension Compliance Checklist for Security Teams",
      description: "A browser extension compliance checklist for enterprise teams: inventory, permissions, privacy disclosures, update monitoring, allowlists, and audit evidence.",
      canonical: "/blog/browser-extension-compliance-checklist"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/audit-crx-zip-before-release",
    element: <BlogPostPage />,
    seo: {
      title: "How to Audit a CRX or ZIP Chrome Extension Before Release",
      description: "Audit a private CRX or ZIP Chrome extension before release: SAST, permissions, privacy, policy checks, evidence, and fix guidance.",
      canonical: "/blog/audit-crx-zip-before-release"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/best-chrome-extension-security-scanner-tools-2026",
    element: <BlogPostPage />,
    seo: {
      title: "Best Chrome Extension Security Scanner Tools in 2026",
      description: "Compare Chrome extension security scanner tools in 2026: ExtensionShield, Spin.ai, CRXcavator, Extension Auditor, and CRXplorer.",
      canonical: "/blog/best-chrome-extension-security-scanner-tools-2026"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/blog/extension-security-scoring-explained",
    element: <BlogPostPage />,
    seo: {
      title: "Extension Security Scoring Explained: Security, Privacy, and Governance",
      description: "Extension security scoring explained: how Security, Privacy, and Governance signals combine into an extension risk score.",
      canonical: "/blog/extension-security-scoring-explained"
    },
    priority: 0.6,
    changefreq: "monthly"
  },

  // ============ ENTERPRISE ROUTES ============
  {
    path: "/enterprise",
    element: <EnterprisePage />,
    seo: {
      title: "Extension Governance Platform for Enterprise | ExtensionShield",
      description: "Browser extension governance for enterprise: allowlist policies, update monitoring, audit exports, pre-install risk assessment, and compliance evidence.",
      canonical: "/enterprise"
    },
    priority: 0.8,
    changefreq: "monthly"
  },

  // ============ OPEN SOURCE / GSOC ROUTES ============
  {
    path: "/about",
    element: <AboutUsPage />,
    seo: {
      title: "Stanzin Norzang | Founder of ExtensionShield",
      description: "Stanzin Norzang is the founder of ExtensionShield, an open-source browser extension security scanner. He also co-founded Cherker, a Himalayan sea buckthorn brand from Ladakh.",
      canonical: "/about"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/open-source/programs",
    element: <OpenSourceProgramsPage />,
    seo: {
      title: "Open Source Programs | ExtensionShield",
      description: "Open source programs ExtensionShield has applied to: Google Summer of Code and more. Explore project ideas and contribution opportunities.",
      canonical: "/open-source/programs"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/open-source",
    element: <OpenSourcePage />,
    seo: {
      title: "Open Source | ExtensionShield",
      description: "ExtensionShield is open source. Explore our GitHub, contribute code, or join our GSoC program.",
      canonical: "/open-source"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/community",
    element: <CommunityLandingPage />,
    seo: {
      title: "Community | ExtensionShield",
      description: "Join the ExtensionShield community: connect with contributors, run scans, earn karma, and help make the web safer for everyone.",
      canonical: "/community"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/open-source/gsoc",
    element: <Navigate to="/gsoc/ideas" replace />
  },
  {
    path: "/gsoc/ideas",
    element: <GSoCIdeasPage />,
    seo: {
      title: "Google Summer of Code Ideas | ExtensionShield",
      description: "GSoC project ideas: Help build open-source tools that scan Chrome extensions for risky behavior and empower community-driven security.",
      canonical: "/gsoc/ideas"
    },
    priority: 0.7,
    changefreq: "monthly"
  },
  {
    path: "/contribute",
    element: <ContributePage />,
    seo: {
      title: "Everyone Can Contribute | ExtensionShield",
      description: "Help build a safer web. Scan extensions, report threats, help others—every contribution matters, no coding required.",
      canonical: "/contribute"
    },
    priority: 0.6,
    changefreq: "monthly"
  },
  {
    path: "/gsoc/community",
    element: <Navigate to="/community" replace />
  },
  // ============ REPORTS ============
  {
    path: "/reports",
    element: <Navigate to="/scan/history" replace />
  },
  {
    path: "/reports/:reportId",
    element: <ReportDetailPage />
  },

  // ============ AUTHENTICATION ============
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />
  },
  {
    path: "/auth/diagnostics",
    element: <AuthDiagnosticsPage />
  },

  // ============ SETTINGS ============
  {
    path: "/settings",
    element: <SettingsPage />
  },
  {
    path: "/privacy-policy",
    element: <PrivacyPolicyPage />,
    seo: {
      title: "Privacy Policy | ExtensionShield",
      description: "ExtensionShield Privacy Policy - Learn how we collect, use, and protect your data.",
      canonical: "/privacy-policy"
    },
    priority: 0.5,
    changefreq: "monthly"
  },
  {
    path: "/glossary",
    element: <GlossaryPage />,
    seo: {
      title: "Chrome Extension Permissions & Security Glossary | ExtensionShield",
      description: "Chrome extension permissions checker guide: what permissions are dangerous, MV3, content security policy, web accessible resources, and extension risk assessment terms.",
      canonical: "/glossary"
    },
    priority: 0.7,
    changefreq: "monthly"
  },

  // Old URL redirects
  {
    path: "/scanner",
    element: <Navigate to="/scan" replace />
  },
  {
    path: "/scanner/progress/:scanId",
    element: <Navigate to="/scan/progress/:scanId" replace />
  },
  {
    path: "/scanner/results/:scanId",
    element: <Navigate to="/scan/results/:scanId" replace />
  },
  {
    path: "/history",
    element: <Navigate to="/scan/history" replace />
  },
  {
    path: "/dashboard",
    element: <Navigate to="/scan" replace />
  },
  {
    path: "/scan-history",
    element: <Navigate to="/scan/history" replace />
  },
  {
    path: "/sample-report",
    element: <Navigate to="/research/case-studies/honey" replace />
  },
  {
    path: "/analysis",
    element: <Navigate to="/scan" replace />
  },

  // ============ DEBUG (dev only) ============
  {
    path: "/debug/theme",
    element: <ThemeDebugPage />
  },

  // ============ CATCH-ALL ============
  {
    path: "*",
    element: <Navigate to="/" replace />
  }
];

/**
 * Get all routes that should be in the sitemap
 * Excludes dynamic routes, redirects, and non-SEO routes
 */
export const getSitemapRoutes = () => {
  return routes.filter(route => 
    route.seo && 
    !route.path.includes(":") && 
    !route.path.includes("*")
  );
};

export default routes;
