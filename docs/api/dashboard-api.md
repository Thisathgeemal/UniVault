# Issuer Dashboard API

**Sprint:** S2 · **Requirements:** FR-ISS-01, FR-ISS-03, NFR-08 · **Related:**
[credentials-api.md](credentials-api.md), [status-api.md](status-api.md) (the shared
`effectiveStatus()` rule, Decision 013), [issuer-portal.md](../frontend/issuer-portal.md)
(section 8, the dashboard page)
**Code:** `backend/src/services/dashboard.service.ts`, `backend/src/routes/dashboard.routes.ts`
· **Tests:** `backend/test/dashboard.test.ts`, `backend/test/db/seed-demo.test.ts`

## 1. Purpose

One request gives the issuer portal's dashboard everything it shows: credential counts by
status, the number of holder records and the organisation's ten most recent credential status
changes. It is computed live, for the signed-in staff member's **own** issuer only.

## 2. Endpoint

```
GET /api/v1/dashboard/summary
Authorization: Bearer <staff token>
```

| Item         | Rule                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| Login        | Required (`requireAuth`)                                                                  |
| Roles        | `officer` and `admin`                                                                     |
| Issuer       | **Always from the token** (`req.auth`). No issuer id in the path or query; one is ignored |
| Request body | None                                                                                      |
| Caching      | `Cache-Control: no-store`                                                                 |
| Clock        | The app's injected clock (`createApp(…, { now })`); never `Date.now()` in the rule        |

## 3. Response `200`

```json
{
  "issuer": { "id": "employer-a", "name": "Serendib Trading Company (Demo)" },
  "counts": {
    "issued": 11,
    "active": 8,
    "revoked": 1,
    "superseded": 1,
    "expired": 1,
    "awaitingWallet": 3,
    "expiringSoon": 3,
    "holders": 25
  },
  "expiringSoonDays": 30,
  "recentActivity": [
    {
      "credentialId": "8a01c2aa-…",
      "credentialType": "EmploymentCredential",
      "fromStatus": null,
      "toStatus": "pending",
      "reason": null,
      "staffName": "Demo data (development)",
      "at": "2026-11-25T04:19:12.000Z"
    },
    {
      "credentialId": "33d7b416-…",
      "credentialType": "EmploymentCredential",
      "fromStatus": "valid",
      "toStatus": "revoked",
      "reason": "employment_ended",
      "staffName": "Demo data (development)",
      "at": "2026-11-24T04:49:12.000Z"
    },
    {
      "credentialId": "67dba7d9-…",
      "credentialType": "EmploymentCredential",
      "fromStatus": "pending",
      "toStatus": "valid",
      "reason": null,
      "staffName": null,
      "at": "2026-11-22T06:49:12.000Z"
    }
  ],
  "generatedAt": "2026-11-25T04:49:12.000Z"
}
```

(The figures are what `npm run db:seed:demo` produces; the activity list is shortened here,
the API returns up to 10 entries.)

| Field              | Meaning                                                                           |
| ------------------ | --------------------------------------------------------------------------------- |
| `issuer`           | The staff member's organisation (`id`, `name`)                                    |
| `counts`           | See section 4                                                                     |
| `expiringSoonDays` | The window of `counts.expiringSoon` (30)                                          |
| `recentActivity`   | The last **10** status events of this issuer, **newest first** (section 5)        |
| `generatedAt`      | The instant all counts were computed at (ISO 8601, UTC); "Last updated" in the UI |

## 4. Count definitions

"Issued" means **signed**: `issued_at IS NOT NULL`. `issued_at` is set only by
`signCredential()` at redemption, together with `issuer_kid` and `holder_key_thumbprint`
(CHECK `credential_records_signing_fields`). The spec of this endpoint calls the column
`signed_at`; in the schema it is `issued_at`.

| Count            | Definition                                                                        |
| ---------------- | --------------------------------------------------------------------------------- |
| `issued`         | Signed credentials: `issued_at IS NOT NULL`                                       |
| `active`         | Issued **and** effective status `valid`: stored `valid` and `now < expires_at`    |
| `revoked`        | Issued **and** stored status `revoked`                                            |
| `superseded`     | Issued **and** stored status `superseded`                                         |
| `expired`        | Issued **and** effective status `expired`: stored `valid` and `expires_at <= now` |
| `awaitingWallet` | Stored status `pending` (created, never signed)                                   |
| `expiringSoon`   | `active` **and** `expires_at < now + 30 days` (strict)                            |
| `holders`        | Holder records of this issuer                                                     |

- **Revoked while pending:** a credential revoked before it was ever signed has
  `issued_at IS NULL`, so it is in **none** of the issued counts (and not in `awaitingWallet`:
  it is no longer pending). It still appears in the activity list.
- **Invariant:** `issued = active + revoked + superseded + expired`. It holds because of the
  database CHECKs: `valid` and `superseded` credentials are always signed, `pending` ones never
  are, so every signed credential is in exactly one of the four.
- **Same rule as everywhere else:** the expiry conditions are `effectiveStatusCondition()` in
  `services/credential-status.ts`, the SQL twin of `effectiveStatus()` (precedence revoked >
  superseded > expired > valid; expired when `now >= expires_at`, inclusive). The credential
  list filter `GET /credentials?effectiveStatus=…` uses the same function, so for the same
  instant:

  | Dashboard count  | Equals the `total` of                                                                                                                  |
  | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
  | `active`         | `GET /credentials?effectiveStatus=valid`                                                                                               |
  | `expired`        | `GET /credentials?effectiveStatus=expired`                                                                                             |
  | `superseded`     | `GET /credentials?effectiveStatus=superseded`                                                                                          |
  | `awaitingWallet` | `GET /credentials?effectiveStatus=pending`                                                                                             |
  | `revoked`        | `GET /credentials?effectiveStatus=revoked` **minus** the credentials revoked while pending (the list includes them; "issued" does not) |

- **One query:** all eight counts come from one aggregate SQL statement over
  `credential_records` (`COUNT(*) FILTER (WHERE …)` per count, plus the holder count as a scalar
  subquery), with `WHERE issuer_id = <token's issuer>`. It uses the existing index
  `credential_records_issuer_status_idx (issuer_id, status)` from migration 0001, so no new
  migration was needed.

## 5. Recent activity

From `credential_status_events` (append-only, Decision 012), joined to `credential_records`
and `issuer_staff`, filtered to the token's issuer.

| Field            | Value                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------- |
| `credentialId`   | The credential's id                                                                                 |
| `credentialType` | `EmploymentCredential` or `KYCCredential`                                                           |
| `fromStatus`     | Stored status before (`null` for creation)                                                          |
| `toStatus`       | Stored status after                                                                                 |
| `reason`         | The reason **code** (revocation / reissue enums, or the dev-only `dev_simulated_expiry`), or `null` |
| `staffName`      | `issuer_staff.display_name` of the staff member, or `null` for wallet events (signing)              |
| `at`             | When it happened (ISO 8601)                                                                         |

- **Order:** newest first; events of the same instant in reverse lifecycle order (a reissue's
  `valid → superseded` before the replacement's creation; signing after creation).
- **Never included:** the free-text `note`, holder names, claims, NIC numbers or any other
  personal data. Only reason codes. A test checks the JSON for a revocation note and the
  holder's claims.

## 6. Errors

| Status | Code                                                | When                         |
| ------ | --------------------------------------------------- | ---------------------------- |
| 401    | `UNAUTHENTICATED`, `INVALID_TOKEN`, `TOKEN_EXPIRED` | No, invalid or expired token |
| 503    | `SERVICE_UNAVAILABLE`                               | No database configured       |

There is no 403 or 404 case: both staff roles may read it, and the issuer is never taken from
the request.

## 7. Example

```powershell
$token = (Invoke-RestMethod -Method Post http://localhost:4000/api/v1/auth/login `
  -ContentType 'application/json' `
  -Body '{"email":"admin@serendib-trading.example","password":"<seed password>"}').accessToken
Invoke-RestMethod http://localhost:4000/api/v1/dashboard/summary `
  -Headers @{ Authorization = "Bearer $token" } | ConvertTo-Json -Depth 5
```

Without data the counts are all `0` and `recentActivity` is `[]`. Run `npm run db:seed:demo`
(section 8) first for meaningful numbers.

## 8. Development demo data: `npm run db:seed:demo`

`backend/src/db/seed-demo.ts`, from `backend/`. Needs `npm run db:seed` and `npm run
keys:init` first (and `ISSUER_KEY_PASSPHRASE`). **Refused when `NODE_ENV=production`.**

For the seed issuer **Serendib Trading** (`employer-a`) only, it creates credentials for 14
existing seed holders through the real services:

| Status                     | How                                                                                     | Count         |
| -------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| Active                     | `create()` + `signCredential()` with a throwaway wallet key                             | 4             |
| Active, expiring ≤ 30 days | Same, created just under a year ago (default validity P1Y ends 6, 14 and 23 days ahead) | 3             |
| Superseded                 | Signed, then `reissue()`; the replacement is signed (one more active)                   | 1 (+1 active) |
| Expired                    | Signed, then `simulateExpiry()` (the dev simulate-expiry mechanism)                     | 1             |
| Revoked after signing      | Signed, then `revoke()` (`employment_ended`)                                            | 1             |
| Revoked while pending      | `revoke()` of a pending credential (`issued_in_error`)                                  | 1             |
| Pending                    | `create()` + `createOffer()` (an open offer each, made at the real time)                | 3             |

- **History:** past steps run with an injected clock, so the activity list shows weeks of use.
- **Marker:** every action is performed by an inactive staff account
  `demo-data@serendib-trading.example` ("Demo data (development)", random password that is
  never stored in clear or printed, so it can never sign in). Demo rows = credentials created
  by that account.
- **Idempotent:** a second run prints `skipped` and the current counts, taken at the real
  time. They change over time: open offers drop to 0 once they pass
  `CREDENTIAL_OFFER_TTL_SECONDS`, and the 3 "expiring" credentials become expired 6–23 days
  after the first run.
- **`--reset`** (`npm run db:seed:demo -- --reset`) removes **only** the demo rows (their
  offers, status events and credentials, and the demo account); then run it again without the
  flag for fresh data. Because `credential_status_events` is append-only, the reset lifts that
  trigger inside its one transaction for the demo rows only (Decision 017).
- **Output:** counts per status only (no ids, names, claims or keys):

  ```
    created   demo credentials:
  ┌─────────┬──────────────────────────────────────┬─────────────┐
  │ (index) │ status                               │ credentials │
  ├─────────┼──────────────────────────────────────┼─────────────┤
  │ 0       │ 'active'                             │ 8           │
  │ 1       │ '  of which expiring within 30 days' │ 3           │
  │ 2       │ 'awaiting wallet (pending)'          │ 3           │
  │ 3       │ '  open offers'                      │ 3           │
  │ 4       │ 'revoked after signing'              │ 1           │
  │ 5       │ 'revoked while pending'              │ 1           │
  │ 6       │ 'superseded'                         │ 1           │
  │ 7       │ 'expired'                            │ 1           │
  └─────────┴──────────────────────────────────────┴─────────────┘
  ```

- Every other issuer stays empty.
- The Playwright e2e backend runs it too (`issuer-portal/e2e/start-backend.mjs`).
