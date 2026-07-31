/**
 * SEO-focused blog posts (long-tail and comparison keywords).
 * Each slug is used in route path /blog/:slug and in sitemap.
 */
export const blogPosts = [
  {
    slug: "top-risky-chrome-extensions-2026",
    title: "Top Risky Chrome Extensions in 2026: What to Check Before You Install",
    description: "A practical 2026 guide to risky Chrome extension patterns: broad permissions, data access, suspicious updates, and how to check risk before installing.",
    date: "2026-04",
    category: "Security",
    sections: [
      {
        heading: "The short answer",
        body: "The riskiest Chrome extensions are not always the ones with the worst reviews. Risk usually comes from broad permissions, unclear data use, suspicious network behavior, obfuscated code, or a new update that changes what the extension can access."
      },
      {
        heading: "Risk patterns to watch",
        body: "Watch for all-site host access, history or cookie access, clipboard read permissions, excessive downloads or management access, and extensions whose stated purpose does not justify their permissions. A coupon tool, PDF converter, VPN, ad blocker, or productivity extension can be useful and still require careful review."
      },
      {
        heading: "How ExtensionShield helps",
        body: "Paste the Chrome Web Store URL into ExtensionShield to see a Security, Privacy, and Governance risk score before install. Use the report to review evidence instead of guessing from ratings alone."
      }
    ]
  },
  {
    slug: "can-chrome-extensions-steal-data",
    title: "Can Chrome Extensions Steal Data? What Users and Teams Need to Know",
    description: "Can Chrome extensions steal data? Learn how extension permissions, page access, cookies, clipboard access, and network calls can expose sensitive information.",
    date: "2026-04",
    category: "Security",
    sections: [
      {
        heading: "Yes, if permissions and behavior allow it",
        body: "Chrome extensions can expose data when they have permission to read page content, access cookies or history, inspect tabs, read the clipboard, or send collected data to external servers. The risk depends on both permission scope and code behavior."
      },
      {
        heading: "Common data paths",
        body: "Sensitive data can appear in page content, form fields, SaaS dashboards, URLs, copied clipboard text, cookies, local storage, and downloaded files. Extensions close to these surfaces need a higher trust bar."
      },
      {
        heading: "How to reduce risk",
        body: "Scan before install, remove unused extensions, limit extension allowlists, and re-check extensions after major updates. ExtensionShield turns these checks into evidence-backed risk assessments."
      }
    ]
  },
  {
    slug: "how-hackers-use-browser-extensions-to-steal-data",
    title: "How Hackers Use Browser Extensions to Steal Data",
    description: "Browser extension attack paths explained: malicious permissions, injected scripts, cookies, clipboard theft, update abuse, and data exfiltration.",
    date: "2026-04",
    category: "Security",
    sections: [
      {
        heading: "Typical attack chain",
        body: "An attacker gets an extension installed, gains permission to read or modify pages, collects sensitive browser data, then sends it to an external server. The extension may begin benignly and add risky behavior later through an update."
      },
      {
        heading: "Common techniques",
        body: "Techniques include script injection, form scraping, cookie access, clipboard reading, affiliate hijacking, ad injection, remote configuration, and permission creep after users already trust the extension."
      },
      {
        heading: "Detection signals",
        body: "Look for broad host permissions, obfuscated code, suspicious domains, external command-and-control patterns, disclosure gaps, and updates that change permission scope."
      }
    ]
  },
  {
    slug: "chrome-web-store-ratings-do-not-prove-extension-safety",
    title: "Why Chrome Web Store Ratings Do Not Prove an Extension Is Safe",
    description: "Star ratings and reviews are useful, but they do not prove Chrome extension safety. Learn what ratings miss and what evidence to check instead.",
    date: "2026-04",
    category: "Security",
    sections: [
      {
        heading: "Ratings measure user sentiment, not security",
        body: "A high rating can mean users like the feature. It does not prove the extension uses minimal permissions, avoids risky data flows, or will remain safe after future updates."
      },
      {
        heading: "What ratings miss",
        body: "Ratings usually miss obfuscated code, suspicious network destinations, permission creep, ownership changes, remote configuration, and policy disclosure gaps."
      },
      {
        heading: "What to check instead",
        body: "Use ratings as one input, then review permissions, code indicators, network access, update behavior, and governance evidence before trusting an extension."
      }
    ]
  },
  {
    slug: "can-chrome-extensions-steal-cookies-sessions",
    title: "Can Chrome Extensions Steal Cookies or Sessions?",
    description: "Can browser extensions steal cookies or sessions? Learn how cookie permissions, page access, and token exposure can create session risk.",
    date: "2026-04",
    category: "Security",
    sections: [
      {
        heading: "The practical answer",
        body: "Extensions can create session risk when they can access cookies, page content, storage, requests, or tokens exposed in the browser. Not every extension can steal sessions, but the wrong permission set can expose sensitive context."
      },
      {
        heading: "Where session data appears",
        body: "Session-related data may appear in cookies, local storage, page scripts, URLs, authorization headers, or copied text. Extensions with broad visibility require careful review."
      },
      {
        heading: "How teams reduce exposure",
        body: "Use allowlists, block unnecessary extensions, scan before approval, and monitor updates that add cookie, host, or scripting access."
      }
    ]
  },
  {
    slug: "browser-extension-supply-chain-attacks",
    title: "Browser Extension Supply Chain Attacks Explained",
    description: "Browser extension supply chain attacks explained: ownership changes, malicious updates, compromised publishers, remote configuration, and extension governance controls.",
    date: "2026-04",
    category: "Enterprise",
    sections: [
      {
        heading: "What makes extensions a supply chain risk",
        body: "Extensions update automatically and run in trusted browser contexts. A safe extension can become risky if ownership changes, a publisher is compromised, or a remote configuration introduces harmful behavior."
      },
      {
        heading: "Signals to monitor",
        body: "Monitor new permissions, new domains, version changes, obfuscation changes, publisher changes, privacy policy drift, and behavior that no longer matches the listed feature."
      },
      {
        heading: "Governance response",
        body: "Treat extensions like software supply chain components. Review before allowlisting, re-scan after updates, and preserve evidence for exceptions."
      }
    ]
  },
  {
    slug: "manifest-v3-extension-security",
    title: "Manifest V3 Extension Security: What Changed and What Still Matters",
    description: "Manifest V3 changed Chrome extension architecture, but permissions, host access, data flows, updates, and governance still determine extension risk.",
    date: "2026-04",
    category: "Technical",
    sections: [
      {
        heading: "What changed",
        body: "Manifest V3 introduced architectural changes such as service workers and changes to extension APIs. These changes matter, but they do not remove the need to review permissions and behavior."
      },
      {
        heading: "What still matters",
        body: "Host permissions, sensitive APIs, external network access, disclosure quality, code behavior, and automatic updates still drive browser extension risk."
      },
      {
        heading: "How to assess MV3 extensions",
        body: "Review the manifest, permissions, content scripts, service worker behavior, remote domains, and policy fit. ExtensionShield combines those signals into a risk score."
      }
    ]
  },
  {
    slug: "chrome-extension-allowlist-policy",
    title: "How to Build a Chrome Extension Allowlist Policy",
    description: "Build a Chrome extension allowlist policy with risk scoring, permission thresholds, exception handling, monitoring, and audit evidence.",
    date: "2026-04",
    category: "Enterprise",
    sections: [
      {
        heading: "Start with decision criteria",
        body: "Define which permissions require review, which extension categories are restricted, who approves exceptions, and what evidence is required before an extension is allowed."
      },
      {
        heading: "Use risk tiers",
        body: "Create tiers for low, medium, high, and blocked extensions. Map risk score drivers to policy actions such as approve, approve with monitoring, block, or request remediation."
      },
      {
        heading: "Keep evidence",
        body: "Store the extension version, score, findings, approval owner, and rationale. ExtensionShield reports are designed to support this governance record."
      }
    ]
  },
  {
    slug: "browser-extension-compliance-checklist",
    title: "Browser Extension Compliance Checklist for Security Teams",
    description: "A browser extension compliance checklist for enterprise teams: inventory, permissions, privacy disclosures, update monitoring, allowlists, and audit evidence.",
    date: "2026-04",
    category: "Enterprise",
    sections: [
      {
        heading: "Compliance checklist",
        body: "Maintain extension inventory, require pre-install review, document permissions, review privacy disclosures, monitor updates, define allow/block policy, preserve evidence, and revisit exceptions periodically."
      },
      {
        heading: "Evidence to collect",
        body: "Collect extension ID, version, publisher, requested permissions, host access, network indicators, code findings, privacy policy status, risk score, decision owner, and approval rationale."
      },
      {
        heading: "How ExtensionShield helps",
        body: "ExtensionShield combines security, privacy, and governance findings into an evidence-backed report that supports extension compliance reviews."
      }
    ]
  },
  {
    slug: "audit-crx-zip-before-release",
    title: "How to Audit a CRX or ZIP Chrome Extension Before Release",
    description: "Audit a private CRX or ZIP Chrome extension before release: SAST, permissions, privacy, policy checks, evidence, and fix guidance.",
    date: "2026-04",
    category: "Developer",
    sections: [
      {
        heading: "Why audit before release",
        body: "Developers should catch risky permissions, insecure patterns, privacy gaps, and policy issues before submitting to the Chrome Web Store or shipping internally."
      },
      {
        heading: "What to include",
        body: "Review manifest permissions, content scripts, service worker behavior, external requests, storage access, obfuscation, vulnerable libraries, and whether privacy disclosures match actual behavior."
      },
      {
        heading: "Use ExtensionShield Pro",
        body: "Upload a private CRX/ZIP build to ExtensionShield for an evidence-linked pre-release audit with Security, Privacy, and Governance findings."
      }
    ]
  },
  {
    title: "What Permissions Are Dangerous in Chrome Extensions?",
    longTailKeyword: "dangerous chrome extension permissions",
    intent: "Explain high-risk permissions and help users understand whether requested access is justified.",
    featuredSnippetAngle: "List dangerous permissions with one-sentence risk explanations.",
    internalLinks: ["/chrome-extension-permissions", "/scan", "/extension-risk-score", "/blog"]
  },
  {
    title: "Can Chrome Extensions Steal Data?",
    longTailKeyword: "can chrome extensions steal data",
    intent: "Answer a security fear directly and show how permissions, page access, and network calls create exposure.",
    featuredSnippetAngle: "Lead with a direct yes/no answer, then list the main data paths.",
    internalLinks: ["/extension-security", "/chrome-extension-permissions", "/scan", "/blog"]
  },
  {
    title: "How Hackers Use Browser Extensions to Steal Data",
    longTailKeyword: "how hackers use browser extensions to steal data",
    intent: "Educate users and security teams on attack chains without hype.",
    featuredSnippetAngle: "Break the attack into install, permission, collection, exfiltration, and update abuse steps.",
    internalLinks: ["/extension-security", "/scan", "/extension-risk-score", "/blog"]
  },
  {
    title: "Chrome Extension Scanner vs Extension Governance Platform",
    longTailKeyword: "chrome extension scanner vs governance platform",
    intent: "Capture scanner traffic while moving readers toward the larger governance category.",
    featuredSnippetAngle: "Use a two-column scanner vs governance comparison.",
    internalLinks: ["/extension-governance", "/extension-security", "/scan", "/blog"]
  },
  {
    title: "Top Risky Chrome Extension Patterns to Watch in 2026",
    longTailKeyword: "risky chrome extensions 2026",
    intent: "Rank for annual risk queries without publishing an unsupported blacklist.",
    featuredSnippetAngle: "List risky patterns such as all-site access, data collection, obfuscation, ownership changes, and suspicious updates.",
    internalLinks: ["/scan", "/chrome-extension-permissions", "/extension-risk-score", "/blog"]
  },
  {
    title: "How to Build a Chrome Extension Allowlist Policy",
    longTailKeyword: "chrome extension allowlist policy",
    intent: "Help enterprise security teams create a repeatable governance process.",
    featuredSnippetAngle: "Give policy tiers: allow, monitor, request fix, block.",
    internalLinks: ["/extension-governance", "/extension-risk-score", "/scan", "/blog"]
  },
  {
    title: "How to Audit a CRX or ZIP Chrome Extension Before Release",
    longTailKeyword: "audit CRX ZIP chrome extension before release",
    intent: "Convert developers who need pre-release extension security checks.",
    featuredSnippetAngle: "Checklist for manifest, permissions, content scripts, service worker, network access, and privacy disclosures.",
    internalLinks: ["/scan/upload", "/extension-security", "/chrome-extension-permissions", "/blog"]
  }
];

export const getBlogPostBySlug = (slug) =>
  blogPosts.find((p) => p.slug === slug) || null;
