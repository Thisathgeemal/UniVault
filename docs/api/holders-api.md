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
are issued from them in the next task.

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
| `sort`   | `newest` | `newest` or `name`                                                               |

**Response:**

```json
{
  "holders": [
    {
      "id": "…",
      "externalRef": "STC-00001",
      "fullName": "Lahiru Silva",
      "recordType": "employee",
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
| Claims don't match the schema, or a missing or invalid `externalRef` | 400    | `VALIDATION_ERROR` (`details[].path` such as `claims.designation`) |
| Reference already exists at this issuer                              | 409    | `HOLDER_ALREADY_EXISTS`                                            |
| Unknown ID, or another issuer's record                               | 404    | `HOLDER_NOT_FOUND`                                                 |
| Malformed ID or query value                                          | 400    | `VALIDATION_ERROR`                                                 |

## 5. Not in scope yet

- **Editing holder records.** A change to someone's details must also revoke
  and reissue their credential (FR-ISS-03), so it belongs with the reissue task.
- **Deleting holder records.** This is blocked by the database once credentials
  exist, for audit reasons.
