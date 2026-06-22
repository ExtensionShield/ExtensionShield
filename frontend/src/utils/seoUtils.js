/**
 * SEO Utility Functions
 * 
 * Provides canonical URL generation and domain detection for SEO purposes.
 * Ensures all canonical tags point to extensionshield.com regardless of domain.
 */

const CANONICAL_DOMAIN = 'https://extensionshield.com';

/**
 * Get canonical URL for a given pathname
 * Always returns extensionshield.com URL regardless of current domain
 * 
 * @param {string} pathname - The pathname (e.g., "/scan", "/research")
 * @returns {string} Canonical URL pointing to extensionshield.com
 */
export const getCanonicalUrl = (pathname) => {
  // Ensure pathname starts with /
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${CANONICAL_DOMAIN}${cleanPath}`;
};

/**
 * Get Open Graph image URL (1200×630 recommended)
 *
 * @returns {string} OG image URL
 */
export const getOGImage = () => {
  return `${CANONICAL_DOMAIN}/og.png`;
};

/**
 * Get page title with site name suffix
 * 
 * @param {string} title - Page title
 * @param {boolean} includeSiteName - Whether to append " | ExtensionShield"
 * @returns {string} Formatted title
 */
export const getPageTitle = (title, includeSiteName = true) => {
  if (!includeSiteName) return title;
  // Avoid double site name
  if (title.includes('ExtensionShield')) return title;
  return `${title} | ExtensionShield`;
};

/**
 * Generate Open Graph tags object
 * 
 * @param {Object} options - SEO options
 * @param {string} options.title - Page title
 * @param {string} options.description - Meta description
 * @param {string} options.pathname - Page pathname
 * @param {string} options.type - OG type (website, article, etc.)
 * @param {string} options.image - Custom OG image URL
 * @returns {Object} OG tags object
 */
/** Recommended OG image dimensions for summary_large_image */
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const getOGTags = ({ title, description, pathname = '/', type = 'website', image }) => {
  const canonicalUrl = getCanonicalUrl(pathname);
  const ogImage = image || getOGImage();
  
  return {
    'og:title': title,
    'og:description': description,
    'og:url': canonicalUrl,
    'og:type': type,
    'og:image': ogImage,
    'og:image:width': String(OG_IMAGE_WIDTH),
    'og:image:height': String(OG_IMAGE_HEIGHT),
    'og:site_name': 'ExtensionShield',
  };
};

/**
 * Generate Twitter Card tags object
 * 
 * @param {Object} options - SEO options
 * @param {string} options.title - Page title
 * @param {string} options.description - Meta description
 * @param {string} options.image - Twitter card image URL
 * @returns {Object} Twitter Card tags object
 */
export const getTwitterTags = ({ title, description, image }) => {
  const twitterImage = image || getOGImage();
  
  return {
    'twitter:card': 'summary_large_image',
    'twitter:title': title,
    'twitter:description': description,
    'twitter:image': twitterImage,
    'twitter:site': '@ExtensionShield', // Update if you have Twitter handle
  };
};

