import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./CommunitySpotlightCarousel.scss";

// Mock data – Top Contributors
const MOCK_CONTRIBUTORS = [
  { id: "1", name: "Alex M.", handle: "alex_verify", avatar: null, verifiedReviews: 42, karma: 380, badge: "Verifier" },
  { id: "2", name: "Sam K.", handle: "sam_scans", avatar: null, verifiedReviews: 28, karma: 210, badge: "Reviewer" },
  { id: "3", name: "Jordan L.", handle: "jordan_rules", avatar: null, verifiedReviews: 19, karma: 155, badge: "Reviewer" },
];

// Mock data – Recently Verified Extensions
const MOCK_EXTENSIONS = [
  { id: "e1", name: "Tab Saver", extensionId: "aapbdbdomjkkjkaonfhkkikfgjllcleb", findingType: "Permission scope", status: "Verified", date: "2 days ago", icon: null },
  { id: "e2", name: "Quick Translator", extensionId: "cfbhnhhnjpmelfbcnfndnjhnopgdckpa", findingType: "Network request", status: "Verified", date: "5 days ago", icon: null },
  { id: "e3", name: "Dark Reader", extensionId: "eimadpbcbfnmbkopoojfekhnkhdbieeh", findingType: "Data access", status: "Verified", date: "1 week ago", icon: null },
];

const CARD_DURATION_MS = 4000;
const SLIDE_DURATION = 0.35;
const EASE = "easeOut";

const CommunitySpotlightCarousel = () => {
  const [activeTab, setActiveTab] = useState(0); // 0 = Contributors, 1 = Extensions
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const reducedMotion = useReducedMotion();
  const containerRef = useRef(null);

  const items = activeTab === 0 ? MOCK_CONTRIBUTORS : MOCK_EXTENSIONS;
  const total = items.length;

  const goTo = useCallback((index) => {
    setActiveIndex((index + total) % total);
  }, [total]);

  const goPrev = useCallback(() => {
    goTo(activeIndex - 1);
  }, [activeIndex, goTo]);

  const goNext = useCallback(() => {
    goTo(activeIndex + 1);
  }, [activeIndex, goTo]);

  // Auto-advance: every 4s, and only when not reduced-motion and not paused
  useEffect(() => {
    if (reducedMotion || isPaused || total <= 1) return;
    const t = setInterval(() => {
      setActiveIndex((i) => (i + 1) % total);
    }, CARD_DURATION_MS);
    return () => clearInterval(t);
  }, [reducedMotion, isPaused, total]);

  // Reset index when switching tabs
  useEffect(() => {
    setActiveIndex(0);
  }, [activeTab]);

  const transition = reducedMotion
    ? { duration: 0.2, ease: EASE }
    : { duration: SLIDE_DURATION, ease: EASE };

  const slideVariants = reducedMotion
    ? {
        enter: { opacity: 0 },
        center: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : {
        enter: { x: 24, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -24, opacity: 0 },
      };

  const current = items[activeIndex];

  return (
    <div
      className="community-spotlight"
      ref={containerRef}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={(e) => {
        if (containerRef.current?.contains(e.target)) setIsPaused(true);
      }}
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget)) setIsPaused(false);
      }}
    >
      <div className="community-spotlight-header">
        <h3 className="community-spotlight-title">Community Spotlight</h3>
        <div className="community-spotlight-tabs" role="tablist" aria-label="Spotlight category">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 0}
            aria-controls="spotlight-panel"
            id="tab-contributors"
            className={`community-spotlight-tab ${activeTab === 0 ? "active" : ""}`}
            onClick={() => setActiveTab(0)}
          >
            Top Contributors
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 1}
            aria-controls="spotlight-panel"
            id="tab-extensions"
            className={`community-spotlight-tab ${activeTab === 1 ? "active" : ""}`}
            onClick={() => setActiveTab(1)}
          >
            Recently Verified
          </button>
        </div>
      </div>

      <div
        id="spotlight-panel"
        role="tabpanel"
        aria-labelledby={activeTab === 0 ? "tab-contributors" : "tab-extensions"}
        className="community-spotlight-panel"
      >
        <AnimatePresence mode="wait" initial={false}>
          {current && (
            <motion.div
              key={`${activeTab}-${current.id}`}
              className="community-spotlight-card-wrap"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={transition}
              whileHover={reducedMotion ? undefined : { y: -2, transition: { duration: 0.15 } }}
            >
              {activeTab === 0 ? (
                <ContributorCard item={current} />
              ) : (
                <ExtensionCard item={current} />
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {total > 1 && (
          <>
            <div className="community-spotlight-nav">
              <button
                type="button"
                className="community-spotlight-arrow"
                onClick={goPrev}
                aria-label="Previous"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
              <div className="community-spotlight-dots" role="tablist" aria-label="Slide">
                {items.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    role="tab"
                    aria-selected={i === activeIndex}
                    aria-label={`Slide ${i + 1}`}
                    className={`community-spotlight-dot ${i === activeIndex ? "active" : ""}`}
                    onClick={() => goTo(i)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="community-spotlight-arrow"
                onClick={goNext}
                aria-label="Next"
              >
                <ChevronRight size={20} aria-hidden />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

function ContributorCard({ item }) {
  return (
    <div className="community-spotlight-card community-spotlight-card--contributor">
      <div className="community-spotlight-avatar">
        {item.avatar ? (
          <img src={item.avatar} alt="" />
        ) : (
          <span className="community-spotlight-avatar-initial">
            {item.name.charAt(0)}
          </span>
        )}
      </div>
      <div className="community-spotlight-card-body">
        <div className="community-spotlight-name">{item.name}</div>
        <div className="community-spotlight-handle">@{item.handle}</div>
        <div className="community-spotlight-meta">
          <span>{item.verifiedReviews} verified reviews</span>
          <span>{item.karma} karma</span>
        </div>
        {item.badge && (
          <span className="community-spotlight-badge">{item.badge}</span>
        )}
      </div>
    </div>
  );
}

function ExtensionCard({ item }) {
  return (
    <div className="community-spotlight-card community-spotlight-card--extension">
      <div className="community-spotlight-ext-icon">
        {item.icon ? (
          <img src={item.icon} alt="" />
        ) : (
          <span className="community-spotlight-ext-icon-placeholder" aria-hidden />
        )}
      </div>
      <div className="community-spotlight-card-body">
        <div className="community-spotlight-name">{item.name}</div>
        <div className="community-spotlight-ext-id">{item.extensionId}</div>
        <div className="community-spotlight-meta">
          <span>{item.findingType}</span>
          <span className="community-spotlight-status">{item.status}</span>
        </div>
        <div className="community-spotlight-date">{item.date}</div>
      </div>
    </div>
  );
}

export default CommunitySpotlightCarousel;
