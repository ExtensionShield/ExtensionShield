#!/usr/bin/env node

/**
 * Static snapshot prerenderer.
 *
 * WHY: ExtensionShield ships a client-rendered SPA. The static index.html shell
 * carries ONE title/description for every URL; per-page <title>, canonical, OG,
 * and JSON-LD are injected by react-helmet-async only after JS runs. Crawlers
 * that don't execute JS (and Google's first indexing pass) see the same shell
 * metadata for every route, which suppresses per-page targeting and causes the
 * duplicate-title/description behaviour observed in Google's index.
 *
 * WHAT: after `vite build`, serve dist/ locally, load each indexable SEO route
 * in headless Chromium, let Helmet populate <head>, then write the fully
 * rendered HTML to dist/<route>/index.html (and dist/index.html for "/"). The
 * SPA still hydrates on top of the snapshot, so behaviour is unchanged for users.
 *
 * The FastAPI catch-all (serve_spa) serves these nested files when present.
 *
 * SAFETY: this NEVER fails the build. If Chromium can't launch (e.g. CI without
 * `npx playwright install`), it logs a warning and exits 0, leaving the normal
 * SPA shell in place. Wired as `postbuild` in package.json.
 */

import http from 'http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import { getPrerenderRoutes } from './generate-sitemap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '../dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

function startStaticServer(rootHtml) {
  const server = http.createServer((req, res) => {
    try {
      const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
      let filePath = join(DIST, urlPath);
      const ext = extname(filePath);
      if (ext && existsSync(filePath)) {
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        res.end(readFileSync(filePath));
        return;
      }
      // SPA fallback — always serve the original shell so the router renders the route
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(rootHtml);
    } catch {
      res.writeHead(500);
      res.end('error');
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function main() {
  if (!existsSync(join(DIST, 'index.html'))) {
    console.warn('⚠️  prerender: dist/index.html not found — run `vite build` first. Skipping.');
    return;
  }
  const rootHtml = readFileSync(join(DIST, 'index.html'), 'utf-8');
  const routes = getPrerenderRoutes().map((r) => r.path);

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.warn('⚠️  prerender: playwright not available — skipping prerender (SPA shell will be served as-is).');
    return;
  }

  const server = await startStaticServer(rootHtml);
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    console.warn(`⚠️  prerender: could not launch Chromium (${err.message}). Run \`npx playwright install chromium\`. Skipping.`);
    server.close();
    return;
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  let ok = 0;
  let failed = 0;

  for (const route of routes) {
    const url = base + route;
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Every indexable SEO route MUST emit a canonical link. If react-helmet-async
      // never writes one, the snapshot would ship without canonical/OG metadata —
      // worse than the SPA shell — so fail this route instead of swallowing it.
      try {
        await page.waitForFunction(
          () => !!document.querySelector('link[rel="canonical"]'),
          { timeout: 20000 }
        );
      } catch {
        throw new Error('missing <link rel="canonical"> after render');
      }
      await page.waitForTimeout(350); // small settle for remaining head tags / JSON-LD
      const html = '<!DOCTYPE html>\n' + (await page.content()).replace(/^<!DOCTYPE[^>]*>\s*/i, '');
      const outPath = route === '/' ? join(DIST, 'index.html') : join(DIST, route, 'index.html');
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, html, 'utf-8');
      ok += 1;
    } catch (err) {
      failed += 1;
      console.warn(`   ✗ prerender ${route}: ${err.message}`);
    }
  }

  await browser.close();
  server.close();
  console.log(`✅ prerender: ${ok} routes snapshotted${failed ? `, ${failed} failed` : ''}.`);
}

main().catch((err) => {
  // Never break the build on prerender failure.
  console.warn(`⚠️  prerender: unexpected error — ${err.message}. Skipping.`);
  process.exit(0);
});
