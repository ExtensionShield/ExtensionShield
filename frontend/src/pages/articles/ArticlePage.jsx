import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import ArticleBlocks from "../../components/article/ArticleBlocks";
import { getArticleBySlug, articles, articlePath } from "../../data/articles";
import "../compare/ComparePage.scss";
import "./ArticlePage.scss";

const SITE = "https://extensionshield.com";

const defaultInternalLinks = [
  { label: "Scan an extension", to: "/scan" },
  { label: "Browser extension security", to: "/extension-security" },
  { label: "Extension risk score", to: "/extension-risk-score" },
  { label: "All guides", to: "/guides" },
];

/** "2026-07-28" or legacy "2026-04" -> a full ISO date. Never invents one. */
function toIsoDate(value) {
  if (typeof value !== "string") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  return null;
}

function formatDate(value) {
  const iso = toIsoDate(value);
  if (!iso) return value || "";
  // Parse as UTC so the rendered date can't drift a day by timezone.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Renders one article from either collection. The collection is taken from the
 * URL and passed to the lookup, so /guides/<research-slug> does NOT resolve —
 * each article has exactly one canonical URL and no duplicate is reachable.
 */
const ArticlePage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const segments = location.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  const collection = segments[0] === "research" ? "research" : "guide";
  const slug = segments[segments.length - 1] || "";
  const post = getArticleBySlug(slug, collection);

  if (!post) {
    return (
      <div className="article-page">
        <div className="compare-container">
          <p>Article not found.</p>
          <Link to="/guides">Browse all guides</Link>
        </div>
      </div>
    );
  }

  const path = articlePath(post);
  const canonicalUrl = `${SITE}${path}`;
  const ogImage = `${SITE}/og.png`;

  const organization = {
    "@type": "Organization",
    name: "ExtensionShield",
    url: SITE,
    logo: { "@type": "ImageObject", url: ogImage },
  };

  // Author defaults to the organization. A named Person is set per-post only
  // when the post actually has one — we never invent a byline.
  //
  // `sameAs` matters here: it points at the same profiles the Person schema on
  // /about declares, so the byline and the founder page resolve to ONE entity
  // rather than two unconnected people with the same name.
  const author = post.author?.name
    ? {
        "@type": "Person",
        name: post.author.name,
        ...(post.author.url ? { url: post.author.url } : {}),
        ...(post.author.jobTitle ? { jobTitle: post.author.jobTitle } : {}),
        ...(post.author.sameAs?.length ? { sameAs: post.author.sameAs } : {}),
      }
    : organization;

  const published = toIsoDate(post.datePublished || post.date);
  const modified = toIsoDate(post.dateModified) || published;

  const keyFindings = Array.isArray(post.keyFindings) ? post.keyFindings : [];
  const sections = Array.isArray(post.sections) ? post.sections : [];
  const sources = Array.isArray(post.sources) ? post.sources : [];
  const faq = Array.isArray(post.faq) ? post.faq : [];
  // Only long posts get a table of contents; on a short post it's just noise.
  const toc = sections.filter((s) => s.id && s.heading);
  const showToc = toc.length >= 4;

  const articleSchema = {
    "@context": "https://schema.org",
    // Research reports are Reports; guides are reference articles. Neither is a
    // "blog post", and the markup should not claim otherwise.
    "@type": post.collection === "research" ? "Report" : "TechArticle",
    headline: post.title,
    description: post.description,
    ...(published ? { datePublished: published } : {}),
    ...(modified ? { dateModified: modified } : {}),
    mainEntityOfPage: { "@type": "WebPage", "@id": canonicalUrl },
    image: ogImage,
    author,
    publisher: organization,
    // Cite the sources the post is actually built on. Only real, listed URLs.
    //
    // NOTE ON EXPECTATIONS: schema.org `citation` is NOT one of Google's supported
    // Article/BlogPosting properties, so it earns no Search feature. It is emitted
    // because it is accurate and other consumers read it — the real value of the
    // source list is to human readers and quality raters looking at the rendered
    // page. Do not expand this expecting a ranking benefit.
    ...(sources.length
      ? {
          citation: sources.map((s) => ({
            "@type": "CreativeWork",
            name: s.title,
            ...(s.url ? { url: s.url } : {}),
            ...(s.publisher ? { publisher: { "@type": "Organization", name: s.publisher } } : {}),
          })),
        }
      : {}),
  };

  // NOTE ON EXPECTATIONS: Google restricted FAQ rich results to government and health
  // sites in Sept 2023 and deprecated the feature entirely on 2026-05-08. This markup
  // will NOT produce a rich result. It is kept because it is valid and costs nothing,
  // and because the FAQ content itself is genuinely useful to readers and helps
  // passage-level matching. Do not invest further in the markup.
  const faqSchema = faq.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      }
    : null;

  // Prefer siblings in the same collection, then the same category.
  const others = articles.filter((a) => a.slug !== post.slug);
  const relatedPosts = [
    ...others.filter((a) => a.collection === post.collection && a.category === post.category),
    ...others.filter((a) => a.collection === post.collection && a.category !== post.category),
    ...others.filter((a) => a.collection !== post.collection),
  ].slice(0, 3);

  return (
    <>
      <SEOHead
        title={post.title}
        description={post.description}
        pathname={path}
        ogType="article"
        ogImage={ogImage}
        schema={faqSchema ? [articleSchema, faqSchema] : articleSchema}
      />

      <div className="article-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
            <button type="button" className="compare-back" onClick={() => navigate(-1)}>
              ← Back
            </button>
          </div>

          <header className="compare-header">
            <span className="article-meta">
              {post.category}
              {published && <> · {formatDate(published)}</>}
              {post.readingTime && <> · {post.readingTime} min read</>}
            </span>
            {/* A byline that exists only in JSON-LD is not a byline. Cited research
                needs a visible, attributable human on the page. */}
            {post.author?.name && (
              <span className="article-byline">
                By{" "}
                {post.author.url ? (
                  <Link to="/about" rel="author">
                    {post.author.name}
                  </Link>
                ) : (
                  post.author.name
                )}
                {post.author.jobTitle && <span className="byline-role">, {post.author.jobTitle}</span>}
              </span>
            )}
            <h1>{post.title}</h1>
            {post.description && <p className="article-standfirst">{post.description}</p>}
            {modified && published && modified !== published && (
              <p className="article-updated">Last updated {formatDate(modified)}</p>
            )}
          </header>

          {/* Summary-first: the whole finding up top, so a reader gets the
              conclusion without committing to 2,000 words. */}
          {keyFindings.length > 0 && (
            <aside className="article-key-findings" aria-label="Key findings">
              <h2>{post.collection === "research" ? "Key findings" : "In short"}</h2>
              <ul>
                {keyFindings.map((finding, i) => (
                  <li key={i}>{finding}</li>
                ))}
              </ul>
            </aside>
          )}

          {showToc && (
            <nav className="article-toc" aria-label="On this page">
              <h2>On this page</h2>
              <ol>
                {toc.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.heading}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <div className="compare-prose">
            {sections.map((section, idx) => (
              <section key={section.id || idx} id={section.id || undefined}>
                <h2>{section.heading}</h2>
                {/* New posts author `blocks`; legacy posts carry a plain `body` string. */}
                {Array.isArray(section.blocks) ? (
                  <ArticleBlocks blocks={section.blocks} />
                ) : (
                  section.body && <p>{section.body}</p>
                )}
              </section>
            ))}
          </div>

          {faq.length > 0 && (
            <div className="article-faq">
              <h2>Frequently asked questions</h2>
              <dl>
                {faq.map((item, i) => (
                  <div key={i}>
                    <dt>{item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {sources.length > 0 && (
            <div className="article-sources">
              <h2>Sources</h2>
              <ol>
                {sources.map((source, i) => (
                  <li key={i}>
                    {source.url ? (
                      <a href={source.url} target="_blank" rel="noopener noreferrer">
                        {source.title}
                      </a>
                    ) : (
                      source.title
                    )}
                    {source.publisher && <span className="source-publisher"> — {source.publisher}</span>}
                    {source.date && <span className="source-date"> ({source.date})</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="compare-cta">
            <Link to="/scan">Scan an extension with ExtensionShield →</Link>
          </div>

          {relatedPosts.length > 0 && (
            <div className="compare-links">
              <h3>Read next</h3>
              <ul>
                {relatedPosts.map((related) => (
                  <li key={related.slug}>
                    <Link to={articlePath(related)}>{related.title}</Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="compare-links">
            <h3>Related pages</h3>
            <ul>
              {(post.internalLinks || defaultInternalLinks).map((link) => (
                <li key={link.to}>
                  <Link to={link.to}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
};

export default ArticlePage;
