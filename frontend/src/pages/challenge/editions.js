/**
 * Challenge editions — single source of truth.
 *
 * The /challenge hub lists these as cards; each edition renders its full brief
 * at /challenge/<slug> via ChallengeEditionPage. To add a future edition:
 *   1. add an object here,
 *   2. add a static route `/challenge/<slug>` in routes.jsx,
 *   3. (optional) mark older editions status: "Closed".
 *
 * Slugs are host+year (the durable differentiator) — the challenge name repeats
 * across editions, so it must not be the slug.
 */

export const CHROME_STORE_URL =
  "https://chromewebstore.google.com/detail/extension-shield/lgfembekgpcfapeemgalpeefnlikpobd";

export const EDITIONS = [
  {
    slug: "nexus-spring-2026",
    edition: "Edition 2",
    title: "Threat Report Challenge",
    host: "Nexus Spring of Code · Hackathon 2.0",
    status: "Active",
    statusVariant: "active",
    summary:
      "Choose real Chrome Web Store extensions, investigate the evidence, and turn what you find into a fair, evidence-backed threat report.",
    // Fill in when confirmed — left blank so no placeholder date is published.
    schedule: { startDate: "", endDate: "" },
    seo: {
      title: "Threat Report Challenge — Nexus Spring of Code (Hackathon 2.0) | ExtensionShield",
      description:
        "The ExtensionShield Threat Report Challenge at Nexus Spring of Code (Hackathon 2.0): investigate real Chrome extensions, classify risk on the evidence, and submit an evidence-backed report. Free to scan, no coding required.",
    },
    content: {
      eyebrow: "Nexus Spring of Code · Hackathon 2.0",
      heading: "Investigate risky browser extensions",
      lead:
        "Browser extensions can be genuinely useful — but some may be able to read the pages you visit, change what you see, or reach data tied to your accounts, depending on the permissions they request and how they behave. In this challenge you'll learn to read those signals, tell evidence from assumption, and document real risks in a clear, fair report.",
      research: [
        { label: "How we score extensions", path: "/research/methodology" },
        { label: "Real-world case studies", path: "/research/case-studies" },
        { label: "Permissions explained", path: "/chrome-extension-permissions" },
      ],
      challengeIntro:
        "Choose real Chrome Web Store extensions, investigate the evidence, and turn what you find into a fair, clear, actionable threat report. ExtensionShield is the free research tool you'll use to scan extensions, inspect permissions, and document your findings.",
      playbookHeading: "Make the report useful, fair, and hard to ignore.",
      playbookIntro:
        "The strongest reports explain both what the evidence shows and what it does not. Risk is not a guess — support every recommendation with verifiable facts.",
      howItStarts: [
        { n: "01", title: "Scan", color: "#e07b2e", icon: "search", text: "Scan extensions you use, or paste any Chrome Web Store URL. No account needed to scan." },
        { n: "02", title: "Investigate", color: "#1f9d57", icon: "eye", text: "Review permissions, privacy signals, developer details, reviews, and observable evidence." },
        { n: "03", title: "Report", color: "#2f6fd0", icon: "doc", text: "Classify the risk and make a proportional recommendation you can defend." },
      ],
      mission: [
        { n: 1, title: "Choose", text: "Pick 5–10 Chrome Web Store extensions. Popular or previously scanned ones are allowed." },
        { n: 2, title: "Scan", text: "Scan each with ExtensionShield — in the extension as you browse, or via the web scanner." },
        { n: 3, title: "Inspect", text: "Review permissions, privacy policy, developer, reviews, and observable evidence." },
        { n: 4, title: "Classify", text: "Assign a risk level based on the evidence you gathered." },
        { n: 5, title: "Save & submit", text: "Sign in to save your work, export your report, and submit your official entry." },
      ],
      risks: [
        { level: "Low", rec: "Allow", variant: "low", text: "Limited access and clear privacy signals." },
        { level: "Medium", rec: "Review", variant: "medium", text: "Broader access or unresolved questions." },
        { level: "High", rec: "Block", variant: "high", text: "Sensitive access or material trust gaps." },
        { level: "Critical", rec: "Report", variant: "critical", text: "Strong, documented evidence of harmful behavior." },
      ],
      riskNote:
        "Risk reflects your evidence-based judgment. A scan signals concerns to investigate — it does not by itself prove an extension is malicious.",
      judges: [
        { title: "Accuracy", icon: "target", text: "Factually correct and proportionate." },
        { title: "Evidence", icon: "image", text: "Screenshots, permissions, logs, sources." },
        { title: "Analysis", icon: "bulb", text: "Why the signal matters." },
        { title: "Recommendation", icon: "flag", text: "A practical next step." },
        { title: "Presentation", icon: "list", text: "Clear, structured, easy to follow." },
      ],
      extensionHeading: "Scan as you browse",
      extensionLead:
        "The ExtensionShield Chrome extension gives you quicker access to scan extensions you already use and investigate Chrome Web Store listings while you browse.",
      features: [
        { title: "Scan installed extensions", icon: "cursor", text: "Review extensions already in your browser." },
        { title: "Save to your workspace", icon: "bookmark", text: "Keep the extensions you want to investigate in one place." },
        { title: "Finish your report online", icon: "download", text: "Use your saved work when preparing your final report." },
      ],
      enter: {
        intro:
          "Scanning is free and needs no account. To submit an official entry you'll sign in — it's how we keep the challenge fair for everyone.",
        points: [
          { icon: "bookmark", title: "Save your work to your workspace", text: "Sign in to save the extensions you want to review and keep your challenge work organized." },
          { icon: "download", title: "One-click PDF report", text: "Export your saved scans as a ready-to-submit PDF report — no rebuilding your findings by hand." },
          { icon: "usercheck", title: "Official entries are account-linked", text: "Sign in to save, export, and submit an official report. Your account links the entry to its author and helps keep judging fair." },
        ],
        submit: "When your report is ready, export the PDF and attach it to the challenge submission sheet.",
        // Add the Google Form / submission sheet link here to show a submit button.
        submitUrl: "",
      },
      integrity: [
        "Same extension, your own work. You may analyze the same extension as another participant. When possible, choose an extension not yet covered in ExtensionShield to help expand community coverage.",
        "Your saved report, written analysis, screenshots, and recommendation must be your own. Signing in links your official entry to your account, helping keep judging fair.",
      ],
      prizeTitle: "Cash prizes & opportunities",
      // When tiers/amounts are finalized, e.g. ["1st — ₹25,000", "2nd — ₹15,000", "3rd — ₹10,000"]. Empty hides the chips.
      prizeTiers: [],
      prizes: [
        "The top three eligible reports receive cash prizes. Prize amounts and distribution are administered through Nexus Spring of Code.",
        "Strong participants may also be invited to discuss a separate, paid part-time role with ExtensionShield — subject to availability and a separate selection process.",
      ],
      beforeSubmit:
        "Write what you observed. Attach your evidence. Explain why it matters. Then make the most responsible recommendation the facts support.",
      // Fill these in before publishing. Blank fields render as "To be announced".
      details: {
        extensions: "Choose 5–10 Chrome Web Store extensions.",
        deadline: "",
        eligibility: "Anyone",
        submit: "",
      },
    },
  },
];

export const getEdition = (slug) => EDITIONS.find((e) => e.slug === slug);
