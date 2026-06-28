# Security Policy

---

## Table of contents

- [Reporting a Vulnerability](#reporting-a-vulnerability)
- [Supported Versions](#supported-versions)
- [Security Best Practices for Contributors](#security-best-practices-for-contributors)

---

## Reporting a Vulnerability

> **Please do NOT open a public GitHub issue for security vulnerabilities.**

<details>
<summary><strong>How to report</strong></summary>

If you discover a security vulnerability in ExtensionShield, please report it responsibly via one of these channels:

- **Email:** [security@extensionshield.com](mailto:security@extensionshield.com)
- **GitHub Security Advisory:** Use the "Report a vulnerability" button on the [Security tab](https://github.com/ExtensionShield/ExtensionShield/security/advisories/new) of this repository.
</details>

<details>
<summary><strong>What to include</strong></summary>

- A description of the vulnerability and its potential impact.
- Steps to reproduce (proof of concept if possible).
- Any relevant logs, screenshots, or configuration details.
</details>

<details>
<summary><strong>What to expect</strong></summary>

| Step | Timeline |
|------|----------|
| Acknowledgement of report | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix or mitigation plan shared | Within 15 business days |
| Public disclosure (coordinated) | After fix is released |

We will credit reporters in the release notes unless they prefer anonymity.
</details>

---

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `master` (default branch) | Yes |
| Older releases | Best-effort only |

---

## Security Best Practices for Contributors

<details>
<summary><strong>Never commit secrets</strong></summary>

API keys, passwords, tokens, and private keys must never appear in source code or git history. Use `.env` files (gitignored) and reference `.env.example` for the expected variable names.
</details>

<details>
<summary><strong>Use pre-commit hooks</strong></summary>

This repo includes a gitleaks pre-commit hook that blocks commits containing secrets. Run `pre-commit install` after cloning.
</details>

<details>
<summary><strong>Run <code>make secrets-check</code> before pushing</strong></summary>

This checks that `.env` is not committed and, if gitleaks is installed, scans for leaked secrets. See Makefile.
</details>

<details>
<summary><strong>Rotate compromised keys immediately</strong></summary>

If a key is accidentally committed, rotate it in the provider's dashboard, purge from git history (e.g. with `git filter-repo`), and notify the maintainers.
</details>

<details>
<summary><strong>Keep dependencies updated</strong></summary>

CI runs `pip-audit` and `npm audit` automatically. Address high/critical findings promptly.
</details>

---


