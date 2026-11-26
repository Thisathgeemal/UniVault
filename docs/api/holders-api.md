# Holder Records API

**Sprint:** 1 · **Requirements:** FR-ISS-01 (input to issuance), NFR-06, NFR-08
**Code:** `backend/src/routes/holders.routes.ts`, `backend/src/services/holders.service.ts`,
`backend/src/services/credential-schemas.ts` · **Migration:** `0003_holder_audit.sql`
**Tests:** `backend/test/holders.test.ts`

## 1. Purpose

A **holder record** is an issuer's own record of a person:

- an employer's employee
- a bank's customer

Issuer staff create and look up these records in the issuer portal. Credentials
are issued from them with `POST /api/v1/credentials` (see
[credentials-api.md](credentials-api.md)).

## 2. Endpoints (login required, officer or admin)

| Method | Path                        | Purpose                                         |
| ------ | --------------------------- | ----------------------------------------------- |
| POST   | `/api/v1/holders`           | Create a holder record                          |
| GET    | `/api/v1/holders`           | List records: search and paging, summaries only |
| GET    | `/api/v1/holders/:holderId` | One record with its full claims                 |

### POST `/api/v1/holders`

**Employer (employee):** the reference is the `employee_id` claim.

```json
{
  "claims": {
    "employee_id": "STC-90001",
    "full_name": "Nimesha Perera",
    "designation": "Sales Executive",
    "department": "Sales",
    "employment_type": "permanent",
    "date_of_joining": "2022-03-01"
  }
}
```

**Bank (customer):** the reference is the bank's customer number.

```json
{
  "externalRef": "CUS-000123",
  "claims": { "full_name": "Kasun Bandara", "id_document_type": "nic", "...": "..." }
}
```

**Response:** `201 Created`, with a `Location: /api/v1/holders/<id>` header and
the full record:

```json
{
  "id": "…",
  "issuerId": "employer-a",
  "recordType": "employee",
  "credentialType": "EmploymentCredential",
  "externalRef": "STC-90001",
  "fullName": "Nimesha Perera",
  "claims": { "…": "…" },
  "createdBy": { "id": "…", "displayName": "Serendib Trading Company (Demo) Officer" },
  "createdAt": "…",
  "updatedAt": "…"
}
```

### GET `/api/v1/holders`

| Query    | Default  | Meaning                                                                          |
| -------- | -------- | -------------------------------------------------------------------------------- |
| `search` | –        | Name or reference contains this text (case-insensitive; `%` and `_` are literal) |
| `limit`  | 20       | 1–100                                                                            |
| `offset` | 0        | Number of records to skip                                                        |
| `sort`   | `newest` | `newest`, `oldest`, `name`, `name_desc`, `ref` or `ref_desc` (reference)         |

**Response:**

```json
{
  "holders": [
    {
      "id": "…",
      "externalRef": "STC-00001",
      "fullName": "Lahiru Silva",
      "recordType": "employee",
      "idNumberLast4": "0063",
      "credentialCount": 1,
      "createdAt": "…"
    }
  ],
  "total": 27,
  "limit": 20,
  "offset": 0
}
```

The list returns **summaries only**, without personal claims such as NIC numbers
or addresses. Full claims come from `GET /holders/:holderId`.

**Masking rule:** `idNumberLast4` is the last 4 characters of the ID number
(customers: `id_document_number`; employees: the optional `nic_number`), or `null`
when there is none. The full number never appears in the list; the issuer portal shows
it as `•••• 0063` and the full number on the holder's detail page only.

## 3. Rules

| Rule                                             | How                                                                                                                                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Records belong to the logged-in issuer           | `issuerId` comes from the login token; any `issuerId` in the body is ignored                                                                                                                                |
| Employers store employees, banks store customers | Record type and credential type are set from the issuer type, never by the client                                                                                                                           |
| Claims must form a valid credential              | Validated against `docs/schemas/employment-credential.v1.schema.json` or `kyc-credential.v1.schema.json` (required fields, formats, allowed values, no extra fields, the KYC ID-document and address rules) |
| `age_over_18` is never trusted from the client   | Calculated by the server from `date_of_birth` (Decision 005)                                                                                                                                                |
| One record per reference per issuer              | A duplicate gives `409 HOLDER_ALREADY_EXISTS`. The same reference at another issuer is allowed, because issuers are independent                                                                             |
| Audit trail                                      | `created_by_staff_id` records who created the record                                                                                                                                                        |
| Isolation                                        | Another issuer's record returns `404`, not `403`, so its existence isn't revealed                                                                                                                           |
| Privacy                                          | Claims are never written to logs; only IDs are                                                                                                                                                              |

## 4. Errors

| Situation                                                            | Status | Code                                                               |
| -------------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| Not logged in                                                        | 401    | `UNAUTHENTICATED`                                                  |
| Claims don't match the schema, or a missing or invalid `externalRef` | 400    | `VALIDATION_ERROR` (`details[]` = `{ path, code, message }`)       |
| Reference already exists at this issuer                              | 409    | `HOLDER_ALREADY_EXISTS` (`details.holderId` = the existing record) |
| Unknown ID, or another issuer's record                               | 404    | `HOLDER_NOT_FOUND`                                                 |
| Malformed ID or query value                                          | 400    | `VALIDATION_ERROR`                                                 |

### Validation details

Each problem in a `VALIDATION_ERROR` from `POST /holders` is
`{ "path": "claims.permanent_address.line1", "code": "poBox", "message": "must be a street address (P.O. Box addresses are not accepted)" }`:

- `path`: `claims.<claim>` (dotted inside objects) or `externalRef`;
- `code` (added 26 Nov 2026): a stable reason the issuer portal translates: `required`,
  `notAllowed`, `poBox`, `notAccepted`, `pattern`, `format`, `minLength`, `maxLength`,
  `enum`, `const`, `type`, `mismatch` (employee `externalRef` ≠ `employee_id`), `photoTooLarge`
  (`portrait` over 40 KB of image data: message "Photo must be under 40 KB – use a smaller
  image", `params.kilobytes` = 40, Decision 020) or `invalid`;
- `message`: English text, as before.

The issues come from `@univault/claims-validation` (Decision 018), the same code the issuer
portal runs in the browser on the same schema files, so the portal and the API report the
same problems. (Request-shape errors from the route's zod check, e.g. a missing `claims`
object, keep `{ path, message }`.)

### Duplicate reference

`409 HOLDER_ALREADY_EXISTS` has `details: { "holderId": "<id>" }`, the existing record of the
**same** issuer (references are unique per issuer, so nothing about another issuer is shown).
The portal links to it.

## 5. Not in scope yet

- **Editing holder records.** A change to someone's details must also revoke
  and reissue their credential (FR-ISS-03), so it belongs with the reissue task.
- **Deleting holder records.** This is blocked by the database once credentials
  exist, for audit reasons.
