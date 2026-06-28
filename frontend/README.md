# ExtensionShield Frontend

React (Vite) frontend for the ExtensionShield Chrome extension security scanner.

## Setup

```bash
npm install
```

## Environment

Create a `.env` file in this directory for auth and API:

- `VITE_SUPABASE_URL` – Supabase project URL (for sign-in)
- `VITE_SUPABASE_ANON_KEY` – Supabase anon key

See the [Get Started guide](../docs/GET_STARTED.md) for full configuration steps.

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Start dev server (default http://localhost:5173) |
| `npm run build` | Build for production (includes sitemap generation) |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format with Prettier |
| `npm run test` | Run Vitest unit tests |
| `npm run test:visual` | Run Playwright visual tests |

## Structure

- `src/pages/` – Route-level pages (home, scanner, research, landing, blog, etc.)
- `src/components/` – Shared UI (report cards, modals, hero, footer)
- `src/context/` – Auth, theme, scan state
- `src/nav/` – Top nav and footer configuration
- `src/routes/` – Route definitions and lazy-loaded pages
- `src/services/` – API and auth clients
- `public/` – Static assets (favicons, demo images, hero icons)

Routes and sitemap are defined in `src/routes/routes.jsx`. The app is a single-page shell; all content is rendered client-side with optional SEO via `SEOHead` and meta from route config.
