/**
 * How to Audit a CRX or ZIP Chrome Extension Before Release
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "audit-crx-zip-before-release",
  "collection": "guide",
  "title": "How to Audit a CRX or ZIP Chrome Extension Before Release",
  "description": "A step-by-step pre-release audit for Chrome extensions: unpack a CRX, review the manifest, trace scripts, map network destinations, and pass Web Store review.",
  "category": "Developer",
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
    "Review the artifact you ship, not the source you wrote — bundlers inline dependencies and rewrite manifests.",
    "A CRX is a ZIP with a signed header, so it unpacks with standard tooling.",
    "Enumerate every external network destination in the built bundle; debug endpoints routinely survive into release builds.",
    "Check that your privacy disclosures match what the code actually does before review does it for you."
  ],
  "sections": [
    {
      "heading": "Why audit your own build",
      "id": "why-audit-your-own-build",
      "blocks": [
        {
          "type": "p",
          "text": "Most extension teams review source. Very few review the artifact they actually ship. Those are different things: a bundler inlines dependencies, a build plugin rewrites the manifest, a vendored library arrives three minor versions behind, and a debug endpoint survives into the release ZIP. The Chrome Web Store reviewer does not see your repository. They see the package."
        },
        {
          "type": "p",
          "text": "Reputation signals will not catch this for you. Across ExtensionShield's corpus of 57 completed scans, the Pearson correlation between an extension's Chrome Web Store star rating and its ExtensionShield security score is r = 0.11 — essentially no relationship. Of the 29 extensions in that corpus rated 4.5 stars or higher, 15 scored below 80 and 4 scored below 60. This is a convenience sample of extensions submitted to a public scanner, not a random sample of the Chrome Web Store, so treat it as directional rather than representative. The directional point holds regardless: user sentiment measures whether an extension works, not what it can reach."
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
              "label": "of the corpus declares <all_urls> host permission"
            },
            {
              "value": "15 of 29",
              "label": "extensions rated 4.5+ stars that scored below 80"
            }
          ]
        },
        {
          "type": "p",
          "text": "What follows is a manual audit you can run on any CRX or ZIP with tools already on your machine. On a small extension it is a short pass, and it surfaces the class of problem that gets builds rejected."
        }
      ]
    },
    {
      "heading": "What a CRX actually is, and how to unpack it",
      "id": "what-a-crx-is",
      "blocks": [
        {
          "type": "p",
          "text": "A CRX file is a ZIP archive with a signed header bolted to the front. The Chromium source defines the CRX3 layout in crx3.proto: four octets of magic number (\"Cr24\"), four octets giving the CRX format version, four octets giving the header length N — documented as little-endian — then N octets containing the binary encoding of a CrxFileHeader protobuf, then the ZIP archive as the remaining bytes. The header carries the signature proofs; everything you care about for an audit lives in the ZIP after it."
        },
        {
          "type": "p",
          "text": "That means unpacking is arithmetic, not reverse engineering. Read the length field, skip past the header, write out the rest. Both 32-bit fields are read as little-endian unsigned integers in practice."
        },
        {
          "type": "code",
          "language": "bash",
          "caption": "Verify the magic number and split the CRX into its ZIP payload",
          "code": "# Confirm this is really a CRX and read the format version\nxxd -l 16 build.crx\n# 00000000: 4372 3234 0300 0000 4000 0000 ...   -> \"Cr24\", version 3\n\n# CRX3 layout: \"Cr24\" | uint32 version | uint32 headerLen | header | ZIP\npython3 - <<'PY'\nimport struct\ndata = open('build.crx', 'rb').read()\nmagic, version, header_len = struct.unpack('<4sII', data[:12])\nassert magic == b'Cr24', 'not a CRX file'\nprint(f'crx format version {version}, header {header_len} bytes')\nopen('build.zip', 'wb').write(data[12 + header_len:])\nPY\n\nunzip -q build.zip -d ext/\nfind ext -type f | sort"
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "unzip often works directly, but exits non-zero",
          "text": "Because unzip locates the end-of-central-directory record by scanning from the end of the file, running it straight against a .crx frequently succeeds while printing a warning about extra bytes at the beginning of the zipfile and returning exit status 1. That is fine for a quick look and a problem in CI, where the non-zero exit will fail your pipeline. Stripping the header explicitly, as above, gives you a clean ZIP and a clean exit code."
        },
        {
          "type": "p",
          "text": "If you are auditing a ZIP you are about to upload rather than a CRX, skip straight to the unpacked directory. The rest of this process is identical — the CRX header contributes nothing to behavior."
        }
      ]
    },
    {
      "heading": "Read the manifest as a threat model",
      "id": "manifest-review",
      "blocks": [
        {
          "type": "p",
          "text": "The manifest is the extension's declared capability envelope. Read it before you read a line of JavaScript, because it tells you what the code is permitted to attempt. Here is a build that will not survive review, with every problem visible in the manifest alone:"
        },
        {
          "type": "code",
          "language": "json",
          "caption": "manifest.json — a plausible build with four review-blocking problems",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Invoice Helper\",\n  \"version\": \"2.4.1\",\n  \"description\": \"Extracts line items from invoices open in your browser.\",\n  \"permissions\": [\n    \"storage\",\n    \"scripting\",\n    \"tabs\",\n    \"cookies\",\n    \"webRequest\"\n  ],\n  \"host_permissions\": [\"<all_urls>\"],\n  \"background\": {\n    \"service_worker\": \"background.js\",\n    \"type\": \"module\"\n  },\n  \"content_scripts\": [\n    {\n      \"matches\": [\"<all_urls>\"],\n      \"js\": [\"vendor/jquery-3.4.1.min.js\", \"content/inject.js\"],\n      \"run_at\": \"document_idle\",\n      \"all_frames\": true\n    }\n  ],\n  \"web_accessible_resources\": [\n    {\n      \"resources\": [\"panel.html\", \"assets/*\"],\n      \"matches\": [\"*://*/*\"]\n    }\n  ],\n  \"content_security_policy\": {\n    \"extension_pages\": \"script-src 'self'; object-src 'self'\"\n  }\n}"
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "web_accessible_resources uses origin-only match patterns",
          "text": "The matches array inside a web_accessible_resources entry matches on origin only, so use patterns like \"*://*/*\" or \"https://billing.example.com/*\" rather than the <all_urls> token you would write in content_scripts. Each entry needs \"resources\" plus either \"matches\" or \"extension_ids\"; \"use_dynamic_url\" is optional."
        },
        {
          "type": "p",
          "text": "The description claims a narrow purpose — invoice line items — while the declaration grants read access to every page the user visits, cookies for every origin, and request interception. Chrome's quality guidelines state that \"an extension must have a single purpose that is narrow and easy to understand,\" and the review process documentation calls out broad host patterns — <all_urls>, https://*/* and *://*/* — along with sensitive permissions such as tabs, cookies, downloads and webRequest as things reviewers spend extra time verifying. A capability envelope this much wider than the stated purpose is a common self-inflicted rejection."
        },
        {
          "type": "p",
          "text": "Four concrete fixes are available here without changing what the extension does for its users. Narrow host_permissions to the invoicing domains the extension actually supports. Replace tabs with activeTab where the workflow is user-initiated — activeTab grants temporary access to the current tab after an explicit user gesture such as an action click, context menu item, keyboard command or omnibox suggestion, and Chrome's documentation notes it displays no warning message during installation, unlike <all_urls>. Drop cookies and webRequest unless a reviewer-facing justification exists. And restrict web_accessible_resources matches to the specific origins that need the panel, since Chrome makes no resource web accessible by default precisely to stop arbitrary sites from fingerprinting or probing your extension."
        },
        {
          "type": "table",
          "caption": "Permission prevalence across ExtensionShield's 57-scan corpus. Convenience sample of publicly submitted extensions — not a random sample of the Chrome Web Store.",
          "columns": [
            "Declaration",
            "Share of corpus",
            "Why it draws review attention"
          ],
          "rows": [
            [
              "storage",
              "86.0%",
              "Baseline; rarely an issue on its own"
            ],
            [
              "scripting",
              "50.9%",
              "Pairs with host permissions to define real injection reach"
            ],
            [
              "tabs",
              "40.4%",
              "Exposes URL and title of every tab; often replaceable with activeTab"
            ],
            [
              "activeTab",
              "29.8%",
              "Gesture-scoped; no install-time warning"
            ],
            [
              "<all_urls> (host)",
              "24.6%",
              "Broadest possible reach; documented as extended-scrutiny"
            ],
            [
              "webRequest",
              "21.1%",
              "Request observation; needs an explicit justification"
            ],
            [
              "cookies",
              "19.3%",
              "Reads session material across granted origins"
            ],
            [
              "management",
              "10.5%",
              "Enumerates and controls other installed extensions"
            ]
          ]
        }
      ]
    },
    {
      "heading": "Trace what actually executes",
      "id": "tracing-execution",
      "blocks": [
        {
          "type": "p",
          "text": "Now map the manifest's declarations onto real files. Two questions matter: what runs, and what is present but unreferenced. Orphaned files are where debug harnesses, old vendored copies and abandoned experiments hide."
        },
        {
          "type": "code",
          "language": "bash",
          "caption": "Inventory the executable surface and find files the manifest never references",
          "code": "# Everything that can execute, largest first\nfind ext -type f \\( -name '*.js' -o -name '*.mjs' -o -name '*.html' -o -name '*.wasm' \\) \\\n  -exec ls -l {} + | sort -k5 -nr | head -40\n\n# Files present in the bundle but not named anywhere in the manifest\n# (manifest.json itself will always appear here; ignore it)\ncomm -13 \\\n  <(jq -r '.. | strings | select(test(\"\\\\.(js|html|css|json|wasm)$\"))' ext/manifest.json | sort -u) \\\n  <(cd ext && find . -type f | sed 's|^\\./||' | sort -u)\n\n# The declared surface in one view\njq '{permissions, optional_permissions, host_permissions,\n     content_scripts: [.content_scripts[]? | {matches, js, all_frames}],\n     web_accessible_resources, externally_connectable,\n     content_security_policy}' ext/manifest.json"
        },
        {
          "type": "p",
          "text": "For the service worker, read background.js top to bottom and answer one question per listener: what triggers it, and what does it touch. Under Manifest V3 the script-src, object-src and worker-src directives of the extension_pages CSP are limited to 'self', 'none' and 'wasm-unsafe-eval' (plus localhost sources for unpacked extensions), and the policy cannot be relaxed beyond the enforced minimum. That forecloses the classic remote-script pattern at the platform level. It does not foreclose the code paths reviewers actually flag."
        },
        {
          "type": "code",
          "language": "bash",
          "caption": "Find dynamic execution and HTML injection sinks",
          "code": "grep -rn -E \"\\b(eval|new Function|importScripts)\\s*\\(\" ext/\ngrep -rn -E \"innerHTML|outerHTML|insertAdjacentHTML|document\\.write\" ext/\ngrep -rn -E \"chrome\\.(scripting|tabs)\\.(executeScript|insertCSS)\" ext/"
        },
        {
          "type": "p",
          "text": "For content scripts, note one asymmetry that is easy to get wrong. Chrome documents that a script running in an extension service worker or foreground tab can talk to remote servers outside its origin as long as the extension requests host permissions, while content scripts initiate requests on behalf of the web origin they were injected into and are therefore also subject to the same-origin policy — cross-origin requests are always treated as such in content scripts, even when the extension holds host permissions. If your content script appears to be fetching cross-origin directly, either the destination is returning permissive CORS headers, it is failing in production, or it is routing through the service worker — and you should know which."
        }
      ]
    },
    {
      "heading": "Enumerate every external network destination",
      "id": "network-destinations",
      "blocks": [
        {
          "type": "p",
          "text": "This step tends to surprise the team that wrote the extension. Build the complete list of hosts the bundle can reach, then justify each one out loud."
        },
        {
          "type": "code",
          "language": "bash",
          "caption": "Extract and rank every origin referenced in the bundle",
          "code": "# All absolute URLs in the bundle, collapsed to origin and counted\ngrep -rEoh '(https?|wss?)://[a-zA-Z0-9._~:/?#@!$&*+,;=%-]+' ext/ \\\n  | sed -E 's|^([a-z]+://[^/]+).*|\\1|' \\\n  | sort | uniq -c | sort -rn\n\n# Call sites that can move data off the machine\ngrep -rn -E \"\\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\\s*\\(\" ext/\n\n# Minified bundles hide URLs in concatenated strings; check those too\ngrep -rEoh '\"[a-z0-9.-]+\\.(com|net|io|dev|app|co)\"' ext/ | sort -u"
        },
        {
          "type": "p",
          "text": "Expect false positives — documentation URLs in license banners, schema identifiers, source-map comments. Work the list until every remaining origin falls into one of three buckets: your own backend, a third party you can name and have disclosed, or something that should not be there. Analytics SDKs that were added for a beta and never removed live in the third bucket. So do staging hostnames, which are both a review risk and an information leak about your infrastructure."
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "Remote code is a distinct rejection category",
          "text": "Chrome's Manifest V3 documentation states that all of an extension's logic must be part of the extension package and that remotely hosted files can no longer be loaded and executed under Web Store policy. Chrome defines remotely hosted code as anything executed by the browser that is loaded from somewhere other than the extension's own files — JavaScript and WASM — and explicitly excludes data such as JSON and CSS. Communicating with a remote server for data or configuration remains allowed. The line is execution: fetching JSON is fine; fetching something you then evaluate is not. Extensions rejected on this basis receive the violation code Blue Argon."
        }
      ]
    },
    {
      "heading": "Find bundled libraries with known vulnerabilities",
      "id": "bundled-libraries",
      "blocks": [
        {
          "type": "p",
          "text": "Every dependency you bundle ships in your package under your name. There is no CDN to patch out from under you and no runtime update path short of a new release. In the example manifest above, vendor/jquery-3.4.1.min.js is injected into every frame of every page. jQuery is affected by two cross-site scripting issues in DOM manipulation methods handling untrusted HTML: CVE-2020-11022 covers versions from 1.12.0 up to but not including 3.5.0, and CVE-2020-11023 covers versions from 1.0.3 up to but not including 3.5.0; 3.5.0 fixed both, and CVE-2020-11023 appears in CISA's Known Exploited Vulnerabilities catalog. An extension parsing invoice markup from arbitrary pages with a pre-3.5.0 jQuery is exactly the shape those CVEs describe."
        },
        {
          "type": "code",
          "language": "bash",
          "caption": "Identify vendored libraries and their versions from the shipped bytes",
          "code": "# Retire.js scans built files, not just package.json — the right tool here\nnpx retire --path ext\n\n# Version banners survive most minifiers\ngrep -rEoh '/\\*![^*]{0,160}v?[0-9]+\\.[0-9]+\\.[0-9]+' ext/ | sort -u\n\n# Filenames are a weaker but useful signal\nfind ext -type f -name '*.js' | grep -E '[.-]v?[0-9]+\\.[0-9]+\\.[0-9]+'"
        },
        {
          "type": "p",
          "text": "Scan the built directory rather than your lockfile. Retire.js exists specifically to identify library versions with known vulnerabilities that are not in package manifests but were simply downloaded and committed. The lockfile describes what you asked for; the bundle describes what shipped. Those diverge whenever a library is vendored by hand, pinned by a transitive dependency, or copied in from an older project."
        }
      ]
    },
    {
      "heading": "Check that disclosures match code behavior",
      "id": "disclosure-vs-behavior",
      "blocks": [
        {
          "type": "p",
          "text": "The Chrome Web Store developer dashboard requires a set of declarations in the privacy practices tab: a single-purpose description, a justification for each requested permission, a declaration of whether the extension executes remote code, and certification of which data types the extension collects. Chrome's guidance states that extensions which call remote code without declaring and justifying it in that field will be rejected. The Limited Use requirements go further: data may only be used to provide or improve the single purpose or user-facing features, and developers are never allowed to use or transfer user data to serve personalized, re-targeted or interest-based advertisements."
        },
        {
          "type": "p",
          "text": "Audit this as a diff, not as prose. Put your permission justifications in one column and the grep results from the previous two sections in the other. Any permission with no corresponding call site is a permission to delete. Any network destination with no corresponding disclosure is a disclosure to write — or a destination to remove. Any data type you certified you do not collect, but which appears in a request payload, is the discrepancy that maps to the prominent-disclosure code Purple Nickel or the other-requirements code Purple Magnesium."
        },
        {
          "type": "p",
          "text": "Two of the 57 extensions in the ExtensionShield corpus — again, a convenience sample of publicly submitted extensions rather than a random sample of the store — had no privacy policy captured in their Web Store metadata at all. Chrome's user data policy requires products handling user data to post a privacy policy in the developer dashboard and describe how data is collected, used and disclosed; missing it maps to the Purple Lithium violation code."
        }
      ]
    },
    {
      "heading": "What Web Store review commonly rejects",
      "id": "review-rejections",
      "blocks": [
        {
          "type": "p",
          "text": "Chrome publishes named violation codes, which is useful in practice: a rejection email names the specific policy you tripped. These are the ones a pre-release audit of the package can realistically prevent."
        },
        {
          "type": "table",
          "caption": "Selected Chrome Web Store violation codes that a package audit can catch before submission",
          "columns": [
            "Code",
            "Policy",
            "What to check in the bundle"
          ],
          "rows": [
            [
              "Blue Argon",
              "Additional requirements for Manifest V3 (remotely hosted code)",
              "No script fetched from a remote origin and executed; no CDN-loaded library"
            ],
            [
              "Purple Potassium",
              "Excessive permissions",
              "Every declared permission has a call site and a written justification"
            ],
            [
              "Red Titanium",
              "Obfuscation",
              "Minification only; no control-flow flattening or string-array encoding"
            ],
            [
              "Red Magnesium / Red Copper",
              "Single purpose",
              "Capability envelope matches the stated purpose, not the roadmap"
            ],
            [
              "Purple Lithium",
              "User data policy — disclosure",
              "Privacy policy posted; data collection declared in the dashboard"
            ],
            [
              "Purple Nickel",
              "User data policy — prominent disclosure",
              "Collection users would not expect is disclosed in-product, not only in the policy"
            ],
            [
              "Purple Copper",
              "User data policy — secure transmission",
              "No http:// endpoints carrying user data anywhere in the bundle"
            ],
            [
              "Purple Magnesium",
              "User data policy — other requirements",
              "No collection beyond what the declared purpose needs"
            ],
            [
              "Yellow Magnesium",
              "Functionality not working",
              "The uploaded build actually runs; no dead endpoints or broken flows"
            ]
          ]
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "Minification is allowed; obfuscation is not",
          "text": "Chrome's code readability policy states that developers must not obfuscate code or conceal functionality, while permitting removal of whitespace, newlines, code comments and block delimiters, shortening of variable and function names, and collapsing files together. The review process documentation adds that the more code an extension contains, the more work it takes to verify that code is safe. A smaller, source-shaped bundle reviews faster."
        },
        {
          "type": "p",
          "text": "Review times are not fixed. Chrome documents that for most extensions review completes within a few days, but that it can take up to a few weeks, and suggests contacting support if an extension is pending review for more than three weeks. New developers, new extensions, dangerous permissions and significant code changes all attract closer examination. Plan your release window accordingly rather than assuming a same-day turnaround."
        }
      ]
    },
    {
      "heading": "Pre-submission checklist",
      "id": "pre-submission-checklist",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {
              "title": "Audit the artifact, not the repo",
              "text": "Unpack the exact CRX or ZIP you are about to upload. Build reproducibly from a clean checkout so the package you audit is byte-identical to the package you submit."
            },
            {
              "title": "Diff the manifest against the last shipped release",
              "text": "Run jq -S on both and diff them. Every added permission, host pattern, content script match and web-accessible resource needs a reason you can state in one sentence."
            },
            {
              "title": "Justify every permission against a call site",
              "text": "Grep for the API each permission unlocks. Any permission with no matching call is dead weight and a Purple Potassium risk. Prefer activeTab over tabs for gesture-driven flows."
            },
            {
              "title": "Narrow host permissions and web-accessible resources",
              "text": "Replace <all_urls> with the specific origins you support. Restrict web_accessible_resources matches to the sites that need them, since no resource is web accessible by default for a reason."
            },
            {
              "title": "Enumerate and justify every origin in the bundle",
              "text": "Produce the full origin list, remove staging and leftover analytics hosts, and confirm no user data crosses an http:// endpoint."
            },
            {
              "title": "Confirm no remote code execution path",
              "text": "No eval, no new Function on remote input, no script element pointing at an external origin, and no library that fetches and evaluates code at runtime."
            },
            {
              "title": "Scan the built bundle for vulnerable dependencies",
              "text": "Run Retire.js against the unpacked directory with --path, not against package.json, and upgrade or drop anything with a known advisory."
            },
            {
              "title": "Reconcile disclosures with observed behavior",
              "text": "Line up the privacy practices declarations, the privacy policy and the actual network and storage behavior. Fix whichever side is wrong."
            },
            {
              "title": "Ship source-shaped code",
              "text": "Minify if you must; never obfuscate. Include source maps or an unminified build if your bundler output is hard to read."
            },
            {
              "title": "Install and exercise the packaged build",
              "text": "Load the unpacked build in a clean profile, run the core flow, and watch the network panel. Broken functionality in the submitted build is its own violation code."
            }
          ]
        }
      ]
    },
    {
      "heading": "Where automation fits",
      "id": "automation",
      "blocks": [
        {
          "type": "p",
          "text": "The manual pass above is worth running at least once per major release, because doing it yourself is how you learn what your bundle actually contains. It is also tedious, easy to skip under deadline, and dependent on the reviewer's memory for the long tail of policy detail. That is the part worth automating."
        },
        {
          "type": "p",
          "text": "ExtensionShield's /scan/upload accepts a private CRX or ZIP build and runs a pre-release audit without publishing anything to the store; /scan takes a Chrome Web Store URL when you want to look at something already listed. Scores are computed across three layers — Security, Privacy and Governance — weighted near-equally, with hard gates that override the weighted score to BLOCK for severe findings such as malware indicators or credential capture. The scoring methodology is published at /research/methodology, worked examples are at /research/case-studies, and the core is open source, so the checks themselves are inspectable."
        },
        {
          "type": "p",
          "text": "Neither the manual audit nor an automated one clears you with Chrome. The Web Store reviewer applies policies that change, and judgment that is not fully documented. What both give you is narrower than that: a package whose declared permissions and disclosures line up with what is actually in the code you are shipping. That is the condition the rejection codes above test for. It is not proof that the running extension behaves as declared — no static review of a package establishes that."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "crx3.proto — CRX3 file format definition",
      "publisher": "Chromium source",
      "url": "https://chromium.googlesource.com/chromium/src/+/main/components/crx_file/crx3.proto"
    },
    {
      "title": "Chrome Web Store review process",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/review-process"
    },
    {
      "title": "Code readability requirements",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/code-readability"
    },
    {
      "title": "Improve extension security (Manifest V3)",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/improve-security"
    },
    {
      "title": "Deal with remote hosted code violations",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code"
    },
    {
      "title": "Troubleshooting Chrome Web Store violations",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/troubleshooting"
    },
    {
      "title": "Protecting user privacy — privacy practices tab",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/cws-dashboard-privacy"
    },
    {
      "title": "Chrome Web Store user data FAQ and Limited Use requirements",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/user-data-faq"
    },
    {
      "title": "Quality guidelines — single purpose",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines"
    },
    {
      "title": "activeTab permission",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/activeTab"
    },
    {
      "title": "web_accessible_resources manifest key",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources"
    },
    {
      "title": "content_security_policy manifest key",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy"
    },
    {
      "title": "Cross-origin network requests in extensions",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/network-requests"
    },
    {
      "title": "Chrome Web Store Program Policies",
      "publisher": "Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies"
    },
    {
      "title": "Retire.js — scanner detecting JavaScript libraries with known vulnerabilities",
      "publisher": "RetireJS on GitHub",
      "url": "https://github.com/retirejs/retire.js/"
    },
    {
      "title": "CVE-2020-11022 — jQuery XSS in DOM manipulation methods (fixed in 3.5.0)",
      "publisher": "NIST National Vulnerability Database",
      "url": "https://nvd.nist.gov/vuln/detail/CVE-2020-11022",
      "date": "2020-04-29"
    },
    {
      "title": "CVE-2020-11023 — jQuery XSS via <option> elements (fixed in 3.5.0)",
      "publisher": "NIST National Vulnerability Database",
      "url": "https://nvd.nist.gov/vuln/detail/CVE-2020-11023",
      "date": "2020-04-29"
    }
  ],
  "faq": [
    {
      "q": "Is a CRX file just a renamed ZIP?",
      "a": "Not quite. A CRX3 file is a ZIP archive preceded by a signed header: the four-byte magic number \"Cr24\", a four-byte format version, a four-byte header length N documented as little-endian, and N bytes of protobuf-encoded header data. Skip 12 + N bytes and the remainder is a valid ZIP. Some ZIP tools will read a CRX directly because they scan backwards for the central directory, but they typically warn about the extra leading bytes and return a non-zero exit status."
    },
    {
      "q": "Can I still load a library from a CDN in Manifest V3?",
      "a": "No. Chrome's documentation states that all of an extension's logic must be part of the extension package and that remotely hosted files can no longer be loaded and executed under Web Store policy. Chrome defines remotely hosted code as anything the browser executes that is loaded from outside the extension's own files, which covers a CDN-hosted library. Calling a remote web service for data or configuration is still allowed — JSON and CSS are explicitly excluded from the definition. Rejections on this basis carry the violation code Blue Argon."
    },
    {
      "q": "Will minifying my extension get it rejected?",
      "a": "No. Chrome's code readability policy prohibits obfuscating code or concealing functionality, but permits removal of whitespace, newlines, code comments and block delimiters, shortening of variable and function names, and collapsing files together. Control-flow flattening and string-array encoding are a different matter and map to the Red Titanium violation code."
    },
    {
      "q": "How long does Chrome Web Store review take?",
      "a": "Chrome documents that for most extensions review is completed within a few days, though it can take up to a few weeks, and recommends contacting support if an extension is pending review for more than three weeks. New developers, new extensions, dangerous permissions, broad host patterns and significant code changes all lengthen review."
    },
    {
      "q": "Does a high star rating mean an extension is safe?",
      "a": "It is a weak signal at best. In ExtensionShield's corpus of 57 completed scans, the correlation between Web Store star rating and security score was r = 0.11, and 15 of the 29 extensions rated 4.5 stars or higher scored below 80. That corpus is a convenience sample of extensions submitted to a public scanner, not a random sample of the store, so the numbers describe that sample rather than the Chrome Web Store as a whole."
    },
    {
      "q": "Should I audit the source repository or the built package?",
      "a": "The built package, and ideally both. Bundlers inline dependencies, plugins rewrite the manifest, and vendored libraries can be several versions behind what your lockfile claims. The reviewer sees only the uploaded artifact, so that is the thing to grep."
    },
    {
      "q": "Can a content script fetch a cross-origin URL if my extension has host permissions?",
      "a": "No. Chrome documents that content scripts initiate requests on behalf of the web origin they were injected into and are therefore subject to the same-origin policy — cross-origin requests are always treated as such in content scripts, even when the extension holds host permissions. Route the request through the extension service worker, which can talk to remote servers outside its origin when host permissions are declared."
    }
  ],
  "internalLinks": [
    {
      "label": "Private CRX/ZIP audit",
      "to": "/scan/upload"
    },
    {
      "label": "Manifest V3 extension security",
      "to": "/guides/manifest-v3-extension-security"
    },
    {
      "label": "Chrome extension permissions explained",
      "to": "/chrome-extension-permissions"
    },
    {
      "label": "Scoring methodology",
      "to": "/research/methodology"
    }
  ]
};
