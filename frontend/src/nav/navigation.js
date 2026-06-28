/**
 * Navigation: top nav, mobile menu, footer.
 * Logo links to "/", so a separate Home item is omitted.
 *
 * Public desktop header IA: Scan ▾ · Research ▾ · Open Source · About.
 * - Scan dropdown contains only acting product surfaces (the live scanner and
 *   the auth-gated private build audit). Scan History is intentionally not
 *   here — it is reachable only from the authenticated UserMenu.
 * - Research dropdown is one flat list (no Resources sub-section).
 * - Open Source and About are direct top-level links.
 *
 * Enterprise top-nav entry is hidden. /enterprise route is still served by a
 * minimal placeholder so existing inbound links and SEO are preserved.
 * ENTERPRISE is kept in the categories enum so referenced data tables (blog
 * posts, etc.) keep typing.
 */
export const NAV_CATEGORIES = {
  PRODUCT: "Product",
  RESEARCH: "Research",
  ENTERPRISE: "Enterprise",
  RESOURCES: "Resources",
};

export const topNavItems = [
  {
    category: NAV_CATEGORIES.PRODUCT,
    label: "Scan",
    path: "/scan",
    matchPaths: ["/scan", "/scan/upload"],
    dropdownItems: [
      {
        icon: "🔍",
        label: "Scan an extension",
        description: "Check any Chrome extension by URL",
        path: "/scan"
      },
      {
        icon: "📦",
        label: "Private Build Audit",
        description: "Upload CRX/ZIP for pre-release audit",
        path: "/scan/upload",
        badge: "PRO",
        requiresAuth: true
      }
    ]
  },
  {
    category: NAV_CATEGORIES.RESEARCH,
    label: "Research",
    path: "/research",
    matchPaths: ["/research", "/compare", "/blog"],
    dropdownItems: [
      { icon: "📋", label: "Case Studies", description: "Real-world analysis", path: "/research/case-studies" },
      { icon: "⚙️", label: "How We Score", description: "How we score risk", path: "/research/methodology" },
      { icon: "benchmarks", label: "Benchmarks", description: "Industry trends & scoring", path: "/research/benchmarks" },
      { icon: "compare", label: "Compare Tools", description: "Security tool comparison", path: "/compare" },
      { icon: "📰", label: "Blog", description: "Articles and updates", path: "/blog" }
    ]
  },
  {
    category: NAV_CATEGORIES.RESOURCES,
    label: "Open Source",
    path: "/open-source",
    matchPaths: ["/open-source"]
  },
  {
    category: NAV_CATEGORIES.RESOURCES,
    label: "About",
    path: "/about",
    matchPaths: ["/about"]
  }
];

/**
 * Build sections for the mobile menu.
 *
 * Each item with a dropdown becomes a labeled section listing its dropdown
 * links. Each direct-link top-nav item (no dropdownItems/dropdownSections)
 * becomes a single-link section flagged `directLink: true` so the mobile
 * renderer can skip the redundant category heading.
 */
export function getMobileNavSections() {
  const sections = [];
  topNavItems.forEach((item) => {
    if (item.dropdownSections) {
      const links = item.dropdownSections.flatMap((s) =>
        s.items.map((i) => ({
          label: i.label,
          path: i.path,
          external: i.external,
          href: i.href,
          requiresAuth: i.requiresAuth,
          badge: i.badge,
        }))
      );
      sections.push({ category: item.category, label: item.label, links });
    } else if (item.dropdownItems) {
      const links = item.dropdownItems.map((d) => ({
        label: d.label,
        path: d.path,
        external: d.external,
        href: d.href,
        requiresAuth: d.requiresAuth,
        badge: d.badge,
      }));
      sections.push({ category: item.category, label: item.label, links });
    } else {
      sections.push({
        category: item.category,
        label: item.label,
        directLink: true,
        links: [{ label: item.label, path: item.path }],
      });
    }
  });
  return sections;
}

/**
 * User Menu Items (authenticated users only).
 *
 * Scan History lives here intentionally — it is not in the public header.
 */
export const userMenuItems = [
  {
    icon: "scan",
    label: "Risk Check",
    path: "/scan"
  },
  {
    icon: "history",
    label: "Scan History",
    path: "/scan/history"
  },
  {
    icon: "settings",
    label: "Settings",
    path: "/settings"
  }
];

/**
 * Footer Configuration
 * Two-region layout: left = brand + disclaimer + social, right = 3 link groups.
 */
export const footerConfig = {
  disclaimer:
    "Open-source scanner for browser extension security, privacy, and governance. Pre-install reports with evidence-linked findings so you can review extensions before install.",
  tagline: "Pre-install extension security you can trust.",
  nonAffiliation:
    "ExtensionShield is an independent tool and is not affiliated with Google, the Chrome Web Store, or any browser manufacturer.",
  repoUrl: "https://github.com/ExtensionShield/ExtensionShield",
  repo: "ExtensionShield/ExtensionShield",
  discordUrl: "https://discord.gg/mgR4skWB",
  linkGroups: [
    {
      heading: "Product",
      links: [
        { label: "Scan an extension", path: "/scan" },
        { label: "Private Build Audit", path: "/scan/upload" },
        { label: "Extension Governance", path: "/extension-governance" },
        { label: "Risk Score", path: "/extension-risk-score" },
        { label: "Permissions", path: "/extension-permissions" },
        { label: "Is this extension safe?", path: "/is-this-chrome-extension-safe" }
      ]
    },
    {
      heading: "Research",
      links: [
        { label: "Case Studies", path: "/research/case-studies" },
        { label: "How We Score", path: "/research/methodology" },
        { label: "Benchmarks", path: "/research/benchmarks" },
        { label: "Compare Tools", path: "/compare" },
        { label: "Blog", path: "/blog" },
        { label: "Spin.ai Comparison", path: "/compare/spin-ai" }
      ]
    },
    {
      heading: "Company",
      links: [
        { label: "About", path: "/about" },
        { label: "Open Source", path: "/open-source" },
        { label: "Community", path: "/community" },
        { label: "Careers", path: "/careers" },
        { label: "Privacy Policy", path: "/privacy-policy" }
      ]
    }
  ]
};

export default {
  topNavItems,
  userMenuItems,
  footerConfig,
  getMobileNavSections,
  NAV_CATEGORIES,
};
