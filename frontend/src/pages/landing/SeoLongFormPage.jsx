import React from "react";
import { Link, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import "../compare/ComparePage.scss";

const renderLinkList = (links) => (
  <ul>
    {links.map((link) => (
      <li key={link.to}>
        <Link to={link.to}>{link.label}</Link>
      </li>
    ))}
  </ul>
);

const SeoLongFormPage = ({ page }) => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title={page.title}
        description={page.description}
        pathname={page.pathname}
        ogType="website"
        keywords={page.keywords}
        schema={page.schema}
      />
      <div className="compare-page seo-long-form-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              Back
            </button>
          </div>

          <header className="compare-header seo-long-form-header">
            <span className="seo-long-form-eyebrow">{page.eyebrow}</span>
            <h1>{page.h1}</h1>
            {page.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </header>

          <div className="compare-cta seo-long-form-cta-row">
            {page.heroCtas.map((cta) => (
              <Link key={cta.to} to={cta.to}>{cta.label}</Link>
            ))}
          </div>

          <div className="compare-prose seo-long-form-prose">
            {page.sections.map((section) => (
              <section key={section.heading} className="seo-long-form-section">
                <h2>{section.heading}</h2>
                {section.kicker && <p className="seo-long-form-kicker">{section.kicker}</p>}
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.subsections?.map((subsection) => (
                  <div key={subsection.heading} className="seo-long-form-subsection">
                    <h3>{subsection.heading}</h3>
                    {subsection.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{paragraph}</p>
                    ))}
                    {subsection.bullets && (
                      <ul>
                        {subsection.bullets.map((bullet) => (
                          <li key={bullet}>{bullet}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
                {section.cta && (
                  <div className="compare-cta seo-inline-cta">
                    <Link to={section.cta.to}>{section.cta.label}</Link>
                  </div>
                )}
              </section>
            ))}
          </div>

          <div className="compare-links seo-related-links">
            <h3>Internal links</h3>
            {renderLinkList(page.internalLinks)}
          </div>
        </div>
      </div>
    </>
  );
};

export default SeoLongFormPage;
