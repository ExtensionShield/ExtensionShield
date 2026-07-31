import React, { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { caseStudies, CASE_STUDIES_PER_PAGE } from "../../data/caseStudiesData";
import "./CaseStudiesPage.scss";

const CASE_STUDIES_BASE = "https://extensionshield.com";

const caseStudiesItemListSchema = {
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Chrome Extension Security Case Studies",
  "description": "Real-world case studies of malicious and deceptive Chrome extensions for security teams and enterprises.",
  "numberOfItems": caseStudies.length,
  "itemListElement": caseStudies.map((s, i) => ({
    "@type": "ListItem",
    "position": i + 1,
    "url": `${CASE_STUDIES_BASE}${s.path}`,
    "name": s.title,
  })),
};

const CaseStudiesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

  const totalPages = Math.ceil(caseStudies.length / CASE_STUDIES_PER_PAGE);
  const safePage = Math.min(currentPage, totalPages || 1);
  const start = (safePage - 1) * CASE_STUDIES_PER_PAGE;
  const paginatedStudies = useMemo(
    () => caseStudies.slice(start, start + CASE_STUDIES_PER_PAGE),
    [start]
  );

  const setPage = (page) => {
    const next = Math.max(1, Math.min(page, totalPages));
    if (next === 1) {
      searchParams.delete("page");
    } else {
      searchParams.set("page", String(next));
    }
    setSearchParams(searchParams, { replace: true });
  };

  return (
    <>
      <SEOHead
        title="Chrome Extension Security Case Studies | Malicious Extensions Research | ExtensionShield"
        description="Sourced case studies of deceptive Chrome extensions: the reported Honey affiliate controversy and the documented fake ad blocker payload. For security teams, enterprises, and anyone evaluating extension risk."
        pathname="/research/case-studies"
        schema={caseStudiesItemListSchema}
      />

      <div className="case-studies-page">
        <div className="case-studies-content">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <Link to="/research">Research</Link>
            <span aria-hidden>/</span>
            <span>Case Studies</span>
          </nav>

          <header className="case-studies-header">
            <h1>Chrome Extension Security Case Studies</h1>
            <p>
              Real-world analysis of malicious and deceptive browser extensions. Learn the patterns, tactics, and red flags security researchers and enterprises use to evaluate extension risk—from affiliate fraud and data exfiltration to ad-injecting malware.
            </p>
          </header>

          <div className="case-studies-list">
            {paginatedStudies.map((study) => (
              <Link
                key={study.id}
                to={study.path}
                className={`case-study-card ${study.featured ? "featured" : ""}`}
              >
                <div className="case-study-meta">
                  <span className={`severity-badge ${(study.severity || "").toLowerCase().replace(/\s+/g, "-")}`}>
                    {study.severity}
                  </span>
                  <span className="category-badge">{study.category}</span>
                </div>
                <h3 className="case-study-title">{study.title}</h3>
                <p className="subtitle">{study.subtitle}</p>
                <p className="description">{study.description}</p>
                <span className="read-more">
                  Read case study
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="case-studies-pagination" aria-label="Case studies pagination">
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
                aria-label="Previous page"
              >
                Previous
              </button>
              <div className="pagination-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-num ${p === safePage ? "active" : ""}`}
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === safePage ? "page" : undefined}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="pagination-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </nav>
          )}
        </div>
      </div>
    </>
  );
};

export default CaseStudiesPage;
