# Get Started with ExtensionShield

This guide walks you through setup, configuration, and daily commands. For a high-level overview, see [README](../README.md).

---

## Table of contents

- [Prerequisites](#prerequisites)
- [Local Development (OSS Mode)](#local-development-oss-mode)
- [Docker](#docker)
- [CLI](#cli)
- [OSS vs Cloud: What Works Where](#oss-vs-cloud-what-works-where)
- [Enabling Cloud Mode](#enabling-cloud-mode)
- [Make Commands](#make-commands)
- [Pre-commit](#pre-commit-recommended)
- [Next steps](#next-steps)

---

## Prerequisites

| Tool      | Version  | Purpose                |
|-----------|----------|------------------------|
| Python    | 3.11+    | Backend (FastAPI)      |
| Node.js   | 20+      | Frontend (React/Vite)  |
| [uv](https://docs.astral.sh/uv/) | latest | Python package manager |
| Docker    | latest   | Optional, for full-stack run |

---

## Local Development (OSS Mode)

> **No Supabase or cloud account required.** You only need an LLM API key for AI summaries.

<details open>
<summary><strong>1. Clone and install</strong></summary>

```bash
git clone https://github.com/ExtensionShield/ExtensionShield.git
cd ExtensionShield
make install                    # Python (uv sync)
cd frontend && npm install      # Frontend dependencies
```
</details>

<details>
<summary><strong>2. Configure environment</strong></summary>

**Backend (project root):**

```bash
cp .env.example .env
# Edit .env: add OPENAI_API_KEY (required for AI summaries)
# EXTSHIELD_MODE=oss is the default — no other keys needed for OSS
```

**Frontend:**

```bash
cp frontend/.env.example frontend/.env
# No changes needed for OSS mode
```
</details>

<details>
<summary><strong>3. Start servers (two terminals)</strong></summary>

```bash
make api      # Terminal 1: API at http://localhost:8007
make frontend # Terminal 2: UI at http://localhost:5173
```

Open the UI at **http://localhost:5173**.
</details>

---

## Docker

<details>
<summary><strong>Run full stack with Docker</strong></summary>

```bash
cp .env.example .env
# Edit .env: add your OPENAI_API_KEY
docker compose up --build
# → API at http://localhost:8007
```

> **Network note:** The Docker config binds to `127.0.0.1:8007` (localhost only). This means the API is not reachable from other devices on your network. If you need external access (e.g. a shared dev server), change the binding to `0.0.0.0:8007:8007` in `docker-compose.yml` and ensure your firewall rules are appropriate. For production, place the API behind a reverse proxy (nginx, Caddy) rather than exposing it directly.
</details>

---

## CLI

<details>
<summary><strong>Analyze an extension from the Chrome Web Store</strong></summary>

```bash
make analyze URL=https://chromewebstore.google.com/detail/example/abcdef
```

Replace the URL with any Chrome Web Store extension detail page.
</details>

---

## OSS vs Cloud: What Works Where

| Feature                         | OSS | Cloud |
|---------------------------------|-----|-------|
| Scan Chrome Web Store extensions| ✅  | ✅    |
| Upload & scan CRX/ZIP files     | ✅  | ✅    |
| Security scoring + risk analysis | ✅  | ✅    |
| SAST, permissions, entropy      | ✅  | ✅    |
| VirusTotal integration          | ✅  | ✅    |
| AI-powered summaries            | ✅  | ✅    |
| CLI analysis                    | ✅  | ✅    |
| SQLite local storage            | ✅  | ✅    |
| View scan reports in browser    | ✅  | ✅    |
| Supabase persistence            | —   | ✅    |
| User authentication             | —   | ✅    |
| Scan history per user           | —   | ✅    |
| User karma / reputation         | —   | ✅    |
| Community review queue          | —   | ✅    |
| Telemetry admin dashboard       | —   | ✅    |
| Enterprise pilot forms          | —   | ✅    |

See [OPEN_CORE_BOUNDARIES.md](OPEN_CORE_BOUNDARIES.md) for how the boundary is enforced.

---

## Enabling Cloud Mode

<details>
<summary><strong>Use Supabase, auth, history, and other cloud features</strong></summary>

**In project root `.env`:**

```bash
EXTSHIELD_MODE=cloud
DB_BACKEND=supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY_HERE
```

**In `frontend/.env`:**

```bash
VITE_AUTH_ENABLED=true
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY_HERE
```

In OSS mode, cloud-only routes return **HTTP 501** with a JSON body indicating the feature is not available. Optional local metrics in OSS: set `OSS_TELEMETRY_ENABLED=true` to store pageview/event in SQLite only (no outbound). Details: [OPEN_CORE_BOUNDARIES.md](OPEN_CORE_BOUNDARIES.md).
</details>

---

## Make Commands

| Command              | Description                          |
|----------------------|--------------------------------------|
| `make help`          | Show all commands                    |
| `make dev`           | Show OSS dev setup instructions      |
| `make api`           | Start API server (port 8007)          |
| `make frontend`      | Start React dev server (port 5173)   |
| `make analyze URL=`  | Analyze extension from Chrome Web Store URL using local SQLite by default |
| `make test`          | Run tests                            |
| `make format`        | Format code (Black)                  |
| `make lint`          | Lint code (Pylint)                   |
| `make secrets-check` | Check for accidental committed secrets |

---

## Pre-commit (recommended)

<details>
<summary><strong>Install pre-commit hooks</strong></summary>

```bash
pip install pre-commit   # or: uv pip install pre-commit
pre-commit install
```

Hooks include Black, Pylint, gitleaks, and basic file checks. Run `make secrets-check` before pushing.
</details>

---

## Next steps

- **Contribute:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Security:** [SECURITY.md](SECURITY.md)
- **Open-core details:** [OPEN_CORE_BOUNDARIES.md](OPEN_CORE_BOUNDARIES.md)
- **Back to overview:** [README.md](../README.md)

---

## Troubleshooting

**Scan shows "Unknown" results?** An extension can come back as **Unknown** when there isn't enough information to analyze it confidently. Common causes:

- **Limited or unavailable metadata** for the extension.
- **Fetch limitations** while retrieving the extension or its Store listing.
- **Unsupported extension structure** the scanner can't parse.

Re-run the scan, and open the report's detailed findings to see which signals were available.
