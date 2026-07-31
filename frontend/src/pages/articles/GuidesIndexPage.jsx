import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { guideArticles, researchArticles, articlePath } from "../../data/articles";
import "../compare/ComparePage.scss";
import "./ArticlePage.scss";

/** Renders "July 2026" from datePublished. Never invents a date. */
function formatMonth(article) {
  const value = article.datePublished;
  if (typeof value !== "string") return "";
  const match = value.match(/^(\d{4})-(\d{2})/);
  if (!match) return "";
  const [, year, month] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/**
 * /guides — reference material synthesised from public documentation.
 *
 * Original research lives at /research and is deliberately NOT listed here as a
 * peer. It is surfaced at the bottom as a pointer, so the distinction between
 * "we compiled this" and "we measured this" stays visible to the reader.
 */
const GuidesIndexPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="Chrome Extension Security Guides | Permissions, Manifest V3 & Governance"
        description="Practical reference guides on browser extension security: dangerous permissions, Manifest V3, supply chain attacks, allowlist policy, and pre-release CRX audits."
        pathname="/guides"
        ogType="website"
      />

      <div className="article-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>

          <header className="compare-header">
            <h1>Extension security guides</h1>
            <p>
              Reference material for reviewing browser extensions: what permissions actually grant,
              how supply chain attacks reach installed users, what Manifest V3 did and did not fix,
              and how to run a pre-release audit. Every claim is sourced.
            </p>
          </header>

          <ul className="guides-index-list">
            {guideArticles.map((article) => (
              <li key={article.slug}>
                <Link to={articlePath(article)} className="guides-index-link">
                  <span className="guides-index-meta">
                    {article.category}
                    {formatMonth(article) && <> · {formatMonth(article)}</>}
                    {article.readingTime && <> · {article.readingTime} min read</>}
                  </span>
                  <strong>{article.title}</strong>
                  <span className="guides-index-desc">{article.description}</span>
                </Link>
              </li>
            ))}
          </ul>

          {researchArticles.length > 0 && (
            <div className="compare-links">
              <h3>Original research</h3>
              <p className="guides-index-desc">
                These are built on ExtensionShield&apos;s own scan corpus rather than compiled from
                public documentation.
              </p>
              <ul>
                {researchArticles.map((article) => (
                  <li key={article.slug}>
                    <Link to={articlePath(article)}>{article.title}</Link>
                  </li>
                ))}
                <li>
                  <Link to="/research/case-studies">Extension security case studies</Link>
                </li>
              </ul>
            </div>
          )}

          <div className="compare-cta">
            <Link to="/scan">Scan an extension with ExtensionShield →</Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default GuidesIndexPage;
