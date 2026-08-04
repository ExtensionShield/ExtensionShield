/**
 * Why Chrome Web Store Ratings Do Not Prove an Extension Is Safe
 *
 * Structured blocks — see components/article/ArticleBlocks.jsx for the
 * supported block types, and data/articles/index.js for the post shape.
 *
 * Every claim in `sources` was link-checked (HTTP 200) on 2026-07-28.
 * Corpus figures come from ExtensionShield's own scan database and are
 * always presented with n and the convenience-sample caveat.
 */

export default {
  "slug": "chrome-web-store-ratings-do-not-prove-extension-safety",
  "collection": "research",
  "title": "Why Chrome Web Store Ratings Do Not Prove an Extension Is Safe",
  "description": "Star rating and ExtensionShield security score correlate at r = 0.11 across 56 rated listings in a 57-extension convenience sample. The data, the method, and why they diverge.",
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
    "Across the 56 rated listings in a 57-scan corpus, Chrome Web Store star rating and ExtensionShield security score correlate at Pearson r = 0.11 — no usable relationship.",
    "Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80 and 4 scored below 60.",
    "The two measures answer different questions: a rating reports whether a feature worked; a security score reports what the code can reach.",
    "This is a convenience sample of 57 extensions submitted to a public scanner, not a random sample of the Chrome Web Store."
  ],
  "sections": [
    {
      "heading": "The finding",
      "id": "the-finding",
      "blocks": [
        {
          "type": "stat",
          "items": [
            {
              "value": "0.11",
              "label": "Pearson r between Web Store star rating and ExtensionShield security score"
            },
            {
              "value": "57",
              "label": "completed extension scans in the corpus (convenience sample)"
            },
            {
              "value": "4.31",
              "label": "mean star rating across the 56 rated listings"
            },
            {
              "value": "76.6",
              "label": "mean ExtensionShield security score"
            }
          ]
        },
        {
          "type": "p",
          "text": "We computed the Pearson correlation between the Chrome Web Store star rating and the ExtensionShield security score. Our scan corpus is 57 completed scans, but one listing carries no published rating, so the correlation is computed on the 56 listings that have both values: r = 0.11. The 95% confidence interval runs from -0.16 to 0.36 and the two-tailed p-value is 0.43, so the coefficient is not statistically distinguishable from zero. Squared, r accounts for about 1.1% of the variance in security score. In practical terms: within this sample, knowing an extension's star rating tells you essentially nothing about how it scores on permission breadth, data flow, and code behavior."
        },
        {
          "type": "p",
          "text": "That is a negative result, and negative results are easy to overstate. The rest of this post is mostly about the limits of the finding, because a claim this convenient to a security vendor deserves more scrutiny than a claim that cuts the other way."
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "What the number does and does not say",
          "text": "It says that within this convenience sample of 57 extensions, rating and score are unrelated. It does not say that low-rated extensions are safer, that high-rated extensions are dangerous, or that this ratio holds across the whole Chrome Web Store. Those are different claims and this data does not support them."
        }
      ]
    },
    {
      "heading": "Methodology",
      "id": "methodology",
      "blocks": [
        {
          "type": "p",
          "text": "How the number was produced, so a skeptical reader can decide how much weight it carries."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Sample: 57 completed extension scans held in the ExtensionShield production database as of 28 July 2026. This is a convenience sample, not a random draw.",
            "Rating source: the star rating published on the extension's Chrome Web Store listing, captured at scan time from listing metadata. We did not re-fetch or recompute ratings afterwards.",
            "Score source: the ExtensionShield security score produced by the same pipeline for every extension in the set, combining Security, Privacy, and Governance layers at approximately equal weight (roughly 34% / 33% / 33%). Methodology is published at /research/methodology.",
            "Statistic: Pearson product-moment correlation on the raw rating and raw score, no transformation, no outlier removal, no weighting by install count or by number of ratings. One of the 57 listings carries no published rating and is excluded, giving n = 56; including it as a zero would give r = 0.05, which is why it is excluded. Five of the rated listings carry fewer than five ratings; restricting to listings with at least ten ratings gives r = 0.11 (n = 49), and at least fifty gives r = 0.03 (n = 44). The conclusion is unchanged under every restriction.",
            "Distribution: mean rating 4.31 across the 56 rated listings, mean score 76.6 across all 57, median score 79, score range 35 to 100. Risk levels break down as 28 low, 21 medium, 3 high, and 5 rated 'none', the lowest-risk tier."
          ]
        },
        {
          "type": "callout",
          "variant": "warning",
          "title": "This is a convenience sample",
          "text": "These 57 extensions were submitted to the public scanner by whoever chose to submit them. That is not a random sample of the Chrome Web Store, and it is plausibly biased toward extensions someone already had a reason to look at. n = 57 is small. Nothing here should be extrapolated to the store as a whole, and a properly drawn random sample could produce a different coefficient."
        },
        {
          "type": "p",
          "text": "Three further caveats. First, one listing in the corpus has no published Web Store rating. Our database records an absent rating as 0, and an earlier version of this post included that 0 as if it were a real zero-star score, which pulled the coefficient down to r = 0.05. A null is not a rating, so it is excluded here and the correlation is reported on n = 56. The conclusion is unchanged — both figures are indistinguishable from zero — but the reported number should be reproducible from a clean pairing. Second, star rating is a bounded, heavily left-skewed variable — most listings cluster between 4 and 5 — and range restriction on one variable attenuates Pearson r, so some of the flatness is structural rather than substantive. Third, the security score is our own instrument; a correlation involving it measures our scoring choices as much as it measures the extensions. Together these argue for reading r = 0.11 as \"no usable signal in this sample\" rather than as a proof of independence."
        }
      ]
    },
    {
      "heading": "The 4.5-star band",
      "id": "the-4-5-star-band",
      "blocks": [
        {
          "type": "p",
          "text": "The aggregate correlation is abstract. The more useful cut is the top of the rating distribution, because that is the band users actually filter on. Twenty-nine of the 57 extensions carry a rating of 4.5 stars or higher."
        },
        {
          "type": "table",
          "caption": "Security score distribution within the 29 extensions rated 4.5 stars or higher, from a 57-extension convenience sample. Bands are nested: every extension below 60 is also counted below 70 and below 80.",
          "columns": [
            "Segment of the 4.5-star-or-higher band",
            "Count",
            "Share of that band"
          ],
          "rows": [
            [
              "Scored below 80",
              "15 of 29",
              "51.7%"
            ],
            [
              "Scored below 70",
              "9 of 29",
              "31.0%"
            ],
            [
              "Scored below 60",
              "4 of 29",
              "13.8%"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Slightly more than half of the top-rated extensions in this sample scored below 80. Roughly one in three scored below 70. These proportions describe 29 extensions that happened to be submitted to a public scanner; they are not an estimate of anything about the Chrome Web Store."
        },
        {
          "type": "p",
          "text": "We are not naming any of them, and that restraint is deliberate: a mid or low security score reflects permission breadth, data-flow exposure, and code patterns, not proven misconduct. An extension can score in the 60s because it legitimately needs broad host access to do its job. Publishing a name alongside a number that readers will interpret as an accusation would be both unfair and wrong."
        }
      ]
    },
    {
      "heading": "Why the two measures diverge",
      "id": "why-the-measures-diverge",
      "blocks": [
        {
          "type": "p",
          "text": "The correlation is near zero because the two numbers answer different questions. A star rating is a satisfaction measure produced by people evaluating whether a feature worked. A security score is a capability-and-behavior measure produced by reading a manifest and a bundle. There is no mechanism that would force them to agree."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "A rating answers: did the coupon apply, did the PDF convert, did the tab manager restore my session? It is observable to the user within seconds of installing.",
            "A security score answers: what can this code reach, what network destinations does the bundle reference, and what patterns does the packaged code contain? Almost none of that is observable to a user at any point. It does not answer what the code does at runtime — static analysis of a package cannot observe that, which is exactly why capability and conduct have to be reported separately.",
            "A rating is an aggregate over the extension's whole history, including versions no longer shipping. A permission set is a property of the build currently installed on the machine.",
            "Reviewers are self-selected users of the feature. Nobody reviews an extension because they read its service worker."
          ]
        },
        {
          "type": "p",
          "text": "Chrome's own permission model reinforces the gap. The permissions reference lists an install-time warning string for some capabilities and none for others. It gives \"Read your browsing history\" for both tabs and webNavigation, \"Manage your apps, extensions, and themes\" for management, \"Block content on any page\" for declarativeNetRequest, \"Manage your downloads\" for downloads, and \"Display notifications\" for notifications. It lists no warning text at all for storage, alarms, contextMenus, activeTab, unlimitedStorage, or offscreen."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Absence of a listed warning is not proof of no warning",
          "text": "The reference table is documentation, not the warning engine. The accurate reading is that the published table carries no warning string for those entries. What follows from it is narrow but real: a user's install-time impression is a partial view of the manifest, and their five-star review reflects the feature, not the manifest."
        },
        {
          "type": "code",
          "language": "json",
          "caption": "A manifest that a user would experience as \"it just works\" — the capability surface is largely invisible to the satisfaction signal.",
          "code": "{\n  \"manifest_version\": 3,\n  \"name\": \"Example Utility\",\n  \"version\": \"2.4.1\",\n  \"permissions\": [\n    \"storage\",\n    \"alarms\",\n    \"contextMenus\",\n    \"tabs\",\n    \"cookies\"\n  ],\n  \"host_permissions\": [\n    \"<all_urls>\"\n  ],\n  \"background\": {\n    \"service_worker\": \"service-worker.js\"\n  }\n}"
        }
      ]
    },
    {
      "heading": "What the permission data shows",
      "id": "permission-prevalence",
      "blocks": [
        {
          "type": "p",
          "text": "The same 57 extensions give a view of what capability surface looked like in this set. Again: convenience sample, n = 57, not generalizable to the store."
        },
        {
          "type": "table",
          "caption": "Permission prevalence across the 57-extension convenience sample.",
          "columns": [
            "Permission",
            "Share of the 57 scanned extensions"
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
          "type": "table",
          "caption": "Broad host-permission patterns across the same 57-extension convenience sample; 34 broad-host occurrences in total, since one extension can declare more than one pattern.",
          "columns": [
            "Host pattern",
            "Share of the 57 scanned extensions"
          ],
          "rows": [
            [
              "<all_urls>",
              "24.6%"
            ],
            [
              "https://*/*",
              "14.0%"
            ],
            [
              "http://*/*",
              "12.3%"
            ],
            [
              "*://*/*",
              "8.8%"
            ]
          ]
        },
        {
          "type": "p",
          "text": "Roughly a quarter of the corpus requests <all_urls>. Chrome's \"Declare permissions\" documentation is explicit about what host permissions gate: making fetch() requests from the service worker and extension pages, reading and querying the sensitive tab properties (url, title, and favIconUrl), injecting a content script programmatically, monitoring and controlling network requests with chrome.webRequest, accessing cookies with chrome.cookies, and redirecting or modifying requests and response headers with chrome.declarativeNetRequest."
        },
        {
          "type": "p",
          "text": "An extension holding broad host permissions plus scripting has, by construction, the ability to read and modify page content on every site in scope. Whether it does so is a code-behavior question, not a permission question — which is exactly why permission breadth alone is a risk input rather than a verdict."
        },
        {
          "type": "callout",
          "variant": "key",
          "title": "Broad host access is not a malware tell",
          "text": "Hsu, Tran, and Fass found the opposite of the naive assumption. In their Chrome Web Store dataset, all-encompassing URLs such as <all_urls> and http://*/* ranked highly among benign and vulnerable extensions but not among malware-containing or policy-violating ones, which instead concentrated on long lists of Google sub-domains. Their proposed explanation is that requesting powerful privileges triggers in-depth review, which developers with malicious intent may prefer to avoid. Permission breadth is a cost-of-capability signal, not an intent signal."
        }
      ]
    },
    {
      "heading": "Ratings lag behavior, and they survive changes of hands",
      "id": "ratings-lag-behavior",
      "blocks": [
        {
          "type": "p",
          "text": "There is a structural reason a rating cannot function as a safety signal: the rating is attached to the listing, and the listing outlives the code and sometimes the owner."
        },
        {
          "type": "p",
          "text": "The Great Suspender is the canonical documented case. The original developer, Dean Oemcke, sold the extension in June 2020 to an unknown entity. Two subsequent versions, 7.1.8 and 7.1.9, added features The Hacker News described as able to execute arbitrary code from a remote server, track users online, and commit advertising fraud. In February 2021 Google removed the extension from the Web Store and took the unusual step of deactivating it on users' machines, showing the notice \"This extension contains malware.\" It had more than two million installs at that point, accumulated over years of legitimate operation."
        },
        {
          "type": "p",
          "text": "The pattern recurs. In March 2026 The Hacker News reported two extensions that changed ownership and were then updated with malicious functionality: QuickLens (roughly 7,000 users) and ShotBird (roughly 800 users), analysed by John Tuckner of Secure Annex. QuickLens transferred to a new owner account on 1 February 2026, and a 17 February 2026 update kept the original functionality while adding code to strip security headers such as X-Frame-Options from every HTTP response, fingerprint the browser and operating system, and poll an external server every five minutes for JavaScript that was stored in local storage and executed on every page load. ShotBird's update displayed fake Chrome update prompts and captured data from input, textarea, and select elements."
        },
        {
          "type": "p",
          "text": "Tuckner's note on detection is the part worth keeping: the malicious code never appears in the extension's source files, because the payloads are delivered from the command-and-control server and stored in local storage, existing only at runtime. That remote-execution behavior is precisely what Manifest V3's remotely-hosted-code restriction is meant to prevent — Chrome's migration guidance states that under Manifest V3 extensions need to bundle all code they are using inside the extension itself, with data files such as JSON and CSS excluded from the restriction. Policy is not enforcement, and a store rating accumulated before the update reflects none of it."
        },
        {
          "type": "p",
          "text": "Misaligned incentives do not require malware either. Snopes reported in December 2024 that it independently confirmed, across several tests, that using the Honey extension changed the affiliate cookie to a value indicating that Honey's parent company, PayPal, would receive the commission. From the user's seat the coupon feature worked, which is what a rating measures. ExtensionShield's own write-ups of Honey and fake ad blockers are published at /research/case-studies."
        }
      ]
    },
    {
      "heading": "Independent research points the same way",
      "id": "independent-research",
      "blocks": [
        {
          "type": "p",
          "text": "Our n = 57 is far too small to stand alone. A much larger academic study reached a compatible conclusion. Hsu, Tran, and Fass analysed the Chrome Web Store using historical ChromeStats data, covering metadata for 226,762 benign extensions and over 26,000 security-noteworthy ones, and reported that users do not rate security-noteworthy extensions — those containing malware, violating data policy, or carrying known vulnerabilities — lower than benign ones."
        },
        {
          "type": "p",
          "text": "Their numbers are specific. A large share of extensions have no rating at all: 58.63% of policy-violating extensions, 52.12% for malware, 47.32% for vulnerable, and 31.52% for benign. Among those that do carry a rating, they observed no meaningful separation between the groups — the benign and policy-violating sets have a median of 5, malware 4.997, and vulnerable 4.571. Their takeaway is blunt: \"Users do not give SNE lower ratings.\""
        },
        {
          "type": "p",
          "text": "The exposure is not marginal. The same paper reports that over 346 million users installed at least one security-noteworthy extension in the three years studied, and that such extensions persist in the store for an average of 380 days for malware-containing entries up to 1,248 days for vulnerable ones. Their outlier cases make the durability concrete: an extension named \"TeleApp\", last updated in December 2013, was found to contain malware in June 2022 after 3,105 days listed."
        },
        {
          "type": "p",
          "text": "Google's own documentation supports the same reading from the other direction. The Chrome Web Store help pages state plainly that \"Google doesn't verify the authenticity of reviews and ratings,\" while noting that reviews violating its terms of service will be removed and that users can report reviews from the item listing page. The program policies separately address manipulation under Spam and Abuse: \"Developers must not attempt to manipulate the placement of any extensions in the Chrome Web Store. This includes, but is not limited to, inflating product ratings, reviews, or install counts by illegitimate means, such as fraudulent or incentivized downloads, reviews and ratings.\" A metric whose authenticity is not verified upfront, and which needs an anti-manipulation policy to defend it, is not a metric to build an install decision on."
        },
        {
          "type": "callout",
          "variant": "note",
          "title": "Store review does cover updates",
          "text": "A common claim in vendor writing is that Chrome reviews extensions only at first submission. That is not what Google documents. The review process page states that all item submissions — whether for a new item or an update to an existing one — are subject to the same review process, and that published items are also re-reviewed periodically. Review is a real and recurring control. The QuickLens and Great Suspender cases show it is not a guarantee, and in neither case did the accumulated star rating register the change."
        }
      ]
    },
    {
      "heading": "What ratings are genuinely good for",
      "id": "what-ratings-are-good-for",
      "blocks": [
        {
          "type": "p",
          "text": "Ratings are not worthless. They are a good instrument for the thing they measure, and the failure mode is asking them to measure something else."
        },
        {
          "type": "list",
          "ordered": false,
          "items": [
            "Functional reliability: whether the advertised feature works today, on current Chrome, for a lot of people.",
            "Maintenance signal: a rating that has fallen sharply in recent written reviews often indicates a regression, an abandoned extension, or a change users noticed and disliked.",
            "Support quality: reviews frequently capture whether the developer answers issues, which is at least an indication that the extension is actively maintained.",
            "Monetization changes: users are quick to write reviews when a free tool starts injecting ads, gating features, or prompting for an account. That is behaviorally relevant even though it is not a security measurement.",
            "Volume as a weak prior: a rating derived from a handful of reviews carries less information than one derived from thousands, and a listing with no ratings at all tells you nothing either way — which, per Hsu et al., describes 31.52% of benign extensions and 52.12% of malware-containing ones."
          ]
        },
        {
          "type": "p",
          "text": "Read the recent written reviews rather than the aggregate star value. The text sometimes contains behavioral observations — new redirects, unexpected tabs, an ownership change — that the numeric average smooths away entirely."
        }
      ]
    },
    {
      "heading": "A pre-install check that does not depend on stars",
      "id": "pre-install-checks",
      "blocks": [
        {
          "type": "steps",
          "items": [
            {
              "title": "Read the manifest before the listing",
              "text": "Look at the permission set and the host permissions. Ask whether the requested breadth is the minimum required for the described feature. Broad host access plus scripting means the extension can read and modify content on every site in scope."
            },
            {
              "title": "Establish where data goes",
              "text": "Identify the network endpoints the extension contacts, and whether a privacy policy exists and matches observed behavior. Host permissions gate fetch() from the service worker, so the declared host list bounds where data can be sent directly."
            },
            {
              "title": "Check for remote code execution paths",
              "text": "Manifest V3 requires extensions to bundle all code they use inside the extension itself. Any mechanism that fetches and evaluates code from a server is both a policy violation and, per Tuckner's analysis of QuickLens, the mechanism that keeps the malicious logic out of the source files entirely."
            },
            {
              "title": "Re-check after updates, not just at install",
              "text": "The install-time decision does not cover future versions. Ownership can change, and the rating carries over unchanged."
            },
            {
              "title": "Score it, then decide",
              "text": "ExtensionShield scans a Chrome Web Store URL at /scan for a pre-install check, and a private CRX or ZIP at /scan/upload for a pre-release audit. Scores combine Security, Privacy, and Governance at roughly equal weight, with hard gates that override the weighted score to BLOCK for severe findings such as malware indicators or credential capture. The scoring methodology is published at /research/methodology and the core is open source."
            }
          ]
        },
        {
          "type": "p",
          "text": "None of this makes a rating a bad number. It makes it the wrong number. Star ratings measure whether software did what it said. Security review measures what software can reach and what it does with the reach. In a convenience sample of 57 those two measures moved independently, and there is no mechanism by which they should have moved together."
        }
      ]
    }
  ],
  "sources": [
    {
      "title": "What is in the Chrome Web Store? Investigating Security-Noteworthy Browser Extensions",
      "publisher": "Sheryl Hsu, Manda Tran, Aurore Fass — arXiv / ACM ASIA CCS '24",
      "url": "https://arxiv.org/abs/2406.12710",
      "date": "2024-06-18"
    },
    {
      "title": "Chrome Web Store Curation and Reviews",
      "publisher": "Google — Chrome Web Store Help",
      "url": "https://support.google.com/chrome_webstore/answer/12225786"
    },
    {
      "title": "Chrome Web Store Program Policies",
      "publisher": "Google — Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/program-policies/policies"
    },
    {
      "title": "Chrome Web Store review process",
      "publisher": "Google — Chrome for Developers",
      "url": "https://developer.chrome.com/docs/webstore/review-process"
    },
    {
      "title": "Declare permissions",
      "publisher": "Google — Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions"
    },
    {
      "title": "Permissions reference list",
      "publisher": "Google — Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/reference/permissions-list"
    },
    {
      "title": "Deal with remote hosted code violations",
      "publisher": "Google — Chrome for Developers",
      "url": "https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code"
    },
    {
      "title": "WARNING — Hugely Popular 'The Great Suspender' Chrome Extension Contains Malware",
      "publisher": "The Hacker News",
      "url": "https://thehackernews.com/2021/02/warning-hugely-popular-great-suspender.html",
      "date": "2021-02-06"
    },
    {
      "title": "The Great Suspender extension has been removed from Chrome Web Store for containing malware",
      "publisher": "9to5Google",
      "url": "https://9to5google.com/2021/02/04/the-great-suspender-extension-has-been-removed-from-chrome-web-store-for-containing-malware/",
      "date": "2021-02-04"
    },
    {
      "title": "Chrome Extension Turns Malicious After Ownership Transfer, Enabling Code Injection and Data Theft",
      "publisher": "The Hacker News",
      "url": "https://thehackernews.com/2026/03/chrome-extension-turns-malicious-after.html",
      "date": "2026-03-09"
    },
    {
      "title": "Video Accuses Honey Browser Extension of Shady Business Practices and We Found Some Truth to It",
      "publisher": "Snopes",
      "url": "https://www.snopes.com/news/2024/12/30/honey-browser-extension-scam/",
      "date": "2024-12-30"
    }
  ],
  "faq": [
    {
      "q": "Does a 4.9-star rating mean an extension is safe?",
      "a": "No. In ExtensionShield's convenience sample of 57 scanned extensions, star rating and security score correlate at r = 0.11, which is not distinguishable from zero. Of the 29 extensions rated 4.5 stars or higher, 15 scored below 80 and 9 scored below 70. Independent academic work by Hsu, Tran, and Fass reached a compatible conclusion at much larger scale: across the Chrome Web Store, the median rating was 5 for benign extensions and 4.997 for malware-containing ones."
    },
    {
      "q": "Why would rating and security score be unrelated?",
      "a": "They measure different things. A rating records whether the advertised feature worked for a user, which is observable within seconds of installing. A security score records permission breadth, data-flow exposure, and code behavior, almost none of which is visible to a user at any point. There is no mechanism that would force the two to agree."
    },
    {
      "q": "How reliable is a correlation computed on 57 extensions?",
      "a": "Limited, and the post says so explicitly. The 95% confidence interval on r = 0.11 runs from -0.16 to 0.36. The sample is a convenience sample of extensions submitted to a public scanner, not a random draw from the Chrome Web Store, and star ratings are heavily left-skewed, which attenuates Pearson r. Treat it as 'no usable signal in this sample', not as proof of independence."
    },
    {
      "q": "Are ratings useful for anything security-adjacent?",
      "a": "The written reviews are more useful than the aggregate. Recent review text sometimes surfaces behavioral changes users noticed — new redirects, injected ads, an ownership change, a free tool suddenly requiring an account. The numeric average smooths all of that away. Ratings are a good instrument for functional reliability and maintenance quality; they are the wrong instrument for capability and data-flow risk."
    },
    {
      "q": "Can an extension become malicious after I install it based on a good rating?",
      "a": "Yes, and this is documented. The Great Suspender was sold in June 2020 and removed by Google in February 2021, with Chrome deactivating it on users' machines under the notice 'This extension contains malware', after more than two million installs. In March 2026, The Hacker News reported QuickLens and ShotBird, two extensions that changed ownership and were then updated with header-stripping, fingerprinting, and credential-capture functionality. The listing's accumulated rating carries over unchanged through such transitions."
    },
    {
      "q": "Doesn't Google review every extension update?",
      "a": "Yes. Google's review process documentation states that all item submissions, whether a new item or an update to an existing one, are subject to the same review process, and that published items are re-reviewed periodically. Review is a genuine recurring control, not a one-time gate. It is also not a guarantee: in the QuickLens case the malicious code never appeared in the extension's source files, because payloads were fetched from a remote server at runtime and stored in local storage."
    }
  ],
  "internalLinks": [
    {
      "label": "Scoring methodology",
      "to": "/research/methodology"
    },
    {
      "label": "Extension risk score",
      "to": "/extension-risk-score"
    },
    {
      "label": "Scan an extension",
      "to": "/scan"
    },
    {
      "label": "Reference guides",
      "to": "/guides"
    }
  ]
};
