# Sprint 1: Foundations, Cryptographic Core and Issuer Portal

| Item   | Detail                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------- |
| Dates  | Mon 16 Nov – Sat 21 Nov 2026                                                                      |
| Goal   | Issuer can create, sign, revoke and reissue SD-JWT credentials; issuance API ready for the wallet |
| Review | Sun 22 Nov 2026                                                                                   |

[Back to the dev-log index](README.md)

## Daily log

### Mon 16 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Tue 17 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Wed 18 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Thu 19 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

### Fri 20 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

### Sat 21 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

### Tue 24 Nov (Sprint 1 carry-over: revoke and reissue)

- **Done:** Credential revocation and reissuance (FR-ISS-03, Decision 012, draft).
  `POST /credentials/:id/revoke` (admin; pending or valid → revoked; open offers invalidated),
  `POST /credentials/:id/reissue` (officer/admin; valid → superseded plus a new pending
  replacement built from the holder's current record through the issuance code) and
  `GET /credentials/:id/events` (status history). Migration `0005` adds the revoke/supersede
  columns, the append-only `credential_status_events` table with a backfill, and new CHECK rules.
  `signCredential` now writes the `pending → valid` event, and `findOfferByCode` reports offers
  of non-pending credentials as `invalidated`. Development-only simulated redemption route
  (`DEV_SIMULATE_REDEMPTION=true`) and the evidence script `scripts/evidence/s1-revocation.ps1`.
  Backend tests: 287 → 364 (12 → 14 files), all passing (crypto-core unchanged at 158).
- **Next:** Supervisor review of Decision 012; Sprint 2 wallet redemption (then remove the
  simulate route); status endpoint reading `revoked` / `superseded`.
- **Blockers:** None.
- **Evidence:** `backend/test/credential-revocation.test.ts`, `backend/test/dev-routes.test.ts`;
  screenshots of the seven sections of `scripts/evidence/s1-revocation.ps1` (to be taken:
  `evidence/s1-2026-11-24-revocation-<section>.png`).

### Tue 24 Nov (follow-up polish: revoke and reissue)

- **Done:**
  - A stored holder record that no longer passes its credential schema now gives the same
    `422 HOLDER_DATA_INVALID` from issuance and reissue (one code path). `400 VALIDATION_ERROR`
    is kept for invalid request bodies only.
  - Migration `0006_reason_value_checks.sql`: CHECK constraints limit `revocation_reason` and
    `credential_status_events.reason` to the API enum values, added `NOT VALID` so older
    free-text rows survive (PGlite supports `NOT VALID`; checked first).
  - Backend coverage thresholds in `vitest.config.ts` (statements 88, branches 85,
    functions 93, lines 89), just below the current figures.
  - Removed an unused `eslint-disable` comment in `error-handler.ts`; root lint now has no
    warnings.
  - Decision 012 sprint label set to "S2 (Sprint 1 carry-over)"; `validUntil` documented as
    00:00 UTC on that date.
  - The server logs one warning at start-up when `DEV_SIMULATE_REDEMPTION=true`.
  - Backend tests: 364 → 371 (14 files), all passing; coverage 88.61% statements, 85.45%
    branches, 93.04% functions, 89.18% lines.
- **Temporary (remove in Sprint 2):** the development-only simulated redemption route
  (`POST /api/v1/dev/credentials/:id/simulate-redemption`, `src/routes/dev.routes.ts`,
  `DEV_SIMULATE_REDEMPTION`, `test/dev-routes.test.ts`) exists only for manual testing and the
  evidence script. Remove it, its config variable and its tests when wallet redemption
  (`POST /credential-offers/credential`) ships, and switch the evidence script to the real
  redemption flow.
- **Next:** As above.
- **Blockers:** None.
- **Evidence:** `backend/test/db/schema.test.ts` ("migration 0006"), `backend/test/credentials.test.ts`
  and `backend/test/credential-revocation.test.ts` (422 `HOLDER_DATA_INVALID`),
  `backend/test/dev-routes.test.ts` (start-up warning).

### Tue 24 Nov (Sprint 1 carry-over: credential status endpoint)

- **Done:** Public credential status API (FR-BAK-01, Decision 013, draft).
  - `GET /api/v1/status/:credentialId` replaces the `501` placeholder. It needs no login and
    returns exactly `{ credentialId, status, expiresAt, checkedAt }`.
  - Unknown and pending IDs get the same `404 CREDENTIAL_STATUS_NOT_FOUND` (extended in the
    follow-up below to every never-signed credential).
  - `Cache-Control: no-store`; CORS open to any origin for `GET` on this route only.
  - Per-IP rate limit (`STATUS_RATE_LIMIT_MAX` 60 / `STATUS_RATE_LIMIT_WINDOW_MINUTES` 1).
  - Lookups are logged at debug level only and never stored.
  - One pure `effectiveStatus(record, now)` (revoked > superseded > expired > valid,
    inclusive expiry; `expired` computed, never stored) with an injected clock. It also
    gives the portal's new `effectiveStatus` field and `?effectiveStatus=` list filter.
  - `jti` was already the credential ID (non-disclosable). Expiry instants are now whole
    seconds, so the SD-JWT `exp` equals `expires_at` exactly.
  - Dev-only `simulate-expiry` route; migration `0007` allows its `dev_simulated_expiry`
    event.
  - Evidence script `scripts/evidence/s1-status.ps1`: run end to end against a throwaway
    database on PowerShell 5.1, all seven sections as expected.
  - Backend tests: 371 → 407 (14 → 15 files), all passing; coverage 89.31% statements,
    85.84% branches, 93.08% functions, 89.86% lines (thresholds 88 / 85 / 93 / 89).
- **Temporary (remove in Sprint 2):** `POST /api/v1/dev/credentials/:id/simulate-expiry`, next
  to simulate-redemption (same `DEV_SIMULATE_REDEMPTION` flag, admin, own issuer, refused in
  production). Remove both routes, the flag and their tests when wallet redemption ships; keep
  migration 0007.
- **Next:** Supervisor review of Decisions 012 and 013; Sprint 2 wallet redemption; verifier
  policy for `revoked` / `superseded` / `expired` / unreachable status (Sprint 3).
- **Blockers:** None.
- **Evidence:** `backend/test/credential-status.test.ts`, `backend/test/dev-routes.test.ts`;
  screenshots of the seven sections of `scripts/evidence/s1-status.ps1` (to be taken:
  `evidence/s1-2026-11-24-status-<section>.png`).

### Tue 24 Nov (follow-up: status visibility, push-pull, log template)

- **Done:**
  - **Visibility rule:** only signed credentials (`issued_at` set) have a public status. A
    credential revoked while pending now gets the same `404 CREDENTIAL_STATUS_NOT_FOUND` as an
    unknown ID (it used to report `revoked`). `effectiveStatus()` is unchanged, so the issuer
    API still shows `revoked`. The rule is applied in the status service.
  - Decision 013: requirements are now FR-VER-02, FR-WAL-05, FR-ISS-03, FR-BAK-01, NFR-06 and
    NFR-08. A consequence records that the endpoint is the **pull** half of FR-BAK-01's
    push-pull synchronisation (`checkedAt` = staleness timestamp); the **push** half
    (notifying wallets) is planned for a later sprint.
  - **Logging:** every log line of the status route (request lines, 4xx, the 429 warning) shows
    the route template `/api/v1/status/:credentialId` instead of the URL. Other methods under
    `/status` get a 404 whose message has no credential ID.
  - Backend tests: 407 → 409 (15 files), all passing; coverage 89.35% statements,
    85.81% branches, 93.11% functions, 89.90% lines.
  - `scripts/evidence/s1-status.ps1` is unchanged: section 2 already revokes a credential
    after simulate-redemption, so its screenshot stays valid.
- **Next / Blockers:** As above / none.
- **Evidence:** `backend/test/credential-status.test.ts` (visibility, log template, 429 log).

## Testing evidence

Record the tests that show the sprint goal is met, with links to output in `evidence/`.

| Test / check | Type (unit / integration / manual) | Result | Evidence |
| ------------ | ---------------------------------- | ------ | -------- |
|              |                                    |        |          |

## Sprint review (Sun 22 Nov)

### Demoed

-

### Supervisor feedback

-

### Actions

| Action | Owner | Due / sprint |
| ------ | ----- | ------------ |
|        |       |              |

## Retrospective

### What went well

-

### What did not go well

-

### What to change in Sprint 2

-

## Issues and resolutions

### Issue 1: Expo Go could not connect to the development server (18 Nov 2026)

- **Task:** SD-JWT library spike (phone compatibility test)
- **Symptom:** After scanning the QR code from `npx expo start`, Expo Go on the phone did not finish loading the project.
- **Cause:** The phone could not reach the Metro server on the laptop over the local Wi-Fi network (likely network isolation or firewall).
- **Attempt:** Switched to tunnel mode with `npx expo start --tunnel`.
- **Follow-up error:** `CommandError: Couldn't create a signed tunnel URL for this project. You're not logged in to your Expo account` – newer Expo versions require an Expo account for their own tunnel.
- **Resolution:** Used the ngrok tunnel instead: `npx expo start --tunnel ngrok`. The app loaded and all 10 checks passed.
- **Lesson:** Tunnel mode avoids local network restrictions. An Expo account will be needed anyway for the Android build in Sprint 5.

### Issue 2: Test runner failed with "Cannot find native binding" (19 Nov 2026)

- **Task:** Issuer key generation (crypto-core), and again in createSdJwt
- **Symptom:** `npm test` failed with `Error: Cannot find native binding ... Cannot find module '@rolldown/binding-wasm32-wasi'`.
- **Cause (first time):** The `package-lock.json` supplied with the code had been generated on Linux, so it only listed the Linux build of Vitest's native component (rolldown). On Windows, npm did not install the Windows build – a known npm bug with optional dependencies (npm/cli#4828).
- **Resolution (first time):** Deleted `node_modules` and `package-lock.json` in `crypto-core/` and ran `npm install`, so npm generated a lock file for Windows.
- **Cause (second time):** The same npm bug recurred when new dependencies were installed on top of the existing `node_modules`.
- **Resolution (second time):** [describe what fixed it – e.g. clean reinstall with `npm cache verify`]
- **Lesson:** Never share lock files generated on another operating system. After adding dependencies, do a clean reinstall if native-binding errors appear.

### Issue 3: Seed command failed with "Password must be at least 10 characters" (20 Nov 2026)

- **Task:** Backend database design and implementation
- **Symptom:** `npm run db:seed` applied the migration, then stopped with `Password must be at least 10 characters`.
- **Cause:** `SEED_STAFF_PASSWORD=` was left empty in `.env` (as in `.env.example`). The seed command used the `??` operator, which treats an empty string as a real value, so it tried to hash an empty password instead of using the default.
- **Resolution:** Changed `??` to `||` in `src/db/cli.ts`, so an empty value falls back to the default password.
- **Lesson:** Environment variables copied from `.env.example` are often empty strings, not missing. Every place that reads `process.env` must treat empty as unset.

### Issue 4: Two backend tests timed out on Windows (20 Nov 2026)

- **Task:** Holder records API (full backend test run)
- **Symptom:** `test/server.test.ts` timed out waiting for "UniVault backend listening", and a migration test in `test/db/schema.test.ts` exceeded the 5 s default timeout. The other 184 tests passed.
- **Cause:** Each test file starts its own embedded PostgreSQL (PGlite, WebAssembly) and Vitest runs the files in parallel. On the development laptop, database start-up plus migrations under parallel load took longer than the test time limits.
- **Resolution:** Raised Vitest `testTimeout` to 30 s and `hookTimeout` to 60 s, and the server-process test wait to 60 s. No application code changed.
- **Lesson:** Time limits tuned on one machine can be too tight on another. Integration tests that start real services need generous timeouts.

### Issue 5: Credential tests hung on a database deadlock (20 Nov 2026)

- **Task:** SD-JWT credential issuance API
- **Symptom:** The first run of `test/credentials.test.ts` never finished. No test failed or timed out cleanly; the run had to be stopped after several minutes.
- **Cause:** Inside the `POST /credentials` database transaction, the check for an active issuer key queried through the main database handle (`db`) instead of the transaction handle (`tx`). PGlite has a single connection and holds it for the whole transaction, so that query waited for the transaction to finish, while the transaction waited for the query. On a PostgreSQL server the same mistake would not hang, but the query would silently run outside the transaction.
- **Resolution:** The active-key lookup now takes the transaction handle as a parameter, and `create()` passes `tx`. The full file then passed (61 tests).
- **Lesson:** Every query inside a transaction must use the transaction handle. A hang with no error in a PGlite test points to a query made through `db` while a transaction is open.

### Issue 6: Vitest failed in every test file under Git Bash (20 Nov 2026)

- **Task:** SD-JWT credential issuance API (crypto-core thumbprint tests)
- **Symptom:** `npm test` in `crypto-core/`, run from Git Bash, reported `TypeError: Cannot read properties of undefined (reading 'config')` at the first `describe` or `beforeAll` of all 6 test files, including files that had not changed, and ran no tests.
- **Cause:** Not fully confirmed. The same command passed from PowerShell, so the code was not at fault. The likely cause is that Git Bash reports the working directory as `/d/FYP/...` while Vitest resolves files as `D:/FYP/...`, so Vitest's test context did not match the files it loaded.
- **Resolution:** Ran all tests from PowerShell (158 crypto-core and 247 backend tests passed). Documented the rule in `CLAUDE.md` and `backend/README.md`.
- **Lesson:** On Windows, run Vitest from PowerShell or cmd. When every test file fails the same way, suspect the environment before the code.

### Issue 7: Revoking a pending credential failed with 500 (24 Nov 2026)

- **Task:** Credential revocation and reissue
- **Symptom:** The first run of `test/credential-revocation.test.ts` had 4 failures: revoking a
  `pending` credential returned `500`, and the tests that depended on it (offer invalidation,
  issuing again after revocation, the `created -> revoked` history) failed with it.
- **Cause:** Migration 0001 assumed every credential past `pending` had been signed (CHECK
  `credential_records_check1`: any other status needs `issued_at`, `issuer_kid` and
  `holder_key_thumbprint`). A credential revoked before redemption was never signed, so the
  database rejected the update. A second 0001 rule (`check3`) also required `revoked_at` on
  superseded rows, which conflicted with the new `superseded_at` column.
- **Resolution:** Migration 0005 (not yet applied anywhere outside tests) drops both 0001 rules
  and replaces them with `credential_records_signing_fields` (signing data all set or all NULL;
  `valid`/`superseded` signed, `pending` never, `revoked` either way) and separate revocation and
  supersede rules. Database tests now cover a revoked-while-pending row and the rejected cases.
- **Lesson:** CHECK constraints written before a feature exists encode assumptions about it.
  Review them when the feature arrives, and test the unusual path (revoke before redemption),
  not only the main one.

### Issue 8: A valid credential could not be created for the evidence script (24 Nov 2026)

- **Task:** Revocation evidence script
- **Symptom:** Sections "REVOKE VALID" and "REISSUE LINK" need a `valid` credential, but
  credentials only become valid at wallet redemption, which returns `501` until Sprint 2.
- **Cause:** Signing deliberately has one path, `signCredential()`, called only by redemption. A
  second process cannot sign directly either: the dev server holds the embedded PGlite database,
  and opening it from another process risks corrupting it.
- **Resolution:** A development-only route `POST /api/v1/dev/credentials/:id/simulate-redemption`
  (admin, own issuer) calls `signCredential()` with a throwaway P-256 key and returns metadata
  only. It is mounted only when `DEV_SIMULATE_REDEMPTION=true`, and the config refuses that
  setting in production. To be removed once redemption exists.
- **Lesson:** When a feature depends on a later sprint, plan a safe, clearly marked stand-in
  rather than a back door into the database.

### Issue 9: Evidence script needed PowerShell 7, which is not installed (24 Nov 2026)

- **Task:** Revocation evidence script
- **Symptom:** `-SkipHttpErrorCheck` and `-StatusCodeVariable` (needed to show `403`/`409`
  responses) exist only in PowerShell 7; the development laptop has Windows PowerShell 5.1 only.
- **Resolution:** The script uses those parameters on PowerShell 7 and, on 5.1, reads the status
  and error body from the exception instead. It was run end to end on 5.1 against a throwaway
  database (all seven sections as expected). The file is ASCII-only, because 5.1 misreads UTF-8
  without a BOM.
- **Lesson:** Check which PowerShell version is installed before relying on newer cmdlet
  parameters.

### Issue 10: A NULL reason passed the new "same-status event" CHECK (24 Nov 2026)

- **Task:** Credential status endpoint (migration 0007)
- **Symptom:** The migration test showed the database accepting a `valid → valid` status event
  with no reason. The new rule was meant to allow that only for `dev_simulated_expiry`.
- **Cause:** The rule was `from_status IS DISTINCT FROM to_status OR (reason =
'dev_simulated_expiry' AND …)`. With a NULL reason this is `false OR NULL`, which is NULL,
  and PostgreSQL lets a CHECK that evaluates to NULL pass.
- **Resolution:** Compare with `IS NOT DISTINCT FROM` so that a NULL reason gives `false`.
  Migration 0007 had only run in tests, so it was corrected before being applied anywhere else.
- **Lesson:** Write a negative test for every CHECK, including the NULL case. SQL's
  three-valued logic makes CHECKs fail open.

### Issue 11: SD-JWT `exp` and the stored expiry could differ by up to a second (24 Nov 2026)

- **Task:** Credential status endpoint
- **Symptom:** `exp` in the signed credential is whole seconds (`floor(expires_at)`), but
  `expires_at` kept the milliseconds of the issuance time. For up to a second, the token would
  say "expired" while the status endpoint still said "valid".
- **Resolution:** Expiry instants are rounded down to whole seconds when a credential is created
  or reissued (date caps were midnight already). A test checks `exp * 1000 == expires_at`.
  Rows created earlier may still carry milliseconds (development data only).
- **Lesson:** When the same instant is stored in two places with different precision, fix the
  precision at the source.
