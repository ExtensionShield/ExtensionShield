/**
 * Navigation: top nav, mega menu, footer.
 * Logo links to "/", so a separate Home item is omitted.
 * Categories: Product, Research (includes Resources section), Enterprise.
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
    matchPaths: ["/scan", "/free-extension-scanner", "/extension-security", "/extension-risk-score", "/extension-permissions"],
    dropdownItems: [
      {
        icon: "🔎",
        label: "Free Extension Scanner",
        description: "Check any Chrome extension by URL",
        path: "/free-extension-scanner"
      },
      {
        icon: "🛡️",
        label: "Security Platform",
        description: "Open-source extension governance",
        path: "/extension-security"
      },
      {
        icon: "🔍",
        label: "Risk Check (Free)",
        description: "Chrome Web Store URL",
        path: "/scan"
      },
      {
        icon: "📦",
        label: "Private Build Audit (Pro)",
        description: "Upload CRX/ZIP for pre-release audit",
        path: "/scan/upload",
        badge: "PRO"
      },
      {
        icon: "🕐",
        label: "Scan History",
        description: "Your past scans",
        path: "/scan/history"
      }
    ]
  },
  {
    category: NAV_CATEGORIES.RESEARCH,
    label: "Research",
    path: "/research",
    matchPaths: ["/research", "/compare", "/open-source", "/community", "/about", "/careers"],
    dropdownSections: [
      {
        heading: "Research",
        items: [
          { icon: "📋", label: "Case Studies", description: "Real-world analysis", path: "/research/case-studies" },
          { icon: "⚙️", label: "How We Score", description: "How we score risk", path: "/research/methodology" },
          { icon: "benchmarks", label: "Benchmarks", description: "Industry trends & scoring", path: "/research/benchmarks" },
          { icon: "compare", label: "Compare Tools", description: "Security tool comparison", path: "/compare" }
        ]
      },
      {
        heading: "Resources",
        items: [
          { icon: "🌱", label: "Open Source", description: "Contribute & explore", path: "/open-source" },
          { icon: "💬", label: "Community", description: "Safety notes & alternatives", path: "/community" },
          { icon: "💼", label: "Careers", description: "Join the team", path: "/careers" },
          { icon: "👤", label: "About", description: "Founder's story", path: "/about" }
        ]
      }
    ]
  },
  {
    category: NAV_CATEGORIES.ENTERPRISE,
    label: "Enterprise",
    path: "/enterprise",
    matchPaths: ["/enterprise", "/extension-governance"],
    dropdownItems: [
      {
        icon: "🏢",
        label: "Governance",
        description: "Org reports & policies",
        path: "/enterprise"
      },
      {
        icon: "📊",
        label: "Risk Assessment",
        description: "Pre-install extension review",
        path: "/browser-extension-risk-assessment"
      },
      {
        icon: "📋",
        label: "Extension Governance",
        description: "Policy evidence & approvals",
        path: "/extension-governance"
      }
    ]
  }
];

/**
 * Build sections for mobile menu: each section has a category label and links.
 * Research includes both Research and Resources links (from dropdownSections).
 */
export function getMobileNavSections() {
  const sections = [];
  topNavItems.forEach((item) => {
    let links;
    if (item.dropdownSections) {
      links = item.dropdownSections.flatMap((s) =>
        s.items.map((i) => ({ label: i.label, path: i.path, external: i.external, href: i.href }))
      );
    } else if (item.dropdownItems) {
      links = item.dropdownItems.map((d) => ({
        label: d.label,
        path: d.path,
        external: d.external,
        href: d.href,
      }));
    } else {
      links = [{ label: item.label, path: item.path }];
    }
    sections.push({ category: item.category, links });
  });
  return sections;
}

/**
 * User Menu Items (authenticated users)
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
  disclaimer: "Open-source scanner for browser extension security, privacy, and governance. Turn extension evidence into allow, block, monitor, or fix decisions.",
  tagline: "Pre-install extension security you can trust.",
  nonAffiliation:
    "ExtensionShield is an independent tool and is not affiliated with Google, the Chrome Web Store, or any browser manufacturer.",
  repoUrl: "https://github.com/Stanzin7/ExtensionShield",
  repo: "Stanzin7/ExtensionShield",
  discordUrl: "https://discord.gg/mgR4skWB",
  linkGroups: [
    {
      heading: "Product",
      links: [
        { label: "Free Extension Scanner", path: "/free-extension-scanner" },
        { label: "Risk Check (Free)", path: "/scan" },
        { label: "Risk Score", path: "/extension-risk-score" },
        { label: "Is extension safe?", path: "/is-this-chrome-extension-safe" },
        { label: "Permissions", path: "/extension-permissions" }
      ]
    },
    {
      heading: "Research",
      links: [
        { label: "How We Score", path: "/research/methodology" },
        { label: "Case Studies", path: "/research/case-studies" },
        { label: "Compare Scanners", path: "/compare" },
        { label: "Spin.ai Comparison", path: "/compare/spin-ai" }
      ]
    },
    {
      heading: "Company",
      links: [
        { label: "About", path: "/about" },
        { label: "Enterprise", path: "/enterprise" },
        { label: "Extension Governance", path: "/extension-governance" },
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
