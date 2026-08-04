# Playwright visual tests

Visual regression tests for **all routes** in **dark** and **light** mode. Theme is toggled by adding/removing the `light` class on `<html>` (no app toggle).

## What’s covered

- **Homepage and sections:** `/`, pricing section, case study section
- **Core:** `/scan`, `/reports/visual-test-report` (report detail)
- **All other routes:** `/scan/history`, `/research`, `/research/case-studies`, `/research/case-studies/honey`, `/research/methodology`, `/enterprise`, `/about`, `/open-source`, `/community`, `/gsoc/ideas`, `/contribute`, `/community` (includes connect/leaderboard), `/gsoc/blog`, `/reports`, `/auth/diagnostics`, `/settings`, `/privacy-policy`, `/glossary`, `/debug/theme`, `/scan/progress/visual-test-scan`, `/scan/results/visual-test-scan`

Each route is captured once in dark and once in light (same as above). Redirect-only routes (e.g. `/scanner` → `/scan`) and `/auth/callback` are not tested.

## Prerequisites

- Node 18+
- From `frontend/`: `npm install`
- Install Playwright browsers (once): `npx playwright install chromium`

## Run tests

From **`frontend/`**:

```bash
# Run visual tests (dev server is started automatically if needed)
npm run test:visual

# Update snapshots after intentional UI changes
npm run test:visual:update
```

- **First run**: Snapshots are created under `frontend/tests/visual/visual.spec.cjs-snapshots/`.
- **Later runs**: Current screenshots are compared to those snapshots; the run fails if they differ.
- **After design changes**: Run `npm run test:visual:update` to refresh the stored snapshots.

## Optional: use an already running dev server

If `npm run dev` is already running on port 5173, tests reuse it (`reuseExistingServer: true`). Otherwise the config starts the dev server for the run.

## No CI

These scripts are for local use. No CI job is configured.
