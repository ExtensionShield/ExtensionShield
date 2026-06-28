#!/usr/bin/env node

/**
 * Sitemap + route-manifest generator
 *
 * Single source of truth: src/routes/routes.jsx.
 *
 * 1. sitemap.xml  — every route that has `seo`, a static path (no `:`/`*`),
 *    and is NOT marked `noindex: true` or `sitemap: false`.
 * 2. routes-manifest.json — EVERY real route path (static exact list +
 *    dynamic patterns as anchored regexes). The FastAPI catch-all loads this
 *    to return a real HTTP 404 for URLs that match no known route (kills the
 *    soft-404 where unknown URLs returned 200 + the homepage shell).
 *
 * Run: npm run generate:sitemap  (also runs automatically before vite build)
 * Uses VITE_SITE_URL or defaults to https://extensionshield.com
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const SITE_URL = process.env.VITE_SITE_URL || 'https://extensionshield.com';
const ROUTES_PATH = join(__dirname, '../src/routes/routes.jsx');

/**
 * Parse routes.jsx into a list of { path, block, hasSeo, isRedirect, noindex, priority, changefreq }.
 * `block` is the source text from this `path:` up to the next `path:`.
 */
function parseRoutes(source) {
  const out = [];
  const pathRe = /path:\s*["']([^"']+)["']/g;
  let match;
  while ((match = pathRe.exec(source)) !== null) {
    const path = match[1];
    const start = match.index;
    const nextPath = source.indexOf('path:', start + 5);
    const block = nextPath === -1 ? source.slice(start) : source.slice(start, nextPath);
    const priorityMatch = block.match(/priority:\s*([\d.]+)/);
    const changefreqMatch = block.match(/changefreq:\s*["']([^"']+)["']/);
    out.push({
      path,
      hasSeo: block.includes('seo:'),
      isRedirect: block.includes('<Navigate'),
      noindex: /noindex:\s*true/.test(block) || /sitemap:\s*false/.test(block),
      priority: priorityMatch ? parseFloat(priorityMatch[1]) : 0.5,
      changefreq: changefreqMatch ? changefreqMatch[1] : 'monthly',
    });
  }
  return out;
}

/**
 * Routes eligible for the sitemap AND for prerendering:
 * static, indexable, SEO pages only.
 */
export function getSeoRoutes(source = readFileSync(ROUTES_PATH, 'utf-8')) {
  const routes = parseRoutes(source)
    .filter((r) => r.hasSeo && !r.isRedirect && !r.noindex)
    .filter((r) => !r.path.includes(':') && !r.path.includes('*'));
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

/**
 * Routes to PRERENDER. Broader than the sitemap: also includes `noindex` and
 * `sitemap:false` pages so their robots/cross-canonical tags land in raw HTML
 * for crawlers (e.g. /scan/history noindex, /extension-permissions canonical).
 * Still excludes redirects and dynamic (`:`/`*`) routes.
 */
export function getPrerenderRoutes(source = readFileSync(ROUTES_PATH, 'utf-8')) {
  const routes = parseRoutes(source)
    .filter((r) => r.hasSeo && !r.isRedirect)
    .filter((r) => !r.path.includes(':') && !r.path.includes('*'));
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return routes;
}

/**
 * Known-route manifest for the server's 404 logic.
 *   static  — exact paths a bot may request (incl. app/redirect routes → 200, not 404)
 *   dynamic — anchored regex sources for `:param` routes
 * The catch-all `*` itself is excluded (that's the thing we 404 against).
 */
export function getRoutesManifest(source = readFileSync(ROUTES_PATH, 'utf-8')) {
  const parsed = parseRoutes(source).filter((r) => r.path !== '*');
  const staticPaths = parsed.filter((r) => !r.path.includes(':')).map((r) => r.path);
  const dynamic = parsed
    .filter((r) => r.path.includes(':'))
    .map((r) => '^' + r.path.replace(/:[^/]+/g, '[^/]+').replace(/\//g, '\\/') + '\\/?$');
  return {
    static: Array.from(new Set(staticPaths)).sort(),
    dynamic: Array.from(new Set(dynamic)).sort(),
  };
}

function generateSitemap(routes) {
  const lastmod = new Date().toISOString();
  const urls = routes
    .map((route) => {
      const loc = `${SITE_URL}${route.path}`;
      return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${route.changefreq || 'monthly'}</changefreq>
    <priority>${(route.priority ?? 0.5).toFixed(1)}</priority>
  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

function main() {
  try {
    const source = readFileSync(ROUTES_PATH, 'utf-8');
    const seoRoutes = getSeoRoutes(source);
    const manifest = getRoutesManifest(source);

    writeFileSync(join(__dirname, '../public/sitemap.xml'), generateSitemap(seoRoutes), 'utf-8');
    writeFileSync(join(__dirname, '../public/routes-manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    console.log('✅ Sitemap + route manifest generated from src/routes/routes.jsx');
    console.log(`🌐 Site URL: ${SITE_URL}`);
    console.log(`📊 Sitemap URLs: ${seoRoutes.length}`);
    console.log(`🧭 Manifest: ${manifest.static.length} static + ${manifest.dynamic.length} dynamic routes`);
  } catch (err) {
    console.error('❌ Error generating sitemap:', err.message);
    process.exit(1);
  }
}

// Only run when executed directly (so prerender.js can import the helpers).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
