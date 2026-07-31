import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { REDIRECTS, REDIRECT_MAP } from "../redirects";
import { getSeoRoutes, getRoutesManifest, validateRedirects } from "../../../scripts/generate-sitemap.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROUTES_SOURCE = readFileSync(join(__dirname, "../routes.jsx"), "utf-8");

/**
 * The failure modes these catch are all silent: a redirect chain, a retired URL
 * left indexable, or a 301 pointing at a page that no longer exists. Each
 * quietly undoes the consolidation the redirects exist to perform.
 */
describe("redirect map", () => {
  const seoRoutes = getSeoRoutes(ROUTES_SOURCE);
  const manifest = getRoutesManifest(ROUTES_SOURCE);
  const indexablePaths = new Set(seoRoutes.map((r) => r.path));
  const knownPaths = new Set(manifest.static);

  it("passes the generator's own validation", () => {
    expect(validateRedirects(seoRoutes)).toEqual([]);
  });

  it("has no redirect chains (every target is a final destination)", () => {
    const sources = new Set(REDIRECTS.map((r) => r.from));
    const chains = REDIRECTS.filter((r) => sources.has(r.to));
    expect(chains).toEqual([]);
  });

  it("has no duplicate or self-referential sources", () => {
    const froms = REDIRECTS.map((r) => r.from);
    expect(new Set(froms).size).toBe(froms.length);
    expect(REDIRECTS.filter((r) => r.from === r.to)).toEqual([]);
  });

  it("points every redirect at an indexable page, not another retired URL", () => {
    const bad = REDIRECTS.filter((r) => !indexablePaths.has(r.to));
    expect(bad).toEqual([]);
  });

  it("keeps every retired URL out of the sitemap", () => {
    const leaked = REDIRECTS.filter((r) => indexablePaths.has(r.from));
    expect(leaked).toEqual([]);
  });

  it("registers every retired URL as a known route so it 301s instead of 404ing", () => {
    const missing = REDIRECTS.filter((r) => !knownPaths.has(r.from));
    expect(missing).toEqual([]);
  });

  it("uses only site-relative targets (no off-origin redirects)", () => {
    const offOrigin = REDIRECTS.filter((r) => !r.to.startsWith("/") || r.to.startsWith("//"));
    expect(offOrigin).toEqual([]);
  });

  it("wires a client-side fallback for every retired URL", () => {
    // routes.jsx must actually spread REDIRECTS — importing it without using it
    // silently drops the in-app navigation fallback the docstring promises.
    expect(ROUTES_SOURCE).toContain("...REDIRECTS.map");
  });

  it("exports a flat map matching the array", () => {
    expect(Object.keys(REDIRECT_MAP).length).toBe(REDIRECTS.length);
    REDIRECTS.forEach((r) => expect(REDIRECT_MAP[r.from]).toBe(r.to));
  });
});

/**
 * ExtensionShield publishes its own extension research; it does not publish
 * competitor comparisons. The retired pages described CRXcavator in the present
 * tense while the service was already gone, which is the failure this guards.
 */
describe("competitor content", () => {
  const COMPETITORS = /crxcavator|crxplorer|spin\.ai|extension auditor/i;

  it("has no indexable route under /compare", () => {
    const seoRoutes = getSeoRoutes(ROUTES_SOURCE);
    expect(seoRoutes.filter((r) => r.path.startsWith("/compare"))).toEqual([]);
  });

  it("never redirects to a URL naming a competitor", () => {
    expect(REDIRECTS.filter((r) => COMPETITORS.test(r.to))).toEqual([]);
  });

  it("keeps competitor names out of routes.jsx entirely", () => {
    expect(COMPETITORS.test(ROUTES_SOURCE)).toBe(false);
  });
});

/**
 * Case study guardrails.
 *
 * These pages name real, shipping products in the context of fraud and malware.
 * A 2026-07-30 fact-check found all three then-live case studies carried ZERO
 * citations, and one asserted that a named product enabled "surveillance,
 * credential harvesting, and document exfiltration" while the single report
 * behind it concluded the opposite — "No evidence of data exfiltration,
 * backdoors, or malicious code execution was found". That page was retired.
 */
describe("case studies", () => {
  const CASE_STUDY_PAGES = ["HoneyCaseStudyPage.jsx", "FakeAdBlockersCaseStudyPage.jsx"];
  const routePaths = new Set(getRoutesManifest(ROUTES_SOURCE).static);

  const readPage = (f) => readFileSync(join(__dirname, "../../pages/research", f), "utf-8");

  /** Page source with comments stripped — the retired-claims check must look at
   *  what ships, not at the block comments documenting why it was removed. */
  const readPageBody = (f) =>
    readPage(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("lists only case studies whose page exists", async () => {
    const { caseStudies } = await import("../../data/caseStudiesData.js");
    for (const study of caseStudies) {
      expect(study.path, `${study.id} has no path`).toBeTruthy();
      expect(routePaths.has(study.path), `${study.path} is not a real route`).toBe(true);
    }
  });

  it("advertises no unbuilt work on the research index", async () => {
    const { caseStudies } = await import("../../data/caseStudiesData.js");
    const placeholders = caseStudies.filter(
      (s) => s.comingSoon || /coming soon/i.test(s.date || "")
    );
    expect(placeholders).toEqual([]);
  });

  it("cites at least three external sources on every case study", () => {
    for (const file of CASE_STUDY_PAGES) {
      const urls = readPage(file).match(/url: "https?:\/\/[^"]+"/g) || [];
      expect(urls.length, `${file} cites ${urls.length} sources`).toBeGreaterThanOrEqual(3);
    }
  });

  it("renders a visible sources list and a scope disclaimer on every case study", () => {
    for (const file of CASE_STUDY_PAGES) {
      const src = readPage(file);
      expect(src, `${file} has no sources block`).toContain("case-study-sources");
      expect(src, `${file} has no scope note`).toContain("case-study-scope");
    }
  });

  it("emits sources as schema.org citations", () => {
    for (const file of CASE_STUDY_PAGES) {
      expect(readPage(file), `${file} omits citation from its schema`).toContain('"citation"');
    }
  });

  it("does not reintroduce the retired unsourced claims", () => {
    for (const file of CASE_STUDY_PAGES) {
      const body = readPageBody(file);
      // Named a live product as enabling data theft, citing a report that
      // explicitly found no such evidence.
      expect(body, `${file} names Flexi PDF Reader`).not.toMatch(/Flexi PDF Reader/i);
      // A range no source states, fusing two non-cumulative studies.
      expect(body, `${file} restores the 20M-80M range`).not.toMatch(/20M\s*[–-]\s*80M/);
      // Legitimate brands rendered as the subject of a malware page.
      expect(body, `${file} puts a real brand in a stat tile`).not.toMatch(
        /stat-value">\s*Adblock Plus/i
      );
    }
  });
});
