# Evidence guide: issuer dashboard and credential statistics (S2)

What to run, open and click for each screenshot of the issuer dashboard
([docs/api/dashboard-api.md](../../api/dashboard-api.md),
[docs/frontend/issuer-portal.md](../../frontend/issuer-portal.md) §8, Decision 017). Save each
one in this folder under the file name given (`s1-2026-11-25-dashboard-<what>.png` would also
follow the naming rule in CLAUDE.md; the short names below match the other guides).

## Before you start

1. **Check `backend/.env`:** `JWT_EXPIRES_IN_SECONDS` must be at least 300 (3600 as in
   `.env.example`), and `ISSUER_KEY_PASSPHRASE` must be set. Otherwise every backend command
   below stops with "Invalid environment configuration".
2. PowerShell, in `backend/`:
   ```
   npm run db:seed
   npm run keys:init        # skip if the issuers already have keys
   npm run db:seed:demo     # prints the counts per status (screenshot 1)
   npm run dev              # API on http://localhost:4000
   ```
3. Second PowerShell, in `issuer-portal/`: `npm run dev` (portal on http://localhost:5173).
4. Seed logins (synthetic, **development only**): `admin@serendib-trading.example` and
   `officer@serendib-trading.example`, with the development seed password that `npm run
db:seed` prints. Never show the password or a token in a screenshot.
5. Chrome or Edge, about 1440 × 900, zoom 100%.

## Screenshots

| #   | File name                           | What to do                                                                                                                                                   | What must be visible                                                                                                                                                                                                                                                  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `s1-dashboard-seed-demo-output.png` | The `npm run db:seed:demo` output from step 2, then run it once more                                                                                         | First run: `created` and the table (active 8, expiring 3, pending 3, open offers 3, revoked after signing 1, revoked while pending 1, superseded 1, expired 1). Second run (within the offer TTL, 60 min by default): `skipped` with the same counts. No ids or names |
| 2   | `s1-dashboard-admin-desktop.png`    | Sign in as the **admin**                                                                                                                                     | The dashboard: organisation name, "Last updated … (Sri Lanka time)", Refresh; Issued 11, Active 8, Revoked 1; Awaiting wallet 3, Superseded 1, Expired 1, Expiring in 30 days 3, Holders 25; the bar and legend; Recent activity                                      |
| 3   | `s1-dashboard-activity.png`         | Scroll to **Recent activity** (zoom in if needed)                                                                                                            | Plain wording: "Revoked – employment ended", "Signed into wallet" with "Holder's wallet", "Replaced by a new credential", "Expiry simulated (development)"; shortened ids; relative + absolute times                                                                  |
| 4   | `s1-dashboard-api-summary.png`      | F12 → **Network** (Fetch/XHR), click **Refresh**, select the `summary` request; show **Headers** and **Response**                                            | `GET /api/v1/dashboard/summary` 200, `Cache-Control: no-store`, the JSON with the same numbers as the cards (crop or blur the `Authorization` header)                                                                                                                 |
| 5   | `s1-dashboard-card-link.png`        | Click the **Revoked** card                                                                                                                                   | The address bar shows `/credentials?effectiveStatus=revoked` (the page itself is still the Sprint 2 placeholder)                                                                                                                                                      |
| 6   | `s1-dashboard-officer.png`          | Sign out, sign in as the **officer**                                                                                                                         | The same numbers; the sidebar without Issuer keys and Staff                                                                                                                                                                                                           |
| 7   | `s1-dashboard-mobile.png`           | F12 → **Toggle device toolbar** (Ctrl+Shift+M), choose a phone (e.g. iPhone 12 Pro); take a full-size screenshot (DevTools ⋮ → Capture full size screenshot) | The cards stacked in one column, then the breakdown and the activity                                                                                                                                                                                                  |
| 8   | `s1-dashboard-sinhala.png`          | Desktop size; choose **සිංහල** in the header                                                                                                                  | Cards, breakdown and activity in Sinhala (නිකුත් කළ, සක්‍රිය, අවලංගු කළ, මෑත ක්‍රියාකාරකම්)                                                                                                                                                                                    |
| 9   | `s1-dashboard-loading.png`          | English again. F12 → **Network** → throttling **Slow 3G**, then press F5                                                                                     | Grey skeletons in the cards and below them while the summary loads                                                                                                                                                                                                    |
| 10  | `s1-dashboard-error-retry.png`      | Throttling back to **No throttling**. Stop the backend (Ctrl+C in its terminal), click **Refresh**                                                           | The red alert "The dashboard could not be loaded." with the network message and **Try again**; the last numbers stay visible. Start the backend again and click **Try again**: the alert goes away                                                                    |
| 11  | `s1-dashboard-empty.png`            | In `backend/`: `npm run db:seed:demo -- --reset` (prints `removed 15 demo credentials`), then click **Refresh** in the portal                                | All cards 0 (Holders 25), "No credentials issued yet", the guidance and **Go to Holders**. Afterwards run `npm run db:seed:demo` again to restore the demo data                                                                                                       |
| 12  | `s1-dashboard-backend-tests.png`    | `cd backend; npm run test:coverage`                                                                                                                          | `Tests 498 passed (498)` and coverage 90.08 / 86.26 / 93.79 / 90.65 above the thresholds                                                                                                                                                                              |
| 13  | `s1-dashboard-portal-tests.png`     | `cd issuer-portal; npm run test:coverage`                                                                                                                    | `Tests 81 passed (81)` and the coverage table                                                                                                                                                                                                                         |
| 14  | `s1-dashboard-portal-ui-tests.png`  | `cd portal-ui; npm run test:coverage`                                                                                                                        | `Tests 31 passed (31)`                                                                                                                                                                                                                                                |
| 15  | `s1-dashboard-e2e-pass.png`         | `cd issuer-portal; npm run test:e2e` (own ports 4100 / 5180; the dev servers may keep running)                                                               | `ok 1 [chromium] › … staff sign-in, role-based menu, dashboard numbers and sign-out` and `1 passed`                                                                                                                                                                   |

**Note on Sinhala dates:** in Sinhala the relative times ("2 hours ago") and month names stay
English, because the browser has no Sinhala data for them (issuer-portal.md §8.6).
