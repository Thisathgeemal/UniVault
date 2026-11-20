# Test Report – crypto-core (shared cryptographic core)

|                          |                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Component**            | `crypto-core/` (`@univault/crypto-core`)                                                 |
| **Sprint**               | Sprint 1 (16–21 Nov 2026)                                                                |
| **Test run date**        | 20 November 2026                                                                         |
| **Environment**          | Windows 11 Home, Node.js 26.13.1 · Vitest 5.1.1 · TypeScript 5.9.3 · @sd-jwt/core 0.25.0 |
| **Command**              | `cd crypto-core && npm run test:coverage`                                                |
| **Result**               | **158 / 158 tests passed · 0 failed**                                                    |
| **Requirements covered** | FR-ISS-02, FR-WAL-06, FR-VER-02, NFR-01, NFR-06                                          |

## 1. Purpose and scope

These tests check that the shared cryptographic core:

- creates RS256-signed SD-JWT credentials correctly;
- verifies them;
- decodes their disclosures;
- detects tampering;
- handles invalid input safely.

This supports the security and privacy success criterion of the evaluation
(MPR §3.7.3, Table 3.5): _zero successful forgery, replay or over-disclosure_.

**In scope:**

- Issuer key generation and storage (`issuer-keys.ts`)
- Credential creation (`createSdJwt`)
- Issuer signature and integrity verification (`verifySdJwt`)
- Disclosure decoding and validation (`decodeDisclosures`, `validateDisclosures`)
- Inspection (`decodeSdJwt`)
- Holder key thumbprints (`computeEcJwkThumbprint`, RFC 7638)

**Out of scope (tested in later sprints):**

- Holder key binding and nonce/audience checks (`verifyPresentation`, Sprint 3)
- Revocation status checks (FR-BAK-01)
- Request policy validation (FR-VER-03)

## 2. Test suites

| Test file                    | Focus                                                                                 | Tests   | Passed  |
| ---------------------------- | ------------------------------------------------------------------------------------- | ------- | ------- |
| `issuer-keys.test.ts`        | RS256 key generation, RFC 7638 kid, JWKS export, encrypted storage                    | 21      | 21      |
| `sd-jwt-issuer.test.ts`      | Credential format, salts, disclosures, `_sd` digests, RS256 signing, input validation | 27      | 27      |
| `sd-jwt-verifier.test.ts`    | Signature, algorithm, kid, disclosures, expiry checks; tampering; malformed tokens    | 31      | 31      |
| `disclosures.test.ts`        | Disclosure decoding, value extraction, digest validation, tampering rejection         | 33      | 33      |
| `security-scenarios.test.ts` | End-to-end acceptance scenarios S1–S5 (TC-01 to TC-36)                                | 36      | 36      |
| `jwk-thumbprint.test.ts`     | RFC 7638 thumbprint of the holder's EC P-256 key (scenario S6)                        | 10      | 10      |
| **Total**                    |                                                                                       | **158** | **158** |

## 3. Required scenarios: results

Each scenario from the Sprint 1 test task maps to test cases in
`security-scenarios.test.ts`. The unit test files contain further tests for
the same behaviour.

### S1 – Valid signature passes

| ID    | Test case                                                                   | Expected                          | Result  |
| ----- | --------------------------------------------------------------------------- | --------------------------------- | ------- |
| TC-01 | Full lifecycle: encrypted key saved → loaded → credential issued → verified | Valid, all claims returned        | ✅ Pass |
| TC-02 | Presentation revealing only `age_over_18`                                   | Valid, date of birth not revealed | ✅ Pass |
| TC-03 | Credential signed with a 3072-bit key                                       | Valid                             | ✅ Pass |
| TC-04 | Verification with a KeyObject public key                                    | Valid                             | ✅ Pass |

### S2 – Tampered credential payload fails

| ID    | Test case                                         | Expected            | Result  |
| ----- | ------------------------------------------------- | ------------------- | ------- |
| TC-05 | Visible claim changed (`issuer_name`)             | `INVALID_SIGNATURE` | ✅ Pass |
| TC-06 | Expiry extended by 50 years                       | `INVALID_SIGNATURE` | ✅ Pass |
| TC-07 | Visible claim removed (`status`)                  | `INVALID_SIGNATURE` | ✅ Pass |
| TC-08 | Claim added (`public_position`)                   | `INVALID_SIGNATURE` | ✅ Pass |
| TC-09 | Digest removed from `_sd`                         | `INVALID_SIGNATURE` | ✅ Pass |
| TC-10 | Holder key replaced in `cnf` (credential theft)   | `INVALID_SIGNATURE` | ✅ Pass |
| TC-11 | Header changed to `alg: none`, signature stripped | Rejected            | ✅ Pass |
| TC-12 | Impostor issuer signs with the real kid           | `INVALID_SIGNATURE` | ✅ Pass |

### S3 – Tampered disclosure fails

| ID    | Test case                                                                  | Expected                          | Result  |
| ----- | -------------------------------------------------------------------------- | --------------------------------- | ------- |
| TC-13 | `date_of_birth` edited (issuer signature still valid)                      | `DISCLOSURE_NOT_IN_SD`            | ✅ Pass |
| TC-14 | `age_over_18` flipped from true to false                                   | `DISCLOSURE_NOT_IN_SD`            | ✅ Pass |
| TC-15 | Completely forged disclosure                                               | `DISCLOSURE_NOT_IN_SD`            | ✅ Pass |
| TC-16 | Genuine disclosure spliced in from another person's credential (same bank) | `DISCLOSURE_NOT_IN_SD`            | ✅ Pass |
| TC-17 | Duplicated disclosure                                                      | `DUPLICATE_DISCLOSURE`            | ✅ Pass |
| TC-18 | `decodeDisclosures` rejects tampering without the verifier                 | Rejected, tampered claim excluded | ✅ Pass |

### S4 – Valid disclosures are decoded correctly

| ID    | Test case                                                                   | Expected                    | Result  |
| ----- | --------------------------------------------------------------------------- | --------------------------- | ------- |
| TC-19 | All values round-trip exactly (text, Sinhala text, boolean, address object) | Values equal originals      | ✅ Pass |
| TC-20 | Recalculated digests equal Node.js SHA-256 and appear in signed `_sd`       | Match                       | ✅ Pass |
| TC-21 | Partial presentation decodes only revealed claims                           | 2 decoded, 6 undisclosed    | ✅ Pass |
| TC-22 | `decodeSdJwt` inspects a presentation including its key-binding JWT         | Claims and KB payload shown | ✅ Pass |

### S5 – Invalid credential data is handled appropriately

| ID            | Test case                                                                       | Expected                      | Result  |
| ------------- | ------------------------------------------------------------------------------- | ----------------------------- | ------- |
| TC-23 – TC-29 | Empty string, random text, JWT without `~`, `null`, `undefined`, number, object | `MALFORMED_TOKEN`, no crash   | ✅ Pass |
| TC-30         | Invalid public key argument (`null`)                                            | Clear `TypeError`             | ✅ Pass |
| TC-31         | Non-RSA (EC) public key                                                         | `INVALID_SIGNATURE`, no crash | ✅ Pass |
| TC-32         | `decodeDisclosures` with non-string input or non-object payload                 | Clear error                   | ✅ Pass |
| TC-33         | Array-element disclosure (not used by UniVault)                                 | Rejected                      | ✅ Pass |
| TC-34         | `createSdJwt` with claims that are not a plain object                           | Rejected                      | ✅ Pass |
| TC-35         | Tampered public key file (key swapped, kid kept)                                | Detected on load              | ✅ Pass |
| TC-36         | Hasher with unsupported algorithm / binary input                                | Rejected / correct digest     | ✅ Pass |

### S6 – Holder key thumbprint (added with the credential issuance API)

The backend stores the RFC 7638 thumbprint of the wallet key in `cnf.jwk` as
`holder_key_thumbprint`. These cases are in `jwk-thumbprint.test.ts`.

| ID    | Test case                                                                         | Expected                                      | Result  |
| ----- | --------------------------------------------------------------------------------- | --------------------------------------------- | ------- |
| TP-01 | RFC 7517 A.1 P-256 example key (value cross-checked with jose)                    | `cn-I_WNMClehiVp51i_0VpOENW1upEerA8sEam5hn-s` | ✅ Pass |
| TP-02 | Members hashed as `{"crv","kty","x","y"}` whatever the input order                | Equals SHA-256 of the canonical JSON          | ✅ Pass |
| TP-03 | Extra members (`kid`, `alg`, `use`, `d`) are ignored                              | Same thumbprint                               | ✅ Pass |
| TP-04 | Two generated keys                                                                | 43-character Base64URL, different values      | ✅ Pass |
| TP-05 | Non-EC key, missing `crv` / `x` / `y`, non-Base64URL coordinate, non-object input | Clear error                                   | ✅ Pass |

## 4. Code coverage

Measured with `@vitest/coverage-v8` over `crypto-core/src`. The run fails if
coverage drops below the thresholds (statements 95%, branches 90%, functions
100%, lines 95%).

| Metric     | Coverage           | Threshold |
| ---------- | ------------------ | --------- |
| Statements | 97.63% (248 / 254) | 95%       |
| Branches   | 93.89% (200 / 213) | 90%       |
| Functions  | 100% (41 / 41)     | 100%      |
| Lines      | 99.14% (231 / 233) | 95%       |

Per file (lines): `jwk-thumbprint.ts`, `disclosures.ts`, `decode.ts`, `hash.ts`,
`constants.ts` and `sd-jwt-issuer.ts` 100%; `sd-jwt-verifier.ts` 98.63%;
`issuer-keys.ts` 97.67%.

Before this task, coverage was 94.51% statements, 89.11% branches and 96.8%
lines. The scenario suite added tests for previously unexercised error paths.

**Remaining uncovered lines:** these are defensive checks that cannot be
reached through the public API. Examples: Node.js returning an unexpected key
format, and an error being caught after `crypto.verify` has already handled the
input.

The HTML coverage report is at `crypto-core/coverage/index.html`, generated
locally and not committed.

## 5. Defects found and fixed during testing

| #   | Found by | Problem                                                                                          | Fix                                                  |
| --- | -------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| 1   | TC-30    | `verifySdJwt(token, null)` crashed with an unclear JavaScript error (`Cannot use 'in' operator`) | Added an input check that throws a clear `TypeError` |
| 2   | TC-32    | `decodeDisclosures(42)` crashed with `sdJwt.split is not a function`                             | Added an input check that throws a clear `TypeError` |

## 6. How to reproduce

```
cd crypto-core
npm install
npm run test:coverage   # all tests + coverage table (fails below thresholds)
npm run test:report     # same, listing every test name
```

## 7. Conclusion

All 158 tests pass, covering all five required scenarios:

- **Valid credentials** verify.
- **Tampering is detected.** Any change to the signed payload fails signature
  verification. Any edited, forged, spliced or duplicated disclosure is
  rejected, even when the issuer signature is intact.
- **Invalid input** is handled with clear error codes and no crashes.

The core is now used by the backend credential issuance API:
`backend/test/credentials.test.ts` verifies backend-signed credentials with
`verifySdJwt` and `decodeDisclosures`. The verifier will use it in Sprint 3.
