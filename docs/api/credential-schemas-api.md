# Credential Schemas API

**Sprint:** S2 (Sprint 1 carry-over) · **Requirements:** FR-ISS-01, FR-ISS-02, FR-WAL-06
**Code:** `backend/src/routes/credential-schemas.routes.ts`,
`backend/src/services/credential-schemas.ts` (`describe()`),
`backend/src/services/credentials.service.ts` (`issuableSchemas()`, `envelopeClaimNames()`)
· **Tests:** `backend/test/credential-preview.test.ts` · **Decision:** 019

## 1. Purpose

Tells the issuer portal which credential schemas the signed-in staff member's organisation may
issue, and how each claim behaves in the credential. The portal draws the issuance flow from it
(schema choice, "Selectively disclosable" badges, "Calculated by UniVault", always-visible
claims). Everything comes from the schema files in `docs/schemas` (`properties`,
`required`, the `x-univault` block) and from the signer's envelope builder. **No list is kept in
the code**.

## 2. GET `/api/v1/credential-schemas` (officer or admin)

```json
{
  "schemas": [
    {
      "credentialType": "KYCCredential",
      "vct": "urn:univault:vct:KYCCredential:1",
      "title": "UniVault KYC Credential – subject claims (v1.0)",
      "schemaVersion": "1.0",
      "defaultValidity": "P2Y",
      "fields": [
        { "name": "full_name", "required": true, "selectivelyDisclosable": true, "derived": false },
        {
          "name": "age_over_18",
          "required": true,
          "selectivelyDisclosable": true,
          "derived": true
        },
        "…"
      ],
      "alwaysVisible": [
        "iss",
        "issuer_name",
        "vct",
        "schema_version",
        "jti",
        "iat",
        "exp",
        "cnf",
        "status",
        "kyc_verification_date"
      ],
      "alwaysVisibleClaims": []
    }
  ]
}
```

| Field                                     | Source                                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `credentialType`                          | The issuer type: employer → `EmploymentCredential`, bank → `KYCCredential` (one schema per type)                             |
| `vct`, `schemaVersion`, `defaultValidity` | `x-univault`                                                                                                                 |
| `title`                                   | The schema file's `title`                                                                                                    |
| `fields[].name`                           | Every property of the schema, in file order                                                                                  |
| `fields[].required`                       | In the top-level `required` list. Conditional rules (e.g. the expiry date of a passport) stay in the schema's `allOf`        |
| `fields[].selectivelyDisclosable`         | In `x-univault.selectivelyDisclosable`                                                                                       |
| `fields[].derived`                        | In `x-univault.derivedClaims` (calculated by the server; staff never enter it)                                               |
| `alwaysVisible`                           | The envelope claim names from `envelopeClaims()`, the builder `signCredential()` signs with, plus `x-univault.alwaysVisible` |
| `alwaysVisibleClaims`                     | `x-univault.alwaysVisible` alone (subject claims that are never disclosures; none in v1)                                     |

**Why only the issuer's own type:** an employer has employee records and a bank has customer
records. Issuing the other type would mean issuing claims about a relationship the organisation
does not have (Decision 019). `POST /credentials` and `POST /credentials/preview` refuse
another type with `400 VALIDATION_ERROR` (`details[].path = credentialType`). A 400 rather
than a 403: the staff member's role is fine; the request asks for a type this issuer has no
schema for.

**Errors:** `401` without a login. Any staff role may read it (officer and admin are the only
roles).

**Caching:** none set (the response holds no personal data).
