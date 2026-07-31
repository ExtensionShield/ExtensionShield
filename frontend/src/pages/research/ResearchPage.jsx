import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import ShieldLogo from "../../components/ShieldLogo";
import { researchArticles, articlePath } from "../../data/articles";
import StatsIcon from "../../components/ui/StatsIcon";
import "./ResearchPage.scss";

const ResearchPage = () => {
  return (
    <>
      <SEOHead
        title="Extension Threat Research & Case Studies | ExtensionShield"
        description="In-depth security research on Chrome extension threats, malware analysis, and case studies of deceptive extensions like Honey."
        pathname="/research"
      />

      <div className="research-page">
        <div className="research-content">
          <header className="research-header">
            <span className="research-badge">Research Hub</span>
            <h1>Extension Security Research</h1>
            <p>
              In-depth analysis, case studies, and methodology behind ExtensionShield's security scoring.
            </p>
          </header>

          {/* Published findings from our own scan corpus. These are primary
              evidence, which is why they sit above the navigational cards. */}
          {researchArticles.length > 0 && (
            <section className="research-reports" aria-label="Published research">
              <h2 className="research-reports-heading">Published findings</h2>
              <ul className="research-reports-list">
                {researchArticles.map((article) => (
                  <li key={article.slug}>
                    <Link to={articlePath(article)}>
                      <strong>{article.title}</strong>
                      <span>{article.description}</span>
                      {article.keyFindings?.[0] && (
                        <span className="research-reports-finding">{article.keyFindings[0]}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="research-grid">
            {/* Case Studies */}
            <Link to="/research/case-studies" className="research-card featured">
              <div className="card-icon">📋</div>
              <div className="card-content">
                <h3>Case Studies</h3>
                <p>Sourced write-ups of deceptive extensions, including the Honey affiliate controversy and fake ad blockers.</p>
                <span className="card-link">
                  Explore case studies
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>

            {/* Benchmarks */}
            <Link to="/research/benchmarks" className="research-card">
              <div className="card-icon">
                <StatsIcon size={32} />
              </div>
              <div className="card-content">
                <h3>Benchmarks</h3>
                <p>Open, reproducible comparisons across scanners + industry risk trends.</p>
                <span className="card-link">
                  View benchmarks
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>

            {/* How We Score */}
            <Link to="/research/methodology" className="research-card">
              <div className="card-icon">⚙️</div>
              <div className="card-content">
                <h3>How We Score</h3>
                <p>How we score risk: static analysis, permission mapping, threat intelligence, and evidence chain-of-custody.</p>
                <span className="card-link">
                  Learn our approach
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>

            {/* A "Threat Intelligence — Coming Soon" card used to sit here. It
                was removed in 2026-07: VirusTotal aggregation is not upcoming,
                it already ships (core/analyzers/virustotal.py, surfaced in every
                scan report and in the governance facts). Advertising a shipped
                capability as unbuilt undersells the product and reads as filler.
                Add a card back when there is a threat-intel page to link to. */}

            {/* Open Source */}
            <Link to="/open-source" className="research-card">
              <div className="card-icon">🌱</div>
              <div className="card-content">
                <h3>Open Source</h3>
                <p>ExtensionShield is open source. Contribute rules, report issues, or join our GSoC program.</p>
                <span className="card-link">
                  Get involved
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResearchPage;

