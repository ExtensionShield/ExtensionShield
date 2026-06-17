import React from "react";
import { Link } from "react-router-dom";
import SEOHead from "../components/SEOHead";
import stanImage from "../assets/stanzin.png";
import "./AboutUsPage.scss";

const FOUNDER_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Stanzin Norzang",
  "jobTitle": "Founder & Engineer",
  "sameAs": [
    "https://github.com/Stanzin7",
    "https://www.linkedin.com/in/stanzin-norzang7/"
  ]
};

const AboutUsPage = () => {
  return (
    <>
      <SEOHead
        title="Stanzin Norzang | Founder of ExtensionShield"
        description="Stanzin Norzang is the founder of ExtensionShield, an open-source browser extension security scanner. He also co-founded Cherker, a Himalayan sea buckthorn brand from Ladakh."
        pathname="/about"
        schema={FOUNDER_SCHEMA}
      />

      <div className="about-us-page">
        <div className="about-us-content">
          <div className="about-header">
            <div className="profile-image-container">
              <img 
                src={stanImage} 
                alt="Stanzin Norzang - Founder of ExtensionShield"
                className="profile-image"
                onError={(e) => {
                  // Fallback to placeholder if image doesn't exist
                  e.target.style.display = 'none';
                  const placeholder = e.target.nextElementSibling;
                  if (placeholder) placeholder.style.display = 'flex';
                }}
                onLoad={(e) => {
                  // Ensure image is visible when loaded
                  e.target.style.display = 'block';
                  const placeholder = e.target.nextElementSibling;
                  if (placeholder) placeholder.style.display = 'none';
                }}
              />
              <div className="profile-placeholder">
                <span>ST</span>
              </div>
            </div>
            <h1>Stanzin Norzang</h1>
            <p className="founder-title">Founder & Engineer</p>
          </div>

          <div className="about-story">
            <div className="story-section">
              <h2>Why I built this</h2>
              <p>
                I learned the fun way that "harmless" browser extensions sometimes translates to:
              </p>
              <p>
                "Hi, can I have your browsing history, clipboard, and maybe custody of your first-born child?"
              </p>
              <p>
                December 2025—right near the start of the year—I installed an extension that looked totally normal. Until I actually looked at the permissions. They didn't match what it claimed to do. So I went looking for a simple answer:
              </p>
              <p>
                <strong>Is this extension actually safe?</strong>
              </p>
              <p>
                What I found were tools that were either too technical, too vague, or confidently wrong (the internet special). I couldn't find something that combined security analysis, privacy risk, and compliance into a clear verdict you can actually act on.
              </p>
              <p>
                The thing is, building a weighted scoring model for extensions isn't easy. It takes in a lot of factors. Blindly rating them down is bad—real developers and businesses get hurt. But we've got to protect consumers too. So much data is being stolen every day. I wanted something that could be fair to both sides and still give people a verdict they could trust.
              </p>
            </div>

            <div className="story-section">
              <h2>Background</h2>
              <p>
                I got my start in open source (Google Summer of Code, Drupal), then worked on enterprise systems at Hanover Insurance—where security, privacy, and compliance aren't optional. That's how ExtensionShield ended up practical: less vibes, more evidence.
              </p>
            </div>

            <div className="story-section">
              <h2>Beyond ExtensionShield</h2>
              <p>
                I'm from Ladakh, India, and a big part of my work is about building useful products that connect technology, trust, and local economic growth.
              </p>
              <p>
                Outside cybersecurity, I also co-founded{" "}
                <a
                  href="https://cherker.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Cherker
                </a>
                , a Himalayan sea buckthorn brand from Ladakh focused on wild-grown sea buckthorn juice, tea, and wellness products sourced from the Himalayan region.
              </p>
            </div>
          </div>

          <div className="about-links">
            <Link to="/open-source" className="link-button">
              <span>View Open Source</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
            <a 
              href="https://github.com/Stanzin7/ExtensionShield" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-button"
            >
              <span>GitHub</span>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <a 
              href="https://www.linkedin.com/in/stanzin-norzang7/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="link-button"
            >
              <span>LinkedIn</span>
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
            <a 
              href="mailto:support@extensionshield.com" 
              className="link-button"
            >
              <span>Email</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </>
  );
};

export default AboutUsPage;

