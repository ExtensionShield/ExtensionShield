import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import extensionCacheService from "../../services/extensionCacheService";
import { EXTENSION_ICON_PLACEHOLDER, getExtensionIconUrl } from "../../utils/constants";
import { HERO_SNAPSHOT } from "../../data/heroSnapshot";
import { getScanResultsRoute } from "../../utils/slug";
import "./HeroOrbitalCarousel.scss";

const VIEWPORT_COMPACT = 1024;

// Primary ring: main interactive layer
const PRIMARY_RADIUS = 170;
const PRIMARY_DURATION = 45; // seconds, clockwise
const PRIMARY_ICON_COUNT = 7;

// Secondary ring: depth only, subtle
const SECONDARY_RADIUS = 240;
const SECONDARY_DURATION = 65; // seconds, counter-clockwise
const SECONDARY_ICON_COUNT = 5;

// Orbit is circular in 3D (rotateY only); rotateX tilt projects it as an ellipse on screen.
const ORBIT_TILT = 17; // rotateX 16–18deg
const MAX_SCANS = PRIMARY_ICON_COUNT + SECONDARY_ICON_COUNT;

// Fallback when snapshot is empty (should not happen)
const PLACEHOLDER_SCANS = HERO_SNAPSHOT.slice(0, MAX_SCANS);

function mapSignal(signal, fallbackLabel = "—") {
  if (!signal) return { level: "ok", label: fallbackLabel, score: 0 };
  return {
    level: signal.level || "ok",
    label: signal.label || fallbackLabel,
    score: Number.isFinite(signal.score) ? Math.max(0, Math.min(100, signal.score)) : 0,
  };
}

function simplifyScan(scan) {
  // Handle both DB format (signals.security_signal) and static snapshot format (security directly)
  const security = scan?.security?.level 
    ? scan.security 
    : mapSignal(scan?.signals?.security_signal, "Security");
  const privacy = scan?.privacy?.level 
    ? scan.privacy 
    : mapSignal(scan?.signals?.privacy_signal, "Privacy");
  const governance = scan?.governance?.level 
    ? scan.governance 
    : mapSignal(scan?.signals?.governance_signal, "Governance");

  return {
    extensionId: scan?.extension_id || scan?.id || scan?.extensionId,
    extension_id: scan?.extension_id || scan?.extensionId,
    name: scan?.name || scan?.extension_name || scan?.metadata?.name || "Extension",
    extension_name: scan?.extension_name || scan?.name || scan?.extensionId,
    slug: scan?.slug,
    icon_base64: scan?.icon_base64,
    icon_media_type: scan?.icon_media_type || "image/png",
    isStatic: scan?.isStatic || false, // Preserve static flag
    security,
    privacy,
    governance,
    lastAnalyzed: scan?.lastAnalyzed // Static snapshot already has formatted time
      || (scan?.last_scanned_at
        ? new Date(scan.last_scanned_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : scan?.timestamp
          ? new Date(scan.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
          : "Recently"),
  };
}

/**
 * Checks if extensionId looks like a real Chrome extension ID (32 lowercase a-p).
 */
function isRealExtensionId(id) {
  return id && id.length === 32 && /^[a-p]+$/.test(id);
}

/**
 * Get icon source for a scan. Strategy:
 * 1. icon_base64 from DB → instant data URL
 * 2. Real extension ID (32-char) → check cache, else API URL
 * 3. Static snapshot (slug-like ID) → placeholder (no network, instant render)
 */
function getIconSrc(scan) {
  // 1. DB provides icon_base64 → use data URL (instant, no network)
  if (scan?.icon_base64) {
    const mediaType = scan.icon_media_type || "image/png";
    return `data:${mediaType};base64,${scan.icon_base64}`;
  }
  
  const extensionId = scan?.extensionId || scan?.extension_id;
  
  // 2. Real extension ID (from DB) → check cache or use API
  if (extensionId && isRealExtensionId(extensionId)) {
    const cached = extensionCacheService.getIconUrl(extensionId);
    if (cached && cached !== EXTENSION_ICON_PLACEHOLDER) return cached;
    return getExtensionIconUrl(extensionId);
  }
  
  // 3. Static snapshot item (slug-like ID) → placeholder (instant, no network request)
  return EXTENSION_ICON_PLACEHOLDER;
}

function FocusCard({ scan, isVisible }) {
  const extensionId = scan?.extensionId || scan?.extension_id;
  const iconSrc = getIconSrc(scan);
  const detailsHref = extensionId ? getScanResultsRoute(extensionId, scan?.name || scan?.extension_name) : null;

  const handleIconError = (e) => {
    e.target.onerror = null;
    e.target.src = EXTENSION_ICON_PLACEHOLDER;
  };

  return (
    <motion.div
      className="hero-orbital-focus-card"
      role="article"
      aria-label={`Scan report: ${scan?.name}`}
      initial={{ opacity: 0, scale: 0.35 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 22 }}
    >
      <div className="hero-orbital-focus-icon-wrap">
        <div className="hero-orbital-focus-icon">
          <img src={iconSrc} alt="" onError={handleIconError} />
        </div>
        <div className="hero-orbital-focus-title-row">
          <p className="hero-orbital-focus-label">{scan?.name || "Extension"}</p>
          {detailsHref && (
            <Link to={detailsHref} className="hero-orbital-focus-details-link" aria-label={`View details: ${scan?.name || "Extension"}`} title="View details">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <path d="M15 3h6v6" />
                <path d="M10 14L21 3" />
              </svg>
            </Link>
          )}
        </div>
      </div>
      <div className="hero-orbital-focus-rows">
        <div className="hero-orbital-focus-row security">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.security?.level === "ok" ? "safe" : scan?.security?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.security?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Security</strong>
              <span>{scan?.security?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.security?.level === "ok" ? "safe" : scan?.security?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.security?.score ?? 0}%` } : {}} transition={{ duration: 0.6, ease: "easeOut" }} />
          </div>
        </div>
        <div className="hero-orbital-focus-row privacy">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.privacy?.level === "ok" ? "safe" : scan?.privacy?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.privacy?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Privacy</strong>
              <span>{scan?.privacy?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.privacy?.level === "ok" ? "safe" : scan?.privacy?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.privacy?.score ?? 0}%` } : {}} transition={{ duration: 0.6, delay: 0.1, ease: "easeOut" }} />
          </div>
        </div>
        <div className="hero-orbital-focus-row governance">
          <div className="hero-orbital-focus-row-header">
            <svg className={`hero-orbital-focus-row-icon ${scan?.governance?.level === "ok" ? "safe" : scan?.governance?.level === "high" ? "danger" : "warning"}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              {scan?.governance?.level === "ok" ? <path d="M20 6L9 17l-5-5" /> : <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>}
            </svg>
            <div>
              <strong>Governance</strong>
              <span>{scan?.governance?.label ?? "—"}</span>
            </div>
          </div>
          <div className="hero-orbital-progress-bar">
            <motion.div className={`hero-orbital-progress-fill ${scan?.governance?.level === "ok" ? "safe" : scan?.governance?.level === "high" ? "danger" : "warning"}`} initial={{ width: 0 }} animate={isVisible ? { width: `${scan?.governance?.score ?? 0}%` } : {}} transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }} />
          </div>
        </div>
      </div>
      <p className="hero-orbital-focus-meta">Last analyzed {scan?.lastAnalyzed ?? "—"}</p>
    </motion.div>
  );
}

/**
 * Depth: Front 1/1, Mid 0.92/0.6, Back 0.82/0.28. Slight shadow variation.
 * Optional maxOpacity for secondary ring (e.g. 0.6).
 */
function computeDepth(ringAngleDeg, index, cardCount, tiltDeg, maxOpacity = 1) {
  const degPerCard = cardCount > 0 ? 360 / cardCount : 360;
  const worldAngle = ((ringAngleDeg + index * degPerCard) % 360 + 360) % 360;
  const toFront = Math.min(worldAngle, 360 - worldAngle);
  const normalized = toFront / 180; // 0 = front, 1 = back
  const scale = 0.82 + 0.18 * (1 - normalized);
  let opacity = 0.28 + 0.72 * (1 - normalized);
  if (maxOpacity < 1) opacity = Math.min(maxOpacity, opacity);
  const zIndex = Math.round(100 + 50 * (1 - normalized));
  const offsetY = 1 + normalized * 0.8;
  const shadowDepth = normalized * 2;
  const counterRotateY = ringAngleDeg + index * degPerCard;
  const counterRotateX = tiltDeg;
  return { scale, opacity, zIndex, offsetY, shadowDepth, counterRotateY, counterRotateX };
}

function OrbitIcon({ scan, depth, isSelected, isHovered, interactive = true, compact = false, onClick, onHoverStart, onHoverEnd }) {
  const iconSrc = getIconSrc(scan);

  const handleIconError = (e) => {
    e.target.onerror = null;
    e.target.src = EXTENSION_ICON_PLACEHOLDER;
  };
  const scale = depth?.scale ?? 1;
  const opacity = depth?.opacity ?? 1;
  const zIndex = depth?.zIndex ?? 1;
  const counterRotateY = depth?.counterRotateY ?? 0;
  const counterRotateX = depth?.counterRotateX ?? 0;
  const offsetY = depth?.offsetY ?? 0;
  const shadowDepth = depth?.shadowDepth ?? 0;
  const tooltipLabel = scan?.name || "Preview";

  const style = compact
    ? undefined
    : {
        transformStyle: "preserve-3d",
        transform: `rotateX(${-counterRotateX}deg) rotateY(${-counterRotateY}deg) translateY(${offsetY}px)`,
        scale,
        opacity,
        zIndex,
        pointerEvents: interactive && opacity >= 0.4 ? "auto" : "none",
        "--orbit-shadow-depth": shadowDepth,
      };

  const content = (
    <>
      <div className={`hero-orbit-icon__ring ${isSelected ? "hero-orbit-icon__ring--active" : ""}`}>
        <img src={iconSrc} alt="" onError={handleIconError} />
      </div>
      {interactive && isHovered && opacity >= 0.6 && (
        <div className="hero-orbit-icon__tooltip">
          <span className="tooltip-name">{tooltipLabel}</span>
          <span className="tooltip-cta">Click to preview</span>
        </div>
      )}
    </>
  );

  if (interactive) {
    return (
      <motion.button
        type="button"
        className={`hero-orbit-icon ${isSelected ? "hero-orbit-icon--selected" : ""} ${compact ? "hero-orbit-icon--compact" : ""}`}
        onClick={onClick}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
        aria-label={`View scan: ${scan?.name}`}
        style={style}
        whileHover={opacity >= 0.5 ? { scale: scale * 1.14 } : {}}
        whileTap={opacity >= 0.5 ? { scale: scale * 0.98 } : {}}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <div
      className={`hero-orbit-icon hero-orbit-icon--secondary ${compact ? "hero-orbit-icon--compact" : ""}`}
      style={style}
      aria-hidden="true"
    >
      {content}
    </div>
  );
}

function PrimaryOrbit({ scans, angle, reducedMotion, focusedIndex, hoveredIndex, onSelect, onHover, tilt }) {
  const count = scans.length;
  const degPerCard = count > 0 ? 360 / count : 360;

  return (
    <div
      className="hero-orbital-ring hero-orbital-ring--primary"
      style={{
        transformStyle: "preserve-3d",
        transform: reducedMotion ? "rotateY(0deg)" : `rotateY(${angle}deg)`,
      }}
    >
      {scans.map((scan, i) => {
        const depth = computeDepth(reducedMotion ? 0 : angle, i, count, tilt, 1);
        const globalIndex = i;
        return (
          <div
            key={(scan?.extensionId || scan?.name) + "p" + i}
            className="hero-orbital-slot"
            style={{
              transform: `rotateY(${i * degPerCard}deg) translateZ(${PRIMARY_RADIUS}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            <OrbitIcon
              scan={scan}
              depth={depth}
              isSelected={focusedIndex === globalIndex}
              isHovered={hoveredIndex === globalIndex}
              interactive
              onClick={() => onSelect(globalIndex)}
              onHoverStart={() => onHover(globalIndex)}
              onHoverEnd={() => onHover(null)}
            />
          </div>
        );
      })}
    </div>
  );
}

function SecondaryOrbit({ scans, angle, reducedMotion, tilt, focusedIndex, hoveredIndex, onSelect, onHover }) {
  const count = scans.length;
  const degPerCard = count > 0 ? 360 / count : 360;

  return (
    <div
      className="hero-orbital-ring hero-orbital-ring--secondary"
      style={{
        transformStyle: "preserve-3d",
        transform: reducedMotion ? "rotateY(0deg)" : `rotateY(${angle}deg)`,
      }}
    >
      {scans.map((scan, i) => {
        const depth = computeDepth(reducedMotion ? 0 : angle, i, count, tilt, 0.6);
        const globalIndex = PRIMARY_ICON_COUNT + i;
        return (
          <div
            key={(scan?.extensionId || scan?.name) + "s" + i}
            className="hero-orbital-slot"
            style={{
              transform: `rotateY(${i * degPerCard}deg) translateZ(${SECONDARY_RADIUS}px)`,
              transformStyle: "preserve-3d",
            }}
          >
            <OrbitIcon
              scan={scan}
              depth={depth}
              isSelected={focusedIndex === globalIndex}
              isHovered={hoveredIndex === globalIndex}
              interactive
              onClick={() => onSelect(globalIndex)}
              onHoverStart={() => onHover(globalIndex)}
              onHoverEnd={() => onHover(null)}
            />
          </div>
        );
      })}
    </div>
  );
}

function ReportCardModal({ open, onClose, focusScan, isVisible }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="hero-orbital-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Extension scan report"
        >
          <motion.div
            className="hero-orbital-modal-content"
            initial={{ opacity: 0, scale: 0.35 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="hero-orbital-modal-close" onClick={onClose} aria-label="Close report">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
            <FocusCard scan={focusScan} isVisible={isVisible} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function HeroOrbitalCarousel() {
  const [primaryAngle, setPrimaryAngle] = useState(0);
  const [secondaryAngle, setSecondaryAngle] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState(null); // per-icon hover
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [cardRevealed, setCardRevealed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [scans, setScans] = useState(HERO_SNAPSHOT);
  // Only the setter is used (to force a re-render when extension icons finish
  // loading); the value itself is never read.
  const [, setIconCacheVersion] = useState(0);
  const [compact, setCompact] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rafRef = useRef(null);
  const lastTimeRef = useRef(null);

  useEffect(() => {
    setIsVisible(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  /**
   * Hybrid hero data strategy:
   * 1. HERO_SNAPSHOT renders instantly (placeholder icons, no network)
   * 2. Check sessionStorage cache first (persists across page navigations)
   * 3. If no cache, fetch from API in background (slow ~5-20s due to Supabase)
   * 4. Cache result for fast subsequent loads
   */
  useEffect(() => {
    let cancelled = false;
    const CACHE_KEY = "hero_carousel_scans";
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    (async () => {
      try {
        // 1. Check sessionStorage cache first (instant)
        const cached = sessionStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { data, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_TTL && data?.length > 0) {
              const simplified = data.map(simplifyScan).filter((s) => s.extensionId).slice(0, MAX_SCANS);
              if (simplified.length > 0 && !cancelled) {
                setScans(simplified);
                extensionCacheService.set(simplified, () => setIconCacheVersion((v) => v + 1));
                return; // Cache hit - no need to fetch
              }
            }
          } catch {
            // Invalid cache, continue to fetch
          }
        }

        // 2. No valid cache - fetch from API (background, may be slow)
        const { default: databaseService } = await import("../../services/databaseService");
        const recent = await databaseService.getRecentScans(MAX_SCANS);
        if (cancelled || !recent?.length) return;

        // 3. Cache the response for fast subsequent loads
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data: recent, timestamp: Date.now() }));

        // 4. Update state
        const simplified = recent.map(simplifyScan).filter((s) => s.extensionId).slice(0, MAX_SCANS);
        if (cancelled || simplified.length === 0) return;

        setScans(simplified);
        extensionCacheService.set(simplified, () => setIconCacheVersion((v) => v + 1));
      } catch {
        // Hero keeps HERO_SNAPSHOT on error
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const tick = (time) => {
      lastTimeRef.current ??= time;
      const delta = (time - lastTimeRef.current) / 1000;
      lastTimeRef.current = time;
      if (!isPaused) {
        setPrimaryAngle((prev) => (prev + (360 / PRIMARY_DURATION) * delta) % 360);
        setSecondaryAngle((prev) => (prev - (360 / SECONDARY_DURATION) * delta + 360) % 360);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPaused, reducedMotion]);

  const scansToShow = useMemo(() => {
    const arr = scans.length > 0 ? scans : PLACEHOLDER_SCANS;
    return arr.slice(0, MAX_SCANS);
  }, [scans]);

  const primaryScans = useMemo(() => scansToShow.slice(0, PRIMARY_ICON_COUNT), [scansToShow]);
  const secondaryScans = useMemo(() => scansToShow.slice(PRIMARY_ICON_COUNT, PRIMARY_ICON_COUNT + SECONDARY_ICON_COUNT), [scansToShow]);

  useEffect(() => {
    if (focusedIndex >= scansToShow.length) setFocusedIndex(0);
  }, [focusedIndex, scansToShow.length]);

  const focusScan = scansToShow[focusedIndex] || scansToShow[0];

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${VIEWPORT_COMPACT}px)`);
    const update = () => setCompact(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const handleSelect = (index) => {
    setFocusedIndex(index);
    setCardRevealed(true);
  };

  const handleHover = (index) => {
    setHoveredIndex(index);
    setIsPaused(index !== null);
  };

  const closeModal = () => setCardRevealed(false);

  if (compact) {
    return (
      <>
        <div className="hero-orbital-carousel hero-orbital-carousel--minimal" role="region" aria-label="Sample scan reports">
          {!cardRevealed && <span className="hero-orbital-minimal-hint">Tap an extension</span>}
          <div className="hero-orbital-mini-strip">
            {primaryScans.map((scan, i) => (
              <OrbitIcon
                key={(scan?.extensionId || scan?.name) + i}
                scan={scan}
                depth={null}
                compact
                isSelected={focusedIndex === i && cardRevealed}
                isHovered={false}
                interactive
                onClick={() => handleSelect(i)}
              />
            ))}
          </div>
        </div>
        <ReportCardModal open={cardRevealed} onClose={closeModal} focusScan={focusScan} isVisible={isVisible} />
      </>
    );
  }

  return (
    <>
      <div
        className={`hero-orbital-carousel hero-orbital-carousel--atomic ${reducedMotion ? "hero-orbital-carousel--static" : ""}`}
        onMouseLeave={() => { setIsPaused(false); setHoveredIndex(null); }}
        role="region"
        aria-label="Sample scan reports carousel"
      >
        <div className="hero-orbital-scene" style={{ perspective: "1200px" }}>
          <div className="hero-orbital-spotlight" aria-hidden="true" />
          <div className="hero-orbital-sun" aria-hidden="true">
            <div className="hero-orbital-sun__core" />
            <div className="hero-orbital-sun__glow" />
          </div>

          <div
            className="hero-orbital-group"
            style={{
              transformStyle: "preserve-3d",
              transform: `rotateX(${ORBIT_TILT}deg)`,
            }}
          >
            <div className="hero-orbital-path hero-orbital-path--primary" aria-hidden="true" />
            <div className="hero-orbital-path hero-orbital-path--secondary" aria-hidden="true" />

            {!cardRevealed && (
              <p className="hero-orbital-cta__helper" aria-hidden="true">
                <span className="hero-orbital-cta__helper-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                  </svg>
                </span>
                Click any icon to preview
              </p>
            )}

            <SecondaryOrbit
              scans={secondaryScans}
              angle={secondaryAngle}
              reducedMotion={reducedMotion}
              tilt={ORBIT_TILT}
              focusedIndex={cardRevealed ? focusedIndex : -1}
              hoveredIndex={hoveredIndex}
              onSelect={handleSelect}
              onHover={handleHover}
            />
            <PrimaryOrbit
              scans={primaryScans}
              angle={primaryAngle}
              reducedMotion={reducedMotion}
              focusedIndex={cardRevealed ? focusedIndex : -1}
              hoveredIndex={hoveredIndex}
              onSelect={handleSelect}
              onHover={handleHover}
              tilt={ORBIT_TILT}
            />
          </div>
        </div>
      </div>
      <ReportCardModal open={cardRevealed} onClose={closeModal} focusScan={focusScan} isVisible={isVisible} />
    </>
  );
}
