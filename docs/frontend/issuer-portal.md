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
- the **dashboard** (section 8): credential totals, a status breakdown and recent activity
  from `GET /dashboard/summary`;
- **credential issuance** (section 10): a four-step flow previewed by the server, from the
  holder page or the Credentials page's "Issue credential" (holder picker);
- the **credentials table, revoke and reissue** (section 12): every credential with status tabs,
  search, sort and paging; the credential page with its status history; revoke and reissue /
  renew dialogs with a server-side reissue preview;
- the **wallet offer screen** (section 11): a one-time OpenID4VCI QR code with a countdown on
  the server's clock, live status, full screen, regenerate and cancel (Decision 021);
- **holder management** (section 9): list with search and paging, registration form generated
  from the credential schema (validated with the backend's rules), and the holder's detail page;
- the protected application frame (header, role-filtered sidebar, content);
- placeholder pages for the features of the next sprints;
- English and Sinhala.

The shared, app-agnostic layout lives in **`@univault/portal-ui`**, which the verifier portal
will reuse in Sprint 3.

## 2. Route map

| Path                       | Page                                    | Roles          | Notes                                             |
| -------------------------- | --------------------------------------- | -------------- | ------------------------------------------------- |
| `/login`                   | Sign-in                                 | public         | Signed in → `returnTo` (if safe) or the dashboard |
| `/`                        | Dashboard (counts, breakdown, activity) | admin, officer | Landing page after sign-in (section 8)            |
| `/holders`                 | Holder list (search, paging, sorting)   | admin, officer | Section 9; state in the URL                       |
| `/holders/new`             | Register a holder                       | admin, officer | Form for the issuer type (section 9.1)            |
| `/holders/:holderId`       | One holder and its credentials          | admin, officer | Another issuer's holder → "Holder not found"      |
| `/credentials`             | Credentials table (tabs, search, sort)  | admin, officer | Section 12; state in the URL                      |
| `/credentials/new`         | Issue a credential (4 steps)            | admin, officer | `?holderId=&step=&validUntil=` (section 10)       |
| `/credentials/:id`         | One credential, timeline, actions       | admin, officer | Section 12.4; success page with `?issued=1`       |
| `/credentials/:id/reissue` | Reissue / renew (server preview)        | admin, officer | Section 12.3; valid or expired credentials only   |
| `/credentials/:id/offer`   | Wallet offer (QR code)                  | admin, officer | Section 11; pending credentials only              |
| `/credential-offers`       | Credential offers (Coming soon)         | admin, officer | Planned for Sprint 2                              |
| `/issuer-keys`             | Issuer keys (Coming soon)               | **admin**      | Planned for Sprint 4. Officer → "Not permitted"   |
| `/staff`                   | Staff (Coming soon)                     | **admin**      | Planned for Sprint 4. Officer → "Not permitted"   |
| anything else              | 404 (inside the layout)                 | signed in      | Signed out → `/login?returnTo=…` first            |

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

| Suite                                      | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/login.test.tsx`                      | Success, every error code, lockout time in Asia/Colombo, client validation, pending state, show/hide, autocomplete, signed-in redirect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/session.test.tsx`                    | returnTo redirect and back, open-redirect rejection, restore via `/auth/me`, invalid token, offline restore + retry, 401 mid-session (3 codes), 403 keeps the session, expiry timer, logout (online and offline), localStorage spy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `test/routes.test.tsx`                     | Officer cannot see or open admin pages; admin can; placeholders; 404; route error boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/i18n.test.tsx`                       | Switch changes text and `<html lang>`, preference stored, key parity, Sinhala script, placeholders                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `test/api-client.test.ts`                  | Bearer header, error parsing, network errors, session-ending 401s, abort                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `test/dashboard.test.tsx`                  | Every count (Intl-formatted), card links and accessible names/descriptions, the stacked bar (named figure, legend with numbers), activity wording per event type and reason, loading skeletons, error + Try again (reference shown), network and 429 messages, empty state, refresh, staleTime / refetch on focus, Sinhala, officer and admin                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `test/holders-validation.test.ts`          | Portal validator = backend validator on every seed record and 28 invalid claims; every schema claim in the form or omitted on purpose; input types, if/then rules, conditional fields, `toClaims`; server issues mapped; messages; English text for every field and option                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `test/holders-register.test.tsx`           | Employee form for an employer, customer form for a bank; required errors with the summary (focus, links); blur validation; employee ID and customer-number patterns; NIC vs passport; residential address; P.O. Box; success → detail + toast; server field errors; 409 link; other failures; no double submit; unsaved-changes prompt; Sinhala                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/holders-list.test.tsx`               | Columns, masked ID, bank column label, row click, debounced search with `search=`, URL `q`, sorting (`aria-sort`, URL, request), paging and page size (offset, limit), Back keeps the state, both empty states, loading, error + retry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `test/holders-detail.test.tsx`             | Grouped fields, full ID number, option labels, Over 18, added by, credential summary and list, Issue credential starts the flow, 404 page, load errors, nothing in the console, Sinhala                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `test/csp.test.ts`, `query-client.test.ts` | CSP directives; retry policy                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `e2e/login.spec.ts` (Playwright)           | Real backend on a throwaway database. The steps:<br>1. `/holders` → login.<br>2. Wrong password shows the error.<br>3. Admin signs in → `/holders` with the admin menu.<br>4. Dashboard: every card equals the backend's `/dashboard/summary` (demo data seeded).<br>5. Logout.<br>6. Officer signs in without admin items.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `e2e/holders.spec.ts` (Playwright)         | Employer admin registers an employee (validation error first, then fixed), finds them by search, opens the detail page; bank admin registers a customer with a passport; a duplicate reference shows the 409 message and its link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/issuance.test.tsx`                   | Employer sees only Employment, bank only KYC; the picker (direct and from `/credentials`); values come from the preview response, not the holder record, and the requests carry no claims; read-only details; validity range, out-of-range input, debounced re-preview, every cap message; card sections and badges match the schemas response; derived label; confirmation required; no double submit; result page; every error; refused date; Back / forward; leave prompt; Sinhala                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `test/issuance-helpers.test.tsx`           | API bodies, error mapping, grouping and formatting of preview claims, cap texts, picker states                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `test/offer.test.tsx`                      | Offer screen (fake timers): the QR SVG decodes (jsQR on a rasterised render) to exactly the backend URI; countdown on the server clock with a PC clock 3 h fast and 2 min slow; amber last minute; announcements once a minute and at 1 minute left; expiry by countdown and by status; every polled status (redeemed, replaced, cancelled, withdrawn); polling every 5 s and on focus, stopping in final states; the server status wins over the countdown; regenerate (confirm, replace) and cancel (confirm, 409); full screen (Esc); reload / return message; the code absent from the URL, both storages, the query caches and the console (spies); developer panel only outside production; entry points; not-pending and error states; Sinhala                                                                                                                                                                                                                                                                                                                                                 |
| `scripts/check-production-bundle.mjs`      | Run by `npm run build` after `vite build`: the developer panel is not in the production bundle; no `eval` / `new Function`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `e2e/offer.spec.ts` (Playwright)           | Employer admin issues a credential and opens the offer; the QR on screen (screenshot, jsQR) is a valid `openid-credential-offer://` URI (OpenID4VCI fields, no `tx_code`); "Generate new QR code" → the backend reports the first offer `invalidated` / `replaced`; with `CREDENTIAL_OFFER_TTL_SECONDS=15` the screen shows the expired state                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `e2e/issuance.spec.ts` (Playwright)        | Employer admin issues an Employment credential to a seed employee end to end, the dashboard's Awaiting wallet count rises by 1, issuing again shows ACTIVE_CREDENTIAL_EXISTS and its link; bank admin previews a KYC credential (Over 18, badges)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `test/credentials-table.test.tsx`          | Columns and plain badges (Active, Awaiting wallet, Revoked, Replaced, Expired), short id + copy, holder link, "Expires in n days" within 30 days only; no ID numbers or other claims in the page; tab counts and filtering; debounced search, sort by every sortable column both ways, paging and page size, all in the URL and sent to the backend; state read back from the URL; unknown URL values ignored; a dashboard card lands on its tab; empty state per tab and for a search; error + retry; "Issue credential" opens the picker; other organisations' credentials not shown; Sinhala                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `test/credential-actions.test.tsx`         | `credentialActions()` for every status x role (15 cases) and the labelled items; officer sees Revoke disabled with the reason; view-only for revoked / replaced; menu navigation; revoke dialog (reason options, disabled until chosen, note required for Other, 500 limit, trimmed note sent, success toast + badge and tab count updated, pending warning, no double submit, Cancel); each 409 message for revoke and reissue followed by a refetch; other refusals; reissue page (server preview, changed field highlighted, changed count, expiry text, confirmation required, success → the replacement's offer; "No details changed"; Other needs a note; Valid until re-previews; Renew for expired; not offered for revoked / replaced / pending; unknown → not found; refused preview); credential page (summary, Replaced by / Replaces links, timeline wording, staff, reason and Asia/Colombo time, active offer expiry and link, officer's disabled Revoke, admin revoke updates the page, stored vs effective status, not found for unknown and other issuers, timeline retry, Sinhala) |
| `e2e/credentials.spec.ts` (Playwright)     | Admin revokes a demo active credential (badge Revoked; dashboard Revoked +1, Active −1, the card shows it); officer sees Revoke disabled, reissues STC-00003 after its record changed (the launcher runs `db:holder:set` before the server starts), the preview highlights the designation, lands on the replacement's offer, the old credential shows Replaced with a link                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `portal-ui/test/`                          | AppShell, Sidebar (active item, role filtering, keyboard menu toggle, ARIA), Header, page blocks, primitives; StatCard, StackedBar, Skeleton (`dashboard-widgets.test.tsx`); DataTable, Pagination, SearchInput, FormField, ErrorSummary, StatusBadge, Toast, ConfirmDialog, Tooltip, Select (`forms-and-tables.test.tsx`); Stepper, CredentialCardPreview (`credential-widgets.test.tsx`); QrCode (decodes to its value, quiet zone, error correction M, nothing but the drawing in the DOM), Countdown, FullscreenOverlay (`offer-widgets.test.tsx`); Dialog, ActionMenu, FilterTabs, CopyButton (`action-widgets.test.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Mock backend:** MSW mocks the backend in unit tests (`test/mock-backend.ts`, with
`onUnhandledFrame: 'error'`, so nothing reaches a real server).

## 8. Dashboard

**Route:** `/` (the landing page after sign-in), admin and officer. **Data:** one call to
`GET /api/v1/dashboard/summary` ([dashboard-api.md](../api/dashboard-api.md)); the backend
scopes it to the staff member's organisation. **Code:** `src/pages/DashboardPage.tsx`,
`src/api/dashboard.ts`, `src/lib/activity.ts`.

### 8.1 Layout

| Part             | Content                                                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Header           | Organisation name (`<h1>`), "Last updated _time_ (Sri Lanka time)" from `generatedAt` in Asia/Colombo, **Refresh** button                                          |
| Primary cards    | **Issued**, **Active**, **Revoked**: large numbers with one plain-language sentence each                                                                           |
| Secondary cards  | **Awaiting wallet**, **Superseded**, **Expired**, **Expiring in 30 days**, **Holders**                                                                             |
| Status breakdown | Horizontal stacked bar of active / revoked / superseded / expired with a legend: label, number and share (e.g. "8 (73%)")                                          |
| Recent activity  | Up to 10 events: action in plain words, credential type, shortened id ("8a01c2aa…", full id as tooltip), staff name or "Holder's wallet", relative + absolute time |

- **Card links:** every card is a link (portal-ui `StatCard` with the React Router adapter):

  | Card                | Opens                                                                  |
  | ------------------- | ---------------------------------------------------------------------- |
  | Issued              | `/credentials` (no single status matches)                              |
  | Active              | `/credentials?effectiveStatus=valid`                                   |
  | Revoked             | `/credentials?effectiveStatus=revoked`                                 |
  | Awaiting wallet     | `/credentials?effectiveStatus=pending`                                 |
  | Superseded          | `/credentials?effectiveStatus=superseded`                              |
  | Expired             | `/credentials?effectiveStatus=expired`                                 |
  | Expiring in 30 days | `/credentials?effectiveStatus=valid` (no "expiring" filter exists yet) |
  | Holders             | `/holders`                                                             |

  The credentials page is still a placeholder; the links are ready for it. The list's
  `revoked` filter also shows credentials revoked while pending, which the dashboard's
  "Revoked" does not count.

- **Numbers:** `Intl.NumberFormat` for the language (`formatNumber`, `formatPercent` in
  `lib/format.ts`). A zero is shown as `0`.
- **Relative times** are measured from the server's `generatedAt`, not the browser clock, so
  they agree with "Last updated" (and the render stays pure for the React Compiler lint).
- **Responsive:** one column on phones; primary cards in 3 columns from `sm`; secondary cards
  in 2 columns from `sm` and 5 from `lg`; breakdown and activity side by side from `lg`.

### 8.2 States

| State             | When                                            | Shown                                                                                                                                                                                       |
| ----------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading           | First fetch                                     | Header at once (organisation from the session); cards with skeleton numbers; two skeleton blocks; a screen-reader status "Loading the dashboard…" (`aria-busy` on the content)              |
| Error, no data    | Fetch failed (after the query client's retries) | Alert: "The dashboard could not be loaded." + the shared ApiError message (`lib/api-errors.ts`: network, 429, or generic with "Reference: _requestId_") + **Try again**                     |
| Error, stale data | A refresh failed                                | The same alert above the last numbers                                                                                                                                                       |
| Empty             | `issued = 0` and `awaitingWallet = 0`           | Cards with 0; "No credentials issued yet", short guidance and a **Go to Holders** button instead of the breakdown; activity only if there is any (e.g. a credential revoked before signing) |
| Only pending      | `issued = 0`, `awaitingWallet > 0`              | The breakdown card says "No credential has been signed into a wallet yet."                                                                                                                  |
| Session ended     | 401 from the summary                            | The API client signs out with returnTo (section 3), like any other call                                                                                                                     |

**Freshness (TanStack Query):** key `['dashboard', 'summary', <issuerId>]`, `staleTime` 30 s,
refetch on window focus; **Refresh** refetches at once (the button shows "Refreshing…" and a
spinning icon). The cache is cleared on sign-out.

### 8.3 Activity wording

| Event (`fromStatus → toStatus`, reason)   | English                              | Sinhala (draft, needs review)              |
| ----------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `null → pending`                          | Created – waiting for the wallet     | සාදන ලදී – පසුම්බිය සඳහා රැඳී ඇත                |
| `pending → valid`                         | Signed into wallet                   | පසුම්බියට අත්සන් කර ලබා දෙන ලදී                  |
| `valid → superseded` (any reason)         | Replaced by a new credential         | නව අක්තපත්‍රයකින් ප්‍රතිස්ථාපනය කරන ලදී            |
| `→ revoked`, `details_changed`            | Revoked – details changed            | අවලංගු කරන ලදී – විස්තර වෙනස් විය                |
| `→ revoked`, `employment_ended`           | Revoked – employment ended           | අවලංගු කරන ලදී – රැකියාව අවසන් විය              |
| `→ revoked`, `relationship_ended`         | Revoked – relationship ended         | අවලංගු කරන ලදී – සම්බන්ධතාවය අවසන් විය           |
| `→ revoked`, `wallet_lost_or_compromised` | Revoked – wallet lost or compromised | අවලංගු කරන ලදී – පසුම්බිය නැති වී හෝ අනාරක්ෂිත වී ඇත |
| `→ revoked`, `issued_in_error`            | Revoked – issued in error            | අවලංගු කරන ලදී – වැරදීමකින් නිකුත් කළ              |
| `→ revoked`, `other`                      | Revoked – other reason               | අවලංගු කරන ලදී – වෙනත් හේතුවක්                  |
| `→ revoked`, missing or unknown code      | Revoked – no reason given            | අවලංගු කරන ලදී – හේතුවක් දක්වා නැත              |
| `valid → valid`, `dev_simulated_expiry`   | Expiry simulated (development)       | කල් ඉකුත්වීම අනුකරණය කරන ලදී (සංවර්ධන)            |
| anything else                             | Status changed                       | තත්ත්වය වෙනස් විය                              |

The reason code is never shown raw, and the API never sends the revocation note. Credential
types read "Employment credential" / "KYC credential". Wallet events show "Holder's wallet"
instead of a staff name.

### 8.4 Accessibility

- Each card is one link whose **name is "_label_ _number_"** (e.g. "Active 8") and whose
  **description** is the sentence (`aria-labelledby` / `aria-describedby`); icons are hidden.
- The two card rows are lists named "Credential totals" and "More figures".
- The stacked bar is a `<figure>` named "Status of issued credentials". The SVG bar itself is
  `aria-hidden`; the legend list carries every label, number and percentage in text, so nothing
  depends on colour. Segments are SVG `<rect>` widths, not inline styles, because the
  production CSP is `style-src 'self'`.
- Times are `<time datetime="…">`.

### 8.5 Shared components (portal-ui)

`StatCard`, `StackedBar` and `Skeleton` live in `@univault/portal-ui` for the verifier portal
(Sprint 3). Like the rest of portal-ui they take every label already translated, plus a
pluggable link component; they contain no text, routes or API calls.

### 8.6 Known limitation

Chromium has no Sinhala data for `Intl.RelativeTimeFormat` or month names, so in Sinhala the
relative times ("2 hours ago") and the month in dates stay English. The existing lockout time
on the sign-in page has the same limitation. Bundling locale data is future work.

## 9. Holders

**Routes** (admin and officer; the guards reuse the Holders route's roles from
`app-routes.tsx`):

| Path                 | Page                    | Code                                       |
| -------------------- | ----------------------- | ------------------------------------------ |
| `/holders`           | List, search, paging    | `src/pages/holders/HoldersListPage.tsx`    |
| `/holders/new`       | Register a holder       | `src/pages/holders/HolderRegisterPage.tsx` |
| `/holders/:holderId` | One holder, credentials | `src/pages/holders/HolderDetailPage.tsx`   |

**Data:** `GET /holders`, `POST /holders`, `GET /holders/:holderId`
([holders-api.md](../api/holders-api.md)) and `GET /credentials?holderId=` for the credential
summary. The backend scopes all of them to the staff member's organisation; another issuer's
holder is a `404`, shown as "Holder not found".

### 9.1 Form generated from the schema

The form type comes from the signed-in issuer's type (`/auth/me` → `issuer.type`):
employer → **employee** form (Employment credential), bank → **customer** form (KYC
credential). `src/holders/form-model.ts` builds it from the credential JSON Schema of that type
(the files in `docs/schemas`, compiled into the build, Decision 018) plus a small UI config:

| From the schema                                                                    | From the UI config (`FORM_UI`)                                  |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Input type (`enum` → select, `format: date` → date, `format: email` → email)       | Group and order of the fields                                   |
| Options of a select, `maxLength`                                                   | `tel` input for phone numbers (the schema only says "string")   |
| Required fields (`required`, nested address `required`, the `allOf` if/then rules) | `autocomplete` hints                                            |
| Conditional fields (shown only while the schema requires them)                     | Which object claim is an optional section (residential address) |
| Constants (address `country` = `LK`, filled in, never typed)                       | Labels, hints and messages: i18n keys (`holders.fields.*`)      |

- **Groups:** employee: Personal details, Employment details, Contact details. Customer:
  Account details (customer number), Personal details, Identity document, Contact details,
  Permanent address, Residential address (switched on by a checkbox).
- **Not in the form:** `age_over_18` (calculated by the server, Decision 005) and `portrait`
  (no photo upload yet). A test fails if a schema property is neither in the form nor in this
  list (`OMITTED_CLAIMS`).
- **KYC rules, live:** with **NIC** the expiry date is hidden; **passport** or **driving
  licence** shows it as required, and the ID-number hint and error text change to that
  document's format. A different residential address makes its fields and the proof of
  residence required. The P.O. Box rule has its own message.
- **Reference (`externalRef`):** bank customers enter the customer number (3–30 capital letters,
  digits or hyphens, the backend's `CUSTOMER_REF_PATTERN`). For employees the reference **is**
  the employee ID, so there is no separate field; its hint says so.
- **Defaults:** ID document type NIC and nationality LK (ordinary choices, not rules).

### 9.2 Validation flow

```mermaid
sequenceDiagram
    participant U as Officer
    participant F as Form (browser)
    participant V as Precompiled validators<br/>(same schema files)
    participant B as POST /holders
    participant S as Backend validator<br/>(same schema files)
    U->>F: types, leaves a field (blur)
    F->>V: claims (age_over_18 placeholder)
    V-->>F: issues {path, code}
    F-->>U: error under the touched field (en / si)
    U->>F: Register holder
    F->>V: whole form
    alt problems in the browser
        V-->>F: issues
        F-->>U: error summary (takes focus) + every field marked
    else valid
        F->>B: {externalRef?, claims}
        B->>S: claims (+ age_over_18 calculated)
        alt 400 VALIDATION_ERROR
            S-->>B: details[] {path, code, message}
            B-->>F: 400
            F-->>U: errors on their fields; unknown paths in the summary
        else 409 HOLDER_ALREADY_EXISTS
            B-->>F: 409 details.holderId
            F-->>U: message + link to the existing holder
        else 201
            B-->>F: the new record
            F-->>U: detail page + toast "… was registered."
        end
    end
```

- **When errors show:** after a field loses focus (blur), and for every field after a submit.
  Editing a field removes the server's error for it.
- **Error summary** (portal-ui `ErrorSummary`): at the top, `role="alert"`, takes focus after
  each failed submit, each item links to (and focuses) its field. Fields carry `aria-invalid`,
  `aria-required` and `aria-describedby` (hint + error).
- **Messages** come from the issue `code` (`holders.errors.*`), with the field's own text for
  pattern problems (`holders.fields.<field>.patternError`; for the ID number one per document
  type), so the browser and the server problems read the same, in English and Sinhala.
- **No double submit:** the button is disabled and shows "Registering…" while the request runs,
  and the submit handler ignores a second submit.
- **Unsaved changes:** a changed form asks "Leave without saving?" before an in-app navigation
  (React Router `useBlocker`, portal-ui `ConfirmDialog`) and before closing the tab
  (`beforeunload`). Not after a successful save.

**Same rules as the server:** `test/holders-validation.test.ts` runs every record of
`backend/seed-data` plus 28 crafted invalid claims through the portal validator and the
backend validator and expects identical issues.

### 9.3 List

- **Columns:** name (link), reference (label "Employee ID" or "Customer number"), ID number
  **masked**, date added (Asia/Colombo), credential count. A row click opens the holder.
- **Masking rule:** the list shows only the last 4 characters of the ID number
  (`•••• 0063`, read as "ID number ending in 0063"). The backend sends nothing more
  (`idNumberLast4`); the full number appears on the detail page only.
- **Search:** debounced (300 ms, Enter searches at once) through the backend's `search`
  (name or reference).
- **URL state:** `q`, `page`, `size` (10 / 20 / 50) and `sort` (`newest`, `oldest`, `name`,
  `name_desc`, `ref`, `ref_desc`) live in the query string, so Back and refresh keep the list.
  Defaults are left out (`/holders` stays plain); invalid values fall back to the defaults.
  Sorting is done by the backend; the column headings carry `aria-sort`.
- **States:** loading skeleton rows; "No holders yet" with **Register holder**; "No holders
  match “…”" with **Clear search**; error with **Try again**.

### 9.4 Detail

- Every registered field, grouped like the form, with option labels and dates in the
  language's style; **the full ID number** (only here).
- KYC: **Over 18: Yes / No**, the server's `age_over_18`, with "Calculated by the server from
  the date of birth".
- Date added and the staff member who added the record.
- **Credentials:** counts by effective status (badges) and a list (type, status badge, signed,
  expires). Links to each credential come with the credentials page.
- **Issue credential:** opens `/credentials/new?holderId=<id>` (section 10).

### 9.5 Privacy

Nothing about a holder is written to the browser console (a test spies on every console
method). The list carries no full ID numbers. Holder data is kept only in the TanStack Query
cache, which is cleared on sign-out.

### 9.6 Shared components (portal-ui)

`DataTable` (sortable headings, row click, loading rows), `Pagination`, `SearchInput`
(debounced), `FormField`, `ErrorSummary`, `StatusBadge`, `ToastProvider` / `useToast`,
`ConfirmDialog`, `Tooltip` and `Select`. All labels are passed in, so the verifier portal can
reuse them.

## 10. Issuing a credential

**Routes** (admin and officer; the Credentials route's roles):

| Path                                           | Page                                                          | Code                                            |
| ---------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| `/credentials`                                 | The credentials table (section 12); header "Issue credential" | `src/pages/credentials/CredentialsPage.tsx`     |
| `/credentials/new?holderId=&step=&validUntil=` | The four steps (without `holderId`: the picker)               | `src/pages/credentials/IssueCredentialPage.tsx` |
| `/credentials/:credentialId`                   | One credential's metadata; the success page with `?issued=1`  | `src/pages/credentials/CredentialPage.tsx`      |

**Entry points:** the holder page's **Issue credential** button, **Issue credential** in the
`/credentials` header (opens `/credentials/new`, whose picker uses the existing
`GET /holders?search=`), and **Issue another** on the success page.

**Rule (Decision 019):** claims are **never** assembled or edited in the portal. Every value shown
comes from `POST /credentials/preview`, which runs the same backend function as `POST
/credentials`. The issue request carries only `holderId`, `credentialType` and the optional
`validUntil`. A test asserts both request bodies and that the page shows the preview's values,
not the holder record's.

### 10.1 Flow

```mermaid
sequenceDiagram
    participant S as Staff (portal)
    participant SC as GET /credential-schemas
    participant P as POST /credentials/preview
    participant C as POST /credentials
    participant DB as Database
    S->>SC: which schemas may we issue?
    SC-->>S: one schema for the issuer type (fields: required, selectivelyDisclosable, derived; alwaysVisible)
    S->>P: {holderId, credentialType}
    P->>DB: read holder (no lock), check record, caps, no active credential, active key (no writes)
    P-->>S: alwaysVisible (iat planned), disclosable, derived, expiry {cappedBy, validUntilRange}
    Note over S: Step 2: read-only details, optional "Valid until"
    S->>P: {…, validUntil} (debounced 400 ms)
    P-->>S: new expiry (cappedBy validUntil)
    Note over S: Step 3: wallet card · Step 4: "checked against the original documents"
    S->>C: {holderId, credentialType, validUntil?}
    C->>DB: the same checks with the holder locked, then INSERT pending + status event
    C-->>S: 201 metadata (status pending)
    Note over S: /credentials/:id?issued=1 – "Awaiting wallet", wallet offer next
```

### 10.2 Steps

| Step              | Shows                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Holder and type | Holder card (name, reference, ID number masked to the last 4); the schemas from `GET /credential-schemas` as radio buttons (one today, pre-selected) with "Your organisation issues Employment / KYC credentials."                                                                                                                                                                                                                                                                                              |
| 2 Details         | The preview's claims, read-only, grouped like the holder form (no inputs); "Wrong details? Update the holder record". Validity: expiry, default expiry, the cap in plain words, optional **Valid until** (`min` / `max` from `validUntilRange`)                                                                                                                                                                                                                                                                 |
| 3 Preview         | portal-ui `CredentialCardPreview`, styled like a wallet card. "Always shown to verifiers": issuer, credential type, issued on ("Set when the holder accepts it"), expires on, credential ID "Assigned on issue". "Holder chooses what to share": every claim, each with a **Selectively disclosable** badge when the schemas response says so, and an info tooltip; derived claims "Calculated by UniVault" (`age_over_18` as "Over 18: Yes / No"). Footer: "Bound to the holder's wallet when they accept it." |
| 4 Confirm         | Summary, required checkbox "I confirm these details were checked against the original documents", **Issue credential** (disabled and "Issuing…" while the request runs; a second click is ignored)                                                                                                                                                                                                                                                                                                              |
| Result            | `/credentials/:id?issued=1`: "Credential created", **Awaiting wallet** badge, id, type, expiry, holder link, the "Wallet offer (QR code) – next step" card with **Create wallet offer** (section 11), **Back to holder**, **Issue another**                                                                                                                                                                                                                                                                     |

**Cap explanations** (`expiry.cappedBy`): `id_document_expiry` → "Limited to the passport's
expiry date" (or "the driving licence's", by `id_document_type`); `18th_birthday` →
"Limited to the holder's 18th birthday"; `validUntil` → "Ends on the date you chose."

### 10.3 State and navigation

- **In the URL:** `holderId`, `step` (1–4) and `validUntil`. Back / forward move between steps;
  a refresh keeps them. Completed steps can be chosen in the `Stepper`.
- **Valid until:** typed dates outside the range show "Choose a date from … to …" and send
  nothing. A date in range asks for a new preview after 400 ms (the URL is replaced, not
  pushed). A date the server refuses is dropped from the URL and the field shows the error, so
  the page falls back to the default preview.
- **Leaving after step 1** (another page, Cancel) asks "Leave without issuing?". Not after
  issuing.
- **Cache:** the preview query has `gcTime: 0` (it holds claims); the backend sends `no-store`.

### 10.4 Errors

| Problem (preview or issue)                             | Shown                                                                                                                                                       |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `409 ACTIVE_CREDENTIAL_EXISTS`                         | "…already has an active or pending credential of this type. Revoke or reissue it first." + link to `/credentials/<details.credentialId>`. **Next** disabled |
| `422 HOLDER_DATA_INVALID`                              | "The holder record no longer meets the credential rules…" + link to the holder record                                                                       |
| `409 ISSUER_KEY_MISSING`, `503 ISSUER_KEY_UNAVAILABLE` | "Issuing is unavailable – contact your administrator."                                                                                                      |
| `404 HOLDER_NOT_FOUND`                                 | "This holder was not found."                                                                                                                                |
| Network failure, anything else                         | The usual message (with the request reference) and **Try again**                                                                                            |
| `400` on `validUntil`                                  | On the date field (above)                                                                                                                                   |

Code: `src/issuance/problems.ts`, `src/issuance/IssuanceProblemAlert.tsx`.

### 10.5 Shared components (portal-ui)

`Stepper` (numbered steps, `aria-current="step"`, the state in words for screen readers,
completed steps selectable) and `CredentialCardPreview` (a card with sections and items passed
in). The badge and tooltip are the existing `Badge` and `Tooltip`.

## 11. Wallet offer (QR code)

**Route:** `/credentials/:credentialId/offer` (admin and officer; the Credentials route's
roles), `src/pages/credentials/CredentialOfferPage.tsx`. **Entry points:** **Create wallet
offer** on the issuance success page and on the credential page, shown only while the
credential is `pending`. **API:** [credential-offers-api.md](../api/credential-offers-api.md).
**Decision:** [021](../dev-log/decisions.md#decision-021-pre-authorised-code-kept-only-in-portal-memory-qr-never-re-shown).

Opening the page reads the credential (`GET /credentials/:id`, fresh each visit) and, if it is
pending with no active offer, creates one (`POST /credential-offers`). Beside the QR code:
holder name, credential type, "Expires at HH:MM (Asia/Colombo)" and a mm:ss countdown.

### 11.1 States

```mermaid
stateDiagram-v2
    [*] --> creating: pending, no active offer
    [*] --> reload: pending, active offer, code not in memory
    [*] --> notPending: valid / revoked / superseded / expired
    reload --> creating: Generate new QR code
    creating --> active: 201 (code kept in memory)
    creating --> failed: error (expired credential, network…)
    failed --> creating: Generate new QR code
    active --> active: poll every 5 s / on focus
    active --> redeemed: status redeemed
    active --> expired: countdown 0 or status expired
    active --> replaced: invalidated, reason replaced
    active --> cancelled: Cancel offer (confirmed) or reason cancelled
    active --> withdrawn: reason credential_revoked / credential_superseded
    active --> creating: Generate new QR code (confirmed)
    expired --> creating: Generate new QR code
    replaced --> creating: Generate new QR code
    cancelled --> creating: Generate new QR code
    redeemed --> [*]
    withdrawn --> [*]
```

| State      | Shows                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| active     | QR code (≥ 288 px), countdown, **Show full screen**, **Generate new QR code** (asks first), **Cancel offer** (asks first)            |
| redeemed   | "Accepted by the holder's wallet", QR removed, link to the credential                                                                |
| expired    | QR removed (not blurred: a blurred code can still be in the DOM), "This QR code has expired", **Generate new QR code** (no question) |
| replaced   | "A newer QR code was generated for this credential" (e.g. another tab), QR removed                                                   |
| cancelled  | "Offer cancelled", QR removed                                                                                                        |
| withdrawn  | "This credential can no longer be offered" (revoked or reissued meanwhile), no Generate                                              |
| reload     | "For security, this QR code can't be shown again. Generate a new one to continue." The code is never fetched again                   |
| notPending | "Only a credential awaiting the wallet can be offered" and the credential's status                                                   |

**Polling:** `GET /credential-offers/:offerId` every 5 s and on window focus while the last
status was `active`; it stops in every final state (`redeemed`, `expired`, `invalidated`).
The **server status is authoritative**: when the countdown reaches zero but the server last
said `active`, the page asks at once and keeps polling until the server confirms; if the
server answers `active` (with a later `serverTime`), the QR stays.

### 11.2 The countdown and clock skew

Every offer response carries `serverTime`. The portal measures
`offset = serverTime − (sentAt + receivedAt) / 2` (`measureClockOffset` in
`src/api/offers.ts`) on creation and again on every poll, and counts down
`expiresAt − (Date.now() + offset)`, rounded **down** (never more time than the server
allows). A PC clock hours fast or slow therefore still shows the full lifetime (05:00 with the
default `CREDENTIAL_OFFER_TTL_SECONDS=300`) for a new offer (tested with
`±` skew). It ticks once a second (`useNow`).

- **Last minute:** the countdown turns amber and "Less than a minute left. Generate a new QR
  code if the holder needs more time." appears.
- **Screen readers:** the visible mm:ss is `role="timer"` (not live). A separate polite live
  region says "N minutes left to scan the QR code", which changes once a minute, and "1 minute
  left – the QR code expires soon" at one minute. Only the visible countdown (main or full
  screen) has the live region.

### 11.3 Secret handling (the QR text holds the one-time code)

- `createOffer()` is called **directly, not through TanStack Query**: no query or mutation
  cache ever holds the code. The response lives in the page's React state only.
- Never in the URL (the route has only the credential id), `sessionStorage`, `localStorage`
  or the console. A test spies on `Storage.prototype.setItem` and every `console` method and
  searches the query caches and the URL for each code issued.
- The status and cancel responses hold no code; their queries (`['credential-offers', id]`)
  have `gcTime: 0` and are **removed when the page unmounts**. The credential query of this
  page has its own key with `gcTime: 0`, so returning to the page reads `activeOffer` fresh.
- **Never re-shown:** opened without the code in memory while an offer is active (reload, back
  button, second tab), the page shows the reload state; "Generate new QR code" replaces the old
  offer.
- **QR alt text:** "QR code to add this credential to a UniVault wallet", never the URI. The
  SVG holds only the drawing (no `<title>`, no data attribute with the text).
- **Developer details** (collapsible `<details>`, the decoded `credential_offer` with a
  warning that it contains the one-time code) render only when `import.meta.env.PROD` is
  false. The check is inline at the render site, so the production build removes the panel's
  code; `scripts/check-production-bundle.mjs` (run by `npm run build`) checks the bundle.

### 11.4 The QR code

Generated in the browser by portal-ui `QrCode` from the `qrcode` library's module matrix
(`qrcode` 1.5.4, no network calls): error correction **M**, a 4-module quiet zone, black on
white, drawn as one SVG path with `shape-rendering="crispEdges"` and no inline styles (CSP).
The size is at least the requested 288 px and always a whole number of pixels per module,
because fractional scaling gives uneven modules (the e2e screenshot did not decode at 3.4 px
per module). The encoded text is exactly the backend's `qrContent`; unit tests decode the
rendered SVG with jsQR, and the e2e test decodes a screenshot.

**Full screen:** portal-ui `FullscreenOverlay` (dialog, focus on Close, Tab trapped, Esc
closes) with a QR code of at least 560 px and the large countdown.

### 11.5 Shared components (portal-ui)

`QrCode` (+ `qrMatrix`, `qrPath`), `Countdown` (+ `formatCountdown`), `FullscreenOverlay`.
The confirmations use the existing `ConfirmDialog`.

## 12. Credentials table, revoke and reissue

**Routes** (admin and officer; the Credentials route's roles. The backend enforces the roles:
revoke is admin only):

| Path                                                 | Page                                                             | Code                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------- |
| `/credentials?effectiveStatus=&q=&sort=&page=&size=` | The table; "Issue credential" (holder picker) in the header      | `src/pages/credentials/CredentialsPage.tsx`       |
| `/credentials/:credentialId`                         | Summary, wallet offer, Replaces / Replaced by, timeline, actions | `src/pages/credentials/CredentialPage.tsx`        |
| `/credentials/:credentialId/reissue`                 | Reissue (valid) or Renew (expired) with the server preview       | `src/pages/credentials/ReissueCredentialPage.tsx` |

Shared code is in `src/credentials/`: `actions.ts` (the rule), `action-items.ts` (labelled
items), `RevokeDialog.tsx`, `CredentialStatusBadge.tsx`, `conflicts.ts` (409 messages),
`invalidate.ts` (query invalidation) and `list-params.ts` (the URL state).

### 12.1 The table

- **Data:** one `GET /credentials` per page (filters, `q`, `sort`, `limit`, `offset`). Each row
  carries what the table needs, plus `hasActiveOffer`, and the response has the tab `counts`
  (docs/api/credentials-api.md). No call per row.
- **Columns:** short id (first 8 characters, a link to the credential, with a copy button for
  the full id), holder (name as a link to the holder, reference underneath), type, status badge,
  issued (signing date, or "Not yet accepted"), expires (with "Expires in n days" / "Expires
  today" for active credentials within 30 days, the dashboard's window), actions menu.
- **Status badge:** the **effective** status in plain words: Active (`valid`), Awaiting wallet
  (`pending`), Revoked, Replaced (`superseded`), Expired. The page shows the stored status next
  to it when the two differ.
- **No ID numbers or claims:** rows have the holder's name and reference only. A test checks
  that NIC numbers, their last four characters and other claim values never appear.
- **Tabs:** All, Active, Awaiting wallet, Expired, Revoked, Replaced, each with its count from
  `counts` (same search, no status filter). portal-ui `FilterTabs`: toggle buttons with
  `aria-pressed`, not ARIA tabs, because the same list is filtered.
- **Search:** holder name, reference or the start of the credential id; debounced (portal-ui
  `SearchInput`, 300 ms), Enter searches at once.
- **Sort:** Holder, Issued (creation time) and Expires, both ways, through the column headers
  (`aria-sort`).
- **Paging:** 10 / 20 / 50 per page.
- **URL:** `effectiveStatus`, `q`, `sort`, `page`, `size` (defaults are left out; unknown values
  are ignored), so Back, refresh and links keep the view. A new tab, search or sort goes back
  to page 1.
- **Dashboard links:** each card opens its tab (`/credentials?effectiveStatus=valid`, …).
  "Expiring in 30 days" opens the Active tab sorted by expiry (`&sort=expires`). There is no
  separate expiring filter.
- **States:** skeleton rows while loading (the previous page stays visible while the next one
  loads); an error with "Try again"; an empty state per tab ("No credentials yet" offers
  "Issue credential"); "No credentials match …" with "Clear search".

### 12.2 Action rules (one function)

`credentialActions(credential, role)` in `src/credentials/actions.ts` is **the** rule. The
table menu, the credential page buttons, the reissue page guard and the tests all use it
(through `credentialActionItems()` for the labels):

| Effective status | Admin                              | Officer                                                                          |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Active (`valid`) | Revoke, Reissue                    | Reissue; Revoke shown **disabled**: "Only administrators can revoke credentials" |
| Awaiting wallet  | Revoke, Create / Show wallet offer | Create / Show wallet offer; Revoke disabled (same reason)                        |
| Expired          | Revoke, **Renew** (= reissue)      | Renew; Revoke disabled (same reason)                                             |
| Revoked          | View only                          | View only                                                                        |
| Replaced         | View only                          | View only                                                                        |

The table menu also has "View details". "Show wallet offer" appears when `hasActiveOffer` is
true: the offer screen then explains that the code can't be shown again and offers a new one
(Decision 021). The expired rules follow the backend (docs/api/credentials-api.md §6.5). A
disabled item stays focusable (`aria-disabled`) and has its reason as visible text linked with
`aria-describedby`, so it works as a tooltip that keyboard and touch users can also read. The
rule is a convenience: the backend still refuses (403 for an officer's revoke).

### 12.3 Dialogs

**Revoke** (`RevokeDialog`, portal-ui `Dialog`: focus inside, Tab trapped, Escape closes unless
busy):

- the reason is a select of the backend enum in plain words;
- the note is required for "Other", at most 500 characters (the backend's limit), and trimmed;
- the warning: "This cannot be undone. The holder's wallet and verifiers will see this
  credential as revoked.", plus "The wallet offer will stop working." for a pending credential;
- the confirm button reads "Revoke <holder name>'s credential". It is disabled until a reason is
  chosen and while the request runs (no double submit);
- success shows a toast and closes the dialog.

**Reissue / Renew** (a page, `/credentials/:id/reissue`):

1. Choose a reason (the backend enum). A note is needed for "Other", and the page says so until
   one is entered. "Valid until" is optional, with the same range, out-of-range message and cap
   explanation as issuance.
2. `POST /credentials/:id/reissue/preview` (debounced on "Valid until", `gcTime: 0` because it
   holds claims) shows **Current vs Replacement**, field by field in the holder form's order.
   Changed fields are highlighted and labelled "Changed", with a count. When nothing changed it
   says "No details changed…": the reissue is still allowed (lost wallet, validity extension).
   Then the expiry row and "Expiry moves from … to …".
3. The issuance confirmation checkbox is required. On success: a toast, the invalidations below,
   then `/credentials/<newId>/offer` (the replacement's wallet offer).

Claims are never assembled in the portal (Decision 019): both sides come from the preview
response.

### 12.4 Credential page

The page shows a summary (type, status badge and the stored status if it differs, the full id
with a copy button, the holder link and reference, created by whom, accepted by the wallet,
expires, revoked when / by whom / why) and the "Replaces" / "Replaced by" links. While the
credential is pending it has a wallet offer card with the active offer's expiry only (never the
code) and a link to the offer screen.

The **status timeline** comes from `GET /credentials/:id/events` and uses plain wording
("Created – awaiting the wallet", "Accepted by the holder's wallet", "Revoked", "Replaced by a
reissued credential"), the staff name ("by the holder's wallet" for signing), the reason in
plain words and the time in Asia/Colombo. Notes are never shown.

The page has the same actions as the table, as buttons. An unknown credential or another
issuer's (404) shows "Credential not found".

### 12.5 After an action: invalidation and conflicts

After a revoke, a reissue, or a refused one (409 or 404: the data on screen is out of date),
`invalidateAfterCredentialChange()` invalidates:

| Query key prefix           | Covers                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `['credentials']`          | the table (every page and tab), each credential's detail, events, reissue preview, a holder's credential summary (`['credentials', 'holder', id]`) |
| `['dashboard', 'summary']` | the dashboard counts and activity                                                                                                                  |
| `['holders']`              | the holder list and detail (credential counts)                                                                                                     |

**409 conflicts** are explained in plain words, and the page refreshes:

| Code                         | Message                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `CREDENTIAL_ALREADY_REVOKED` | Another staff member already revoked this credential. The page has been refreshed.                     |
| `CREDENTIAL_SUPERSEDED`      | This credential was already replaced by a reissued one. The page has been refreshed.                   |
| `CREDENTIAL_NOT_REISSUABLE`  | A credential that is still awaiting the wallet cannot be reissued. Revoke it and issue a new one.      |
| `ACTIVE_CREDENTIAL_EXISTS`   | The holder already has another active or pending credential of this type. The page has been refreshed. |

`HOLDER_DATA_INVALID` (422), `ISSUER_KEY_*`, `FORBIDDEN` and `CREDENTIAL_NOT_FOUND` have their
own messages; anything else uses the general API error messages.

### 12.6 Shared components (portal-ui)

`Dialog` (a modal with content: a form or more than a yes/no; use `ConfirmDialog` for yes/no),
`ActionMenu` (a disclosure button with a list of actions; disabled items keep their reason),
`FilterTabs` (toggle buttons with counts) and `CopyButton` (copies, then announces "Copied").
They take translated labels only, so portal-ui stays app-agnostic.
