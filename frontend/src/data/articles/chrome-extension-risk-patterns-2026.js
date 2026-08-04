/**
 * Chrome Extension Risk Patterns in 2026: What 57 Scans Show
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "chrome-extension-risk-patterns-2026",
  "collection": "research",
  "title": "Chrome Extension Risk Patterns in 2026: What 57 Scans Show",
  "description": "Permission prevalence, host-permission breadth and security-score distribution across 57 scanned Chrome extensions, with methodology and limits stated.",
  "category": "Research",
  "datePublished": "2026-04-01",
  "dateModified": "2026-07-28",
  "readingTime": 9,
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
    "Broad host access is routine, not exceptional: <all_urls> appears in 24.6% of the 57-scan corpus, with https://*/* in a further 14.0%.",
    "scripting (49.1%) and tabs (40.4%) are the most common high-capability permissions after storage (86.0%).",
    "Scores span 35 to 100 with a median of 79; risk levels break down as 28 low, 21 medium, 3 high, and 5 rated 'none', the lowest-risk tier.",
    "We name no extension as risky. A mid score reflects permission breadth and data-flow exposure, not proven misconduct."
  ],
  "sections": [
    {
      "heading": "Why this post has no list of named extensions",
      "id": "why-no-list",
      "blocks": [
        {
          "type": "p",
          "text": "This page previously carried a different title and a different promise: a ranked list of the riskiest Chrome extensions of 2026. We retitled it and rewrote it because that list would not have been defensible. What ExtensionShield measures for a given extension is permission breadth, static code findings, and metadata hygiene. Those are useful review signals. They are not evidence that a publisher did anything wrong."
        },
        {
          "type": "p",
          "text": "An extension requesting broad host access and cookie access may be a password manager doing exactly what a password manager has to do, or it may be exfiltrating session tokens. Static analysis of a packaged build separates those two cases far less reliably than a single score implies. Naming products as risky on that basis attaches an accusation to legitimate software, and the moment one entry is wrong the whole dataset stops being worth reading."
        },
        {
          "type": "p",
          "text": "So what follows is the aggregate instead: the permission and score distribution across the 57 completed scans in the ExtensionShield corpus as of 2026-07-28, with no extension named."
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "A score is not an accusation",
          "text": "A score below 80 means the extension requests capability its manifest and code do not obviously need, or that static analysis flagged patterns worth a human look. It does not mean the extension is malicious, and we do not report it that way."
        }
      ]
    },
    {
      "heading": "The corpus",
      "id": "the-corpus",
      "blocks": [
        {
          "type": "stat",
          "items": [
            {
              "value": "57",
              "label": "completed scans in the corpus"
            },
            {
              "value": "76.6",
              "label": "mean security score"
            },
            {
              "value": "79",
              "label": "median security score"
            },
            {
              "value": "35–100",
              "label": "score range"
            }
          ]
        },
        {
          "type": "p",
          "text": "The corpus is 57 completed scans. Twelve further scans failed at download, unpack or analysis and are excluded entirely rather than scored as zero. 56 of the 57 carry both a published Chrome Web Store star rating and an ExtensionShield security score (one listing has no published rating), which is what makes the correlation analysis later in this post possible."
        },
        {
          "type": "p",
          "text": "Critically, this is a convenience sample. These are extensions somebody chose to submit to the public scanner. Submissions skew toward products people are already curious or suspicious about, toward popular listings, and toward whatever was recently discussed. It is not a random sample of the Chrome Web Store, and no percentage below should be read as a Web Store-wide prevalence."
        },
        {
          "type": "table",
          "caption": "Risk level distribution, n = 57 (convenience sample)",
          "columns": [
            "Risk level",
            "Extensions",
            "Share of corpus"
          ],
          "rows": [
            [
              "none",
              "5",
              "8.8%"
            ],
            [
              "low",
              "28",
              "49.1%"
            ],
            [
              "medium",
              "21",
              "36.8%"
            ],
            [
              "high",
              "3",
              "5.3%"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Three extensions in 57 landed in the high band. The mass of the distribution sits in low and medium — 49 of 57 — which is the shape you would expect from a sample dominated by mainstream, actively maintained products that nonetheless ask for more than they need. The median score of 79 is the number to hold onto: about half the corpus scored at or below it."
        }
      ]
    },
    {
      "heading": "Permission prevalence across the 57",
      "id": "permission-prevalence",
      "blocks": [
        {
          "type": "p",
          "text": "This is the table. Percentages are of the 57-extension convenience sample and counts are derived from them. The right-hand column states what declaring the permission grants according to Chrome's permissions reference and the individual API reference pages — not what any extension does with it."
        },
        {
          "type": "table",
          "caption": "Manifest permission prevalence, ExtensionShield corpus, n = 57 (convenience sample)",
          "columns": [
            "Permission",
            "Present in",
            "Count",
            "What declaring it grants"
          ],
          "rows": [
            [
              "storage",
              "86.0%",
              "49",
              "Access to the chrome.storage API for extension-local key/value data."
            ],
            [
              "scripting",
              "49.1%",
              "28",
              "Access to chrome.scripting: programmatic injection of JavaScript and CSS into pages the extension has host access to."
            ],
            [
              "tabs",
              "40.4%",
              "23",
              "Access to the privileged Tab fields url, pendingUrl, title and favIconUrl, including matching on them via tabs.query(). Chrome's documentation states it does not grant the chrome.tabs namespace itself."
            ],
            [
              "activeTab",
              "29.8%",
              "17",
              "Temporary access to the active tab following a user gesture, with no install-time warning message."
            ],
            [
              "alarms",
              "26.3%",
              "15",
              "Access to chrome.alarms for scheduled wake-ups."
            ],
            [
              "unlimitedStorage",
              "24.6%",
              "14",
              "An unlimited quota for chrome.storage.local, IndexedDB, Cache Storage and the Origin Private File System."
            ],
            [
              "offscreen",
              "21.1%",
              "12",
              "Access to chrome.offscreen: a hidden document with DOM APIs the service worker cannot use directly."
            ],
            [
              "webRequest",
              "21.1%",
              "12",
              "Access to chrome.webRequest, which must be declared alongside host permissions. Observational for store-distributed MV3 extensions."
            ],
            [
              "contextMenus",
              "19.3%",
              "11",
              "Access to chrome.contextMenus."
            ],
            [
              "webNavigation",
              "19.3%",
              "11",
              "Access to chrome.webNavigation: notifications about in-flight navigations, including the destination URL, per frame."
            ],
            [
              "cookies",
              "19.3%",
              "11",
              "Access to chrome.cookies, which Chrome requires be declared alongside host permissions for any host whose cookies are accessed."
            ],
            [
              "declarativeNetRequest",
              "17.5%",
              "10",
              "Browser-evaluated request rules, with implicit access to allow, allowAllRequests and block actions."
            ],
            [
              "downloads",
              "12.3%",
              "7",
              "Access to chrome.downloads."
            ],
            [
              "management",
              "10.5%",
              "6",
              "Access to chrome.management: enumerate installed apps and extensions, and enable, disable or uninstall them."
            ],
            [
              "notifications",
              "10.5%",
              "6",
              "Access to chrome.notifications."
            ]
          ]
        },
        {
          "type": "h3",
          "text": "storage at 86% is the floor, not a finding"
        },
        {
          "type": "p",
          "text": "Nearly every extension stores something, and chrome.storage is extension-local rather than a cross-site read. Its prevalence is a sanity check on the corpus and nothing more. The same is broadly true of alarms, contextMenus and notifications: they are plumbing, and their presence carries close to zero signal alone. unlimitedStorage at 24.6% is worth a second look only in combination — an extension that removes its storage quota across chrome.storage.local, IndexedDB, Cache Storage and the Origin Private File System, and also holds broad host access, is retaining something large, and the review question is what."
        },
        {
          "type": "h3",
          "text": "scripting and tabs are where breadth actually lives"
        },
        {
          "type": "p",
          "text": "scripting appears in just over half the corpus. On its own it is inert: injection only reaches origins the extension already has access to. Its risk is entirely a function of the host permissions beside it, which is why the two tables in this post have to be read together. scripting plus one named host is a normal integration. scripting plus <all_urls> is the ability to run code on every page the user opens."
        },
        {
          "type": "p",
          "text": "tabs at 40.4% is the more informative number, because it is frequently over-requested. Its function is to unlock four fields — url, pendingUrl, title and favIconUrl — on Tab objects, and to allow matching on them in tabs.query(). An extension that needs to know only that a tab exists, or to message its own content script, does not need it. When tabs appears in a product whose stated function does not involve knowing which page the user is on, that is a specific, answerable question: which code path reads tab.url, and where does that value go?"
        },
        {
          "type": "p",
          "text": "One caveat matters here, and it is easy to get wrong. The tabs permission is not the only route to those fields. Chrome also exposes them for URLs the extension holds host permissions for, so an extension with a broad host pattern can read tab URLs without ever declaring tabs. The absence of tabs in a manifest is therefore not by itself evidence that tab URLs are out of reach — read the host permissions before drawing that conclusion."
        },
        {
          "type": "p",
          "text": "activeTab, at 29.8%, is the counter-example worth rewarding. Chrome's documentation lists four gestures that grant it: executing an action, executing a context menu item, executing a keyboard shortcut from the commands API, and accepting a suggestion from the omnibox API. It displays no warning message during installation, and the access is revoked when the user navigates away or closes the tab. An extension doing its work through activeTab instead of standing host permissions has deliberately chosen to hold less."
        },
        {
          "type": "h3",
          "text": "cookies, webNavigation and management"
        },
        {
          "type": "p",
          "text": "These three sit near the top of the sensitivity ordering despite being far from the most common. cookies (19.3%) cannot be used alone: Chrome's documentation requires the cookies permission to be declared along with host permissions for any hosts whose cookies you want to access, so the real scope is set by the host pattern rather than the permission string. Paired with a broad pattern it becomes read access to session cookies across the web, and the justification bar should be correspondingly high."
        },
        {
          "type": "p",
          "text": "webNavigation (19.3%) delivers the destination URL of every navigation, per frame, without injecting anything. Notably, Chrome requires only the webNavigation permission for its methods and events — the host permissions that gate the cookies API do not gate this one in the same way, so the manifest permission alone is the whole story. It is a browsing feed in event form. Legitimate uses exist — SPA-aware injection timing, page-load telemetry — but \"we need to know when the page changed\" is usually satisfiable with less."
        },
        {
          "type": "p",
          "text": "management (10.5%) is the one we would question first. It enumerates the user's other installed apps and extensions and can disable or uninstall them. Worth knowing when you review: a few management methods, including getSelf, uninstallSelf and getPermissionWarningsByManifest, work without the permission being declared at all, so a manifest declaring management is asking for the enumeration and control surface specifically. A small set of products need that as core function: enterprise policy tooling, extension managers, some security products. For anything else, an inventory of what the user has installed is a fingerprinting surface with no user-visible payoff."
        },
        {
          "type": "h3",
          "text": "What \"justified\" means in practice"
        },
        {
          "type": "p",
          "text": "The test we apply is the one the Chrome Web Store program policies already state: request access to the narrowest permissions necessary to implement your product's features, and where more than one permission could be used to implement a feature, request those with the least access to data or functionality. That turns permission review into a question with an answer. For each declared permission, name the advertised feature that stops working without it. If no such feature exists, the permission is unjustified regardless of intent — and the failure mode is not necessarily abuse. It is that a compromised update inherits capability the product never needed."
        }
      ]
    },
    {
      "heading": "Host permissions are the real scope",
      "id": "host-permissions",
      "blocks": [
        {
          "type": "p",
          "text": "Manifest permissions describe which APIs an extension can call. Host permissions describe where. They are the more consequential of the two, and they are what Chrome surfaces to users as the ability to read and change data on the sites they visit."
        },
        {
          "type": "table",
          "caption": "Broad host patterns, n = 57 (convenience sample). Patterns overlap; one manifest may declare several.",
          "columns": [
            "Pattern",
            "Present in",
            "Count"
          ],
          "rows": [
            [
              "<all_urls>",
              "24.6%",
              "14"
            ],
            [
              "https://*/*",
              "14.0%",
              "8"
            ],
            [
              "http://*/*",
              "12.3%",
              "7"
            ],
            [
              "*://*/*",
              "8.8%",
              "5"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Those four patterns account for 34 occurrences across the corpus. Because a manifest can declare more than one, 34 occurrences is not 34 extensions, and the count of distinct extensions holding at least one broad pattern is lower. What the table does establish is that broad host access is not an edge case in this sample: roughly a quarter of it reaches every URL through <all_urls> alone."
        },
        {
          "type": "p",
          "text": "The distinction that matters at review time is install-time versus runtime. Anything in host_permissions is requested up front; optional_host_permissions is a real MV3 key whose entries are granted by the user at runtime instead. Chrome separately lets users restrict an installed extension's site access, with the choices presented as running the extension when you select it, on the current site, or on all sites. An extension built to work with runtime-granted access degrades gracefully when a security team applies that setting; one that assumes standing access breaks. That is a testable property, and testing it is more informative than reading the manifest."
        },
        {
          "type": "code",
          "language": "json",
          "caption": "The same capability, requested two ways",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Example\",\n  \"version\": \"1.0.0\",\n  \"permissions\": [\"storage\", \"scripting\", \"cookies\"],\n  \"host_permissions\": [\"https://app.example.com/*\"],\n  \"optional_host_permissions\": [\"https://*/*\"],\n  \"background\": {\n    \"service_worker\": \"service-worker.js\"\n  }\n}"
        },
        {
          "type": "p",
          "text": "The first host array is what the extension holds the moment it is installed. The second is what it has to ask for. Two extensions with identical feature sets can differ entirely on which line their host patterns sit."
        }
      ]
    },
    {
      "heading": "Request interception after Manifest V3",
      "id": "request-interception",
      "blocks": [
        {
          "type": "p",
          "text": "webRequest appears in 21.1% of the corpus and declarativeNetRequest in 17.5%. Under Manifest V3 these are not interchangeable, and the difference is worth stating precisely because it is frequently reported wrong."
        },
        {
          "type": "p",
          "text": "The webRequest API still exists in MV3. Chrome's documentation states that aside from webRequestBlocking, the webRequest API is unchanged and available for normal use; what changed is that the webRequestBlocking permission is no longer available to most extensions, with policy-installed extensions the documented exception — Chrome's migration guide says the permission is still available in Manifest V3 for extensions installed by policy. A store-distributed MV3 extension declaring webRequest is therefore observing traffic rather than rewriting it — but webRequest must be declared alongside host permissions, and observing traffic on those hosts still means request URLs and headers reaching the extension's own code."
        },
        {
          "type": "p",
          "text": "declarativeNetRequest inverts that. The extension supplies rules and Chrome evaluates them, which the documentation describes as modifying network requests without intercepting them and viewing their content, thus providing more privacy. The declarativeNetRequest permission triggers an install-time warning but carries implicit access to allow, allowAllRequests and block rules; the declarativeNetRequestWithHostAccess variant shows no install-time warning and instead requires host permissions before acting on a host."
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "The question to ask",
          "text": "An MV3 extension that could express its filtering as declarative rules but declares webRequest instead has chosen the more privileged option. That is not misconduct — dynamic logic and telemetry are real reasons — but it is a question worth sending to the vendor."
        }
      ]
    },
    {
      "heading": "Web Store rating does not predict security score",
      "id": "rating-vs-score",
      "blocks": [
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r, star rating vs security score (n = 56 rated)"
            },
            {
              "value": "4.31",
              "label": "mean Chrome Web Store star rating"
            },
            {
              "value": "29",
              "label": "corpus extensions rated 4.5 stars or higher"
            }
          ]
        },
        {
          "type": "p",
          "text": "56 of the 57 extensions in this convenience sample carry both a star rating and a security score; one listing has no published rating. The Pearson correlation between them is 0.11, which in a sample of this size is indistinguishable from no relationship at all."
        },
        {
          "type": "p",
          "text": "This should not be surprising. Star ratings measure whether an extension does the thing its users installed it to do, and nothing in the rating mechanism asks a user to evaluate permission scope — which most users are not positioned to evaluate. It is worth quantifying because \"it has 4.5 stars and millions of users\" is still used as a procurement argument."
        },
        {
          "type": "table",
          "caption": "The 29 extensions rated 4.5 stars or higher, by security score. \"Below\" rows are cumulative.",
          "columns": [
            "Security score",
            "Extensions (of 29)"
          ],
          "rows": [
            [
              "Below 60",
              "4"
            ],
            [
              "Below 70",
              "9"
            ],
            [
              "Below 80",
              "15"
            ],
            [
              "80 or above",
              "14"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Rows are cumulative: the four scoring below 60 are also counted in the below-70 and below-80 rows. Slightly more than half of the highly-rated subset scored below 80, and four scored below 60 — which, again, is a statement about permission breadth and static findings, not about those products' conduct."
        }
      ]
    },
    {
      "heading": "Methodology and limitations",
      "id": "methodology",
      "blocks": [
        {
          "type": "p",
          "text": "ExtensionShield scores across three layers — Security, Privacy and Governance — weighted near-equally at roughly 34/33/33. Hard gates override the weighted score to BLOCK for severe findings such as malware indicators or credential capture. The scoring methodology is published at /research/methodology, and the core is open source."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "n = 57. Small. Every percentage here moves by about 1.8 points if one extension is added or removed.",
            "Convenience sample. These are extensions submitted to the public scanner, not a random or stratified sample of the Chrome Web Store. Do not generalise any figure to the store as a whole.",
            "Static analysis only. Scores come from the packaged build, its manifest and its listing metadata. A declared permission is not proof it is exercised, and behaviour driven by remote configuration or shipped in a later version is not visible here.",
            "Snapshot in time. Figures are as of 2026-07-28. An extension's permission set is a property of a version, not of a product.",
            "12 scans failed and were excluded rather than scored. If failure correlates with obfuscation, size or packaging, the corpus is biased in a direction we cannot measure.",
            "Metadata completeness varies. 2 of the 57 had no privacy policy captured in Web Store metadata, which is a gap in the captured record rather than proof none is published.",
            "Permission presence is read from the manifest. Because Chrome exposes some capability through more than one route — privileged Tab fields are available via host permissions as well as the tabs permission — a permission table understates reachable capability on its own."
          ]
        }
      ]
    },
    {
      "heading": "What we are not claiming",
      "id": "not-claiming",
      "blocks": [
        {
          "type": "list",
          "ordered": false,
          "items": [
            "That any extension in this corpus is malicious, dangerous or compromised. The corpus contains no such determination and we make none.",
            "That a low score indicates wrongdoing. It indicates permission breadth and static findings, both frequently justified by a product's actual function.",
            "That these percentages describe the Chrome Web Store. They describe 57 submitted extensions.",
            "That a high score is a clean bill of health. Static analysis of a packaged build does not see server-side behaviour, remote configuration, or what the next version will do.",
            "Anything about detection rates, benchmarks or comparisons with other tools. We have not measured that and are not asserting it."
          ]
        }
      ]
    },
    {
      "heading": "Using this in a review queue",
      "id": "applying",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {
              "title": "Read host permissions before manifest permissions",
              "text": "Scope is set by where an extension can act, not by which APIs it can call. A broad host pattern changes what every other permission in that manifest means, and can expose privileged Tab fields on its own."
            },
            {
              "title": "Name the feature behind each permission",
              "text": "For each declared permission, identify the advertised feature that breaks without it. Permissions with no such feature are the findings; the rest are cost of doing business."
            },
            {
              "title": "Test the downgrade",
              "text": "Restrict the extension's site access in Chrome's extensions page — to the current site, or to only when you select the extension — and use it. An extension that still works has demonstrated it does not need standing access, whatever its manifest declares."
            },
            {
              "title": "Treat management, cookies and webNavigation as escalations",
              "text": "Each needs a specific stated function to justify it. Absent that, they are the highest-value questions to send back to the vendor."
            },
            {
              "title": "Re-scan on update",
              "text": "Permission sets change between versions. /scan takes a Chrome Web Store URL for a pre-install check; /scan/upload takes a private CRX or ZIP build for a pre-release audit."
            }
          ]
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "Declare permissions — Permissions reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/permissions-list"
    },
    {
      "title": "Declare permissions (permissions, optional_permissions, host_permissions, optional_host_permissions)",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions"
    },
    {
      "title": "chrome.tabs",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/tabs"
    },
    {
      "title": "activeTab permission",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/activeTab"
    },
    {
      "title": "chrome.cookies",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/cookies"
    },
    {
      "title": "chrome.management",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/management"
    },
    {
      "title": "chrome.webNavigation",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/webNavigation"
    },
    {
      "title": "chrome.webRequest",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/webRequest"
    },
    {
      "title": "Replace blocking web request listeners",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/blocking-web-requests"
    },
    {
      "title": "chrome.declarativeNetRequest",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest"
    },
    {
      "title": "chrome.offscreen",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/offscreen"
    },
    {
      "title": "Chrome Web Store program policies: Use of permissions",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/permissions"
    },
    {
      "title": "Install and manage extensions — site access settings",
      "publisher": "Google Chrome Web Store Help",
      "url": "https://support.google.com/chrome_webstore/answer/2664769"
    }
  ],
  "faq": [
    {
      "q": "Why did this post stop naming specific risky extensions?",
      "a": "Because the underlying data does not support it. An ExtensionShield score reflects permission breadth, static code findings and metadata hygiene. None of those establish that a publisher acted improperly, and labelling a legitimate product as risky on that basis would be both wrong and defamatory. We name an extension only when its behaviour is independently documented by a reputable published source, or in our own published case studies at /research/case-studies."
    },
    {
      "q": "Can these percentages be applied to the Chrome Web Store as a whole?",
      "a": "No. The corpus is 57 completed scans submitted to a public scanner — a convenience sample, not a random or stratified one. Submissions skew toward extensions people were already curious about. Treat the figures as a description of these 57 extensions and nothing more."
    },
    {
      "q": "Is a permission like tabs or webNavigation a problem by itself?",
      "a": "No permission is a problem in isolation. The question is whether an advertised feature stops working without it. tabs unlocks four Tab fields including url; webNavigation delivers the destination URL of every navigation, per frame. Both are justified in plenty of products and unjustified in plenty of others, and the manifest alone does not tell you which — an extension with broad host permissions can reach those Tab fields without declaring tabs at all."
    },
    {
      "q": "Does Manifest V3 remove the webRequest API?",
      "a": "No. Chrome's documentation states that aside from webRequestBlocking, the webRequest API is unchanged and available for normal use. What is restricted is the webRequestBlocking permission, which is no longer available to most extensions; Chrome's migration guide notes it remains available for extensions installed by policy. Store-distributed MV3 extensions declaring webRequest are observing traffic rather than modifying it."
    },
    {
      "q": "Why does a 4.5-star extension sometimes score poorly?",
      "a": "Because the two measure unrelated things. Across the 57 scans the Pearson correlation between Web Store star rating and security score is 0.11. Ratings capture whether an extension does its job; nothing in the rating flow asks a user to assess permission scope. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80."
    }
  ],
  "internalLinks": [
    {
      "label": "Chrome extension permissions explained",
      "to": "/chrome-extension-permissions"
    },
    {
      "label": "Scoring methodology",
      "to": "/research/methodology"
    },
    {
      "label": "Scan an extension",
      "to": "/scan"
    },
    {
      "label": "Published case studies",
      "to": "/research/case-studies"
    }
  ]
};
