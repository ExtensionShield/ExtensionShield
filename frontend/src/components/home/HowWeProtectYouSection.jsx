import React, { useState, useEffect, useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Package, RefreshCcw, AlertTriangle, ShieldCheck, Download } from "lucide-react";
import { CHROME_EXTENSION_STORE_URL } from "../../utils/constants";
import "./HowWeProtectYouSection.scss";

const stagger = 0.12;
const duration = 0.45;
const ease = [0.22, 1, 0.36, 1];

function TimelineNode({ children, delay = 0, reduced, variant }) {
  const isDownload = variant === "download";
  return (
    <motion.div
      className="how-protect-timeline-node"
      initial={reduced ? false : { opacity: 0, y: 12, scale: isDownload ? 0.92 : 0.98 }}
      whileInView={reduced ? {} : { opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{
        duration: isDownload ? 0.5 : duration,
        delay,
        ease: isDownload ? [0.34, 1.2, 0.64, 1] : ease,
      }}
    >
      {children}
    </motion.div>
  );
}

function PulseLine({ reduced, delay = 0 }) {
  return (
    <motion.div
      className="how-protect-pulse-line"
      initial={reduced ? false : { scaleY: 0 }}
      whileInView={reduced ? {} : { scaleY: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration, delay, ease }}
      style={{ transformOrigin: "top" }}
    >
      <svg viewBox="0 0 12 56" preserveAspectRatio="xMidYMid meet" aria-hidden>
        <path d="M6 0 L6 56" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="how-protect-pulse-track" />
        <motion.circle
          cx="6"
          cy="6"
          r="4"
          fill="currentColor"
          className="how-protect-pulse-dot"
          initial={reduced ? false : { cy: 6, opacity: 0 }}
          whileInView={reduced ? {} : { cy: [6, 50, 50], opacity: [0, 1, 0] }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.8, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.div>
  );
}

function OutcomeConnector({ variant, delay, reduced }) {
  return (
    <motion.div
      className={`how-protect-outcome-connector how-protect-outcome-connector--${variant}`}
      aria-hidden
      initial={reduced ? false : { opacity: 0 }}
      whileInView={reduced ? {} : { opacity: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.25, delay }}
    >
      <svg viewBox="0 0 12 32" preserveAspectRatio="xMidYMid meet">
        <motion.path
          d="M6 0 L6 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          initial={reduced ? false : { pathLength: 0 }}
          whileInView={reduced ? {} : { pathLength: 1 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.4, delay: delay + 0.05, ease }}
        />
        <motion.circle
          cx="6"
          cy="4"
          r="3"
          fill="currentColor"
          initial={reduced ? false : { cy: 4, opacity: 0 }}
          whileInView={reduced ? {} : { cy: [4, 28, 28], opacity: [0, 1, 0] }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.5, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </motion.div>
  );
}

function SplitOutcomeCard({ variant, icon: Icon, title, description, delay, reduced }) {
  return (
    <motion.div
      className={`how-protect-outcome-card how-protect-outcome-card--${variant}`}
      initial={reduced ? false : { opacity: 0, y: 10 }}
      whileInView={reduced ? {} : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration, delay, ease }}
      whileHover={reduced ? {} : { y: -2, transition: { duration: 0.2 } }}
    >
      <div className="how-protect-outcome-icon-wrap">
        <Icon size={24} strokeWidth={1.8} aria-hidden />
      </div>
      <h4 className="how-protect-outcome-title">{title}</h4>
      <p className="how-protect-outcome-desc">{description}</p>
    </motion.div>
  );
}

export default function HowWeProtectYouSection() {
  const [reduced, setReduced] = useState(false);
  const ref = useRef(null);
  useInView(ref, { once: true, amount: 0.25 });

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = () => setReduced(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <section
      id="proof"
      ref={ref}
      className="how-protect-section"
      aria-labelledby="how-protect-title"
    >
      <div className="how-protect-container">
        <div className="how-protect-grid">
          {/* LEFT: Copy */}
          <motion.div
            className="how-protect-left"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            whileInView={reduced ? {} : { opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.5, ease }}
          >
            <h2 id="how-protect-title" className="how-protect-title">
              Why extension governance has to happen before install
            </h2>
            <p className="how-protect-body">
              Extensions can change through updates, ownership shifts, new permissions, and remote behavior. ExtensionShield gives teams evidence before install, before release, and before allowlisting.
            </p>
            <p className="how-protect-tagline">
              Scan, score, allow, block, monitor, or fix with one evidence-backed workflow.
            </p>
            <a
              href={CHROME_EXTENSION_STORE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="get-extension-btn how-protect-cta"
              title="Install ExtensionShield from Chrome Web Store"
            >
              <Download size={18} strokeWidth={2} aria-hidden />
              <span>Get extension</span>
            </a>
          </motion.div>

          {/* RIGHT: Animated timeline */}
          <div className="how-protect-right">
            <div className="how-protect-timeline" aria-label="How we protect: downloaded extension, risky update, then without us or with us">
              {/* Node 1: Downloaded extension – arrival bounce + glow pulse */}
              <TimelineNode delay={0} reduced={reduced} variant="download">
                <motion.div
                  className="how-protect-node-icon how-protect-node-icon--purple"
                  initial={reduced ? false : { boxShadow: "0 4px 12px rgba(139, 92, 246, 0.15)" }}
                  whileInView={reduced ? {} : {
                    boxShadow: [
                      "0 4px 12px rgba(139, 92, 246, 0.15)",
                      "0 0 20px rgba(139, 92, 246, 0.5)",
                      "0 4px 12px rgba(139, 92, 246, 0.15)"
                    ],
                  }}
                  viewport={{ once: true, amount: 0.5 }}
                  transition={{ duration: 0.7, delay: 0.4, ease: "easeInOut" }}
                >
                  <Package size={22} strokeWidth={1.8} aria-hidden />
                </motion.div>
                <span className="how-protect-node-label">You install an extension</span>
              </TimelineNode>

              <PulseLine reduced={reduced} delay={stagger * 1} />

              {/* Node 2: Risky update made – spins every 2s for feedback + warning border pulse */}
              <TimelineNode delay={stagger * 2} reduced={reduced}>
                <motion.span
                  className="how-protect-node-icon-motion"
                  initial={reduced ? false : { rotate: 0 }}
                  animate={reduced ? {} : { rotate: 360 }}
                  transition={
                    reduced
                      ? {}
                      : { rotate: { repeat: Infinity, duration: 2, ease: "linear" } }
                  }
                >
                  <motion.div
                    className="how-protect-node-icon how-protect-node-icon--neutral"
                    initial={reduced ? false : { borderColor: "rgba(0, 0, 0, 0.08)" }}
                    whileInView={reduced ? {} : {
                      borderColor: [
                        "rgba(0, 0, 0, 0.08)",
                        "rgba(251, 191, 36, 0.6)",
                        "rgba(0, 0, 0, 0.08)"
                      ],
                    }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.8, delay: stagger * 2 + 0.5, ease: "easeInOut" }}
                  >
                    <RefreshCcw size={22} strokeWidth={1.8} aria-hidden />
                  </motion.div>
                </motion.span>
                <span className="how-protect-node-label">A bad update sneaks in</span>
              </TimelineNode>

              <PulseLine reduced={reduced} delay={stagger * 3} />

              {/* Fork: horizontal line (animate pathLength) */}
              <motion.div
                className="how-protect-split-wrap"
                initial={reduced ? false : { opacity: 0 }}
                whileInView={reduced ? {} : { opacity: 1 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.3, delay: stagger * 4 }}
              >
                <svg className="how-protect-split-svg" viewBox="0 0 380 12" preserveAspectRatio="none" aria-hidden>
                  <motion.path
                    d="M 190 6 L 95 6 M 190 6 L 285 6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    className="how-protect-split-path"
                    initial={reduced ? false : { pathLength: 0 }}
                    whileInView={reduced ? {} : { pathLength: 1 }}
                    viewport={{ once: true, amount: 0.1 }}
                    transition={{ duration: 0.5, delay: stagger * 4, ease }}
                  />
                  <circle cx="190" cy="6" r="4" className="how-protect-split-dot" />
                  <circle cx="95" cy="6" r="4" className="how-protect-split-dot how-protect-split-dot--danger" />
                  <circle cx="285" cy="6" r="4" className="how-protect-split-dot how-protect-split-dot--success" />
                </svg>
              </motion.div>

              {/* Outcome cards with connector lines that draw down to each card */}
              <div className="how-protect-outcomes">
                <div className="how-protect-outcome-column how-protect-outcome-column--danger">
                  <OutcomeConnector variant="danger" delay={stagger * 4.5} reduced={reduced} />
                  <SplitOutcomeCard
                    variant="danger"
                    icon={AlertTriangle}
                    title="Unprotected"
                    description="Bad code runs. Your data leaks."
                    delay={stagger * 5}
                    reduced={reduced}
                  />
                </div>
                <div className="how-protect-outcome-column how-protect-outcome-column--success">
                  <OutcomeConnector variant="success" delay={stagger * 4.5} reduced={reduced} />
                  <SplitOutcomeCard
                    variant="success"
                    icon={ShieldCheck}
                    title="With ExtensionShield"
                    description="We catch it. You stay safe."
                    delay={stagger * 6}
                    reduced={reduced}
                  />
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
