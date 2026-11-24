# Credential Status API

**Sprint:** S2 (Sprint 1 carry-over) · **Component:** backend
(`src/routes/status.routes.ts`, `src/services/credential-status.ts`)
**Requirement:** FR-BAK-01 · **Decision:** [013](../dev-log/decisions.md#decision-013-per-credential-status-endpoint-ietf-token-status-list-as-future-work)
**Tests:** `backend/test/credential-status.test.ts` · **Evidence:** `scripts/evidence/s1-status.ps1`

## 1. Purpose

Verifiers (and the wallet) need to know whether a credential is still good **now**: a
signature check alone can't tell that it was revoked or replaced after it was issued.
Every signed credential carries its own status address:

```json
"jti": "5f8c1e6d-586b-4547-9fd9-68830ffa8638",
"status": { "status_uri": "<PUBLIC_BASE_URL>/api/v1/status/5f8c1e6d-586b-4547-9fd9-68830ffa8638" }
```

`jti` is the credential ID and is always visible (never a disclosure). The verifier calls
`status_uri` and gets one of four answers.

## 2. Endpoint

| Method | Path                           | Auth              | Purpose                          |
| ------ | ------------------------------ | ----------------- | -------------------------------- |
| GET    | `/api/v1/status/:credentialId` | **None** (public) | Current status of one credential |

`:credentialId` must be a UUID (the `credential_records.id` format); anything else is
`400 VALIDATION_ERROR`.

## 3. Response `200`

Exactly these four keys, nothing else:

```json
{
  "credentialId": "5f8c1e6d-586b-4547-9fd9-68830ffa8638",
  "status": "valid",
  "expiresAt": "2027-11-24T09:34:18.000Z",
  "checkedAt": "2026-11-24T09:34:19.063Z"
}
```

| Field          | Meaning                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| `credentialId` | The ID that was asked for (the SD-JWT's `jti`)                            |
| `status`       | `valid`, `revoked`, `superseded` or `expired` (section 4)                 |
| `expiresAt`    | The credential's expiry; always equal to the SD-JWT `exp` (whole seconds) |
| `checkedAt`    | When the server worked out the status (its clock)                         |

**Never returned:** revocation reason or note, replacement credential ID, holder data,
issuer staff, or the times of status changes.

## 4. Status rules

**Visibility rule: only signed credentials have a public status.** A credential that was
never signed (`issued_at IS NULL`: `signCredential()` sets it at wallet redemption) never
reached a wallet, so the endpoint answers exactly as for an unknown ID. That covers
`pending` credentials **and credentials revoked while pending**. The rule is applied in
the status service, not in `effectiveStatus()`. The issuer API still shows `revoked`
for those credentials.

For a signed credential, one shared pure function, `effectiveStatus(record, now)` in
`src/services/credential-status.ts`, decides the status. The issuer portal uses the same
function for the `effectiveStatus` field of its credential metadata, so the portal and
the public endpoint can't disagree.

| Stored status                                   | Expiry             | Public status          | Notes                                        |
| ----------------------------------------------- | ------------------ | ---------------------- | -------------------------------------------- |
| `revoked` (after signing)                       | any                | `revoked`              | Precedence 1: wins over everything           |
| `superseded`                                    | any                | `superseded`           | Precedence 2: wins over expiry               |
| `valid`                                         | `now >= expiresAt` | `expired`              | Precedence 3: **inclusive** boundary         |
| `valid`                                         | `now < expiresAt`  | `valid`                | Precedence 4                                 |
| `pending`                                       | any                | **404** (not revealed) | Never signed                                 |
| `revoked`, never signed (revoked while pending) | any                | **404** (not revealed) | Never signed; the issuer API shows `revoked` |

- **`expired` is computed, never stored.** The database keeps `status = 'valid'` and
  `expires_at`; nothing writes `expired`.
- **Boundary:** at exactly `expiresAt` the credential is already expired, as with the JWT
  `exp` rule. One second earlier it is valid.
- A credential **revoked after signing** reports `revoked`. One **revoked while pending**
  gets the 404, because no verifier can hold it.
- The clock is injected (`createApp(config, logger, { now })`), so tests set the time; the
  logic never calls `Date.now()`.

## 5. Errors

All in the standard error format `{ "error": { code, message, details?, requestId } }`.

| Situation                                                                    | Status | Code                          |
| ---------------------------------------------------------------------------- | ------ | ----------------------------- |
| `:credentialId` is not a UUID                                                | 400    | `VALIDATION_ERROR`            |
| Unknown ID, or a credential never signed (pending, or revoked while pending) | 404    | `CREDENTIAL_STATUS_NOT_FOUND` |
| Too many requests from this IP                                               | 429    | `RATE_LIMITED`                |
| No database connected                                                        | 503    | `STATUS_UNAVAILABLE`          |

**Unknown and never-signed look identical:** same status, same body (only `requestId`
differs), same headers, and the same code path (one primary-key query, then the same
error). The ID is not echoed back. Any other method or path under `/status` is a
`404 NOT_FOUND` whose message names the route template, not the ID.

```json
{
  "error": {
    "code": "CREDENTIAL_STATUS_NOT_FOUND",
    "message": "No status is available for this credential",
    "requestId": "…"
  }
}
```

## 6. Headers and CORS

| Header                         | Value                              | Why                                                  |
| ------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| `Cache-Control`                | `no-store` (also on 4xx responses) | A revocation must be seen at once, not from a cache  |
| `Content-Type`                 | `application/json; charset=utf-8`  |                                                      |
| `Access-Control-Allow-Origin`  | `*`                                | Any verifier web app may read it from its own origin |
| `Cross-Origin-Resource-Policy` | `cross-origin`                     | Overrides helmet's `same-origin` for this route only |

**CORS:** this route only, `GET` only, no cookies or credentials (no
`Access-Control-Allow-Credentials`). Allowed request header: `X-Request-ID`. Every other
route keeps the `CORS_ORIGINS` allow-list (an unknown origin gets `403
CORS_ORIGIN_NOT_ALLOWED`).

## 7. Rate limit

Per client IP, in memory (like the login limiter):

| Variable                           | Default | Meaning                    |
| ---------------------------------- | ------- | -------------------------- |
| `STATUS_RATE_LIMIT_MAX`            | 60      | Requests per window per IP |
| `STATUS_RATE_LIMIT_WINDOW_MINUTES` | 1       | Window length in minutes   |

Exceeded → `429 RATE_LIMITED` with `RateLimit` headers (IETF draft-8). Malformed and
unknown IDs count too, which slows down ID guessing (IDs are random UUID v4, 122 bits).
Several backend instances would need a shared store.

## 8. Privacy

| Rule                                  | How                                                                                                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimal answer                        | Four keys only; no reason, note, replacement, holder or staff data                                                                                                           |
| Never-signed credentials not revealed | Pending and revoked-while-pending: same 404 as an unknown ID                                                                                                                 |
| Lookups not stored                    | Nothing is written to the database                                                                                                                                           |
| Lookups logged at **debug** only      | `{ credentialId, result }`; the request log line and 4xx lines of this route are debug too (CORS preflights included); a 429 stays a warning                                 |
| No IPs in logs                        | The request serializer logs `id`, `method`, `url` only                                                                                                                       |
| No credential IDs in URLs in logs     | For this route, `url` is the template `/api/v1/status/:credentialId` on every level (request lines, 4xx, the 429 warning). Only the debug lookup line carries `credentialId` |
| Known trade-off                       | The issuer can see which credential is checked and when, and `jti` is the same at every verifier (correlatable). See Decision 013                                            |

## 9. Examples (from `scripts/evidence/s1-status.ps1`)

```json
{"credentialId":"5f8c1e6d-…","status":"valid","expiresAt":"2027-11-24T09:34:18.000Z","checkedAt":"2026-11-24T09:34:19.063Z"}
{"credentialId":"6331d494-…","status":"revoked","expiresAt":"2027-11-24T09:34:18.000Z","checkedAt":"2026-11-24T09:34:19.095Z"}
{"credentialId":"c6b4db1e-…","status":"superseded","expiresAt":"2027-11-24T09:34:18.000Z","checkedAt":"2026-11-24T09:34:19.120Z"}
{"credentialId":"85945b3b-…","status":"expired","expiresAt":"2026-11-24T09:33:19.000Z","checkedAt":"2026-11-24T09:34:19.191Z"}
```

The expired example was made with the development-only `simulate-expiry` route
([credentials-api.md](credentials-api.md) section 6.4).

## 10. Not in scope yet

- **Token Status List** (draft-ietf-oauth-status-list), which hides lookups from the
  issuer: future work (Decision 013).
- **Verifier authentication** (Sprint 3): the endpoint stays public by design.
