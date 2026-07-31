/**
 * Browser Extension Supply Chain Attacks Explained
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "browser-extension-supply-chain-attacks",
  "collection": "guide",
  "title": "Browser Extension Supply Chain Attacks Explained",
  "description": "How extension auto-updates, ownership transfers, developer OAuth phishing, and remote config turn installed extensions into a live supply chain risk.",
  "category": "Enterprise",
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
    "Extensions auto-update, so code you never reviewed can reach every installed user without re-consent.",
    "The three documented entry points are developer-account compromise, ownership transfer of an established extension, and remote configuration.",
    "A safe extension does not stay safe: trust is a property of a version, not of a listing.",
    "Version pinning plus re-review on update is the control that actually catches this; store reputation does not."
  ],
  "sections": [
    {
      "heading": "The trust decision expires the moment you make it",
      "id": "the-update-channel",
      "blocks": [
        {
          "type": "p",
          "text": "Most extension review happens once. Someone reads the permissions, maybe skims the privacy policy, checks the star rating, and approves the install. That decision is then treated as durable. It is not. The code running in your users' browsers today is not the code you reviewed — it is whatever the publisher shipped most recently, delivered through an update channel that requires no further consent from the user or the reviewer."
        },
        {
          "type": "p",
          "text": "This is what makes extensions a supply chain problem rather than a software selection problem. There are four distinct paths by which the code changes underneath an existing install: the publisher pushes an update, the publisher sells the extension to someone else, the publisher's Web Store account is taken over, or the publisher changes behavior server-side without shipping anything at all. Each has documented cases. Each requires a different control."
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "The core asymmetry",
          "text": "Install-time review evaluates a snapshot. The update channel delivers a stream. Any control that only fires at install time is inspecting the wrong thing."
        }
      ]
    },
    {
      "heading": "How Chrome updates extensions, and what the user is actually told",
      "id": "how-updates-work",
      "blocks": [
        {
          "type": "p",
          "text": "Chrome's extension update lifecycle documentation states that Chrome checks for extension updates on startup and every few hours. An update is only installed when the extension is considered idle — its service worker is not running, and any open extension page such as a side panel, popup, or options page prevents it from being considered idle. That can delay updates for constantly active extensions, but it does not prevent them. Users can force a check for all installed extensions from chrome://extensions with developer mode enabled. There is no per-update approval step in the default flow."
        },
        {
          "type": "p",
          "text": "There is one condition that can interrupt a silent update: a privilege increase. Chrome's permission warning guidelines state that when an extension \"adds a new permission that triggers a warning it may temporarily disable it,\" and that \"the extension will be re-enabled only after the user agrees to accept the new permission.\" Note Chrome's own hedge — may, not will. The mechanism is real, but neither its coverage nor its firing is guaranteed."
        },
        {
          "type": "p",
          "text": "A permission only interrupts the update if it produces a warning the user has not already accepted. Chrome's own documentation notes that some permissions produce no additional warning when paired with others — it states plainly that the \"tabs\" warning will not show if the extension also requests \"<all_urls>\". So an extension that already holds broad host access has substantial room to add capability without ever tripping the re-consent gate. And an update that changes only the JavaScript, adding exfiltration logic while touching no permission at all, triggers nothing. That is the shape of every incident below."
        },
        {
          "type": "p",
          "text": "Chrome Web Store review does apply to updates. Google states that all submissions go through the same review system regardless of the tenure of the developer or number of active users, that new items and updates are subject to the same review process, and that existing items are also reviewed periodically for compliance. Google documents that review completes within a few days for most extensions but can take up to a few weeks, and that it takes longer for cases including broad host permissions, sensitive execution permissions, and significant code changes. Review is a filter with a false negative rate, not a guarantee, and it operates on the publisher's timeline rather than yours."
        }
      ]
    },
    {
      "heading": "December 2024: phishing the developer, not the extension",
      "id": "december-2024-campaign",
      "blocks": [
        {
          "type": "p",
          "text": "The clearest documented case of developer account compromise at scale ran through December 2024. Sekoia's analysis describes a phishing campaign against Chrome extension developers beginning in mid-November 2024, with compromises of legitimate extensions from early December 2024 and campaign activity continuing until 30 December 2024. Sekoia also describes a tactical shift at the end of November 2024, from distributing the attacker's own malicious extensions through fake websites to hijacking legitimate ones."
        },
        {
          "type": "p",
          "text": "The lure was an impersonation of Chrome Web Store developer support. Sekoia documented sender addresses on attacker-registered lookalike domains — chromewebstore-noreply@chromeforextension[.]com and chromewebstore-noreply@supportchromestore[.]com — with subject lines claiming a developer program policy violation that required immediate action or the extension would be removed."
        },
        {
          "type": "p",
          "text": "The mechanism is the part worth internalizing. The link did not lead to a credential harvesting page. It led to an OAuth consent screen for a malicious application named \"Privacy Policy Extensions,\" which requested permission to see, edit, update, or publish the developer's Chrome Web Store items. A developer who clicked through granted the attacker publishing rights on their own listings."
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "MFA does not stop an OAuth grant",
          "text": "The victim authenticates normally, passes any second factor, and then authorizes a third-party app. The resulting token is a legitimate, post-authentication grant. Account-takeover controls tuned to detect anomalous logins will not see this, because there is no anomalous login."
        },
        {
          "type": "p",
          "text": "The best-documented victim is Cyberhaven, a data loss prevention vendor. Per TechCrunch's reporting, a malicious version 24.10.4 was published in the early morning of December 25, 2024, detected the afternoon of the same day, and replaced with a clean 24.10.5. Cyberhaven told customers it was possible for sensitive information, including authenticated sessions and cookies, to be exfiltrated to the attacker's domain. TechCrunch noted the extension's Web Store listing showed roughly 400,000 users at the time; Cyberhaven declined to say how many affected customers it had notified."
        },
        {
          "type": "p",
          "text": "The scope estimate moved as researchers looked harder. Sekoia's writeup described approximately a dozen compromised extensions potentially affecting hundreds of thousands of users. Reporting by The Hacker News on December 29, 2024 put the count at at least 35 extensions and over 2.6 million users. Treat both numbers as lower bounds on a campaign whose full extent was never established."
        },
        {
          "type": "p",
          "text": "The payload was configuration-driven. Sekoia documented two injected JavaScript files pulling configuration from attacker-controlled command and control servers, which allowed the same implant to be aimed at different targets across different compromised extensions. Observed targeting included API keys, session cookies, and authentication tokens from ChatGPT and Facebook for Business."
        },
        {
          "type": "p",
          "text": "Note what the victim organizations did wrong: nothing. Cyberhaven's users installed a security product from a real vendor with a real Web Store listing. The compromise happened one layer up, at the publishing account, and arrived through the mechanism the browser is designed to trust."
        }
      ]
    },
    {
      "heading": "Ownership transfer: the compromise you cannot detect by watching the publisher",
      "id": "ownership-transfer",
      "blocks": [
        {
          "type": "p",
          "text": "An extension is a transferable asset with an installed base attached. When it changes hands, every existing install carries forward — same extension ID, same granted permissions, same update channel — under new control. Chrome does not notify users that the party behind an installed extension has changed."
        },
        {
          "type": "p",
          "text": "The Great Suspender is the reference case. The Register reported in January 2021 that original developer Dean Oemcke sold the extension to an unidentified party in June 2020, with terms never disclosed. Versions 7.1.8 and 7.1.9 shipped through the Web Store without corresponding published changes in the project's repository, adding remote scripts and tracking code that presented itself as Open Web Analytics but was later found to be something else imitating it. Microsoft Edge blocked version 7.1.8, and the tracking code was removed in 7.1.9. In February 2021, as reported by 9to5Google, Google removed the extension from the Chrome Web Store for containing malware and took the additional step of proactively disabling it for users who had it installed — which closed suspended tabs and effectively lost them."
        },
        {
          "type": "p",
          "text": "The Register also flagged, correctly, that Chrome Web Store install statistics are easy to manipulate — worth remembering whenever a user-count figure is doing rhetorical work in a threat writeup, including this one."
        },
        {
          "type": "p",
          "text": "The pattern has continued. In March 2026, The Hacker News reported on QuickLens (approximately 7,000 users), which was transferred to a new owner on February 1, 2026 and shipped a malicious update on February 17, 2026 — a 16-day gap. Research by John Tuckner of Secure Annex found the updated version stripped security headers including X-Frame-Options from HTTP responses, executed code by way of a hidden 1x1 pixel image element, fingerprinted browser, OS and user country, and polled a command and control server every five minutes for JavaScript to execute. A second extension, ShotBird (approximately 800 users), was reported to display fake Chrome update prompts using ClickFix-style social engineering to induce users to run PowerShell that fetched an executable, and to hook page input fields to capture credentials, card details and tokens."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Why small extensions matter here",
          "text": "QuickLens had roughly 7,000 users and ShotBird roughly 800. Extensions in that range are cheap to acquire and fall below the attention threshold of most inventory reviews, while still holding whatever host permissions their original users granted. Install count is a poor proxy for blast radius when the permission grant is broad."
        }
      ]
    },
    {
      "heading": "Remote configuration: behavior change with no version bump",
      "id": "remote-configuration",
      "blocks": [
        {
          "type": "p",
          "text": "Manifest V3 removed the ability to load and execute remotely hosted code, which closes the crudest version of this problem. Chrome's guidance defines remotely hosted code as \"anything that is executed by the browser that is loaded from someplace other than the extension's own files,\" such as JavaScript and WASM, and is explicit that it \"does not include data or things like JSON or CSS.\""
        },
        {
          "type": "p",
          "text": "That line is the boundary, and it is a real one. The Chrome Web Store's Manifest V3 requirements explicitly permit \"fetching a remote configuration file for A/B testing or determining enabled features, where all logic for the functionality is contained within the extension package.\" This is a reasonable rule — feature flags are legitimate — but it means a published, reviewed, unchanged extension package can have its behavior materially altered by a server response."
        },
        {
          "type": "p",
          "text": "The practical consequence for defenders: a version number is not a behavior identifier. An extension can pass review with a benign default configuration and enable a different code path for a subset of users afterward, and the December 2024 implants demonstrate that configuration-fetching architecture in exactly this shape. Static analysis of the package tells you what the extension is capable of. It does not tell you what it is currently doing. Both matter, and only one of them is observable from the CRX."
        },
        {
          "type": "p",
          "text": "MV3 also does not eliminate the interpreter problem. The same policy page names \"building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data\" as disallowed — which is an acknowledgment that the code/data line is enforceable by policy but not by the platform."
        }
      ]
    },
    {
      "heading": "What Web Store ratings tell you about security posture",
      "id": "ratings-vs-risk",
      "blocks": [
        {
          "type": "p",
          "text": "A common informal control is to prefer highly rated extensions. We tested that against our own scan data. The following is drawn from 57 completed extension scans in ExtensionShield's production database as of July 28, 2026. This is a convenience sample — extensions submitted to our public scanner — not a random sample of the Chrome Web Store, and it should not be extrapolated to the store as a whole. 56 of the 57 carried a published Web Store star rating alongside an ExtensionShield security score; one listing had no published rating."
        },
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r between Web Store star rating and ExtensionShield security score (convenience sample, n=56 rated)"
            },
            {
              "value": "4.31",
              "label": "Mean Web Store star rating across the 57-scan convenience sample"
            },
            {
              "value": "76.6",
              "label": "Mean ExtensionShield security score (median 79, range 35-100)"
            },
            {
              "value": "24.6%",
              "label": "Share of the 57-scan convenience sample requesting <all_urls> host access"
            }
          ]
        },
        {
          "type": "p",
          "text": "A correlation of 0.11 is no detectable relationship — though with n = 56 the estimate is imprecise (95% CI roughly -0.16 to 0.36), so the honest reading is that these data show no usable signal, not that a relationship has been ruled out. Star ratings measure whether an extension does what users wanted; they carry essentially no signal about permission breadth or code-level risk in this sample. The distribution makes this concrete."
        },
        {
          "type": "table",
          "caption": "Security scores among the 29 extensions rated 4.5 stars or higher (convenience sample, n=57 total)",
          "columns": [
            "Highly rated extensions (4.5+ stars, n=29)",
            "Count"
          ],
          "rows": [
            [
              "Scored below 80",
              "15"
            ],
            [
              "Scored below 70",
              "9"
            ],
            [
              "Scored below 60",
              "4"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Risk levels across the full 57: 28 low, 21 medium, 3 high, 5 none. Permission prevalence is the more useful number for supply chain planning, because permissions define what a future malicious update inherits without needing to ask. All figures below are shares of the same 57-scan convenience sample."
        },
        {
          "type": "table",
          "caption": "Permission prevalence across the 57-scan convenience sample",
          "columns": [
            "Permission",
            "Share of sample",
            "Why it matters on a silent update"
          ],
          "rows": [
            [
              "storage",
              "86.0%",
              "Persists attacker-controlled configuration across browser restarts"
            ],
            [
              "scripting",
              "50.9%",
              "Injects code into page contexts at runtime"
            ],
            [
              "tabs",
              "40.4%",
              "Reads URLs and titles across all open tabs"
            ],
            [
              "activeTab",
              "29.8%",
              "Gesture-scoped; the narrowest of the injection permissions"
            ],
            [
              "alarms",
              "28.1%",
              "Schedules recurring background wake-ups, including polling"
            ],
            [
              "unlimitedStorage",
              "24.6%",
              "Removes the quota ceiling on locally staged data"
            ],
            [
              "offscreen",
              "21.1%",
              "Runs a hidden document with DOM access"
            ],
            [
              "webRequest",
              "21.1%",
              "Observes request and response metadata"
            ],
            [
              "contextMenus",
              "19.3%",
              "Adds entries to the page context menu"
            ],
            [
              "webNavigation",
              "19.3%",
              "Observes navigation events across tabs"
            ],
            [
              "cookies",
              "19.3%",
              "Reads session cookies for matching hosts"
            ],
            [
              "declarativeNetRequest",
              "17.5%",
              "Rewrites or blocks requests by rule"
            ],
            [
              "downloads",
              "12.3%",
              "Initiates and manages file downloads"
            ],
            [
              "management",
              "10.5%",
              "Enumerates and can disable other installed extensions"
            ],
            [
              "notifications",
              "10.5%",
              "Renders system-level notifications"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Broad host patterns appear 34 times across the sample: <all_urls> in 24.6%, https://*/* in 14.0%, http://*/* in 12.3%, and *://*/* in 8.8%. Because one extension can declare more than one of these patterns, 34 is an occurrence count rather than a count of distinct extensions — the share of extensions holding at least one broad host pattern is somewhere between 24.6% and the sum. Even the floor means roughly a quarter of the sample holds host access broad enough that a future update could reach any site the user visits without triggering a new permission warning."
        }
      ]
    },
    {
      "heading": "Defensive controls for enterprise fleets",
      "id": "defensive-controls",
      "blocks": [
        {
          "type": "p",
          "text": "Chrome's ExtensionSettings policy is the primary lever. The fields that matter for supply chain risk, per Google's Chrome Enterprise documentation:"
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "installation_mode — allowed, blocked, force_installed, normal_installed, or removed. Setting the default to blocked and allowlisting explicitly is the only configuration that gives you an inventory you control.",
            "update_url — specifies where Chrome should download an extension. For Chrome Web Store hosting this is https://clients2.google.com/service/update2/crx. Pointing it at self-hosted infrastructure is what gives you real control over the update artifact.",
            "minimum_version_required — Chrome disables extensions, including force-installed ones, with a version older than the specified minimum. Note the direction: this is a floor, not a pin.",
            "blocked_permissions — prevents users from installing and running extensions that request the listed API permissions. Google documents that if users previously installed such an extension, it will no longer load.",
            "runtime_blocked_hosts — prevents extensions from interacting with matching sites. Google documents a limit of 100 entries, with additional entries discarded. This is your control for keeping extensions off internal applications regardless of what host permissions they declare."
          ]
        },
        {
          "type": "code",
          "language": "json",
          "caption": "ExtensionSettings: deny-by-default with an explicit allowlist and a version floor",
          "code": "{\n  \"ExtensionSettings\": {\n    \"*\": {\n      \"installation_mode\": \"blocked\",\n      \"blocked_permissions\": [\"management\", \"debugger\", \"nativeMessaging\"],\n      \"runtime_blocked_hosts\": [\"*://*.internal.example.com\"]\n    },\n    \"abcdefghijklmnopabcdefghijklmnop\": {\n      \"installation_mode\": \"force_installed\",\n      \"update_url\": \"https://clients2.google.com/service/update2/crx\",\n      \"minimum_version_required\": \"3.4.1\"\n    }\n  }\n}"
        },
        {
          "type": "p",
          "text": "Version pinning — holding an extension at a known version rather than setting a floor — is configured through the Google Admin console under Devices > Chrome > Apps & extensions, for Users & browsers or Managed guest sessions. Google documents two constraints that shape how you use it. First, pinning is only available for apps and extensions that are force-installed, and is not available for extensions whose visibility is Unlisted, extensions set to private for Trusted Testers, or extensions that require payment to install. Second, Google's own warning: if you forget to unpin versions, apps and extensions can fall behind on critical security and compatibility updates. Pinning converts an availability risk into a patch-latency risk. It is the right trade for a small number of high-privilege extensions and the wrong default for a whole fleet."
        },
        {
          "type": "steps",
          "items": [
            {
              "title": "Establish an inventory with versions, not just names",
              "text": "An extension inventory without version numbers cannot detect the event you care about. Record extension ID, version, publisher, declared permissions, and host permissions per install."
            },
            {
              "title": "Alert on version change for high-privilege extensions",
              "text": "Scope this to extensions holding broad host permissions, scripting, cookies, webRequest, or management. In the sample above, at least a quarter of extensions qualify on host access alone — a tractable review queue, not everything."
            },
            {
              "title": "Define re-review triggers explicitly",
              "text": "Re-review on: any version change to a broad-host extension, any change in declared permissions, any change in publisher name or listing metadata, any change to the privacy policy URL, and any extension that goes quiet after a long update cadence and then suddenly ships."
            },
            {
              "title": "Treat publisher identity change as a security event",
              "text": "Ownership transfer is invisible to the browser. Listing metadata — developer name, support email, publisher domain — is the only signal available, and it must be diffed on a schedule rather than read once."
            },
            {
              "title": "Pin the few, monitor the many",
              "text": "Pin extensions where a bad update would be catastrophic and where you can commit to an unpin review cadence. For the rest, accept auto-update and invest in detecting the change quickly."
            },
            {
              "title": "Constrain blast radius with runtime_blocked_hosts",
              "text": "Assume some extension in the fleet will eventually be compromised. Blocking extension access to internal and high-value hosts limits what that compromise reaches, and it works regardless of which extension turns out to be the one."
            }
          ]
        }
      ]
    },
    {
      "heading": "What Chrome enterprise policy cannot do",
      "id": "policy-limits",
      "blocks": [
        {
          "type": "p",
          "text": "Being precise about the gaps is more useful than listing the features."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "It cannot notify you of ownership transfer. There is no policy signal for a change in who controls an extension. You must derive it from listing metadata yourself.",
            "It cannot detect a malicious update that adds no permissions. Policy operates on declared permissions and versions. A code-only change that abuses already-granted access is invisible to it.",
            "It cannot see remote configuration changes. If behavior is driven by a server response the extension is permitted to fetch, no policy field observes that.",
            "Version pinning is not free. It is available only for force-installed, listed, unpaid extensions, and Google warns it can leave you behind on critical security and compatibility updates.",
            "minimum_version_required sets a floor, not a ceiling. It will not prevent an upgrade into a compromised version.",
            "Web Store review is not your control. It runs on Google's schedule against Google's policy, applies to all submissions equally, and has a false negative rate you cannot measure."
          ]
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "The realistic posture",
          "text": "You cannot prevent a compromised update from reaching a fleet that auto-updates. You can reduce the number of extensions that would matter, reduce what each one can reach, and reduce the time between the update landing and someone looking at it. Detection latency is the variable you actually control."
        }
      ]
    },
    {
      "heading": "Where automated scanning fits",
      "id": "where-scanning-fits",
      "blocks": [
        {
          "type": "p",
          "text": "ExtensionShield scores extensions across three layers — Security, Privacy, and Governance — weighted near-equally at approximately 34 / 33 / 33. Hard gates override the weighted score to BLOCK for severe findings such as malware indicators or credential capture, so a strong score in two layers cannot mask a disqualifying finding in the third. The scoring methodology is published at /research/methodology and the core is open source."
        },
        {
          "type": "p",
          "text": "For pre-install review, /scan accepts a Chrome Web Store URL. For a pre-release audit of your own build before it reaches the store, /scan/upload accepts a private CRX or ZIP. Published case studies covering Honey and fake ad blockers are at /research/case-studies."
        },
        {
          "type": "p",
          "text": "The honest limitation, stated plainly: static analysis of a package evaluates that package. It does not observe remote configuration, it does not predict a future update, and a mid-range score reflects permission breadth rather than proven wrongdoing. Scanning is the input to a re-review trigger, not a substitute for having one."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "Cyberhaven says it was hacked to publish a malicious update to its Chrome extension",
      "publisher": "TechCrunch",
      "url": "https://techcrunch.com/2024/12/27/cyberhaven-says-it-was-hacked-to-publish-a-malicious-update-to-its-chrome-extension/",
      "date": "2024-12-27"
    },
    {
      "title": "Targeted supply chain attack against Chrome browser extensions",
      "publisher": "Sekoia.io",
      "url": "https://www.sekoia.com/blog/targeted-supply-chain-attack-against-chrome-browser-extensions"
    },
    {
      "title": "Dozens of Chrome Extensions Hacked, Exposing Millions of Users to Data Theft",
      "publisher": "The Hacker News",
      "url": "https://thehackernews.com/2024/12/16-chrome-extensions-hacked-exposing.html",
      "date": "2024-12-29"
    },
    {
      "title": "Chrome Extension Turns Malicious After Ownership Transfer, Enabling Code Injection and Data Theft",
      "publisher": "The Hacker News",
      "url": "https://thehackernews.com/2026/03/chrome-extension-turns-malicious-after.html",
      "date": "2026-03"
    },
    {
      "title": "What happens when a Chrome extension with 2m+ users changes hands, raises red flags, doesn't document updates? Let's find out",
      "publisher": "The Register",
      "url": "https://www.theregister.com/2021/01/07/great_suspender_malware/",
      "date": "2021-01-07"
    },
    {
      "title": "The Great Suspender extension has been removed from Chrome Web Store for containing malware",
      "publisher": "9to5Google",
      "url": "https://9to5google.com/2021/02/04/the-great-suspender-extension-has-been-removed-from-chrome-web-store-for-containing-malware/",
      "date": "2021-02-04"
    },
    {
      "title": "The Chrome Extension update lifecycle",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle"
    },
    {
      "title": "Permission warning guidelines",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings"
    },
    {
      "title": "Deal with remote hosted code violations",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code"
    },
    {
      "title": "Additional Requirements for Manifest V3",
      "publisher": "Chrome Web Store Program Policies",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements"
    },
    {
      "title": "Chrome Web Store review process",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/review-process"
    },
    {
      "title": "Configure ExtensionSettings policy",
      "publisher": "Google Chrome Enterprise and Education Help",
      "url": "https://support.google.com/chrome/a/answer/9867568?hl=en"
    },
    {
      "title": "Pin Chrome app or extension updates",
      "publisher": "Google Chrome Enterprise and Education Help",
      "url": "https://support.google.com/chrome/a/answer/11190170?hl=en"
    }
  ],
  "faq": [
    {
      "q": "Does Chrome ask users to approve an extension update?",
      "a": "No, not in the general case. Chrome checks for updates on startup and every few hours and installs them when the extension is idle. The only interruption is a privilege increase: Chrome's permission warning guidelines state that when an extension adds a new permission that triggers a warning it may temporarily disable it, and that the extension is re-enabled only after the user agrees to accept the new permission. An update that changes only code, or that adds a permission whose warning is already suppressed by an existing grant — the documentation gives the example of the tabs warning not showing when the extension also requests <all_urls> — installs silently."
    },
    {
      "q": "Can Chrome enterprise policy pin an extension to a specific version?",
      "a": "Yes, but with conditions. Version pinning is configured through the Google Admin console under Devices > Chrome > Apps & extensions and is only available for force-installed apps and extensions. Google documents that pinning is unavailable for extensions whose visibility is Unlisted, extensions set to private for Trusted Testers, and extensions that require payment. Note that the ExtensionSettings field minimum_version_required is a floor, not a pin — it disables versions older than the value and does nothing to stop an upgrade into a compromised release. Google also warns that forgetting to unpin can leave apps and extensions behind on critical security and compatibility updates."
    },
    {
      "q": "Did Manifest V3 solve the remote code problem?",
      "a": "It closed the direct path and left a documented carve-out. MV3 prohibits loading and executing remotely hosted code, which Chrome defines as anything the browser executes that is loaded from somewhere other than the extension's own files — JavaScript and WASM, but explicitly not data such as JSON or CSS. The Chrome Web Store's MV3 requirements permit fetching a remote configuration file for A/B testing or determining enabled features, as long as all logic for the functionality is contained in the extension package. So an unchanged, reviewed extension can still change behavior based on a server response."
    },
    {
      "q": "How did attackers publish updates to legitimate extensions in December 2024?",
      "a": "Sekoia documented a phishing campaign beginning in mid-November 2024 that impersonated Chrome Web Store developer support from lookalike domains, claiming a policy violation required urgent action. The link led to an OAuth consent screen for a malicious application named 'Privacy Policy Extensions' that requested permission to see, edit, update, or publish the developer's Web Store items. Because this is an OAuth authorization granted after successful authentication, multi-factor authentication on the developer's account does not prevent it."
    },
    {
      "q": "Is a high Chrome Web Store rating a useful security signal?",
      "a": "Not in our data. Across 57 completed scans in ExtensionShield's production database as of July 28, 2026, the Pearson correlation between Web Store star rating and ExtensionShield security score was r = 0.11 — essentially no relationship. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80, 9 below 70, and 4 below 60. This is a convenience sample of extensions submitted to our public scanner, not a random sample of the Chrome Web Store, and should not be generalized to the store as a whole."
    },
    {
      "q": "What is the single highest-value control for extension supply chain risk?",
      "a": "Maintaining a version-level inventory and alerting on version changes for extensions that hold broad host permissions. Prevention is largely unavailable — a fleet that auto-updates will receive a compromised update if one ships. What you control is how long it runs before someone looks at it. Pairing that with runtime_blocked_hosts, which Google documents as accepting up to 100 entries, to keep extensions off internal applications limits what any single compromise can reach."
    }
  ],
  "internalLinks": [
    {
      "label": "Chrome extension allowlist policy",
      "to": "/guides/chrome-extension-allowlist-policy"
    },
    {
      "label": "Extension governance",
      "to": "/extension-governance"
    },
    {
      "label": "Extension risk score",
      "to": "/extension-risk-score"
    },
    {
      "label": "Scan an extension",
      "to": "/scan"
    }
  ]
};
