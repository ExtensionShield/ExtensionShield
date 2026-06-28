<div align="center">

  <img src="frontend/public/extension-shield-logo.svg" alt="ExtensionShield" width="98" height="98" />

  # ExtensionShield

  **Chrome Extension Security Scanner & Governance Platform**

  [![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE) · <a href="docs/SECURITY.md" style="color:#2ea043;">Security</a> · <a href="docs/GET_STARTED.md" style="color:#2ea043;">Get Started</a> · <a href="docs/CONTRIBUTING.md" style="color:#2ea043;">Contribute</a>

</div>

<br />

## **Manage and audit Chrome extensions with confidence**

ExtensionShield helps you check Chrome extensions in a simple and clear way.

It scans extensions from the **Chrome Web Store** or from **CRX/ZIP uploads**, shows risk scores, and helps you understand what an extension can access. The **core scanner, CLI, and local analysis** are **MIT-licensed** and work without any cloud dependency.


<table>
<tr>
<td width="56%" valign="middle">
<h2><strong>Get the Chrome extension</strong></h2>
  
Install the **ExtensionShield Chrome extension** to manage your extensions from **My Extensions**, check their **security audit score**, and spot risky extensions before they become a problem.

- Manage installed extensions in one place  
- Review labels like **Safe**, **Review**, and **Unknown**  
- Stay safer while browsing with better extension visibility
- Stay up to date with new releases, security findings, product updates,
  and community announcements from ExtensionShield.

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

ExtensionShield scans Chrome extensions, runs security and privacy analysis, and produces risk scores and summary reports.

Optional cloud features such as auth, history, team dashboards, and community queue are available via <a href="https://extensionshield.com" style="color:#2ea043;">ExtensionShield Cloud</a>.

---

## **What ExtensionShield does**

| Feature | Description |
|--------|-------------|
| **Scan** | Scan extensions from the Chrome Web Store or by uploading CRX/ZIP files |
| **Analyze** | Review permissions, SAST, entropy, and optional VirusTotal integration |
| **Score** | Generate security and privacy risk scores with reports |
| **Summarize** | Create written summaries of findings when enabled |

In **OSS mode** you get the scanner, CLI, local SQLite storage, and report UI with no cloud required.

In **Cloud mode** you also get auth, scan history, telemetry, and enterprise features.

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

- **Core** (scanner, CLI, local analysis): **MIT** — see <a href="LICENSE" style="color:#2ea043;">LICENSE</a>; the core is derived in part from ThreatXtension — see <a href="docs/NOTICE" style="color:#2ea043;">NOTICE</a> for attribution  
- **Cloud** (auth, Supabase, telemetry admin, community queue, enterprise forms): **proprietary**, available via <a href="https://extensionshield.com" style="color:#2ea043;">ExtensionShield Cloud</a>  

---

## **Community**

We build ExtensionShield in the open so security tools stay transparent and easy to inspect.

Feedback, issue reports, docs fixes, tests, and rule improvements are welcome. If ExtensionShield helps you, consider opening a PR, sharing your use case, or supporting the project.

**Acknowledgments & attribution**: ExtensionShield began as a fork of <a href="https://github.com/barvhaim/ThreatXtension" style="color:#2ea043;">ThreatXtension</a> (MIT, declared in its upstream README) and builds substantially on its open-source scanner core — including the permissions database, sensitive-domains config, entropy analysis, and Semgrep malware rules. On top of that core, ExtensionShield adds original work: the governance engine, the V2 scoring engine, ExtensionShield Cloud, and an expanded frontend. See <a href="docs/NOTICE" style="color:#2ea043;">NOTICE</a> for the full scope of what is derived versus original.
