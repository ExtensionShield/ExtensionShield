/**
 * Careers: open roles and full job descriptions for /careers and /careers/apply.
 */

export const CAREERS_APPLY_EMAIL = "careers@extensionshield.com";

export const careersRoles = [
  {
    id: "qa-engineer-security",
    title: "QA Engineer (Security)",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    summary: "Design and run security-focused test plans for our extension scanner and API. You'll help ensure our risk scoring and detection pipelines behave correctly under edge cases and adversarial inputs.",
    responsibilities: [
      "Design and execute security-focused test plans for the extension scanner and API.",
      "Create and maintain automated test suites (e.g. Playwright, pytest) for critical scan and scoring flows.",
      "Identify edge cases and adversarial inputs that could affect risk scoring or detection.",
      "Document and triage bugs; work with engineering to prioritize fixes.",
      "Contribute to CI/CD pipelines for regression and security regression tests.",
      "Review and validate new scoring or detection changes before release.",
      "Collaborate with backend and frontend engineers on testability and quality gates.",
    ],
    requirements: [
      "Experience in QA or test engineering, with a focus on security or product quality.",
      "Comfort with scripting or coding (Python, JavaScript/TypeScript, or similar) for test automation.",
      "Familiarity with API testing and browser automation (e.g. Playwright, Selenium).",
      "Ability to write clear bug reports and test plans.",
      "Strong attention to detail and ability to think from an attacker or edge-case perspective.",
      "Self-directed; able to own test strategy for a subset of the product.",
    ],
    niceToHaves: [
      "Experience testing security or compliance tooling.",
      "Knowledge of Chrome extension architecture or browser extension security.",
      "Experience with risk scoring, SAST, or threat detection systems.",
    ],
    whatYouWillWorkOn: "You'll work closely with the engineering team to ensure our extension scanner, risk score, and detection pipelines are reliable and secure. Your tests will guard against regressions and help us ship with confidence.",
  },
  {
    id: "frontend-engineer-react",
    title: "Frontend Engineer (React)",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    summary: "Build and maintain the ExtensionShield web app: scanner UI, results dashboards, and research pages. You'll work in React with our design system and keep the experience fast and accessible.",
    responsibilities: [
      "Build and maintain React components and pages for the scanner, results, and research experiences.",
      "Implement responsive, accessible UIs that work across viewport sizes and input methods.",
      "Integrate with backend APIs for scans, history, and reporting.",
      "Collaborate with design and product on UX and visual consistency.",
      "Write clear, maintainable code and participate in code review.",
      "Improve performance and loading experience for data-heavy views.",
      "Help evolve our design system and shared component library.",
    ],
    requirements: [
      "Strong experience with React (hooks, state management, and modern patterns).",
      "Proficiency in CSS/SCSS and responsive layout (flexbox, grid).",
      "Experience integrating with REST or similar APIs and handling loading/error states.",
      "Familiarity with accessibility (a11y) and semantic HTML.",
      "Comfort with Git and collaborative development workflows.",
      "Clear communication and ability to work in a distributed team.",
    ],
    niceToHaves: [
      "Experience with React Router, build tooling (Vite), or testing (e.g. React Testing Library).",
      "Interest or experience in security, privacy, or developer tools.",
      "Experience with data visualization or dashboards.",
    ],
    whatYouWillWorkOn: "You'll own key parts of the ExtensionShield frontend: the scan flow, results pages, and research/content pages. You'll help make our security and risk data easy to understand and act on.",
  },
  {
    id: "backend-engineer-api-systems",
    title: "Backend Engineer (API / Systems)",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    summary: "Design and build APIs and services that power our extension scanning, scoring, and storage. You'll work on performance, reliability, and scale for our core pipeline.",
    responsibilities: [
      "Design, implement, and maintain APIs for scanning, results, and reporting.",
      "Own parts of the scan pipeline: job queue, worker coordination, and result storage.",
      "Improve performance and reliability of the scanner and related services.",
      "Implement and maintain data models and integrations (e.g. PostgreSQL, caches).",
      "Write tests and documentation; participate in code review and incident response.",
      "Collaborate with frontend and other backend engineers on contracts and deployment.",
      "Help operate and monitor production services.",
    ],
    requirements: [
      "Strong experience building and maintaining backend services (Python preferred; Node/Go considered).",
      "Experience with REST or similar API design and implementation.",
      "Familiarity with databases (SQL), caching, and async or queue-based workflows.",
      "Comfort with Linux, containers, and deployment tooling.",
      "Ability to debug production issues and improve observability.",
      "Clear written and verbal communication in a remote setting.",
    ],
    niceToHaves: [
      "Experience with FastAPI, Celery, or similar Python stack.",
      "Knowledge of Chrome extension internals or browser extension security.",
      "Experience with security-sensitive or compliance-oriented systems.",
    ],
    whatYouWillWorkOn: "You'll work on the core systems that run our extension scanner and serve results to the frontend and partners. Reliability, performance, and clear APIs are central to this role.",
  },
  {
    id: "python-engineer-static-analysis",
    title: "Python Engineer (Static Analysis)",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    summary: "Extend and maintain our static analysis pipeline for browser extensions. You'll work on parsers, rules, and tooling that power our security and risk scoring.",
    responsibilities: [
      "Extend and maintain static analysis components (parsers, AST handling, rule execution).",
      "Implement and tune detection rules (e.g. Semgrep, custom) for extension-specific patterns.",
      "Improve accuracy and performance of the analysis pipeline.",
      "Integrate analysis results into the scoring engine and API.",
      "Document rules and findings; collaborate with security and product on prioritization.",
      "Write tests and benchmarks; refactor for clarity and maintainability.",
      "Stay current with extension platforms (Manifest V2/V3) and relevant tooling.",
    ],
    requirements: [
      "Strong Python skills and experience with code analysis or tooling (parsing, ASTs, or rule engines).",
      "Familiarity with static analysis concepts: patterns, false positives, and performance tradeoffs.",
      "Experience with version control, testing, and collaborative development.",
      "Ability to read and reason about JavaScript/TypeScript (extension codebases).",
      "Clear communication and ability to document technical decisions.",
      "Comfort working in a remote, async-friendly environment.",
    ],
    niceToHaves: [
      "Experience with Semgrep, ESLint plugins, or similar rule-based analysis.",
      "Knowledge of Chrome extension structure (manifest, background, content scripts).",
      "Experience with security-focused static analysis or SAST.",
    ],
    whatYouWillWorkOn: "You'll work on the static analysis backbone of ExtensionShield: parsing extension code, running security and policy rules, and feeding results into our risk score. Your work directly improves what we can detect and how reliably we score extensions.",
  },
  {
    id: "llm-engineer-applied-ai",
    title: "LLM Engineer (Applied AI)",
    department: "Engineering",
    location: "Remote",
    type: "Full-time",
    summary: "Apply LLMs and NLP to improve extension risk analysis and product UX. You'll work on summarization, classification, and tooling that helps users and internal teams understand extension behavior.",
    responsibilities: [
      "Design and implement LLM-backed features for risk summarization, classification, or explanation.",
      "Integrate with internal APIs and pipelines; ensure latency, cost, and quality meet product needs.",
      "Evaluate and iterate on prompts, models, and evaluation metrics.",
      "Build tooling and guardrails for safe, reliable use of LLMs in a security context.",
      "Collaborate with product and engineering on use cases and prioritization.",
      "Document approaches, tradeoffs, and operational runbooks.",
      "Stay current with model and tooling advances relevant to security and compliance.",
    ],
    requirements: [
      "Hands-on experience building applications or pipelines that use LLMs (e.g. OpenAI, open-source).",
      "Strong Python skills; familiarity with APIs, async code, and production deployment.",
      "Understanding of prompt engineering, evaluation, and failure modes of LLM systems.",
      "Ability to balance quality, cost, and latency in production ML systems.",
      "Clear communication and ability to explain technical choices to non-ML stakeholders.",
      "Comfort working remotely and in an iterative, product-oriented environment.",
    ],
    niceToHaves: [
      "Experience in security, privacy, or compliance domains.",
      "Familiarity with extension or code analysis and how LLMs can augment it.",
      "Experience with RAG, agents, or tool use in LLM applications.",
    ],
    whatYouWillWorkOn: "You'll help bring applied AI into ExtensionShield in ways that improve how we explain risk and help users make decisions. Your work will sit alongside our rule-based and scoring systems to make extension security more understandable and actionable.",
  },
];

export function getRoleById(id) {
  return careersRoles.find((r) => r.id === id) || null;
}

export function getRoleIds() {
  return careersRoles.map((r) => r.id);
}
