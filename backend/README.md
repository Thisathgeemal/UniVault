# UniVault backend

Node.js + Express 5 REST API (TypeScript), serving the issuer portal, verifier
portal and mobile wallet.

## Run it

```
cd backend
npm install
copy .env.example .env      # Windows (macOS/Linux: cp .env.example .env)
npm run dev                 # http://localhost:4000/api/v1/health
```

| Script                  | Purpose                                       |
| ----------------------- | --------------------------------------------- |
| `npm run dev`           | Start with auto-restart on file changes (tsx) |
| `npm run build`         | Compile TypeScript to `dist/`                 |
| `npm start`             | Run the compiled server (`dist/server.js`)    |
| `npm test`              | Unit, HTTP and server-process tests (Vitest)  |
| `npm run test:coverage` | Tests with a coverage report                  |
| `npm run typecheck`     | Type-check without emitting files             |

## Structure

```
src/
  server.ts              entry point: loads .env, validates config, starts, shuts down
  app.ts                 Express app factory (middleware order below)
  config/env.ts          environment variables → validated, typed config (zod)
  lib/logger.ts          pino logger with secret redaction
  lib/errors.ts          AppError + helpers (badRequest, notFound, notImplemented)
  middleware/validate.ts request validation (body / query / params) with zod
  middleware/error-handler.ts  404 handler + central error handler
  routes/                one router per resource, mounted under /api/v1
test/                    config, HTTP (supertest) and server-process tests
```

**Middleware order:** request ID + logging → security headers (helmet) → CORS →
JSON body (size-limited) → `/api/v1` routes → 404 → error handler.

## API routes (`/api/v1`)

| Method   | Path                                            | Status                          |
| -------- | ----------------------------------------------- | ------------------------------- |
| GET      | `/health`                                       | ✅ Implemented                  |
| GET      | `/issuers`, `/issuers/:issuerId/keys`           | 501 – Sprint 1 (key management) |
| GET/POST | `/holders`                                      | 501 – Sprint 1 (holder records) |
| POST     | `/credentials`                                  | 501 – Sprint 1 (issuance)       |
| POST     | `/credentials/:credentialId/revoke`, `/reissue` | 501 – Sprint 1                  |
| POST     | `/credential-offers`                            | 501 – Sprint 1                  |
| POST     | `/credential-offers/token`, `/credential`       | 501 – Sprint 2 (wallet)         |
| GET      | `/status/:credentialId`                         | 501 – Sprint 1                  |
| *        | `/verifications/...`                            | 501 – Sprint 3                  |

Planned routes already validate their input. Each returns `501 NOT_IMPLEMENTED`
with the sprint it is planned for, until its handler is written.

## Error format

Every error, from validation to unknown routes to crashes, has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      { "path": "credentialType", "message": "Invalid option…", "code": "invalid_value" }
    ],
    "requestId": "39759dee-ef4e-4d46-b208-cf678bcdfcfd"
  }
}
```

**Codes:**

| Code                      | Status |
| ------------------------- | ------ |
| `VALIDATION_ERROR`        | 400    |
| `INVALID_JSON`            | 400    |
| `CORS_ORIGIN_NOT_ALLOWED` | 403    |
| `NOT_FOUND`               | 404    |
| `PAYLOAD_TOO_LARGE`       | 413    |
| `NOT_IMPLEMENTED`         | 501    |
| `INTERNAL_ERROR`          | 500    |

In production, internal error messages and stack traces are never returned.
They are only logged.

## Configuration

**Where settings come from:** all settings are read from environment variables
(`backend/.env` locally) and validated at start-up by `src/config/env.ts`.

**Invalid values:** the server refuses to start and lists the problem variable
names, never their values.

**Production:** `JWT_SECRET`, `ISSUER_KEY_PASSPHRASE` and `DATABASE_URL` are
required.

**`.env.example`:** see `backend/.env.example` for every variable.

## CORS and logging

- **CORS:** only origins in `CORS_ORIGINS` (the two portals) may call the API
  from a browser. Requests with no `Origin` header (the mobile wallet,
  server-to-server) are allowed.
- **Request IDs:** every request gets an `X-Request-ID` header, which appears in
  the response, the logs and error bodies.
- **Logs:** coloured and readable in development, JSON in production.
- **Redaction:** authorisation headers, cookies, passphrases, private keys and
  tokens are redacted from logs.
