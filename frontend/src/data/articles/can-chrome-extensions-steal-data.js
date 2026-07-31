/**
 * Can Chrome Extensions Steal Data? What Users and Teams Need to Know
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "can-chrome-extensions-steal-data",
  "collection": "guide",
  "title": "Can Chrome Extensions Steal Data? What Users and Teams Need to Know",
  "description": "Yes, within the permissions they hold. A technical breakdown of the extension data-theft chain, cookie and session token exposure, and what it does not mean.",
  "category": "Security",
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
    "Yes — but capability is not conduct. The same permissions that enable exfiltration are required by ad blockers, password managers, and translators.",
    "The attack chain is: gain install, obtain page or cookie access, collect, then transmit to an external endpoint.",
    "Session theft is the highest-value variant, because a stolen session token can bypass the login step entirely.",
    "Most extensions holding these permissions are doing nothing wrong; permission review is a triage signal, not a verdict."
  ],
  "sections": [
    {
      "heading": "The short answer",
      "id": "short-answer",
      "blocks": [
        {
          "type": "p",
          "text": "Yes. A Chrome extension can read and transmit the contents of pages you visit, the cookies your browser holds for those pages, and — with the right permission — data you copy and paste. None of this requires an exploit. It is the documented behavior of the extension platform working exactly as designed, bounded by the permissions the extension declared and you approved at install time."
        },
        {
          "type": "p",
          "text": "The useful question is therefore not whether extensions can steal data, but what an individual extension is scoped to reach, whether anything in its code path acts on that reach, and who controls the update channel that ships its code. This post covers three things in order: the capability surface, the attack chain attackers actually use, and cookies and session tokens specifically — which are the highest-value target on that surface."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Scope of this post",
          "text": "Everything below describes Chrome/Chromium under Manifest V3. Firefox's WebExtensions model is similar but diverges on host permission prompting and background script lifetime; those differences are out of scope here."
        }
      ]
    },
    {
      "heading": "The capability surface: what permissions actually grant",
      "id": "capability-surface",
      "blocks": [
        {
          "type": "p",
          "text": "Extension capability comes from two independent axes that people frequently collapse into one: API permissions (what the extension may call) and host permissions (which origins it may act on). Most interesting capability requires both. The cookies API is the clearest example — Chrome's documentation states that if host permissions for a URL are not specified in the manifest file, the API call will fail."
        },
        {
          "type": "table",
          "caption": "Documented capability per permission. Source: Chrome for Developers permission reference and content script docs.",
          "columns": [
            "Capability",
            "What it requires",
            "What it grants, and the install warning shown"
          ],
          "rows": [
            [
              "Read and modify page content",
              "content_scripts matches, or the scripting permission plus host permissions",
              "Full DOM access on matching pages — rendered text, form field values, and the ability to inject markup. The host permission drives the warning, not the scripting permission."
            ],
            [
              "Read and write cookies",
              "cookies permission plus host permissions for the target domain",
              "get(), getAll(), set(), remove(); returned Cookie objects include an httpOnly flag, so HttpOnly-marked cookies are within the API's reach. Chrome lists no separate install warning for the cookies permission itself."
            ],
            [
              "Read clipboard data",
              "clipboardRead",
              "Lets the extension paste items from the clipboard using the web platform Clipboard API. Warning: \"Read data you copy and paste.\""
            ],
            [
              "Observe network requests",
              "webRequest plus host permissions",
              "Access to the chrome.webRequest API for matching hosts. Chrome lists no separate install warning for this permission."
            ],
            [
              "Read privileged tab fields",
              "tabs",
              "Privileged fields of Tab objects, including URLs. Warning: \"Read your browsing history.\""
            ],
            [
              "Enumerate installed extensions",
              "management",
              "Access to the chrome.management API. Warning: \"Manage your apps, extensions, and themes.\""
            ],
            [
              "Temporary page access on click",
              "activeTab",
              "Temporary access to the active tab following a user gesture — notably, Chrome documents that this permission does not display a permission warning."
            ]
          ]
        },
        {
          "type": "p",
          "text": "Two boundaries are worth stating precisely, because they are often misdescribed. First, content scripts run in an isolated world — Chrome documents it as a private execution environment that isn't accessible to the page or other extensions, and notes that variables in a content script are not visible to the host page. A content script can read and rewrite the DOM but cannot read the page's own JavaScript variables directly. Second, Manifest V3 prohibits remotely hosted code: Chrome states that all of an extension's logic must be part of the extension package. Neither boundary is as protective as it sounds, for reasons covered in the next two sections."
        },
        {
          "type": "code",
          "language": "json",
          "caption": "A manifest fragment that is sufficient for whole-session compromise — and is also indistinguishable from a legitimate password manager or session-sync tool.",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Example\",\n  \"version\": \"1.0.0\",\n  \"permissions\": [\"cookies\", \"scripting\", \"storage\"],\n  \"host_permissions\": [\"<all_urls>\"],\n  \"content_scripts\": [\n    {\n      \"matches\": [\"<all_urls>\"],\n      \"js\": [\"content.js\"],\n      \"run_at\": \"document_start\"\n    }\n  ]\n}"
        }
      ]
    },
    {
      "heading": "The attack chain, install to exfiltration",
      "id": "attack-chain",
      "blocks": [
        {
          "type": "p",
          "text": "The December 2024 campaign against Chrome extension publishers is the best-documented end-to-end example, and every stage of it maps to a design property of the platform rather than a bug. Sekoia's analysis reported that the threat actor compromised approximately a dozen Chrome extensions, potentially affecting hundreds of thousands of end users, with the most recent campaign active until 30 December 2024. Sekoia notes the actor has been active since at least 2023. RH-ISAC, summarising the broader campaign, put the count at at least 16 affected extensions."
        },
        {
          "type": "steps",
          "items": [
            {
              "title": "Acquire distribution",
              "text": "Rather than building an audience, take over one. Sekoia documented spearphishing emails impersonating Chrome Web Store support — claiming the developer's extension violated store policies and was at risk of removal — that led developers to an OAuth consent screen for an app named \"Privacy Policy Extensions\" requesting permission to see, edit, update, or publish their extensions."
            },
            {
              "title": "Inherit permissions already granted",
              "text": "The compromised listing keeps the host permissions its existing users approved. This is the decisive advantage: no new consent is needed. Chrome documents that when an extension adds a new permission that triggers a warning it may temporarily disable it, and re-enable it only once the user accepts — but permissions already held carry forward silently through auto-update."
            },
            {
              "title": "Ship the payload as an update",
              "text": "Manifest V3 forbids remotely hosted code, but Chrome explicitly permits a different pattern: an extension may load and cache a remote configuration, for example a JSON file, at runtime, where the cached configuration determines which features are enabled. In the December campaign the malicious background.js retrieved configuration from command-and-control infrastructure and stored it in Chrome's local storage. Store review sees inert code; the server decides when and against whom it runs."
            },
            {
              "title": "Collect from the page and the cookie jar",
              "text": "Sekoia reported a second script, context_responder.js, injected at the beginning of each page, before any other script is run, for every URL. Running that early with broad matches means the collector is present before the application's own scripts initialize."
            },
            {
              "title": "Exfiltrate",
              "text": "This is where the platform offers no meaningful friction. Chrome documents that a script executing in an extension service worker can talk to remote servers outside of its origin as long as the extension requests host permissions — so service worker exfiltration is not CORS-gated at all. Content scripts are the exception: cross-origin requests are always treated as such in content scripts, even with host permissions, which is precisely why the standard pattern is for the content script to message the service worker and let it make the request. Reported targets in the campaign included OpenAI API keys, ChatGPT authentication data from /api/auth/session and /backend-api/me, and Facebook Business API keys, emails, passwords, and session cookies."
            }
          ]
        },
        {
          "type": "p",
          "text": "The Cyberhaven listing was among those affected, and it is the most precisely documented instance. Per RH-ISAC, a phishing attack on an administrator account allowed a malicious version, 24.10.4, to be published on 25 December 2024; it reached roughly 400,000 users through Chrome's auto-update mechanism, and was removed within 60 minutes of discovery, with a verified clean 24.10.5 released afterwards. The speed of the response is the point: even a well-resourced security vendor that detected and fixed the problem inside an hour still shipped attacker code to its entire installed base first."
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "The load-bearing step is step 1",
          "text": "Steps 2 through 5 are ordinary platform behavior. The security property that actually failed was publisher account control. An extension's risk is not fixed at review time; it is a function of who can push the next version."
        }
      ]
    },
    {
      "heading": "Cookies and session tokens specifically",
      "id": "cookies-and-sessions",
      "blocks": [
        {
          "type": "p",
          "text": "Session material deserves its own treatment because it defeats a control most organizations believe they have. A stolen password is one factor. A stolen session cookie is a completed authentication — the server has already evaluated the login and the second factor, and the cookie is the receipt."
        },
        {
          "type": "p",
          "text": "Varonis Threat Labs demonstrated this concretely in research published on 19 May 2025 under the name Cookie-Bite: a proof-of-concept Chrome extension using cookie, tab, and web request permissions, scoped to the Microsoft login domain, that listened for authentication events on login.microsoftonline.com and extracted the ESTSAUTH and ESTSAUTHPERSISTENT cookies used by Azure Entra ID. Replaying those cookies let the researchers impersonate the session without passing through login or MFA, because the identity provider treats the replayed cookie as proof of prior authentication."
        },
        {
          "type": "h3",
          "text": "Why the extension path is different from an infostealer"
        },
        {
          "type": "p",
          "text": "Local malware that steals cookies has to defeat the browser's at-rest protection. Google introduced Application-Bound Encryption for cookies on Windows in Chrome 127, announced 30 July 2024, specifically so that data is tied to app identity rather than being readable by any application running as the logged-in user. An extension with the cookies permission never touches that store on disk — it asks the browser, through a supported API, and receives values it can use. At-rest encryption is not part of that threat model, and no amount of it changes the answer."
        },
        {
          "type": "h3",
          "text": "Two collection paths, two different scopes"
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "chrome.cookies — requires the cookies permission plus host permissions for each target domain. Returns cookies for those domains including ones marked HttpOnly; Chrome defines that flag as making the cookie inaccessible to client-side scripts, which is a restriction on page JavaScript, not on this API. This is the path to long-lived session cookies.",
            "Content script in page context — requires only host permissions. Reaches bearer tokens that never become cookies: values rendered into the DOM, and responses from session endpoints the page itself calls. The ChatGPT /api/auth/session collection reported by Sekoia is this pattern. An extension with broad host permissions but no cookies permission still reaches a large share of session material."
          ]
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "Detection asymmetry",
          "text": "Exfiltrated session material produces authenticated traffic from a valid session. There is no failed login, no MFA prompt, and no anomalous credential use to alert on. Where an attacker also proxies through similar geography, the signal available to a SOC is thin."
        }
      ]
    },
    {
      "heading": "How common are the enabling permissions?",
      "id": "permission-prevalence",
      "blocks": [
        {
          "type": "p",
          "text": "We measured permission prevalence across our own scan corpus: 57 completed extension scans as of 28 July 2026. This is a convenience sample — extensions submitted to our public scanner — not a random sample of the Chrome Web Store, and it should not be extrapolated to the store as a whole. It is useful for one narrow purpose: showing that the permissions in the attack chain above are ordinary, not exotic."
        },
        {
          "type": "table",
          "caption": "Permission prevalence, ExtensionShield scan corpus, n=57 completed scans. Convenience sample, not representative of the Chrome Web Store.",
          "columns": [
            "Permission or host pattern",
            "Share of corpus",
            "Role in the chain above"
          ],
          "rows": [
            [
              "storage",
              "86.0%",
              "Payload staging and collected-data buffering"
            ],
            [
              "scripting",
              "50.9%",
              "Programmatic content script injection"
            ],
            [
              "tabs",
              "40.4%",
              "Privileged tab metadata, including URLs"
            ],
            [
              "activeTab",
              "29.8%",
              "Gesture-scoped page access, no install warning"
            ],
            [
              "alarms",
              "28.1%",
              "Scheduled wake-ups for a service worker"
            ],
            [
              "unlimitedStorage",
              "24.6%",
              "Removes the quota on staged data"
            ],
            [
              "webRequest",
              "21.1%",
              "Request observation on permitted hosts"
            ],
            [
              "offscreen",
              "21.1%",
              "DOM access outside a visible tab"
            ],
            [
              "cookies",
              "19.3%",
              "Direct chrome.cookies access"
            ],
            [
              "contextMenus",
              "19.3%",
              "UI surface, not a collection capability"
            ],
            [
              "webNavigation",
              "19.3%",
              "Navigation event timing across tabs"
            ],
            [
              "declarativeNetRequest",
              "17.5%",
              "Rule-based request blocking and redirection"
            ],
            [
              "downloads",
              "12.3%",
              "Writing files to the local filesystem"
            ],
            [
              "management",
              "10.5%",
              "Enumerating other installed extensions"
            ],
            [
              "notifications",
              "10.5%",
              "UI surface, not a collection capability"
            ],
            [
              "<all_urls>",
              "24.6%",
              "Host scope covering every site"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Broad host patterns are the ones that matter most, and they are not rare in this sample: <all_urls> at 24.6%, https://*/* at 14.0%, http://*/* at 12.3%, and *://*/* at 8.8%, totalling 34 broad-host occurrences across the corpus. Roughly one in five of these extensions holds the cookies permission outright. Scores across the same 57 scans have a median of 79 and a range of 35 to 100, and the corpus breaks down into 28 low-risk, 21 medium, 3 high, and 5 rated 'none', the lowest-risk tier. Again: convenience sample, and the distribution reflects what people chose to submit."
        }
      ]
    },
    {
      "heading": "What this does not mean",
      "id": "what-this-does-not-mean",
      "blocks": [
        {
          "type": "p",
          "text": "The overwhelming majority of extensions holding these permissions are not stealing anything. A password manager needs cookie and broad host access to function. An ad blocker needs to see every request. A screenshot tool needs to read every page. Permission breadth is a measure of blast radius if something goes wrong — it is not evidence that anything has gone wrong, and treating it as evidence produces a program that blocks useful software while missing actual compromise."
        },
        {
          "type": "p",
          "text": "What the permission surface tells you is where a supply chain failure would be catastrophic versus contained. That is a prioritization signal for monitoring and publisher-account scrutiny, not a verdict on the developer."
        },
        {
          "type": "h3",
          "text": "Store ratings do not encode any of this"
        },
        {
          "type": "p",
          "text": "Across the 56 rated listings in the same 57-scan convenience sample, the Pearson correlation between an extension's Chrome Web Store star rating and its ExtensionShield security score is r = 0.11 — no usable relationship. Mean star rating is 4.31 against a mean score of 76.6. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80, 9 below 70, and 4 below 60. This is unsurprising on reflection: star ratings measure whether an extension does its job well, and users have no visibility into permission scope, update governance, or data handling. They are not failing to assess risk; they were never assessing it."
        },
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r between Web Store star rating and security score (n=56 rated listings)"
            },
            {
              "value": "19.3%",
              "label": "of corpus extensions hold the cookies permission (n=57, convenience sample)"
            },
            {
              "value": "24.6%",
              "label": "of corpus extensions request <all_urls> (n=57, convenience sample)"
            },
            {
              "value": "4.31 / 76.5",
              "label": "mean star rating vs. mean security score (n=56 rated listings)"
            }
          ]
        }
      ]
    },
    {
      "heading": "Documented cases worth reading",
      "id": "documented-cases",
      "blocks": [
        {
          "type": "p",
          "text": "Not every misuse of extension capability is credential theft. Our published case studies at /research/case-studies cover two patterns that sit at different points on the severity scale."
        },
        {
          "type": "p",
          "text": "Honey is the instructive middle case. In late December 2024 the extension was publicly accused of exploiting last-click affiliate attribution — inserting itself as the final referrer and overriding affiliate tracking set by the creators who had referred the sale. We treat the specific allegations as reported rather than adjudicated. The platform-level outcome is documented: on 11 March 2025 Google published an updated Chrome Web Store affiliate ads policy requiring that the affiliate program be clearly disclosed on the listing, in the user interface, and before installation; that user action be required before any affiliate link, code, or cookie is applied; and that the link be tied to a direct benefit for the user at that moment — with enforcement beginning 10 June 2025. The mechanism at issue was cookie writing, not cookie reading, and it required no capability beyond what a coupon extension legitimately needs."
        },
        {
          "type": "p",
          "text": "Our fake ad blocker case study covers the other pattern: clones of trusted tools that invert their advertised function. It illustrates the same structural point — the capability is generic, and only behavior distinguishes the cases."
        }
      ]
    },
    {
      "heading": "What to actually do",
      "id": "what-to-do",
      "blocks": [
        {
          "type": "h3",
          "text": "For security teams"
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Inventory by capability, not by count. The question is how many extensions in your fleet hold broad host permissions plus cookies against your identity provider and SaaS domains. That set is your real exposure.",
            "Treat the update channel as the control point. Review approves a version; users run whatever ships next. Where the extension supports it, pin versions and gate updates through your management policy rather than trusting auto-update.",
            "Assume permission breadth means session material is reachable and shorten what a stolen session buys — bind sessions where the provider supports it, reduce session lifetime on high-value applications, and require reauthentication for sensitive operations.",
            "Watch for a session that changes properties without a new authentication event. That is the signal that survives cookie theft; a failed-login alert is not.",
            "Remember that the Cyberhaven timeline was measured in hours, not weeks. Response speed alone does not prevent exposure when auto-update is the distribution channel."
          ]
        },
        {
          "type": "h3",
          "text": "For individual users"
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Read the install prompt as a scope statement. \"Read and change all your data on all websites\" is accurate, and it is the permission that matters most.",
            "Note that some capabilities show no install warning at all — Chrome documents no warning for activeTab, and lists none for the cookies or webRequest permissions. The absence of a scary prompt is not an absence of capability.",
            "Remove extensions you have stopped using. A dormant extension keeps its permissions and keeps auto-updating.",
            "Do not treat a high star rating as a security signal — in our corpus it carries essentially none."
          ]
        },
        {
          "type": "h3",
          "text": "Where ExtensionShield fits"
        },
        {
          "type": "p",
          "text": "We score extensions across three layers — Security, Privacy, and Governance — weighted near-equally at approximately 34/33/33, with hard gates that override the weighted score to BLOCK for severe findings such as malware indicators or credential capture. /scan takes a Chrome Web Store URL for a pre-install assessment; /scan/upload takes a private CRX or ZIP for a pre-release audit of a build that is not published yet. The scoring methodology is published at /research/methodology and the core is open source, so you can check the reasoning rather than take the number on faith."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "chrome.cookies API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/cookies"
    },
    {
      "title": "Declare permissions — permissions list",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/permissions-list"
    },
    {
      "title": "Content scripts",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts"
    },
    {
      "title": "Permission warnings",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings"
    },
    {
      "title": "Cross-origin network requests",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/network-requests"
    },
    {
      "title": "Improve extension security (Manifest V3 remotely hosted code)",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/improve-security"
    },
    {
      "title": "Targeted supply chain attack against Chrome browser extensions",
      "publisher": "Sekoia.io",
      "url": "https://www.sekoia.com/blog/targeted-supply-chain-attack-against-chrome-browser-extensions",
      "date": "2025-01"
    },
    {
      "title": "Cyberhaven Extension Compromise Part of Broader Campaign Affecting Multiple Chrome Extensions",
      "publisher": "RH-ISAC",
      "url": "https://rhisac.org/threat-intelligence/cyberhaven-extension-compromise-part-of-broader-campaign-affecting-multiple-chrome-extensions/",
      "date": "2025-01"
    },
    {
      "title": "Cookie-Bite: How Your Digital Crumbs Let Threat Actors Bypass MFA and Maintain Access to Cloud Environments",
      "publisher": "Varonis Threat Labs",
      "url": "https://www.varonis.com/blog/cookie-bite",
      "date": "2025-05-19"
    },
    {
      "title": "Improving the security of Chrome cookies on Windows",
      "publisher": "Google Online Security Blog",
      "url": "https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html",
      "date": "2024-07-30"
    },
    {
      "title": "Chrome Web Store policy updates: Strengthening our policies on affiliate programs in Chrome Extensions",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/blog/cws-policy-update-affiliate-ads-2025",
      "date": "2025-03-11"
    },
    {
      "title": "Affiliate Ads — Chrome Web Store Program Policies",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads"
    },
    {
      "title": "Honey, browser extension promoted by MrBeast, accused of ripping off users",
      "publisher": "Newsweek",
      "url": "https://www.newsweek.com/honey-coupon-browser-extension-mrbeast-youtube-influencer-2007484",
      "date": "2024-12-30"
    }
  ],
  "faq": [
    {
      "q": "Can a Chrome extension read my passwords?",
      "a": "An extension with host permissions for a site runs a content script with full DOM access on that site, which includes the values of form fields. That is documented platform behavior, not an exploit. In practice, session cookies and tokens are the more common target because they are reusable immediately and do not require the victim to type anything."
    },
    {
      "q": "Does HttpOnly protect my session cookies from extensions?",
      "a": "No. Chrome defines the HttpOnly flag as making a cookie inaccessible to client-side scripts — that is a restriction on page JavaScript. The chrome.cookies API is a separate, privileged path, and Cookie objects it returns carry an httpOnly property, so HttpOnly-marked cookies are within its reach. Access still requires the cookies permission plus host permissions for the domain; Chrome documents that without them the API call will fail."
    },
    {
      "q": "Did Manifest V3 fix this?",
      "a": "It narrowed one specific technique. MV3 requires all extension logic to ship inside the package and bans remotely hosted code. Chrome explicitly still permits an extension to load and cache a remote configuration, such as a JSON file, at runtime to determine which features are enabled — which is enough to gate already-shipped behavior server-side. The December 2024 campaign documented by Sekoia used exactly that pattern, fetching configuration from command-and-control infrastructure into local storage."
    },
    {
      "q": "Doesn't CORS stop an extension from sending my data somewhere?",
      "a": "Not from the service worker. Chrome documents that a script in an extension service worker can talk to remote servers outside its origin as long as the extension requests host permissions. CORS does apply to content scripts — cross-origin requests are always treated as such there, even with host permissions — which is why the common pattern is for a content script to pass collected data to the service worker and let it make the outbound request."
    },
    {
      "q": "An extension I use has <all_urls> and the cookies permission. Should I remove it?",
      "a": "Not on that basis alone. Password managers, ad blockers, and session tools legitimately need that scope. Permission breadth tells you the blast radius of a compromise, not that a compromise has occurred. The more useful question is who controls the publisher account and whether you can pin the version."
    },
    {
      "q": "Why doesn't a high Chrome Web Store rating mean an extension is safe?",
      "a": "Across our 57-scan corpus — a convenience sample of extensions submitted to our public scanner, not a random sample of the store — the correlation between star rating and our security score is r = 0.11. Ratings measure whether an extension works well; reviewers have no visibility into permission scope, update governance, or where data is sent. The two are measuring different things."
    }
  ],
  "internalLinks": [
    {
      "label": "Published case studies",
      "to": "/research/case-studies"
    },
    {
      "label": "Chrome extension permissions explained",
      "to": "/chrome-extension-permissions"
    },
    {
      "label": "Scan an extension",
      "to": "/scan"
    },
    {
      "label": "Browser extension security",
      "to": "/extension-security"
    }
  ]
};
