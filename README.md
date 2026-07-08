<div align="center">

  <img src="frontend/public/extension-shield-logo.svg" alt="ExtensionShield" width="98" height="98" />

  # ExtensionShield

  **Chrome Extension Security Scanner & Governance Platform**

  [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) · <a href="docs/SECURITY.md" style="color:#2ea043;">Security</a> · <a href="docs/GET_STARTED.md" style="color:#2ea043;">Get Started</a> · <a href="docs/CONTRIBUTING.md" style="color:#2ea043;">Contribute</a>

</div>

<br />

## **Manage and audit Chrome extensions with evidence**

ExtensionShield is a Chrome extension security scanner and governance workflow.
The public repo runs locally in **OSS mode** with SQLite by default, and the scanner,
CLI, and report UI do not require Supabase or a cloud account.

It can scan extensions from the **Chrome Web Store** or from local **CRX/ZIP files**.
Each scan can include manifest/permission review, Semgrep SAST findings,
entropy/obfuscation checks, optional VirusTotal signals, and a scored report across
Security, Privacy, and Governance.


<table>
<tr>
<td width="56%" valign="middle">
<h2><strong>Get the Chrome extension</strong></h2>
  
Install the **ExtensionShield Chrome extension** to review installed extensions and
open ExtensionShield scan reports from the browser.

- Manifest source: [`packages/extension/src/manifest.json`](packages/extension/src/manifest.json)
- Popup labels are derived from scan scores/verdicts in [`packages/extension/src/popup.js`](packages/extension/src/popup.js)
- The extension requests `storage` and optional `management` permission
- The web scanner and report UI live in [`frontend/`](frontend/)

<p>
  <a href="https://www.linkedin.com/company/extensionshield/posts/?feedView=all">
    <img src="https://img.shields.io/badge/Follow%20on-LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white"
         alt="Follow ExtensionShield on LinkedIn" />
  </a>
</p>

<p>
  <a href="https://chromewebstore.google.com/detail/extension-shield/lgfembekgpcfapeemgalpeefnlikpobd">
    <img src="https://img.shields.io/badge/Get%20it%20on-Chrome%20Web%20Store-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white"
         alt="Get it on Chrome Web Store" />
  </a>
</p>

</td>
<td width="44%" align="center" valign="middle">

<img width="438" height="530" alt="ExtensionShield Chrome extension - My Extensions security audit view" src="https://github.com/user-attachments/assets/2ef32c2c-7930-4dfe-b787-45039d789043" />



<br />

</td>
</tr>
</table>

---

## **Overview**

ExtensionShield scans browser extensions and produces evidence-linked reports for
security, privacy, and governance review.

The local OSS flow is SQLite-first. Optional hosted features such as auth, user
history, telemetry dashboards, and community review queue are part of
<a href="https://extensionshield.com" style="color:#2ea043;">ExtensionShield Cloud</a>.

---

## **What ExtensionShield does**

| Area | What is implemented | Repo evidence |
|------|---------------------|---------------|
| **Local run** | `make api`, `make frontend`, `make analyze`, and `make analyze-file` default to SQLite (`ExtensionShield.db`) | [`Makefile`](Makefile) |
| **Inputs** | Chrome Web Store URL scans and local CRX/ZIP uploads | [`src/extension_shield/api/main.py`](src/extension_shield/api/main.py), [`src/extension_shield/utils/extension.py`](src/extension_shield/utils/extension.py) |
| **Analysis** | Permissions, SAST, entropy/obfuscation, web store metadata, network/privacy signals, and optional VirusTotal data | [`src/extension_shield/governance/signal_pack.py`](src/extension_shield/governance/signal_pack.py), [`src/extension_shield/config/custom_semgrep_rules.yaml`](src/extension_shield/config/custom_semgrep_rules.yaml) |
| **Scoring** | 0-100 Security, Privacy, and Governance layer scores with hard gates for high-confidence threats | [`src/extension_shield/scoring/engine.py`](src/extension_shield/scoring/engine.py), [`src/extension_shield/scoring/gates.py`](src/extension_shield/scoring/gates.py) |
| **Reports** | Frontend report views for scan results, evidence, summaries, and layer details | [`frontend/src/pages/scanner/ScanResultsPageV2.jsx`](frontend/src/pages/scanner/ScanResultsPageV2.jsx), [`frontend/src/components/report/`](frontend/src/components/report/) |
| **Open-core boundary** | OSS mode runs scanner, CLI, SQLite, and report UI without cloud calls; cloud-only routes are gated | [`docs/OPEN_CORE_BOUNDARIES.md`](docs/OPEN_CORE_BOUNDARIES.md) |

In **OSS mode**, you get the scanner, CLI, local SQLite storage, and report UI.
In **Cloud mode**, hosted ExtensionShield adds auth, user history, telemetry/admin
features, and community/enterprise workflows.

---

## **Documentation**

| Document | Description |
|----------|-------------|
| <a href="docs/GET_STARTED.md" style="color:#2ea043;">GET_STARTED.md</a> | Setup, config, Docker, CLI, OSS vs Cloud, and Make commands |
| <a href="scripts/README.md" style="color:#2ea043;">scripts/README.md</a> | What each script does and when to run it |
| <a href="docs/OPEN_CORE_BOUNDARIES.md" style="color:#2ea043;">OPEN_CORE_BOUNDARIES.md</a> | OSS vs Cloud, enforcement, and configuration |
| <a href="docs/CONTRIBUTING.md" style="color:#2ea043;">CONTRIBUTING.md</a> | How to contribute |
| <a href="docs/SECURITY.md" style="color:#2ea043;">SECURITY.md</a> | Reporting vulnerabilities and secrets policy |
| <a href="docs/COMMERCIAL.md" style="color:#2ea043;">COMMERCIAL.md</a> | Commercial use guidance |
| <a href="docs/TRADEMARK.md" style="color:#2ea043;">TRADEMARK.md</a> | Brand usage guidelines |
| <a href="docs/CODE_OF_CONDUCT.md" style="color:#2ea043;">CODE_OF_CONDUCT.md</a> | Community standards |
| <a href="docs/NOTICE" style="color:#2ea043;">NOTICE</a> | Third-party attributions |

---

## **License & attribution**

- **Core** (scanner, CLI, local analysis): **MIT** — see <a href="LICENSE" style="color:#2ea043;">LICENSE</a>. The core is derived from ThreatXtension (MIT as declared in its README — see <a href="docs/NOTICE" style="color:#2ea043;">NOTICE</a> for the license basis).  
- **Cloud** (auth, Supabase, telemetry admin, community queue, enterprise forms): **proprietary**, available via <a href="https://extensionshield.com" style="color:#2ea043;">ExtensionShield Cloud</a>  

**Acknowledgments & attribution**: ExtensionShield began as a derivative of
<a href="https://github.com/barvhaim/ThreatXtension" style="color:#2ea043;">ThreatXtension</a>,
whose README states MIT licensing. ExtensionShield retains derived scanner
components and adds original work including the V2 scoring engine, governance
layer, browser extension, cloud features, and redesigned frontend. See
<a href="docs/NOTICE" style="color:#2ea043;">NOTICE</a> for attribution and
file-level provenance.

---

## **Community**

We build ExtensionShield in the open so security tools stay transparent and easy to inspect.

Feedback, issue reports, docs fixes, tests, and rule improvements are welcome. If ExtensionShield helps you, consider opening a PR, sharing your use case, or supporting the project.
