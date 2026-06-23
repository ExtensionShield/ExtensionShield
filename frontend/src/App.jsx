import React, { Suspense, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { BrowserRouter as Router, Routes, Route, NavLink, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { ScanProvider } from "./context/ScanContext";
import routes from "./routes/routes";
import { topNavItems, userMenuItems, getMobileNavSections } from "./nav/navigation";
import SignInModal from "./components/SignInModal";
import ShieldLogo from "./components/ShieldLogo";
import Footer from "./components/Footer";
import AppBackground from "./components/AppBackground";
import useGitHubStars, { formatStars } from "./hooks/useGitHubStars";
import { trackPageView } from "./services/telemetryService";
import "./App.scss";

// Loading fallback
const PageLoader = () => (
  <div className="page-loader">
    <div className="loading-spinner" />
  </div>
);

// User Menu Component
function UserMenu() {
  const { user, signOut, isLoading } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [avatarError, setAvatarError] = React.useState(false);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsMenuOpen(false);
    await signOut();
  };

  const getInitials = (name) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const getProviderIcon = (provider) => {
    switch (provider) {
      case "google":
        return (
          <svg viewBox="0 0 24 24" className="provider-badge google">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
        );
      case "github":
        return (
          <svg viewBox="0 0 24 24" fill="currentColor" className="provider-badge github">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
        );
      default:
        return null;
    }
  };

  // Menu item icon renderer
  const getMenuIcon = (icon) => {
    const icons = {
      scan: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
      history: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
      reports: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></>,
      settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>
    };
    return icons[icon] || null;
  };

  const handleAvatarError = () => {
    setAvatarError(true);
  };

  // Reset avatar error when user changes
  React.useEffect(() => {
    setAvatarError(false);
  }, [user?.id]);

  return (
    <div className="user-menu-container" ref={menuRef}>
      <button
        className="user-menu-trigger"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        disabled={isLoading}
        type="button"
        aria-haspopup="menu"
        aria-expanded={isMenuOpen}
        aria-label={user.name ? `Account menu for ${user.name}` : "Account menu"}
        title={user.name || "Account"}
      >
        {user.avatar && !avatarError ? (
          <img
            src={user.avatar}
            alt=""
            className="user-avatar"
            onError={handleAvatarError}
          />
        ) : (
          <div className="user-avatar-fallback" aria-hidden="true">{getInitials(user.name)}</div>
        )}
        <span className="user-name">{user.name?.split(" ")[0]}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`menu-chevron ${isMenuOpen ? "open" : ""}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isMenuOpen && (
        <div className="user-menu-dropdown">
          <div className="menu-header">
            <div className="menu-user-info">
              {user.avatar && !avatarError ? (
                <img 
                  src={user.avatar} 
                  alt={user.name} 
                  className="menu-avatar" 
                  onError={handleAvatarError}
                />
              ) : (
                <div className="menu-avatar-fallback">{getInitials(user.name)}</div>
              )}
              <div className="menu-user-details">
                <span className="menu-user-name">{user.name}</span>
                <span className="menu-user-email">{user.email}</span>
              </div>
            </div>
            {user.provider && user.provider !== "email" && (
              <div className="menu-provider">
                {getProviderIcon(user.provider)}
                <span>Signed in with {user.provider === "google" ? "Google" : "GitHub"}</span>
              </div>
            )}
          </div>

          <div className="menu-divider" />

          <nav className="menu-nav">
            {userMenuItems.map((item) => (
              <NavLink key={item.path} to={item.path} className="menu-item" onClick={() => setIsMenuOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {getMenuIcon(item.icon)}
                </svg>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="menu-divider" />

          <button className="menu-item signout" onClick={handleSignOut}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </div>
  );
}

// Nav Item Dropdown Component (for Scan, Research). Also handles direct-link
// top-nav items (Open Source, About) via the `!hasDropdown` early return below.
function NavItemDropdown({ item, location }) {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const timeoutRef = React.useRef(null);
  const { isAuthenticated } = useAuth();
  
  const isActive = item.matchPaths.some(path => 
    location.pathname.startsWith(path)
  );

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const renderIcon = (icon) => {
    if (icon === "github") {
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
      );
    }
    if (icon === "benchmarks") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-10" />
          <path d="M21 7v6h-6" />
        </svg>
      );
    }
    if (icon === "compare") {
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M10 7v3l2-2 2 2V7" />
          <path d="M14 17v-3l-2 2-2-2v3" />
        </svg>
      );
    }
    return icon;
  };

  const hasDropdown = item.dropdownSections?.length > 0 || (item.dropdownItems && item.dropdownItems.length > 0);
  if (!hasDropdown) {
    return (
      <NavLink
        to={item.path}
        className={({ isActive: navIsActive }) => {
          const matchesPath = item.matchPaths.some(path => location.pathname.startsWith(path));
          return `nav-item ${navIsActive || matchesPath ? "active" : ""}`;
        }}
      >
        {item.label}
      </NavLink>
    );
  }

  const handleMouseEnter = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 150); // Small delay to allow moving to dropdown
  };

  return (
    <div 
      className="nav-dropdown-container" 
      ref={menuRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button 
        className={`nav-item nav-dropdown-trigger ${isActive ? "active" : ""} ${isOpen ? "open" : ""}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        {item.label}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d={isOpen ? "M3 9l3-3 3 3" : "M3 3l3 3 3-3"} />
        </svg>
      </button>

      {isOpen && (
        <div 
          className={`nav-dropdown-menu ${item.dropdownSections ? "nav-dropdown-menu--sections" : ""}`}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {item.dropdownSections ? (
            <>
              {item.dropdownSections.map((section, sectionIdx) => (
                <div key={sectionIdx} className="nav-dropdown-section">
                  <div className="nav-dropdown-category" aria-hidden="true">{section.heading}</div>
                  <div className="megamenu-items-list">
                    {section.items.map((dropdownItem, idx) => {
                      const Element = dropdownItem.external ? "a" : NavLink;
                      const linkProps = dropdownItem.external
                        ? { href: dropdownItem.href, target: "_blank", rel: "noopener noreferrer" }
                        : { to: dropdownItem.path };
                      return (
                        <Element
                          key={idx}
                          {...linkProps}
                          className="megamenu-item"
                          onClick={() => setIsOpen(false)}
                        >
                          <div className="megamenu-icon">{renderIcon(dropdownItem.icon)}</div>
                          <div className="megamenu-content">
                            <div className="megamenu-label">{dropdownItem.label}</div>
                            <div className="megamenu-desc">{dropdownItem.description}</div>
                          </div>
                        </Element>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {item.dropdownItems.map((dropdownItem, idx) => {
                const Element = dropdownItem.external ? "a" : NavLink;
                const linkProps = dropdownItem.external 
                  ? { href: dropdownItem.href, target: "_blank", rel: "noopener noreferrer" }
                  : { to: dropdownItem.path };

                const showSignInHint = dropdownItem.requiresAuth && !isAuthenticated;
                return (
                  <Element
                    key={idx}
                    {...linkProps}
                    className="nav-dropdown-item"
                    onClick={() => setIsOpen(false)}
                  >
                    <div className="nav-dropdown-icon">{renderIcon(dropdownItem.icon)}</div>
                    <div className="nav-dropdown-content">
                      <div className="nav-dropdown-label-row">
                        <div className="nav-dropdown-label">{dropdownItem.label}</div>
                        {dropdownItem.badge && (
                          <span className="nav-dropdown-badge" aria-hidden="true">{dropdownItem.badge}</span>
                        )}
                        {showSignInHint && (
                          <span className="nav-dropdown-hint" aria-label="Sign in required">Sign in</span>
                        )}
                      </div>
                      <div className="nav-dropdown-desc">{dropdownItem.description}</div>
                    </div>
                  </Element>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Reusable auth loading dots (header desktop + mobile)
function AuthLoadingDots() {
  return (
    <div className="auth-loading">
      <span className="loading-dot" />
      <span className="loading-dot" />
      <span className="loading-dot" />
    </div>
  );
}

// Compact GitHub trust-signal badge (replaces theme toggle)
function GitHubBadge() {
  const { stars } = useGitHubStars("Stanzin7/ExtensionShield");
  const label = formatStars(stars);
  return (
    <a
      href="https://github.com/Stanzin7/ExtensionShield"
      target="_blank"
      rel="noopener noreferrer"
      className="header-gh-badge"
      aria-label={label ? `ExtensionShield on GitHub · ${label} stars` : "ExtensionShield on GitHub"}
    >
      <svg viewBox="0 0 17 16" fill="none" className="header-gh-icon" aria-hidden="true">
        <path fillRule="evenodd" clipRule="evenodd" d="M8.5 2.22168C5.23312 2.22168 2.58496 4.87398 2.58496 8.14677C2.58496 10.7642 4.27962 12.9853 6.63026 13.7684C6.92601 13.8228 7.03366 13.6401 7.03366 13.4827C7.03366 13.3425 7.02893 12.9693 7.02597 12.4754C5.38041 12.8333 5.0332 11.681 5.0332 11.681C4.76465 10.996 4.37663 10.8139 4.37663 10.8139C3.83954 10.4471 4.41744 10.4542 4.41744 10.4542C5.01072 10.4956 5.32303 11.0647 5.32303 11.0647C5.85065 11.9697 6.70774 11.7082 7.04431 11.5568C7.09873 11.1741 7.25134 10.9132 7.42051 10.7654C6.10737 10.6157 4.72621 10.107 4.72621 7.83683C4.72621 7.19031 4.95689 6.66092 5.33486 6.24686C5.27394 6.09721 5.07105 5.49447 5.39283 4.67938C5.39283 4.67938 5.88969 4.51967 7.01947 5.28626C7.502 5.15466 7.99985 5.08763 8.5 5.08692C9.00278 5.08929 9.50851 5.15495 9.98113 5.28626C11.1103 4.51967 11.606 4.67879 11.606 4.67879C11.9289 5.49447 11.7255 6.09721 11.6651 6.24686C12.0437 6.66092 12.2732 7.19031 12.2732 7.83683C12.2732 10.1129 10.8897 10.6139 9.5724 10.7606C9.78475 10.9434 9.97344 11.3048 9.97344 11.8579C9.97344 12.6493 9.96634 13.2887 9.96634 13.4827C9.96634 13.6413 10.0728 13.8258 10.3733 13.7678C11.5512 13.3728 12.5751 12.6175 13.3003 11.6089C14.0256 10.6002 14.4155 9.38912 14.415 8.14677C14.415 4.87398 11.7663 2.22168 8.5 2.22168Z" fill="currentColor" />
      </svg>
      {label && (
        <span className="header-gh-stars" aria-hidden="true">{label}</span>
      )}
    </a>
  );
}

// App Header Component
function AppHeader() {
  const location = useLocation();
  const { user, isAuthenticated, openSignInModal, isLoading } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const mobileMenuRef = React.useRef(null);

  React.useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  React.useEffect(() => {
    const handleClickOutside = (e) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target) && !e.target.closest(".header-mobile-toggle")) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  const mobileSections = getMobileNavSections();

  return (
    <header className="extensionshield-header solid">
      <div className="header-container">
        <NavLink to="/" className="header-logo" onClick={() => setMobileMenuOpen(false)}>
          <div className="header-logo-shield" aria-hidden="true">
            <ShieldLogo size={48} />
          </div>
          <span className="logo-text">ExtensionShield</span>
        </NavLink>

        <nav className="header-nav header-nav-desktop" aria-label="Main">
          {topNavItems.map((item) => (
            <NavItemDropdown key={item.path} item={item} location={location} />
          ))}
        </nav>

        <div className="header-actions header-actions-desktop">
          <GitHubBadge />
          {isLoading ? (
            <AuthLoadingDots />
          ) : isAuthenticated && user ? (
            <UserMenu />
          ) : (
            <button type="button" className="action-signin" onClick={openSignInModal}>
              Sign In
            </button>
          )}
        </div>

        {/* Group GitHub badge and hamburger in one wrapper on mobile so space-between aligns properly */}
        <div className="header-actions-mobile-wrapper" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div className="header-actions header-actions-mobile">
            <GitHubBadge />
          </div>

          <button
            type="button"
            className="header-mobile-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
            <span className="hamburger-bar" />
          </button>
        </div>
      </div>

      {createPortal(
        <div
          ref={mobileMenuRef}
          className={`mobile-menu ${mobileMenuOpen ? "mobile-menu-open" : ""}`}
          aria-hidden={!mobileMenuOpen}
        >
          <nav className="mobile-menu-nav" aria-label="Mobile">
            {mobileSections.map((section, sectionIdx) => (
              <div
                key={sectionIdx}
                className={`mobile-menu-section${section.directLink ? " mobile-menu-section--direct" : ""}`}
              >
                {!section.directLink && (
                  <span className="mobile-menu-section-title">{section.label || section.category}</span>
                )}
                <div className="mobile-menu-section-links">
                  {section.links.map((link, idx) => {
                    const key = link.path || link.href || `${sectionIdx}-${idx}`;
                    const showSignInHint = link.requiresAuth && !isAuthenticated;
                    if (link.external && link.href) {
                      return (
                        <a
                          key={key}
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mobile-menu-link"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {link.label}
                          {link.badge && (
                            <span className="mobile-menu-badge" aria-hidden="true">{link.badge}</span>
                          )}
                        </a>
                      );
                    }
                    return (
                      <NavLink
                        key={key}
                        to={link.path}
                        className={({ isActive }) => `mobile-menu-link${isActive ? " active" : ""}`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {link.label}
                        {link.badge && (
                          <span className="mobile-menu-badge" aria-hidden="true">{link.badge}</span>
                        )}
                        {showSignInHint && (
                          <span className="mobile-menu-hint" aria-label="Sign in required">Sign in</span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          <div className="mobile-menu-actions">
            {isLoading ? (
              <AuthLoadingDots />
            ) : isAuthenticated && user ? (
              <UserMenu />
            ) : (
              <button type="button" className="action-signin mobile-signin" onClick={() => { openSignInModal(); setMobileMenuOpen(false); }}>
                Sign In
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}

function TelemetryTracker() {
  const location = useLocation();

  React.useEffect(() => {
    // Track on route entry; fails silently if backend is unavailable.
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}

// Derive route segment for background CSS variables
function getRouteSegment(pathname) {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/scan")) return "scan";
  if (pathname.startsWith("/research")) return "research";
  if (pathname.startsWith("/extension-")) return "resources";
  if (pathname.startsWith("/open-source") || pathname.startsWith("/contribute") || pathname.startsWith("/glossary") || pathname.startsWith("/gsoc") || pathname.startsWith("/community") || pathname.startsWith("/about") || pathname.startsWith("/blog") || pathname.startsWith("/compare")) return "resources";
  return "default";
}

// App Content Component
function AppContent() {
  const location = useLocation();
  const routeSegment = getRouteSegment(location.pathname);
//Scroll to top on route change
  useLayoutEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }, [location.pathname]);
  return (
    <div className="extensionshield-app" data-route={routeSegment}>
      <AppBackground />
      <AppHeader />
      <SignInModal />
      <TelemetryTracker />

      <main className="extensionshield-main">
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {routes.map((route, index) => (
              <Route key={index} path={route.path} element={route.element} />
            ))}
          </Routes>
        </Suspense>
      </main>
      
      <Footer />
    </div>
  );
}

// Main App Component
function App() {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ScanProvider>
            <AppContent />
          </ScanProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
