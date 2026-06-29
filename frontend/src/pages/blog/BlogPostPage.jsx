import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import SEOHead from "../../components/SEOHead";
import { getBlogPostBySlug, blogPosts } from "../../data/blogPosts";
import "../compare/ComparePage.scss";
import "./BlogPostPage.scss";

const defaultInternalLinks = [
  { label: "Scan an extension", to: "/scan" },
  { label: "Browser extension security", to: "/extension-security" },
  { label: "Extension risk score", to: "/extension-risk-score" },
  { label: "All browser extension security guides", to: "/blog" },
];

const BlogPostPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const slug = location.pathname.replace(/^\/blog\/?/, "").replace(/\/$/, "");
  const post = getBlogPostBySlug(slug);

  if (!post) {
    return (
      <div className="blog-post-page">
        <div className="compare-container">
          <p>Post not found.</p>
          <Link to="/blog">Back to blog</Link>
        </div>
      </div>
    );
  }

  const canonicalUrl = `https://extensionshield.com/blog/${post.slug}`;
  const ogImage = "https://extensionshield.com/og.png";

  // ExtensionShield Organization, reused as both author and publisher.
  // There is no per-author field on posts, so we do not invent a person.
  const organization = {
    "@type": "Organization",
    name: "ExtensionShield",
    url: "https://extensionshield.com",
    logo: {
      "@type": "ImageObject",
      url: ogImage,
    },
  };

  // Post dates are stored as "YYYY-MM"; normalize to an ISO date when present.
  // If a post has no date, omit datePublished rather than inventing one.
  const isoDate =
    typeof post.date === "string" && /^\d{4}-\d{2}$/.test(post.date)
      ? `${post.date}-01`
      : post.date || null;

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    ...(isoDate ? { datePublished: isoDate } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonicalUrl,
    },
    image: ogImage,
    author: organization,
    publisher: organization,
  };

  // "Read next" — surface a few other posts, preferring the same category.
  const relatedPosts = [
    ...blogPosts.filter((p) => p.slug !== post.slug && p.category === post.category),
    ...blogPosts.filter((p) => p.slug !== post.slug && p.category !== post.category),
  ].slice(0, 3);

  return (
    <>
      <SEOHead
        title={post.title}
        description={post.description}
        pathname={`/blog/${post.slug}`}
        ogType="article"
        ogImage={ogImage}
        schema={articleSchema}
      />

      <div className="blog-post-page">
        <div className="compare-container">
          <div className="compare-back-wrapper">
          <button type="button" className="compare-back" onClick={() => navigate(-1)}>
            ← Back
          </button>
          </div>

          <header className="compare-header">
            <span className="blog-post-meta">
              {post.category} · {post.date}
            </span>
            <h1>{post.title}</h1>
          </header>

          <div className="compare-prose">
            {post.sections.map((section, idx) => (
              <section key={idx}>
                <h2>{section.heading}</h2>
                <p>{section.body}</p>
              </section>
            ))}
          </div>

          <div className="compare-cta">
            <Link to="/scan">Scan an extension with ExtensionShield →</Link>
          </div>

          {relatedPosts.length > 0 && (
            <div className="compare-links">
              <h3>Read next</h3>
              <ul>
                {relatedPosts.map((related) => (
                  <li key={related.slug}>
                    <Link to={`/blog/${related.slug}`}>{related.title}</Link>
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

export default BlogPostPage;
