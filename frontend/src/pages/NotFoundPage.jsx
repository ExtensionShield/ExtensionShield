import React from "react";
import { Link } from "react-router-dom";
import { Search, Home, FileText } from "lucide-react";
import SEOHead from "../components/SEOHead";

/**
 * Real 404 page.
 *
 * Replaces the previous catch-all that silently redirected unknown URLs to "/",
 * which produced a soft-404 (HTTP 200 + homepage content under the wrong URL).
 * This page:
 *   - emits <meta name="robots" content="noindex, nofollow"> so crawlers drop it
 *   - does NOT redirect, so the requested URL stays visible and honest
 *   - offers useful next steps instead of a dead end
 *
 * The FastAPI catch-all (serve_spa) additionally returns a real HTTP 404 status
 * + X-Robots-Tag: noindex for URLs that don't match a known route.
 */
const NotFoundPage = () => {
  return (
    <>
      <SEOHead
        title="Page Not Found (404)"
        description="This page could not be found. Scan a Chrome extension or browse ExtensionShield's open-source security research."
        noindex
      />
      <div className="page-container" style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.8rem", letterSpacing: "0.12em", textTransform: "uppercase", opacity: 0.6, marginBottom: "0.75rem" }}>
          Error 404
        </p>
        <h1 style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>This page doesn’t exist</h1>
        <p style={{ opacity: 0.8, marginBottom: "2rem", lineHeight: 1.6 }}>
          The page you’re looking for may have moved or never existed. Here’s where to go next:
        </p>
        <nav aria-label="Helpful links" style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <Home size={16} aria-hidden="true" /> Home
          </Link>
          <Link to="/scan" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <Search size={16} aria-hidden="true" /> Scan an extension
          </Link>
          <Link to="/research/methodology" style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
            <FileText size={16} aria-hidden="true" /> How scoring works
          </Link>
        </nav>
      </div>
    </>
  );
};

export default NotFoundPage;
