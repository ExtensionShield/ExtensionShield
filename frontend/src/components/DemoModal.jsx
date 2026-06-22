import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ExternalLink } from "lucide-react";
import "./DemoModal.scss";

const CHROME_WEB_STORE_URL = "https://chromewebstore.google.com/";

const DEMO_STEPS = [
  {
    image: "/images/Demo-step1.png",
    caption: "Search the Chrome Web Store for an extension.",
  },
  {
    image: "/images/Demo-step2.png",
    caption: "Select an extension to view its details page.",
  },
  {
    image: "/images/Demo-step3.png",
    caption:
      "Copy the URL from your address bar and paste it into ExtensionShield.",
  },
];

function DemoModal({ isOpen, onClose }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [direction, setDirection] = useState(1);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const contentRef = useRef(null);
  const previousFocusRef = useRef(null);

  // Detect reduced motion preference
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Preload images
  useEffect(() => {
    DEMO_STEPS.forEach((step) => {
      const img = new Image();
      img.src = step.image;
    });
  }, []);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStepIndex(0);
      setDirection(1);
      setImageLoaded(false);
      previousFocusRef.current = document.activeElement;
    }
  }, [isOpen]);

  // Focus trap + keyboard
  useEffect(() => {
    if (!isOpen) return;

    const el = contentRef.current;
    if (!el) return;

    const focusables = el.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    
    if (!focusables.length) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    if (first) first.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        if (stepIndex < DEMO_STEPS.length - 1 && !isAnimating) {
          handleNext();
        }
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (stepIndex > 0 && !isAnimating) {
          handleBack();
        }
        return;
      }

      if (e.key === "Tab") {
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";

      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === "function"
      ) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, stepIndex, isAnimating]);

  const handleBackdropClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose]
  );

  const handleNext = useCallback(() => {
    if (isAnimating) return;

    if (stepIndex < DEMO_STEPS.length - 1) {
      setIsAnimating(true);
      setDirection(1);
      setImageLoaded(false);

      setStepIndex((i) => i + 1);

      setTimeout(() => setIsAnimating(false), 400);
    } else {
      onClose();
    }
  }, [stepIndex, onClose, isAnimating]);

  const handleBack = useCallback(() => {
    if (isAnimating) return;

    if (stepIndex > 0) {
      setIsAnimating(true);
      setDirection(-1);
      setImageLoaded(false);

      setStepIndex((i) => i - 1);

      setTimeout(() => setIsAnimating(false), 400);
    }
  }, [stepIndex, isAnimating]);

  if (!isOpen) return null;

  const step = DEMO_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === DEMO_STEPS.length - 1;

  const modal = (
    <div
      className="demo-modal-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-description"
    >
      <div
        ref={contentRef}
        className="demo-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="demo-modal-caption-row">
          <p id="demo-modal-description" className="demo-modal-caption">
            Step {stepIndex + 1}: {step.caption}
          </p>

          {stepIndex === 0 && (
            <a
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="demo-modal-store-link"
              aria-label="Open Chrome Web Store"
            >
              <span className="demo-modal-store-link-text">
                Chrome Store
              </span>
              <ExternalLink size={18} strokeWidth={2} />
            </a>
          )}
        </div>

        <div className="demo-modal-main">
          {/* Prev */}
          <button
            type="button"
            className={`demo-nav-btn demo-nav-prev ${
              isFirst ? "demo-nav-disabled" : ""
            }`}
            onClick={handleBack}
            disabled={isFirst || isAnimating}
            aria-label="Previous step"
          >
            <div className="demo-nav-btn-inner">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </div>
          </button>

          {/* Image */}
          <div className="demo-modal-image-container">
            <div
              className={`demo-modal-image-wrap ${
                imageLoaded ? "loaded" : ""
              }`}
            >
              <img
                key={stepIndex}
                src={step.image}
                alt={step.caption}
                className={`demo-modal-image ${
                  reducedMotion ? "demo-modal-image-no-motion" : ""
                } ${direction > 0 ? "slide-right" : "slide-left"}`}
                onLoad={() => setImageLoaded(true)}
              />

              {!imageLoaded && (
                <div className="demo-image-skeleton">
                  <div className="demo-skeleton-shimmer"></div>
                </div>
              )}
            </div>
          </div>

          {/* Next */}
          <button
            type="button"
            className={`demo-nav-btn demo-nav-next ${
              isLast ? "demo-nav-finish" : ""
            }`}
            onClick={handleNext}
            disabled={isAnimating}
            aria-label={isLast ? "Finish walkthrough" : "Next step"}
          >
            <div className="demo-nav-btn-inner">
              {isLast ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default DemoModal;