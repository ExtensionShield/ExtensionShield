import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import RainfallDroplets from "../../components/RainfallDroplets";
import "./OpenSourcePage.scss";

const OpenSourcePage = () => {
  return (
    <>
      <SEOHead
        title="Open Source | ExtensionShield"
        description="ExtensionShield Core is open source under the MIT License. Explore the GitHub repo, contribute code, join open-source programs, or help improve browser extension security."
        pathname="/open-source"
      />

      <div className="open-source-page">
        <RainfallDroplets />

        <div className="open-source-content">
          <header className="open-source-header">
            <div className="oss-badge">🌱 Open Source</div>
            <h1>Built in the Open</h1>
            <p>
              ExtensionShield Core is open source under the MIT License. The hosted scanner at extensionshield.com runs on this codebase — anyone can read the source, file issues, and contribute.
            </p>
          </header>

          <div className="links-grid">
            <a 
              href="https://github.com/ExtensionShield/ExtensionShield" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-card featured"
            >
              <div className="link-icon">
                <svg viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <div className="link-content">
                <h3>GitHub Repository</h3>
                <p>Source code, issues, and pull requests.</p>
              </div>
              <span className="arrow">→</span>
            </a>

            <Link to="/contribute" className="link-card">
              <div className="link-icon contribute">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <div className="link-content">
                <h3>Contribute</h3>
                <p>How to get started as a contributor.</p>
              </div>
              <span className="arrow">→</span>
            </Link>

            <Link to="/open-source/programs" className="link-card">
              <div className="link-icon gsoc">📋</div>
              <div className="link-content">
                <h3>Open Source Programs</h3>
                <p>Programs we&apos;ve applied to (GSoC, etc.)</p>
              </div>
              <span className="arrow">→</span>
            </Link>

            <Link to="/community#connect" className="link-card">
              <div className="link-icon community">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
              <div className="link-content">
                <h3>Community</h3>
                <p>Join discussions and chat.</p>
              </div>
              <span className="arrow">→</span>
            </Link>

            <Link to="/blog" className="link-card">
              <div className="link-icon blog">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
                </svg>
              </div>
              <div className="link-content">
                <h3>Blog</h3>
                <p>Updates and research articles.</p>
              </div>
              <span className="arrow">→</span>
            </Link>

            <Link to="/research/methodology" className="link-card">
              <div className="link-icon methodology">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <div className="link-content">
                <h3>How We Score</h3>
                <p>How we score and analyze extensions.</p>
              </div>
              <span className="arrow">→</span>
            </Link>
          </div>

          <div className="license-section">
            <h3>License</h3>
            <p>
              <strong>ExtensionShield Core</strong> is open source under the <strong>MIT License</strong>. See the GitHub repository for the full license and source.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default OpenSourcePage;

