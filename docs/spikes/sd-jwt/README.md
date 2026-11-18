# Spike: SD-JWT library compatibility (Node.js + React Native / Expo)

**Sprint:** 1 · **Date:** 19 Nov 2026 · **Status:** Node.js ✅ · Expo bundle ✅ · Phone runtime ⏳ (run `expo/` test, record result below)
**Question:** Can UniVault reuse an existing SD-JWT library on both the backend (Node.js) and the wallet (React Native / Expo), or is a custom module needed?

## 1. Decision (summary)

**Reuse `@sd-jwt/core` (OpenWallet Foundation), pinned to `0.25.0`, in both the backend and the wallet.** A custom implementation is **not needed**. It was built and proven as a fallback (section 4).

The library leaves cryptography to the app: we provide functions for hashing, salt generation, signing and verifying. So the same `@sd-jwt/core` code runs on Node.js and Expo, and only these injected functions differ per platform:

| Function               | Backend (Node.js)                  | Wallet (Expo / Hermes)                                  |
| ---------------------- | ---------------------------------- | ------------------------------------------------------- |
| SHA-256 hasher         | `@noble/hashes` (or `node:crypto`) | `@noble/hashes` (pure JS); matches `expo-crypto` digest |
| Salt / random bytes    | `crypto.getRandomValues`           | `expo-crypto` `getRandomBytes`                          |
| Issuer signature       | **RS256** via `node:crypto`        | – (wallet never signs credentials)                      |
| Holder key-binding JWT | verify ES256 via `@noble/curves`   | **ES256 (P-256)** via `@noble/curves` (pure JS)         |

**Refinement of NFR-01:**

- **Issuer credential signatures stay RS256,** as in the MPR.
- **The holder's key-binding JWT uses ES256,** because RSA key generation in pure JavaScript is too slow on a phone (section 5).
- Record this as Decision 007 and raise it at the 22 Nov review.

## 2. Candidates

| Library                                                           | Version                        | Result                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`@sd-jwt/core`** (OpenWallet Foundation, Apache-2.0)            | 0.25.0 (published 18 Nov 2026) | ✅ **Chosen.** Implements SD-JWT issue / present / verify with key binding. Only dependency: `@owf/identity-common` (+ `zod`). No Node built-ins, no `Buffer`.                                                                                                               |
| `@sd-jwt/sd-jwt-vc`                                               | 0.25.0                         | ⚠️ Works, not chosen. Adds SD-JWT VC type-metadata checks and the IETF Token Status List, which pulls in `cbor-x` (optional native add-on) and `pako`. Bundles for Android, but adds ~0.4 MB of code UniVault doesn't use: UniVault has its own status endpoint (FR-BAK-01). |
| `@owf/crypto` (former `@sd-jwt/crypto-nodejs` / `crypto-browser`) | 0.8.0                          | ⚠️ Backend only. Uses `globalThis.crypto` (WebCrypto), which Hermes does not provide.                                                                                                                                                                                        |
| `@hopae/sd-jwt`                                                   | –                              | ❌ Deprecated; moved to `@sd-jwt/core`.                                                                                                                                                                                                                                      |
| Custom module                                                     | –                              | ✅ Feasible fallback (section 4); not needed.                                                                                                                                                                                                                                |

## 3. Results

### 3.1 Node.js (`node spike-node.mjs`) – 14/14 checks passed

| #   | Check                                                                 | Result   |
| --- | --------------------------------------------------------------------- | -------- |
| 1   | Issue RS256 SD-JWT with 7 selectively disclosable claims              | ✅ ~4 ms |
| 2   | Signed payload contains only `_sd` digests for subject claims         | ✅       |
| 3   | Envelope claims (`iss`, `vct`, `cnf`, `status`) stay visible          | ✅       |
| 4   | Wallet code (pure JS) decodes all claims                              | ✅       |
| 5   | Wallet builds presentation (3 of 7 claims) with ES256 key-binding JWT | ✅ ~1 ms |
| 6   | Verifier accepts valid presentation (RS256 + KB + nonce + audience)   | ✅       |
| 7   | Undisclosed claims are not visible to the verifier                    | ✅       |
| 8   | Replay (wrong nonce) rejected                                         | ✅       |
| 9   | Wrong audience rejected                                               | ✅       |
| 10  | Forged disclosure rejected                                            | ✅       |
| 11  | Tampered issuer payload rejected (RS256 signature)                    | ✅       |
| 12  | Stolen credential presented with a different holder key rejected      | ✅       |
| 13  | Presentation without key binding rejected                             | ✅       |
| 14  | Hand-built custom SD-JWT verifies with the library                    | ✅       |

Cross-platform round trip: `make-fixture.mjs` (Node issues) → wallet code builds the presentation → `verify-presentation.mjs` (Node verifies) ✅. A tampered presentation is rejected ✅.

### 3.2 React Native / Expo

| Check                                                                                                                            | Result                                       |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Static analysis: no `node:` imports, no `Buffer` in `@sd-jwt/core` / `@owf/identity-common`                                      | ✅                                           |
| Metro bundle for Android (Expo SDK 58, React Native 0.88.1) with `@sd-jwt/core`, `@noble/curves`, `@noble/hashes`, `expo-crypto` | ✅ 716 modules, Hermes bytecode 2.5 MB       |
| SD-JWT, key-binding and P-256 code present in the Hermes bundle                                                                  | ✅                                           |
| `@sd-jwt/sd-jwt-vc` also bundles                                                                                                 | ✅ (+0.4 MB; not chosen)                     |
| **Runtime on a real phone (Expo Go)**                                                                                            | ⏳ **Run `expo/` test – record result here** |

Phone result (fill in): device ______ · Android/iOS ______ · checks passed **/** · key gen ___ ms · presentation ___ ms · Node verification of phone presentation: PASS / FAIL

## 4. Custom implementation (fallback – proven, not needed)

The development plan's fallback was implemented by hand in `spike-node.mjs` (about 10 lines):

1. Random 128-bit salt
2. Disclosure `[salt, name, value]` as JSON
3. Base64URL encoding
4. SHA-256 digest of each disclosure
5. Sorted digests placed in `_sd`, with `_sd_alg: "sha-256"`
6. RS256 signature over `header.payload`

The result verifies with `@sd-jwt/core` (check 14). So a custom module is possible if the library ever fails, but writing our own would mean re-doing parsing, presentation, key binding and verification edge cases that the library already handles and tests.

## 5. Cryptographic dependencies and platform limitations

| #   | Limitation                                                                                                                                                                                   | Impact / mitigation                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Expo Go has no RSA/ECDSA signing.** `expo-crypto` provides SHA digests, random bytes and AES only.                                                                                         | Holder signing uses `@noble/curves` (pure JS, audited). `expo-crypto` AES is useful for the encrypted vault (FR-WAL-03).                                                  |
| L2  | **Pure-JS RSA key generation is slow.** RSA-2048 via node-forge (pure JS) averaged **~1.2 s on a server**; a phone is typically several times slower. ES256 key generation took **~0.6 ms**. | Holder key = **ES256**. A native RSA module (`react-native-quick-crypto`) would need an Expo development build instead of Expo Go: more setup and slower iteration.       |
| L3  | **Hermes has no WebCrypto (`crypto.subtle`)** and no `crypto.getRandomValues` by default.                                                                                                    | Don't use `@owf/crypto` in the wallet. Polyfill `getRandomValues` from `expo-crypto` (see `expo/App.js`).                                                                 |
| L4  | `@owf/identity-common` needs `TextEncoder` **and `TextDecoder`**.                                                                                                                            | Checked by the phone test. If `TextDecoder` is missing, add a small polyfill (e.g. `fast-text-encoding`).                                                                 |
| L5  | `@noble/curves` needs `BigInt`.                                                                                                                                                              | Hermes supports `BigInt`; checked by the phone test.                                                                                                                      |
| L6  | **The library does not check `cnf` or `status`.**                                                                                                                                            | UniVault verifier code must (a) verify the KB-JWT against `cnf.jwk` (done in the spike's `kbVerifier`), and (b) check revocation via `status.status_uri` (FR-VER-02).     |
| L7  | SD-JWT reveals how many claims were left undisclosed (digest count).                                                                                                                         | Known limitation (MPR §2.4.2). Optional mitigation: decoy digests (supported by the library). Report in evaluation.                                                       |
| L8  | Library is **pre-1.0** and was restructured recently (utility packages merged into `@sd-jwt/core`).                                                                                          | Pin exact versions (`0.25.0`), no `^`. Upgrade only deliberately.                                                                                                         |
| L9  | Wallet does not verify the issuer's RS256 signature on receipt (no fast RSA in Expo Go).                                                                                                     | Acceptable: credentials arrive from the issuer over HTTPS, and the verifier always checks RS256 (FR-VER-02). Optional later: pure-JS RSA _verify_ (cheap, unlike keygen). |

## 6. Recommended implementation approach (input to `crypto-core/`)

`crypto-core/` wraps `@sd-jwt/core` behind a small UniVault API and takes platform crypto as injected functions:

```
createIssuer({ rs256Sign, hasher, randomBytes })
  .issueCredential(envelope, subjectClaims, schema) → compact SD-JWT
createWallet({ es256Sign, hasher })
  .readCredential(sdJwt)                → claims
  .present(sdJwt, claimNames, {nonce, aud}) → presentation
createVerifier({ rs256Verify, es256Verify, hasher, statusCheck })
  .verifyPresentation(p, {nonce, aud, requiredClaims}) → result with per-check outcome
```

- Selectively disclosable claims come from the schema files' `x-univault.selectivelyDisclosable` lists.
- The verifier result reports each check separately (signature, digests, key binding, nonce/audience, status, policy). This feeds the verifier portal's result screen (Sprint 3).
- `holder-purejs.mjs` in this spike is the starting point for the wallet half.

## 7. Files in this spike

| File                            | Purpose                                                      |
| ------------------------------- | ------------------------------------------------------------ |
| `spike-node.mjs`                | Node test: 14 checks + benchmarks                            |
| `holder-purejs.mjs`             | Wallet-side code, pure JS (no Node APIs)                     |
| `make-fixture.mjs`              | Issues a test credential for the phone test → `fixture.json` |
| `verify-presentation.mjs`       | Verifies the phone's presentation on Node                    |
| `expo/App.js`, `expo/holder.js` | Expo Go test app (`holder.js` = copy of `holder-purejs.mjs`) |

`fixture.json` and `presentation.txt` contain throwaway test keys and are git-ignored.
