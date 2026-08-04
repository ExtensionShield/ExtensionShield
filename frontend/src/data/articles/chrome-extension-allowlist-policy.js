/**
 * How to Build a Chrome Extension Allowlist Policy
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "chrome-extension-allowlist-policy",
  "collection": "guide",
  "title": "How to Build a Chrome Extension Allowlist Policy",
  "description": "A copy-pasteable Chrome extension allowlist policy: risk tiers, permission thresholds, exception expiry, evidence records, and verified enterprise policy JSON.",
  "category": "Enterprise",
  "datePublished": "2026-04-01",
  "dateModified": "2026-07-28",
  "readingTime": 8,
  "author": {
    "name": "Stanzin Norzang",
    "jobTitle": "Founder & Engineer",
    "url": "https://extensionshield.com/about",
    "sameAs": [
      "https://github.com/Stanzin7",
      "https://www.linkedin.com/in/stanzin-norzang7/"
    ]
  },
  "keyFindings": [
    "Includes a copy-pasteable allowlist policy template: risk tiers, approvers, exception expiry, and the evidence record.",
    "Chrome enterprise policy (ExtensionInstallAllowlist / ExtensionSettings) enforces the decision; it does not make it.",
    "Every approval needs a stored version number — an allowlist entry without one silently approves all future updates.",
    "Re-review must be triggered by update, publisher change, and permission change, not by calendar date alone."
  ],
  "sections": [
    {
      "heading": "Why the policy has to be written down",
      "id": "why-a-written-policy",
      "blocks": [
        {
          "type": "p",
          "text": "Most organizations approve browser extensions the same way: someone asks in a chat channel, someone else looks at the Chrome Web Store listing, sees four and a half stars and a few hundred thousand users, and says yes. That process produces no record, no criteria, and no trigger for re-examination when the extension changes hands six months later."
        },
        {
          "type": "p",
          "text": "It also relies on a signal that does not carry the information people assume it does. Across 57 completed scans in ExtensionShield's public corpus, the Pearson correlation between an extension's Chrome Web Store star rating and its ExtensionShield security score is r = 0.11. Star ratings measure whether the extension works. They do not measure what it can reach."
        },
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r between Web Store stars and security score (n=56 rated listings)"
            },
            {
              "value": "15 of 29",
              "label": "extensions rated 4.5 stars or higher that scored below 80"
            },
            {
              "value": "9 of 29",
              "label": "of those 4.5-star extensions that scored below 70"
            },
            {
              "value": "4 of 29",
              "label": "of those 4.5-star extensions that scored below 60"
            }
          ]
        },
        {
          "type": "p",
          "text": "The spread is what makes the average misleading. Mean star rating across the rated listings is 4.31 while the mean security score is 76.6, with a median of 79 and a range from 35 to 100. A reviewer sampling on reputation is sampling from a distribution that is tightly clustered at the top on one axis and spread across 65 points on the other."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "About this corpus",
          "text": "These 57 scans are a convenience sample of extensions submitted to ExtensionShield's public scanner, not a random sample of the Chrome Web Store. Treat every figure here as descriptive of what people bring to a scanner, not as a population estimate for the store."
        },
        {
          "type": "p",
          "text": "What follows is a template. Copy it, replace the bracketed values, and keep the evidence table — that is the part an auditor will actually ask for."
        }
      ]
    },
    {
      "heading": "1. Scope and roles",
      "id": "scope-and-roles",
      "blocks": [
        {
          "type": "p",
          "text": "Define scope narrowly enough that it is enforceable. A policy that claims to cover \"all browsers\" but is only enforced through Chrome enterprise policy is a finding waiting to happen."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Applies to: all managed Chrome and Chrome-for-Business profiles enrolled in [MDM / Chrome Enterprise Core], on [Windows, macOS, Linux, ChromeOS].",
            "Covers: Chrome Web Store extensions, self-hosted CRX packages, and unpacked developer-mode loads.",
            "Out of scope (state it explicitly): personal profiles on unmanaged devices, other browser families, and userscript managers governed by [separate policy].",
            "Effective date and review cadence: reviewed at least every [12] months by the policy owner."
          ]
        },
        {
          "type": "table",
          "caption": "Roles and decision authority",
          "columns": [
            "Role",
            "Responsibility",
            "Can approve"
          ],
          "rows": [
            [
              "Requester",
              "Submits the business justification and the extension ID and version",
              "No"
            ],
            [
              "Reviewer (Security Engineering)",
              "Runs the technical review, produces the evidence record",
              "Tier 1 only"
            ],
            [
              "Application owner",
              "Confirms the business need and names an alternative if denied",
              "No"
            ],
            [
              "Security approver (named individual, not a team alias)",
              "Signs Tier 2 decisions and all exceptions",
              "Tier 1, Tier 2"
            ],
            [
              "CISO or delegate",
              "Signs Tier 3 decisions and any exception exceeding [30] days",
              "All tiers"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Name individuals in the approver column. Auditors ask who approved a specific decision on a specific date, and a distribution list cannot answer that."
        }
      ]
    },
    {
      "heading": "2. Risk tiers with explicit criteria",
      "id": "risk-tiers",
      "blocks": [
        {
          "type": "p",
          "text": "Tiering exists so that a note-taking extension does not consume the same review budget as one that can read every page. Assign the tier from observable properties of the package, not from vendor reputation."
        },
        {
          "type": "table",
          "caption": "Risk tiers — assign the highest tier for which any criterion is met",
          "columns": [
            "Tier",
            "Criteria (any one triggers the tier)",
            "Review depth",
            "Approver"
          ],
          "rows": [
            [
              "Tier 1 — Limited",
              "No host permissions, or activeTab only; no remote code fetch; no network-modifying permissions; storage scoped to the extension",
              "Metadata and manifest review",
              "Reviewer"
            ],
            [
              "Tier 2 — Standard",
              "Named host permissions on a bounded list of domains; uses scripting, tabs, cookies, or declarativeNetRequest",
              "Manifest review plus static analysis of the bundle and a permission-to-function mapping",
              "Security approver"
            ],
            [
              "Tier 3 — Elevated",
              "Broad host patterns (<all_urls>, https://*/*, http://*/*, *://*/*); webRequest; nativeMessaging; debugger; management; or any access to an authentication or finance domain",
              "Full audit: static analysis, network observation, publisher diligence, and a documented compensating control",
              "CISO or delegate"
            ],
            [
              "Denied by default",
              "Malware indicators, credential capture, obfuscated remote code execution, or no privacy policy",
              "No approval path; requires an explicit exception record",
              "CISO or delegate"
            ]
          ]
        },
        {
          "type": "p",
          "text": "The last row matters. ExtensionShield applies hard gates that override the weighted score to BLOCK for severe findings such as malware indicators or credential capture; your policy should have an equivalent floor that a favorable business case cannot argue past."
        },
        {
          "type": "p",
          "text": "Expect the tier populations to be uneven. In the corpus, the risk-level distribution across the 57 scans is 28 low, 21 medium, 3 high, and 5 rated 'none', the lowest-risk tier. A tiering scheme that routes most of your inventory to the cheapest review is working as intended — the point is that the small elevated population gets the budget it needs."
        }
      ]
    },
    {
      "heading": "3. Permission thresholds that trigger review",
      "id": "permission-thresholds",
      "blocks": [
        {
          "type": "p",
          "text": "Manifest V3 declares capability in four places: \"permissions\", \"optional_permissions\", \"host_permissions\", and \"optional_host_permissions\". Chrome's documentation describes both optional keys as granted by the user at runtime rather than at install time, so a review that reads only \"permissions\" will miss capability the extension can acquire later. Read all four keys, plus \"content_scripts.matches\"."
        },
        {
          "type": "p",
          "text": "The activeTab permission is worth calling out as a positive signal. Chrome documents it as granting access only after a user gesture — executing an action, a context menu item, a keyboard shortcut from the commands API, or accepting a suggestion from the omnibox API — and states that access is revoked when the user navigates away or closes the tab. Chrome's docs also note that it displays no warning message during installation, and present it as an alternative for many uses of <all_urls>."
        },
        {
          "type": "table",
          "caption": "Permission prevalence in the ExtensionShield corpus (n=57, convenience sample) and suggested policy thresholds",
          "columns": [
            "Permission",
            "Prevalence",
            "Threshold"
          ],
          "rows": [
            [
              "storage",
              "86.0%",
              "Tier 1 — no action"
            ],
            [
              "scripting",
              "49.1%",
              "Tier 2 — require host scope justification"
            ],
            [
              "tabs",
              "40.4%",
              "Tier 2 — reads URL and title of all tabs"
            ],
            [
              "activeTab",
              "29.8%",
              "Tier 1 — preferred over host permissions"
            ],
            [
              "alarms",
              "26.3%",
              "Tier 1 — note any periodic background work"
            ],
            [
              "unlimitedStorage",
              "24.6%",
              "Tier 2 — ask what is being retained locally"
            ],
            [
              "offscreen",
              "21.1%",
              "Tier 2 — document what runs off-screen"
            ],
            [
              "webRequest",
              "21.1%",
              "Tier 3 — observes request traffic"
            ],
            [
              "contextMenus",
              "19.3%",
              "Tier 1 — no action"
            ],
            [
              "webNavigation",
              "19.3%",
              "Tier 2 — observes navigation across tabs"
            ],
            [
              "cookies",
              "19.3%",
              "Tier 3 if scoped to auth or finance domains"
            ],
            [
              "declarativeNetRequest",
              "17.5%",
              "Tier 2 — rule-based, prefer over webRequest"
            ],
            [
              "downloads",
              "12.3%",
              "Tier 2 — can write files to disk"
            ],
            [
              "management",
              "10.5%",
              "Tier 3 — can enumerate other installed extensions"
            ],
            [
              "notifications",
              "10.5%",
              "Tier 1 — no action"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Host breadth is the primary tiering input. In the corpus, <all_urls> appears in 24.6% of extensions, https://*/* in 14.0%, http://*/* in 12.3%, and *://*/* in 8.8%, for 34 broad-host occurrences overall. Any of these should route to Tier 3 automatically."
        }
      ]
    },
    {
      "heading": "4. The evidence record",
      "id": "evidence-record",
      "blocks": [
        {
          "type": "p",
          "text": "One record per decision, stored where an auditor can retrieve it without asking you to reconstruct history from chat logs. Every field below should be populated before approval, not after."
        },
        {
          "type": "table",
          "caption": "Evidence to collect for each allowlist decision",
          "columns": [
            "Field",
            "Source",
            "Why it is asked for"
          ],
          "rows": [
            [
              "Extension ID",
              "32-character ID from the Web Store URL or chrome://extensions in Developer mode",
              "The only stable identifier; the display name can change"
            ],
            [
              "Version reviewed",
              "manifest.json \"version\"",
              "Establishes what was actually examined"
            ],
            [
              "Publisher and verified contact",
              "Web Store listing",
              "Anchors the ownership-change re-review trigger"
            ],
            [
              "Declared permissions",
              "permissions and optional_permissions",
              "Capability at install and capability obtainable later"
            ],
            [
              "Host access",
              "host_permissions, optional_host_permissions, content_scripts.matches",
              "Determines the tier and the runtime_blocked_hosts entries"
            ],
            [
              "Security score and layer breakdown",
              "ExtensionShield scan (Security / Privacy / Governance, weighted near-equally at roughly 34/33/33)",
              "A repeatable number with a published methodology behind it"
            ],
            [
              "Hard-gate result",
              "Scan output",
              "Records whether a BLOCK condition was present"
            ],
            [
              "Decision and tier",
              "Reviewer",
              "The determination itself"
            ],
            [
              "Decision owner",
              "Named approver",
              "Accountability; team aliases are not acceptable"
            ],
            [
              "Rationale",
              "Reviewer, free text",
              "Must state the business need and the permission-to-function mapping"
            ],
            [
              "Compensating controls",
              "Reviewer",
              "runtime_blocked_hosts, blocked_permissions, version pinning, or profile scoping"
            ],
            [
              "Review date and next review date",
              "Reviewer",
              "Drives the recurring re-review queue"
            ]
          ]
        },
        {
          "type": "p",
          "text": "For pre-install review, /scan accepts a Chrome Web Store URL. For an internally built extension that has not been published, /scan/upload accepts a private CRX or ZIP for a pre-release audit. The scoring methodology is published at /research/methodology, which is the part you hand to an auditor who asks how the number was produced."
        }
      ]
    },
    {
      "heading": "5. Enforcing it in Chrome",
      "id": "chrome-enforcement",
      "blocks": [
        {
          "type": "p",
          "text": "The written policy is only half the artifact. The other half is the enforced configuration. Chrome's ExtensionSettings policy maps an extension ID to its configuration, with the special ID \"*\" applying to all extensions that have no custom configuration."
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "ExtensionSettings overrides the legacy list policies",
          "text": "Chromium's reference states that this policy will override any legacy policies if both are set. Google's Windows administration page is more specific, listing ExtensionAllowedTypes, ExtensionInstallBlocklist, ExtensionInstallForcelist, ExtensionInstallSources and ExtensionInstallAllowlist as the policies ExtensionSettings overrides. If you deploy both, only the ExtensionSettings values take effect. The legacy keys are shown below for teams still running them, but ExtensionSettings alone is the cleaner deployment."
        },
        {
          "type": "code",
          "language": "json",
          "caption": "Managed policy file — e.g. /etc/opt/chrome/policies/managed/extension_allowlist.json on Linux",
          "code": "{\n  \"ExtensionInstallBlocklist\": [\"*\"],\n  \"ExtensionInstallAllowlist\": [\n    \"gmbgaklkmjakoegficnlkhebmhkjfich\",\n    \"abcdefghijklmnopabcdefghijklmnop\"\n  ],\n  \"ExtensionUnpublishedAvailability\": 1,\n  \"ExtensionSettings\": {\n    \"*\": {\n      \"installation_mode\": \"blocked\",\n      \"allowed_types\": [\"extension\"],\n      \"blocked_permissions\": [\n        \"debugger\",\n        \"nativeMessaging\",\n        \"proxy\",\n        \"management\",\n        \"cookies\"\n      ],\n      \"runtime_blocked_hosts\": [\n        \"*://*.internal.example.com\",\n        \"*://*.okta.com\"\n      ],\n      \"blocked_install_message\": \"Extensions require review. Open a request with Security Engineering at https://security.example.com/extension-request and include the extension ID.\"\n    },\n    \"gmbgaklkmjakoegficnlkhebmhkjfich\": {\n      \"installation_mode\": \"force_installed\",\n      \"update_url\": \"https://clients2.google.com/service/update2/crx\",\n      \"minimum_version_required\": \"1.5.0\",\n      \"runtime_blocked_hosts\": [\"*://*.internal.example.com\"],\n      \"runtime_allowed_hosts\": [\"*://calendar.google.com\"]\n    },\n    \"abcdefghijklmnopabcdefghijklmnop\": {\n      \"installation_mode\": \"allowed\",\n      \"minimum_version_required\": \"3.2.1\"\n    }\n  }\n}"
        },
        {
          "type": "p",
          "text": "Notes on the exact semantics, taken from Chromium's policy definitions. A blocklist value of '*' means all extensions are blocked by default; extensions explicitly listed in the allowlist are allowed if they are signed (packed), and all unpacked extensions are blocked — which is what closes the developer-mode sideload path. installation_mode accepts allowed, blocked, removed, force_installed and normal_installed; removed additionally uninstalls an already-present extension, and has been available since Chrome 75. force_installed and normal_installed require update_url to be set or the policy is invalid. allowed_types and install_sources are valid only under the default \"*\" configuration."
        },
        {
          "type": "p",
          "text": "runtime_blocked_hosts is the control that limits an approved extension's reach. Chromium documents it as blocking the extension from injecting JavaScript, altering and viewing webRequest and webNavigation traffic, viewing and altering cookies, and same-origin-policy exceptions on matching pages. The format is similar to match patterns except that no paths may be defined, and each list is capped at 100 entries — any further entry is discarded. minimum_version_required disables extensions older than the specified version, including force-installed ones."
        },
        {
          "type": "p",
          "text": "ExtensionUnpublishedAvailability set to 1 (DisableUnpublished) disables Web Store extensions that have been unpublished, and has been available since Chrome 115. It applies only to extensions installed and updated from the Chrome Web Store; off-store installs, command-line installs, self-hosted force-installed extensions, and all version-pinned extensions are ignored. The ID gmbgaklkmjakoegficnlkhebmhkjfich is Google's own documented example for Google Calendar; the second ID is a generic 32-character placeholder — replace both."
        }
      ]
    },
    {
      "heading": "6. The exception process",
      "id": "exception-process",
      "blocks": [
        {
          "type": "p",
          "text": "Exceptions are the mechanism that keeps the policy honest. Without a documented path, teams route around the policy entirely. With one that never expires, the allowlist becomes an archaeology project."
        },
        {
          "type": "steps",
          "items": [
            {
              "title": "Submit",
              "text": "Requester files an exception with the extension ID, version, the tier criterion being waived, the business need, and the date by which the need ends."
            },
            {
              "title": "Assess",
              "text": "Reviewer produces the same evidence record as a normal decision, plus an explicit statement of the residual risk being accepted."
            },
            {
              "title": "Constrain",
              "text": "Apply the tightest available compensating control before approving: runtime_blocked_hosts covering authentication, finance, and internal domains; blocked_permissions; minimum_version_required for version pinning; and scoping to a specific OU or profile group rather than the fleet."
            },
            {
              "title": "Approve with an expiry",
              "text": "Maximum exception duration is [90] days. Exceptions do not auto-renew. Approver is a named individual per the roles table."
            },
            {
              "title": "Expire or re-approve",
              "text": "On the expiry date the configuration reverts to the enforced state by default. Renewal requires a fresh evidence record, not a copy of the prior one."
            }
          ]
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "The one non-negotiable field",
          "text": "Every exception carries an expiry date recorded at approval time. An exception without an expiry is a policy change, and should go through policy change control instead."
        }
      ]
    },
    {
      "heading": "7. Re-review triggers",
      "id": "re-review-triggers",
      "blocks": [
        {
          "type": "p",
          "text": "An approval covers a version, not an extension. Chrome's documentation states that every few hours the browser checks installed extensions for an update URL, so the code running on the fleet next week is not necessarily the code you reviewed."
        },
        {
          "type": "p",
          "text": "This is not theoretical. In March 2026, The Hacker News reported on two Chrome extensions that turned malicious following ownership transfers: QuickLens (ID kdenlnncndfnhkognokgfpabgkgehodd, around 7,000 users) and ShotBird (ID gengfhhkjekmlejbhmmopegofnoifnjp, around 800 users), citing findings from monxresearch-sec and John Tuckner of Secure Annex. The reported QuickLens update, deployed on 17 February 2026, stripped security headers such as X-Frame-Options from every HTTP response and polled an external server every five minutes for JavaScript, which was stored in local storage and executed on every page load. LayerX has separately documented purchased extensions that contacted an external server every five minutes to download a fresh configuration file from attacker-controlled domains after ownership changed. Both cases share the same shape: benign at review time, malicious after an update."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Publisher or developer-account change on the Web Store listing — immediate Tier 3 re-review.",
            "Any new entry in permissions, optional_permissions, host_permissions, or content_scripts.matches — re-review at the tier the new permission implies.",
            "Extension unpublished or removed from the Web Store — disable via ExtensionUnpublishedAvailability and open an investigation.",
            "Minor or major version bump on a Tier 3 extension — re-review before raising minimum_version_required.",
            "Public vulnerability disclosure or credible research naming the extension.",
            "Scheduled re-review: Tier 3 every [90] days, Tier 2 every [180] days, Tier 1 annually."
          ]
        },
        {
          "type": "p",
          "text": "Version pinning through minimum_version_required is a floor, not a ceiling — it disables versions below the value but does not prevent upgrades above it. If you need to hold a Tier 3 extension at a reviewed version, self-host the CRX and control the update URL, accepting the patching burden that comes with it."
        }
      ]
    },
    {
      "heading": "8. Adopting the template",
      "id": "adopting-the-template",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {
              "title": "Inventory before you enforce",
              "text": "Collect installed extension IDs and versions across the fleet. Publishing a blocklist of \"*\" without an inventory will break someone's workflow on day one."
            },
            {
              "title": "Tier the inventory",
              "text": "Sort by host breadth first. In the corpus, broad host patterns accounted for 34 occurrences across 57 extensions, so expect a meaningful Tier 3 population."
            },
            {
              "title": "Backfill evidence records",
              "text": "Existing extensions need the same record as new requests. This is a common audit gap."
            },
            {
              "title": "Deploy in monitor mode",
              "text": "Set the \"*\" default to allowed with runtime_blocked_hosts populated for sensitive domains, observe for [30] days, then flip installation_mode to blocked."
            },
            {
              "title": "Wire the re-review queue",
              "text": "Automate the publisher-change and permission-diff checks. A quarterly manual sweep will not catch a two-day-old malicious update."
            }
          ]
        },
        {
          "type": "p",
          "text": "The published case studies at /research/case-studies (Honey and fake ad blockers) illustrate the review reasoning applied end to end. ExtensionShield's core is open source if you would rather run the analysis in your own environment than send extension packages to a third party."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "What this policy does not do",
          "text": "It does not detect a malicious extension. It creates a decision record, a permission threshold, and a re-review trigger — three things that make a malicious update findable after the fact and reviewable before the next one. Detection is a separate control."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "Extension Settings Full Description",
      "publisher": "The Chromium Projects",
      "url": "https://www.chromium.org/administrators/policy-list-3/extension-settings-full/"
    },
    {
      "title": "ExtensionInstallBlocklist policy definition (policy_definitions/Extensions)",
      "publisher": "Chromium source",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Extensions/ExtensionInstallBlocklist.yaml"
    },
    {
      "title": "ExtensionInstallAllowlist policy definition (policy_definitions/Extensions)",
      "publisher": "Chromium source",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Extensions/ExtensionInstallAllowlist.yaml"
    },
    {
      "title": "ExtensionUnpublishedAvailability policy definition (policy_definitions/Extensions)",
      "publisher": "Chromium source",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/components/policy/resources/templates/policy_definitions/Extensions/ExtensionUnpublishedAvailability.yaml"
    },
    {
      "title": "Configure ExtensionSettings policy",
      "publisher": "Google Chrome Enterprise and Education Help",
      "url": "https://support.google.com/chrome/a/answer/9867568"
    },
    {
      "title": "Set Chrome app and extension policies (Windows)",
      "publisher": "Google Chrome Enterprise and Education Help",
      "url": "https://support.google.com/chrome/a/answer/7532015"
    },
    {
      "title": "Set Chrome app and extension policies (Linux)",
      "publisher": "Google Chrome Enterprise and Education Help",
      "url": "https://support.google.com/chrome/a/answer/7517525"
    },
    {
      "title": "Declare permissions",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions"
    },
    {
      "title": "activeTab permission",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/activeTab"
    },
    {
      "title": "Host on your own server (extension autoupdate)",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/how-to/distribute/host-on-linux"
    },
    {
      "title": "Chrome Extension Turns Malicious After Ownership Transfer, Enabling Code Injection and Data Theft",
      "publisher": "The Hacker News",
      "url": "https://thehackernews.com/2026/03/chrome-extension-turns-malicious-after.html",
      "date": "2026-03"
    },
    {
      "title": "Silent Takeover: How Purchased Chrome Extensions Became Remote-Controlled Webpage Manipulation Tools",
      "publisher": "LayerX Security",
      "url": "https://layerxsecurity.com/blog/silent-takeover-how-purchased-chrome-extensions-became-remote-controlled-webpage-manipulation-tools/"
    }
  ],
  "faq": [
    {
      "q": "Should I use ExtensionInstallAllowlist or ExtensionSettings?",
      "a": "ExtensionSettings, if you are starting fresh. Chromium's reference states that this policy will override any legacy policies if both are set, and Google's Windows administration page lists those legacy policies as ExtensionAllowedTypes, ExtensionInstallBlocklist, ExtensionInstallForcelist, ExtensionInstallSources and ExtensionInstallAllowlist. ExtensionSettings also gives you per-extension controls the legacy list policies cannot express — blocked_permissions, runtime_blocked_hosts, minimum_version_required, and a custom blocked_install_message. The legacy keys remain useful only if you already have tooling built around them."
    },
    {
      "q": "Does a blocklist of \"*\" also stop developer-mode sideloading?",
      "a": "Yes. Chromium's policy definition states that a blocklist value of '*' means all extensions are blocked by default, that extensions explicitly listed in the allowlist are allowed if they are signed (packed), and that all unpacked extensions are blocked. That closes the unpacked developer-mode load path, which is otherwise a common way an allowlist gets bypassed."
    },
    {
      "q": "Is a high star rating a reasonable proxy for a low-risk extension?",
      "a": "No. In ExtensionShield's corpus of 57 completed scans — a convenience sample of extensions submitted to the public scanner, not a random sample of the store — the correlation between star rating and security score is r = 0.11. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80, 9 below 70, and 4 below 60. Ratings reflect whether an extension works, not what it can access."
    },
    {
      "q": "How do I stop an approved extension from touching sensitive internal sites?",
      "a": "Use runtime_blocked_hosts in the ExtensionSettings policy. Chromium documents it as blocking the extension from injecting JavaScript, altering and viewing webRequest and webNavigation traffic, viewing and altering cookies, and same-origin-policy exceptions on matching pages. The format is similar to match patterns except that no paths may be defined (for example \"*://*.example.com\"), and the list is capped at 100 entries, with any further entry discarded. runtime_allowed_hosts carves exceptions back out."
    },
    {
      "q": "How often should an approved extension be re-reviewed?",
      "a": "On triggers, not just on a calendar. Chrome's documentation says that every few hours the browser checks installed extensions for an update URL, so approval covers a version rather than an extension. Re-review on publisher or ownership change, on any new permission or host pattern, and on unpublishing from the Web Store. Layer a scheduled sweep on top — Tier 3 quarterly, Tier 2 semi-annually, Tier 1 annually — but treat the triggers as the primary control."
    },
    {
      "q": "What evidence will an auditor actually ask for?",
      "a": "For a sampled extension: the ID and the exact version reviewed, the declared permissions and host access, the tier assigned and why, the named individual who approved it, the dated rationale, any compensating controls applied, and the next review date. If the decision was an exception, they will also ask for the expiry date recorded at approval time and the evidence that it was either enforced or formally renewed."
    }
  ],
  "internalLinks": [
    {
      "label": "Extension governance",
      "to": "/extension-governance"
    },
    {
      "label": "Browser extension supply chain attacks",
      "to": "/guides/browser-extension-supply-chain-attacks"
    },
    {
      "label": "Extension risk score",
      "to": "/extension-risk-score"
    },
    {
      "label": "Enterprise",
      "to": "/enterprise"
    }
  ]
};
