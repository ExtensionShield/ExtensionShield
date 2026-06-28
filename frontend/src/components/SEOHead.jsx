import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { getCanonicalUrl, getPageTitle, getOGTags, getTwitterTags } from '../utils/seoUtils';

/**
 * Reusable SEO Head Component
 * 
 * Usage:
 * <SEOHead
 *   title="Page Title"
 *   description="Page description"
 *   pathname="/page-path"
 *   ogType="website"
 *   noindex={false}
 * />
 */
const SEOHead = ({
  title,
  description,
  pathname,
  canonicalPath, // Optional: point canonical at a DIFFERENT path (consolidate near-duplicates)
  ogType = 'website',
  ogImage,
  twitterImage,
  noindex = false,
  schema,
  keywords,
  children, // For additional meta tags
}) => {
  const location = useLocation();
  const actualPathname = pathname || location.pathname;
  // Canonical may intentionally differ from the current path to consolidate
  // ranking signals onto a single owner page for a shared search intent.
  const canonicalUrl = getCanonicalUrl(canonicalPath || actualPathname);
  const fullTitle = getPageTitle(title);
  
  const ogTags = getOGTags({
    title: fullTitle,
    description,
    pathname: actualPathname,
    type: ogType,
    image: ogImage,
  });
  
  const twitterTags = getTwitterTags({
    title: fullTitle,
    description,
    image: twitterImage || ogImage,
  });

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}
      <link rel="canonical" href={canonicalUrl} />
      
      {/* Open Graph tags */}
      {Object.entries(ogTags).map(([key, value]) => (
        <meta key={key} property={key} content={value} />
      ))}
      
      {/* Twitter Card tags */}
      {Object.entries(twitterTags).map(([key, value]) => (
        <meta key={key} name={key} content={value} />
      ))}
      
      {/* Robots meta */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      
      {/* JSON-LD Schema */}
      {schema && (
        Array.isArray(schema) ? (
          schema.map((s, idx) => (
            <script key={idx} type="application/ld+json">
              {JSON.stringify(s)}
            </script>
          ))
        ) : (
          <script type="application/ld+json">
            {JSON.stringify(schema)}
          </script>
        )
      )}
      
      {/* Additional children (for page-specific meta tags) */}
      {children}
    </Helmet>
  );
};

export default SEOHead;

