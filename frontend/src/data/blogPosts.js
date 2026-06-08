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
    slug: "dangerous-chrome-extension-permissions",
    title: "What Permissions Are Dangerous in Chrome Extensions?",
    description: "Dangerous Chrome extension permissions explained: all-site access, cookies, history, clipboard, scripting, webRequest, debugger, and risky combinations.",
    date: "2026-04",
    category: "Permissions",
    sections: [
      {
        heading: "Most dangerous permissions",
        body: "High-risk permissions include all-site access, cookies, history, clipboardRead, debugger, downloads, management, scripting, webRequest, and broad tab access. These permissions are not always malicious, but they create a larger blast radius."
      },
      {
        heading: "Combinations matter",
        body: "The most important question is how permissions combine. All-site access plus external network calls can enable data exfiltration. Cookie access plus host permissions can expose sensitive session context. Scripting plus broad host access can modify pages users trust."
      },
      {
        heading: "What to do before installing",
        body: "Check whether the permission matches the feature. Then scan the extension so you can see code, network, and governance signals beyond the permission prompt."
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
    slug: "how-to-check-if-chrome-extension-is-safe",
    title: "How to Check if a Chrome Extension Is Safe Before Installing",
    description: "A simple checklist to check if a Chrome extension is safe: permissions, publisher, reviews, updates, privacy policy, network behavior, and risk score.",
    date: "2026-04",
    category: "Guide",
    sections: [
      {
        heading: "Five-step safety checklist",
        body: "Check permissions, publisher identity, recent update history, privacy policy, and whether the feature actually needs the requested access. Then use an extension risk score to review evidence before installation."
      },
      {
        heading: "Red flags",
        body: "Be cautious when a simple extension asks for all-site access, history, cookies, clipboard read, or broad scripting permissions. Also watch for vague privacy policies, sudden ownership changes, or updates that add powerful permissions."
      },
      {
        heading: "Scan before you install",
        body: "ExtensionShield provides a pre-install report with Security, Privacy, and Governance evidence so you can decide whether to allow, block, monitor, or find an alternative."
      }
    ]
  },
  {
    slug: "chrome-extension-scanner-vs-governance-platform",
    title: "Chrome Extension Scanner vs Extension Governance Platform",
    description: "A scanner finds extension risk. A governance platform turns extension findings into allow, block, monitor, and audit decisions.",
    date: "2026-04",
    category: "Governance",
    sections: [
      {
        heading: "The core difference",
        body: "A Chrome extension scanner produces findings. An extension governance platform turns findings into decisions: approve, block, monitor, request a fix, or document an exception."
      },
      {
        heading: "Why governance matters",
        body: "Security teams need repeatable policy decisions, not one-off scores. Governance requires evidence, ownership, update monitoring, risk acceptance, and audit-ready records."
      },
      {
        heading: "Where ExtensionShield fits",
        body: "ExtensionShield keeps the scanner as the entry point, then adds Security, Privacy, and Governance layers so users, developers, and enterprises can act on the evidence."
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
    slug: "spin-ai-vs-extensionshield",
    title: "Spin.ai vs ExtensionShield: Honest Browser Extension Security Comparison",
    description: "Compare Spin.ai SpinMonitor and SpinCRX with ExtensionShield for extension risk assessment, governance, open-source trust, and pre-install scanning.",
    date: "2026-04",
    category: "Comparison",
    sections: [
      {
        heading: "Where Spin.ai is strong",
        body: "Spin.ai is positioned as an enterprise SaaS security platform with browser extension risk assessment inside a broader security posture workflow. That can be valuable for teams already buying centralized SaaS protection."
      },
      {
        heading: "Where ExtensionShield is different",
        body: "ExtensionShield focuses on transparent browser extension security: open-source core, pre-install scans, private CRX/ZIP audits, evidence-linked reports, and governance decisions that can be reviewed before an extension reaches users."
      },
      {
        heading: "Best-fit summary",
        body: "Choose Spin.ai for a broader SaaS security program. Choose ExtensionShield when open-source trust, extension-specific evidence, developer audits, and pre-install governance are the main requirements."
      }
    ]
  },
  {
    slug: "crxcavator-vs-extensionshield-2026",
    title: "CRXcavator vs ExtensionShield in 2026",
    description: "Compare CRXcavator and ExtensionShield for Chrome extension risk scores, transparent methodology, SAST, governance, and pre-install scanning.",
    date: "2026-04",
    category: "Comparison",
    sections: [
      {
        heading: "CRXcavator's legacy",
        body: "CRXcavator helped popularize extension risk scoring for enterprise review. It is still a common comparison point for teams evaluating Chrome extension security tooling."
      },
      {
        heading: "ExtensionShield's angle",
        body: "ExtensionShield adds open-source trust, modern UX, Security/Privacy/Governance scoring, private build audits, and evidence-first reports that are designed for pre-install and enterprise governance workflows."
      },
      {
        heading: "What to compare",
        body: "Compare methodology visibility, evidence quality, current availability, governance depth, developer workflow support, and whether the tool helps make allow/block decisions."
      }
    ]
  },
  {
    slug: "extension-auditor-vs-extensionshield",
    title: "Extension Auditor vs ExtensionShield: Which Extension Security Tool Fits?",
    description: "Compare Extension Auditor and ExtensionShield for extension security, privacy review, monitoring, governance, open-source trust, and developer audits.",
    date: "2026-04",
    category: "Comparison",
    sections: [
      {
        heading: "Where Extension Auditor is strong",
        body: "Extension Auditor emphasizes enterprise extension monitoring, inventory, and risk management. It is relevant for teams that want commercial browser extension oversight."
      },
      {
        heading: "Where ExtensionShield competes",
        body: "ExtensionShield differentiates with open-source core positioning, pre-install URL scans, private CRX/ZIP audits, transparent scoring, and evidence-linked Security, Privacy, and Governance reports."
      },
      {
        heading: "Decision point",
        body: "If you want a transparent extension-specific platform that works before install and before release, ExtensionShield is the stronger fit."
      }
    ]
  },
  {
    slug: "crxplorer-vs-extensionshield",
    title: "CRXplorer vs ExtensionShield: Free Scanner or Governance Platform?",
    description: "Compare CRXplorer and ExtensionShield for Chrome extension risk scoring, code review, methodology transparency, and governance workflows.",
    date: "2026-04",
    category: "Comparison",
    sections: [
      {
        heading: "Scanner value",
        body: "CRXplorer is useful for quick extension risk review. It competes on speed and accessibility for users who want a fast check."
      },
      {
        heading: "Governance value",
        body: "ExtensionShield is designed to go further: transparent risk layers, open-source trust, private build audits, policy evidence, and enterprise allow/block context."
      },
      {
        heading: "Best-fit summary",
        body: "Use a scanner for one-off checks. Use ExtensionShield when the decision must be explainable, repeatable, and tied to governance evidence."
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
    slug: "read-and-change-all-your-data-extension-permission",
    title: "Read and Change All Your Data: Chrome Extension Permission Explained",
    description: "What the 'read and change all your data' Chrome extension permission means, why it can be risky, and when it may be justified.",
    date: "2026-04",
    category: "Permissions",
    sections: [
      {
        heading: "What it means",
        body: "This permission usually means the extension can read and modify content on the websites covered by its host permissions. If the host scope is all sites, the extension can interact with a very broad set of pages."
      },
      {
        heading: "When it is justified",
        body: "Ad blockers, password managers, accessibility tools, translators, and developer tools may need broad page access. The key is whether the access is necessary and whether behavior matches the stated purpose."
      },
      {
        heading: "How to evaluate it",
        body: "Check host scope, network destinations, code behavior, privacy policy, and update history. ExtensionShield shows these signals in one risk report."
      }
    ]
  },
  {
    slug: "all-urls-chrome-extension-permission",
    title: "What Is all_urls in Chrome Extensions?",
    description: "Learn what the all_urls Chrome extension permission means, why all-site access is risky, and how to decide if it is justified.",
    date: "2026-04",
    category: "Permissions",
    sections: [
      {
        heading: "Definition",
        body: "The all_urls host pattern gives an extension access across a very broad set of websites. It can be necessary for some products, but it should never be ignored."
      },
      {
        heading: "Why it matters",
        body: "All-site access increases blast radius. If code is malicious, compromised, or poorly designed, more websites and more data can be affected."
      },
      {
        heading: "Review checklist",
        body: "Confirm the feature requires all-site access, review privacy disclosures, check external network behavior, and scan the extension before installing or allowing it."
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
    slug: "best-chrome-extension-security-scanner-tools-2026",
    title: "Best Chrome Extension Security Scanner Tools in 2026",
    description: "Compare Chrome extension security scanner tools in 2026: ExtensionShield, Spin.ai, CRXcavator, Extension Auditor, and CRXplorer.",
    date: "2026-04",
    category: "Comparison",
    sections: [
      {
        heading: "What to compare",
        body: "Compare tools by methodology transparency, permission analysis, SAST depth, threat intelligence, governance workflows, monitoring, private build support, and audit evidence."
      },
      {
        heading: "Scanner vs platform",
        body: "A scanner is enough for one-off checks. A platform is better when teams need repeatable governance decisions, update monitoring, and evidence for allow/block policy."
      },
      {
        heading: "ExtensionShield's position",
        body: "ExtensionShield combines free pre-install scans, open-source trust, private build audits, and Security/Privacy/Governance reports for users, developers, and enterprises."
      }
    ]
  },
  {
    slug: "extension-security-scoring-explained",
    title: "Extension Security Scoring Explained: Security, Privacy, and Governance",
    description: "Extension security scoring explained: how Security, Privacy, and Governance signals combine into an extension risk score.",
    date: "2026-04",
    category: "Methodology",
    sections: [
      {
        heading: "A useful score needs drivers",
        body: "A risk score should not be a black box. Teams need to see which signals drove the result and whether those signals are security, privacy, or governance issues."
      },
      {
        heading: "ExtensionShield's model",
        body: "ExtensionShield scores Security at 40%, Privacy at 35%, and Governance at 25%. The report keeps each layer visible so the final number can be explained."
      },
      {
        heading: "Use the score as a decision aid",
        body: "The score helps prioritize review. The decision should come from the evidence: permissions, code indicators, network access, disclosure quality, and policy fit."
      }
    ]
  }
];

export const blogStrategyTopics = [
  {
    title: "How to Check if a Chrome Extension Is Safe Before Installing",
    longTailKeyword: "how to check if chrome extension is safe",
    intent: "Practical pre-install safety checklist for users who are one search away from installing an extension.",
    featuredSnippetAngle: "Answer with a numbered checklist: permissions, publisher, reviews, privacy policy, update history, and risk score.",
    internalLinks: ["/scan", "/extension-security", "/extension-risk-score", "/blog"]
  },
  {
    title: "What Permissions Are Dangerous in Chrome Extensions?",
    longTailKeyword: "dangerous chrome extension permissions",
    intent: "Explain high-risk permissions and help users understand whether requested access is justified.",
    featuredSnippetAngle: "List dangerous permissions with one-sentence risk explanations.",
    internalLinks: ["/extension-permissions", "/scan", "/extension-risk-score", "/blog"]
  },
  {
    title: "Can Chrome Extensions Steal Data?",
    longTailKeyword: "can chrome extensions steal data",
    intent: "Answer a security fear directly and show how permissions, page access, and network calls create exposure.",
    featuredSnippetAngle: "Lead with a direct yes/no answer, then list the main data paths.",
    internalLinks: ["/extension-security", "/extension-permissions", "/scan", "/blog"]
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
    internalLinks: ["/scan", "/extension-permissions", "/extension-risk-score", "/blog"]
  },
  {
    title: "Spin.ai vs ExtensionShield",
    longTailKeyword: "Spin.ai alternative",
    intent: "Capture high-intent comparison traffic from buyers evaluating browser extension security tools.",
    featuredSnippetAngle: "Neutral best-fit comparison table by workflow.",
    internalLinks: ["/compare/spin-ai", "/extension-governance", "/scan", "/blog"]
  },
  {
    title: "CRXcavator vs ExtensionShield",
    longTailKeyword: "CRXcavator alternative",
    intent: "Capture users looking for a current extension risk scoring and governance workflow.",
    featuredSnippetAngle: "Compare historical risk scoring criteria with current governance requirements.",
    internalLinks: ["/compare/crxcavator", "/extension-risk-score", "/scan", "/blog"]
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
    internalLinks: ["/scan/upload", "/extension-security", "/extension-permissions", "/blog"]
  }
];

export const getBlogPostBySlug = (slug) =>
  blogPosts.find((p) => p.slug === slug) || null;
