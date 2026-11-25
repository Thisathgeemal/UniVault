# Issuer Portal: Sign-in, Session and Application Layout

**Sprint:** S2 (Sprint 1 carry-over) · **Requirements:** FR-ISS-01, NFR-02, NFR-04, NFR-05, NFR-08
**Decisions:** [015](../dev-log/decisions.md#decision-015-frontend-stack-react--vite--ts-react-router-tanstack-query-tailwind--shadcnui-react-i18next-shared-portal-ui-package)
(frontend stack), [016](../dev-log/decisions.md#decision-016-staff-token-in-memory--sessionstorage-never-localstorage-httponly-cookie-as-future-work)
(token storage), 009 (staff authentication, backend)
**Code:** `issuer-portal/src/`, `portal-ui/src/` · **Tests:** `issuer-portal/test/`,
`issuer-portal/e2e/login.spec.ts`, `portal-ui/test/`

## 1. What exists

The issuer portal now has:

- staff sign-in;
- a restorable session;
- the protected application frame (header, role-filtered sidebar, content);
- placeholder pages for the features of the next sprints;
- English and Sinhala.

The shared, app-agnostic layout lives in **`@univault/portal-ui`**, which the verifier portal
will reuse in Sprint 3.

## 2. Route map

| Path                 | Page                                    | Roles          | Notes                                             |
| -------------------- | --------------------------------------- | -------------- | ------------------------------------------------- |
| `/login`             | Sign-in                                 | public         | Signed in → `returnTo` (if safe) or the dashboard |
| `/`                  | Dashboard (welcome, organisation, role) | admin, officer |                                                   |
| `/holders`           | Holders (Coming soon)                   | admin, officer | Planned for Sprint 2                              |
| `/credentials`       | Credentials (Coming soon)               | admin, officer | Planned for Sprint 2                              |
| `/credential-offers` | Credential offers (Coming soon)         | admin, officer | Planned for Sprint 2                              |
| `/issuer-keys`       | Issuer keys (Coming soon)               | **admin**      | Planned for Sprint 4. Officer → "Not permitted"   |
| `/staff`             | Staff (Coming soon)                     | **admin**      | Planned for Sprint 4. Officer → "Not permitted"   |
| anything else        | 404 (inside the layout)                 | signed in      | Signed out → `/login?returnTo=…` first            |

**One source of truth:** `src/routes/app-routes.tsx` lists the protected pages with their
roles. The router wraps each page in `RequireRole` with those roles, and the sidebar filters
the same list by the user's role. The menu and the guards cannot disagree.

The guards are **UI only**. The backend checks the role and the organisation on every API call
(`requireRole`, `requireOwnIssuer`, Decision 009).

**Error boundaries:** every route has a React Router `errorElement`. A crashing page shows
"This page could not be shown" with Reload and Back-to-dashboard buttons, never the error text.
The whole app is also wrapped in portal-ui's `ErrorBoundary`.

## 3. Session flow

```mermaid
sequenceDiagram
    autonumber
    actor Staff
    participant Portal as Issuer portal (browser)
    participant SS as sessionStorage
    participant API as Backend /api/v1

    Staff->>Portal: open /holders (not signed in)
    Portal-->>Staff: redirect /login?returnTo=%2Fholders
    Staff->>Portal: email + password
    Portal->>API: POST /auth/login (no token)
    API-->>Portal: 200 { accessToken, expiresIn, staff }
    Portal->>SS: store token (copy; the live one is in memory)
    Portal-->>Staff: /holders (returnTo checked: internal paths only)

    Note over Staff,Portal: page refresh
    Portal->>SS: read token
    Portal->>API: GET /auth/me (Bearer)
    API-->>Portal: 200 { staff: organisation, name, role }

    Staff->>Portal: use the portal
    Portal->>API: any request (Bearer)
    API-->>Portal: 401 TOKEN_EXPIRED / INVALID_TOKEN / UNAUTHENTICATED
    Portal->>SS: remove token
    Portal->>Portal: clear TanStack Query cache
    Portal-->>Staff: /login?returnTo=<page> + "Your session has expired, please sign in again"
    Staff->>Portal: sign in again
    Portal->>API: POST /auth/login
    API-->>Portal: 200 (new token)
    Portal-->>Staff: back to <page>
```

**Rules (Decision 016):**

- **Token storage:** the token is held in memory (`AuthProvider`), with one copy in
  **sessionStorage** (`univault.issuer-portal.token`) so a refresh keeps the session. It is
  **never written to localStorage**; a test spies on `localStorage.setItem` to prove this.
- **Restore:** with a stored token, the portal calls `GET /auth/me`. The organisation, name and
  role come from the server, not from the token.
  - A 401 clears the token and goes to `/login`.
  - A network failure shows "We could not load your session" with Try again, and keeps the
    token.
- **Session end:** any request that gets a 401 with `TOKEN_EXPIRED`, `INVALID_TOKEN` or
  `UNAUTHENTICATED` ends the session. Token, storage and the query cache are cleared, and the
  page goes to `/login` with a `returnTo` and the session-expired message.
  - `INVALID_CREDENTIALS` (wrong login) and `403` never end a session.
- **Expiry timer:** the portal also signs out at the token's `exp`. It reads `exp` from the JWT
  payload **for UI timing only**: the signature is not checked in the browser, and the backend
  enforces expiry.
- **Logout:**
  - calls `POST /auth/logout` (the backend logs it);
  - clears memory, sessionStorage and the TanStack Query cache;
  - goes to plain `/login`.

  It still signs out locally when the backend cannot be reached.

- **returnTo** accepts **internal paths only** (`src/auth/return-to.ts`). Anything else gives
  the dashboard, so the login page can't be used for open redirects. Rejected values include:
  - absolute URLs and `//host`;
  - `/\host`, control characters and `/login`;
  - values over 2048 characters.
- **One redirect path:** `AuthProvider` never navigates. The protected layout is the only place
  that sends a signed-out user to `/login`: with `returnTo` after an expiry or a first visit,
  plain after a logout. This prevents two navigations racing.
- **Password:** it lives only in the login form's state. It is never logged or stored, and the
  login mutation has `gcTime: 0`.

## 4. Sign-in messages

| Backend response                                | Message (en)                                                                                                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `401 INVALID_CREDENTIALS`                       | The email address or password is not correct. (generic: never says which field)                                                                                                            |
| `423 ACCOUNT_LOCKED` with `details.lockedUntil` | This account is locked after too many failed sign-in attempts. Try again after _24 Nov 2026, 3:30 pm_ (Sri Lanka time). The time is shown in **Asia/Colombo**, whatever the browser's zone |
| `423 ACCOUNT_LOCKED` without a usable time      | This account is locked after too many failed sign-in attempts. Try again later.                                                                                                            |
| `429 RATE_LIMITED` (or any 429)                 | Too many sign-in attempts from this device. Wait a few minutes, then try again.                                                                                                            |
| `400 VALIDATION_ERROR`                          | Enter a valid email address and your password.                                                                                                                                             |
| No response (offline, server down, CORS)        | Cannot reach the UniVault server. Check your connection and try again.                                                                                                                     |
| Anything else (e.g. 500)                        | Something went wrong. Please try again. Reference: _requestId_                                                                                                                             |
| Client-side checks (before any request)         | Enter your email address. / Enter a valid email address, like name@example.com. / Enter your password. / The password is too long.                                                         |

The client-side rules equal the backend's `loginBody`:

- the email is **trimmed** and must be a valid address of at most 254 characters;
- the password must have 1–200 characters.

Field errors use `aria-invalid` and `aria-describedby`, and focus moves to the first invalid
field. Server messages are in an `role="alert"` box, and the session-expired notice in
`role="status"`.

**Form details:**

- **Autocomplete:** the email field has `autocomplete="username"` (`type="email"`) and the
  password field `autocomplete="current-password"`.
- **Show/hide toggle:** a button with `aria-pressed` and `aria-controls`.
- **Submit:** the button is disabled and `aria-busy` while the request is pending.

## 5. Internationalisation (NFR-02)

**Set-up:**

- **Library:** react-i18next with bundled resources, `src/i18n/locales/en.ts` and `si.ts`.
  They are TypeScript files, so `si.ts` can carry the required top comment
  `// needs native-speaker review`.
- **Same shape:** `si` is typed as `Messages` (the shape of `en`). A test checks:
  - the keys are equal;
  - every Sinhala value contains Sinhala script;
  - placeholders such as `{{time}}` are kept.
- **Typed keys:** translation keys are type-checked through i18next's `CustomTypeOptions`, so a
  misspelt key fails `npm run typecheck`.

**Rules:**

- **Every UI string goes through `t()`**, including ARIA labels.
- **portal-ui holds no text.** The portal passes translated labels in.

**Language choice:**

- **Switcher:** a labelled `<select>` in the header and on the login page.
- **Saved preference:** stored in localStorage as `univault.language`. This is a preference
  only, never anything secret.
- **`<html lang>`:** follows the language, so screen readers and line height (`:lang(si)`)
  switch with it.

**Fonts:**

- **Sinhala:** Noto Sans Sinhala, self-hosted through `@fontsource/noto-sans-sinhala` (only the
  Sinhala subset, weights 400 and 600, bundled as files). No CDN is used, so the CSP stays
  `font-src 'self'`.
- **Latin:** the system UI font.
- **Fallbacks:** Nirmala UI and Iskoola Pota (Windows).

**Times** are formatted with `Intl.DateTimeFormat` (`en-LK` / `si-LK`, `Asia/Colombo`).

**Sinhala wording** was drafted by the developer and **needs native-speaker review** (Sprint
1 log). Terms used: issuer නිකුත්කරු, credential අක්තපත්‍රය, holder හිමිකරු, session සැසිය,
sign in පිවිසෙන්න.

## 6. Security and hosting

**Content-Security-Policy:** `csp.ts` is injected as a `<meta>` tag into **production builds
only**. The dev server needs inline scripts for hot reload.

```
default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self';
connect-src 'self' <origin of VITE_API_BASE_URL>; object-src 'none'; base-uri 'self'; form-action 'self'
```

- **No inline scripts or styles, and no eval.** Vite emits only external files, and
  `assetsInlineLimit: 0` keeps fonts as files.
- **The API origin** is taken from `VITE_API_BASE_URL` at build time. Rebuild when the API moves.

**Security headers the static host must send** (a `<meta>` CSP cannot carry `frame-ancestors`):

| Header                      | Value                                                                     | Why                                           |
| --------------------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `Content-Security-Policy`   | `frame-ancestors 'none'` (plus the policy above, if the host supports it) | Clickjacking: the portal must not be framed   |
| `X-Frame-Options`           | `DENY`                                                                    | The same for older browsers                   |
| `Referrer-Policy`           | `no-referrer`                                                             | No URLs leak to other sites (also a `<meta>`) |
| `X-Content-Type-Options`    | `nosniff`                                                                 |                                               |
| `Strict-Transport-Security` | `max-age=31536000`                                                        | HTTPS only                                    |

**VITE\_ variables are public.** Everything prefixed `VITE_` is compiled into the JavaScript
bundle and readable by anyone. The portal uses only `VITE_API_BASE_URL`. Never put a secret in
a `VITE_` variable.

**SPA fallback:** every path must serve `index.html`, so a refresh on `/holders` works. The
static host is **not chosen yet**, so the portal ships `public/_redirects` (`/* /index.html
200`), which Netlify and Cloudflare Pages read. On other hosts:

| Host                  | Equivalent                                                                       |
| --------------------- | -------------------------------------------------------------------------------- |
| Vercel                | `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/" }] }`     |
| Azure Static Web Apps | `staticwebapp.config.json`: `"navigationFallback": { "rewrite": "/index.html" }` |
| nginx                 | `try_files $uri /index.html;`                                                    |
| Firebase Hosting      | `"rewrites": [{ "source": "**", "destination": "/index.html" }]`                 |

**Backend CORS:** the backend must list the portal's origin in `CORS_ORIGINS`. The default
and `backend/.env.example` already include `http://localhost:5173`. In production, add the
deployed portal origin.

## 7. Tests

| Suite                                      | Covers                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/login.test.tsx`                      | Success, every error code, lockout time in Asia/Colombo, client validation, pending state, show/hide, autocomplete, signed-in redirect                                                                                             |
| `test/session.test.tsx`                    | returnTo redirect and back, open-redirect rejection, restore via `/auth/me`, invalid token, offline restore + retry, 401 mid-session (3 codes), 403 keeps the session, expiry timer, logout (online and offline), localStorage spy |
| `test/routes.test.tsx`                     | Officer cannot see or open admin pages; admin can; placeholders; 404; route error boundary                                                                                                                                         |
| `test/i18n.test.tsx`                       | Switch changes text and `<html lang>`, preference stored, key parity, Sinhala script, placeholders                                                                                                                                 |
| `test/api-client.test.ts`                  | Bearer header, error parsing, network errors, session-ending 401s, abort                                                                                                                                                           |
| `test/csp.test.ts`, `query-client.test.ts` | CSP directives; retry policy                                                                                                                                                                                                       |
| `e2e/login.spec.ts` (Playwright)           | Real backend on a throwaway database. The steps:<br>1. `/holders` → login.<br>2. Wrong password shows the error.<br>3. Admin signs in → `/holders` with the admin menu.<br>4. Logout.<br>5. Officer signs in without admin items.  |
| `portal-ui/test/`                          | AppShell, Sidebar (active item, role filtering, keyboard menu toggle, ARIA), Header, page blocks, primitives                                                                                                                       |

**Mock backend:** MSW mocks the backend in unit tests (`test/mock-backend.ts`, with
`onUnhandledFrame: 'error'`, so nothing reaches a real server).
