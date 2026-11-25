# UniVault Issuer Portal

The web application used by issuer staff (employers and banks) to create, issue and manage
digital credentials. It is built with React, Vite and TypeScript, using:

- React Router;
- TanStack Query;
- Tailwind CSS with shadcn/ui-style components;
- react-i18next (English and Sinhala).

The layout comes from the shared [`@univault/portal-ui`](../portal-ui/README.md) package.

**Status (24 Nov 2026):** sign-in, session, role-based layout and placeholder pages. Design and
flows: [docs/frontend/issuer-portal.md](../docs/frontend/issuer-portal.md) (Decisions 015 and 016).

## Setup

You need **Node.js 22.22 or newer** (the repo uses Node 26).

```
cd portal-ui && npm install
cd ../issuer-portal && npm install
cp .env.example .env          # optional: only needed to change the API URL
```

On Windows, if `npm install` reports "Cannot find native binding", delete `node_modules` and
`package-lock.json` and install again (npm/cli#4828). The win32-x64 bindings for rolldown,
lightningcss and the Tailwind oxide engine are pinned in `optionalDependencies`.

## Running the backend and the portal together

Use two terminals (PowerShell):

```
# Terminal 1: backend on http://localhost:4000
cd backend
npm run db:seed          # once: synthetic issuers, staff and holders
npm run dev

# Terminal 2: portal on http://localhost:5173
cd issuer-portal
npm run dev
```

**CORS:** the backend must allow `http://localhost:5173` in `CORS_ORIGINS`. This is the default
and is in `backend/.env.example`.

**Seed logins (development only).** These are synthetic demo accounts from `npm run db:seed`.
The password for all of them is the backend's default seed password, printed by `db:seed`
(`DEFAULT_SEED_PASSWORD` in `backend/src/db/seed.ts`):

| Email                              | Role    | Organisation                        |
| ---------------------------------- | ------- | ----------------------------------- |
| `admin@serendib-trading.example`   | admin   | Serendib Trading Company (Demo)     |
| `officer@serendib-trading.example` | officer | Serendib Trading Company (Demo)     |
| `admin@lanka-agro-tools.example`   | admin   | Lanka Agro Tools Enterprises (Demo) |
| `officer@lanka-agro-tools.example` | officer | Lanka Agro Tools Enterprises (Demo) |
| `admin@bank-a.example`             | admin   | UniVault Demo Bank                  |
| `officer@bank-a.example`           | officer | UniVault Demo Bank                  |

Never use these accounts or that password outside local development.

## Environment variables

| Variable            | Default                        | Meaning                                                                              |
| ------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `http://localhost:4000/api/v1` | Backend API base URL. Its origin is also put into the production CSP (`connect-src`) |

**Everything prefixed `VITE_` is public:** Vite compiles it into the JavaScript that every
visitor downloads. Never put a secret (API key, JWT secret, password, private key) in a
`VITE_` variable.

## Scripts

| Script                  | Purpose                                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| `npm run dev`           | Vite dev server on http://localhost:5173 (builds portal-ui first)                              |
| `npm run build`         | Type-check, then production build to `dist/` (with the CSP `<meta>` tag)                       |
| `npm run preview`       | Serve the production build on http://localhost:4173                                            |
| `npm run typecheck`     | `tsc --noEmit`                                                                                 |
| `npm test`              | Vitest + React Testing Library + MSW (jsdom)                                                   |
| `npm run test:coverage` | Tests with coverage; fails below 95 / 89 / 96 / 97 % (stmts / branches / funcs / lines)        |
| `npm run test:e2e`      | Playwright (Chromium) against the real backend on a throwaway database. Not part of `npm test` |

Every script except `preview` builds `@univault/portal-ui` first through a `pre…` hook. Run
Vitest from PowerShell or cmd, not Git Bash (CLAUDE.md, Sprint 1 Issue 6).

**End-to-end test:**

- **First time:** run `npx playwright install chromium` once.
- **What it starts:** `npm run test:e2e` starts its own backend on port 4100 and the portal on
  port 5180, so a running `npm run dev` is not disturbed.
- **Isolation:** it uses a temp folder under the OS temp directory, a random JWT secret and a
  random staff password. It never touches `backend/.data`, `backend/keys` or `backend/.env`.

## Structure

```
src/
  main.tsx                 entry: i18n, QueryClient, router, top-level error boundary
  router.tsx               route tree (React Router data router)
  routes/app-routes.tsx    protected pages + roles: ONE list for the router guards and the sidebar
  api/                     client (Bearer, ApiError, session-ending 401s), auth endpoints
  auth/                    AuthProvider (session), RequireRole, returnTo checks, sessionStorage
  layout/                  RootLayout (session provider), ProtectedLayout (AppShell + redirect)
  pages/                   Login, Dashboard, ComingSoon, Not permitted / 404 / error
  i18n/                    react-i18next set-up; locales/en.ts, locales/si.ts
  lib/                     sign-in messages, Asia/Colombo time formatting
csp.ts                     production Content-Security-Policy
public/_redirects          SPA fallback (Netlify / Cloudflare Pages format)
test/                      Vitest tests and the MSW mock backend
e2e/                       Playwright spec and the throwaway-backend launcher
```

## Deployment notes

- **Build:** run `npm run build` with `VITE_API_BASE_URL` set to the deployed API, and serve
  `dist/` as static files.
- **SPA fallback:** every path must serve `index.html`. `public/_redirects` covers Netlify and
  Cloudflare Pages. For other hosts, see "Deployment" in the design doc. The host is not chosen
  yet.
- **Headers:** the host must send `frame-ancestors 'none'` (or `X-Frame-Options: DENY`) and the
  other headers listed in the design doc. A `<meta>` CSP cannot set `frame-ancestors`.
- **Backend CORS:** add the portal's production origin to the backend's `CORS_ORIGINS`.
