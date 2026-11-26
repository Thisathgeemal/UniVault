# Issuer Staff Authentication

**Sprint:** 1 · **Component:** backend (`src/auth/`, `src/routes/auth.routes.ts`)
**Migration:** `0002_staff_login_protection.sql` · **Tests:** `backend/test/auth.test.ts`

## 1. Overview

Issuer staff (HR officers, bank officers) log in to the issuer portal with an
email and password. A successful login returns a short-lived **access token**
(a JWT). The portal sends it with every request:

```
Authorization: Bearer <token>
```

**Who doesn't log in:** verifiers and wallets. They use public endpoints (issuer
public keys, credential status) or one-time pre-authorised codes.

## 2. Endpoints

| Method | Path                  | Auth          | Purpose                                                                          |
| ------ | --------------------- | ------------- | -------------------------------------------------------------------------------- |
| POST   | `/api/v1/auth/login`  | –             | `{ email, password }` → `{ accessToken, tokenType: "Bearer", expiresIn, staff }` |
| GET    | `/api/v1/auth/me`     | Token         | Current staff member and their issuer                                            |
| POST   | `/api/v1/auth/logout` | Token         | `204`; the portal discards its token                                             |
| GET    | `/api/v1/staff`       | Token + admin | Staff of the admin's own issuer                                                  |

`staff` (login) and `GET /auth/me` both return
`{ id, email, displayName, role, issuer: { id, name, type } }`. `issuer.type` (`employer` or
`bank`) decides which holder form the issuer portal shows (employee or customer); a test pins
it for both types (`backend/test/auth.test.ts`).

## 3. Access rules

### Public vs protected

| Area                                                                                                                    | Access                                                                 |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/health`, `GET /issuers`, `GET /issuers/:id/keys`, `GET /status/:id`                                                   | Public: needed by verifiers and wallets                                |
| `/credential-offers/token`, `/credential-offers/credential`                                                             | Public: the wallet proves itself with the one-time pre-authorised code |
| `/verifications/*`                                                                                                      | Public for now: **verifier authentication is planned for Sprint 3**    |
| `/holders`, `/credentials`, `POST /credential-offers`, `GET /credential-offers/:id`, `/staff`, `POST /issuers/:id/keys` | **Login required**                                                     |

### Role matrix

| Action                              | Officer | Admin |
| ----------------------------------- | ------- | ----- |
| Log in, view own profile            | ✅      | ✅    |
| View and create holder records      | ✅      | ✅    |
| View credentials (list, details)    | ✅      | ✅    |
| View credential status history      | ✅      | ✅    |
| Issue credentials, create QR offers | ✅      | ✅    |
| Reissue credentials                 | ✅      | ✅    |
| **Revoke** credentials              | ❌      | ✅    |
| **Manage issuer signing keys**      | ❌      | ✅    |
| **List staff**                      | ❌      | ✅    |

### Organisation isolation

**Rule:** every staff member belongs to one issuer, and can only act for that
issuer.

**How it's enforced:**

- The issuer comes from the **logged-in account**, never from the request.
  Request bodies don't contain `issuerId`; if one is sent, it is ignored.
- Routes with an `:issuerId` parameter check it matches the staff member's own
  issuer, using `requireOwnIssuer`.

**Example:** a bank admin can't manage the employer's keys or see its staff.

**Records of another issuer** (holders, credentials) are reported as `404`, not
`403`, so their existence isn't revealed. A wrong `:issuerId` in the URL gives
`403 FORBIDDEN` ("You can only access your own organisation").

## 4. Security measures

| Threat                                   | Measure                                                                                                                                             |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password theft from the database         | Passwords stored only as scrypt hashes (salted, memory-hard)                                                                                        |
| Password guessing on one account         | Locked for **15 minutes after 5 consecutive failures**; even the correct password is refused (`423 ACCOUNT_LOCKED`)                                 |
| Mass guessing from one machine           | **Rate limit:** 20 login attempts per 15 minutes per IP address (`429 RATE_LIMITED`)                                                                |
| Discovering which emails have accounts   | Unknown email, wrong password and disabled account all return the same `401 INVALID_CREDENTIALS`, and a hash is always checked so timing is similar |
| Forged or edited tokens                  | HS256 signature checked; only `HS256` accepted (`alg: none` and algorithm swaps rejected); issuer and audience checked                              |
| Stolen token used for a long time        | Tokens expire after **1 hour** (`JWT_EXPIRES_IN_SECONDS`)                                                                                           |
| Disabled user keeps working until expiry | Every request reloads the staff member from the database: a disabled account is rejected at once                                                    |
| Role or issuer changed after login       | Role and issuer are read from the database on every request, not trusted from the token                                                             |
| Secrets in logs                          | Passwords and tokens are never logged; log entries record logins and failures by staff ID or email only                                             |

## 5. Responses

| Situation                                                | Status | Code                                                         |
| -------------------------------------------------------- | ------ | ------------------------------------------------------------ |
| No token, or the wrong `Authorization` format            | 401    | `UNAUTHENTICATED` (with a `WWW-Authenticate: Bearer` header) |
| Token expired                                            | 401    | `TOKEN_EXPIRED`                                              |
| Token invalid, forged, or for a disabled or deleted user | 401    | `INVALID_TOKEN`                                              |
| Wrong email or password, or a disabled account           | 401    | `INVALID_CREDENTIALS`                                        |
| Logged in, but the wrong role or another issuer          | 403    | `FORBIDDEN`                                                  |
| Account locked                                           | 423    | `ACCOUNT_LOCKED` (`details.lockedUntil`)                     |
| Too many attempts from one IP                            | 429    | `RATE_LIMITED`                                               |
| No database connected (authentication unavailable)       | 503    | `AUTH_UNAVAILABLE`                                           |

## 6. Token contents (JWT, HS256)

| Claim               | Example                                       | Meaning                                                         |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------- |
| `sub`               | `c27af500-…`                                  | Staff member ID                                                 |
| `issuer_id`         | `bank-a`                                      | Their issuer                                                    |
| `role`              | `officer`                                     | Role at login (re-checked against the database on each request) |
| `iss` / `aud`       | `univault-backend` / `univault-issuer-portal` | Who issued the token, and who it's for                          |
| `iat`, `exp`, `jti` | timestamps, UUID                              | Issued at, expiry, unique token ID                              |

## 7. Configuration (`backend/.env`)

| Variable                                                   | Default                           | Notes                                                                                                                                         |
| ---------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`                                               | random per run (development only) | **Required in production**, minimum 32 characters. Without it, development generates a temporary secret, so everyone is signed out on restart |
| `JWT_EXPIRES_IN_SECONDS`                                   | 3600                              | 300–86400                                                                                                                                     |
| `LOGIN_MAX_FAILED_ATTEMPTS`                                | 5                                 |                                                                                                                                               |
| `LOGIN_LOCKOUT_MINUTES`                                    | 15                                |                                                                                                                                               |
| `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MINUTES` | 20 / 15                           | Per IP address                                                                                                                                |

## 8. Known limitations (future work)

- **Logout doesn't invalidate the token on the server.** Tokens are short-lived
  and the portal discards them. A token deny-list or refresh tokens could be
  added later.
- **No multi-factor authentication or password-reset flow** in the prototype.
- **The rate limiter counts in memory.** Several backend instances would need a
  shared store (e.g. Redis).
- **Verifier portal authentication is planned for Sprint 3.**
