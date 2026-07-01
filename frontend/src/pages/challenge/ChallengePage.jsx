import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import RainfallDroplets from "../../components/RainfallDroplets";
import { EDITIONS } from "./editions";
import "./ChallengePage.scss";

/**
 * /challenge — the challenge program hub. Lists editions as cards; each links to
 * its full brief at /challenge/<slug>. Kept intentionally light: the detailed
 * content lives on the edition page.
 */
const ChallengePage = () => {
  return (
    <>
      <SEOHead
        title="Threat Report Challenge — Browser Extension Safety | ExtensionShield"
        description="The ExtensionShield Threat Report Challenge: learn to spot risky browser extensions, investigate permissions and privacy signals responsibly, and submit an evidence-backed report. Free to scan, no coding required."
        pathname="/challenge"
        keywords="browser extension safety challenge, chrome extension security challenge, threat report challenge, student security challenge"
      />

      <div className="challenge-page">
        <RainfallDroplets />

        <div className="challenge-content">
          <header className="hub-head">
            <h1>ExtensionShield Threat Report Challenge</h1>
            <p>Choose a challenge to view its brief, rules, and how to enter.</p>
          </header>

          <section className="challenge-section">
            <div className="editions-grid">
              {EDITIONS.map((ed) => (
                <Link key={ed.slug} to={`/challenge/${ed.slug}`} className="edition-card edition-card--link">
                  <div className="edition-head">
                    <span className="edition-tag">{ed.edition}</span>
                    <span className={`edition-status edition-status--${ed.statusVariant}`}>{ed.status}</span>
                  </div>
                  <h3>{ed.title}</h3>
                  <p className="edition-host">{ed.host}</p>
                  <p className="edition-desc">{ed.summary}</p>
                  <span className="link-inline">View challenge →</span>
                </Link>
              ))}
            </div>
            <p className="challenge-note">
              Future editions will appear here as the challenge program grows.
            </p>
          </section>
        </div>
      </div>
    </>
  );
};

export default ChallengePage;
