#!/usr/bin/env node
/**
 * Contrast audit for theme tokens (dark + light).
 * Reads frontend/src/index.css, parses :root and .light --color-* (HSL "H S% L%").
 * Reports WCAG AA normal text (4.5:1) and non-text (3:1) for ring.
 * Run: node scripts/contrast-audit.js
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSS_PATH = path.join(__dirname, "../src/index.css");

const AA_NORMAL = 4.5;
const AA_NONTEXT = 3;

function parseHslTriple(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) return null;
  return { h: parseFloat(m[1]) / 360, s: parseFloat(m[2]) / 100, l: parseFloat(m[3]) / 100 };
}

function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function lin(c) {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relLum(r, g, b) {
  const [rr, gg, bb] = [r, g, b].map((x) => lin(x / 255));
  return 0.2126 * rr + 0.7152 * gg + 0.0722 * bb;
}

function contrast(l1, l2) {
  const L1 = Math.max(l1, l2);
  const L2 = Math.min(l1, l2);
  return (L1 + 0.05) / (L2 + 0.05);
}

function extractTokens(css, block) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = block === "root" ? /:root\s*\{([^}]+)\}/ : /\.light\s*\{([^}]+)\}/;
  const m = css.match(re);
  if (!m) return {};
  const section = m[1];
  const tokens = {};
  const varRe = /--color-([\w-]+):\s*([^;]+);/g;
  let match;
  while ((match = varRe.exec(section)) !== null) {
    const name = match[1];
    const value = match[2].trim();
    const parsed = parseHslTriple(value);
    if (parsed) tokens[name] = value;
  }
  return tokens;
}

function hslToLuminance(hslStr) {
  const p = parseHslTriple(hslStr);
  if (!p) return null;
  const [r, g, b] = hslToRgb(p.h, p.s, p.l);
  return relLum(r, g, b);
}

function runAudit(css) {
  const root = extractTokens(css, "root");
  const light = extractTokens(css, "light");

  const pairs = [
    { fg: "foreground", bg: "background", label: "foreground on background" },
    { fg: "muted-foreground", bg: "background", label: "muted on background" },
    { fg: "foreground-subtle", bg: "background", label: "subtle on background" },
    { fg: "foreground", bg: "card", label: "foreground on card" },
    { fg: "muted-foreground", bg: "card", label: "muted on card" },
    { fg: "foreground-subtle", bg: "card", label: "subtle on card" },
    { fg: "foreground", bg: "panel", label: "foreground on panel" },
    { fg: "primary-foreground", bg: "primary", label: "button text on primary button" },
  ];

  const nonText = [
    { fg: "ring", bg: "background", label: "focus ring vs background", min: AA_NONTEXT },
    { fg: "ring", bg: "card", label: "focus ring vs card", min: AA_NONTEXT },
  ];

  const report = { dark: [], light: [], darkFail: [], lightFail: [] };

  for (const theme of ["dark", "light"]) {
    const tokens = theme === "dark" ? root : light;
    const panelBg = theme === "dark" ? "222 47% 12%" : "0 0% 96%"; // surface-elevated as panel proxy
    const resolved = { ...tokens, panel: panelBg };

    for (const { fg, bg, label } of pairs) {
      const fgL = hslToLuminance(resolved[fg]);
      const bgL = hslToLuminance(resolved[bg]);
      if (fgL == null || bgL == null) {
        report[theme].push({ label, ratio: null, pass: false, missing: true });
        if (theme === "dark") report.darkFail.push(label);
        if (theme === "light") report.lightFail.push(label);
        continue;
      }
      const ratio = contrast(fgL, bgL);
      const pass = ratio >= AA_NORMAL;
      report[theme].push({ label, ratio, pass });
      if (!pass) report[`${theme}Fail`].push(label);
    }

    for (const { fg, bg, label, min } of nonText) {
      const fgL = hslToLuminance(resolved[fg]);
      const bgL = hslToLuminance(resolved[bg]);
      if (fgL == null || bgL == null) {
        report[theme].push({ label, ratio: null, pass: false, nonText: true });
        continue;
      }
      const ratio = contrast(fgL, bgL);
      const pass = ratio >= min;
      report[theme].push({ label, ratio, pass, nonText: true });
      if (!pass) report[`${theme}Fail`].push(label);
    }
  }

  return { report, root, light };
}

function printReport(report) {
  console.log("\n=== WCAG AA contrast audit (4.5:1 normal text, 3:1 non-text) ===\n");

  for (const theme of ["dark", "light"]) {
    console.log(`--- ${theme.toUpperCase()} ---`);
    for (const r of report[theme]) {
      const ratioStr = r.ratio != null ? r.ratio.toFixed(2) : "?";
      const threshold = r.nonText ? "3:1" : "4.5:1";
      const status = r.pass ? "PASS" : "FAIL";
      console.log(`  ${r.label}: ${ratioStr} (${threshold}) ${status}`);
    }
    console.log("");
  }

  if (report.darkFail.length || report.lightFail.length) {
    console.log("Failures: Dark:", report.darkFail.join(", ") || "none", "| Light:", report.lightFail.join(", ") || "none");
  }
}

function main() {
  const css = fs.readFileSync(CSS_PATH, "utf8");
  const { report } = runAudit(css);
  printReport(report);

  const textFails = {
    dark: report.dark.filter((r) => !r.nonText && !r.pass),
    light: report.light.filter((r) => !r.nonText && !r.pass),
  };

  if (textFails.dark.length || textFails.light.length) {
    console.log("\nSuggested minimal token fixes (adjust only muted/subtle/primary-foreground):");
    if (textFails.dark.length) console.log("  Dark:", textFails.dark.map((r) => r.label).join(", "));
    if (textFails.light.length) console.log("  Light:", textFails.light.map((r) => r.label).join(", "));
  }

  const exitCode = report.darkFail.length || report.lightFail.length ? 1 : 0;
  process.exit(exitCode);
}

main();
