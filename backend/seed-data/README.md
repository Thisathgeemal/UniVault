# Seed data (synthetic)

Fictional test records for the UniVault prototype, produced by
`scripts/generate-synthetic-data.mjs`. **No real people or organisations.**

## Regenerate

```
npm run seed:generate
```

Options (pass after `--`, e.g. `npm run seed:generate -- --employees 100`):

| Option        | Default             | Meaning                                                      |
| ------------- | ------------------- | ------------------------------------------------------------ |
| `--employees` | 50                  | Number of employee records                                   |
| `--customers` | 50                  | Number of bank-customer (KYC) records                        |
| `--shared`    | 10                  | People who are both an employee and a customer (same person) |
| `--seed`      | 2026                | Random seed – same seed gives identical output               |
| `--as-of`     | 2026-11-20          | Reference date for ages, joining dates and expiries          |
| `--out`       | `backend/seed-data` | Output folder                                                |

The script validates every record against `docs/schemas/*.schema.json` and
stops with an error if any record fails.

## Files

| File             | Contents                                                      |
| ---------------- | ------------------------------------------------------------- |
| `issuers.json`   | Two fictional employers and one fictional bank                |
| `employees.json` | Employment credential records (`claims` = credential subject) |
| `customers.json` | KYC credential records (`claims` = credential subject)        |

Each record:

```
{
  "_synthetic": true,
  "record_id": "EMP-REC-0001",
  "person_id": "P0001",          // same person_id across files = same person
  "issuer_key": "employer-a",
  "credential_type": "EmploymentCredential",
  "claims": { ... }              // exactly what the issuer signs
}
```

KYC records also carry `kyc_verification_date` (an envelope claim) and
`issuance_hints.suggested_valid_until`. The hint applies the expiry rules from
`docs/schemas/credential-schemas.md` §6: 2 years by default, capped at the
18th birthday for minors and at the ID document's expiry.

## Built-in test cases

- **Multi-issuer holder:** `P0001`–`P0010` appear in both files (one wallet,
  two issuers). Their KYC record names their employer.
- **Under-18 customers:** two records with `age_over_18: false`.
- **ID document types:** NIC (old and new formats), passport, driving licence.
- **Residential address differs from permanent address**, with proof type.
- **One customer with `public_position`** (relevant to PEP checks).
- **New joiners** (< 6 months) are `probationary`.

## How the "fake but realistic" values are made

- **Names:** random combinations from generic Sinhala, Tamil and Muslim name
  lists.
- **Emails:** use the reserved `example.com` and `.example` domains.
- **Phones:** follow a `+94 7X 000 XXXX` test pattern.
- **NIC numbers:** match each record's date of birth and an internal-only
  gender value. The day code counts every year as 366 days, plus 500 for
  females. The check digit is random, so numbers are format-valid but not
  authentic.
- **Gender:** never placed in credential claims.
- **Portraits:** not generated. The issuer portal should use a placeholder
  image.
