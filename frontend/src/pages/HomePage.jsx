import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle, ClipboardCheck,
  Code2, Download, Eye, Github, Lock, Scale, ShieldCheck, Star,
} from "lucide-react";
import { useScan } from "../context/ScanContext";
import databaseService from "../services/databaseService";
import useGitHubStars, { formatStars } from "../hooks/useGitHubStars";
import SEOHead from "../components/SEOHead";
import DemoModal from "../components/DemoModal";
import {
  CHROME_EXTENSION_STORE_URL,
  EXTENSION_ICON_PLACEHOLDER,
  getExtensionIconUrl,
} from "../utils/constants";
import { getScanResultsRoute } from "../utils/slug";
import "./HomePage.scss";

const GITHUB_REPO = "Stanzin7/ExtensionShield";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

/* ── Real frozen scan ────────────────────────────────────────────────────────
   Captured from a live ExtensionShield scan of PayPal Honey
   (extension id bmnlcjabgnpnenekpadlanbbkooimhnj). scoring_v2: overall 66 /
   MEDIUM, security 74, privacy 31, governance 100, 9 permissions, 2 findings.
   ──────────────────────────────────────────────────────────────────────────── */
const HONEY_SCAN = {
  extensionId: "bmnlcjabgnpnenekpadlanbbkooimhnj",
  name: "PayPal Honey: Coupons & Cash Back",
  version: "v19.0.2",
  risk: "MEDIUM",
  scores: [
    { label: "Security",   Icon: ShieldCheck, score: 74,  variant: "warn" },
    { label: "Privacy",    Icon: Eye,         score: 31,  variant: "bad"  },
    { label: "Governance", Icon: Scale,       score: 100, variant: "good" },
  ],
  findings: [
    { Icon: AlertTriangle, text: "Broad host permissions — all HTTP sites", variant: "warn" },
    { Icon: AlertTriangle, text: "Data access & browser control: high",     variant: "warn" },
    { Icon: CheckCircle,   text: "VirusTotal: no detections",               variant: "ok"   },
    { Icon: CheckCircle,   text: "Publisher disclosures verified",          variant: "ok"   },
  ],
  permissions: 9,
  reviewCount: 2,
};

/* ── Section 3: Honey findings + the signal ExtensionShield surfaces ─────────── */
const HONEY_POINTS = [
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
    flag: "Signal: Broad host permissions",
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
    flag: "Signal: Page-content access across all sites",
  },
  {
    cls: "fake",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    ),
    title: 'Disputed "Best" Coupons',
    body: "Users reported finding better deals publicly. The coupon animation was questioned by investigators.",
    flag: "Signal: Page-rewrite behavior",
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
    flag: "Signal: Publisher / ownership history",
  },
];

/* ── Section 5: The three risk layers ───────────────────────────────────────── */
const RISK_LAYERS = [
  {
    title: "Security",
    Icon: ShieldCheck,
    body: "Risky APIs, obfuscated code, and VirusTotal signals — the signs that an extension is doing something it shouldn't.",
    range: "A low score means risky APIs or packed code we can't fully read.",
    link: { label: "Browser extension security", to: "/extension-security" },
  },
  {
    title: "Privacy",
    Icon: Eye,
    body: "What an extension can read: your tabs, clipboard, browsing history, and cookies. We show exactly what's granted and why it matters.",
    range: "A low score means broad host permissions and high data access.",
    link: { label: "Chrome extension permissions", to: "/extension-permissions" },
  },
  {
    title: "Governance",
    Icon: Scale,
    body: "Publisher identity, ownership history, and Web Store version history. Extensions change — we track the record, not just the current build.",
    range: "A high score means a stable, transparent, well-disclosed publisher.",
    link: { label: "Extension governance", to: "/extension-governance" },
  },
];

/* ── Hero: real frozen scan icon ─────────────────────────────────────────────── */
const HoneyHexLogo = () => (
  <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M50 5L93.3 27.5V72.5L50 95L6.7 72.5V27.5L50 5Z" fill="url(#spcHoney)" />
    <text x="50" y="62" textAnchor="middle" fill="white" fontSize="42" fontWeight="bold" fontFamily="Arial">h</text>
    <defs>
      <linearGradient id="spcHoney" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF9500" />
        <stop offset="100%" stopColor="#E85D04" />
      </linearGradient>
    </defs>
  </svg>
);

const ScanPreviewCard = () => (
  <Link
    to={getScanResultsRoute(HONEY_SCAN.extensionId)}
    className="spc-card"
    aria-label={`Real ExtensionShield scan of ${HONEY_SCAN.name}: medium risk. Security 74, Privacy 31, Governance 100. View the full report.`}
  >
    <div className="spc-header">
      <div className="spc-header-left">
        <Lock size={11} strokeWidth={2.5} className="spc-lock-icon" />
        <span className="spc-header-label">Real scan</span>
      </div>
      <span className="spc-risk-pill medium">{HONEY_SCAN.risk}</span>
    </div>

    <div className="spc-ext-row">
      <div className="spc-ext-icon"><HoneyHexLogo /></div>
      <div className="spc-ext-meta">
        <span className="spc-ext-name">{HONEY_SCAN.name}</span>
        <span className="spc-ext-sub">Chrome Web Store · {HONEY_SCAN.version}</span>
      </div>
    </div>

    <div className="spc-scores">
      {HONEY_SCAN.scores.map((s) => (
        <div className="spc-score-row" key={s.label}>
          <s.Icon size={13} className={`spc-score-icon ${s.variant}`} />
          <span className="spc-score-label">{s.label}</span>
          <div className="spc-bar">
            <div className={`spc-bar-fill ${s.variant}`} style={{ width: `${s.score}%` }} />
          </div>
          <span className={`spc-score-num ${s.variant}`}>{s.score}</span>
        </div>
      ))}
    </div>

    <div className="spc-divider" />

    <div className="spc-findings">
      {HONEY_SCAN.findings.map((f, i) => (
        <div className={`spc-finding ${f.variant}`} key={i}>
          <f.Icon size={12} />
          <span>{f.text}</span>
        </div>
      ))}
    </div>

    <div className="spc-footer">
      <span>{HONEY_SCAN.permissions} permissions</span>
      <span className="spc-dot" aria-hidden>·</span>
      <span className="spc-footer-warn">{HONEY_SCAN.reviewCount} findings need review</span>
      <span className="spc-view">View report →</span>
    </div>
  </Link>
);

/* ── Section 2: version-diff artifact ───────────────────────────────────────── */
const VersionDiffArtifact = () => (
  <div className="hp-vdiff" aria-hidden="true">
    <div className="hp-vdiff-header">
      <span className="hp-vdiff-title">Extension update</span>
      <span className="hp-vdiff-badge">Silent · No notification</span>
    </div>
    <div className="hp-vdiff-versions">
      <div className="hp-vdiff-v hp-vdiff-v--trusted">
        <span className="hp-vdiff-tag">Trusted</span>
        <span className="hp-vdiff-ver">v12.0.1</span>
        <span className="hp-vdiff-ago">3 months ago</span>
      </div>
      <span className="hp-vdiff-arrow" aria-hidden="true">→</span>
      <div className="hp-vdiff-v hp-vdiff-v--updated">
        <span className="hp-vdiff-tag">Updated</span>
        <span className="hp-vdiff-ver">v12.4.0</span>
        <span className="hp-vdiff-ago">1 week ago</span>
      </div>
    </div>
    <div className="hp-vdiff-diff">
      <div className="hp-vdiff-line hp-vdiff-line--add">
        <span className="hp-vdiff-glyph">+</span>
        <span className="hp-vdiff-key">permissions:</span>
        <span className="hp-vdiff-val">host → &lt;all_urls&gt;</span>
        <span className="hp-vdiff-note">NEW</span>
      </div>
      <div className="hp-vdiff-line hp-vdiff-line--add">
        <span className="hp-vdiff-glyph">+</span>
        <span className="hp-vdiff-key">endpoint:</span>
        <span className="hp-vdiff-val">api.new-vendor.com/track</span>
        <span className="hp-vdiff-note">NEW</span>
      </div>
      <div className="hp-vdiff-line hp-vdiff-line--add">
        <span className="hp-vdiff-glyph">+</span>
        <span className="hp-vdiff-key">endpoint:</span>
        <span className="hp-vdiff-val">data.partner.io/events</span>
        <span className="hp-vdiff-note">NEW</span>
      </div>
      <div className="hp-vdiff-line hp-vdiff-line--change">
        <span className="hp-vdiff-glyph">±</span>
        <span className="hp-vdiff-key">publisher:</span>
        <span className="hp-vdiff-val">Original Dev → Acquirer Corp</span>
        <span className="hp-vdiff-note">CHANGED</span>
      </div>
    </div>
    <div className="hp-vdiff-footer">
      <AlertTriangle size={11} strokeWidth={2.5} />
      <span>Chrome did not notify you of these changes</span>
    </div>
  </div>
);

/* ── Section 6: GitHub star badge ───────────────────────────────────────────── */
const StarBadge = ({ className = "" }) => {
  const { stars } = useGitHubStars(GITHUB_REPO);
  const label = formatStars(stars);
  return (
    <a
      href={GITHUB_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`gh-star-badge ${className}`}
    >
      <Star size={14} strokeWidth={2} aria-hidden />
      <span>{label ? `${label} stars` : "Star on GitHub"}</span>
    </a>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const { startScan, setUrl, error: scanError } = useScan();
  const [scanInput, setScanInput] = useState("");
  const [extensionsScannedCount, setExtensionsScannedCount] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);
  const displayCountRef = useRef(0);
  const rafRef = useRef(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const demoTriggerRef = useRef(null);

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
      const current = Math.round(start + diff * easeOutQuart(progress));
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

  const scrollToProblem = useCallback(() => {
    document.getElementById("the-problem")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "ExtensionShield",
    "url": "https://extensionshield.com",
    "logo": "https://extensionshield.com/logo.png",
    "description": "Open-source scanner for browser extension security, privacy, and governance.",
    "sameAs": [GITHUB_URL],
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
    "description": "Open-source scanner for browser extension security, privacy, and governance. Scan Chrome Web Store extensions, audit private CRX/ZIP builds, and generate evidence-backed Security, Privacy, and Governance reports.",
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
        "name": "What does the scan check?",
        "acceptedAnswer": { "@type": "Answer", "text": "The scan checks security (SAST, obfuscation, VirusTotal signals), privacy (permissions, host access, network endpoints), and governance (publisher identity, ownership history, disclosure accuracy). You get evidence-linked findings and fix suggestions." },
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
        "acceptedAnswer": { "@type": "Answer", "text": "The free scanner is the entry point. ExtensionShield is an open-source scanner with Security, Privacy, and Governance scoring, private CRX/ZIP audits, and evidence-backed decision support." },
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
        description="Free Chrome extension scanner. Paste a Web Store URL to check permissions, host access, external endpoints, and a 0–100 risk score before you install—no signup. Open-source security & governance."
        pathname="/"
        ogType="website"
        schema={[organizationSchema, softwareAppSchema, faqSchema]}
        keywords="free extension scanner, free chrome extension scanner, chrome extension scanner, browser extension security scanner, chrome extension permissions checker, extension risk score, extension governance"
      />

      <div className="home-page">
        {/* Mobile hero: real H1 + working scan input */}
        <div className="hero-mobile-message">
          <p className="hero-tagline">Free · Open-source Chrome extension scanner</p>
          <h1 className="hero-title">Extensions can read your browsing. Check before you install.</h1>
          <p className="hero-mobile-subhead">
            Paste a Chrome Web Store URL to check permissions, host access, and a risk score before
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
          {/* ── Section 1 — Hero ──────────────────────────────────────────── */}
          <section className="hero-section" aria-label="Check a Chrome extension before you install it">
            <div className="hero-inner">
              {/* Left: headline + search */}
              <div className="hero-left">
                <p className="hero-eyebrow">Free · Open-source · Chrome extension scanner</p>
                <h1 className="hero-title">
                  Extensions can read your browsing. Check one before you install it.
                </h1>
                <p className="hero-subhead">
                  ExtensionShield flags risky permissions, privacy exposure, and governance
                  gaps — before an extension reaches your browser.
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
                    <button
                      type="button"
                      className="search-btn search-btn-icon"
                      onClick={handleScan}
                      aria-label="Scan extension"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <circle cx="11" cy="11" r="8" />
                        <path d="M21 21l-4.35-4.35" />
                      </svg>
                    </button>
                  </div>

                  <p className="hero-scan-info">
                    <svg className="hero-scan-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    Pre-install risk assessment: permissions, host access, network endpoints, and publisher history.
                  </p>
                </div>

                <div className="hero-cta-row">
                  <a
                    href={CHROME_EXTENSION_STORE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hero-btn hero-btn-secondary"
                  >
                    <Download size={15} strokeWidth={2} aria-hidden />
                    Add to Chrome
                  </a>
                </div>

                {scanError && <p className="scan-error-hint">{scanError}</p>}
              </div>

              {/* Right: real frozen scan result */}
              <div className="hero-right">
                <ScanPreviewCard />
              </div>
            </div>

            {/* Stats — three social-proof facts */}
            <div className="stats-bar">
              <div className="stat-item">
                <span className="stat-value live">
                  <span className="live-dot" aria-hidden="true" />
                  OPEN
                </span>
                <span className="stat-label">Source core</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value">3</span>
                <span className="stat-label">Risk layers</span>
              </div>
              <div className="stat-divider" />
              <div className="stat-item">
                <span className="stat-value live">
                  <span className="live-dot" aria-hidden="true" />
                  <span className="stat-value-number">{displayCount.toLocaleString()}</span>
                </span>
                <span className="stat-label">Extensions scanned</span>
              </div>
            </div>

            <button
              type="button"
              className="scroll-cue"
              onClick={scrollToProblem}
              aria-label="Scroll to learn how extensions change after you install them"
            >
              <span>See how it works</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 5v14M5 12l7 7 7-7" />
              </svg>
            </button>
          </section>

          {/* ── Section 2 — The Problem ───────────────────────────────────── */}
          <section className="hp-problem landing-separator" id="the-problem" aria-labelledby="hp-problem-title">
            <div className="hp-problem-inner">
              <div className="hp-problem-copy">
                <p className="hp-eyebrow">The silent update</p>
                <h2 id="hp-problem-title">Extensions don't ask permission twice.</h2>
                <p>
                  You grant an extension its permissions once — at install. After that it can
                  ship an update that quietly does more than the version you trusted.
                </p>
                <p>
                  Ownership changes too. An extension with hundreds of thousands of users can be
                  sold to a new publisher, and the Chrome Web Store won't tell you.
                </p>
                <p>
                  By the time anyone notices, it has already been reading your browsing. That's
                  the gap ExtensionShield closes — before you install.
                </p>
              </div>

              <VersionDiffArtifact />
            </div>
          </section>

          {/* ── Section 3 — Honey case study ──────────────────────────────── */}
          <section className="honey-case-study" id="honey" aria-labelledby="honey-title">
            <div className="case-study-container">
              <div className="case-study-header">
                <span className="case-study-badge">CASE STUDY</span>
                <h2 className="case-study-title" id="honey-title">
                  17M users. $4B acquisition. Zero transparency.
                  <span className="subtitle">
                    Honey — the coupon extension — was acquired and used to divert affiliate
                    commissions. MegaLag exposed it in December 2024.
                  </span>
                </h2>
              </div>

              <div className="case-study-content">
                <div className="scam-details">
                  <div className="scam-intro">
                    <p>
                      Promised savings. Investigators reported{" "}
                      <strong>commission diversion</strong> and{" "}
                      <strong>alleged worse deals</strong>. Here's what made it possible — and what a
                      scan surfaces.
                    </p>
                  </div>

                  <div className="scam-points">
                    {HONEY_POINTS.map(({ cls, icon, title, body, flag }) => (
                      <div className="scam-point" key={title}>
                        <div className={`point-icon ${cls}`}>{icon}</div>
                        <div className="point-content">
                          <h4>{title}</h4>
                          <p>{body}</p>
                          <p className="point-flag">
                            <ShieldCheck size={13} strokeWidth={2} aria-hidden />
                            <span>{flag}</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Link to="/research/case-studies/honey" className="scam-footer scam-footer-link">
                    <div className="exposed-by">
                      <span>Exposed by</span>
                      <strong>MegaLag</strong>
                      <span className="date">· December 2024</span>
                    </div>
                    <span className="scam-footer-read-more">
                      <span>Read the full case study</span>
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
            </div>
          </section>

          {/* ── Section 4 — How it works ──────────────────────────────────── */}
          <section className="hp-how landing-separator" id="how-it-works" aria-labelledby="hp-how-title">
            <div className="hp-how-inner">
              <div className="hp-section-head">
                <p className="hp-eyebrow">How it works</p>
                <h2 id="hp-how-title">Search, scan, read the findings.</h2>
              </div>

              <div className="hp-flow" aria-label="Three-step process: search, scan, read results">
                {/* Step 1 — Input state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-ui hp-flow-ui--input" aria-hidden="true">
                    <div className="hp-flow-input-bar">
                      <svg viewBox="0 0 24 24" fill="none" className="hp-flow-chrome" aria-hidden="true">
                        <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
                        <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
                        <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
                        <circle cx="12" cy="12" r="4" fill="#34A853" />
                        <circle cx="12" cy="12" r="2.5" fill="white" />
                      </svg>
                      <span className="hp-flow-url">PayPal Honey</span>
                      <span className="hp-flow-go">→</span>
                    </div>
                    <p className="hp-flow-hint">Name or Chrome Web Store URL</p>
                  </div>
                  <span className="hp-flow-num" aria-hidden="true">01</span>
                  <h3>Search or paste</h3>
                  <p>Find any extension by name, or paste a Chrome Web Store URL.</p>
                </div>

                <div className="hp-flow-conn" aria-hidden="true"><span /><span /></div>

                {/* Step 2 — Scan state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-ui hp-flow-ui--scan" aria-hidden="true">
                    <div className="hp-flow-layer-rows">
                      <div className="hp-flow-lr">
                        <ShieldCheck size={11} strokeWidth={2} />
                        <span>Security</span>
                        <div className="hp-flow-lr-bar"><div className="hp-flow-lr-fill" style={{ width: "74%" }} /></div>
                        <span>74</span>
                      </div>
                      <div className="hp-flow-lr">
                        <Eye size={11} strokeWidth={2} />
                        <span>Privacy</span>
                        <div className="hp-flow-lr-bar"><div className="hp-flow-lr-fill bad" style={{ width: "31%" }} /></div>
                        <span className="bad">31</span>
                      </div>
                      <div className="hp-flow-lr">
                        <Scale size={11} strokeWidth={2} />
                        <span>Governance</span>
                        <div className="hp-flow-lr-bar"><div className="hp-flow-lr-fill good" style={{ width: "100%" }} /></div>
                        <span className="good">100</span>
                      </div>
                    </div>
                    <div className="hp-flow-elapsed">~10 seconds</div>
                  </div>
                  <span className="hp-flow-num" aria-hidden="true">02</span>
                  <h3>We scan in ~10 seconds</h3>
                  <p>Three independent risk layers: permissions, code patterns, and publisher history.</p>
                </div>

                <div className="hp-flow-conn" aria-hidden="true"><span /><span /></div>

                {/* Step 3 — Report state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-ui hp-flow-ui--report" aria-hidden="true">
                    <div className="hp-flow-report-top">
                      <span className="hp-flow-report-name">PayPal Honey</span>
                      <span className="hp-flow-report-pill medium">MEDIUM</span>
                    </div>
                    <div className="hp-flow-report-score">
                      <span>66</span><em>/100</em>
                    </div>
                    <div className="hp-flow-report-finds">
                      <div className="hp-flow-find warn"><AlertTriangle size={10} strokeWidth={2} /> Broad host permissions</div>
                      <div className="hp-flow-find warn"><AlertTriangle size={10} strokeWidth={2} /> Data access: high</div>
                      <div className="hp-flow-find ok"><CheckCircle size={10} strokeWidth={2} /> VirusTotal: clear</div>
                    </div>
                  </div>
                  <span className="hp-flow-num" aria-hidden="true">03</span>
                  <h3>Read the findings</h3>
                  <p>Scored report with evidence-linked findings and what they mean for you.</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 5 — Scoring model ─────────────────────────────────── */}
          <section className="hp-layers landing-separator" id="risk-layers" aria-labelledby="hp-layers-title">
            <div className="hp-layers-inner">
              <div className="hp-section-head">
                <p className="hp-eyebrow">The scoring model</p>
                <h2 id="hp-layers-title">Three layers because extensions fail in three different ways.</h2>
              </div>

              <div className="hp-sf">
                <div className="hp-sf-overall" aria-label="Example composite score: 66 out of 100, medium risk">
                  <span className="hp-sf-overall-label">Composite score</span>
                  <div className="hp-sf-overall-track" aria-hidden="true">
                    <div className="hp-sf-overall-fill" style={{ width: "66%" }} />
                  </div>
                  <span className="hp-sf-overall-num warn" aria-hidden="true">66<span className="hp-sf-overall-max">/100</span></span>
                  <span className="hp-sf-risk-pill medium" aria-hidden="true">MEDIUM</span>
                </div>

                <div className="hp-sf-layers" role="list">
                  {RISK_LAYERS.map((layer) => (
                    <div className="hp-sf-layer" key={layer.title} role="listitem">
                      <div className="hp-sf-layer-head">
                        <span className="hp-sf-layer-icon" aria-hidden="true"><layer.Icon size={16} strokeWidth={1.8} /></span>
                        <h3 className="hp-sf-layer-name">{layer.title}</h3>
                      </div>
                      <p className="hp-sf-layer-body">{layer.body}</p>
                      <p className="hp-sf-layer-range">{layer.range}</p>
                      <Link to={layer.link.to} className="hp-sf-layer-link">{layer.link.label}</Link>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 6 — Auditable by design ──────────────────────────── */}
          <section className="hp-open landing-separator" id="open-source" aria-labelledby="hp-open-title">
            <div className="hp-open-inner">
              <div className="hp-open-copy">
                <p className="hp-eyebrow">Auditable by design</p>
                <h2 id="hp-open-title">Our scoring method is public. The code is auditable.</h2>
                <p>
                  Security claims without proof are just marketing. Our three risk layers are
                  implemented in open code on GitHub — anyone can read exactly what signals we look
                  for and how we weight them. You don't have to trust us. You can read us.
                </p>
                <p className="hp-open-honest">
                  We flag our own limits, too: when an extension's code is packed or obfuscated, we
                  say so instead of guessing.
                </p>
                <div className="hp-open-ctas">
                  <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-primary">
                    <Github size={15} strokeWidth={2} aria-hidden />
                    View the source
                  </a>
                  <StarBadge />
                </div>
              </div>

              {/* Repo proof artifact */}
              <div className="hp-repo" aria-hidden="true">
                <div className="hp-repo-header">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="hp-repo-gh-icon" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="hp-repo-path">github.com / Stanzin7 / ExtensionShield</span>
                </div>
                <div className="hp-repo-tree">
                  <div className="hp-repo-dir">
                    <Code2 size={12} strokeWidth={2} />
                    <span>risk_layers<span className="hp-repo-slash">/</span></span>
                  </div>
                  {[
                    { name: "security.py",   desc: "SAST · obfuscation · VirusTotal" },
                    { name: "privacy.py",    desc: "permissions · host access" },
                    { name: "governance.py", desc: "publisher · version history" },
                    { name: "scoring.py",    desc: "weight formula · public" },
                  ].map((f) => (
                    <div className="hp-repo-file" key={f.name}>
                      <span className="hp-repo-tree-chr" aria-hidden="true">├─</span>
                      <span className="hp-repo-ext">py</span>
                      <span className="hp-repo-fname">{f.name}</span>
                      <span className="hp-repo-fdesc">{f.desc}</span>
                    </div>
                  ))}
                </div>
                <div className="hp-repo-footer">
                  <span className="hp-repo-badge">MIT License</span>
                  <span className="hp-repo-badge">Public commits</span>
                  <span className="hp-repo-limit">
                    <AlertTriangle size={10} strokeWidth={2.5} />
                    When code is packed or obfuscated, we say so
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ── Section 7 — For security teams ────────────────────────────── */}
          <section className="hp-ent landing-separator" id="for-teams" aria-labelledby="hp-ent-title">
            <div className="hp-ent-inner">
              {/* Left: positioning + proof + CTA */}
              <div className="hp-ent-copy">
                <p className="hp-eyebrow">For security teams</p>
                <h2 id="hp-ent-title">Security teams need evidence, not claims.</h2>
                <p>
                  ExtensionShield gives your team a scored, auditable report before any extension
                  reaches an employee's browser. Allow or block decisions backed by evidence, not gut calls.
                </p>
                <ul className="hp-ent-proof">
                  <li>
                    <ClipboardCheck size={14} strokeWidth={2} aria-hidden />
                    <span>Pre-install audit — CRX/ZIP or Chrome Web Store URL</span>
                  </li>
                  <li>
                    <ShieldCheck size={14} strokeWidth={2} aria-hidden />
                    <span>Allow or block with attached evidence — not a gut call</span>
                  </li>
                  <li>
                    <Scale size={14} strokeWidth={2} aria-hidden />
                    <span>Review publisher history and version-change signals before approval</span>
                  </li>
                </ul>
                <Link to="/enterprise" className="hp-btn hp-btn-primary hp-ent-cta">
                  Talk to us about Enterprise
                  <ArrowRight size={15} strokeWidth={2} aria-hidden />
                </Link>
              </div>

              {/* Right: pre-install review artifact */}
              <div className="hp-ent-artifact" aria-hidden="true">
                <div className="hp-ent-review">
                  <div className="hp-ent-review-head">
                    <ClipboardCheck size={13} strokeWidth={2} />
                    <span>Pre-install Review</span>
                    <span className="hp-ent-review-type">CRX upload</span>
                  </div>
                  <div className="hp-ent-ext-row">
                    <span className="hp-ent-ext-name">Notionlytics Pro</span>
                    <span className="hp-ent-ext-ver">v2.1.0</span>
                  </div>
                  <div className="hp-ent-scores">
                    <div className="hp-ent-sr">
                      <ShieldCheck size={12} strokeWidth={2} />
                      <span className="hp-ent-sr-name">Security</span>
                      <div className="hp-ent-sr-bar"><div className="hp-ent-sr-fill" style={{ width: "87%" }} /></div>
                      <span className="hp-ent-sr-num">87</span>
                      <span className="hp-ent-verdict pass">Pass</span>
                    </div>
                    <div className="hp-ent-sr">
                      <Eye size={12} strokeWidth={2} />
                      <span className="hp-ent-sr-name">Privacy</span>
                      <div className="hp-ent-sr-bar"><div className="hp-ent-sr-fill warn" style={{ width: "62%" }} /></div>
                      <span className="hp-ent-sr-num warn">62</span>
                      <span className="hp-ent-verdict review">Review</span>
                    </div>
                    <div className="hp-ent-sr">
                      <Scale size={12} strokeWidth={2} />
                      <span className="hp-ent-sr-name">Governance</span>
                      <div className="hp-ent-sr-bar"><div className="hp-ent-sr-fill" style={{ width: "91%" }} /></div>
                      <span className="hp-ent-sr-num">91</span>
                      <span className="hp-ent-verdict pass">Pass</span>
                    </div>
                  </div>
                  <div className="hp-ent-meta">
                    <span>9 permissions</span>
                    <span aria-hidden="true">·</span>
                    <span className="hp-ent-flag">2 findings flagged</span>
                  </div>
                  <div className="hp-ent-decision">
                    <span className="hp-ent-dec-btn allowlist" aria-hidden="true">Allow</span>
                    <span className="hp-ent-dec-btn flag" aria-hidden="true">Review</span>
                    <span className="hp-ent-dec-btn block" aria-hidden="true">Block</span>
                  </div>
                </div>
                <p className="hp-ent-caption" aria-hidden="true">Representative pre-install review workflow</p>
              </div>
            </div>
          </section>

        </div>

        <DemoModal
          isOpen={demoModalOpen}
          onClose={() => setDemoModalOpen(false)}
          triggerRef={demoTriggerRef}
        />
      </div>
    </>
  );
};

export default HomePage;
