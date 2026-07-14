import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle, ChevronDown,
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

const GITHUB_REPO = "ExtensionShield/ExtensionShield";
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

/* ── FAQ: one array drives both the visible section and the FAQPage JSON-LD ─── */
const FAQ_ITEMS = [
  {
    question: "Can I scan a private CRX/ZIP?",
    answer: "Yes. Pro users can upload a private CRX or ZIP build for a pre-release security audit. Sign in and go to Upload CRX/ZIP from the Scan menu.",
  },
  {
    question: "What does the scan check?",
    answer: "The scan analyzes security (SAST, obfuscation, VirusTotal signals), privacy (permissions, host access, network endpoints), and governance (terms-of-service alignment, disclosure and privacy-policy consistency, and claimed-vs-actual behavior). You get evidence-linked findings to support your review.",
  },
  {
    question: "Are my uploads private?",
    answer: "Yes. Reports are private by default — scoped to your account and excluded from the public feed. You choose whether to share a report.",
  },
  {
    question: "Does this help with Chrome Web Store policy risks?",
    answer: "Yes. The governance layer surfaces terms-of-service alignment, disclosure and privacy-policy consistency, and claimed-vs-actual behavior — so you can review store policy risks before submission.",
  },
  {
    question: "Is ExtensionShield just a Chrome extension scanner?",
    answer: "The free scanner is the entry point. ExtensionShield is an open-source scanner with Security, Privacy, and Governance scoring, private CRX/ZIP audits, and evidence-backed decision support.",
  },
  {
    question: "Is the extension scanner free?",
    answer: "Yes. Scanning a public Chrome Web Store extension by URL is free and needs no account. Private CRX/ZIP build audits are a Pro feature.",
  },
  {
    question: "Do I need to install anything to scan an extension?",
    answer: "No. Paste the Chrome Web Store URL into the scanner and you typically get a risk report in well under a minute. An optional browser extension is available for one-click checks.",
  },
];

/* ── The three risk layers ──────────────────────────────────────────────────── */
const RISK_LAYERS = [
  {
    title: "Security",
    Icon: ShieldCheck,
    direction: "Higher score = safer code",
    body: "Code-risk signals: risky APIs, obfuscation, and malware-related indicators.",
    link: { label: "Browser extension security", to: "/extension-security" },
  },
  {
    title: "Privacy",
    Icon: Eye,
    direction: "Higher score = less exposure",
    body: "Permission and data-exposure signals: host access, cookies, clipboard access, and trackers.",
    link: { label: "Chrome extension permissions", to: "/chrome-extension-permissions" },
  },
  {
    title: "Governance",
    Icon: Scale,
    direction: "Higher score = more transparent publisher",
    body: "Publisher transparency signals: terms-of-service alignment, disclosure and privacy-policy consistency, and claimed-vs-actual behavior.",
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
    aria-label={`Example ExtensionShield scan of ${HONEY_SCAN.name}: medium risk. Security 74, Privacy 31, Governance 100. View the full report.`}
  >
    <div className="spc-header">
      <div className="spc-header-left">
        <Lock size={11} strokeWidth={2.5} className="spc-lock-icon" />
        <span className="spc-header-label">Example scan</span>
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

    <p className="spc-illustrative" style={{ margin: "8px 0 0", fontSize: "11px", opacity: 0.7 }}>
      Illustrative example — not a live scan
    </p>
  </Link>
);

/* ── Section 2: update-gap artifact ──────────────────────────────────────────
   Illustrative comparison of two scans a user ran themselves: v12.0.1 (an
   earlier scan) vs v12.4.0 (the current version). Same declared permissions in
   both, but re-scanning surfaces things worth comparing by hand — outbound
   endpoints in code, publisher details, and the privacy disclosure. This is
   user guidance (re-scan and compare), not an automated change-detection or
   monitoring feature. Animation triggers on first scroll into view, replays
   on hover and keyboard focus. Honors prefers-reduced-motion.
   ─────────────────────────────────────────────────────────────────────────── */
const useReducedMotion = () => {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e) => setReduced(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);
  return reduced;
};

const UpdateGapContent = () => (
  <>
    <div className="hp-ugap-header">
      <div className="hp-ugap-icon">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="32" height="32" rx="7" fill="#1e293b" />
          <path
            d="M10 13h1.5v-1a2.5 2.5 0 0 1 5 0v1H18v2h-1a1 1 0 1 0 0 2h1v2h-7v-2h1a1 1 0 1 0 0-2h-2v-2z"
            fill="#475569"
          />
          <path d="M19 19h1.5v1.5h1.5v1.5H17V20h2v-1z" fill="#475569" />
        </svg>
      </div>
      <div className="hp-ugap-meta">
        <span className="hp-ugap-name">Productivity Plus</span>
        <span className="hp-ugap-store">Chrome Web Store</span>
      </div>
    </div>

    {/* Version 1 — an earlier scan the user ran */}
    <div className="hp-ugap-v1">
      <div className="hp-ugap-row-label hp-ugap-row-label--reviewed">
        <span className="hp-ugap-dot hp-ugap-dot--green" />
        <span>v12.0.1 · Earlier scan · low risk</span>
      </div>
      <div className="hp-ugap-chips">
        <span className="hp-ugap-chip hp-ugap-chip--ok">activeTab</span>
        <span className="hp-ugap-chip hp-ugap-chip--ok">storage</span>
        <span className="hp-ugap-chip hp-ugap-chip--ok">cookies</span>
      </div>
      <div className="hp-ugap-pub">
        <span className="hp-ugap-pub-key">Publisher</span>
        <span className="hp-ugap-pub-val">original.dev</span>
      </div>
    </div>

    {/* Timeline divider */}
    <div className="hp-ugap-divider">
      <div className="hp-ugap-divider-rule hp-ugap-divider-rule--left" />
      <span className="hp-ugap-divider-label">v12.4.0 released · 3 months later</span>
      <div className="hp-ugap-divider-rule hp-ugap-divider-rule--right" />
    </div>

    {/* Version 2 — the current version; re-scan and compare by hand */}
    <div className="hp-ugap-v2">
      <div className="hp-ugap-row-label hp-ugap-row-label--needsreview">
        <span className="hp-ugap-dot hp-ugap-dot--amber" />
        <span>v12.4.0 · Re-scan now</span>
      </div>
      <div className="hp-ugap-unchanged">
        <CheckCircle size={11} strokeWidth={2.5} aria-hidden />
        <span>Declared permissions unchanged</span>
      </div>
      <div className="hp-ugap-chips">
        <span className="hp-ugap-chip hp-ugap-chip--ok">activeTab</span>
        <span className="hp-ugap-chip hp-ugap-chip--ok">storage</span>
        <span className="hp-ugap-chip hp-ugap-chip--ok">cookies</span>
      </div>
      <div className="hp-ugap-signals">
        <span className="hp-ugap-signals-label">Compare these yourself</span>
        <div className="hp-ugap-signal hp-ugap-signal--n1">
          <span className="hp-ugap-signal-glyph" aria-hidden>↗</span>
          <span className="hp-ugap-signal-key">Network endpoints in code</span>
          <span className="hp-ugap-signal-val">any new destinations?</span>
        </div>
        <div className="hp-ugap-signal hp-ugap-signal--n2">
          <span className="hp-ugap-signal-glyph" aria-hidden>§</span>
          <span className="hp-ugap-signal-key">Privacy disclosure</span>
          <span className="hp-ugap-signal-val">still consistent?</span>
        </div>
        <div className="hp-ugap-signal hp-ugap-signal--n3">
          <span className="hp-ugap-signal-glyph" aria-hidden>⌁</span>
          <span className="hp-ugap-signal-key">Code patterns</span>
          <span className="hp-ugap-signal-val">obfuscation or risky APIs?</span>
        </div>
        <div className="hp-ugap-signal hp-ugap-signal--n4">
          <span className="hp-ugap-signal-glyph" aria-hidden>!</span>
          <span className="hp-ugap-signal-key">Composite score</span>
          <span className="hp-ugap-signal-val">moved up or down?</span>
        </div>
      </div>
    </div>

    <div className="hp-ugap-footer">
      <AlertTriangle size={11} strokeWidth={2.5} aria-hidden />
      <span>Re-scan periodically and compare the findings yourself</span>
    </div>
  </>
);

const UpdateGapArtifact = () => {
  const ref = useRef(null);
  const [playKey, setPlayKey] = useState(0);
  const reducedMotion = useReducedMotion();

  // Auto-play on first scroll into view
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") return;
    const node = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setPlayKey((k) => k + 1);
            io.disconnect();
          }
        });
      },
      { threshold: 0.35 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  const replay = useCallback(() => {
    if (reducedMotion) return;
    setPlayKey((k) => k + 1);
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      className={`hp-ugap ${reducedMotion ? "is-reduced" : "is-animated"}`}
      tabIndex={0}
      role="figure"
      aria-label="Illustrative comparison of two scans you run yourself: extension version 12.0.1 and 12.4.0. Declared permissions are unchanged between versions. When you re-scan, compare these by hand: network endpoints referenced in the code, whether the privacy disclosure is still consistent, code patterns such as obfuscation or risky APIs, and whether the composite score moved. Re-scan periodically and compare the findings yourself."
      onMouseEnter={replay}
      onFocus={replay}
    >
      <UpdateGapContent key={playKey} />
    </div>
  );
};

/* ── How-it-works motion wrapper ─────────────────────────────────────────────
   Plays a single subtle search → scan → findings sequence the first time the
   section crosses ~40% of the viewport. Does NOT replay on hover, focus, or
   re-entry. Honors prefers-reduced-motion.

   States (mutually exclusive class on `.hp-flow`):
     is-pending  — initial hidden state held until IntersectionObserver fires
     is-animated — keyframes run (one-shot, animation-fill-mode: both)
     is-reduced  — show final state immediately, no animation
   Per-card hover affordance (subtle border/shadow lift) lives on
   `.hp-flow-ui:hover` and is independent of this state machine.
   ─────────────────────────────────────────────────────────────────────────── */
const HowItWorksFlow = ({ children }) => {
  const ref = useRef(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || !ref.current || typeof IntersectionObserver === "undefined") return;
    const node = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setShouldAnimate(true);
            io.disconnect();
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [reducedMotion]);

  const stateClass = reducedMotion
    ? "is-reduced"
    : shouldAnimate
      ? "is-animated"
      : "is-pending";

  return (
    <div
      ref={ref}
      className={`hp-flow ${stateClass}`}
      aria-label="Three-step process: search, scan, read results"
    >
      <div className="hp-flow-inner">
        {children}
      </div>
    </div>
  );
};

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
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const demoTriggerRef = useRef(null);

  // FAQ accordion: index of the open item (0 = first open by default; null = all closed)
  const [faqOpen, setFaqOpen] = useState(null);

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
    "mainEntity": FAQ_ITEMS.map(({ question, answer }) => ({
      "@type": "Question",
      "name": question,
      "acceptedAnswer": { "@type": "Answer", "text": answer },
    })),
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
                    Pre-install risk assessment: permissions, host access, network endpoints, and publisher transparency.
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

          {/* ── Section 2 — How it works ──────────────────────────────────── */}
          <section className="hp-how landing-separator" id="how-it-works" aria-labelledby="hp-how-title">
            <div className="hp-how-inner">
              <div className="hp-section-head">
                <p className="hp-eyebrow">How it works</p>
                <h2 id="hp-how-title">Search, scan, read the findings.</h2>
              </div>

              <HowItWorksFlow>
                {/* Step 1 — Input state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-step-head">
                    <span className="hp-flow-num" aria-hidden="true">01</span>
                    <h3>Search or paste</h3>
                  </div>
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
                  <p>Find any extension by name, or paste a Chrome Web Store URL.</p>
                </div>

                <div className="hp-flow-conn" aria-hidden="true"><span /><span /></div>

                {/* Step 2 — Scan state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-step-head">
                    <span className="hp-flow-num" aria-hidden="true">02</span>
                    <h3>We scan, typically in well under a minute</h3>
                  </div>
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
                    <div className="hp-flow-elapsed">Under a minute</div>
                  </div>
                  <p>Three independent risk layers: permissions, code patterns, and publisher transparency.</p>
                </div>

                <div className="hp-flow-conn" aria-hidden="true"><span /><span /></div>

                {/* Step 3 — Report state */}
                <div className="hp-flow-step">
                  <div className="hp-flow-step-head">
                    <span className="hp-flow-num" aria-hidden="true">03</span>
                    <h3>Read the findings</h3>
                  </div>
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
                  <p>Scored report with evidence-linked findings and what they mean for you.</p>
                </div>
              </HowItWorksFlow>
            </div>
          </section>

          {/* ── Section 3 — Scoring model ─────────────────────────────────── */}
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

                {/* Signal-flow cue — quiet label clarifying that the composite
                    above is built from the three layers below. The three
                    ticks sit above each column to make the merge visible. */}
                <div className="hp-sf-flow" aria-hidden="true">
                  <span className="hp-sf-flow-tick" />
                  <span className="hp-sf-flow-tick" />
                  <span className="hp-sf-flow-tick" />
                  <span className="hp-sf-flow-label">
                    Three independent layers combine into the composite score above
                  </span>
                </div>

                <div className="hp-sf-layers" role="list">
                  {RISK_LAYERS.map((layer) => (
                    <div className="hp-sf-layer" key={layer.title} role="listitem">
                      <div className="hp-sf-layer-head">
                        <span className="hp-sf-layer-icon" aria-hidden="true"><layer.Icon size={16} strokeWidth={1.8} /></span>
                        <h3 className="hp-sf-layer-name">{layer.title}</h3>
                      </div>
                      <p className="hp-sf-layer-body">{layer.body}</p>
                      <p className="hp-sf-layer-direction">{layer.direction}</p>
                      <Link to={layer.link.to} className="hp-sf-layer-link">{layer.link.label}</Link>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hp-sf-cta">
                <Link to="/research/methodology" className="hp-sf-cta-primary">
                  See how we score
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
                <span className="hp-sf-cta-sep" aria-hidden="true">·</span>
                <Link to="/scan" className="hp-sf-cta-secondary">Scan an extension</Link>
              </div>
            </div>
          </section>

          {/* ── Section 4 — The Update Gap ────────────────────────────────── */}
          <section className="hp-problem landing-separator" id="the-problem" aria-labelledby="hp-problem-title">
            <div className="hp-problem-inner">
              <div className="hp-problem-copy">
                <p className="hp-eyebrow">The update gap</p>
                <h2 id="hp-problem-title">The extension you trusted can change after install.</h2>
                <p>
                  Permissions are only one signal. Extensions auto-update, and a later version can
                  change code behavior or network destinations — even when declared permissions stay
                  the same.
                </p>
                <p>
                  A single scan reflects the version available right now. Re-scan periodically and
                  compare the findings yourself so you can spot what changed between versions.
                </p>
                <p className="hp-problem-aside">
                  <Link to="/research/case-studies/honey" className="hp-problem-aside-link">
                    Read the Honey case study
                    <ArrowRight size={13} strokeWidth={2} aria-hidden />
                  </Link>
                </p>
              </div>

              <UpdateGapArtifact />
            </div>
          </section>

          {/* ── Section 5 — Auditable by design ──────────────────────────── */}
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

              {/* Repo proof artifact — links resolve to the real source files */}
              <div className="hp-repo">
                <div className="hp-repo-header">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="hp-repo-gh-icon" aria-hidden="true">
                    <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                  <span className="hp-repo-path">github.com / Stanzin7 / ExtensionShield</span>
                </div>
                <div className="hp-repo-tree">
                  <div className="hp-repo-dir">
                    <Code2 size={12} strokeWidth={2} aria-hidden="true" />
                    <span>src/extension_shield/scoring<span className="hp-repo-slash">/</span></span>
                  </div>
                  {[
                    { name: "weights.py", label: "scoring/weights.py", desc: "transparent 34/33/33 weights", href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/weights.py` },
                    { name: "gates.py",   label: "scoring/gates.py",   desc: "hard BLOCK gates",            href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/gates.py` },
                    { name: "engine.py",  label: "scoring/engine.py",  desc: "combines the three layers",   href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/engine.py` },
                    { name: "governance/", label: "governance/",       desc: "ToS, disclosure & consistency signals", href: `${GITHUB_URL}/tree/master/src/extension_shield/governance` },
                  ].map((f) => (
                    <a
                      className="hp-repo-file"
                      key={f.label}
                      href={f.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${f.label} — ${f.desc} (opens on GitHub)`}
                    >
                      <span className="hp-repo-tree-chr" aria-hidden="true">├─</span>
                      <span className="hp-repo-ext">{f.label.endsWith("/") ? "dir" : "py"}</span>
                      <span className="hp-repo-fname">{f.label}</span>
                      <span className="hp-repo-fdesc">{f.desc}</span>
                    </a>
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

          {/* ── Section 6 — FAQ (visible; mirrors the FAQPage JSON-LD) ─────── */}
          <section className="hp-faq landing-separator" id="faq" aria-labelledby="hp-faq-title">
            <div className="home-faq-inner" style={{ maxWidth: "760px", margin: "0 auto" }}>
              <div className="hp-section-head">
                <h2 id="hp-faq-title" className="home-faq-title">Frequently asked questions</h2>
              </div>
              <dl className="hp-faq-list">
                {FAQ_ITEMS.map(({ question, answer }, i) => {
                  const isOpen = faqOpen === i;
                  return (
                    <div key={question} className={`hp-faq-item${isOpen ? " is-open" : ""}`}>
                      <dt className="hp-faq-dt">
                        <button
                          type="button"
                          className="hp-faq-q"
                          aria-expanded={isOpen}
                          aria-controls={`faq-panel-${i}`}
                          id={`faq-btn-${i}`}
                          onClick={() => setFaqOpen(isOpen ? null : i)}
                        >
                          <span className="hp-faq-q-text">{question}</span>
                          <ChevronDown className="hp-faq-chevron" size={18} strokeWidth={2} aria-hidden />
                        </button>
                      </dt>
                      <dd
                        id={`faq-panel-${i}`}
                        role="region"
                        aria-labelledby={`faq-btn-${i}`}
                        className="hp-faq-a"
                      >
                        <div className="hp-faq-a-inner">
                          <p className="hp-faq-a-text">{answer}</p>
                        </div>
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="hp-faq-foot">
                Still have a question?{" "}
                <a className="hp-faq-foot-link" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
                  Read the source on GitHub
                </a>
                .
              </p>
            </div>
          </section>

          {/* Section 7 — For security teams CTA band: temporarily hidden.
             The /enterprise route is still served by a minimal placeholder page. */}

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
