# UniVault design decisions

Numbered record of the significant design decisions in UniVault. Each entry gives the context,
the options considered, the decision, the reason and the consequences, and links to the
requirements, design docs and evidence behind it. Numbers are permanent: a decision is never
renumbered, and a decision that is replaced is marked as superseded rather than deleted.

**Status values:** `Accepted` (agreed and in force), `Proposed` (waiting for supervisor
confirmation) and `Draft – review` (written by the developer, not yet reviewed).

[Back to the dev-log index](README.md)

## Decision index

| #                                                                                                                                                       | Decision                                                                                                                             | Date            | Sprint                   | Status         | Related requirements                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------ | -------------- | ------------------------------------------------------------- |
| [001](#decision-001-typescript-for-all-javascript-components)                                                                                           | TypeScript for all JavaScript components                                                                                             | Mon 16 Nov 2026 | S1                       | Accepted       | None (development tooling)                                    |
| [002](#decision-002-root-level-eslint-9-and-prettier-ruff-for-ai-service)                                                                               | Root-level ESLint 9 and Prettier; Ruff for ai-service                                                                                | Mon 16 Nov 2026 | S1                       | Accepted       | None (development tooling)                                    |
| [003](#decision-003-sd-jwt-vc-flat-claim-layout-instead-of-json-ld)                                                                                     | SD-JWT VC flat claim layout (W3C VC model); subject claims selectively disclosable                                                   | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-ISS-02, FR-VER-01, FR-VER-03, FR-BAK-01, NFR-01 |
| [004](#decision-004-data-minimisation-in-credential-schemas)                                                                                            | Data minimisation in the credential schemas                                                                                          | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-VER-03, NFR-08                                  |
| [005](#decision-005-derived-age_over_18-claim-and-under-18-handling)                                                                                    | Derived `age_over_18` claim and under-18 handling                                                                                    | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-ISS-03, FR-VER-03, NFR-08                       |
| [006](#decision-006-sd-jwt-library-selection-sd-jwtcore)                                                                                                | SD-JWT library: `@sd-jwt/core` pinned to 0.25.0                                                                                      | Thu 19 Nov 2026 | S1                       | Accepted       | FR-ISS-02, FR-VER-02, FR-WAL-06, NFR-01                       |
| [007](#decision-007-es256-for-holder-key-binding)                                                                                                       | ES256 for holder key binding; issuer signatures stay RS256                                                                           | Thu 19 Nov 2026 | S1                       | Proposed       | NFR-01, FR-WAL-06, FR-VER-02                                  |
| [008](#decision-008-postgresql-with-embedded-pglite-for-development-and-hand-written-migrations)                                                        | PostgreSQL, with embedded PGlite for development and hand-written migrations                                                         | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, FR-ISS-02, FR-ISS-03, FR-WAL-05, FR-BAK-01, NFR-08 |
| [009](#decision-009-issuer-staff-authentication-jwt-database-re-check-and-lockout)                                                                      | Issuer staff authentication (JWT, database re-check and lockout)                                                                     | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, NFR-06, NFR-08                                     |
| [010](#decision-010-credential-signing-deferred-to-wallet-redemption-holder-binding)                                                                    | Credential signing deferred to wallet redemption (holder binding)                                                                    | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, FR-ISS-02, NFR-01, NFR-06, NFR-08                  |
| [011](#decision-011-openid4vci-pre-authorised-code-offer-format)                                                                                        | OpenID4VCI pre-authorised code offer format                                                                                          | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, NFR-01, NFR-06, NFR-08                             |
| [012](#decision-012-reissue-supersedes-immediately-status-changes-recorded-as-append-only-events)                                                       | Reissue supersedes immediately; status changes recorded as append-only events                                                        | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | FR-ISS-03, FR-BAK-01, NFR-06, NFR-08                          |
| [013](#decision-013-per-credential-status-endpoint-ietf-token-status-list-as-future-work)                                                               | Per-credential status endpoint; IETF Token Status List as future work                                                                | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | FR-VER-02, FR-WAL-05, FR-ISS-03, FR-BAK-01, NFR-06, NFR-08    |
| [014](#decision-014-encrypted-key-file-or-encrypted-env-bundle-decrypted-once-in-a-central-key-store-kmshsm-as-future-work)                             | Encrypted key file or encrypted env bundle, decrypted once in a central key store; KMS/HSM as future work                            | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | NFR-01, FR-ISS-02, NFR-08                                     |
| [015](#decision-015-frontend-stack-react--vite--ts-react-router-tanstack-query-tailwind--shadcnui-react-i18next-shared-portal-ui-package)               | Frontend stack: React + Vite + TS, React Router, TanStack Query, Tailwind + shadcn/ui, react-i18next, shared portal-ui package       | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | NFR-02, NFR-04, NFR-05, NFR-08, FR-ISS-01                     |
| [016](#decision-016-staff-token-in-memory--sessionstorage-never-localstorage-httponly-cookie-as-future-work)                                            | Staff token in memory + sessionStorage, never localStorage; httpOnly cookie as future work                                           | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | NFR-02, NFR-04, NFR-05, NFR-08, FR-ISS-01                     |
| [017](#decision-017-dashboard-demo-data-via-the-real-services-marked-by-an-inactive-staff-account-reset-lifts-the-append-only-guard-in-one-transaction) | Dashboard demo data via the real services, marked by an inactive staff account; reset lifts the append-only guard in one transaction | Wed 25 Nov 2026 | S2                       | Draft – review | FR-ISS-01, FR-ISS-03, NFR-08                                  |
| [018](#decision-018-one-shared-claims-validation-package-the-portal-precompiles-the-schemas-at-build-time)                                              | One shared claims-validation package; the portal precompiles the schemas at build time                                               | Thu 26 Nov 2026 | S2                       | Draft – review | FR-ISS-01, NFR-02, NFR-05, NFR-08                             |
| [019](#decision-019-issuance-form-is-read-only-and-previewed-server-side)                                                                               | Issuance form is read-only and previewed server-side; schema limited by issuer type                                                  | Thu 26 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | FR-ISS-01, FR-ISS-02, FR-WAL-06                               |
| [020](#decision-020-portrait-embedded-in-the-credential-size-limited-and-selectively-disclosable)                                                       | Portrait embedded in the credential, size-limited (40 KB) and selectively disclosable                                                | Thu 26 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | NFR-03, NFR-06, NFR-08, FR-WAL-06                             |
| [021](#decision-021-pre-authorised-code-kept-only-in-portal-memory-qr-never-re-shown)                                                                   | Pre-authorised code kept only in portal memory; QR never re-shown; tx_code deferred                                                  | Thu 26 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | FR-ISS-01, NFR-06, NFR-08                                     |

## Decision 001: TypeScript for all JavaScript components

- **Date:** Mon 16 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** None directly (development tooling; supports the correctness of the
  security-critical code behind NFR-01).
- **Related:** [development-setup.md](../development-setup.md),
  [`crypto-core/tsconfig.json`](../../crypto-core/tsconfig.json),
  [`backend/tsconfig.json`](../../backend/tsconfig.json)
- **Evidence:** `npm run typecheck` in `backend/` (also type-checks against the built
  `crypto-core`); [s1-dev-config-checks-pass.png](evidence/s1-dev-config-checks-pass.png)

### Context

UniVault has five JavaScript components: `crypto-core/`, `backend/`, `issuer-portal/`,
`verifier-portal/` and `wallet/`. They all exchange the same data structures: SD-JWT
credentials, disclosures, presentation requests and revocation status. A mistake in one of these
structures can break verification, or disclose more personal data than intended, without any
visible error.

### Options considered

1. **Plain JavaScript:** no build step for the backend and faster to start, but data-shape
   errors only appear at runtime, often in another component.
2. **TypeScript:** small setup cost (`tsconfig`, typed dependencies), but the compiler checks
   data structures and function contracts across components.

### Decision

Use TypeScript for every JavaScript component, as ES modules (`"type": "module"`). TypeScript
is pinned to **5.9.3** in `crypto-core` and `backend` with strict settings
(`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`).

### Reason

- Credential, claim and disclosure types can be defined once in `crypto-core/` and reused by the
  backend, both portals and the wallet, so all components agree on the same structures.
- The compiler catches errors such as a missing claim, a wrong field name or a misused key
  object before the code runs. This matters most in the security-critical signing and
  verification code.
- React (Vite), Expo and Node.js all support TypeScript well, so one language covers every
  JavaScript component.
- Types make the code easier to read and explain in the project report and viva.

### Consequences

- Each package needs a `tsconfig.json` and a build or type-check step.
- ESLint uses `typescript-eslint` (see Decision 002). TypeScript must not be upgraded to 7 until
  `typescript-eslint` supports it.
- Untyped third-party libraries may need local type declarations.

## Decision 002: Root-level ESLint 9 and Prettier; Ruff for ai-service

- **Date:** Mon 16 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** None directly (development tooling).
- **Related:** [development-setup.md](../development-setup.md),
  [`eslint.config.js`](../../eslint.config.js), [`.prettierrc`](../../.prettierrc),
  [`ai-service/pyproject.toml`](../../ai-service/pyproject.toml)
- **Evidence:** [s1-dev-config-checks-pass.png](evidence/s1-dev-config-checks-pass.png)
  (`npm run lint`, `npm run format:check`, `npm run check:secrets` from the repository root)

### Context

The repository has six code components in two languages. Without shared tooling, each app
would get its own lint and format setup, with different rules that drift apart over time.

### Options considered

1. **Separate configs per app:** each app is independent, but rules are duplicated and become
   inconsistent.
2. **One shared config at the repository root:** one set of rules and one set of commands,
   with per-folder overrides where needed.

### Decision

- One root `eslint.config.js` (ESLint 9 flat config with `typescript-eslint`) for all JS/TS
  code: Node.js globals for `backend/`, `crypto-core/` and `scripts/`, browser globals for the
  portals. Wallet (React Native) rules will be added when the app is scaffolded. `ai-service/`
  and the throwaway spike code in `docs/spikes/` are ignored.
- One root Prettier 3 config (`.prettierrc`: single quotes, semicolons, print width 100,
  trailing commas, LF) for formatting, with `eslint-config-prettier` so the two tools do not
  conflict.
- Ruff, configured in `ai-service/pyproject.toml`, for linting (`E`, `F`, `I`, `B` rules) and
  formatting the Python service, which ESLint and Prettier do not cover.
- Shared `.editorconfig` and `.gitattributes` so every editor and OS uses the same indentation
  and LF line endings.

### Reason

- The same rules and commands (`npm run lint`, `npm run format:check`) apply everywhere, and
  can be run from the root before every commit.
- ESLint 9 flat config supports per-folder overrides in one file, so Node, browser and React
  Native code can each get the right globals without separate configs.
- Ruff is a single fast tool that replaces flake8, isort and Black for the Python service.

### Consequences

- Root `devDependencies` hold the shared tooling; each app adds only its own dependencies.
- The wallet's React Native lint rules are still to be added (placeholder comment in
  `eslint.config.js`).
- See [development-setup.md](../development-setup.md) for the commands.

## Decision 003: SD-JWT VC flat claim layout instead of JSON-LD

- **Date:** Tue 17 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** FR-ISS-01, FR-ISS-02, FR-VER-01, FR-VER-03, FR-BAK-01, NFR-01
- **Related:** [credential-schemas.md](../schemas/credential-schemas.md) (sections 2 and 3),
  [employment-credential.v1.schema.json](../schemas/employment-credential.v1.schema.json),
  [kyc-credential.v1.schema.json](../schemas/kyc-credential.v1.schema.json),
  [credentials-api.md](../api/credentials-api.md) (envelope claims)
- **Evidence:** [`crypto-core/test/sd-jwt-issuer.test.ts`](../../crypto-core/test/sd-jwt-issuer.test.ts),
  [`crypto-core/test/disclosures.test.ts`](../../crypto-core/test/disclosures.test.ts),
  [crypto-core-test-report.md](../testing/crypto-core-test-report.md); SD-JWT spike checks 2–3
  ([spike README](../spikes/sd-jwt/README.md), section 3.1)

### Context

UniVault needs a standard structure for issuing and verifying digital credentials. The system
uses SD-JWT (Selective Disclosure JSON Web Token) so that holders share only the information a
verifier needs, instead of revealing the whole credential.

### Options considered

1. **W3C VC with JSON-LD:** uses linked data and semantic vocabularies to describe credential
   information. It provides a rich data model but adds complexity, particularly around JSON-LD
   contexts and processing, and selective disclosure needs a different signature suite.
2. **SD-JWT VC flat claim layout:** represents credential information as plain JSON claims in
   the SD-JWT VC structure. Each subject claim can be selectively disclosed without JSON-LD
   processing.

### Decision

Use the **SD-JWT VC flat claim layout**, aligned with the W3C Verifiable Credentials data
model, instead of JSON-LD. The JOSE header uses `typ: dc+sd-jwt` and the issuer signs with
RS256 (Decision 007). The W3C model maps onto the flat layout as follows: `iss` is the issuer,
the subject claims are the credential subject, `exp` is the expiry and `status` points to the
status entry.

Claims are split into two groups:

**1. Envelope claims (always visible).** These describe the credential itself, and the verifier
needs them to check it at all:

- `iss` – issuer identifier (URL; used to fetch the issuer's public keys).
- `issuer_name` – issuer display name.
- `vct` – credential type (`urn:univault:vct:EmploymentCredential:1` or
  `urn:univault:vct:KYCCredential:1`).
- `schema_version` – `"1.0"`.
- `jti` – unique credential ID, also the status key.
- `iat`, `exp` – issued at and expiry (NumericDate).
- `cnf` – the holder's wallet public key (`{ "jwk": … }`), always present (Decision 010).
- `status` – `{ "status_uri": "<backend>/api/v1/status/<jti>" }` (FR-BAK-01).
- `kyc_verification_date` – KYC credential only.
- `_sd`, `_sd_alg` – SD-JWT internals (`_sd_alg` = `sha-256`).

`crypto-core` refuses to make any of these, or `nbf` and `sub`, selectively disclosable
(`NON_DISCLOSABLE_CLAIMS`).

**2. Subject claims (selectively disclosable).** Every claim about the holder is a separate
salted disclosure; only its SHA-256 digest is signed. The list for each credential type comes
from the schema's `x-univault.selectivelyDisclosable` block, and `alwaysVisible` is empty for
both types. Examples: Employment – `employee_id`, `full_name`, `designation`, `department`,
`date_of_joining`; KYC – `full_name`, `date_of_birth`, `age_over_18`, `nationality`,
`permanent_address`.

### Reason

- A flat JSON structure is simpler to implement and maintain across Node.js, React and React
  Native.
- SD-JWT supports selective disclosure without revealing the whole credential.
- Separating envelope claims from subject claims makes the credential structure easy to
  understand and to explain to verifiers.
- The same credential structure is shared by the issuer, verifier, backend and wallet.
- Avoiding JSON-LD removes context processing that UniVault does not need.

### Consequences

- Credential schemas follow one flat claim structure, with claim names in `snake_case` and
  dates as `YYYY-MM-DD`.
- `crypto-core` handles SD-JWT creation, disclosure and verification (`createSdJwt`,
  `decodeDisclosures`, `verifySdJwt`).
- All subject claims are individually selectively disclosable; envelope claims are visible in
  every presentation.
- The backend places envelope claims after subject claims when signing, so a subject claim can
  never overwrite an envelope claim.
- The implementation must stay compatible with the SD-JWT VC specification's required claims.

## Decision 004: Data minimisation in credential schemas

- **Date:** Tue 17 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** FR-ISS-01, FR-VER-03, NFR-08
- **Related:** [credential-schemas.md](../schemas/credential-schemas.md) (sections 4, 5 and 8),
  `x-univault.excludedSourceFields` in
  [employment-credential.v1.schema.json](../schemas/employment-credential.v1.schema.json) and
  [kyc-credential.v1.schema.json](../schemas/kyc-credential.v1.schema.json)
- **Evidence:** schema validation rejects unknown fields (`additionalProperties: false`) –
  [`backend/test/holders.test.ts`](../../backend/test/holders.test.ts),
  [`backend/test/credentials.test.ts`](../../backend/test/credentials.test.ts);
  [s1-holders-validation-error.png](evidence/s1-holders-validation-error.png)

### Context

UniVault is designed to reduce unnecessary disclosure of personal information during identity
verification.

Source documents contain more personal data than a verifier usually needs. The Employment
credential is based on two employer schema letters (Employer A, 7 fields; Employer B, 15
fields). The KYC credential is based on the Financial Institutions (Customer Due Diligence)
Rules, No. 1 of 2016, Schedule item (1)(a1) "Individual Customers". An organisation checking
employment may only need to know the person works there; a service checking age may only need
to know the customer is 18 or older.

Copying every source field into a credential would weaken the privacy benefits of UniVault,
even with selective disclosure, because more data would be held in the wallet and could be
requested.

### Options considered

1. **Include all available source fields:** reproduce everything from the original employment
   or identity documents. More information is available, but privacy risk and unnecessary
   exposure increase.
2. **Include only verification-relevant fields:** select the minimum information needed for the
   intended verification activities, and record why every other source field is left out.

### Decision

Apply the data minimisation principle to the Employment and KYC credential schemas. A source
field becomes a claim only if it has a clear verification purpose; every excluded field and its
reason is recorded in the schema (`x-univault.excludedSourceFields`) and in
`credential-schemas.md`.

**Employment credential – included:** `employee_id`, `full_name`, `designation`, `department`,
`employment_type`, `date_of_joining` (required); `nic_number`, `work_location`, `work_email`,
`work_phone`, `portrait` (optional). The employer is identified by the envelope claims `iss` and
`issuer_name`, not by a subject claim.

**Employment credential – excluded:**

| Source field                      | Reason                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Residential Address (B)           | Not needed to prove employment; address belongs in the KYC credential |
| Supervisor Details (B)            | Personal data of a third party                                        |
| Emergency Contact Information (B) | Personal data of a third party                                        |

Employer B's "Employment Status" (current vs. former) is represented by the credential's
revocation status, not by a claim.

**KYC credential – included:** `full_name`, `id_document_type`, `id_document_number`,
`date_of_birth`, `age_over_18` (derived, Decision 005), `nationality`, `permanent_address`,
`mobile_number` (required); `id_document_expiry` (required for passport and driving licence),
`residential_address`, `residence_proof_type`, `email`, `occupation`, `employer_name`,
`public_position`, `portrait` (optional). Scope: resident individual customers only.

**KYC credential – excluded:**

| Schedule item                                             | Reason                                                      |
| --------------------------------------------------------- | ----------------------------------------------------------- |
| Fax number (iv)                                           | Obsolete; no verifier needs it                              |
| Purpose of account (viii)                                 | Describes one bank account, not the person                  |
| Expected turnover (ix), expected mode of transactions (x) | Account-level financial data; sharing it is over-disclosure |
| Satisfactory reference (xi)                               | Bank-internal                                               |
| Customer risk rating (Rule 8)                             | Bank-internal; never shared                                 |
| Gender                                                    | Not required by the Schedule                                |

Excluded fields stay in the employer's HR records or the bank's CDD records.

### Reason

- Reduces the amount of personal information exposed during verification.
- Supports the data minimisation principle of Sri Lanka's Personal Data Protection Act, No. 9 of
  2022 (NFR-08).
- Reduces storage and processing of sensitive personal information by issuers, wallets and
  verifiers.
- Makes selective disclosure more meaningful by limiting what is available to disclose.
- Designs the credentials around real verification needs rather than reproducing paper
  documents.

### Consequences

- Schemas reject any field not listed (`additionalProperties: false`), so excluded fields cannot
  be issued by accident.
- Every included field has a documented purpose and source; every excluded field has a recorded
  reason.
- Selective disclosure applies to all included subject claims (Decision 003).
- Any schema change must be checked against data minimisation and recorded in the schema files.
- Verifier request templates ask only for what each check needs (FR-VER-03); for example the
  age check asks only for `age_over_18`.

## Decision 005: Derived age_over_18 claim and under-18 handling

- **Date:** Tue 17 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** FR-ISS-01, FR-ISS-03, FR-VER-03, NFR-08
- **Related:** [credential-schemas.md](../schemas/credential-schemas.md) (section 6, rule 2),
  `x-univault.derivedClaims` in [kyc-credential.v1.schema.json](../schemas/kyc-credential.v1.schema.json),
  [credentials-api.md](../api/credentials-api.md)
- **Evidence:** [`backend/test/credentials.test.ts`](../../backend/test/credentials.test.ts)
  ("caps an under-18 credential at the 18th birthday, with age_over_18 false"; "takes the
  earliest of the default, the ID document expiry and the 18th birthday"; derived claim
  disclosed after signing)

### Context

A primary use case of UniVault is proving an age requirement without revealing the full date of
birth. Today people show their National Identity Card, which exposes their date of birth (and,
through the NIC number, gender) even when the verifier only needs to know they are 18 or older.

SD-JWT discloses whole claims: it cannot prove "date of birth is before X" without revealing the
date. The survey found 70.7% of respondents want an age-only check.

### Options considered

1. **Disclose the complete date of birth:** the verifier calculates the age itself. Simple, but
   discloses more than needed.
2. **Use a derived `age_over_18` claim:** the issuer calculates a boolean from the date of birth
   and signs it as a separate, selectively disclosable claim.

### Decision

Use a derived boolean claim `age_over_18` in the KYC credential (required).

1. **Calculation:** the server calculates it from `date_of_birth` using calendar dates (not an
   approximate count of days). It is `true` if the holder has reached their 18th birthday on
   the issuance date, otherwise `false`. A 29 February birthday counts as 1 March in non-leap
   years. The holder and staff cannot set it: any supplied value is replaced.
2. **When it is calculated:** when staff create the pending credential, and again on the
   signing date when the wallet redeems the offer (Decision 010), so the signed value is
   correct on the day the credential is actually issued.
3. **Selective disclosure:** `age_over_18` is selectively disclosable, so the age-check template
   requests it alone, without `date_of_birth`.
4. **Under-18 rule:** if the holder is under 18, `age_over_18` is `false` **and the credential's
   `exp` is capped at the 18th birthday** (midnight UTC). The credential is then replaced with a
   new one carrying `true` by **revoke-then-reissue** (FR-ISS-03); credentials are never edited
   in place.
5. **Verification:** the verifier checks the issuer signature, the disclosure digest, `exp` and
   the status before accepting the claim.

### Reason

- Holders can prove age eligibility without revealing their date of birth.
- Verifiers receive a single boolean that every verification system can evaluate the same way.
- Capping the expiry at the 18th birthday means a `false` value can never stay in circulation
  after it becomes wrong.
- Supports the privacy and data minimisation objectives of UniVault (Decision 004, NFR-08).

### Consequences

- The issuer backend recalculates the claim on every create and sign; `computeExpiry()` takes the
  earliest of the schema default (P2Y for KYC), the ID document expiry and, when
  `age_over_18` is `false`, the 18th birthday.
- The claim states eligibility at issuance time; because of the expiry cap, a valid credential's
  `false` value is always still true.
- At 18 the credential is replaced through `POST /api/v1/credentials/:credentialId/reissue`
  (Decision 012), which recalculates `age_over_18` and the expiry from the holder's current
  record. Reissue is triggered by staff; nothing reissues automatically on the birthday.

## Decision 006: SD-JWT library selection (@sd-jwt/core)

- **Date:** Thu 19 Nov 2026
- **Sprint:** S1
- **Status:** Accepted
- **Requirements:** FR-ISS-02, FR-VER-02, FR-WAL-06, NFR-01
- **Related:** [SD-JWT spike README](../spikes/sd-jwt/README.md),
  [crypto-core-test-report.md](../testing/crypto-core-test-report.md)
- **Evidence:** [s1-sdjwt-spike-node-14-of-14.png](evidence/s1-sdjwt-spike-node-14-of-14.png),
  [s1-sdjwt-spike-phone-10-of-10.jpeg](evidence/s1-sdjwt-spike-phone-10-of-10.jpeg),
  [s1-sdjwt-spike-phone-presentation-verified.png](evidence/s1-sdjwt-spike-phone-presentation-verified.png);
  spike scripts `docs/spikes/sd-jwt/spike-node.mjs` and `expo/App.js`; interoperability test in
  [`crypto-core/test/sd-jwt-issuer.test.ts`](../../crypto-core/test/sd-jwt-issuer.test.ts)

### Context

UniVault uses SD-JWT selective disclosure for credential issuance, presentation and
verification. The same SD-JWT logic is needed in two environments:

- The backend (Node.js), which issues credentials and verifies presentations.
- The mobile wallet (React Native / Expo), which stores credentials and builds
  selective-disclosure presentations.

React Native runs on the Hermes JavaScript engine, which does not provide Node.js built-in
modules (such as `crypto` and `Buffer`) or the browser WebCrypto API (`crypto.subtle`). Many
JavaScript cryptography and JWT libraries depend on these and therefore do not work in Expo.

A spike tested whether an existing SD-JWT library could be reused in both environments, or
whether a custom implementation was needed.

### Options considered

1. **@sd-jwt/core (OpenWallet Foundation):** implements SD-JWT issuance, presentation, key
   binding and verification. Cryptographic operations (hashing, salt generation, signing,
   verification) are supplied by the application, so platform-specific crypto can be injected
   for Node.js and Expo.
2. **@sd-jwt/sd-jwt-vc (OpenWallet Foundation):** builds on @sd-jwt/core and adds SD-JWT VC type
   metadata and the IETF Token Status List. It also brings additional dependencies (`cbor-x`,
   `pako`) for status-list features that UniVault does not use.
3. **Custom SD-JWT module:** implement salt generation, disclosure construction, Base64URL
   encoding, SHA-256 digests, the `_sd` array and RS256 signing by hand.

### Decision

Use **@sd-jwt/core**, pinned to exact version **0.25.0**, wrapped by UniVault's `crypto-core`
module, which injects platform-specific cryptographic functions:

| Function            | Backend (Node.js, `crypto-core`)                 | Wallet (Expo, Sprint 2)                |
| ------------------- | ------------------------------------------------ | -------------------------------------- |
| SHA-256 hashing     | `@noble/hashes` (`sha256Hasher`, universal code) | `@noble/hashes` (pure JavaScript)      |
| Random salts        | `node:crypto` `randomBytes` (128-bit salts)      | expo-crypto `getRandomBytes`           |
| Issuer signing      | RS256 via `node:crypto`                          | Not required                           |
| Key-binding signing | Verification only (Sprint 3)                     | ES256 via @noble/curves (Decision 007) |

A custom module will not be developed. It remains a documented fallback.

### Reason

- Node.js: 14/14 spike checks passed, covering issuance, selective presentation, verification,
  replay protection, audience checks, forged disclosures, tampered credentials, stolen
  credentials and missing key binding.
- Real Android phone in Expo Go: 10/10 checks passed, including library loading on Hermes, key
  generation (212 ms), credential decoding (2 ms) and presentation building (9 ms).
- A presentation built on the phone was verified on Node.js, confirming cross-platform
  compatibility.
- The library does not depend on Node.js built-in modules, `Buffer` or WebCrypto.
- The custom implementation was built during the spike and verified with the library, so it is
  feasible, but it would mean re-implementing parsing, presentation, key binding and
  verification edge cases that the library already handles and tests.
- @sd-jwt/sd-jwt-vc also bundles for Android, but adds about 0.4 MB of status-list code that
  UniVault does not need, because UniVault has its own status endpoint (FR-BAK-01).

### Consequences

- `@sd-jwt/core` is an exact-pinned dependency (no `^` range) of `crypto-core`, and of the root
  `devDependencies` for the spike scripts, because the library is pre-1.0 and was recently
  restructured. The backend uses it only through `@univault/crypto-core`; the wallet will add
  the same pinned version in Sprint 2.
- The library does not validate `cnf` (holder key) or `status`. UniVault's verifier must verify
  the key-binding JWT against `cnf.jwk` and check revocation through `status.status_uri`
  (FR-VER-02); this is planned for `verifyPresentation()` in Sprint 3.
- The wallet must polyfill `crypto.getRandomValues` using expo-crypto, because Hermes does not
  provide it.
- The wallet will not verify the issuer's RS256 signature when receiving a credential. This is
  acceptable because credentials come from the issuer over HTTPS and the verifier always checks
  the RS256 signature.
- SD-JWT reveals the number of undisclosed claims (digest count). This known limitation will be
  reported in the evaluation; decoy digests, which the library supports, are a possible
  mitigation.
- Library upgrades must be deliberate and re-tested against the spike scripts and the
  `crypto-core` tests.

## Decision 007: ES256 for holder key binding

- **Date:** Thu 19 Nov 2026
- **Sprint:** S1
- **Status:** Proposed (to be confirmed at the Sprint 1 review on 22 November 2026)
- **Requirements:** NFR-01 (refined by this decision), FR-WAL-06, FR-VER-02
- **Related:** [SD-JWT spike README](../spikes/sd-jwt/README.md) (sections 1 and 5, L1–L3),
  [credentials-api.md](../api/credentials-api.md) (`signCredential` holder key rules)
- **Evidence:** spike checks 5, 6, 12 and 13 ([s1-sdjwt-spike-node-14-of-14.png](evidence/s1-sdjwt-spike-node-14-of-14.png)),
  [s1-sdjwt-spike-phone-10-of-10.jpeg](evidence/s1-sdjwt-spike-phone-10-of-10.jpeg),
  [s1-sdjwt-spike-phone-presentation-verified.png](evidence/s1-sdjwt-spike-phone-presentation-verified.png);
  holder key validation in [`backend/test/credentials.test.ts`](../../backend/test/credentials.test.ts),
  [`crypto-core/test/jwk-thumbprint.test.ts`](../../crypto-core/test/jwk-thumbprint.test.ts)

### Context

NFR-01 in the mid-point report states that all credential and disclosure exchanges shall use
RS256 digital signatures.

UniVault uses two different signatures:

1. **Issuer signature:** the issuer (employer or bank) signs each credential. This happens on
   the backend (Node.js).
2. **Holder key-binding signature:** when presenting a credential, the wallet signs a key-binding
   JWT containing the verifier's nonce and audience. This proves the presentation comes from the
   legitimate holder and prevents replay. This happens on the mobile phone.

For key binding, the wallet must generate its own key pair on the device and sign with it during
every presentation.

The SD-JWT spike found the following platform constraints in Expo Go:

- expo-crypto provides SHA digests, random bytes and AES encryption, but no RSA or ECDSA signing.
- Hermes does not provide WebCrypto (`crypto.subtle`).
- Pure-JavaScript RSA-2048 key generation took about 1.2 seconds on a server, and is expected to
  be several times slower on a mobile phone.
- Pure-JavaScript ES256 (P-256) key generation took about 0.6 ms on the server and 212 ms on the
  test phone, including one-time initialisation.

### Options considered

1. **RS256 for holder key binding using pure JavaScript:** complies literally with NFR-01, but
   RSA key generation on the phone is slow and unpredictable, and affects onboarding.
2. **RS256 for holder key binding using a native module (react-native-quick-crypto):** fast
   native RSA, but requires an Expo development build instead of Expo Go, which adds build
   setup and slows down development.
3. **ES256 (ECDSA P-256) for holder key binding using @noble/curves:** fast, pure JavaScript,
   audited, and works in Expo Go. Issuer signatures remain RS256.

### Decision

Use **ES256 (ECDSA with P-256 and SHA-256)** for the holder key-binding JWT, implemented with
@noble/curves.

Issuer credential signatures **remain RS256**, as specified in the mid-point report.

| Signature                   | Algorithm | Where it runs                   |
| --------------------------- | --------- | ------------------------------- |
| Issuer credential signature | RS256     | Backend (Node.js native crypto) |
| Holder key-binding JWT      | ES256     | Mobile wallet (@noble/curves)   |

The verifier accepts only RS256 for issuer signatures and only ES256 for key-binding JWTs.
`crypto-core`'s `verifySdJwt()` already rejects any issuer algorithm other than RS256 (including
`none` and HS256). The ES256-only key-binding check will be part of `verifyPresentation()` in
Sprint 3; the spike configured `@sd-jwt/core` the same way (`allowedIssuerAlgorithms: ['RS256']`,
`allowedKeyBindingAlgorithms: ['ES256']`).

NFR-01 is refined as follows: _issuer-signed credentials shall use RS256; holder key-binding
proofs shall use ES256._

### Reason

- RSA key generation in pure JavaScript is too slow for a good onboarding experience on mobile
  devices, particularly lower-end phones.
- ES256 key generation and signing are fast in pure JavaScript and work in Expo Go without native
  modules.
- ES256 is a widely used JOSE algorithm (RFC 7518) and is commonly used for key binding in SD-JWT
  VC and digital identity wallet implementations.
- Keeping RS256 for issuer signatures preserves the design in the mid-point report for the trust
  relationship between issuers and verifiers.
- Staying with Expo Go keeps the development workflow simple within the five-week development
  window.
- The spike verified the complete flow: RS256 issuance, ES256 key binding on a real phone, and
  successful verification on Node.js.

### Consequences

- The wallet generates a P-256 key pair during onboarding and stores the private key in the
  device's secure store (Sprint 2).
- Issued credentials include the holder's ES256 public key in `cnf.jwk`. The backend's
  `signCredential()` already accepts only an EC P-256 public JWK (no `d`), checks the point is on
  the curve and keeps only `kty`, `crv`, `x` and `y`; it records the key's RFC 7638 thumbprint.
- The verifier must support two algorithms: RS256 for the issuer signature and ES256 for key
  binding.
- The final report must document NFR-01 as refined, with the justification above.
- If the supervisor requires RS256 for key binding, Option 2 (native module with an Expo
  development build) is the fallback, with additional setup effort in Sprint 2.

## Decision 008: PostgreSQL, with embedded PGlite for development and hand-written migrations

- **Date:** Fri 20 Nov 2026
- **Sprint:** S1
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, FR-ISS-02, FR-ISS-03, FR-WAL-05, FR-BAK-01, NFR-08
- **Related:** [database-design.md](../database/database-design.md),
  [`backend/migrations/`](../../backend/migrations/),
  [development-setup.md](../development-setup.md)
- **Evidence:** [`backend/test/db/schema.test.ts`](../../backend/test/db/schema.test.ts)
  (migrations, checksums, Drizzle schema matches the SQL),
  [`backend/test/db/records.test.ts`](../../backend/test/db/records.test.ts) (constraints),
  [`backend/test/db/seed.test.ts`](../../backend/test/db/seed.test.ts),
  [`backend/test/db/seed-disk.test.ts`](../../backend/test/db/seed-disk.test.ts) (on-disk
  database; split out of `seed.test.ts` on 24 Nov 2026),
  [`backend/test/config.test.ts`](../../backend/test/config.test.ts) (production requires
  `postgres://`); [s1-database-tests-96-pass.png](evidence/s1-database-tests-96-pass.png),
  [s1-database-inspect-tables.png](evidence/s1-database-inspect-tables.png),
  [s1-database-health-up.png](evidence/s1-database-health-up.png)

### Context

The backend stores issuers, signing-key metadata, staff, holder records, credential records and
offers. These records have real relationships (issuer → holder → credential → offer, and reissue
chains between credentials), and several integrity rules matter for security: one active
signing key per issuer, a credential that is not pending must record the key it was signed with,
and pre-authorised codes are stored only as hashes.

The developer works on Windows, on a five-week schedule, and wanted no database server to
install or run during development and tests. Claims differ between the Employment and KYC
credentials, so part of the data is document-shaped.

### Options considered

1. **PostgreSQL server for all environments:** the real database everywhere, but it must be
   installed and running for every development session and test run.
2. **SQLite for development, PostgreSQL in production:** easy locally, but a different SQL
   dialect, so constraints and queries could behave differently in production.
3. **PostgreSQL, with PGlite (PostgreSQL compiled to WebAssembly) for development and tests:**
   the same database engine everywhere, with nothing to install locally.
4. **A document database (e.g. MongoDB):** flexible claims, but integrity rules would have to
   live in application code.

For schema changes: **drizzle-kit generated migrations** or **hand-written SQL migrations**.

### Decision

Use **PostgreSQL** (option 3):

- **Development:** embedded **PGlite** (`DATABASE_URL=pglite://./.data/univault`, the default).
- **Tests:** in-memory PGlite (`pglite://memory`), a fresh database per test file.
- **Production:** a **hosted PostgreSQL** server (e.g. Neon or Supabase) through the `pg`
  driver; `DATABASE_URL` must be a `postgres://` URL.

Schema changes are **hand-written SQL files** in `backend/migrations/` (`NNNN_description.sql`),
applied in order, each in a transaction, and protected by a checksum recorded in
`schema_migrations`. Current migrations: `0001_initial_schema.sql` (6 tables: `issuers`,
`issuer_keys`, `issuer_staff`, `holders`, `credential_records`, `credential_offers`),
`0002_staff_login_protection.sql`, `0003_holder_audit.sql` and `0004_offer_invalidation.sql`.
Queries use **Drizzle ORM**; `src/db/schema.ts` mirrors the SQL and a test checks the two agree.
**drizzle-kit is not used.**

### Reason

- Integrity rules are enforced by the database itself (foreign keys, CHECK constraints, partial
  unique indexes), not only by application code.
- `jsonb` stores the claims, which differ per credential type, without giving up relational
  integrity.
- PGlite is genuine PostgreSQL (17), so development, tests and production run the same SQL, with
  no native binaries to install on Windows.
- Each test file gets a fresh in-memory database, so tests are isolated and repeatable.
- Hand-written DDL is easy to review and can be quoted in the report; drizzle-kit would add
  extra native binaries.

### Consequences

- Production refuses the embedded database (`DATABASE_URL` must be `postgres://…`).
- Applied migrations must never be edited; every change is a new migration file, and
  `schema.ts` must be updated to match.
- PGlite has a single connection and runs one transaction at a time: code inside a transaction
  must use the transaction handle (`tx`), or it waits on itself (Sprint 1, Issue 5).
- PGlite start-up is slow on Windows, so the test timeouts are generous (Sprint 1, Issue 4).

## Decision 009: Issuer staff authentication (JWT, database re-check and lockout)

- **Date:** Fri 20 Nov 2026
- **Sprint:** S1
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, NFR-06, NFR-08
- **Related:** [issuer-staff-authentication.md](../security/issuer-staff-authentication.md),
  migration `backend/migrations/0002_staff_login_protection.sql`
- **Evidence:** [`backend/test/auth.test.ts`](../../backend/test/auth.test.ts),
  [`backend/test/passwords.test.ts`](../../backend/test/passwords.test.ts), isolation tests in
  each API test file; [s1-auth-tests-140-pass.png](evidence/s1-auth-tests-140-pass.png),
  [s1-auth-login-and-staff-list.png](evidence/s1-auth-login-and-staff-list.png),
  [s1-auth-officer-forbidden.png](evidence/s1-auth-officer-forbidden.png)

### Context

Issuer staff (officers and admins at employers and banks) must log in to the issuer portal
before they can create holder records, issue credentials or manage signing keys. Each staff
member belongs to exactly one issuer, and one issuer must never see or act on another issuer's
data. Verifiers and wallets do not log in as staff.

### Options considered

1. **Server-side sessions with a cookie:** easy to revoke, but needs a session store and CSRF
   protection, and is awkward for a separate portal origin.
2. **Stateless JWT access tokens only:** simple and scalable, but a disabled account or a changed
   role keeps working until the token expires.
3. **Short-lived JWT access tokens, with the staff member reloaded from the database on every
   request:** stateless tokens, but changes to an account take effect immediately.
4. **An external identity provider (OAuth/OIDC):** strong, but too much setup for the prototype.

### Decision

Use option 3:

- Login with email and password returns an **HS256 JWT** (1 hour by default,
  `JWT_EXPIRES_IN_SECONDS`, allowed range 300–86400) with issuer `univault-backend` and audience
  `univault-issuer-portal`. Only HS256 is accepted.
- `requireAuth` verifies the token and **reloads the staff member from the database** on every
  request; role, active status and issuer come from the database, not from the token.
- **Roles:** officers manage holders, issue and reissue credentials and create offers; admins can
  also revoke, manage keys and list staff.
- **Isolation:** the issuer always comes from the login, never from the request body. Another
  issuer's records return `404`; a wrong `:issuerId` in the URL returns `403`
  (`requireOwnIssuer`).
- **Brute-force protection:** an account is locked for 15 minutes after 5 consecutive failed
  logins (`423 ACCOUNT_LOCKED`; `LOGIN_MAX_FAILED_ATTEMPTS`, `LOGIN_LOCKOUT_MINUTES`), and a
  per-IP rate limit allows 20 login attempts per 15 minutes (`429`; `LOGIN_RATE_LIMIT_MAX`,
  `LOGIN_RATE_LIMIT_WINDOW_MINUTES`).
- Passwords are stored as **scrypt** hashes; every failed login returns the same
  `401 INVALID_CREDENTIALS`, and a hash is always checked so response times are similar.

### Reason

- Reloading the staff member on each request removes the main weakness of stateless tokens
  (disabled users and changed roles) at the cost of one indexed query.
- Taking the issuer from the login, and answering `404` for other issuers' records, prevents one
  organisation from discovering or changing another's data.
- Lockout and rate limiting together slow down guessing against one account and across many
  accounts.
- jose and Node's built-in scrypt are well-tested building blocks, so no cryptography is written
  by hand.

### Consequences

- Logout does not invalidate a token on the server; tokens are short-lived and the portal
  discards them. A deny-list or refresh tokens could be added later.
- The rate limiter counts in memory; several backend instances would need a shared store.
- `JWT_SECRET` (at least 32 characters) is required in production; in development a temporary
  secret is generated, so everyone is signed out on restart.
- No multi-factor authentication or password reset in the prototype.

## Decision 010: Credential signing deferred to wallet redemption (holder binding)

- **Date:** Fri 20 Nov 2026
- **Sprint:** S1
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, FR-ISS-02, NFR-01, NFR-06, NFR-08
- **Related:** [credentials-api.md](../api/credentials-api.md) (sections 1, 2 and 4),
  [database-design.md](../database/database-design.md) (`credential_records`)
- **Evidence:** [`backend/test/credentials.test.ts`](../../backend/test/credentials.test.ts)
  (61 tests: pending creation, `signCredential`, single-use signing, holder key validation);
  [s1-credentials-issue-employment.png](evidence/s1-credentials-issue-employment.png),
  [s1-credentials-issue-kyc.png](evidence/s1-credentials-issue-kyc.png),
  [s1-credentials-duplicate-409.png](evidence/s1-credentials-duplicate-409.png),
  [s1-credentials-isolation-404.png](evidence/s1-credentials-isolation-404.png)

### Context

Every UniVault credential carries `cnf.jwk`, the public key of the holder's wallet (Decision
007). The verifier later checks a key-binding JWT signed with the matching private key, which
stops a copied credential from being presented by someone else.

The wallet key is created on the phone and only reaches the issuer when the holder scans the QR
offer and redeems it (Sprint 2). Issuer staff, however, start issuance from the issuer portal
before that moment.

### Options considered

1. **Sign when staff click "issue", without `cnf`:** simple, but the credential is not bound to
   any device and can be replayed by anyone who obtains it.
2. **Sign when staff click "issue", with a placeholder key, and re-sign later:** two signatures
   for one credential, and the first one would be unbound.
3. **Create a pending record when staff issue, and sign at redemption with the wallet's key:** one
   signature, always bound to the real wallet key.

### Decision

Use option 3:

- `POST /api/v1/credentials` creates a **pending** credential record: claims re-validated
  against the schema and snapshotted, `age_over_18` recalculated, expiry fixed (Decision 005),
  and an active issuer key required. Nothing is signed.
- `signCredential(credentialId, holderPublicJwk)` in
  `backend/src/services/credentials.service.ts` signs the SD-JWT with the issuer's **active**
  key when the wallet redeems its offer. It accepts only an EC P-256 **public** JWK, refuses a
  credential that has already expired, recalculates `age_over_18` on the signing date, and
  updates the record `WHERE status = 'pending'`, so a credential is signed at most once.
- The compact SD-JWT is returned to the caller only; it is never stored or logged. The record
  keeps `issuer_kid` and the RFC 7638 `holder_key_thumbprint`.
- A holder can have only one `pending` or `valid` credential of each type
  (`409 ACTIVE_CREDENTIAL_EXISTS`); the holder row is locked (`SELECT … FOR UPDATE`) during that
  check.

### Reason

- A credential is never signed without a holder key, so every credential in circulation is
  device-bound.
- Exactly one signature per credential keeps the audit trail simple: `issued_at`, `issuer_kid`
  and the holder key are recorded together, as the database CHECK constraint requires.
- Signing at redemption also uses the issuer's current key, so key rotation needs no special
  handling for credentials issued but not yet collected.

### Consequences

- The Sprint 2 redemption endpoint (`POST /api/v1/credential-offers/credential`, currently `501`)
  must call `signCredential` after checking the pre-authorised code; no other code path signs
  credentials.
- A pending credential that is never redeemed blocks a new credential of the same type for that
  holder until it expires, unless an admin revokes it: `POST /credentials/:id/revoke` accepts
  `pending` as well as `valid` credentials (Decision 012).
- A credential revoked or superseded before redemption can never be signed: `signCredential`
  updates only `WHERE status = 'pending'`, and revoke/reissue invalidate the open offers.
- `kyc_verification_date` is taken from the date the pending record was created, not from the
  signing date.

## Decision 011: OpenID4VCI pre-authorised code offer format

- **Date:** Fri 20 Nov 2026
- **Sprint:** S1
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, NFR-01, NFR-06, NFR-08
- **Related:** [credential-offers-api.md](../api/credential-offers-api.md), migration
  `backend/migrations/0004_offer_invalidation.sql`;
  [OpenID for Verifiable Credential Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
- **Evidence:** [`backend/test/credential-offers.test.ts`](../../backend/test/credential-offers.test.ts)
  (40 tests); [s1-offers-create-payload.png](evidence/s1-offers-create-payload.png),
  [s1-offers-qr-content-decoded.png](evidence/s1-offers-qr-content-decoded.png),
  [s1-offers-old-invalidated.png](evidence/s1-offers-old-invalidated.png),
  [s1-offers-status-active.png](evidence/s1-offers-status-active.png),
  [s1-offers-isolation-404.png](evidence/s1-offers-isolation-404.png),
  [s1-offers-tests-287-pass.png](evidence/s1-offers-tests-287-pass.png)

### Context

After issuer staff create a pending credential, it has to reach the holder's wallet. The holder
is usually in front of the officer (HR desk or bank counter) and scans a QR code shown in the
issuer portal. The QR content must tell the wallet which issuer and credential type the offer is
for, and carry something the wallet can exchange for the signed credential (Sprint 2), without
the holder having an account at the issuer.

### Options considered

1. **A custom QR format** (e.g. `univault://offer?id=…&secret=…`): simple, but invented for this
   project, with no standard to point to and no interoperability.
2. **OpenID4VCI credential offer, authorisation code flow:** standard, but the wallet would have
   to log in to the issuer, which the holder has no account for.
3. **OpenID4VCI credential offer, pre-authorised code flow:** standard; the issuer has already
   identified the holder in person, so a one-time code in the QR is the authorisation.

### Decision

Use the credential offer of **OpenID for Verifiable Credential Issuance 1.0** (Final
Specification, approved by the OpenID Foundation in September 2025;
<https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html>) with the
**pre-authorised code grant**:

```json
{
  "credential_issuer": "<PUBLIC_BASE_URL>/api/v1/issuers/<issuerId>",
  "credential_configuration_ids": ["EmploymentCredential"],
  "grants": {
    "urn:ietf:params:oauth:grant-type:pre-authorized_code": { "pre-authorized_code": "<code>" }
  }
}
```

The QR content is `openid-credential-offer://?credential_offer=` + the URL-encoded JSON (offer
by value). `credential_configuration_ids` holds `EmploymentCredential` or `KYCCredential`.

- The code is 256 random bits (`crypto.randomBytes(32)`, base64url); only its SHA-256 hash is
  stored.
- An offer expires after `CREDENTIAL_OFFER_TTL_SECONDS` (default 600 when decided; 300 since
  26 Nov 2026, see Consequences) and never outlives its credential.
- Only one usable offer per credential: a new offer invalidates the previous usable one
  (`invalidated_at`, migration 0004; the credential row is locked).
- The response carrying the code is sent once, with `Cache-Control: no-store`; the code is never
  logged or returned again. `GET /api/v1/credential-offers/:offerId` returns only the derived
  status (`active`, `redeemed`, `expired`, `invalidated`).

### Reason

- OpenID4VCI 1.0 is a final, published standard for issuing credentials to wallets, and the EU
  Digital Identity Wallet Architecture and Reference Framework (ARF) names OpenID4VCI as its
  issuance protocol. Using it gives recognised field names and a specification to justify the
  design against.
- The pre-authorised code flow matches how UniVault issues: staff have already verified the
  holder, so no holder login at the issuer is needed.
- Offer by value keeps the QR self-contained: the wallet doesn't need an extra request to fetch
  the offer.
- Storing only a hash means a database leak cannot be used to claim credentials, as with
  passwords.

### Consequences

- Sprint 2 must implement the token and credential exchange
  (`POST /api/v1/credential-offers/token` and `/credential`, currently `501`), using
  `findOfferByCode()` and `signCredential()`, and count `failed_attempts` to limit guessing.
- The OpenID4VCI issuer metadata (`/.well-known/openid-credential-issuer`) and the optional
  transaction code (`tx_code`) are not implemented; they can be added if needed.
- `PUBLIC_BASE_URL` must be reachable by the phone (the laptop's LAN IP during testing), because
  `credential_issuer` is built from it.
- Revoking or reissuing a credential invalidates its open offers in the same transaction
  (Decision 012), so a QR code for a withdrawn credential can no longer be redeemed.
- **Offer lifetime reduced from 10 to 5 minutes (26 Nov 2026):** enough time for the holder to
  scan and accept, and a shorter window for an intercepted QR code to be misused.
  (`CREDENTIAL_OFFER_TTL_SECONDS` default 600 → 300.)

**Follow-up (26 Nov 2026):** a backend test now checks the offer against OpenID4VCI 1.0
(`checkOpenId4VciOffer`); every field name already matched. Production refuses a non-https
`PUBLIC_BASE_URL` (the `credential_issuer`). Offers gained `serverTime`, an
`invalidation_reason` (migration 0008) and a cancel endpoint; `tx_code` stays out and the
portal keeps the code in memory only (Decision 021).

## Decision 012: Reissue supersedes immediately; status changes recorded as append-only events

- **Date:** Tue 24 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** FR-ISS-03, FR-BAK-01, NFR-06, NFR-08
- **Related:** [credentials-api.md](../api/credentials-api.md) (sections 2 and 6),
  [credential-offers-api.md](../api/credential-offers-api.md) (section 4),
  [database-design.md](../database/database-design.md) (sections 3, 4 and 8), migrations
  `backend/migrations/0005_revocation_and_status_events.sql` and
  `0006_reason_value_checks.sql`
- **Evidence:** [`backend/test/credential-revocation.test.ts`](../../backend/test/credential-revocation.test.ts)
  (revoke, reissue, events, signing safety, concurrency),
  [`backend/test/db/records.test.ts`](../../backend/test/db/records.test.ts) and
  [`backend/test/db/schema.test.ts`](../../backend/test/db/schema.test.ts) (CHECK, UNIQUE and
  append-only rules; migration backfill); evidence script `scripts/evidence/s1-revocation.ps1`
  (sections 1–7)

### Context

FR-ISS-03 requires that a credential is never edited in place: a change of data, a lost wallet
or a renewal means the old credential is withdrawn and a new one issued. Credentials are signed
only when the wallet redeems an offer (Decision 010), so a replacement starts as `pending` and
becomes `valid` later, possibly never if the holder does not scan the new QR code.

Two questions had to be answered: **when** the old credential stops being valid, and **how** the
issuer can later show who changed a credential's status, when and why (audit, PDPA
accountability), given that the credential row only holds its current state.

### Options considered

**When the old credential is superseded:**

1. **Supersede at reissue:** in one transaction, the old credential becomes `superseded` and the
   pending replacement is created. The holder has no valid credential of that type until they
   redeem the new offer.
2. **Supersede at redemption of the replacement:** the old credential stays `valid` until the
   wallet redeems the new one; only then is it superseded. The holder is never without a
   credential, but two credentials of the same type are briefly "active" together, and the old
   data (e.g. a former designation, or a key on a lost phone) stays presentable until the
   holder acts.

**How status changes are recorded:**

1. **Columns on the credential row only** (`revoked_at`, `superseded_at`, …): shows the last
   change, not the history.
2. **An append-only `credential_status_events` table**, written in the same transaction as
   each change.

### Decision

- **Reissue supersedes immediately** (option 1). `POST /credentials/:id/reissue` locks the old
  credential and the holder, builds the replacement from the holder's current record through
  the issuance code, sets the old credential to `superseded`, inserts the new one as `pending`
  with `replaces_credential_id`, and invalidates the old credential's open offers. Only `valid`
  credentials can be reissued; a pending one is revoked and issued again.
- **Revoke** (`POST /credentials/:id/revoke`, admin only) accepts `pending` and `valid`
  credentials, with a reason from a fixed list and an optional note (required for `other`).
- **Every status change is an event** in `credential_status_events`: creation, signing at
  redemption (no staff member), revocation and supersede (reason, note, staff). The table is
  append-only (a trigger refuses UPDATE and DELETE), its issuer must match the credential's
  (composite foreign key), and `GET /credentials/:id/events` returns it oldest first.
- The credential row keeps its current state for fast reads: `revoked_at`,
  `revoked_by_staff_id`, `revocation_reason`, `superseded_at`, `superseded_by_staff_id`, with
  CHECK constraints tying each group to its status.

### Reason

- Reissue happens because the old credential is wrong or unsafe (changed data, lost or
  compromised wallet). Leaving it valid until the holder redeems the replacement would keep
  wrong data or a stolen key presentable for an unknown time; superseding at once removes that
  window.
- It keeps the rule "at most one pending or valid credential per holder and type" exact, with no
  special case for a credential that is about to be replaced.
- Doing everything in one transaction means there is never a moment with two active credentials,
  or a superseded credential without a replacement.
- An append-only history answers "who withdrew this credential, when and why" for the audit
  trail and the report, without trusting a mutable row; writing it in the same transaction as
  the change means the history can never disagree with the current status.

### Consequences

- Between reissue and redemption the holder has **no valid credential** of that type. Staff
  should create the new offer straight away; the issuer portal should show this.
- Migration 0005 replaced two 0001 rules: a pending credential can now be revoked without having
  been signed, and a superseded credential records `superseded_at` instead of `revoked_at`.
  Existing rows were migrated and a history was backfilled.
- Staff members who appear in the history cannot be deleted (`ON DELETE RESTRICT`); they are
  deactivated instead.
- Notes may contain personal data: they are stored only in the history, returned only to the
  credential's issuer, never logged, and limited to 500 characters.
- The status endpoint (FR-BAK-01, built in Decision 013) reads `revoked` and `superseded` from
  the credential row; wallets and verifiers treat both as "not valid".
- Reason values are limited to the API enums in the database too (migration 0006, CHECK
  constraints added `NOT VALID`, so free-text reasons stored before 0005/0006 are kept). Adding
  a reason means a new migration as well as a code change.
- A holder record that no longer passes its schema is reported the same way by issuance and
  reissue (`422 HOLDER_DATA_INVALID`), because both use one code path.
- **Temporary:** until Sprint 2 builds redemption, a development-only route
  (`POST /api/v1/dev/credentials/:id/simulate-redemption`, `DEV_SIMULATE_REDEMPTION=true`,
  refused in production, one warning logged at start-up when enabled) is the only way to make
  a credential `valid` for manual testing. It is removed in Sprint 2 when wallet redemption
  ships.

## Decision 013: Per-credential status endpoint; IETF Token Status List as future work

- **Date:** Tue 24 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** FR-VER-02, FR-WAL-05, FR-ISS-03, FR-BAK-01, NFR-06, NFR-08
- **Related:** [status-api.md](../api/status-api.md),
  [credentials-api.md](../api/credentials-api.md) (sections 2, 4 and 6.4),
  [database-design.md](../database/database-design.md) (section 4), Decision 003 (the
  `status` claim), Decision 006 (status-list code not bundled), Decision 012 (revoke and
  reissue), migration `backend/migrations/0007_dev_simulated_expiry_event.sql`
- **Evidence:** [`backend/test/credential-status.test.ts`](../../backend/test/credential-status.test.ts)
  (status rules, boundary, 404 hiding, headers, CORS, rate limit, logging, `jti`/`exp`),
  [`backend/test/dev-routes.test.ts`](../../backend/test/dev-routes.test.ts) (simulated
  expiry); evidence script `scripts/evidence/s1-status.ps1` (sections 1–7)

### Context

A verifier that checks an SD-JWT's signature and `exp` still can't tell whether the issuer
has since revoked or replaced it (Decision 012). FR-BAK-01 needs an online way to ask "is
this credential still good?". Every credential already carries `jti` (the credential ID,
always visible) and `status.status_uri` (Decision 003). What was left open was how
verifiers get the status, and what that costs in privacy.

The IETF OAuth working group's **Token Status List (TSL)**
(draft-ietf-oauth-status-list) is the emerging standard for this. When checked on 24 Nov
2026, the datatracker listed draft -21 (21 June 2026) as "Proposed Standard" with IESG
state "RFC Ed Queue" and RFC Editor status "In Progress (Second Edit)". It has been
approved for publication but has no RFC number yet.

### Options considered

1. **Per-credential lookup** (`GET /status/:credentialId`): the verifier asks about one
   credential and gets `valid`, `revoked`, `superseded` or `expired`. Simple to build and
   test, and the answer is always current. But the issuer sees every lookup (which
   credential, when, and from which network address), so it can observe where a holder
   uses the credential. And `jti` is the same value at every verifier, so verifiers who
   collude can link presentations.
2. **IETF Token Status List:** the issuer publishes a signed, compressed bit array (a
   status list token); each credential carries `status.status_list.{idx, uri}`. A verifier
   downloads the whole list (which can be cached) and reads one entry. The issuer can't
   tell which credential was checked (herd privacy, better for large lists), and there is
   no per-credential identifier to leak. The costs: a signed list per issuer, index
   allocation, list signing and refresh, cache-lifetime trade-offs, a different `status`
   claim shape, and client code in the wallet and verifier (the status-list code that
   Decision 006 left out). The specification was not yet published as an RFC.
3. **No online status:** rely on short credential lifetimes and `exp` only. No lookups to
   leak, but revocation (FR-ISS-03) would have no effect until expiry, which is a year or
   more. This fails FR-BAK-01.

### Decision

- **Option 1 for the prototype:** a public, unauthenticated
  `GET /api/v1/status/:credentialId` that returns exactly
  `{ credentialId, status, expiresAt, checkedAt }`.
- **One status rule:** `effectiveStatus(record, now)` in `credential-status.ts`, with
  precedence revoked > superseded > expired > valid. Expired is inclusive (`now >=
expires_at`) and computed, never stored. The issuer portal's `effectiveStatus` field
  uses the same function. The clock is injected.
- **Minimise what the endpoint reveals:**
  - only signed credentials (`issued_at` set) have a public status: unknown IDs and
    credentials that were never signed (pending, or revoked while pending) get the same
    `404 CREDENTIAL_STATUS_NOT_FOUND`;
  - no reasons, replacements, holder or staff data;
  - `Cache-Control: no-store`;
  - a per-IP rate limit (`STATUS_RATE_LIMIT_MAX` / `_WINDOW_MINUTES`);
  - CORS open to any origin for this `GET` route only, without credentials.
- **Minimise what the issuer keeps:** lookups are logged at debug level only (credential ID
  and result, never the IP) and never stored in the database. Every log line of this route
  shows the route template `/api/v1/status/:credentialId` instead of the URL.
- **Token and status always agree:** `jti` is the credential ID (non-disclosable), and
  `expires_at` is stored in whole seconds so that `exp` equals it exactly.
- **Token Status List is recorded as future work.**

### Reason

- The project scope is a single-issuer-per-organisation prototype with a handful of
  credentials. Herd privacy, TSL's main benefit, needs large lists to mean anything.
- Option 1 reuses the existing table and the Decision 012 columns: no new signing
  artefact, no index allocation, no list refresh job. It can be tested end to end
  within the sprint.
- Revocation takes effect at once (no list cache lifetime), which is easy to demonstrate
  for FR-ISS-03 and FR-BAK-01.
- TSL was approved but not yet an RFC, and `@sd-jwt/core` (Decision 006) doesn't bundle
  status-list support. Adding it now would mean new library code in the wallet and the
  verifier.
- The privacy cost is known, written down and reduced (minimal answer, no stored lookups,
  debug-only logs, rate limit) rather than ignored.

### Consequences

- **Privacy trade-off:**
  - the issuer _could_ observe when and from where a credential is checked;
  - `jti` is a correlatable identifier across verifiers.
    These are accepted for the prototype, and the dissertation should discuss them (NFR-08).
- The `status` claim uses UniVault's own `status_uri` shape, not TSL's
  `status_list.{idx, uri}`. Moving to TSL later means a new claim shape for newly issued
  credentials. Old credentials can keep the per-credential endpoint until they expire.
- A credential revoked while pending is hidden (404) like any never-signed credential: no
  verifier can hold it. The issuer API still shows `revoked` for it (`effectiveStatus()` is
  unchanged).
- **FR-BAK-01 push-pull:** this endpoint is the **pull** half of FR-BAK-01's dual push-pull
  synchronisation. Verifiers and wallets ask when they need to, and `checkedAt` is the
  staleness timestamp: how old the answer is. The **push** half (notifying wallets of
  status changes) is planned for a later sprint.
- Verifiers must treat `revoked`, `superseded` and `expired` as "not valid", and an
  unreachable endpoint as "status unknown" (verifier policy, Sprint 3).
- The rate limiter counts in memory. Several backend instances would need a shared store.
- **Temporary:** `POST /api/v1/dev/credentials/:id/simulate-expiry` (same
  `DEV_SIMULATE_REDEMPTION` guards) exists only to demonstrate `expired`. It needs a
  `valid → valid` event with reason `dev_simulated_expiry`, which migration 0007 allows.
  The route is removed in Sprint 2 with simulate-redemption; the migration stays.

## Decision 014: Encrypted key file or encrypted env bundle, decrypted once in a central key store; KMS/HSM as future work

- **Date:** Tue 24 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** NFR-01, FR-ISS-02, NFR-08
- **Related:** [issuer-key-management.md](../security/issuer-key-management.md),
  [issuer-keys-api.md](../api/issuer-keys-api.md), Decision 006 (library), Decision 010 (signing
  at redemption), `backend/src/keys/key-store.ts`, `backend/src/keys/startup-check.ts`,
  `scripts/check-secrets.js`
- **Evidence:** [`backend/test/key-store.test.ts`](../../backend/test/key-store.test.ts)
  (sources, every error code, 503 mapping, decrypt-once, rotation, degraded and strict
  start-up, public-only JWKS, leak scan, single owner),
  [`backend/test/key-startup.test.ts`](../../backend/test/key-startup.test.ts) (real
  processes: strict exits, degraded start, env mode, production configuration, keys:bundle),
  [`backend/test/check-secrets.test.ts`](../../backend/test/check-secrets.test.ts); evidence
  script `scripts/evidence/s1-keys.ps1` (sections 1–8)

### Context

Issuer private keys sign every credential (NFR-01, FR-ISS-02). Until now they were encrypted
PEM files in `ISSUER_KEYS_DIR`, and `signCredential()` read and decrypted the file on every
signing. The final demo runs on a cloud host with an **ephemeral filesystem**: files written at
runtime vanish on restart, and the repository must never contain keys. There was also no check
that a loaded key really belonged to its published `kid`. A key problem showed as 500 or 503
depending on where it happened.

### Options considered

1. **Plain PEM in an environment variable:** simplest on any host. But the raw key sits in the
   host dashboard, in shell history and in any environment dump, and one leak is a full
   compromise. Rejected.
2. **Encrypted key file only:** what existed. Safe at rest, but it doesn't work on an
   ephemeral filesystem without a persistent volume, which the demo host does not offer.
3. **Encrypted key file or encrypted env bundle, through one key store:** files locally, and a
   base64 bundle of the _encrypted_ keys as a host secret in the cloud. The passphrase is a
   separate secret. Both modes share one loader, one set of checks and one cache.
4. **Cloud KMS** (AWS KMS, Google Cloud KMS, Azure Key Vault): the key never leaves the
   service, which signs on request. Best practice, but it needs a cloud account and billing,
   per-signature network calls, and a signer interface `@sd-jwt/core` would have to support.
   Too much for the sprint.
5. **HSM:** the strongest protection (a tamper-resistant device), but hardware or a costly
   cloud HSM. Out of scope for a student prototype.

### Decision

- **Option 3.** `ISSUER_KEY_SOURCE=file` (default) reads encrypted PKCS#8 files.
  `ISSUER_KEY_SOURCE=env` reads `ISSUER_KEYS_BUNDLE` (base64 JSON
  `[{ issuerId, kid, encryptedPrivateKeyPem }]`, zod-validated), written by
  `npm run keys:bundle`. In both modes:
  - unencrypted keys are refused;
  - the passphrase comes from `ISSUER_KEY_PASSPHRASE`.
- **One owner:** `src/keys/key-store.ts` is the only code that reads key files, the bundle or
  the passphrase. Signing, generation and rotation, the start-up check, `/health` and the CLI go
  through it. A test enforces this.
- **Decrypt once:** each key is decrypted once, checked (RFC 7638 thumbprint = stored kid;
  derived public key = stored JWK) and kept as a `KeyObject` in a private map. Rotation clears
  and reloads the entry.
- **Errors:** `KeyStoreError` carries only a code, the issuer id and the kid:
  `KEY_NOT_FOUND`, `KEY_DECRYPT_FAILED`, `KEY_UNENCRYPTED`, `KEY_KID_MISMATCH`,
  `KEY_PUBLIC_MISMATCH`, `KEY_SOURCE_INVALID`. The API answers `503 ISSUER_KEY_UNAVAILABLE`
  with a generic message, and the code is logged.
- **Start-up check:** run before listening. **Strict** (exit 1) always in production, or with
  `ISSUER_KEYS_STRICT_STARTUP=true`. Otherwise it warns and starts degraded: only the affected
  issuer's signing fails, and `/health` reports `degraded` (503).
- **Production configuration:**
  - the passphrase has at least 20 characters and isn't the development value from
    `.env.example`;
  - env mode requires the bundle;
  - a non-strict key check is refused.
- **Env mode cannot rotate through the API** (`409 KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE`):
  generate locally, bundle, update the secret, redeploy.
- **Leak prevention:**
  - logger redaction of key fields and the configuration object;
  - a public-only JWKS (test against `d`, `p`, `q`, `dp`, `dq`, `qi`);
  - `check:secrets` now scans the index for PEM private keys, base64-encoded PEM and
    `*.bundle.b64`, as well as by file name;
  - `*.bundle.b64` added to `.gitignore`.
- **Cloud KMS or HSM is future work.** The key store is the seam where it would plug in.

### Reason

- The bundle works on a host with an ephemeral filesystem, without a persistent volume, and
  without ever putting a raw key anywhere. A leaked bundle alone is useless without the
  separately stored passphrase.
- A single owner makes the rule "keys never leak" checkable: one module to review, one error
  type, one place to add a KMS later.
- Decrypting once removes per-signature file reads and decryption.
- The start-up check catches a wrong passphrase, a swapped file or a stale bundle at deploy
  time, not at the first signing in front of a user.
- Strict-in-production with degraded-in-development keeps local work possible when one key is
  missing, while a misconfigured deployment can't go live.
- Options 4 and 5 are the right answer for a real issuer (NFR-01), but not within the sprint,
  budget or library constraints. Recording them keeps the trade-off visible for the report.

### Consequences

- **Process memory:** the decrypted key is still in process memory while the server runs.
  An attacker who controls the process can use it. Only a KMS or HSM removes that.
- **Rotating in env mode** is a redeploy, not an API call. The portal must explain the 409.
- **New settings:** `ISSUER_KEY_SOURCE`, `ISSUER_KEYS_BUNDLE`, `ISSUER_KEYS_STRICT_STARTUP`.
  `.env.example` now carries a development-only passphrase value that production refuses.
- **New CLI command:** `npm run keys:bundle` (`--force` to replace). It checks every key before
  bundling and prints ids, kids and the path only.
- **A real `NODE_ENV=production` start-up** needs PostgreSQL, which isn't available on the
  development machine. Tests and the evidence script therefore prove the production key policy
  with `ISSUER_KEYS_STRICT_STARTUP=true` on the embedded database. The configuration-level
  production refusals (passphrase, bundle) run in real production processes, because they fail
  before the database connects.
- **Signing errors:** a signing key problem is now always `503 ISSUER_KEY_UNAVAILABLE`. It was
  previously `500 ISSUER_KEY_UNAVAILABLE` or `503 KEY_PASSPHRASE_NOT_CONFIGURED`.
  `KEY_PASSPHRASE_NOT_CONFIGURED` remains only for key generation.
- **Failed loads are remembered** for `KEY_RETRY_BACKOFF_SECONDS` (default 30): signings in that
  window get the cached error without another decryption, so a broken key can't be used to make
  the server decrypt on every request. A fixed key is picked up after the window, or at once on
  `reload()` / rotation.

## Decision 015: Frontend stack: React + Vite + TS, React Router, TanStack Query, Tailwind + shadcn/ui, react-i18next, shared portal-ui package

- **Date:** Tue 24 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** NFR-02, NFR-04, NFR-05, NFR-08, FR-ISS-01
- **Related:** [issuer-portal.md](../frontend/issuer-portal.md),
  [portal-ui/README.md](../../portal-ui/README.md), Decision 001 (TypeScript), Decision 002
  (root ESLint and Prettier), Decision 016 (token storage)
- **Evidence:** `issuer-portal/test/` (Vitest, React Testing Library, MSW), `portal-ui/test/`,
  `issuer-portal/e2e/login.spec.ts` (Playwright); screenshots listed in
  [evidence/s1-portal-login-guide.md](evidence/s1-portal-login-guide.md)

### Context

The issuer portal is the first frontend; the verifier portal follows in Sprint 3. Both are
staff-facing single-page apps that talk to the existing REST API with a bearer token. They
need:

- English and Sinhala (NFR-02);
- usable and accessible screens (NFR-04, NFR-05);
- no leaks of personal data or secrets (NFR-08).

The issuer side must cover sign-in and, later, holders, credentials and offers (FR-ISS-01).
The repository already uses TypeScript (pinned 5.9.3) with ESM, root ESLint and Prettier, and
`file:` packages built with `tsc` (crypto-core). The developer works alone, on Windows, with a
five-week schedule.

### Options considered

1. **Framework:**
   - **React + Vite + TypeScript (SPA):** small, fast dev server, the portals' planned
     stack (README). No server rendering needed: everything is behind a login and served as
     static files.
   - **Next.js:** routing, server rendering and API routes built in. But it needs a Node
     server (or its own hosting model), adds a second backend layer next to Express, and its
     server/client split is more to learn for little gain behind a login.
2. **Component library:**
   - **MUI or Ant Design:** complete component sets, fast to start. But they are large bundles
     with their own styling systems (Emotion or CSS-in-JS, which needs `style-src
'unsafe-inline'` or nonces under a strict CSP), are hard to restyle, and are opinionated
     about Latin typography.
   - **Tailwind CSS + shadcn/ui:** utility CSS compiled to one static stylesheet (CSP-friendly).
     shadcn/ui components are copied into the code base (owned and editable, accessible markup
     patterns), so only the components in use exist. More hand work per component.
3. **Server state:**
   - **Redux (Toolkit):** one global store. Its strengths (complex client state, middleware)
     are not needed: almost all state here is server data plus the session.
   - **TanStack Query:** caching, loading and error states and refetching for server data,
     with a single `clear()` on logout. The session itself is small React context.
4. **Routing:** React Router (data router: per-route error boundaries, nested layouts) or
   TanStack Router (type-safe, newer). React Router is the more widely documented choice for a
   report.
5. **i18n:** react-i18next (mature, interpolation, typed keys, language detection hooks) or
   FormatJS/react-intl (ICU messages, heavier). The strings are simple, so react-i18next.
6. **Shared layout:**
   - copy the layout into each portal;
   - a shared **`portal-ui`** package (app-agnostic: no routes, API calls or text), built with
     `tsc` like crypto-core and linked with `file:../portal-ui`.

### Decision

- **Stack:** React 19 + Vite 8 + TypeScript 5.9.3 (strict, ESM). All pinned exactly.
  - **Routing:** React Router 8 (data router).
  - **Server state:** TanStack Query 5.
  - **Styling:** Tailwind CSS 4 with shadcn/ui-style components (copied by hand, only the ones
    in use).
  - **i18n:** react-i18next with bundled `en`/`si` resources.
  - **Validation:** zod 4, with the backend's rules (e.g. the trimmed email).
- **`@univault/portal-ui`** holds the reusable layout:
  - AppShell, Sidebar with role filtering, Header, PageHeader;
  - EmptyState/ComingSoon, ErrorBoundary/ErrorFallback, FullPageSpinner;
  - the primitives and the design tokens.

  The verifier portal will consume it in Sprint 3.

- **Tests:**
  - Vitest + React Testing Library + MSW for unit and component tests;
  - one Playwright e2e spec (Chromium) against the real backend on a throwaway database, kept
    out of `npm test`.
- **Lint:** the root ESLint config adds react-hooks (with its React Compiler rules), jsx-a11y
  and react-refresh, scoped to the portal packages.

### Reason

- **Static deployment:** a static SPA fits a portal that is used only after login. It can be
  served by any static host with a strict CSP and no extra server.
- **CSP-friendly styling:** Tailwind's static stylesheet works with `style-src 'self'`.
  CSS-in-JS libraries would need `'unsafe-inline'` or nonces.
- **Small bundle:** shadcn/ui keeps it small and the markup accessible, without a heavy library.
- **Session clean-up:** TanStack Query covers what the portal does (load, cache, refetch, show
  errors). Clearing the cache on logout is one call, which matters for NFR-08: no previous
  user's data stays in memory.
- **One layout:** a shared `portal-ui` package keeps the two portals consistent. Being
  text-free and router-agnostic lets each portal keep its own routes and translations.
- **Tooling:** the stack matches the repository's conventions (TypeScript, ESM, root lint, `file:`
  packages).

### Consequences

- **Updating shadcn/ui components** is manual: they are copied, not a dependency.
- **portal-ui must be built** before the portal runs. `pre…` scripts do this, and Tailwind
  scans `portal-ui/src` (`@source`). Vite dedupes React, because portal-ui has its own copy for
  its tests.
- **Bundle size:** the production bundle is about 561 kB minified (about 175 kB gzip), split
  into react, router, vendor and app chunks. zod and React DOM are the largest parts. Code
  splitting per page can come later, if needed.
- **Windows bindings:** Vite 8 and Tailwind 4 bring native bindings (rolldown, lightningcss,
  oxide). Their win32-x64 packages are pinned in `optionalDependencies`, as in the backend.
- **Sinhala wording** is a developer draft and needs native-speaker review before release.

## Decision 016: Staff token in memory + sessionStorage, never localStorage; httpOnly cookie as future work

- **Date:** Tue 24 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** NFR-02, NFR-04, NFR-05, NFR-08, FR-ISS-01
- **Related:** [issuer-portal.md](../frontend/issuer-portal.md) (sections 3 and 6), Decision 009
  (staff authentication: short-lived HS256 JWT, database re-check), Decision 015
- **Evidence:** `issuer-portal/test/session.test.tsx` (restore, 401 mid-session, expiry timer,
  logout, the localStorage spy), `issuer-portal/e2e/login.spec.ts` (sessionStorage only in a real
  browser), `issuer-portal/test/csp.test.ts`

### Context

The backend issues a short-lived bearer JWT (`JWT_EXPIRES_IN_SECONDS`, default 1 hour) on
staff login (Decision 009), and every API call re-checks the account in the database. The
portal must keep that token somewhere:

- staff expect a page refresh not to sign them out (NFR-04);
- a stolen token lets an attacker act as that staff member until it expires (NFR-08: issuer
  staff can see personal data).

The main browser threat is **XSS**: a script running in the portal's origin can read anything
JavaScript can read.

### Options considered

1. **localStorage:**
   - **For:** survives refresh and browser restarts, shared by all tabs.
   - **Against:** readable by any script on the origin (XSS exfiltrates it). It persists after
     the tab and the browser are closed, so it is still there on a shared computer, and it
     stays until it expires.
2. **Memory only (React state):**
   - **For:** not in any storage, gone when the tab closes, the smallest XSS window.
   - **Against:** every refresh or new tab signs the user out, which is bad usability for a
     daily work tool. An XSS script can still use the token while the page is open.
3. **Memory + sessionStorage:**
   - **For:** the live token is in memory, with one copy in sessionStorage, which survives a
     refresh. sessionStorage is per tab and is cleared when the tab closes, so nothing
     outlives the session on a shared computer.
   - **Against:** XSS can still read it, like option 1, but only while the tab is open.
4. **httpOnly, Secure, SameSite cookie, plus CSRF protection:**
   - **For:** JavaScript cannot read the token at all, which is the strongest protection
     against token theft by XSS.
   - **Against:** it needs backend changes:
     - a cookie-issuing login;
     - CSRF tokens (or double-submit) for state-changing requests;
     - CORS with credentials;
     - SameSite rules across the portal's and the API's domains (different sites on most free
       hosts make `SameSite=Strict` impossible).

     XSS can still make requests _as_ the user while the page is open; it just can't take the
     token away.

### Decision

- **Option 3:**
  - the token lives in memory in `AuthProvider`, with **one copy in sessionStorage**
    (`univault.issuer-portal.token`);
  - it is **never written to localStorage**;
  - localStorage holds only the language preference.
- **Restore:** on load, a stored token is validated with `GET /auth/me`. The role and
  organisation come from the server.
- **Session end:** any 401 `TOKEN_EXPIRED` / `INVALID_TOKEN` / `UNAUTHENTICATED` ends the
  session:
  - the token, sessionStorage and the TanStack Query cache are cleared;
  - the user goes to `/login` with a safe `returnTo` and a session-expired message.

  The portal also signs out at the JWT's `exp`, which it reads for timing only and never
  trusts.

- **Logout:** calls the backend, then clears memory, sessionStorage and the query cache.
- **Mitigating XSS**, the remaining risk:
  - a strict production **CSP** (`script-src 'self'`, no inline scripts or eval, `connect-src`
    limited to the portal and the API, `object-src 'none'`, `base-uri 'self'`);
  - `frame-ancestors 'none'` sent by the host;
  - React's escaping, and no `dangerouslySetInnerHTML`;
  - no third-party scripts or CDNs;
  - short token lifetime and the backend's re-check of the account on every request.
- **httpOnly cookie with CSRF protection is future work.** It is the target once the portal and
  the API share a site (one domain) in production.

### Reason

- **Usability:** a refresh keeps the session (option 2 fails this).
- **Lifetime:** nothing outlives the tab, unlike localStorage. On a shared office computer,
  closing the tab ends the session.
- **Size of the change:** no backend redesign is needed now. Decision 009's bearer flow is
  unchanged, and option 4's cookie, CSRF and CORS changes are too much for this sprint.
- **The trade-off is explicit:** options 1–3 all expose the token to XSS. Option 3 limits how
  long it is exposed, and the CSP makes XSS much harder to start with. Recording option 4 keeps
  the path to a stronger design visible for the report.

### Consequences

- **Each tab has its own session:** a new tab means signing in again, because sessionStorage is
  per tab. This is accepted (and arguably safer).
- **Rule:** **never use localStorage for the token or any other secret**. A unit test (spy on
  `localStorage.setItem`) and the e2e test check this. The rule is in CLAUDE.md.
- **CSP:** the production build must keep the CSP. Adding an inline script, a CDN script or
  CSS-in-JS would weaken the main XSS defence and needs a new decision.
- **Expiry:** the token can't be revoked before it expires (no server-side session list). This
  is unchanged from Decision 009: the database re-check rejects disabled accounts at once.
- **Moving to option 4 later** needs:
  - backend changes: login sets the cookie, `requireAuth` reads it, CSRF protection, CORS with
    credentials;
  - the API client to send `credentials: 'include'` instead of the Authorization header.

## Decision 017: Dashboard demo data via the real services, marked by an inactive staff account; reset lifts the append-only guard in one transaction

- **Date:** Wed 25 Nov 2026
- **Sprint:** S2
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, FR-ISS-03, NFR-08
- **Related:** [dashboard-api.md](../api/dashboard-api.md) (section 8), Decision 012
  (append-only status events), Decision 013 (computed expiry), Decision 010 (signing at
  redemption)
- **Evidence:** `backend/test/db/seed-demo.test.ts`, `backend/src/db/seed-demo.ts`,
  `issuer-portal/e2e/login.spec.ts` (the e2e backend runs the seeder)

### Context

The issuer dashboard needs data of every status (active, expiring soon, pending with an offer,
revoked after signing, revoked while pending, superseded, expired) for development, the demo
and the screenshots. Until wallet redemption ships (Sprint 2), nothing creates that data except
manual API calls. The seeder (`npm run db:seed:demo`) must:

- produce data exactly like real use (the real signing path, the real reissue, real events);
- be idempotent, and offer `--reset` that removes **only** its own rows, never data a developer
  created by hand;
- leave every other issuer empty.

Two design problems came up:

1. **Telling demo rows apart.** No column marks a credential as demo data, and claims are
   validated against the schemas, so no extra claim can be added.
2. **Removing history rows.** `credential_status_events` is append-only: a trigger
   (migration 0005) rejects every `UPDATE` and `DELETE`. A reset that keeps the history would
   leave orphaned or foreign-key-blocked rows.

### Options considered

**Marker**

1. **A new column or table (`is_demo`):** explicit, but a schema change for development
   tooling, carried into production.
2. **"All credentials of the demo issuer":** simple, but `--reset` would also delete
   credentials a developer created by hand for that issuer.
3. **A dedicated, inactive staff account performs every demo action** (`demo-data@<issuer
domain>`, `is_active = false`, random password never stored in clear): demo credentials are
   exactly those with `created_by_staff_id` = that account (reissue replacements included,
   because the same account reissues them).

**Reset of history rows**

1. **No reset** (only `db:reset`, which deletes the whole development database).
2. **Leave history rows:** impossible, because the foreign key from events to credentials
   blocks deleting the credentials.
3. **Disable the trigger inside the reset transaction**, delete only the demo credentials'
   events, re-enable it before commit.

### Decision

- **Marker: option 3.** The account can never sign in (inactive; requireAuth rejects it even
  with a token) and shows as "Demo data (development)" in the activity list, so demo actions
  are visibly not a real person's.
- **Reset: option 3.** `removeDemoData()` runs one transaction:
  `ALTER TABLE credential_status_events DISABLE TRIGGER credential_status_events_no_change` →
  delete the demo credentials' offers and events → `ENABLE TRIGGER` → delete the demo
  credentials (one statement, so reissue links between them are checked at its end) → delete
  the demo account. PostgreSQL DDL is transactional: on any failure the rollback leaves the
  trigger enabled, and after commit it is enabled again (a test deletes a non-demo event
  afterwards and expects the rejection).
- **Guards:** seeding and reset refuse `NODE_ENV=production` (the CLI checks before opening the
  database, the functions check again).
- **Realistic timeline:** past steps run with an injected clock, as the tests do, so
  "expiring within 30 days" comes from the real default validity (P1Y) rather than from editing
  `expires_at`; expiry uses the existing dev `simulateExpiry()`.

### Reason

- No schema change for development tooling, and nothing hand-made is ever deleted.
- The append-only guarantee stays intact for all real use: the bypass exists only in a
  development-only command, for one transaction, for rows the seeder itself created.
- Data produced through the real services keeps the dashboard numbers honest: the demo shows
  exactly what Sprint 2 redemption will produce.

### Consequences

- **Append-only is a database rule with one documented, development-only exception.** Any
  other code that wants to change history needs a new decision.
- The table owner must run the reset (true for PGlite and a developer's own PostgreSQL).
- The demo account stays in `issuer_staff` while demo data exists; it appears nowhere a staff
  list is shown in Sprint 1 (the staff page is a placeholder). The Sprint 4 staff page should
  hide or label inactive accounts.
- When wallet redemption replaces the dev routes (Sprint 2), the seeder keeps working
  (`signCredential()` is the real path), but its expired credential needs a replacement for
  `simulateExpiry()`: the injected clock (create and sign more than a year in the past) works
  without it.

## Decision 018: One shared claims-validation package; the portal precompiles the schemas at build time

- **Date:** Thu 26 Nov 2026
- **Sprint:** S2
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, NFR-02, NFR-05, NFR-08
- **Related:** [credential-schemas.md](../schemas/credential-schemas.md), Decision 003, Decision
  004, Decision 005 (`age_over_18` is calculated by the server), Decision 015 (frontend stack)
- **Evidence:** `claims-validation/test/claims-validation.test.ts`,
  `issuer-portal/test/holders-validation.test.ts`, `issuer-portal/e2e/holders.spec.ts`

### Context

The holder registration form in the issuer portal has to check the claims before they are
sent, with the same rules as `POST /holders`: required fields, formats (dates, email), lengths,
allowed values, the KYC `allOf` if/then rules (passport or driving licence → expiry date;
residential address → proof of residence) and the P.O. Box rule. The rules live in the JSON
Schemas in `docs/schemas` (single source of truth). Copying them into the UI would let the
browser and the server drift apart.

Two constraints:

1. **The production CSP** (`script-src 'self'`, no `'unsafe-eval'`, `csp.ts`). Ajv's normal
   `compile()` generates code with `new Function`, which the CSP blocks. The e2e test runs on
   the Vite dev server without a CSP, so it would not notice.
2. **The friendly error messages** (`toIssue()` in the backend's `credential-schemas.ts`) were
   backend-only. The browser must show the same problems, and in Sinhala too.

### Options considered

1. **Hand-written form rules (zod) in the portal:** simple, but a second copy of every rule.
2. **Ajv in the browser with `compile()` at runtime:** the same rules, but blocked by the CSP
   (or the CSP weakened with `'unsafe-eval'`).
3. **Import a backend source file into the portal:** couples the portal to backend internals
   (Node APIs in the same file) and still needs a CSP-safe compile.
4. **A small shared package plus build-time compilation:** `@univault/claims-validation` owns
   the Ajv options, the custom keyword, the error mapping (with a stable `code` per issue) and
   the reference rule (`checkExternalRef`). The backend compiles the schema files at start-up
   as before; a Vite plugin in the portal compiles the same files into Ajv **standalone** code
   when the portal is built (or served, or tested).

### Decision

**Option 4.**

- `claims-validation/` (built with `tsc` to `dist/`, like portal-ui): `index.ts` is
  browser-safe (no runtime imports); `node.ts` reads the schema files, creates the shared Ajv
  and generates standalone code; `runtime.ts` re-exports the two helpers the generated code
  needs (ajv-formats' format functions and Ajv's Unicode string length), so the browser runs
  exactly the same format checks as the server.
- `issuer-portal/claims-validators-plugin.ts` provides `virtual:claims-validators`
  (`validators` and the `schemas`). The form layout (`src/holders/form-model.ts`) reads field
  types, options, lengths, required fields and the if/then rules from those schemas; the UI
  config only orders and groups fields and adds input hints.
- The backend's holder `VALIDATION_ERROR` details gain `code` (additive), so the portal maps a
  server error onto the field and translates it.
- **Rule:** never duplicate a schema rule in the UI or the backend. Change the schema file;
  both sides follow.

### Reason

- One set of rules, two consumers, and a test that proves they agree: every record of the
  synthetic seed data plus 28 crafted invalid claims give **identical** issues (path, code,
  message) in the portal validator and the backend validator.
- The CSP stays strict: the production bundle contains no `new Function` or `eval` (checked
  after `vite build`).
- The package is small (about 320 lines with comments) and has its own tests, including one that compares
  the generated standalone code with runtime compilation for the same samples.

### Consequences

- A third built package. `build:deps` of the backend and the portal build it, and so does the
  e2e backend start (`e2e/start-backend.mjs`).
- The portal's form generator understands the `if` keywords the schemas use today
  (`properties` with `const`, and `required`). A test fails if a schema starts using another
  `if` keyword, so the generator is extended deliberately rather than silently wrong.
- Ajv's standalone output still contains one `require()` for a runtime helper; the generator
  swaps it for an import and refuses to emit code that still contains `require()`.
- The Vite dev server needs `optimizeDeps.include` for the package's two CommonJS helpers
  (it is linked through `file:`, so not pre-bundled automatically).

## Decision 019: Issuance form is read-only and previewed server-side

- **Date:** Thu 26 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, FR-ISS-02, FR-WAL-06
- **Related:** [credentials-api.md](../api/credentials-api.md) (`POST /credentials/preview`),
  [credential-schemas-api.md](../api/credential-schemas-api.md),
  [issuer-portal.md](../frontend/issuer-portal.md) §10, Decisions 003, 004, 005, 010, 018
- **Evidence:** `backend/test/credential-preview.test.ts`, `issuer-portal/test/issuance.test.tsx`,
  `issuer-portal/e2e/issuance.spec.ts`

(The task asked for this as "Decision 017"; 017 and 018 were already taken, and existing
decisions are never renumbered, so it is 019.)

### Context

Staff issue an Employment or KYC credential from a holder record. Before they confirm, they
must see exactly what the holder's wallet will receive:

- the claims;
- what verifiers always see and what the holder may withhold;
- the expiry, with its caps (ID document, 18th birthday);
- the server-calculated `age_over_18`.

The credential is signed later, at wallet redemption (Decision 010), from the `claims_snapshot`
stored when it is created.

Two questions:

1. **Who decides the claims:** may staff edit claim values in the issuance form, or do the
   claims always come from the holder record?
2. **Who builds the preview:** the portal, from the holder record and the schema, or the
   backend?

### Options considered

**Claims**

1. **Editable in the portal:** quick fixes at issuance. But the credential then differs from
   the issuer's record of the person. Every rule (schema, `age_over_18`, the caps) would run on
   values nobody stored. And a reissue for `details_changed` (built from the current record,
   Decision 012) would undo the edit.
2. **Read-only, from the holder record:** a wrong detail is fixed in the record (one place,
   audited), then issued. The credential always matches the record.

**Preview**

1. **Client-side:** the portal assembles the claims from `GET /holders/:id` and the schema, and
   computes the expiry. It would be a second copy of the issuance rules (caps, whole seconds,
   derived claims, envelope), certain to drift. It could also show something the server then
   refuses (409, 422, key missing).
2. **Server-side, the same code path:** `POST /credentials/preview` runs the function
   `POST /credentials` runs (`prepareIssuance()`), without writing. What is shown is what would
   be created now, and the same errors appear before the confirm step.

### Decision

- **Claims: option 2.** The portal never assembles or edits claims. The issuance request
  carries only `holderId`, `credentialType` and an optional `validUntil` (an earlier end, the
  only choice staff make). "Wrong details? Update the holder record" links to the holder page.
  The edit form is on the backlog.
- **Preview: option 2.** `create()` and `preview()` share `prepareIssuance()`. It runs the
  type check, the locked holder, `prepareClaims()` (schema, `age_over_18`, expiry caps,
  `validUntil`), the one-active-credential check and the active-key check. The preview's
  transaction writes nothing and releases the lock before it returns (follow-up, 26 Nov: the
  preview now takes **no lock** at all, `prepareIssuance(…, { lock: false })`). The envelope claims come
  from the signer's own builder (`envelopeClaims()`), so the preview, `GET /credential-schemas`
  and `signCredential()` share one list.
- **Planned vs final values:** `exp` is final. `iat` is planned (the real `iat` is the signing
  time), and `age_over_18` is recalculated at signing. The response documents both, and the
  portal says "Set when the holder accepts it".
- **Schema choice is limited by the issuer type:** an employer holds employee records and a
  bank holds customer records (`ISSUER_RECORD_TYPES`). Each record type is validated against
  exactly one schema. Issuing the other type would mean issuing claims about a relationship the
  organisation does not have, from a record that was never checked against that schema.
  `GET /credential-schemas` therefore returns one schema. Another type in a request is `400
VALIDATION_ERROR` on `credentialType`: the request is wrong; the role is not, so no 403.

### Reason

- One source of truth for what a credential contains: the holder record plus the backend's
  rules. The preview cannot lie about the result, and a test proves preview = issuance for the
  same input and clock.
- Errors (409 with the existing credential, 422, missing key) appear while previewing, not
  after the confirm step.
- An edit at issuance would bypass the holder record's audit trail and reissue
  (FR-ISS-03 / Decision 012).

### Consequences

- One extra request per preview, repeated when "Valid until" changes (debounced 400 ms). The
  preview reads the holder row without a lock, so it never blocks an issuance; the issuance
  repeats every check under the lock.
- Fixing a detail needs a holder update endpoint and form: backlog item from 26 Nov.
- If a new issuer type could issue several schemas, `GET /credential-schemas` and the schema
  selector already handle a list. Only `ISSUER_RECORD_TYPES` would change.

## Decision 020: Portrait embedded in the credential, size-limited and selectively disclosable

- **Date:** Thu 26 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** NFR-03, NFR-06, NFR-08, FR-WAL-06
- **Related:** [credential-schemas.md](../schemas/credential-schemas.md) §4, §5 and §11,
  Decision 003 (SD-JWT VC, every subject claim selectively disclosable), Decision 004 (data
  minimisation), Decision 018 (shared validation)
- **Evidence:** `claims-validation/test/claims-validation.test.ts` ("portrait size"),
  `issuer-portal/test/holders-validation.test.ts` (same message on both sides),
  `backend/test/holders.test.ts` (`POST /holders` rejects a portrait over 40 KB)

### Context

Both credential schemas have an optional `portrait`: Employer B's "Employee Photograph" in the
Employment credential, and the photo of the identification document in the KYC credential
(CDD Schedule (1)(a1)(ii) requires a photo-bearing document). Interviewees said visual
identification is still needed at the point of verification. The field check of 26 Nov
(credential-schemas.md §11) found that no document recorded **why** the portrait is embedded
as a JPEG data URI rather than referenced. The v1 limit (`maxLength` 70 000 characters, about
51 KB of image data) was not explained either, and no friendly message existed for it.

### Options considered

1. **Embedded data URI** (`data:image/jpeg;base64,…`) inside the credential, signed with the
   other claims.
2. **Reference URL + hash:** the credential carries a link to the issuer's copy of the image and
   its SHA-256 digest; the verifier downloads and compares.
3. **No portrait:** verifiers compare the person with a physical ID instead.

### Decision

**Option 1**, with a size limit and selective disclosure:

- **Embedded:** `portrait` stays a JPEG data URI subject claim, signed like every other claim.
- **Size-limited to 40 KB of image data** in both v1 schemas: `maxLength` 54 639 = 23 (the
  data-URI prefix) + 54 616 (base64 of 40 960 bytes). The v1 limit was **tightened in place**,
  not moved to a v2 schema. No existing data has a portrait (seed data, test fixtures and the
  synthetic data generator produce none, and the portal's registration form has no photo
  field yet), so nothing stored breaks. A v2 would only have been needed if stored portraits
  between 40 and 51 KB could exist.
- **One message:** an oversized portrait is `{ path: "portrait", code: "photoTooLarge", message:
"Photo must be under 40 KB – use a smaller image" }` from `@univault/claims-validation`. The
  kilobytes are computed from the schema's `maxLength`, so the limit is stated once.
  `POST /holders` returns it; the portal shows the same words (en) or their translation (si).
- **Selectively disclosable:** `portrait` is in `x-univault.selectivelyDisclosable` of both
  schemas (checked by a test), so a verifier sees it only when the holder chooses to show it.

### Reason

- **Offline verification (NFR-03):** a verifier can check the portrait with the rest of the
  credential without reaching the issuer. Option 2 needs the issuer's server online at
  verification time.
- **No issuer call-home or tracking (NFR-06):** with option 2, every verification would fetch
  the image from the issuer, telling the issuer when and where the holder used the credential.
  An embedded portrait reveals nothing to anyone but the verifier the holder chose.
- **Consistency with ISO/IEC 18013-5 (mobile driving licence):** the mDL carries the portrait
  as an issuer-signed data element inside the credential (image bytes, not a link), released
  to a verifier only when requested and agreed.
- **Integrity for free:** an embedded portrait is covered by the issuer's signature through its
  disclosure digest; option 2 needs a separate hash check and a second failure mode (link
  gone, image changed).
- Option 3 drops a need the interviews confirmed.

### Consequences

- **Larger credential:** up to about 73 KB more per credential: the disclosure is the
  base64url encoding of a JSON array holding the 54 639-character data URI (×4/3). It is held in
  the wallet and sent in each presentation that includes the portrait. 40 KB is enough for a
  passport-style JPEG photo at a moderate quality.
- **Sensitive personal data (PDPA, NFR-08):** a facial image is biometric-type personal data.
  It is minimised by selective disclosure (shown only when the holder chooses), by being
  optional, and by the size limit. It is never logged; like all claims it lives in the holder
  record and the credential snapshot, never in logs.
- **Portal:** the registration form still has no photo upload (backlog). When it is added, the
  limit and the message already exist in the shared validation.
- **Changing the limit later** is a schema change: `maxLength` in both files. The message
  follows automatically.

## Decision 021: Pre-authorised code kept only in portal memory; QR never re-shown

- **Date:** Thu 26 Nov 2026
- **Sprint:** S2 (Sprint 1 carry-over)
- **Status:** Draft – review
- **Requirements:** FR-ISS-01, NFR-06, NFR-08
- **Related:** Decision 011 (OpenID4VCI pre-authorised offer), Decision 016 (staff token never
  in localStorage), [credential-offers-api.md](../api/credential-offers-api.md),
  [issuer-portal.md](../frontend/issuer-portal.md) §11, migration
  `backend/migrations/0008_offer_invalidation_reason.sql`
- **Evidence:** `issuer-portal/test/offer.test.tsx` (code absent from the URL, both storages,
  the query caches and the console; reload message; developer panel absent in production),
  `issuer-portal/scripts/check-production-bundle.mjs` (run by `npm run build`: panel not in the production bundle),
  `issuer-portal/e2e/offer.spec.ts`, `backend/test/credential-offers.test.ts`;
  [s1-offer-qr-guide.md](evidence/s1-offer-qr-guide.md)

### Context

The QR code on the offer screen is `openid-credential-offer://?credential_offer=…` with the
one-time **pre-authorised code** inside (Decision 011). Whoever has the code (a photo of the
screen, a copy in browser storage, a log line) can redeem the credential into their own wallet
until the offer expires (5 minutes by default; 10 until 26 Nov 2026). The backend already stores only the code's
hash and returns the code once, in the create response. The portal now had to decide what
happens to that response: where it is kept, and what the screen does after a reload, the back
button or a second tab, when staff expect to see the QR again.

### Options considered

1. **Re-fetchable code, stored encrypted on the server:** keep the code encrypted (not just
   hashed) so `GET` can return it again and the screen can re-show the same QR after a reload.
2. **Memory only, never re-shown:** the code lives in the offer screen's component state only.
   It is never written to the URL, `sessionStorage` / `localStorage`, the TanStack Query caches
   or the console. Opened without it while the offer is still active, the screen says so and
   offers a new QR code.

And, independently, for the offer itself:

- **With a transaction code (`tx_code`):** OpenID4VCI's optional PIN, sent to the holder out of
  band (SMS or e-mail) and typed into the wallet, so the QR alone is not enough.
- **Without `tx_code`:** the QR alone is enough.

### Decision

**Option 2, without `tx_code` for now.**

- `createOffer()` (`issuer-portal/src/api/offers.ts`) is called directly, **not through
  TanStack Query**, so no query or mutation cache ever holds the code. The result is kept in
  `CredentialOfferPage`'s state; leaving the page drops it.
- The page is `/credentials/:credentialId/offer`: no offer id or code in the URL.
- The polled status (`GET /credential-offers/:offerId`) and the cancel response carry no code;
  their queries use `gcTime: 0` and are removed when the page unmounts.
- **Never re-shown:** `GET /credentials/:id` returns `activeOffer` (id and expiry only). Opened
  without the code in memory while an offer is active, the screen shows "For security, this QR
  code can't be shown again. Generate a new one to continue." It never asks for the code.
  Generating a new one invalidates the old offer (`invalidation_reason = 'replaced'`).
- **Developer panel:** the decoded `credential_offer` (code included), for wallet development
  in Sprint 2, exists in **non-production builds only**: `import.meta.env.PROD` is tested inline
  at the render site, so the production build drops the panel's code (a build test checks the
  bundle).
- **`tx_code` deferred:** UniVault has no out-of-band channel to the holder yet (no SMS or
  e-mail sending). The offer payload therefore has no `tx_code`; a backend test checks it is
  absent.

### Reason

- **Nothing to steal at rest (NFR-06, NFR-08):** with option 2 the code exists in exactly two
  places, the create response in flight and the screen's memory, both short-lived. Option 1
  would add a reversible copy on the server and a key to protect, and turn every `GET` into a
  way to obtain a redeemable code, undoing the "hash only, shown once" rule of Decision 011.
- **Browser storage is readable by any script on the origin** and survives the tab;
  Decision 016 already keeps the staff token out of `localStorage` for that reason. The code is
  a bearer secret of the same kind.
- **Re-showing is not needed:** generating a new QR takes one click and invalidates the old
  one, so a lost screen costs the holder seconds, not a trip back to the counter.
- **`tx_code`** adds real protection against a photographed QR, but only with a channel the
  holder controls; showing the PIN on the same screen as the QR would add nothing. The holder
  is normally in front of the officer, and the offer expires in minutes.

### Consequences

- A reload, the back button or a second tab always means a new QR code (the old one stops
  working). Staff are told why on screen.
- `GET /credentials/:id` gained `activeOffer`; `GET /credential-offers/:offerId` gained
  `invalidationReason` and `serverTime` (the countdown runs on the server's clock), and
  `POST /credential-offers/:offerId/cancel` was added (migration 0008 records the reason).
- **Backlog:** `tx_code` (transaction PIN) once an SMS or e-mail channel exists
  (`docs/dev-log/sprint-1.md`).
- A screenshot of the QR is still a working code until it expires or is replaced: staff
  should not share the screen. The short TTL and "Cancel offer" limit the window.
- **Offer lifetime reduced from 10 to 5 minutes (26 Nov 2026):** enough time for the holder to
  scan and accept, and a shorter window for an intercepted QR code to be misused.
  (`CREDENTIAL_OFFER_TTL_SECONDS` default 600 → 300.)
