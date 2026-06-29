const requiredInternalLinks = [
  { label: "Scan an extension", to: "/scan" },
  { label: "Browser extension security", to: "/extension-security" },
  { label: "Extension risk score", to: "/extension-risk-score" },
  { label: "Browser extension security blog", to: "/blog" },
];

export const extensionSecurityContent = {
  title: "Browser Extension Security | Open-Source Extension Governance",
  description: "Browser extension security guide and platform for pre-install Chrome Web Store scans, private CRX/ZIP audits, evidence-based risk scores, and extension governance.",
  pathname: "/extension-security",
  keywords: "browser extension security, extension security audit, browser extension security platform, extension risk assessment",
  eyebrow: "Primary keyword: browser extension security",
  h1: "Browser Extension Security",
  intro: [
    "Browser extension security is the process of reviewing what a browser extension can access, how its code behaves, which domains it can contact, and whether it should be trusted before it reaches a user's browser.",
    "ExtensionShield is built for that decision point. It combines an open-source core, pre-install Chrome Web Store scans, private CRX/ZIP audits, and evidence-based scoring across Security, Privacy, and Governance.",
    "The goal is not to create another raw scanner result. The goal is to help individuals, developers, and security teams decide whether to install, approve, block, monitor, or fix an extension with evidence they can explain."
  ],
  heroCtas: [
    { label: "Scan an extension", to: "/scan" },
    { label: "Check risk score", to: "/extension-risk-score" },
    { label: "Audit your extension", to: "/scan/upload" },
  ],
  schema: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is browser extension security?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Browser extension security reviews permissions, code behavior, network access, publisher signals, privacy disclosures, and policy fit before an extension is installed or approved."
        }
      },
      {
        "@type": "Question",
        "name": "Why should teams scan extensions before install?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Extensions can read pages, inject scripts, access browser data, and change through automatic updates. Pre-install review reduces risk before sensitive data is exposed."
        }
      }
    ]
  },
  sections: [
    {
      heading: "What browser extension security means",
      paragraphs: [
        "Browser extension security starts with a simple question: what does this extension need to do, and what browser access does it request to do it? A password manager, ad blocker, translator, coupon tool, meeting assistant, or developer utility may all request powerful access for legitimate reasons. The risk comes from whether that access is excessive, hidden, poorly disclosed, or paired with behavior that does not match the listed purpose.",
        "A useful review looks at the manifest, requested permissions, host permissions, content scripts, service worker behavior, external network calls, update patterns, publisher identity, privacy policy, and any code indicators that point to obfuscation, injection, credential access, or data movement. None of these signals should be reviewed alone. The strongest answer comes from the combination.",
        "ExtensionShield treats browser extension security as a decision workflow. A public user can paste a Chrome Web Store URL before installing. A developer can upload a private CRX or ZIP before release. A security team can review the same evidence as part of an allowlist or exception review."
      ]
    },
    {
      heading: "Why browser extension security matters before install",
      paragraphs: [
        "Extensions run inside a trusted daily work surface. They can sit next to SaaS dashboards, email, customer records, internal apps, finance portals, developer tools, and personal accounts. When an extension has broad host access, it may be able to observe or modify page content across many sites.",
        "The browser also changes the timing problem. Users often install extensions for immediate utility, then forget about them. Extensions update automatically. Publishers can change ownership. Permissions can expand. A tool that looked harmless when installed may need review again when its version, behavior, or data access changes.",
        "That is why security teams should not wait for incident response. Pre-install review gives the user or approver a chance to reject excessive access, request a safer alternative, or document why a risky permission is justified."
      ],
      bullets: [
        "A simple extension can request access to every website.",
        "A useful extension can still send data to external services.",
        "A trusted publisher can ship a risky update by mistake.",
        "A popular extension can be acquired or compromised after users already trust it.",
        "A Chrome Web Store listing does not explain every runtime behavior."
      ],
      cta: { label: "Scan an extension before install", to: "/scan" }
    },
    {
      heading: "Browser extension security signals to review",
      paragraphs: [
        "A strong extension review separates capability from intent. Permissions show what the extension can do. Code and network behavior show what it appears to do. Governance evidence shows whether the extension's claims, disclosures, and update history support the trust decision.",
        "The most common mistake is treating a single score, rating, or permission prompt as the full answer. A five-star extension can still request unnecessary access. A low-install extension can be safe if its scope is narrow and its code is understandable. A broad permission can be justified if the product category truly needs it and the implementation is transparent."
      ],
      subsections: [
        {
          heading: "Security signals",
          paragraphs: [
            "Security review looks for malware indicators, suspicious API use, obfuscated code, vulnerable libraries, risky content script behavior, command-and-control patterns, and code paths that could inject or modify trusted pages."
          ]
        },
        {
          heading: "Privacy signals",
          paragraphs: [
            "Privacy review looks at sensitive permissions, broad host access, cookie or history access, clipboard usage, external network destinations, tracking patterns, and whether the extension's privacy policy matches the observed data exposure."
          ]
        },
        {
          heading: "Governance signals",
          paragraphs: [
            "Governance review looks at publisher reputation, update cadence, disclosure quality, permission justification, policy fit, and whether a security team can defend the allow or block decision later."
          ]
        }
      ]
    },
    {
      heading: "How ExtensionShield solves browser extension security",
      paragraphs: [
        "ExtensionShield gives the review process a repeatable structure. The public scan flow starts with a Chrome Web Store URL and turns the extension into a report with Security, Privacy, and Governance evidence. The private audit flow accepts CRX or ZIP builds so developers can review issues before release.",
        "The open-source core matters because security buyers and technical users do not want to rely only on vendor promises. Transparent rules and visible methodology make the trust model easier to inspect, challenge, and improve. Enterprise features can still be commercial, but the core analysis should be understandable.",
        "The scoring model is designed to make the decision explainable. Security carries the largest weight because malicious behavior and vulnerable code can create direct compromise. Privacy receives its own weight because data exposure can be serious even when there is no malware. Governance receives a dedicated layer because policy alignment, disclosure, and repeatability matter in real organizations."
      ],
      bullets: [
        "Scan public Chrome Web Store extensions before install.",
        "Audit private CRX/ZIP builds before release or internal rollout.",
        "Review Security, Privacy, and Governance separately.",
        "Use evidence-linked findings instead of opaque labels.",
        "Map findings to allow, block, monitor, or fix decisions."
      ]
    },
    {
      heading: "Real-world browser extension security use cases",
      paragraphs: [
        "For individuals, the use case is direct: check whether an extension asks for more access than its feature needs. A grammar tool, coupon tool, video helper, PDF converter, or AI assistant can be useful, but broad page access and external calls should be reviewed before installation.",
        "For developers, the use case is pre-release assurance. A team preparing a Chrome Web Store submission can audit the CRX or ZIP for risky permissions, insecure patterns, privacy disclosure gaps, and policy issues before users or reviewers encounter them.",
        "For security teams, the use case is governance. A team may need to approve extension requests, maintain an allowlist, document exceptions, re-review after permission changes, and give auditors evidence that browser-level access was evaluated."
      ],
      bullets: [
        "Individual: check if a Chrome extension is safe before installing.",
        "Developer: audit a private build before publishing.",
        "Security team: approve or block extension requests with evidence.",
        "IT admin: maintain an extension allowlist with risk tiers.",
        "Compliance owner: preserve findings and decision rationale."
      ],
      cta: { label: "Audit your extension", to: "/scan/upload" }
    },
    {
      heading: "Example: how a useful extension becomes risky",
      paragraphs: [
        "Consider a shopping helper that needs to read product pages to find coupons. Some page access may be necessary. The security question is whether it needs access to every website, whether it sends shopping behavior to third-party domains, whether it modifies affiliate links, and whether the privacy policy explains the data flow clearly.",
        "Now consider the same extension after an update. It adds a new host permission, starts contacting a new domain, or changes ownership. The original install decision may no longer be valid. A browser extension security program should re-check the extension when these signals change.",
        "ExtensionShield is designed to surface that kind of evidence. Instead of saying only safe or unsafe, it shows which permissions, network indicators, and governance issues drove the result. That gives a reviewer a path to approve with monitoring, block the extension, or request a narrower permission model."
      ]
    },
    {
      heading: "Scanner output vs security governance",
      paragraphs: [
        "A scanner is useful when the question is narrow: what can this extension access, and are there obvious risk signals? A governance platform is needed when the next question matters: what should we do with those signals, who approved the decision, and what evidence supports it?",
        "ExtensionShield keeps the scan as the entry point but treats it as the start of the workflow. The report needs to be understandable by a user, actionable by a developer, and useful to an enterprise reviewer. That is why the product language centers on browser extension security and governance rather than only scanning.",
        "This distinction matters for rankings and for buyers. Search traffic for chrome extension security scanner is useful, but the stronger category is browser extension security. That broader category includes detection, permission review, privacy analysis, developer audit, allowlist policy, and post-approval monitoring."
      ]
    },
    {
      heading: "Browser extension security checklist",
      paragraphs: [
        "Use this checklist before installing, approving, or releasing an extension. It does not replace a full report, but it gives the review a consistent starting point.",
        "A good answer should connect the extension's stated purpose to its requested access. When there is a mismatch, the risk should be escalated. When the access is justified, the decision should still document what evidence was reviewed."
      ],
      bullets: [
        "Confirm the extension's purpose and whether the feature justifies the permissions.",
        "Review host permissions, especially access to all sites or sensitive SaaS domains.",
        "Check for cookies, history, clipboard, downloads, debugger, management, scripting, and webRequest access.",
        "Look for external network destinations and whether they match the product purpose.",
        "Check update history, publisher identity, and ownership signals.",
        "Review privacy policy clarity and whether data use is disclosed.",
        "Scan the extension and keep the evidence with the decision."
      ],
      cta: { label: "Check the extension risk score", to: "/extension-risk-score" }
    },
    {
      heading: "How to build a repeatable extension security program",
      paragraphs: [
        "A repeatable program starts by defining what must be reviewed before an extension is allowed. High-risk permissions, broad host access, unclear publisher identity, suspicious network behavior, or weak disclosures should trigger deeper review.",
        "The program should also define actions. Low-risk extensions may be allowed. Medium-risk extensions may be approved with monitoring. High-risk extensions may require a business justification, developer remediation, or a safer alternative. Critical findings should block installation until resolved.",
        "Finally, the program should keep evidence. The extension ID, version, score, findings, approver, decision date, and rationale should be preserved. That record turns browser extension security from an informal judgment into a governance process."
      ]
    }
  ],
  internalLinks: requiredInternalLinks
};

export const extensionRiskScoreContent = {
  title: "Extension Risk Score | Security, Privacy & Governance Scoring",
  description: "Extension risk score explained: how Security, Privacy, and Governance signals help users, developers, and enterprises decide whether to allow, block, monitor, or fix extensions.",
  pathname: "/extension-risk-score",
  keywords: "extension risk score, chrome extension risk score, extension security scoring, extension risk assessment",
  eyebrow: "Primary keyword: extension risk score",
  h1: "Extension Risk Score",
  intro: [
    "An extension risk score is a structured way to summarize browser extension risk using evidence from permissions, code behavior, privacy signals, publisher context, and governance fit.",
    "ExtensionShield uses the score as a decision aid, not a black box. Each report separates Security, Privacy, and Governance so reviewers can see why a Chrome extension looks low risk, needs closer review, or should be blocked.",
    "The score is useful for individuals checking an extension before install, developers auditing a private CRX/ZIP before release, and security teams building consistent allow/block workflows."
  ],
  heroCtas: [
    { label: "Check risk score", to: "/scan" },
    { label: "Read methodology", to: "/research/methodology" },
    { label: "Audit your extension", to: "/scan/upload" },
  ],
  schema: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is an extension risk score?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "An extension risk score summarizes browser extension risk using security, privacy, and governance signals such as permissions, code indicators, network access, publisher context, and policy fit."
        }
      },
      {
        "@type": "Question",
        "name": "Should a risk score be the final decision?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. A risk score should prioritize review. The final decision should come from the evidence behind the score and the organization's risk policy."
        }
      }
    ]
  },
  sections: [
    {
      heading: "What an extension risk score measures",
      paragraphs: [
        "An extension risk score measures how much trust a browser extension requires relative to what it appears to do. A low score should mean the extension requests limited access, behaves consistently with its purpose, and provides enough context for a reviewer to understand the risk. A high score should mean the extension has broad access, suspicious behavior, unclear disclosures, or governance concerns that need action.",
        "The score should never hide the evidence. A number without drivers can create false confidence. ExtensionShield exposes the layers behind the number so a reviewer can see whether the problem is malware-like behavior, privacy exposure, excessive permissions, weak disclosure, or policy mismatch.",
        "A useful extension risk score also needs to support different audiences. A consumer wants a simple answer before install. A developer wants fix guidance before release. A security team wants a repeatable basis for allow, block, monitor, and exception decisions."
      ]
    },
    {
      heading: "Why extension risk score matters",
      paragraphs: [
        "Browser extensions are small pieces of software, but their position is powerful. They can sit inside pages where users work, shop, manage finances, handle customer data, and use internal applications. The score helps prioritize which extensions need deeper review before they receive that access.",
        "Without scoring, every extension review becomes a custom investigation. That does not scale for teams that receive frequent extension requests. It also does not help individuals who need to make a fast but informed decision before installing a tool from the Chrome Web Store.",
        "A risk score gives the first triage layer. The important part is what happens next: review the evidence, compare it to the extension's stated purpose, and decide whether the access is acceptable."
      ],
      bullets: [
        "Low risk: access appears narrow and consistent with the product purpose.",
        "Medium risk: access may be justified, but the extension needs review or monitoring.",
        "High risk: broad access, sensitive permissions, or unclear behavior should trigger escalation.",
        "Critical risk: suspicious or policy-breaking evidence should block install or release until resolved."
      ],
      cta: { label: "Check a live extension risk score", to: "/scan" }
    },
    {
      heading: "How ExtensionShield structures the score",
      paragraphs: [
        "ExtensionShield separates the extension risk score into three visible layers: Security, Privacy, and Governance. This prevents one overloaded number from hiding the reason for concern.",
        "Security carries the largest weight because it covers direct compromise signals: malicious behavior, vulnerable code patterns, suspicious APIs, obfuscation, external script risk, and threat intelligence. Privacy receives its own layer because an extension can create serious data exposure even without malware. Governance covers the decision quality: disclosure, permission justification, publisher context, policy alignment, and audit evidence.",
        "The result is a score that supports technical review and business decision-making. A security engineer can inspect the finding. A developer can fix a permission or disclosure issue. A manager can understand why the extension was approved or blocked."
      ],
      bullets: [
        "Security: code, malware, SAST, vulnerable patterns, and suspicious behavior.",
        "Privacy: data access, host permissions, tracking signals, and external communication.",
        "Governance: policy fit, disclosure quality, publisher context, and decision evidence."
      ]
    },
    {
      heading: "Security drivers behind an extension risk score",
      paragraphs: [
        "Security drivers answer whether the extension could directly harm the browser environment. They include suspicious API usage, code injection paths, risky content script behavior, vulnerable libraries, obfuscation, external JavaScript, malware indicators, and threat intelligence matches.",
        "A security finding does not always mean the extension is malicious. Developer tools, ad blockers, password managers, and accessibility tools may need powerful APIs. The review should ask whether the capability is necessary, whether the implementation is understandable, and whether the extension limits access where possible.",
        "The value of the score is prioritization. A finding tied to file-level evidence is easier to review than a generic warning. Developers can use that evidence to reduce risk. Security teams can use it to justify a decision."
      ]
    },
    {
      heading: "Privacy drivers behind an extension risk score",
      paragraphs: [
        "Privacy drivers answer what data the extension can see or move. This includes all-site host access, cookies, history, clipboard, tabs, downloads, page content, local storage exposure, and communication with external domains.",
        "Privacy risk often comes from combinations. All-site access plus external network calls creates a different risk profile than all-site access alone. Cookie access plus broad host permissions can expose sensitive session context. Clipboard access may be minor for one tool and serious for another.",
        "ExtensionShield treats privacy as a separate layer because organizations increasingly need to document data exposure even when there is no malware. Individuals also need a clear explanation of what an extension can see before they install it."
      ],
      cta: { label: "Review Chrome extension permissions", to: "/chrome-extension-permissions" }
    },
    {
      heading: "Governance drivers behind an extension risk score",
      paragraphs: [
        "Governance drivers answer whether the risk can be managed. A security team may allow a medium-risk extension if the business need is clear, the publisher is reputable, the permissions are justified, and monitoring is in place. The same score may be unacceptable for a different team or data environment.",
        "Governance signals include publisher reputation, update cadence, ownership or listing changes, privacy policy quality, permission justification, policy alignment, and whether evidence is preserved. These signals are especially important for enterprise extension allowlists.",
        "This is where ExtensionShield goes beyond a simple scanner. The evidence is organized so a reviewer can make a repeatable decision and revisit that decision when the extension changes."
      ]
    },
    {
      heading: "Example: interpreting two similar scores",
      paragraphs: [
        "Two extensions can have the same score for different reasons. A developer tool may score medium because it needs broad host access to inspect pages, but it has clear disclosures and no suspicious network behavior. A coupon extension may score medium because it has broad host access, external calls, and unclear data use.",
        "The number alone cannot tell you which extension is more acceptable for your environment. The evidence layer can. The developer tool may be acceptable for engineers on managed devices. The coupon extension may be blocked in a corporate environment because the business need is weak and the data exposure is broad.",
        "This is why the best extension risk score is explainable. Reviewers need to know what drove the result, not just whether the final number is red, yellow, or green."
      ]
    },
    {
      heading: "How to use an extension risk score in policy",
      paragraphs: [
        "A practical policy maps score ranges to actions. The exact thresholds should match your risk tolerance, but the structure should be consistent. Low-risk extensions can be allowed. Medium-risk extensions may need reviewer approval. High-risk extensions should require business justification or remediation. Critical findings should block installation or release.",
        "Policy should also define exceptions. Some extensions need broad access to work. The right question is whether the access is necessary, whether the user population is appropriate, and whether remaining exposure is acceptable given the business justification.",
        "When a decision is made, preserve the extension ID, version, score, evidence, approver, and rationale. That record turns a one-time score into governance evidence."
      ],
      bullets: [
        "Allow: narrow access, clear purpose, low-risk evidence.",
        "Allow with conditions: justified access but meaningful exposure — re-scan after updates.",
        "Request fix: permissions or disclosures can be reduced before approval.",
        "Block: suspicious behavior, unjustified access, or unacceptable data exposure."
      ],
      cta: { label: "Build extension governance around scores", to: "/extension-governance" }
    },
    {
      heading: "What a risk score should not do",
      paragraphs: [
        "A score should not claim certainty where the evidence does not support it. Browser extension behavior can be dynamic. Some behavior only appears after user interaction, after login, or after a remote configuration change. A responsible score should help review, not pretend to replace judgment.",
        "A score should also avoid punishing every powerful permission equally. Some product categories need access that looks risky in isolation. The better question is whether the access is justified, disclosed, and implemented safely.",
        "ExtensionShield is designed around this principle. The score gets attention. The evidence drives the decision."
      ]
    }
  ],
  internalLinks: requiredInternalLinks
};

export const extensionPermissionsContent = {
  title: "Chrome Extension Permissions | Dangerous Permissions Explained",
  description: "Chrome extension permissions explained for users, developers, and security teams. Learn which permissions are risky, how to review them, and how ExtensionShield scores access.",
  pathname: "/chrome-extension-permissions",
  keywords: "chrome extension permissions, dangerous chrome extension permissions, extension permissions explained, browser extension permissions",
  eyebrow: "Primary keyword: chrome extension permissions",
  h1: "Chrome Extension Permissions",
  intro: [
    "Chrome extension permissions define what an extension can access in the browser, including pages, tabs, cookies, history, downloads, clipboard data, network requests, and specific Chrome APIs.",
    "ExtensionShield helps users and teams understand chrome extension permissions in context. The question is not only whether a permission is powerful, but whether the extension's purpose justifies that access.",
    "A permissions review becomes stronger when it is paired with code, network, privacy, and governance evidence. That is why ExtensionShield uses Security, Privacy, and Governance scoring instead of relying on permission prompts alone."
  ],
  heroCtas: [
    { label: "Scan extension permissions", to: "/scan" },
    { label: "Check risk score", to: "/extension-risk-score" },
    { label: "Read the blog", to: "/blog" },
  ],
  schema: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Which Chrome extension permissions are risky?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Risky permissions include broad host access, cookies, history, clipboardRead, debugger, downloads, management, scripting, webRequest, and combinations that allow reading page data and sending it externally."
        }
      },
      {
        "@type": "Question",
        "name": "Are dangerous permissions always malicious?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "No. Some extensions need powerful permissions to work. The review should check whether access is necessary, limited, disclosed, and consistent with the extension's behavior."
        }
      }
    ]
  },
  sections: [
    {
      heading: "What chrome extension permissions mean",
      paragraphs: [
        "Chrome extension permissions are declarations in an extension manifest that tell Chrome which APIs and website origins the extension wants to access. Some permissions grant access to browser capabilities. Host permissions grant access to websites or URL patterns. Optional permissions can be requested later when a feature needs them.",
        "A permission is a capability, not proof of abuse. The same permission can be reasonable in one extension and excessive in another. A password manager may need to interact with pages to fill credentials. A screenshot tool may need tab capture. A coupon tool requesting all-site access deserves a more skeptical review.",
        "The security problem appears when users see a short warning but do not see the full risk model. A prompt may say an extension can read and change data, but it does not explain code behavior, network destinations, update history, publisher context, or whether the access is justified."
      ]
    },
    {
      heading: "Why chrome extension permissions matter",
      paragraphs: [
        "Permissions define the blast radius. If an extension is compromised, malicious, or poorly designed, its granted access determines what data and browser surfaces may be exposed. Broad permissions increase the amount of damage that a bad update or compromised publisher can cause.",
        "Permissions also create privacy and compliance questions. An extension that can read page content in a CRM, email client, or finance portal may touch sensitive information even if it was installed for a narrow productivity feature.",
        "For developers, permissions affect adoption. Users and reviewers are more likely to trust an extension when permissions are narrow, optional where possible, and explained clearly in the product and privacy documentation."
      ],
      bullets: [
        "Permissions define what the extension can access.",
        "Host permissions define where that access applies.",
        "Optional permissions can reduce default exposure.",
        "Permission combinations often matter more than one permission alone.",
        "A review should connect each permission to a clear product need."
      ],
      cta: { label: "Scan chrome extension permissions", to: "/scan" }
    },
    {
      heading: "High-risk chrome extension permissions",
      paragraphs: [
        "Some permissions deserve immediate review because they can expose sensitive browser data or enable powerful behavior. They are not automatically malicious, but they should require justification.",
        "The highest-risk cases usually involve broad host access, access to sensitive browser stores, or APIs that can observe, modify, or automate user activity. These permissions should be reviewed with the extension's category, stated purpose, code behavior, and network activity."
      ],
      bullets: [
        "Broad host access such as access to all sites.",
        "cookies, because session data and authentication context may be exposed.",
        "history, because browsing behavior can reveal sensitive interests and internal systems.",
        "clipboardRead, because copied secrets, tokens, or personal data may be captured.",
        "debugger, because it can provide deep inspection and control of pages.",
        "downloads, because it can observe or influence downloaded files.",
        "management, because it can inspect or manage other extensions.",
        "scripting, because injected scripts can change trusted pages.",
        "webRequest, because network requests can reveal or affect data flows."
      ]
    },
    {
      heading: "Permission combinations that increase risk",
      paragraphs: [
        "The most important permission risk often comes from combinations. A single permission may be explainable. A combination can create a data path from page access to external transmission.",
        "For example, all-site host access plus external network calls can create data exfiltration risk. Cookie access plus broad host permissions can expose session context. Scripting plus all-site access can let an extension modify many trusted pages. History access plus tracking domains can create behavioral profiling risk.",
        "ExtensionShield scores these combinations because users should not have to reason through the manifest alone. The report connects requested access to privacy and governance signals so the reviewer can see why the risk increased."
      ],
      cta: { label: "See how scoring handles permissions", to: "/extension-risk-score" }
    },
    {
      heading: "Examples by extension category",
      paragraphs: [
        "Different extension categories need different levels of access. The review should compare the permission to the job the extension claims to do.",
        "An ad blocker may need to block content across sites, but it should have clear disclosure and a trustworthy update model. A password manager may need page access to fill credentials, but it should minimize unnecessary network behavior. A translator may need page content, but it should explain where text is processed. A PDF converter should not need broad access to unrelated websites if it only works on uploaded files.",
        "For enterprise review, the category alone is not enough. A team should evaluate the exact extension ID, version, publisher, permissions, host scope, and report evidence before adding it to an allowlist."
      ],
      bullets: [
        "Password manager: powerful access may be justified, but trust requirements are high.",
        "Ad blocker: broad page access may be expected, but update and publisher trust matter.",
        "Coupon tool: shopping access may be expected, but all-site access and affiliate behavior need review.",
        "PDF converter: broad browsing access is often harder to justify.",
        "Developer tool: access may be justified for engineers, but not for every employee."
      ]
    },
    {
      heading: "How users should review permissions before install",
      paragraphs: [
        "Users should start with the plain-language purpose of the extension. What does it do? Which sites does it need? Does the permission prompt match that job? If the extension asks for access that seems unrelated, pause before installing.",
        "Next, look beyond star ratings. Ratings show sentiment, not code behavior. A popular extension can still have excessive access. A new extension can be reasonable if its permissions are narrow and its disclosures are clear.",
        "Finally, run a scan. ExtensionShield gives users a report with permissions, network access, known threats, and governance context. That lets the decision rely on evidence instead of guessing from a Chrome Web Store listing."
      ],
      cta: { label: "Scan an extension before installing", to: "/scan" }
    },
    {
      heading: "How developers should request fewer permissions",
      paragraphs: [
        "Developers should treat permissions as part of product design. Each permission should map to a feature. If a feature is optional, the permission should be optional where possible. If access can be limited to specific hosts, avoid broad all-site access.",
        "Clear permission design improves trust. Reviewers are more likely to approve an extension when the manifest is narrow, the privacy policy explains data use, and the UI explains why a permission is needed at the moment it is requested.",
        "Private CRX/ZIP audits help developers catch issues before release. ExtensionShield can flag excessive permissions, risky combinations, privacy gaps, and policy issues before the extension reaches users or the Chrome Web Store review process."
      ],
      bullets: [
        "Use the narrowest host permissions that support the feature.",
        "Move non-core access to optional permissions when practical.",
        "Explain sensitive access in user-facing copy and privacy documentation.",
        "Remove unused permissions before release.",
        "Audit every build that changes permissions or data flows."
      ]
    },
    {
      heading: "How security teams govern extension permissions",
      paragraphs: [
        "Security teams should define permission thresholds. Some permissions can be allowed with basic review. Others should require security approval, business justification, or monitoring. Critical combinations should trigger a block until reviewed.",
        "A practical policy might require review for all-site access, cookies, history, debugger, clipboard read, management, or broad scripting. It might also restrict extension categories that commonly request excessive access without a strong business need.",
        "The policy should preserve evidence. The extension ID, version, permission list, score, findings, approver, and decision rationale should be stored. This makes the allowlist defensible and repeatable."
      ],
      cta: { label: "Build extension governance", to: "/extension-governance" }
    },
    {
      heading: "Chrome extension permissions checklist",
      paragraphs: [
        "Use this checklist when reviewing a new extension request or preparing a private extension for release. The checklist should be applied before installation and again after major permission changes.",
        "A good review does not ask whether a permission is scary in isolation. It asks whether the access is necessary, limited, disclosed, and supported by evidence."
      ],
      bullets: [
        "What feature requires this permission?",
        "Can the host scope be narrowed?",
        "Can the permission be optional instead of required at install?",
        "Does the privacy policy explain the data access?",
        "Does the extension contact external domains?",
        "Has the publisher or ownership changed?",
        "Does the report show code or network behavior that conflicts with the stated purpose?",
        "Should the extension be allowed, blocked, monitored, or fixed?"
      ]
    }
  ],
  internalLinks: requiredInternalLinks
};

export const extensionGovernanceContent = {
  title: "Extension Governance | Browser Extension Compliance Platform",
  description: "Extension governance guide for browser extension compliance, pre-install review, allow/block decisions, governance evidence, audit records, and enterprise review workflows.",
  pathname: "/extension-governance",
  keywords: "extension governance, extension governance platform, browser extension compliance, browser extension governance",
  eyebrow: "Primary keyword: extension governance",
  h1: "Extension Governance",
  intro: [
    "Extension governance is the process of deciding which browser extensions users can install, which extensions developers can ship, and which extension risks an organization is willing to accept.",
    "ExtensionShield turns extension governance into an evidence-based workflow. Teams can scan Chrome Web Store listings, audit private CRX/ZIP builds, review Security, Privacy, and Governance scores, and document allow, block, monitor, or fix decisions.",
    "The result is a practical trust layer for browser extensions. It gives individuals clarity, developers feedback, and enterprises a repeatable way to control browser-level software risk."
  ],
  heroCtas: [
    { label: "Request governance pilot", to: "/enterprise" },
    { label: "Scan an extension", to: "/scan" },
    { label: "Audit your extension", to: "/scan/upload" },
  ],
  schema: {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is extension governance?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Extension governance is the policy and evidence workflow used to approve, block, monitor, or remediate browser extensions before and after they are installed."
        }
      },
      {
        "@type": "Question",
        "name": "Why do enterprises need extension governance?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Enterprises need extension governance because browser extensions can access sensitive web data, update automatically, and create privacy, security, and compliance exposure outside normal software review."
        }
      }
    ]
  },
  sections: [
    {
      heading: "What extension governance means",
      paragraphs: [
        "Extension governance is more than knowing which extensions exist. Inventory is useful, but governance asks a harder question: should this extension be allowed for this user group, on this device, with this level of data exposure?",
        "A mature governance process includes request intake, pre-install review, risk scoring, permission analysis, privacy review, policy mapping, approval workflow, re-review triggers, exception handling, and evidence retention.",
        "For developers, governance also applies before release. A private extension should be reviewed for permissions, code risks, privacy disclosures, and Chrome Web Store policy alignment before it is submitted or rolled out internally."
      ]
    },
    {
      heading: "Why extension governance matters",
      paragraphs: [
        "Browser extensions often enter organizations through individual user choice. That makes them a form of shadow software. They may not go through procurement, vendor review, secure development review, or endpoint software approval, even though they can access sensitive SaaS data.",
        "The risk is not limited to malware. A legitimate extension can create compliance exposure if it collects page content, sends data to external services, or requests permissions that are excessive for the business purpose. Automatic updates and ownership changes add more uncertainty.",
        "Extension governance creates a review gate before that access is granted. It also gives teams a way to revisit approved extensions when versions, permissions, publishers, or behaviors change."
      ],
      bullets: [
        "Reduce unsanctioned browser-level software risk.",
        "Review extensions before users install them.",
        "Document why an extension was allowed or blocked.",
        "Re-scan after changes that can invalidate a previous decision.",
        "Support audit and compliance review with preserved evidence."
      ],
      cta: { label: "Scan an extension for governance review", to: "/scan" }
    },
    {
      heading: "The extension governance lifecycle",
      paragraphs: [
        "A practical lifecycle starts before installation. A user requests an extension or a team identifies a need. The extension is scanned. Security, Privacy, and Governance evidence is reviewed. The reviewer decides to allow, block, monitor, or request a fix.",
        "After approval, the extension should not drop from review. Re-scan after new versions, permission changes, ownership changes, or listing changes that affect the original risk decision.",
        "When risk changes, the decision should be revisited. Some changes may require no action. Others may require a narrower allowlist, user notification, business justification, or removal."
      ],
      bullets: [
        "Request: a user or team asks for an extension.",
        "Assess: ExtensionShield scans code, permissions, privacy, and governance evidence.",
        "Decide: approve, block, monitor, or request remediation.",
        "Document: keep score drivers, version, approver, and rationale.",
        "Re-review: re-scan and compare findings after material changes."
      ]
    },
    {
      heading: "How ExtensionShield supports extension governance",
      paragraphs: [
        "ExtensionShield supports governance by turning extension analysis into decision evidence. A scan is useful, but the report has to answer what a reviewer should do next.",
        "Security evidence covers malicious behavior, vulnerable patterns, SAST findings, suspicious APIs, obfuscation, and threat intelligence. Privacy evidence covers host access, sensitive permissions, data exposure, network destinations, and disclosure gaps. Governance evidence covers publisher context, policy fit, permission justification, and the record needed for future review.",
        "The open-source core improves trust in the process. Reviewers can understand the methodology instead of relying only on opaque vendor claims. Enterprise workflows can then build on that foundation with policy reviews and audit reporting."
      ],
      cta: { label: "Read how risk scoring works", to: "/extension-risk-score" }
    },
    {
      heading: "Extension governance for individuals",
      paragraphs: [
        "Individuals need governance too, even if they do not use that word. The personal version is deciding whether an extension deserves access to browsing activity, page content, or account data before installing it.",
        "A user should check whether the extension's permissions match the feature, whether the publisher is trustworthy, whether reviews mention suspicious behavior, and whether the extension contacts unexpected domains. A scan gives the user a clearer view before the browser grants access.",
        "This is where pre-install scanning matters. The safest decision happens before data is exposed."
      ]
    },
    {
      heading: "Extension governance for developers",
      paragraphs: [
        "Developers should use governance as a quality gate before release. A private CRX or ZIP audit can reveal permissions that are no longer used, broad access that could be narrowed, privacy disclosures that need clarification, or code patterns that should be fixed.",
        "This helps teams ship extensions that are easier to approve. Security reviewers respond better to narrow permissions, clear data flow explanations, and evidence that the developer tested the build before release.",
        "ExtensionShield's private audit workflow is designed for this. It gives file-level and evidence-linked findings so developers can fix issues before users, customers, or enterprise reviewers see them."
      ],
      cta: { label: "Audit your extension before release", to: "/scan/upload" }
    },
    {
      heading: "Extension governance for enterprises",
      paragraphs: [
        "Enterprise extension governance should integrate with existing security operations. Browser extensions should be treated like software supply chain components because they update automatically, run inside a sensitive work surface, and can influence data in SaaS tools.",
        "The program should define risk thresholds, restricted permissions, required evidence, reviewer roles, exception duration, and re-review triggers. The same framework should apply to Chrome Web Store extensions, internally developed extensions, and extensions used by contractors or high-risk teams.",
        "The strongest programs combine user education with technical control. Users should know why extension requests are reviewed. Security teams should have evidence to make decisions quickly. IT teams should be able to enforce the result through browser management controls."
      ],
      bullets: [
        "Define restricted permission categories.",
        "Require pre-install review for broad host access.",
        "Document decision owner and business justification.",
        "Re-scan approved extensions after material changes.",
        "Review exceptions on a fixed schedule."
      ]
    },
    {
      heading: "Example governance policy",
      paragraphs: [
        "A simple extension governance policy can start with three tiers. Low-risk extensions can be allowed when access is narrow and evidence is clean. Medium-risk extensions require reviewer approval and periodic re-review. High-risk extensions require business justification, compensating controls, or remediation before approval.",
        "Critical findings should block installation or release. Examples include malware indicators, suspicious exfiltration behavior, unjustified cookie access, obfuscated code paired with broad host access, or privacy disclosures that do not match observed behavior.",
        "The policy should also define what happens after approval. If an extension adds sensitive permissions, changes publisher, contacts new domains, or receives new threat indicators, the prior decision should be re-opened."
      ],
      cta: { label: "Review extension permissions", to: "/chrome-extension-permissions" }
    },
    {
      heading: "Evidence required for browser extension compliance",
      paragraphs: [
        "Browser extension compliance is not just a list of installed extensions. It is the ability to prove that risky browser-level access was reviewed, approved, and re-evaluated according to policy.",
        "Useful evidence includes the extension ID, version, publisher, requested permissions, host access, score, report date, findings, privacy policy status, external domains, approver, rationale, and required follow-up. For private builds, include the submitted artifact version and remediation notes.",
        "This evidence helps with internal security review, customer security questionnaires, SOC 2-style control discussions, GDPR data exposure review, and general vendor risk conversations. The exact compliance obligation depends on the organization, but the evidence discipline is broadly useful."
      ]
    },
    {
      heading: "Extension governance checklist",
      paragraphs: [
        "Use this checklist when creating or improving a browser extension governance program. It is intentionally practical: the goal is to make better decisions faster, not to create paperwork that reviewers ignore.",
        "Start with the highest-risk extensions and permission types. Then build repeatability around the decisions your team already makes."
      ],
      bullets: [
        "Create an intake path for extension requests.",
        "Require scans before install or approval.",
        "Define restricted permissions and host scopes.",
        "Map score tiers to allow, block, monitor, and fix actions.",
        "Preserve report evidence with each decision.",
        "Set re-review triggers for updates, ownership changes, and new permissions.",
        "Publish user guidance so employees understand the review process.",
        "Use private audits for internally developed extensions."
      ]
    }
  ],
  internalLinks: requiredInternalLinks
};

export const freeExtensionScannerContent = {
  title: "Free Chrome Extension Scanner — Check Any Extension | ExtensionShield",
  description:
    "Free Chrome extension scanner. Paste a Web Store URL to check permissions, privacy risks, malware signals, and a 0–100 risk score before you install. No signup. Open-source.",
  pathname: "/free-extension-scanner",
  keywords:
    "free extension scanner, free chrome extension scanner, extension scanner, chrome extension scanner, scan chrome extension",
  eyebrow: "Primary keyword: free extension scanner",
  h1: "Free Chrome Extension Scanner",
  intro: [
    "A free extension scanner lets you check what a browser extension can access — and whether it shows risky behavior — before you install it. Paste a Chrome Web Store URL and ExtensionShield returns a risk report in under a minute. No account, no download.",
    "Most users judge an extension by its star rating. Ratings measure sentiment, not code. This scanner looks at the things ratings miss: requested permissions, host access, external network calls, obfuscation, known-threat signals, and how well the extension's access matches its stated purpose.",
    "The scan is free for any public Chrome Web Store extension. Developers can also upload a private CRX or ZIP build for a deeper pre-release audit.",
  ],
  heroCtas: [
    { label: "Scan an extension free", to: "/scan" },
    { label: "Is this extension safe?", to: "/is-this-chrome-extension-safe" },
    { label: "Audit your own build", to: "/scan/upload" },
  ],
  schema: [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "ExtensionShield Free Chrome Extension Scanner",
      applicationCategory: "SecurityApplication",
      operatingSystem: "Web",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      description:
        "Free scanner for Chrome Web Store extensions: permissions, privacy risks, malware signals, and a 0–100 risk score before you install.",
      url: "https://extensionshield.com/free-extension-scanner",
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is the extension scanner really free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Scanning a public Chrome Web Store extension by URL is free and needs no account. Private CRX/ZIP build audits are a Pro feature for developers and teams.",
          },
        },
        {
          "@type": "Question",
          name: "What does a free extension scan check?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "It reviews requested permissions and host access, external network destinations, code indicators such as obfuscation, known-threat signals, and whether the extension's access matches its stated purpose, then summarizes them as a risk score.",
          },
        },
        {
          "@type": "Question",
          name: "Can a free scanner guarantee an extension is safe?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No tool can prove an extension is completely safe. Extension behavior can change with updates and can depend on server-side configuration. A scanner reduces risk by surfacing evidence so you can make an informed decision.",
          },
        },
        {
          "@type": "Question",
          name: "Do I need to install anything to scan an extension?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Paste the Chrome Web Store URL and you get a report in the browser. An optional ExtensionShield extension is available for one-click checks of what you already have installed.",
          },
        },
      ],
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://extensionshield.com/" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Free Chrome Extension Scanner",
          item: "https://extensionshield.com/free-extension-scanner",
        },
      ],
    },
  ],
  sections: [
    {
      heading: "What a free extension scanner does",
      paragraphs: [
        "An extension scanner inspects the parts of an extension a Chrome Web Store listing does not explain. The listing shows a name, screenshots, a rating, and a short permission warning. It does not show which external servers the extension contacts, whether its code is obfuscated, how its permissions combine, or whether its access is larger than its feature needs.",
        "ExtensionShield turns that hidden surface into a readable report. It separates Security (code and malware signals), Privacy (data and host access), and Governance (publisher, disclosure, and policy fit) so you can see why an extension looks low risk, needs review, or should be avoided.",
        "The goal is not a single safe-or-unsafe verdict. It is evidence you can act on: install, skip, or look for a narrower alternative.",
      ],
      cta: { label: "Run a free scan", to: "/scan" },
    },
    {
      heading: "Why ratings and install counts are not enough",
      paragraphs: [
        "A five-star extension can still request access to every site you visit. A popular extension can be acquired by a new owner, or compromised through a phished developer account, and then ship a malicious update to users who already trust it. This is not hypothetical: in December 2024, attackers phished extension developers and pushed malicious updates to dozens of legitimate Chrome extensions, affecting millions of users.",
        "Star ratings measure whether people like the feature. They do not measure what the code does with its access. That gap is exactly what a scanner fills.",
      ],
      bullets: [
        "Ratings reflect sentiment, not code behavior.",
        "Install count reflects popularity, not safety.",
        "Permissions can expand in an automatic update.",
        "Ownership of a trusted extension can change quietly.",
        "A short permission prompt hides the full risk model.",
      ],
    },
    {
      heading: "How to scan an extension (free, no signup)",
      paragraphs: [
        "Open the Chrome Web Store page for the extension and copy its URL. Paste it into the scanner. ExtensionShield resolves the extension, analyzes its manifest, permissions, code indicators, and network signals, and returns a risk report with linked evidence.",
        "If you are a developer, you can instead upload a private CRX or ZIP build to audit it before release, so risky permissions or disclosure gaps are caught before users or Chrome Web Store reviewers see them.",
      ],
      bullets: [
        "Copy the Chrome Web Store URL of the extension.",
        "Paste it into the scanner and run the scan.",
        "Review the Security, Privacy, and Governance findings.",
        "Decide: install, skip, or find a narrower alternative.",
      ],
      cta: { label: "Scan a Chrome extension now", to: "/scan" },
    },
    {
      heading: "What the free scanner cannot promise",
      paragraphs: [
        "Honesty is part of the trust model. No scanner can guarantee an extension is malware-free or that it will stay safe. Some extension behavior only appears after login, after a user action, or after a remote configuration change that the static listing never reveals.",
        "ExtensionShield is designed to reduce risk and make the evidence explainable, not to claim certainty it cannot support. When the evidence is incomplete, the report says so. That is more useful than a false guarantee.",
      ],
    },
    {
      heading: "Free scan vs. private build audit",
      paragraphs: [
        "The free scan answers a consumer question: should I install this? The private audit answers a developer question: is my build safe and policy-aligned before I ship it? Both use the same Security, Privacy, and Governance model, but the private audit adds file-level findings and fix guidance for CRX or ZIP builds you upload.",
        "Security teams use both: the free scan to triage extension requests quickly, and the deeper report to document an allow, block, monitor, or fix decision with evidence.",
      ],
      cta: { label: "See how the risk score works", to: "/extension-risk-score" },
    },
  ],
  internalLinks: [
    { label: "Scan an extension", to: "/scan" },
    { label: "Is this Chrome extension safe?", to: "/is-this-chrome-extension-safe" },
    { label: "Chrome extension permissions", to: "/chrome-extension-permissions" },
    { label: "Extension risk score explained", to: "/extension-risk-score" },
    { label: "Chrome extension security scanner", to: "/chrome-extension-security-scanner" },
    { label: "Browser extension security blog", to: "/blog" },
  ],
};
