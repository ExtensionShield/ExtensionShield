# Contributing to ExtensionShield

Thank you for your interest in contributing! This guide will help you get started.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Requesting Features](#requesting-features)
- [Secrets & Credentials](#secrets--credentials)
- [License](#license)

---

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).  
By participating, you agree to uphold this code.

---

## Getting Started

<details open>
<summary><strong>1. Fork and clone</strong></summary>

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally:

   ```bash
   git clone https://github.com/<your-username>/ExtensionShield.git
   cd ExtensionShield
   ```
3. **Add the upstream remote:**

   ```bash
   git remote add upstream https://github.com/<org>/ExtensionShield.git
   ```
</details>

---

## Development Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Python | 3.11+ | Backend (FastAPI) |
| Node.js | 20+ | Frontend (React/Vite) |
| [uv](https://docs.astral.sh/uv/) | latest | Python package manager |
| [pre-commit](https://pre-commit.com/) | latest | Git hooks |
| Docker | latest | (Optional) Full-stack local run |

<details>
<summary><strong>Backend</strong></summary>

```bash
# Install Python dependencies
make install          # or: uv sync

# Copy environment config
cp .env.example .env
# Edit .env and add your API keys (see .env.example for guidance)

# Start the API server (port 8007)
make api
```
</details>

<details>
<summary><strong>Frontend</strong></summary>

```bash
cd frontend

# Install Node dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your Supabase credentials (see .env.example)

# Start the dev server (port 5173)
npm run dev
```
</details>

<details>
<summary><strong>Pre-commit Hooks</strong></summary>

```bash
pip install pre-commit   # or: uv pip install pre-commit
pre-commit install
```

This installs hooks for:

- **Black** (Python formatting)
- **Pylint** (Python linting)
- **gitleaks** (secret detection)
- Trailing whitespace, YAML/JSON/TOML validation, large file checks
</details>

<details>
<summary><strong>Docker (full stack)</strong></summary>

```bash
cp .env.example .env
# Edit .env with your keys
docker compose up --build
# App available at http://localhost:8007
```
</details>

---

## Project Structure

```
ExtensionShield/
├── src/extension_shield/   # Python backend (FastAPI, analyzers, LLM, scoring)
│   ├── api/                # FastAPI app, routes, middleware
│   ├── core/               # Manifest parser, analyzers, report generation
│   ├── scoring/            # Security scoring engine
│   ├── governance/         # Policy rules, evidence, scorecards
│   ├── llm/                # LLM clients (OpenAI, WatsonX, Ollama, Groq)
│   ├── workflow/           # LangGraph analysis workflow
│   └── cli/                # CLI entry point
├── frontend/               # React SPA (Vite, Tailwind, Radix UI)
│   ├── src/components/     # UI components
│   ├── src/pages/          # Route pages
│   └── src/services/       # API clients, auth
├── tests/                  # Python tests (pytest)
├── supabase/               # Database schemas and migrations
├── scripts/                # Utility and deployment scripts
└── docs/                   # Documentation
```

---

## Making Changes

<details>
<summary><strong>Workflow</strong></summary>

1. **Create a branch** from `master` (the default branch):

   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes** in small, focused commits.
3. **Write or update tests** for any new functionality.
4. **Run the full check suite** before pushing:

   ```bash
   make format            # Auto-format Python
   make lint              # Lint Python
   make test              # Run Python tests
   cd frontend && npm run lint   # Lint frontend
   cd frontend && npm test       # Run frontend tests
   ```
</details>

---

## Testing

<details>
<summary><strong>Python (Backend)</strong></summary>

```bash
make test                          # All tests
uv run pytest tests/ -v            # Verbose
uv run pytest tests/api/ -v         # API tests only
uv run pytest --cov=extension_shield  # With coverage
```
</details>

<details>
<summary><strong>Frontend</strong></summary>

```bash
cd frontend
npm test                           # Unit tests (Vitest)
npm run test:coverage              # With coverage
npm run test:visual                # Visual regression (Playwright)
```
</details>

---

## Code Style

| Language | Formatter | Linter |
|----------|-----------|--------|
| Python | [Black](https://black.readthedocs.io/) (line-length=100) | [Pylint](https://pylint.org/) |
| JavaScript/JSX | [Prettier](https://prettier.io/) | [ESLint](https://eslint.org/) |

Pre-commit hooks enforce these automatically. You can also run manually:

```bash
# Python
make format && make lint

# Frontend
cd frontend && npm run format && npm run lint
```

---

## Pull Request Process

<details>
<summary><strong>Checklist</strong></summary>

1. **Ensure CI passes.** PRs run Python tests, frontend lint/tests/build, secret scanning, and dependency audits.
2. **Describe your change.** Explain what changed and why in the PR description.
3. **Keep PRs focused.** One logical change per PR. Large refactors should be discussed in an issue first.
4. **Request a review.** Tag a maintainer.
5. **Address feedback.** Push fixup commits, then squash before merge if requested.
</details>

<details>
<summary><strong>Commit messages (Conventional Commits)</strong></summary>

```
feat: add entropy analyzer for obfuscated code detection
fix: handle missing manifest.json in CRX files
docs: update quickstart with Docker instructions
test: add scoring engine edge case tests
chore: bump fastapi to 0.115.x
```
</details>

---

## Reporting Bugs

Open a [GitHub Issue](https://github.com/ExtensionShield/ExtensionShield/issues) with:

- Steps to reproduce
- Expected vs. actual behavior
- Environment (OS, Python/Node versions, browser)
- Relevant logs or screenshots

> **Security vulnerabilities:** Please follow [SECURITY.md](SECURITY.md) instead of opening a public issue.

---

## Requesting Features

Open a [GitHub Issue](https://github.com/ExtensionShield/ExtensionShield/issues) tagged `enhancement` with:

- Problem or use case you're solving
- Proposed solution (if any)
- Alternatives you've considered

---

## Secrets & Credentials

<details>
<summary><strong>Never commit secrets</strong></summary>

**Never commit secrets, API keys, or production identifiers.** Before every push:

```bash
make secrets-check
```

- `.env` is gitignored and must never be committed
- `.env.example` contains only placeholder values
- Production Supabase URLs, keys, and tokens belong in your local `.env` only
- If you accidentally commit a secret, rotate it immediately and notify maintainers
</details>

---

## License

By contributing to ExtensionShield, you agree that your contributions will be licensed under the MIT License (see [LICENSE](../LICENSE)).

> **Note:** ExtensionShield is open-core. The core scanner is MIT; cloud features (auth, Supabase persistence, history, telemetry admin, community queue, enterprise forms) are proprietary. Contributions to the core are always welcome. See [OPEN_CORE_BOUNDARIES.md](OPEN_CORE_BOUNDARIES.md) for details.

---

Thank you for helping make ExtensionShield better!  
Back to [README](../README.md).
