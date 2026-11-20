## Decision 001: TypeScript for all JavaScript components

- **Date:** Wed 16 Nov 2026
- **Sprint:** S1
- **Status:** Accepted

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

Use TypeScript for every JavaScript component.

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
- ESLint uses `typescript-eslint` (see Decision 002).
- Untyped third-party libraries may need local type declarations.

## Decision 002: Root-level ESLint 9 and Prettier; Ruff for ai-service

- **Date:** Wed 16 Nov 2026
- **Sprint:** S1
- **Status:** Accepted

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
  code: Node.js globals for `backend/` and `crypto-core/`, browser globals for the portals.
  Wallet (React Native) rules will be added when the app is scaffolded.
- One root Prettier 3 config (`.prettierrc`) for formatting, with `eslint-config-prettier` so
  the two tools do not conflict.
- Ruff, configured in `ai-service/pyproject.toml`, for linting and formatting the Python
  service, which ESLint and Prettier do not cover.
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
- The wallet's React Native lint rules are still to be added.
- See [development-setup.md](../development-setup.md) for the commands.

# Decision 003: SD-JWT VC Flat Claim Layout Instead of JSON-LD

- **Date:** 17 November 2026
- **Sprint:** S1
- **Status:** Accepted

### Context

UniVault needs a standard structure for issuing and verifying digital credentials. The system uses SD-JWT (Selective Disclosure JSON Web Token) to allow holders to share only the information required by a verifier instead of revealing their entire credential.

Two possible approaches were considered for representing credential information:

1. **JSON-LD:** Uses linked data and semantic vocabularies to describe credential information. It provides a rich data model but introduces additional complexity, particularly around JSON-LD contexts and processing.
2. **SD-JWT VC flat claim layout:** Represents credential information as straightforward JSON claims within the SD-JWT VC structure. Individual subject claims can be selectively disclosed without requiring JSON-LD processing.

### Decision 003: SD-JWT VC Flat Claim Layout Instead of JSON-LD

Use the SD-JWT VC flat claim layout, aligned with the W3C Verifiable Credentials data model, instead of JSON-LD.

The credential will separate information into two categories:

**1. Envelope Claims (Always Visible)**

These claims describe the credential itself rather than the personal information of the holder.

Examples:

- `iss` – Issuer identifier.
- `iat` – Credential issuance time.
- `exp` – Credential expiration time.
- `vct` – Credential type identifier.
- `cnf` – Confirmation information, where applicable.

These claims remain visible to support credential identification, issuer verification and validation.

**2. Subject Claims (Selectively Disclosable)**

These claims contain information about the credential holder.

Examples:

- Employment credential: employee ID, designation, department and joining date.
- KYC credential: name, date of birth, nationality and derived age-related information.

Subject claims will be individually represented as selectively disclosable claims using SD-JWT disclosure mechanisms.

### Reason

- A flat JSON structure is simpler to implement and maintain across Node.js, React and React Native.
- SD-JWT supports selective disclosure without requiring the entire credential to be revealed.
- Separating envelope claims from subject claims makes the credential structure easier to understand.
- The same credential structure can be shared across the issuer, verifier, backend and wallet components.
- Avoiding JSON-LD reduces implementation complexity and unnecessary processing requirements.

### Consequences

- Credential schemas will follow a consistent flat claim structure.
- The cryptographic core will handle SD-JWT creation, disclosure and verification.
- All subject claims will be individually selectively disclosable.
- Envelope claims will remain visible in every presentation.
- The implementation must maintain compatibility with the selected SD-JWT VC specification and its required claim structure.

# Decision 004: Data Minimisation in Credential Schemas

- **Date:** 17 November 2026
- **Sprint:** S1
- **Status:** Accepted

### Context

UniVault is designed to reduce unnecessary disclosure of personal information during identity verification.

Traditional identity documents, such as National Identity Cards and employment records, contain several personal details. However, a verifier may only need a small amount of information to complete a particular verification activity.

For example, an organisation verifying whether an individual is employed may only need confirmation of the person's employment status, rather than their complete personal and employment history.

Similarly, a financial institution verifying a customer's eligibility for an age-restricted service may only need confirmation that the customer is at least 18 years old, rather than their complete date of birth.

Including unnecessary personal information in credential schemas would weaken the privacy benefits of UniVault.

### Options considered

1. **Include all available source fields:** Reproduce all information from the original employment or identity documents in the digital credentials. This provides more information but increases privacy risks and unnecessary data exposure.

2. **Include only verification-relevant fields:** Select the minimum information necessary for the intended verification activities and exclude unrelated or unnecessary source information.

### Decision

Apply the data minimisation principle when defining the Employment and KYC credential schemas.

Only include information that is necessary for the intended credential purpose.

The following principles will be applied:

**1. Employment Credential**

Include information necessary to establish the holder's employment relationship and relevant employment details.

Examples:

- Employee ID.
- Designation.
- Department.
- Employer information.
- Joining date.

Unrelated personal or administrative information from the original employment records will not automatically be included.

**2. KYC Credential**

Include information necessary to establish the customer's identity and support the intended verification activities.

Examples:

- Full name.
- Date of birth, where required for deriving age-related claims.
- Nationality.
- Relevant identity information.

Information that is not required for the intended KYC verification purpose will be excluded.

**3. Exclusion of Unnecessary Source Fields**

Fields available in the original source documents will not automatically become credential claims.

Each proposed field must have a clear verification purpose. Fields without a justified purpose will be excluded from the credential schema.

The reasons for excluding source fields will be documented as part of the schema design.

### Reason

- Reduces the amount of personal information exposed during verification.
- Supports the data minimisation principle under Sri Lanka's Personal Data Protection Act, No. 9 of 2022.
- Reduces unnecessary storage and processing of sensitive personal information.
- Makes selective disclosure more meaningful by limiting the information available for disclosure.
- Improves holder control over personal information.
- Ensures that credential schemas are designed around actual verification requirements rather than simply reproducing paper documents.

### Consequences

- Employment and KYC schemas will contain only justified verification-related claims.
- Every included field must have a documented purpose.
- Excluded source fields and their reasons for exclusion will be recorded.
- Selective disclosure will be applied to the included subject claims.
- Changes to credential schemas must be evaluated against the data minimisation principle.
- The schema documentation will include a field-level explanation of included and excluded information.

---

# Decision 005: Derived age_over_18 Claim and Under-18 Handling

- **Date:** 17 November 2026
- **Sprint:** S1
- **Status:** Accepted

### Context

One of the primary use cases of UniVault is allowing holders to prove that they meet an age requirement without revealing their complete date of birth or other unnecessary personal information.

In traditional identity verification, individuals are often required to present their National Identity Card or another document containing their date of birth. This exposes additional personal information even when the verifier only needs to establish whether the individual is at least 18 years old.

UniVault aims to address this problem through SD-JWT selective disclosure.

Instead of requiring the holder to disclose their complete date of birth, the system can derive an `age_over_18` claim from the date of birth supplied during credential issuance.

### Options considered

1. **Disclose the complete date of birth:** The holder shares their date of birth with the verifier, who calculates whether the individual is at least 18 years old. This is straightforward but exposes more personal information than necessary.

2. **Use a derived age_over_18 claim:** The issuer calculates whether the holder is at least 18 years old and includes the resulting Boolean claim in the KYC credential. The holder can disclose this claim without revealing their complete date of birth.

### Decision

Use a derived Boolean claim named `age_over_18` in the KYC credential.

The claim will be calculated by the issuer using the holder's date of birth during credential issuance.

The calculation will follow these rules:

**1. Age Calculation**

- If the holder has reached their 18th birthday on the credential issuance date, set `age_over_18` to `true`.
- If the holder has not reached their 18th birthday, set `age_over_18` to `false`.
- The calculation must use the actual date of birth and calendar date, rather than an approximate age calculation based on the number of days or years.

**2. Selective Disclosure**

The `age_over_18` claim will be selectively disclosable.

A holder can disclose this claim to a verifier when age eligibility needs to be established without disclosing their complete date of birth.

**3. Under-18 Holders**

Holders below 18 years of age will receive an `age_over_18` value of `false` if a KYC credential is issued to them.

The system will not treat an under-18 holder as eligible for an age-restricted verification activity.

The issuer must calculate this claim correctly and must not allow the holder or verifier to modify its value.

**4. Verification**

The verifier will validate the issuer's signature and the disclosed claim before accepting the age assertion.

An `age_over_18` value of `true` will indicate that the holder met the 18-year age requirement on the credential issuance date.

### Reason

- Reduces unnecessary disclosure of personal information.
- Allows holders to prove age eligibility without revealing their complete date of birth.
- Supports SD-JWT selective disclosure.
- Reduces the amount of personal information received by verifiers.
- Provides a simple Boolean value that can be evaluated consistently by different verification systems.
- Supports the privacy and data minimisation objectives of UniVault.

### Consequences

- The KYC credential schema will include the `age_over_18` Boolean claim.
- The issuer backend must calculate the claim during credential issuance.
- The claim will be selectively disclosable.
- The original date of birth will not need to be disclosed when only age eligibility is being verified.
- The verifier must validate the credential signature and disclosed claim before making an eligibility decision.
- The system must correctly handle the 18th birthday boundary and under-18 cases.
- The claim represents age eligibility at issuance time; it must not be treated as a permanent guarantee of the holder's current age.

# Decision 006: SD-JWT Library Selection (@sd-jwt/core)

- **Date:** 19 November 2026
- **Sprint:** S1
- **Status:** Accepted

### Context

UniVault uses SD-JWT selective disclosure for credential issuance, presentation and verification. The same SD-JWT logic is needed in two different environments:

- The backend (Node.js), which issues credentials and verifies presentations.
- The mobile wallet (React Native / Expo), which stores credentials and builds selective-disclosure presentations.

React Native runs on the Hermes JavaScript engine, which does not provide Node.js built-in modules (such as `crypto` and `Buffer`) or the browser WebCrypto API (`crypto.subtle`). Many JavaScript cryptography and JWT libraries depend on these and therefore do not work in Expo.

A spike was conducted to determine whether an existing SD-JWT library could be reused in both environments, or whether a custom implementation was required. The full results are documented in `docs/spikes/sd-jwt/README.md`.

### Options considered

1. **@sd-jwt/core (OpenWallet Foundation):** Implements SD-JWT issuance, presentation, key binding and verification. Cryptographic operations (hashing, salt generation, signing, verification) are supplied by the application, so platform-specific crypto can be injected for Node.js and Expo.

2. **@sd-jwt/sd-jwt-vc (OpenWallet Foundation):** Builds on @sd-jwt/core and adds SD-JWT VC type metadata and the IETF Token Status List. It also brings additional dependencies (`cbor-x`, `pako`) for status-list features that UniVault does not use.

3. **Custom SD-JWT module:** Implement salt generation, disclosure construction, Base64URL encoding, SHA-256 digests, the `_sd` array and RS256 signing manually.

### Decision

Use **@sd-jwt/core**, pinned to exact version **0.25.0**, in both the backend and the mobile wallet.

The library will be wrapped by UniVault's `crypto-core` module, which will inject platform-specific cryptographic functions:

| Function            | Backend (Node.js)            | Wallet (Expo)                          |
| ------------------- | ---------------------------- | -------------------------------------- |
| SHA-256 hashing     | @noble/hashes or node:crypto | @noble/hashes (pure JavaScript)        |
| Random salts        | crypto.getRandomValues       | expo-crypto getRandomBytes             |
| Issuer signing      | RS256 via node:crypto        | Not required                           |
| Key-binding signing | Verification only            | ES256 via @noble/curves (Decision 007) |

A custom module will not be developed. It remains a documented fallback.

### Reason

- Tested successfully in Node.js: 14/14 checks passed, covering issuance, selective presentation, verification, replay protection, audience checks, forged disclosures, tampered credentials, stolen credentials and missing key binding.
- Tested successfully on a real Android device in Expo Go: 10/10 checks passed, including library loading on Hermes, key generation (212 ms), credential decoding (2 ms) and presentation building (9 ms).
- A presentation built on the phone was verified successfully on Node.js, confirming cross-platform compatibility.
- The library has no dependency on Node.js built-in modules or `Buffer`, and it does not require WebCrypto.
- The custom implementation was built and verified against the library during the spike, confirming it is feasible. However, it would require re-implementing parsing, presentation, key binding and verification edge cases that the library already handles and tests.
- @sd-jwt/sd-jwt-vc also bundles for Android, but it adds approximately 0.4 MB of status-list code that UniVault does not need, because UniVault uses its own status endpoint (FR-BAK-01).

### Consequences

- `@sd-jwt/core` will be a dependency of `crypto-core`, the backend and the wallet, pinned to an exact version (no `^` range), because the library is pre-1.0 and was recently restructured.
- The library does not validate the `cnf` (holder key) or `status` claims. UniVault's verifier must verify the key-binding JWT against `cnf.jwk` and check revocation through `status.status_uri` (FR-VER-02).
- The wallet must polyfill `crypto.getRandomValues` using expo-crypto, because Hermes does not provide it.
- The wallet will not verify the issuer's RS256 signature when receiving a credential. This is acceptable because credentials are received from the issuer over HTTPS and the verifier always checks the RS256 signature.
- SD-JWT reveals the number of undisclosed claims (digest count). This known limitation will be reported in the evaluation. Decoy digests, which the library supports, are a possible mitigation.
- Library upgrades must be deliberate and re-tested against the spike scripts.

# Decision 007: ES256 for Holder Key Binding

- **Date:** 19 November 2026
- **Sprint:** S1
- **Status:** Proposed (to be confirmed at the Sprint 1 review on 22 November 2026)

### Context

NFR-01 in the mid-point report states that all credential and disclosure exchanges shall use RS256 digital signatures.

UniVault uses two different signatures:

1. **Issuer signature:** The issuer (employer or bank) signs each credential. This happens on the backend (Node.js).
2. **Holder key-binding signature:** When presenting a credential, the wallet signs a key-binding JWT containing the verifier's nonce and audience. This proves the presentation comes from the legitimate holder and prevents replay. This happens on the mobile phone.

For key binding, the wallet must generate its own key pair on the device and sign with it during every presentation.

The SD-JWT spike found the following platform constraints in Expo Go:

- expo-crypto provides SHA digests, random bytes and AES encryption, but no RSA or ECDSA signing.
- Hermes does not provide WebCrypto (`crypto.subtle`).
- Pure-JavaScript RSA-2048 key generation took approximately 1.2 seconds on a server, and is expected to be several times slower on a mobile phone.
- Pure-JavaScript ES256 (P-256) key generation took approximately 0.6 ms on the server and 212 ms on the test phone, including one-time initialisation.

### Options considered

1. **RS256 for holder key binding using pure JavaScript:** Complies literally with NFR-01, but RSA key generation on the phone is slow and unpredictable, and affects the onboarding experience.

2. **RS256 for holder key binding using a native module (react-native-quick-crypto):** Provides fast native RSA, but requires an Expo development build instead of Expo Go. This adds build setup and slows down development iteration.

3. **ES256 (ECDSA P-256) for holder key binding using @noble/curves:** Fast, pure JavaScript, audited, and works in Expo Go. Issuer signatures remain RS256.

### Decision

Use **ES256 (ECDSA with P-256 and SHA-256)** for the holder key-binding JWT, implemented with @noble/curves.

Issuer credential signatures **remain RS256**, as specified in the mid-point report.

| Signature                   | Algorithm | Where it runs                   |
| --------------------------- | --------- | ------------------------------- |
| Issuer credential signature | RS256     | Backend (Node.js native crypto) |
| Holder key-binding JWT      | ES256     | Mobile wallet (@noble/curves)   |

The verifier will accept only RS256 for issuer signatures and only ES256 for key-binding JWTs (`allowedIssuerAlgorithms` and `allowedKeyBindingAlgorithms`).

NFR-01 is refined as follows: _issuer-signed credentials shall use RS256; holder key-binding proofs shall use ES256._

### Reason

- RSA key generation in pure JavaScript is too slow for a good onboarding experience on mobile devices, particularly lower-end phones.
- ES256 key generation and signing are fast in pure JavaScript and work in Expo Go without native modules.
- ES256 is a widely used JOSE algorithm (RFC 7518) and is commonly used for key binding in SD-JWT VC and digital identity wallet implementations.
- Keeping RS256 for issuer signatures preserves the design described in the mid-point report for the trust relationship between issuers and verifiers.
- Staying with Expo Go keeps the development workflow simple within the five-week development window.
- The spike verified the complete flow: RS256 issuance, ES256 key binding on a real phone, and successful verification on Node.js.

### Consequences

- The wallet generates a P-256 key pair during onboarding and stores the private key in the device's secure store (Sprint 2).
- Issued credentials include the holder's ES256 public key in the `cnf.jwk` claim.
- The verifier must support two algorithms: RS256 for the issuer signature and ES256 for key binding.
- The final report must document NFR-01 as refined, with the justification above.
- If the supervisor requires RS256 for key binding, Option 2 (native module with an Expo development build) is the fallback, with additional setup effort in Sprint 2.

# Decision 008: PostgreSQL, with Embedded PGlite for Development and Hand-Written Migrations

- **Date:** 20 November 2026
- **Sprint:** S1
- **Status:** Draft – review

### Context

The backend stores issuers, signing-key metadata, staff, holder records, credential records and offers. These records have real relationships (issuer → holder → credential → offer, and reissue chains between credentials), and several integrity rules matter for security: one active signing key per issuer, a credential that is not pending must record the key it was signed with, and pre-authorised codes are stored only as hashes.

The developer works on Windows, on a five-week schedule, and wanted no database server to install or run during development and tests. Claims differ between the Employment and KYC credentials, so part of the data is document-shaped.

### Options considered

1. **PostgreSQL server for all environments:** the real database everywhere, but it must be installed and running for every development session and test run.
2. **SQLite for development, PostgreSQL in production:** easy locally, but a different SQL dialect, so constraints and queries could behave differently in production.
3. **PostgreSQL, with PGlite (PostgreSQL compiled to WebAssembly) for development and tests:** the same database engine everywhere, with nothing to install locally.
4. **A document database (e.g. MongoDB):** flexible claims, but integrity rules would have to live in application code.

For schema changes: **drizzle-kit generated migrations** or **hand-written SQL migrations**.

### Decision

Use **PostgreSQL**. Development uses an embedded **PGlite** database (`DATABASE_URL=pglite://./.data/univault`), tests use an in-memory PGlite database (`pglite://memory`), and production requires a `postgres://` URL.

Schema changes are **hand-written SQL files** in `backend/migrations/` (`NNNN_description.sql`), applied in order, each in a transaction, and protected by a checksum. Queries use **Drizzle ORM**; `src/db/schema.ts` mirrors the SQL and a test checks the two agree. drizzle-kit is not used.

### Reason

- Integrity rules are enforced by the database itself (foreign keys, CHECK constraints, partial unique indexes), not only by application code.
- `jsonb` stores the claims, which differ per credential type, without giving up relational integrity.
- PGlite is genuine PostgreSQL, so development, tests and production run the same SQL, with no native binaries to install on Windows.
- Each test file gets a fresh in-memory database, so tests are isolated and repeatable.
- Hand-written DDL is easy to review and can be quoted in the report; drizzle-kit would add extra native binaries.

### Consequences

- Production refuses the embedded database (`DATABASE_URL` must be `postgres://…`).
- Applied migrations must never be edited; every change is a new migration file, and `schema.ts` must be updated to match.
- PGlite has a single connection and runs one transaction at a time: code inside a transaction must use the transaction handle (`tx`), or it waits on itself (see Sprint 1, Issues and resolutions).
- PGlite start-up is slow on Windows, so the test timeouts are generous.

# Decision 009: Issuer Staff Authentication (JWT, Database Re-Check and Lockout)

- **Date:** 20 November 2026
- **Sprint:** S1
- **Status:** Draft – review

### Context

Issuer staff (officers and admins at employers and banks) must log in to the issuer portal before they can create holder records, issue credentials or manage signing keys. Each staff member belongs to exactly one issuer, and one issuer must never see or act on another issuer's data. Verifiers and wallets do not log in as staff.

### Options considered

1. **Server-side sessions with a cookie:** easy to revoke, but needs a session store and CSRF protection, and is awkward for a separate portal origin.
2. **Stateless JWT access tokens only:** simple and scalable, but a disabled account or a changed role keeps working until the token expires.
3. **Short-lived JWT access tokens, with the staff member reloaded from the database on every request:** stateless tokens, but changes to an account take effect immediately.
4. **An external identity provider (OAuth/OIDC):** strong, but too much setup for the prototype.

### Decision

Use option 3:

- Login with email and password returns a **HS256 JWT** (1 hour by default, `JWT_EXPIRES_IN_SECONDS`) with issuer `univault-backend` and audience `univault-issuer-portal`. Only HS256 is accepted.
- `requireAuth` verifies the token and **reloads the staff member from the database** on every request; role, active status and issuer come from the database, not from the token.
- **Roles:** officers manage holders and issue credentials; admins can also revoke, manage keys and list staff.
- **Isolation:** the issuer always comes from the login, never from the request body. Another issuer's records return `404`; a wrong `:issuerId` in the URL returns `403`.
- **Brute-force protection:** an account is locked for 15 minutes after 5 consecutive failed logins (`423`), and a per-IP rate limit allows 20 login attempts per 15 minutes (`429`).
- Passwords are stored as **scrypt** hashes; every failed login returns the same `401 INVALID_CREDENTIALS`, and a hash is always checked so response times are similar.

### Reason

- Reloading the staff member on each request removes the main weakness of stateless tokens (disabled users and changed roles) at the cost of one indexed query.
- Taking the issuer from the login, and answering `404` for other issuers' records, prevents one organisation from discovering or changing another's data.
- Lockout and rate limiting together slow down guessing against one account and across many accounts.
- jose and scrypt are well-tested building blocks, so no cryptography is written by hand.

### Consequences

- Logout does not invalidate a token on the server; tokens are short-lived and the portal discards them. A deny-list or refresh tokens could be added later.
- The rate limiter counts in memory; several backend instances would need a shared store.
- `JWT_SECRET` is required in production; in development a temporary secret is generated, so everyone is signed out on restart.
- No multi-factor authentication or password reset in the prototype. Details: `docs/security/issuer-staff-authentication.md`.

# Decision 010: Credential Signing Deferred to Wallet Redemption (Holder Binding)

- **Date:** 20 November 2026
- **Sprint:** S1
- **Status:** Draft – review

### Context

Every UniVault credential carries `cnf.jwk`, the public key of the holder's wallet (Decision 007). The verifier later checks a key-binding JWT signed with the matching private key, which stops a copied credential from being presented by someone else.

The wallet key is created on the phone and only reaches the issuer when the holder scans the QR offer and redeems it (Sprint 2). Issuer staff, however, start issuance from the issuer portal before that moment.

### Options considered

1. **Sign when staff click "issue", without `cnf`:** simple, but the credential is not bound to any device and can be replayed by anyone who obtains it.
2. **Sign when staff click "issue", with a placeholder key, and re-sign later:** two signatures for one credential, and the first one would be unbound.
3. **Create a pending record when staff issue, and sign at redemption with the wallet's key:** one signature, always bound to the real wallet key.

### Decision

Use option 3:

- `POST /api/v1/credentials` creates a **pending** credential record: claims re-validated against the schema and snapshotted, `age_over_18` recalculated, expiry fixed. Nothing is signed.
- `signCredential(credentialId, holderPublicJwk)` in `backend/src/services/credentials.service.ts` signs the SD-JWT with the issuer's **active** key when the wallet redeems its offer. It accepts only an EC P-256 **public** JWK, recalculates `age_over_18` on the signing date, and updates the record `WHERE status = 'pending'`, so a credential is signed at most once.
- The compact SD-JWT is returned to the caller only; it is never stored or logged. The record keeps `issuer_kid` and the RFC 7638 `holder_key_thumbprint`.
- A holder can have only one `pending` or `valid` credential of each type; the holder row is locked during that check.

### Reason

- A credential is never signed without a holder key, so every credential in circulation is device-bound.
- Exactly one signature per credential keeps the audit trail simple: `issued_at`, `issuer_kid` and the holder key are recorded together, as the database CHECK constraint requires.
- Signing at redemption also uses the issuer's current key, so key rotation needs no special handling for credentials issued but not yet collected.

### Consequences

- The Sprint 2 redemption endpoint (`POST /credential-offers/credential`) must call `signCredential` after checking the pre-authorised code; no other code path signs credentials.
- A pending credential that is never redeemed blocks a new credential of the same type for that holder until it expires. The revoke task must therefore accept `pending` credentials as well as `valid` ones.
- `kyc_verification_date` is taken from the date the pending record was created, not from the signing date.
- Details: `docs/api/credentials-api.md`.
