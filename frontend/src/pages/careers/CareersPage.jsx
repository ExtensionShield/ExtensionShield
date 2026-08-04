import React from "react";
import { useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { careersRoles } from "../../data/careersRoles";
import "./CareersPage.scss";

const CANONICAL_ORIGIN = "https://extensionshield.com";

/**
 * Date the role list was last confirmed accurate. JobPosting.datePosted was
 * previously a hardcoded "2025-01-01", which claimed every role had been open
 * and unfilled for 19 months — Google treats a stale datePosted as a signal the
 * posting is dead. Bump this whenever the roles in careersRoles.js are reviewed;
 * if a role is no longer open, remove it from that file rather than leaving it
 * listed with a fresh date.
 */
const ROLES_LAST_REVIEWED = "2026-08-01";

const CareersPage = () => {
  const navigate = useNavigate();

  const applyForRole = (roleId) => {
    navigate(`/careers/apply${roleId ? `?role=${encodeURIComponent(roleId)}` : ""}`);
  };

  const jobsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Open roles at ExtensionShield",
    "description": "Join ExtensionShield. We're building the security, privacy, and governance layer for browser extensions.",
    "numberOfItems": careersRoles.length,
    "itemListElement": careersRoles.map((role, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "JobPosting",
        "title": role.title,
        "description": role.summary,
        "datePosted": ROLES_LAST_REVIEWED,
        "employmentType": "FULL_TIME",
        "hiringOrganization": {
          "@type": "Organization",
          "name": "ExtensionShield",
          "sameAs": CANONICAL_ORIGIN,
        },
        "jobLocation": {
          "@type": "Place",
          "address": {
            "@type": "PostalAddress",
            "addressRegion": "Remote",
            "addressCountry": "US",
          },
        },
      },
    })),
  };

  return (
    <>
      <SEOHead
        title="Careers | ExtensionShield"
        description="Join ExtensionShield. We're building the security, privacy, and governance layer for browser extensions. View open roles and apply."
        pathname="/careers"
        ogType="website"
        schema={jobsSchema}
      />

      <div className="careers-page">
        <div className="careers-content">
          <header className="careers-hero">
            <h1 className="careers-hero-title">Open roles</h1>
          </header>

          <section id="open-roles" className="careers-section careers-roles-list">
            <div className="careers-cards">
              {careersRoles.map((role) => (
                <article key={role.id} className="careers-role-card">
                  <div className="careers-role-card-header">
                    <h3>{role.title}</h3>
                    <div className="careers-role-meta">
                      <span>{role.department}</span>
                      <span>{role.location}</span>
                      <span>{role.type}</span>
                    </div>
                  </div>
                  <p className="careers-role-summary">{role.summary}</p>
                  <div className="careers-role-card-actions">
                    <button
                      type="button"
                      className="action-signin careers-btn-sm"
                      onClick={() => applyForRole(role.id)}
                    >
                      Apply
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
};

export default CareersPage;
