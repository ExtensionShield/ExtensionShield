// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Toggle theme by adding/removing .light on <html>. Does not use app toggle (no React).
 */
async function setTheme(page, mode) {
  await page.evaluate((isLight) => {
    const html = document.documentElement;
    if (isLight) {
      html.classList.add('light');
    } else {
      html.classList.remove('light');
    }
  }, mode === 'light');
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Per-route stable selector to wait for (and optional timeout). No selector = just networkidle + no Loading. */
const ROUTE_READINESS = {
  '/': { selector: 'h1.hero-title', timeout: 15000 },
  '/scan': { selector: 'h1', timeout: 15000 },
  '/scan/history': { selector: 'h1', timeout: 15000 },
  '/reports': { selector: 'h1.reports-title, h1', timeout: 15000 },
  '/reports/visual-test-report': { selector: '.report-detail-page, h1', timeout: 20000 },
  '/research': { selector: 'h1, main', timeout: 15000 },
  '/research/case-studies': { selector: 'h1', timeout: 15000 },
  '/research/case-studies/honey': { selector: 'h1, .honey-case-study-page', timeout: 15000 },
  '/research/methodology': { selector: 'h1', timeout: 15000 },
  '/enterprise': { selector: 'h1, main', timeout: 15000 },
  '/about': { selector: 'h1', timeout: 15000 },
  '/open-source': { selector: 'h1, main', timeout: 15000 },
  '/community': { selector: 'h1.community-tagline, h1', timeout: 15000 },
  '/gsoc/ideas': { selector: 'h1, main', timeout: 15000 },
  '/contribute': { selector: 'h1', timeout: 15000 },
  '/blog': { selector: 'h1, main', timeout: 15000 },
  '/auth/diagnostics': { selector: 'h1, main', timeout: 15000 },
  '/settings': { selector: 'h1, main', timeout: 15000 },
  '/privacy-policy': { selector: 'h1.page-title, h1', timeout: 15000 },
  '/glossary': { selector: 'h1, main', timeout: 15000 },
  '/debug/theme': { selector: 'h1', timeout: 10000 },
  '/scan/progress/visual-test-scan': { selector: 'h1.retro-title, h1.progress-title, h1', timeout: 15000 },
  '/scan/results/visual-test-scan': { selector: 'main.results-v2-main, .extension-card-title, h1', timeout: 20000 },
};

async function waitForRouteReady(page, path) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.getByText(/Loading/i).waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  const readiness = ROUTE_READINESS[path];
  if (readiness?.selector) {
    const first = readiness.selector.split(',')[0].trim();
    await page.locator(first).first().waitFor({ state: 'visible', timeout: readiness.timeout || 15000 }).catch(() => {});
  }
  await page.evaluate(() => document.fonts?.ready);
}

/** Wait for route to settle then capture dark + light. */
async function captureRouteDarkLight(page, path, snapshotName, options = {}) {
  const waitMs = options.waitMs || 300;
  const screenshotOpts = options.screenshotOpts || {};
  await page.goto(path);
  await waitForRouteReady(page, path);
  await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), waitMs);

  await setTheme(page, 'dark');
  await expect(page).toHaveScreenshot(`${snapshotName}-dark.png`, screenshotOpts);

  await setTheme(page, 'light');
  await expect(page).toHaveScreenshot(`${snapshotName}-light.png`, screenshotOpts);
}

// All routes that render a page (no redirects). Dynamic segments use a placeholder.
const ALL_ROUTES = [
  { path: '/scan/history', name: 'scan-history' },
  { path: '/research', name: 'research' },
  { path: '/research/case-studies', name: 'research-case-studies' },
  { path: '/research/case-studies/honey', name: 'research-case-studies-honey' },
  { path: '/research/methodology', name: 'research-methodology' },
  { path: '/enterprise', name: 'enterprise' },
  { path: '/about', name: 'about' },
  { path: '/open-source', name: 'open-source' },
  { path: '/community', name: 'community' },
  { path: '/gsoc/ideas', name: 'gsoc-ideas' },
  { path: '/contribute', name: 'contribute' },
  { path: '/blog', name: 'blog' },
  { path: '/reports', name: 'reports' },
  { path: '/auth/diagnostics', name: 'auth-diagnostics' },
  { path: '/settings', name: 'settings' },
  { path: '/privacy-policy', name: 'privacy-policy' },
  { path: '/glossary', name: 'glossary' },
  { path: '/debug/theme', name: 'debug-theme' },
  { path: '/scan/progress/visual-test-scan', name: 'scan-progress' },
  { path: '/scan/results/visual-test-scan', name: 'scan-results' },
];

test.describe('Visual regression – homepage and sections', () => {
  test('Homepage (/) – dark and light', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await waitForRouteReady(page, '/');
    await page.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), 300);

    await setTheme(page, 'dark');
    await expect(page).toHaveScreenshot('homepage-dark.png', { maxDiffPixelRatio: 0.02 });

    await setTheme(page, 'light');
    await expect(page).toHaveScreenshot('homepage-light.png', { maxDiffPixelRatio: 0.02 });
  });

  test('Homepage case study section – dark and light', async ({ page }) => {
    await page.goto('/');
    await waitForRouteReady(page, '/');
    const caseStudy = page.locator('section.honey-case-study').first();
    await caseStudy.waitFor({ state: 'visible', timeout: 10000 });
    await caseStudy.scrollIntoViewIfNeeded();

    await setTheme(page, 'dark');
    await expect(caseStudy).toHaveScreenshot('homepage-case-study-dark.png');

    await setTheme(page, 'light');
    await expect(caseStudy).toHaveScreenshot('homepage-case-study-light.png');
  });
});

test.describe('Visual regression – core routes', () => {
  test('Scan page (/scan) – dark and light', async ({ page }) => {
    await captureRouteDarkLight(page, '/scan', 'scan');
  });

  test('Report detail page – dark and light', async ({ page }) => {
    await captureRouteDarkLight(page, '/reports/visual-test-report', 'report', { waitMs: 800 });
  });
});

test.describe('Visual regression – all other routes', () => {
  for (const route of ALL_ROUTES) {
    test(`${route.path} – dark and light`, async ({ page }) => {
      await captureRouteDarkLight(page, route.path, route.name);
    });
  }
});
