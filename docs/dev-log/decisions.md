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