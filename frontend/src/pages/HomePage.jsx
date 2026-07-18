import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  AlertTriangle, ArrowRight, CheckCircle, ChevronDown, ChevronLeft, ChevronRight,
  Download, Eye, Folder, Github, Lock, Puzzle, Scale, ShieldAlert, ShieldCheck,
  Star, TrendingUp,
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

/* Real frozen PayPal Honey scan — the risk-analysis step-3 card links to its
   live report (extension id bmnlcjabgnpnenekpadlanbbkooimhnj). */
const HONEY_SCAN = {
  extensionId: "bmnlcjabgnpnenekpadlanbbkooimhnj",
  name: "PayPal Honey: Coupons & Cash Back",
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

/* ── The three risk layers (drive the merged risk-analysis section) ──────────
   Short descriptions label what each layer inspects. Score reflects the frozen
   PayPal Honey scan (Security 74, Privacy 31, Governance 100); higher = safer.
   Each layer keeps its topic link so the internal-link graph to the pillar
   pages is preserved. ─────────────────────────────────────────────────────── */
const SCAN_LAYERS = [
  {
    label: "Security",
    Icon: ShieldCheck,
    score: 74,
    desc: "Code safety, permissions, vulnerabilities",
    link: { label: "Browser extension security", to: "/extension-security" },
  },
  {
    label: "Privacy",
    Icon: Eye,
    score: 31,
    desc: "Data collection, tracking, data usage",
    link: { label: "Chrome extension permissions", to: "/chrome-extension-permissions" },
  },
  {
    label: "Governance",
    Icon: Scale,
    score: 100,
    desc: "Publisher trust, transparency, policy",
    link: { label: "Extension governance", to: "/extension-governance" },
  },
];

/* Score → tier (higher is safer): drives meter + number colour. */
const SCAN_METER_SEGMENTS = 5;
const scoreTier = (s) => (s >= 67 ? "good" : s >= 34 ? "warn" : "bad");

/* Multi-colour Chrome logo used in the search inputs + how-it-works step. */
const ChromeLogo = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="chrome-logo" aria-hidden="true">
    <path d="M12 12L22 12A10 10 0 0 1 7 3.34L12 12Z" fill="#4285F4" />
    <path d="M12 12L7 3.34A10 10 0 0 1 7 20.66L12 12Z" fill="#EA4335" />
    <path d="M12 12L7 20.66A10 10 0 0 1 22 12L12 12Z" fill="#FBBC05" />
    <circle cx="12" cy="12" r="4" fill="#34A853" />
    <circle cx="12" cy="12" r="2.5" fill="white" />
  </svg>
);

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

/* ── Hero: six real frozen scan snapshots ────────────────────────────────────
   Captured from live ExtensionShield scans (scoring_v2). Icons are static
   assets in /public/hero-scans/<id>.png; each card links to the real report.
   The carousel auto-advances (pauses on hover/focus, honours reduced motion).
   ──────────────────────────────────────────────────────────────────────────── */
const HERO_SCANS = [
  { id: "nngceckbapebfimnlniiiahkandclblb", name: "Bitwarden Password Manager",   version: "2026.6.1",      overall: 73, risk: "MEDIUM", pill: "medium", permissions: 18, security: 87, privacy: 31, governance: 100 },
  { id: "aapbdbdomjkkjkaonfhkkikfgjllcleb", name: "Google Translate",             version: "2.0.17",       overall: 80, risk: "LOW",    pill: "good",   permissions: 5,  security: 85, privacy: 95, governance: 100 },
  { id: "kdpelmjpfafjppnhbloffcjpeomlnpah", name: "WPS PDF Editor",               version: "1.0.0.58",     overall: 36, risk: "HIGH",   pill: "bad",    permissions: 11, security: 14, privacy: 33, governance: 62  },
  { id: "aeblfdkhhhdcdjpifhhbdiojplfjncoa", name: "1Password – Password Manager", version: "8.12.26.40",   overall: 56, risk: "MEDIUM", pill: "medium", permissions: 17, security: 84, privacy: 35, governance: 49  },
  { id: "ddkjiahejlhfcafbddmgiahcphecmpfh", name: "uBlock Origin Lite",           version: "2026.705.2152", overall: 86, risk: "LOW",   pill: "good",   permissions: 9,  security: 82, privacy: 75, governance: 100 },
  { id: "knheggckgoiihginacbkhaalnibhilkk", name: "Notion Web Clipper",           version: "0.2.13",       overall: 80, risk: "LOW",    pill: "good",   permissions: 8,  security: 98, privacy: 88, governance: 100 },
];

const HERO_ROTATE_MS = 4000; // auto-advance interval; pauses on hover/focus

const HeroScanCard = ({ scan, active }) => {
  const rows = [
    { label: "Security",   Icon: ShieldCheck, score: scan.security },
    { label: "Privacy",    Icon: Eye,         score: scan.privacy },
    { label: "Governance", Icon: Scale,       score: scan.governance },
  ];
  return (
    <Link
      to={getScanResultsRoute(scan.id)}
      className="spc-card"
      tabIndex={active ? 0 : -1}
      aria-hidden={active ? undefined : true}
      aria-label={`Example scan of ${scan.name}: ${scan.overall} out of 100, ${scan.risk.toLowerCase()} risk. View the full report.`}
    >
      <div className="spc-header">
        <div className="spc-header-left">
          <Lock size={11} strokeWidth={2.5} className="spc-lock-icon" />
          <span className="spc-header-label">Example scan</span>
        </div>
        <span className={`spc-risk-pill ${scan.pill}`}>{scan.risk}</span>
      </div>

      <div className="spc-ext-row">
        <div className="spc-ext-icon">
          <img
            src={`/hero-scans/${scan.id}.png`}
            alt=""
            width="36"
            height="36"
            loading="lazy"
            onError={(e) => { e.target.onerror = null; e.target.src = EXTENSION_ICON_PLACEHOLDER; }}
          />
        </div>
        <div className="spc-ext-meta">
          <span className="spc-ext-name">{scan.name}</span>
          <span className="spc-ext-sub">Chrome Web Store · v{scan.version}</span>
        </div>
        <div className={`spc-ext-overall ${scan.pill}`}>
          <span className="spc-overall-num">{scan.overall}</span>
          <span className="spc-overall-max">/100</span>
        </div>
      </div>

      <div className="spc-scores">
        {rows.map((s) => {
          const v = scoreTier(s.score);
          return (
            <div className="spc-score-row" key={s.label}>
              <s.Icon size={13} className={`spc-score-icon ${v}`} />
              <span className="spc-score-label">{s.label}</span>
              <div className="spc-bar">
                <div className={`spc-bar-fill ${v}`} style={{ width: `${s.score}%` }} />
              </div>
              <span className={`spc-score-num ${v}`}>{s.score}</span>
            </div>
          );
        })}
      </div>

      <div className="spc-footer">
        <span>{scan.permissions} permissions</span>
        <span className="spc-view">View report →</span>
      </div>
    </Link>
  );
};

const ScanCarousel = () => {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const count = HERO_SCANS.length;

  useEffect(() => {
    if (reducedMotion || paused) return undefined;
    const id = setInterval(() => setIndex((i) => (i + 1) % count), HERO_ROTATE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, paused, count]);

  const go = useCallback((n) => setIndex(((n % count) + count) % count), [count]);

  return (
    <div
      className="hero-carousel"
      role="group"
      aria-roledescription="carousel"
      aria-label="Example extension scans"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="hero-carousel-viewport">
        {HERO_SCANS.map((scan, i) => (
          <div className={`hero-carousel-slide${i === index ? " is-active" : ""}`} key={scan.id}>
            <HeroScanCard scan={scan} active={i === index} />
          </div>
        ))}
      </div>

      <div className="hero-carousel-controls">
        <button type="button" className="hero-carousel-arrow" onClick={() => go(index - 1)} aria-label="Previous example scan">
          <ChevronLeft size={16} strokeWidth={2.5} aria-hidden />
        </button>
        <div className="hero-carousel-dots">
          {HERO_SCANS.map((scan, i) => (
            <button
              type="button"
              key={scan.id}
              className={`hero-carousel-dot${i === index ? " is-active" : ""}`}
              onClick={() => go(i)}
              aria-label={`Show ${scan.name}`}
              aria-current={i === index ? "true" : undefined}
            />
          ))}
        </div>
        <button type="button" className="hero-carousel-arrow" onClick={() => go(index + 1)} aria-label="Next example scan">
          <ChevronRight size={16} strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
};

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
    {/* Header — extension identity */}
    <div className="hp-ugap-head">
      <span className="hp-ugap-icon" aria-hidden="true"><Puzzle size={22} strokeWidth={2} /></span>
      <div className="hp-ugap-id">
        <span className="hp-ugap-name">Productivity Plus</span>
        <span className="hp-ugap-pub">Publisher: origami.dev</span>
      </div>
    </div>

    <div className="hp-ugap-rule" aria-hidden="true" />

    {/* Version diff — earlier scan vs latest version */}
    <div className="hp-ugap-versions">
      <div className="hp-ugap-ver">
        <span className="hp-ugap-ver-pill good">v12.0.1</span>
        <span className="hp-ugap-ver-cap good"><span className="hp-ugap-ver-dot" />Earlier scan</span>
      </div>
      <span className="hp-ugap-arrow" aria-hidden="true">
        <svg width="58" height="12" viewBox="0 0 58 12" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="0" y1="6" x2="46" y2="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
          <path d="M45 2l6 4-6 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="hp-ugap-ver">
        <span className="hp-ugap-ver-pill warn">v12.4.0</span>
        <span className="hp-ugap-ver-cap warn"><span className="hp-ugap-ver-dot" />Latest version</span>
      </div>
    </div>

    <div className="hp-ugap-rule" aria-hidden="true" />

    {/* What changed between the two versions */}
    <div className="hp-ugap-tiles">
      <div className="hp-ugap-tile good">
        <span className="hp-ugap-tile-icon"><TrendingUp size={18} strokeWidth={2} aria-hidden /></span>
        <span className="hp-ugap-tile-text">
          <span className="hp-ugap-tile-strong">+2</span>
          <span className="hp-ugap-tile-sub">endpoints</span>
        </span>
      </div>
      <div className="hp-ugap-tile warn">
        <span className="hp-ugap-tile-icon"><ShieldAlert size={18} strokeWidth={2} aria-hidden /></span>
        <span className="hp-ugap-tile-text">
          <span className="hp-ugap-tile-strong">Privacy</span>
          <span className="hp-ugap-tile-sub">updated</span>
        </span>
      </div>
      <div className="hp-ugap-tile good">
        <span className="hp-ugap-tile-icon"><CheckCircle size={18} strokeWidth={2} aria-hidden /></span>
        <span className="hp-ugap-tile-text">
          <span className="hp-ugap-tile-strong">Permissions</span>
          <span className="hp-ugap-tile-sub">unchanged</span>
        </span>
      </div>
    </div>
  </>
);

const UpdateGapArtifact = () => (
  <div
    className="hp-ugap"
    role="figure"
    aria-label="Illustrative version comparison for an extension: an earlier scan of v12.0.1 versus the latest v12.4.0. Between the two versions, 2 new network endpoints appeared and the privacy disclosure was updated, while the declared permissions stayed unchanged."
  >
    <UpdateGapContent />
  </div>
);

/* ── Risk-analysis reveal wrapper ────────────────────────────────────────────
   Plays a single subtle staggered rise on the two decorative mock cards (search,
   layers) + connectors the first time the merged section crosses ~30% of the
   viewport. One-shot; does not replay. Honors prefers-reduced-motion. The Step-3
   report card is a real <Link> and is never hidden; all step text, the composite
   score, and links stay visible at all times so the prerendered/no-JS page is
   never blank and never traps focus on an invisible link.

   States (mutually exclusive class on `.hp-ra-flow`):
     is-pending  — cards/connectors held hidden until IntersectionObserver fires
     is-animated — staggered rise runs once (animation-fill-mode: both)
     is-reduced  — everything visible immediately, no animation
   ─────────────────────────────────────────────────────────────────────────── */
const RiskAnalysisFlow = ({ children }) => {
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
      { threshold: 0.3 }
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
    <div ref={ref} className={`hp-ra-flow ${stateClass}`}>
      {children}
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
          <h1 className="hero-title">Extensions can access your browsing data. Scan one before you install it.</h1>
          <p className="hero-mobile-subhead">
            Paste a Chrome Web Store URL to check permissions, host access, and a risk score before
            you install. No signup.
          </p>

          <div className="hero-mobile-search">
            <span className="search-icon-chrome" aria-hidden="true">
              <ChromeLogo />
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
              {/* Faint brand shield watermark behind the scan card (desktop) */}
              <div className="hero-shield-bg" aria-hidden="true">
                <img src="/extension-shield-logo.svg" alt="" />
              </div>

              {/* Left: headline + search */}
              <div className="hero-left">
                <p className="hero-eyebrow">Free · Open-source · Chrome extension scanner</p>
                <h1 className="hero-title">
                  Extensions can access your browsing data.{" "}
                  <span className="hero-title-accent">Scan one before you install it.</span>
                </h1>
                <p className="hero-subhead">
                  ExtensionShield checks permissions, privacy exposure, code signals, and
                  publisher transparency before an extension reaches your browser.
                </p>

                <div className="hero-search">
                  <div className="search-container hero-search-container">
                    <span className="search-icon search-icon-chrome" aria-hidden="true">
                      <ChromeLogo />
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
                </div>

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

              {/* Right: auto-rotating carousel of real scan snapshots */}
              <div className="hero-right">
                <ScanCarousel />
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

          {/* ── Section 2 — Risk analysis (How it works + Scoring model, merged) ── */}
          <section className="hp-ra" id="how-it-works" aria-labelledby="hp-ra-title">
            <div className="hp-ra-inner">
              <div className="hp-ra-head">
                <p className="hp-ra-eyebrow">
                  <ShieldCheck size={13} strokeWidth={2.5} aria-hidden />
                  ExtensionShield risk analysis
                </p>
                <h2 id="hp-ra-title">Search, scan, understand the risk.</h2>
                <p className="hp-ra-sub">
                  ExtensionShield analyzes security, privacy, and governance signals to
                  generate a clear risk score you can trust.
                </p>
              </div>

              <RiskAnalysisFlow>
                <div className="hp-ra-steps">
                  {/* Step 1 — Search */}
                  <div className="hp-ra-step">
                    <div className="hp-ra-step-head">
                      <span className="hp-ra-num" aria-hidden="true">1</span>
                      <div className="hp-ra-step-heading">
                        <h3>Search any extension</h3>
                        <p>Find by name or paste a Chrome Web Store URL.</p>
                      </div>
                    </div>
                    <div className="hp-ra-card hp-ra-card--search" aria-hidden="true">
                      <div className="hp-ra-search-bar">
                        <span className="hp-ra-search-icon">
                          <ChromeLogo />
                        </span>
                        <span className="hp-ra-search-text">PayPal Honey</span>
                        <span className="hp-ra-search-go"><ArrowRight size={13} strokeWidth={2.5} /></span>
                      </div>
                    </div>
                  </div>

                  <div className="hp-ra-conn" aria-hidden="true"><span className="hp-ra-conn-line" /></div>

                  {/* Step 2 — Scan (three risk layers) */}
                  <div className="hp-ra-step">
                    <div className="hp-ra-step-head">
                      <span className="hp-ra-num" aria-hidden="true">2</span>
                      <div className="hp-ra-step-heading">
                        <h3>We scan in under a minute</h3>
                        <p>Our engine evaluates 3 independent risk layers.</p>
                      </div>
                    </div>
                    <div className="hp-ra-card hp-ra-card--layers" aria-hidden="true">
                      {SCAN_LAYERS.map((layer) => {
                        const tier = scoreTier(layer.score);
                        const filled = Math.round((layer.score / 100) * SCAN_METER_SEGMENTS);
                        return (
                          <div className="hp-ra-layer" key={layer.label}>
                            <span className={`hp-ra-layer-icon ${tier}`}>
                              <layer.Icon size={15} strokeWidth={2} />
                            </span>
                            <div className="hp-ra-layer-meta">
                              <span className="hp-ra-layer-name">{layer.label}</span>
                              <span className="hp-ra-layer-desc">{layer.desc}</span>
                            </div>
                            <div className="hp-ra-layer-right">
                              <div className={`hp-ra-meter ${tier}`}>
                                {Array.from({ length: SCAN_METER_SEGMENTS }).map((_, i) => (
                                  <span key={i} className={`hp-ra-meter-seg${i < filled ? " on" : ""}`} />
                                ))}
                              </div>
                              <span className={`hp-ra-layer-score ${tier}`}>{layer.score}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="hp-ra-conn" aria-hidden="true"><span className="hp-ra-conn-line" /></div>

                  {/* Step 3 — Findings (links to the real frozen report) */}
                  <div className="hp-ra-step">
                    <div className="hp-ra-step-head">
                      <span className="hp-ra-num" aria-hidden="true">3</span>
                      <div className="hp-ra-step-heading">
                        <h3>Get clear findings</h3>
                        <p>Understand the risks and what they mean.</p>
                      </div>
                    </div>
                    <Link
                      to={getScanResultsRoute(HONEY_SCAN.extensionId)}
                      className="hp-ra-card hp-ra-card--report"
                      aria-label={`Example scan of ${HONEY_SCAN.name}: 66 out of 100, medium risk. View the full report.`}
                    >
                      <div className="hp-ra-rep-head">
                        <span className="hp-ra-rep-icon" aria-hidden="true"><HoneyHexLogo /></span>
                        <div className="hp-ra-rep-id">
                          <span className="hp-ra-rep-name">PayPal Honey: Coupons &amp; Cash Back</span>
                          <span className="hp-ra-rep-pub">Honey · Chrome Web Store</span>
                        </div>
                        <div className="hp-ra-rep-scorebox">
                          <span className="hp-ra-rep-score">66<em>/100</em></span>
                          <span className="hp-ra-risk-pill medium">Medium risk</span>
                        </div>
                      </div>
                      <div className="hp-ra-rep-rule" aria-hidden="true" />
                      <div className="hp-ra-rep-finds">
                        <div className="hp-ra-find warn"><AlertTriangle size={13} strokeWidth={2} /><span>Requests broad host permissions</span></div>
                        <div className="hp-ra-find ok"><CheckCircle size={13} strokeWidth={2} /><span>No critical vulnerabilities detected</span></div>
                        <div className="hp-ra-find warn"><Eye size={13} strokeWidth={2} /><span>Third-party tracking scripts detected</span></div>
                      </div>
                      <div className="hp-ra-rep-rule" aria-hidden="true" />
                      <div className="hp-ra-rep-foot">
                        <span className="hp-ra-rep-link">View full report</span>
                        <ArrowRight size={16} strokeWidth={2} aria-hidden />
                      </div>
                    </Link>
                  </div>
                </div>
              </RiskAnalysisFlow>
            </div>

            {/* Foot: primary CTA + preserved topic links (internal-link graph) */}
            <div className="hp-ra-foot">
              <div className="hp-ra-foot-cta">
                <Link to="/research/methodology" className="hp-ra-cta-primary">
                  See how we score
                  <ArrowRight size={14} strokeWidth={2} aria-hidden />
                </Link>
                <span className="hp-ra-cta-sep" aria-hidden="true">·</span>
                <Link to="/scan" className="hp-ra-cta-secondary">Scan an extension</Link>
              </div>
              <p className="hp-ra-foot-links">
                {SCAN_LAYERS.map((layer, i) => (
                  <React.Fragment key={layer.link.to}>
                    {i > 0 && <span className="hp-ra-foot-sep" aria-hidden="true">·</span>}
                    <Link to={layer.link.to} className="hp-ra-foot-link">{layer.link.label}</Link>
                  </React.Fragment>
                ))}
              </p>
            </div>
          </section>

          {/* ── Section 4 — The Update Gap ────────────────────────────────── */}
          <section className="hp-problem landing-separator" id="the-problem" aria-labelledby="hp-problem-title">
            <div className="hp-problem-inner">
              <div className="hp-problem-copy">
                <p className="hp-eyebrow">The update gap</p>
                <h2 id="hp-problem-title">The extension you trusted<br />can change after install.</h2>
                <p>
                  Extensions auto-update. A later version can change code behavior, network
                  destinations, or privacy practices—even when its declared permissions stay the same.
                </p>
                <p>Re-scan periodically to see what changed.</p>
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
                <h2 id="hp-open-title">Our scoring method is public.<br />The code is auditable.</h2>
                <p>
                  ExtensionShield&apos;s three risk layers are implemented in open code on GitHub.
                  Anyone can review the exact signals we use and how they&apos;re weighted.
                </p>
                <p className="hp-open-honest">
                  When an extension&apos;s code is packed or obfuscated, we flag that clearly.
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
                  <span className="hp-repo-path">
                    github.com
                    <span className="hp-repo-sep" aria-hidden="true">/</span>
                    {GITHUB_REPO.split("/")[0]}
                    <span className="hp-repo-sep" aria-hidden="true">/</span>
                    {GITHUB_REPO.split("/")[1]}
                  </span>
                </div>
                <div className="hp-repo-rows">
                  {[
                    { label: "scoring/weights.py", desc: "transparent 34/33/33 weights",          href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/weights.py` },
                    { label: "scoring/gates.py",   desc: "hard BLOCK gates",                       href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/gates.py` },
                    { label: "scoring/engine.py",  desc: "combines the three layers",              href: `${GITHUB_URL}/blob/master/src/extension_shield/scoring/engine.py` },
                    { label: "governance/",        desc: "ToS, disclosure & consistency signals", dir: true, href: `${GITHUB_URL}/tree/master/src/extension_shield/governance` },
                  ].map((f) => (
                    <a
                      className="hp-repo-row"
                      key={f.label}
                      href={f.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${f.label} — ${f.desc} (opens on GitHub)`}
                    >
                      <ChevronRight className="hp-repo-caret" size={13} strokeWidth={2.5} aria-hidden />
                      {f.dir ? (
                        <span className="hp-repo-badge-icon"><Folder size={13} strokeWidth={2} aria-hidden /></span>
                      ) : (
                        <span className="hp-repo-py">PY</span>
                      )}
                      <span className="hp-repo-fname">{f.label}</span>
                      <span className="hp-repo-dash" aria-hidden="true">—</span>
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
