# UniVault Database Design (v1)

**Sprint:** 1 · **Database:** PostgreSQL · **Migrations:** `backend/migrations/0001`–`0004` (section 8)
**Requirements supported:** FR-ISS-01, FR-ISS-02, FR-ISS-03, FR-WAL-05, FR-BAK-01, NFR-08

## 1. Technology decision

| Choice                                                                  | Reason                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PostgreSQL**                                                          | Relational data with real relationships (issuer → holder → credential → offer, reissue chains). The database enforces integrity itself through foreign keys, CHECK constraints and unique indexes, not only application code. `jsonb` stores credential claims, which differ between Employment and KYC. |
| **PGlite** (embedded PostgreSQL, WebAssembly) for development and tests | Genuine PostgreSQL 17 with nothing to install and no native binaries. Data is kept in `backend/.data/` (git-ignored); tests use an in-memory database.                                                                                                                                                   |
| **Hosted PostgreSQL** (e.g. Neon, Supabase) for deployment              | Same SQL and queries; only `DATABASE_URL` changes. Production refuses the embedded database.                                                                                                                                                                                                             |
| **Hand-written SQL migrations**                                         | Reviewable DDL that can be quoted in the report. Each file is applied once, in order, inside a transaction. Edited files are detected by checksum.                                                                                                                                                       |
| **Drizzle ORM** for queries                                             | Typed queries and joins in TypeScript. A test checks the Drizzle definitions match the SQL tables column by column.                                                                                                                                                                                      |

## 2. Entity-relationship diagram

```mermaid
erDiagram
    ISSUERS ||--o{ ISSUER_KEYS : "signs with"
    ISSUERS ||--o{ ISSUER_STAFF : employs
    ISSUERS ||--o{ HOLDERS : "keeps records of"
    ISSUERS ||--o{ CREDENTIAL_RECORDS : issues
    HOLDERS ||--o{ CREDENTIAL_RECORDS : "receives"
    ISSUER_KEYS |o--o{ CREDENTIAL_RECORDS : "signed"
    CREDENTIAL_RECORDS |o--o| CREDENTIAL_RECORDS : "replaces (reissue)"
    CREDENTIAL_RECORDS ||--o{ CREDENTIAL_OFFERS : "offered via"
    ISSUER_STAFF |o--o{ HOLDERS : "created"
    ISSUER_STAFF |o--o{ CREDENTIAL_RECORDS : "created"
    ISSUER_STAFF |o--o{ CREDENTIAL_OFFERS : "created"

    ISSUERS {
        text id PK "e.g. employer-a"
        text name
        issuer_type issuer_type "employer | bank"
        text email_domain
    }
    ISSUER_KEYS {
        text kid PK "RFC 7638 thumbprint"
        text issuer_id FK
        text alg "RS256"
        jsonb public_jwk "public key only"
        issuer_key_status status "active | retired"
        timestamptz retired_at
    }
    ISSUER_STAFF {
        uuid id PK
        text issuer_id FK
        text email UK "case-insensitive"
        text password_hash "scrypt"
        staff_role role "admin | officer"
        boolean is_active
        timestamptz last_login_at
        integer failed_login_attempts "0002, >= 0"
        timestamptz locked_until "0002, lockout"
    }
    HOLDERS {
        uuid id PK
        text issuer_id FK
        holder_record_type record_type "employee | customer"
        text external_ref "unique per issuer"
        text full_name
        jsonb claims "subject claims"
        text subject_ref "test data only"
        uuid created_by_staff_id FK "0003, audit"
    }
    CREDENTIAL_RECORDS {
        uuid id PK "= credential jti"
        text issuer_id FK
        uuid holder_id FK
        credential_type credential_type
        credential_status status "pending | valid | revoked | superseded"
        jsonb claims_snapshot
        text issuer_kid FK
        text holder_key_thumbprint "wallet key (cnf)"
        timestamptz issued_at
        timestamptz expires_at
        timestamptz revoked_at
        uuid replaces_credential_id FK "unique"
        uuid created_by_staff_id FK
    }
    CREDENTIAL_OFFERS {
        uuid id PK
        uuid credential_id FK
        text pre_authorized_code_hash UK "SHA-256, never the code"
        timestamptz expires_at
        timestamptz redeemed_at
        text redeemed_wallet_thumbprint
        integer failed_attempts "reserved: Sprint 2 brute-force limit"
        timestamptz invalidated_at "0004, replaced by a newer offer"
        uuid created_by_staff_id FK
    }
```

## 3. Tables

| Table                | Purpose                                                     | Key rules enforced by the database                                                                                                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `issuers`            | Employers and banks                                         | ID format `^[a-z0-9-]{3,40}$`; type is an enum                                                                                                                                                                                                                                  |
| `issuer_keys`        | RS256 **public** keys (private keys stay encrypted on disk) | `kid` is a 43-character thumbprint and must equal the JWK's `kid`; **only one active key per issuer** (partial unique index); a retired key must record `retired_at`                                                                                                            |
| `issuer_staff`       | Issuer portal users                                         | Email unique regardless of case; only scrypt hashes accepted (no plain-text passwords); `failed_login_attempts` counts consecutive failures (never negative) and `locked_until` holds a temporary lockout (migration 0002)                                                      |
| `holders`            | An issuer's employee or customer record                     | `external_ref` unique per issuer; the same person at two issuers is two rows; `claims` must be a JSON object; `created_by_staff_id` records which staff member created the record (migration 0003, set to NULL if that staff member is deleted)                                 |
| `credential_records` | One row per credential (`id` = `jti`)                       | See section 4                                                                                                                                                                                                                                                                   |
| `credential_offers`  | Pre-authorised offers behind the QR code                    | Only a SHA-256 hash of the code is stored, unique; it cannot be created already expired; redemption time and wallet key are recorded together; `invalidated_at` is set when a newer offer replaces it, and an offer can never be both redeemed and invalidated (migration 0004) |
| `schema_migrations`  | Applied migrations and checksums                            | Created by the migration runner                                                                                                                                                                                                                                                 |

## 4. Credential lifecycle and status

| Status       | Meaning                                        | Required fields (CHECK constraints)                                          |
| ------------ | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `pending`    | Created by staff, offered, not yet in a wallet | none extra                                                                   |
| `valid`      | Signed and delivered to the wallet             | `issued_at`, `issuer_kid`, `holder_key_thumbprint`; `expires_at > issued_at` |
| `revoked`    | Withdrawn by the issuer (e.g. resignation)     | `revoked_at` (plus optional `revocation_reason`)                             |
| `superseded` | Replaced by a reissued credential              | `revoked_at`; a newer record points to it                                    |

**Reissue (FR-ISS-03).** When a holder's data changes:

1. The old record becomes `superseded`.
2. A new record is created with `replaces_credential_id` = the old ID.

This column is **unique**, so a credential can be replaced only once, and it can
never point to itself. The full history can be followed in both directions.

**One active credential per holder and type.** A holder can have at most one
`pending` or `valid` credential of each type. This is enforced by the issuance
API, not by a database constraint: it locks the holder row
(`SELECT … FOR UPDATE`) while it checks, so two simultaneous requests can't
both succeed. A partial unique index was not added yet, because the reissue
design (next task) may need a new record next to the one it replaces; this can
be revisited then.

**Status checks (FR-BAK-01).** `status`, `status_updated_at` and `revoked_at`
are what the wallet and verifiers read through the status endpoint.

## 5. Privacy and security decisions (PDPA, NFR-08)

- **No signed credentials are stored.** The issuer keeps only what it needs for
  status, revocation, reissue and audit.
- **No private keys in the database.** Only public JWKs.
- **No pre-authorised codes in the database.** Only their SHA-256 hash, so a
  database leak cannot be used to claim credentials.
- **Holder keys are stored as a thumbprint (fingerprint) only.**
- **Staff passwords are hashed with scrypt** (salted, memory-hard).
- **Deletes are restricted.** An issuer with holders, or a holder with
  credentials, cannot be deleted by accident.

## 6. Sample data

`npm run db:seed` loads the synthetic data from Task 4:

- **3 issuers**
- **6 staff logins:** one admin and one officer per issuer
- **100 holders:** 50 employees across the two employers, 50 bank customers

Credential records and offers are not seeded. Credential records are created
by the issuance API (`POST /api/v1/credentials`, as `pending`) and signed with
the issuer's real key when the wallet redeems its offer (Sprint 2). Offers are
created by `POST /api/v1/credential-offers` (only the SHA-256 hash of the
code is stored).

## 7. Commands (from `backend/`)

| Command              | Purpose                                                                     |
| -------------------- | --------------------------------------------------------------------------- |
| `npm run db:migrate` | Apply new migrations                                                        |
| `npm run db:seed`    | Migrate, then load sample issuers, staff and holders                        |
| `npm run db:inspect` | Show tables, row counts and sample rows                                     |
| `npm run db:reset`   | Delete the embedded development database and recreate it (development only) |

## 8. Migrations

Files in `backend/migrations/`, applied in order by `npm run db:migrate` (or at
start-up when `DB_AUTO_MIGRATE=true`). Each one runs once, inside a transaction,
and is recorded with its checksum in `schema_migrations`. An applied file must
never be edited; changes go in a new file.

| File                              | Changes                                                                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0001_initial_schema.sql`         | Enum types, the `set_updated_at` trigger function, and the six tables with their keys, CHECK constraints and indexes                                                               |
| `0002_staff_login_protection.sql` | `issuer_staff.failed_login_attempts` (integer, default 0, CHECK `>= 0`) and `issuer_staff.locked_until` (timestamptz) for the login lockout                                        |
| `0003_holder_audit.sql`           | `holders.created_by_staff_id` (uuid, references `issuer_staff`, `ON DELETE SET NULL`): which staff member created each holder record (audit)                                       |
| `0004_offer_invalidation.sql`     | `credential_offers.invalidated_at` (timestamptz, NULL = not invalidated) and CHECK `invalidated_at IS NULL OR redeemed_at IS NULL`: a new offer invalidates the earlier usable one |

`backend/src/db/schema.ts` (Drizzle) must match; `backend/test/db/schema.test.ts`
checks the two agree.
