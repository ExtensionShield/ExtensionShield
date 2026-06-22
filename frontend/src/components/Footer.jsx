import React from "react";
import { Link } from "react-router-dom";
import { Github, Star } from "lucide-react";
import { footerConfig } from "../nav/navigation";
import ShieldLogo from "./ShieldLogo";
import useGitHubStars, { formatStars } from "../hooks/useGitHubStars";
import "./Footer.scss";

const DiscordIcon = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" {...props}>
    <path d="M20.32 4.37A19.8 19.8 0 0 0 15.45 3a13.6 13.6 0 0 0-.62 1.27 18.3 18.3 0 0 0-5.66 0A13 13 0 0 0 8.55 3 19.7 19.7 0 0 0 3.68 4.37 20.3 20.3 0 0 0 .2 18.06a19.9 19.9 0 0 0 6 3.05c.48-.66.92-1.36 1.28-2.1-.7-.26-1.37-.59-2-.97.17-.12.33-.25.49-.38a14.2 14.2 0 0 0 12.06 0c.16.14.32.26.49.38-.64.38-1.31.71-2.01.98.37.73.8 1.43 1.28 2.09a19.8 19.8 0 0 0 6-3.05 20.2 20.2 0 0 0-3.49-13.69ZM8.02 15.33c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.17 1.09 2.15 2.42c0 1.33-.95 2.42-2.15 2.42Zm7.96 0c-1.18 0-2.15-1.09-2.15-2.42s.95-2.42 2.15-2.42 2.17 1.09 2.15 2.42c0 1.33-.94 2.42-2.15 2.42Z" />
  </svg>
);

const Footer = () => {
  const groups = footerConfig.linkGroups;
  const { stars } = useGitHubStars(footerConfig.repo);
  const starLabel = formatStars(stars);

  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer__inner">
        <div className="app-footer__grid">
          {/* Left column: brand + description + social */}
          <div className="app-footer__brand-col">
            <Link to="/" className="app-footer__brand" aria-label="ExtensionShield home">
              <div className="app-footer__logo" aria-hidden="true">
                <ShieldLogo size={40} />
              </div>
              <span className="app-footer__name">ExtensionShield</span>
            </Link>
            {footerConfig.tagline && (
              <p className="app-footer__tagline">{footerConfig.tagline}</p>
            )}
            <p className="app-footer__disclaimer">{footerConfig.disclaimer}</p>

            <div className="app-footer__social">
              <a
                href={footerConfig.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="app-footer__social-link"
                aria-label={
                  starLabel
                    ? `ExtensionShield on GitHub, ${starLabel} stars`
                    : "ExtensionShield on GitHub"
                }
              >
                <Github size={16} strokeWidth={2} aria-hidden="true" />
                <span>GitHub</span>
                {starLabel && (
                  <span className="app-footer__star">
                    <Star size={12} strokeWidth={2} aria-hidden="true" />
                    {starLabel}
                  </span>
                )}
              </a>
              {footerConfig.discordUrl && (
                <a
                  href={footerConfig.discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="app-footer__social-link"
                  aria-label="ExtensionShield community on Discord"
                >
                  <DiscordIcon />
                  <span>Discord</span>
                </a>
              )}
            </div>
          </div>

          {/* Right column: link groups */}
          <div className="app-footer__links-col">
            <div className="app-footer__groups">
              {groups.map((group, idx) => (
                <div key={idx} className="app-footer__group">
                  <span className="app-footer__group-heading">{group.heading}</span>
                  <ul className="app-footer__list" aria-label={group.heading}>
                    {group.links.map((link, i) => (
                      <li key={i}>
                        {link.external ? (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="app-footer__link"
                          >
                            {link.label}
                          </a>
                        ) : (
                          <Link to={link.path} className="app-footer__link">
                            {link.label}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom bar: open-source badge, non-affiliation disclaimer, copyright */}
        <div className="app-footer__bottom">
          <div className="app-footer__accent-line" aria-hidden="true" />
          {footerConfig.nonAffiliation && (
            <p className="app-footer__non-affiliation">{footerConfig.nonAffiliation}</p>
          )}
          <p className="app-footer__copy">
            <span className="app-footer__badge">
              <span className="app-footer__badge-dot" aria-hidden="true" />
              Open source
            </span>
            © {new Date().getFullYear()} ExtensionShield. Pre-install extension security.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
