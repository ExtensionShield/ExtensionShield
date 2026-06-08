import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertTriangle, ArrowRight, CheckCircle, Download,
  Eye, Github, Lock, Scale, ShieldCheck,
} from "lucide-react";
import { useScan } from "../context/ScanContext";
import { useAuth } from "../context/AuthContext";
import databaseService from "../services/databaseService";
import SEOHead from "../components/SEOHead";
import DemoModal from "../components/DemoModal";
import UploadModal from "../components/UploadModal";
import HowWeProtectYouSection from "../components/home/HowWeProtectYouSection";
import {
  CHROME_EXTENSION_STORE_URL,
  EXTENSION_ICON_PLACEHOLDER,
  getExtensionIconUrl,
} from "../utils/constants";
import { getScanResultsRoute } from "../utils/slug";
import "./HomePage.scss";

const TRUST_PILLARS = [
  {
    title: "Security",
    Icon: ShieldCheck,
    body: "Detect risky APIs, obfuscation, vulnerable patterns, malware indicators, and threat-intel signals before an extension reaches the browser.",
    link: { label: "Browser extension security", to: "/extension-security" },
  },
  {
    title: "Privacy",
    Icon: Eye,
    body: "Understand permissions, host access, cookies, clipboard, history, tracking behavior, and disclosure gaps before granting data access.",
    link: { label: "Chrome extension permissions", to: "/extension-permissions" },
  },
  {
    title: "Governance",
    Icon: Scale,
    body: "Convert technical findings into evidence-based decisions for users, developers, security teams, and approval workflows.",
    link: { label: "Extension governance", to: "/extension-governance" },
  },
];

const SCAN_SCORES = [
  { label: "Security",   Icon: ShieldCheck, score: 82, pct: "82%", variant: "good" },
  { label: "Privacy",    Icon: Eye,         score: 54, pct: "54%", variant: "warn" },
  { label: "Governance", Icon: Scale,       score: 79, pct: "79%", variant: "good" },
];

const SCAN_FINDINGS = [
  { Icon: AlertTriangle, text: "Broad host permissions (all URLs)",  variant: "warn" },
  { Icon: AlertTriangle, text: "Sends data to 3 external endpoints", variant: "warn" },
  { Icon: CheckCircle,   text: "No code obfuscation detected",       variant: "ok" },
  { Icon: CheckCircle,   text: "VirusTotal: clean (72/72)",          variant: "ok" },
];

const ScanPreviewCard = () => (
  <div className="spc-card" aria-hidden="true">
    <div className="spc-header">
      <div className="spc-header-left">
        <Lock size={11} strokeWidth={2.5} className="spc-lock-icon" />
        <span className="spc-header-label">Scan complete</span>
        <span className="spc-scan-time">2.4s</span>
      </div>
      <span className="spc-risk-pill medium">MEDIUM</span>
    </div>

    <div className="spc-ext-row">
      <div className="spc-ext-icon">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="#4f46e5" />
          <path d="M10 16h12M16 10v12" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </div>
      <div className="spc-ext-meta">
        <span className="spc-ext-name">Tab Organizer Pro</span>
        <span className="spc-ext-sub">Chrome Web Store · v2.1.4</span>
      </div>
    </div>

    <div className="spc-scores">
      {SCAN_SCORES.map(({ label, Icon, score, pct, variant }) => (
        <div className="spc-score-row" key={label}>
          <Icon size={13} className={`spc-score-icon ${variant}`} />
          <span className="spc-score-label">{label}</span>
          <div className="spc-bar">
            <div className={`spc-bar-fill ${variant}`} style={{ width: pct }} />
          </div>
          <span className={`spc-score-num ${variant}`}>{score}</span>
        </div>
      ))}
    </div>

    <div className="spc-divider" />

    <div className="spc-findings">
      {SCAN_FINDINGS.map(({ Icon, text, variant }, i) => (
        <div className={`spc-finding ${variant}`} key={i}>
          <Icon size={12} />
          <span>{text}</span>
        </div>
      ))}
    </div>

    <div className="spc-footer">
      <span>7 permissions</span>
      <span className="spc-dot" aria-hidden>·</span>
      <span>4 signals</span>
      <span className="spc-dot" aria-hidden>·</span>
      <span className="spc-footer-warn">2 need review</span>
    </div>
  </div>
);

const HomePage = () => {
  const navigate = useNavigate();
  const { startScan, setUrl, error: scanError } = useScan();
  const { isAuthenticated, openSignInModal } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [scanInput, setScanInput] = useState("");
  const [extensionsScannedCount, setExtensionsScannedCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);
  const displayCountRef = useRef(0);
  const rafRef = useRef(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const demoTriggerRef = useRef(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [heroAudience, setHeroAudience] = useState("users");

  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const autocompleteTimerRef = useRef(null);

  const handleAutocomplete = useCallback((query) => {
    const q = (query || "").trim();
    if (!q || q.length < 2 || /^https?:\/\//.test(q) || /^[a-z]{32}$/i.test(q)) {
      setAutocompleteSuggestions([]);
      setAutocompleteLoading(false);
      return;
    }
    setAutocompleteLoading(true);
    setAutocompleteSuggestions([]);
    clearTimeout(autocompleteTimerRef.current);
    autocompleteTimerRef.current = setTimeout(async () => {
      try {
        const results = await databaseService.getRecentScans(6, q);
        setAutocompleteSuggestions(results || []);
        setAutocompleteIndex(0);
      } catch {
        setAutocompleteSuggestions([]);
      } finally {
        setAutocompleteLoading(false);
      }
    }, 80);
  }, []);

  const handleSelectSuggestion = useCallback((scan) => {
    setAutocompleteSuggestions([]);
    const route = getScanResultsRoute(scan.extension_id, scan.extension_name);
    navigate(route);
  }, [navigate]);

  useEffect(() => {
    let cancelled = false;

    const loadStatistics = async () => {
      const stats = await databaseService.getStatistics();
      if (cancelled) return;

      const totalScans = Number(stats?.total_scans);
      setExtensionsScannedCount(
        Number.isFinite(totalScans) ? Math.max(0, Math.floor(totalScans)) : 0
      );
    };

    void loadStatistics();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const target = Math.max(0, extensionsScannedCount);
    const start = displayCountRef.current;
    const diff = target - start;
    if (diff === 0) return;
    const durationMs = 1400;
    const easeOutQuart = (t) => 1 - (1 - t) ** 4;
    const startTime = performance.now();
    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutQuart(progress);
      const current = Math.round(start + diff * eased);
      displayCountRef.current = current;
      setDisplayCount(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        displayCountRef.current = target;
        setDisplayCount(target);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [extensionsScannedCount]);

  useEffect(() => { setIsVisible(true); }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleScan = useCallback(() => {
    const input = scanInput.trim();
    if (input) {
      setScanInput("");
      setUrl("");
      startScan(input);
    } else {
      navigate("/scan");
    }
  }, [scanInput, setUrl, startScan, navigate]);

  const scrollToProof = useCallback(() => {
    document.getElementById("proof")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ExtensionShield",
    "url": "https://extensionshield.com",
    "logo": "https://extensionshield.com/logo.png",
    "description": "Open-source trust layer for browser extension security and governance.",
    "sameAs": ["https://github.com/Stanzin7/ExtensionShield"],
  };

  const softwareAppSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "ExtensionShield",
    "applicationCategory": "SecurityApplication",
    "operatingSystem": "Web",
    "offers": [
      { "@type": "Offer", "price": "0", "priceCurrency": "USD", "description": "Free public extension scan by Chrome Web Store URL" },
      { "@type": "Offer", "description": "Pro: private CRX/ZIP security audit and vulnerability scan" },
    ],
    "description": "Open-source trust layer for browser extension security and governance. Scan Chrome Web Store extensions, audit private CRX/ZIP builds, and generate evidence-backed Security, Privacy, and Governance reports.",
    "url": "https://extensionshield.com/scan",
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Can I scan a private CRX/ZIP?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. Pro users can upload a private CRX or ZIP build for a pre-release security audit. Sign in and go to Upload CRX/ZIP from the Scan menu." },
      },
      {
        "@type": "Question",
        "name": "What does the audit check?",
        "acceptedAnswer": { "@type": "Answer", "text": "The audit checks security (SAST, malware/VirusTotal, obfuscation), privacy (permissions, data exfil, network calls), and governance (policy alignment, disclosure). You get evidence-linked findings and fix suggestions." },
      },
      {
        "@type": "Question",
        "name": "Do you store uploads?",
        "acceptedAnswer": { "@type": "Answer", "text": "Uploads are processed to generate the report. We do not retain your private build for longer than needed to complete the scan. Reports are private by default; you choose whether to share." },
      },
      {
        "@type": "Question",
        "name": "Does this help with Chrome Web Store policy risks?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. The governance layer covers policy alignment, disclosure accuracy, and consistency—so you can address store policy risks before submission." },
      },
      {
        "@type": "Question",
        "name": "Is ExtensionShield just a Chrome extension scanner?",
        "acceptedAnswer": { "@type": "Answer", "text": "No. The free scanner is the entry point. ExtensionShield is a browser extension security and governance platform with Security, Privacy, and Governance scoring, private CRX/ZIP audits, and evidence-backed decision support." },
      },
      {
        "@type": "Question",
        "name": "Is the extension scanner free?",
        "acceptedAnswer": { "@type": "Answer", "text": "Yes. Scanning a public Chrome Web Store extension by URL is free and needs no account. Private CRX/ZIP build audits are a Pro feature." },
      },
      {
        "@type": "Question",
        "name": "Do I need to install anything to scan an extension?",
        "acceptedAnswer": { "@type": "Answer", "text": "No. Paste the Chrome Web Store URL into the scanner and you get a risk report in under a minute. An optional browser extension is available for one-click checks." },
      },
    ],
  };

  return (
    <>
      <SEOHead
        title="Free Chrome Extension Scanner — Security, Privacy & Risk Score | ExtensionShield"
        description="Free Chrome extension scanner. Paste a Web Store URL to check permissions, privacy risks, malware signals, and a 0–100 risk score before you install—no signup. Open-source security & governance."
        pathname="/"
        ogType="website"
        schema={[organizationSchema, softwareAppSchema, faqSchema]}
        keywords="free extension scanner, free chrome extension scanner, chrome extension scanner, browser extension security scanner, chrome extension permissions checker, extension risk score, extension governance"
      />

      <div className="home-page">
        {/* Mobile hero: real H1 + working scan input (no desktop-only fallback) */}
        <div className="hero-mobile-message">
          <p className="hero-tagline">Free · Open-source Chrome extension scanner</p>
          <h1 className="hero-title">Free Chrome extension scanner—check any extension before you install.</h1>
          <p className="hero-mobile-subhead">
            Paste a Chrome Web Store URL to check permissions, privacy risks, and a risk score before
            you install. No signup.
          </p>

          <div className="hero-mobile-search">
            <span className="search-icon-chrome" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="chrome-logo">
                <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
                <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
                <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
                <circle cx="12" cy="12" r="4" fill="#34A853" />
                <circle cx="12" cy="12" r="2.5" fill="white" />
              </svg>
            </span>
            <input
              type="text"
              id="hero-scan-input-mobile"
              className="hero-mobile-input"
              placeholder="Paste Chrome Web Store URL"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleScan(); }}
              aria-label="Paste a Chrome Web Store URL to scan an extension"
              autoComplete="off"
              inputMode="url"
            />
            <button
              type="button"
              className="hero-mobile-scan-btn"
              onClick={handleScan}
              aria-label="Scan extension"
            >
              Scan
            </button>
          </div>

          <button
            type="button"
            className="hero-mobile-demo-btn"
            onClick={() => setDemoModalOpen(true)}
          >
            <span className="hero-demo-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <span>Step-by-step guide</span>
          </button>

          <Link to="/free-extension-scanner" className="hero-mobile-link">
            How the free scanner works
          </Link>
        </div>

        <div className="hero-desktop-content">
          {/* ── Hero ─────────────────────────────────────────────── */}
          <section className="hero-section" aria-label="Chrome Extension Security Gate">
            <div className="hero-inner">

              {/* Left: headline + search */}
              <motion.div
                className="hero-left"
                initial={{ opacity: 0, y: 20 }}
                animate={isVisible ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="hero-audience-toggle" role="group" aria-label="Audience">
                  <button
                    type="button"
                    className={`hero-toggle-option${heroAudience === "users" ? " active" : ""}`}
                    onClick={() => setHeroAudience("users")}
                    aria-pressed={heroAudience === "users"}
                  >
                    For users
                  </button>
                  <button
                    type="button"
                    className={`hero-toggle-option${heroAudience === "developers" ? " active" : ""}`}
                    onClick={() => setHeroAudience("developers")}
                    aria-pressed={heroAudience === "developers"}
                  >
                    For developers
                  </button>
                </div>

                {heroAudience === "users" ? (
                  <>
                    <p className="hero-eyebrow">Free · Open-source · Chrome extension scanner</p>
                    <h1 className="hero-title">
                      Know what a Chrome extension does before you install it.
                    </h1>
                    <p className="hero-subhead">
                      ExtensionShield is a free extension scanner that checks Chrome extensions for
                      security risks, privacy violations, and governance gaps—giving you evidence to
                      allow, block, or monitor before anything reaches your browser.
                    </p>

                    <button
                      type="button"
                      ref={demoTriggerRef}
                      className="scanner-demo-link"
                      onClick={() => setDemoModalOpen(true)}
                    >
                      <span className="scanner-demo-icon" aria-hidden>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
                        </svg>
                      </span>
                      Step-by-step guide
                    </button>

                    <div className="hero-search">
                      <div className="search-container hero-search-container">
                        <span className="search-icon search-icon-chrome" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="chrome-logo">
                            <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
                            <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
                            <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
                            <circle cx="12" cy="12" r="4" fill="#34A853" />
                            <circle cx="12" cy="12" r="2.5" fill="white" />
                          </svg>
                        </span>
                        <input
                          type="text"
                          id="hero-scan-input"
                          placeholder="Search extension name or paste Store URL"
                          value={scanInput}
                          onChange={(e) => {
                            setScanInput(e.target.value);
                            handleAutocomplete(e.target.value);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (autocompleteSuggestions.length > 0 && autocompleteIndex >= 0 && autocompleteSuggestions[autocompleteIndex]) {
                                handleSelectSuggestion(autocompleteSuggestions[autocompleteIndex]);
                                return;
                              }
                              handleScan();
                              return;
                            }
                            if (e.key === "Escape") setAutocompleteSuggestions([]);
                            if (e.key === "ArrowDown" && autocompleteSuggestions.length > 0) {
                              e.preventDefault();
                              setAutocompleteIndex((i) => Math.min(i + 1, autocompleteSuggestions.length - 1));
                            }
                            if (e.key === "ArrowUp" && autocompleteSuggestions.length > 0) {
                              e.preventDefault();
                              setAutocompleteIndex((i) => Math.max(i - 1, 0));
                            }
                          }}
                          onFocus={() => { if (scanInput.trim().length >= 2) handleAutocomplete(scanInput); }}
                          onBlur={() => { setTimeout(() => { setAutocompleteSuggestions([]); setAutocompleteLoading(false); }, 150); }}
                          aria-label="Search extension name or paste Store URL"
                          autoComplete="off"
                          role="combobox"
                          aria-expanded={autocompleteSuggestions.length > 0 || autocompleteLoading}
                          aria-autocomplete="list"
                          aria-controls="hero-autocomplete-list"
                        />
                        {(autocompleteSuggestions.length > 0 || autocompleteLoading) && (
                          <ul className="hero-autocomplete" id="hero-autocomplete-list" role="listbox">
                            {autocompleteLoading && autocompleteSuggestions.length === 0 ? (
                              <li className="hero-autocomplete-item hero-autocomplete-loading" role="status">
                                <span className="hero-autocomplete-name">Searching...</span>
                              </li>
                            ) : (
                              autocompleteSuggestions.map((s, i) => (
                                <li
                                  key={s.extension_id}
                                  role="option"
                                  aria-selected={i === autocompleteIndex}
                                  className={`hero-autocomplete-item${i === autocompleteIndex ? " active" : ""}`}
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    handleSelectSuggestion(s);
                                  }}
                                >
                                  <img
                                    src={getExtensionIconUrl(s.extension_id)}
                                    alt=""
                                    className="hero-autocomplete-icon"
                                    width="20"
                                    height="20"
                                    onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }}
                                  />
                                  <span className="hero-autocomplete-name">{s.extension_name || s.extension_id}</span>
                                </li>
                              ))
                            )}
                          </ul>
                        )}
                        <motion.button
                          type="button"
                          className="search-btn search-btn-icon"
                          onClick={handleScan}
                          aria-label="Scan extension"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <circle cx="11" cy="11" r="8" />
                            <path d="M21 21l-4.35-4.35" />
                          </svg>
                        </motion.button>
                      </div>

                      <p className="hero-scan-info">
                        <svg className="hero-scan-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                        Pre-install risk assessment with permissions, network access, version history, and known threats.
                      </p>
                    </div>

                    <div className="hero-cta-row">
                      <a
                        href={CHROME_EXTENSION_STORE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hero-btn hero-btn-primary"
                      >
                        <Download size={15} strokeWidth={2} aria-hidden />
                        Add to Chrome
                      </a>
                      <a
                        href="https://github.com/Stanzin7/ExtensionShield"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hero-btn hero-btn-secondary"
                      >
                        <Github size={15} strokeWidth={2} aria-hidden />
                        View on GitHub
                      </a>
                    </div>

                    {scanError && <p className="scan-error-hint">{scanError}</p>}
                  </>
                ) : (
                  <>
                    <p className="hero-eyebrow">Pro · Private build governance</p>
                    <h1 className="hero-title">
                      Audit Chrome extensions before you ship.
                    </h1>
                    <p className="hero-subhead">
                      Vulnerabilities, permissions, privacy, and policy checks with evidence and
                      fix guidance for private CRX/ZIP builds. Private by default—share only if
                      you choose.
                    </p>
                    <div className="hero-cta-row">
                      {isAuthenticated ? (
                        <button
                          type="button"
                          className="hero-btn hero-btn-primary"
                          onClick={() => navigate("/scan/upload")}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden width={15} height={15}>
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                          Upload CRX/ZIP
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="hero-btn hero-btn-primary"
                          onClick={() => openSignInModal()}
                        >
                          Start a Pro audit
                        </button>
                      )}
                      <Link to="/scan" className="hero-btn hero-btn-secondary">
                        Free risk check
                      </Link>
                    </div>
                  </>
                )}
              </motion.div>

              {/* Right: scan result preview */}
              <motion.div
                className="hero-right"
                initial={{ opacity: 0, x: 20 }}
                animate={isVisible ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
              >
                <ScanPreviewCard />
              </motion.div>
            </div>

            {/* Stats */}
            <motion.div
              className="stats-bar"
              initial={{ opacity: 0, y: 14 }}
              animate={isVisible ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="stat-item">
                <span className="stat-value live">
                  <span className="live-dot" aria-hidden="true" />
                  OPEN
                </span>
                <span className="stat-label">SOURCE CORE</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value">3</span>
                <span className="stat-label">Risk layers</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value">~&nbsp;10s</span>
                <span className="stat-label">Typical scan time</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value live">
                  <span className="live-dot" aria-hidden="true" />
                  <span className="stat-value-number">{displayCount.toLocaleString()}</span>
                </span>
                <span className="stat-label">Extensions scanned</span>
              </div>
            </motion.div>

            <motion.button
              type="button"
              className="scroll-cue"
              onClick={scrollToProof}
              initial={{ opacity: 0 }}
              animate={isVisible ? { opacity: 1 } : {}}
              transition={{ delay: 0.55, duration: 0.3 }}
              aria-label="Scroll to see how extension governance works"
            >
              <span>See how it works</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </motion.button>
          </section>

          {/* ── Trust pillars ─────────────────────────────────────── */}
          <section
            className="home-trust-section landing-separator"
            id="proof"
            aria-labelledby="home-trust-title"
          >
            <div className="home-trust-inner">
              <div className="home-trust-copy">
                <p className="home-trust-eyebrow" style={{ marginBottom: "1.5rem" }}>Open-source trust layer</p>
                <h2 id="home-trust-title">
                  A free extension scanner with security,<br />privacy, and governance built in.
                </h2>
                <p>
                  ExtensionShield helps users, developers, and security teams review <br />Chrome extensions before they become a risk. Scan public Web Store <br />extensions, audit private CRX/ZIP builds, and turn findings into clear <br />allow, block, monitor, or fix decisions.
                </p>
              </div>

              <div className="home-trust-pillars" role="list">
                {TRUST_PILLARS.map(({ title, Icon, body, link }) => (
                  <article className="home-trust-pillar" key={title} role="listitem">
                    <div className="home-trust-pillar-icon" aria-hidden>
                      <Icon size={20} strokeWidth={1.8} />
                    </div>
                    <h3>{title}</h3>
                    <p>{body}</p>
                    <Link to={link.to}>{link.label}</Link>
                  </article>
                ))}
              </div>

            </div>
          </section>

          {/* ── How we protect you ───────────────────────────────── */}
          <HowWeProtectYouSection />

          {/* ── Honey case study ─────────────────────────────────── */}
          <section className="honey-case-study">
            <motion.div
              className="case-study-container"
              initial={reducedMotion ? false : { opacity: 0, y: 20 }}
              whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.12 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="case-study-header">
                <span className="case-study-badge">CASE STUDY</span>
                <h2 className="case-study-title">
                  Honey Extension Case Study
                  <span className="subtitle">17M+ users reported. $4B acquisition.</span>
                </h2>
              </div>

              <div className="case-study-content">
                <div className="scam-details">
                  <div className="scam-intro">
                    <p>
                      Promised savings. Investigators reported{" "}
                      <strong>commission diversion</strong> and{" "}
                      <strong>alleged worse deals</strong>.
                    </p>
                  </div>

                  <div className="scam-points">
                    {[
                      {
                        cls: "theft",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M12 8v4M12 16h.01" />
                          </svg>
                        ),
                        title: "Affiliate Link Hijacking",
                        body: "Investigators found silent overwriting of creator affiliate codes. Creators reported lost commissions.",
                      },
                      {
                        cls: "data",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        ),
                        title: "Shopping Surveillance",
                        body: "Investigators reported tracking of views, carts, and purchases. Data reportedly shared with retailers.",
                      },
                      {
                        cls: "fake",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        ),
                        title: "Disputed \"Best\" Coupons",
                        body: "Users reported finding better deals publicly. The coupon animation was questioned by investigators.",
                      },
                      {
                        cls: "money",
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="1" x2="12" y2="23" />
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        ),
                        title: "Retailer Kickbacks",
                        body: "Investigators reported payments to prioritize certain deals. Users disputed whether they received the best available price.",
                      },
                    ].map(({ cls, icon, title, body }) => (
                      <div className="scam-point" key={title}>
                        <div className={`point-icon ${cls}`}>{icon}</div>
                        <div className="point-content">
                          <h4>{title}</h4>
                          <p>{body}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Link to="/research/case-studies" className="scam-footer scam-footer-link">
                    <div className="exposed-by">
                      <span>Exposed by</span>
                      <strong>MegaLag</strong>
                      <span className="date">· December 2024</span>
                    </div>
                    <span className="scam-footer-read-more">
                      <span>Read case study</span>
                      <ArrowRight size={16} strokeWidth={2} aria-hidden />
                    </span>
                  </Link>
                </div>

                <div className="honey-icon-section">
                  <div className="honey-icon-wrapper">
                    <div className="honey-logo">
                      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                          d="M50 5L93.3 27.5V72.5L50 95L6.7 72.5V27.5L50 5Z"
                          fill="url(#honeyGradient)"
                          stroke="url(#honeyStroke)"
                          strokeWidth="2"
                        />
                        <path d="M50 30L62 38V54L50 62L38 54V38L50 30Z" fill="rgba(255,255,255,0.15)" />
                        <path d="M35 45L47 53V69L35 77L23 69V53L35 45Z" fill="rgba(255,255,255,0.1)" />
                        <path d="M65 45L77 53V69L65 77L53 69V53L65 45Z" fill="rgba(255,255,255,0.1)" />
                        <text x="50" y="58" textAnchor="middle" fill="white" fontSize="28" fontWeight="bold" fontFamily="Arial">h</text>
                        <defs>
                          <linearGradient id="honeyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#FF9500" />
                            <stop offset="50%" stopColor="#FF6B00" />
                            <stop offset="100%" stopColor="#E85D04" />
                          </linearGradient>
                          <linearGradient id="honeyStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor="#FFB347" />
                            <stop offset="100%" stopColor="#FF8C00" />
                          </linearGradient>
                        </defs>
                      </svg>
                    </div>
                    <div className="warning-badge">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                    </div>
                  </div>

                  <div className="honey-stats">
                    <div className="honey-stat">
                      <span className="stat-number">17M+</span>
                      <span className="stat-desc">Reported Users</span>
                    </div>
                    <div className="honey-stat">
                      <span className="stat-number">$4B</span>
                      <span className="stat-desc">Acquisition</span>
                    </div>
                    <div className="honey-stat">
                      <span className="stat-number danger">—</span>
                      <span className="stat-desc">Savings Not Guaranteed</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </section>

          {/* ── Final CTA ─────────────────────────────────────────── */}
          <section className="home-cta-section landing-separator">
            <div className="home-cta-inner">
              <p className="home-cta-eyebrow">Free and open-source</p>
              <h2 className="home-cta-title">
                Start scanning extensions today.
              </h2>
              <p className="home-cta-body">
                No sign-up required for public Chrome Web Store extensions.
                Open-source core, transparent methodology, evidence-backed results.
              </p>
              <div className="home-cta-btns">
                <Link to="/scan" className="home-cta-btn-primary">
                  Scan an extension
                  <ArrowRight size={15} strokeWidth={2} aria-hidden />
                </Link>
                <Link to="/free-extension-scanner" className="home-cta-btn-secondary">
                  Free extension scanner
                </Link>
                <a
                  href="https://github.com/Stanzin7/ExtensionShield"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="home-cta-btn-secondary"
                >
                  <Github size={15} strokeWidth={2} aria-hidden />
                  GitHub
                </a>
              </div>
            </div>
          </section>
        </div>

        <DemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          triggerRef={demoTriggerRef}
        />
        <UploadModal
          isOpen={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
        />
      </div>
    </>
  );
};

export default HomePage;
