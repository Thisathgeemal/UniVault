# UniVault design decisions

Numbered record of the significant design decisions in UniVault. Each entry gives the context,
the options considered, the decision, the reason and the consequences, and links to the
requirements, design docs and evidence behind it. Numbers are permanent: a decision is never
renumbered, and a decision that is replaced is marked as superseded rather than deleted.

**Status values:** `Accepted` (agreed and in force), `Proposed` (waiting for supervisor
confirmation) and `Draft – review` (written by the developer, not yet reviewed).

[Back to the dev-log index](README.md)

## Decision index

| #                                                                                                 | Decision                                                                           | Date            | Sprint                   | Status         | Related requirements                                          |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------- | ------------------------ | -------------- | ------------------------------------------------------------- |
| [001](#decision-001-typescript-for-all-javascript-components)                                     | TypeScript for all JavaScript components                                           | Mon 16 Nov 2026 | S1                       | Accepted       | None (development tooling)                                    |
| [002](#decision-002-root-level-eslint-9-and-prettier-ruff-for-ai-service)                         | Root-level ESLint 9 and Prettier; Ruff for ai-service                              | Mon 16 Nov 2026 | S1                       | Accepted       | None (development tooling)                                    |
| [003](#decision-003-sd-jwt-vc-flat-claim-layout-instead-of-json-ld)                               | SD-JWT VC flat claim layout (W3C VC model); subject claims selectively disclosable | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-ISS-02, FR-VER-01, FR-VER-03, FR-BAK-01, NFR-01 |
| [004](#decision-004-data-minimisation-in-credential-schemas)                                      | Data minimisation in the credential schemas                                        | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-VER-03, NFR-08                                  |
| [005](#decision-005-derived-age_over_18-claim-and-under-18-handling)                              | Derived `age_over_18` claim and under-18 handling                                  | Tue 17 Nov 2026 | S1                       | Accepted       | FR-ISS-01, FR-ISS-03, FR-VER-03, NFR-08                       |
| [006](#decision-006-sd-jwt-library-selection-sd-jwtcore)                                          | SD-JWT library: `@sd-jwt/core` pinned to 0.25.0                                    | Thu 19 Nov 2026 | S1                       | Accepted       | FR-ISS-02, FR-VER-02, FR-WAL-06, NFR-01                       |
| [007](#decision-007-es256-for-holder-key-binding)                                                 | ES256 for holder key binding; issuer signatures stay RS256                         | Thu 19 Nov 2026 | S1                       | Proposed       | NFR-01, FR-WAL-06, FR-VER-02                                  |
| [008](#decision-008-postgresql-with-embedded-pglite-for-development-and-hand-written-migrations)  | PostgreSQL, with embedded PGlite for development and hand-written migrations       | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, FR-ISS-02, FR-ISS-03, FR-WAL-05, FR-BAK-01, NFR-08 |
| [009](#decision-009-issuer-staff-authentication-jwt-database-re-check-and-lockout)                | Issuer staff authentication (JWT, database re-check and lockout)                   | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, NFR-06, NFR-08                                     |
| [010](#decision-010-credential-signing-deferred-to-wallet-redemption-holder-binding)              | Credential signing deferred to wallet redemption (holder binding)                  | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, FR-ISS-02, NFR-01, NFR-06, NFR-08                  |
| [011](#decision-011-openid4vci-pre-authorised-code-offer-format)                                  | OpenID4VCI pre-authorised code offer format                                        | Fri 20 Nov 2026 | S1                       | Draft – review | FR-ISS-01, NFR-01, NFR-06, NFR-08                             |
| [012](#decision-012-reissue-supersedes-immediately-status-changes-recorded-as-append-only-events) | Reissue supersedes immediately; status changes recorded as append-only events      | Tue 24 Nov 2026 | S2 (Sprint 1 carry-over) | Draft – review | FR-ISS-03, FR-BAK-01, NFR-06, NFR-08                          |

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
- An offer expires after `CREDENTIAL_OFFER_TTL_SECONDS` (default 600) and never outlives its
  credential.
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
- The future status endpoint (FR-BAK-01) reads `revoked` and `superseded` from the credential
  row; wallets and verifiers treat both as "not valid".
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
