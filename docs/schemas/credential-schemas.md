# UniVault Credential Schemas (v1.0)

**Status:** Draft for supervisor review (Sprint 1 review, Sun 22 Nov 2026)
**Machine-readable files:** [`employment-credential.v1.schema.json`](employment-credential.v1.schema.json), [`kyc-credential.v1.schema.json`](kyc-credential.v1.schema.json) (JSON Schema 2020-12)
**Used by:** backend issuance validation (FR-ISS-01/02), issuer portal forms, synthetic data generator, verifier request templates (FR-VER-01/03)

---

## 1. Sources

| Source                                                                                                                           | Used for              |
| -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Employer A schema letter (15 May 2026) – 7 fields                                                                                | Employment credential |
| Employer B schema letter (18 May 2026) – 15 fields                                                                               | Employment credential |
| Financial Institutions (Customer Due Diligence) Rules, No. 1 of 2016 – Schedule, item (1)(a1) "Individual Customers" and Rule 27 | KYC credential        |

> Employer letters are labelled A and B to match the anonymised labels in MPR Appendix D. Check that the A/B mapping matches the appendix figures.

## 2. Credential format

UniVault credentials are **SD-JWT Verifiable Credentials** signed with **RS256**:

- Every claim about the holder (the "subject claims" in sections 4 and 5) is **selectively disclosable**. Each one becomes a salted disclosure, and only its SHA-256 digest is signed into the JWT.
- A small set of **envelope claims** (section 3) is always visible, because the verifier needs them to check the credential at all.
- Claim names use `snake_case`. Dates in claims use ISO 8601 `YYYY-MM-DD`. JWT timestamps (`iat`, `exp`) use NumericDate (seconds since epoch).
- The design follows the W3C Verifiable Credentials data model: `iss` is the issuer, the subject claims are the credential subject, `exp` is the expiry and `status` points to the status entry. It is encoded in the flat SD-JWT VC claim layout rather than JSON-LD, so selective disclosure can work on each claim.

## 3. Envelope claims (both credentials, always visible)

| Claim                   | Type / format                                       | Purpose                                                                                            |
| ----------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `iss`                   | URL string                                          | Issuer identifier. The verifier uses it to fetch the issuer's public key (`GET /issuers/:id/keys`) |
| `issuer_name`           | string                                              | Issuer display name shown in the wallet and the verifier result (e.g. the employer or bank name)   |
| `vct`                   | string                                              | Credential type: `urn:univault:vct:EmploymentCredential:1` or `urn:univault:vct:KYCCredential:1`   |
| `schema_version`        | string                                              | `"1.0"`                                                                                            |
| `jti`                   | UUID v4                                             | Unique credential ID, also the revocation/status key                                               |
| `iat`                   | NumericDate                                         | Issued at                                                                                          |
| `exp`                   | NumericDate                                         | Expiry (see section 6)                                                                             |
| `cnf`                   | object `{ "jwk": … }`                               | Holder's public key; binds the credential to the wallet device (used for the key-binding JWT)      |
| `status`                | object `{ "status_uri": "<backend>/status/<jti>" }` | Where verifiers and the wallet check valid / revoked / superseded (FR-BAK-01)                      |
| `kyc_verification_date` | date                                                | **KYC only.** Date the bank completed CDD verification                                             |
| `_sd`, `_sd_alg`        | SD-JWT internals                                    | Disclosure digests; `_sd_alg` = `sha-256`                                                          |

Validity is shown by these claims and by the status check, not by subject fields. For example, a resigned employee's credential is **revoked**; it does not carry an "inactive" field.

## 4. Employment credential

**Issuer:** employer · **vct:** `urn:univault:vct:EmploymentCredential:1` · **Use case:** employee identity verification

| Claim             | Type / format                                          | Required | Disclosure | Source                                        |
| ----------------- | ------------------------------------------------------ | -------- | ---------- | --------------------------------------------- |
| `employee_id`     | string, `^[A-Z0-9][A-Z0-9-]{2,19}$` (e.g. `EMP-00421`) | **Yes**  | Selective  | A: Employee ID Number · B: Employee Number    |
| `full_name`       | string, 2–120 chars                                    | **Yes**  | Selective  | A, B                                          |
| `designation`     | string, 2–80 chars                                     | **Yes**  | Selective  | A: Designation · B: Job Position              |
| `department`      | string, 2–80 chars                                     | **Yes**  | Selective  | A: Department · B: Department or Work Area    |
| `employment_type` | enum `permanent` \| `contract` \| `probationary`       | **Yes**  | Selective  | A: Employment Status · B: Employment Category |
| `date_of_joining` | date `YYYY-MM-DD`                                      | **Yes**  | Selective  | A, B                                          |
| `nic_number`      | NIC, `^([0-9]{9}[VX]\|[0-9]{12})$`                     | No       | Selective  | B                                             |
| `work_location`   | string, ≤ 80 chars                                     | No       | Selective  | A: Branch / Location                          |
| `work_email`      | email                                                  | No       | Selective  | B: Email Address (if available)               |
| `work_phone`      | E.164, `^\+94[0-9]{9}$`                                | No       | Selective  | B: Contact Information                        |
| `portrait`        | JPEG data URI, ≤ ~50 KB                                | No       | Selective  | B: Employee Photograph                        |

**Left out on purpose (data minimisation, PDPA No. 9 of 2022):**

| Source field                      | Reason                                                                |
| --------------------------------- | --------------------------------------------------------------------- |
| Residential Address (B)           | Not needed to prove employment; address belongs in the KYC credential |
| Supervisor Details (B)            | Personal data of a third party                                        |
| Emergency Contact Information (B) | Personal data of a third party                                        |

These stay in the employer's own HR records.

**Note on two similar fields:** Employer A's "Employment Status" (Permanent / Contract / Probationary) and Employer B's "Employment Category" describe the same thing, so both map to `employment_type`. Employer B's separate "Employment Status" (current vs. former employee) is represented by the credential's revocation status.

## 5. KYC credential

**Issuer:** bank / financial institution · **vct:** `urn:univault:vct:KYCCredential:1` · **Use case:** KYC verification
**Scope:** resident individual customers only.

| Claim                  | Type / format                                                                                    | Required                       | Disclosure | CDD Schedule ref.            |
| ---------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------ | ---------- | ---------------------------- |
| `full_name`            | string, 2–120 chars                                                                              | **Yes**                        | Selective  | (1)(a1)(i)                   |
| `id_document_type`     | enum `nic` \| `passport` \| `driving_licence`                                                    | **Yes**                        | Selective  | (1)(a1)(ii)                  |
| `id_document_number`   | string; format depends on type (below)                                                           | **Yes**                        | Selective  | (1)(a1)(ii)                  |
| `id_document_expiry`   | date                                                                                             | If passport or driving licence | Selective  | (1)(a1)(ii) "valid"          |
| `date_of_birth`        | date `YYYY-MM-DD`                                                                                | **Yes**                        | Selective  | (1)(a1)(v)                   |
| `age_over_18`          | boolean, **derived** (section 6)                                                                 | **Yes**                        | Selective  | Derived from (v)             |
| `nationality`          | ISO 3166-1 alpha-2, e.g. `LK`                                                                    | **Yes**                        | Selective  | (1)(a1)(vi)                  |
| `permanent_address`    | address object (below), disclosed as one unit                                                    | **Yes**                        | Selective  | (1)(a1)(iii)                 |
| `mobile_number`        | E.164 mobile, `^\+947[0-9]{8}$`                                                                  | **Yes**                        | Selective  | (1)(a1)(iv)                  |
| `residential_address`  | address object, only if different from permanent                                                 | No                             | Selective  | (1)(a1)(iii)                 |
| `residence_proof_type` | enum `electricity_bill` \| `water_bill` \| `fixed_line_telephone_bill` \| `other_reliable_proof` | If residential address given   | Selective  | (1)(a1)(iii)                 |
| `email`                | email                                                                                            | No                             | Selective  | (1)(a1)(iv) "if available"   |
| `occupation`           | string, ≤ 80 chars                                                                               | No                             | Selective  | (1)(a1)(vii)                 |
| `employer_name`        | string, ≤ 120 chars                                                                              | No                             | Selective  | (1)(a1)(vii)                 |
| `public_position`      | string, ≤ 120 chars                                                                              | No                             | Selective  | (1)(a1)(vii)                 |
| `portrait`             | JPEG data URI, ≤ ~50 KB                                                                          | No                             | Selective  | (1)(a1)(ii) photo-bearing ID |

**ID document number formats**

| `id_document_type` | Pattern                                 | Example shape                              |
| ------------------ | --------------------------------------- | ------------------------------------------ |
| `nic`              | `^([0-9]{9}[VX]\|[0-9]{12})$`           | `9xxxxxxxxV` (old) or `20xxxxxxxxxx` (new) |
| `passport`         | `^[A-Z][0-9]{7}$`                       | one letter + 7 digits                      |
| `driving_licence`  | `^[A-Z0-9]{6,12}$` (deliberately loose) | –                                          |

**Address object** (`permanent_address`, `residential_address`)

| Field         | Type / format                                                                        | Required |
| ------------- | ------------------------------------------------------------------------------------ | -------- |
| `line1`       | house no. and street, 3–120 chars; **P.O. Box not accepted** (Schedule (1)(a1)(iii)) | Yes      |
| `line2`       | string, ≤ 120 chars                                                                  | No       |
| `city`        | string                                                                               | Yes      |
| `district`    | one of the 25 districts of Sri Lanka                                                 | Yes      |
| `postal_code` | `^[0-9]{5}$`                                                                         | Yes      |
| `country`     | `LK`                                                                                 | Yes      |

**Left out on purpose:**

| Schedule item                                             | Reason                                                                                 |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fax number (iv)                                           | Obsolete; no verifier needs it                                                         |
| Purpose of account (viii)                                 | Describes one bank account, not the person                                             |
| Expected turnover (ix), expected mode of transactions (x) | Account-level financial data; sharing it with other verifiers would be over-disclosure |
| Satisfactory reference (xi)                               | Bank-internal                                                                          |
| Customer risk rating (Rule 8)                             | Bank-internal; never shared                                                            |
| Gender                                                    | Not required by the Schedule; data minimisation                                        |

These stay in the bank's own CDD records. The credential carries only **reusable identity attributes**.

**Out of scope (future work):** non-resident customers (Schedule (1)(a2)) and non-individual customers such as proprietorships, partnerships, companies, NGOs, trusts and funds (Schedule items (2)–(6)).

## 6. Issuance rules

1. **Validation:** the backend validates subject claims against the JSON Schema before signing, and rejects any unknown field (`additionalProperties: false`).
2. **`age_over_18` (derived claim):** the issuer computes it from `date_of_birth` on the issuance date. The holder cannot set it.
   - If the holder is 18 or older → `true`.
   - If under 18 → `false`, and `exp` is set no later than the 18th birthday. The credential is then reissued with `true` via revoke-then-reissue (FR-ISS-03).
   - Why: SD-JWT can't prove "date of birth is before X" without revealing the date. A separate boolean claim lets a verifier check age alone (the survey found 70.7% of respondents want this).
3. **Expiry (proposed defaults):** Employment credential 1 year; KYC credential 2 years. A KYC credential never outlives its ID document, so `exp` must be ≤ `id_document_expiry` when that is present.
4. **Changes to data** (new designation, new address): revoke and reissue. Credentials are never edited in place (FR-ISS-03).
5. **Holder binding:** `cnf.jwk` is the public key the wallet sent when redeeming the offer (FR-ISS-01).

## 7. Verifier request templates

These templates use the schemas above. The verifier asks only for what it needs (FR-VER-03).

| Template              | Credential | Requested claims (required)                                                                                | Optional                      |
| --------------------- | ---------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Employee verification | Employment | `full_name`, `employee_id`, `designation`                                                                  | `department`, `portrait`      |
| KYC onboarding        | KYC        | `full_name`, `id_document_type`, `id_document_number`, `date_of_birth`, `nationality`, `permanent_address` | `mobile_number`, `occupation` |
| Age check (18+)       | KYC        | `age_over_18`                                                                                              | –                             |

`issuer_name` and the other envelope claims are always included, so the verifier can always see who issued the credential.

## 8. Privacy notes (for the evaluation and LESP chapters)

- **An NIC number reveals more than it seems.** It encodes the year of birth, day of birth and gender. A verifier that only needs age should use the age-check template, not request `nic_number` or `id_document_number`.
- **Addresses are disclosed whole.** In v1 an address is one disclosure, not one per line. A future version could disclose `city` and `district` separately for area-only checks.
- **Known SD-JWT limitation:** a verifier can see how many claims were left undisclosed (the number of digests), though not their values. Report this openly (MPR §2.4.2).

## 9. Notes for the synthetic data generator (next task)

- Generate records that validate against these JSON Schemas; validate every record before writing it.
- NIC numbers must match each record's date of birth (and an internal-only gender value). Shapes:
  - **Old format:** `YY` + `DDD` + `SSS` + `C` + `V`
  - **New format:** `YYYY` + `DDD` + `0` + `SSS` + `C`
  - `DDD` is the day of the year, plus 500 for females.
  - Check the day-numbering rule (whether every year is counted as having 29 February) against an official source before implementing.
- Mark every record with `"_synthetic": true` in the seed file, outside the credential claims.
- Do not generate realistic face photos. Use a plain placeholder or initials image for `portrait`.

## 10. Questions for the supervisor (22 Nov review)

1. Is a derived `age_over_18` boolean acceptable as the age-check mechanism?
2. Are the excluded fields (sections 4 and 5) and their reasons acceptable?
3. Should the KYC credential stay limited to resident individual customers?
4. Are 1-year (Employment) and 2-year (KYC) expiry periods reasonable?
