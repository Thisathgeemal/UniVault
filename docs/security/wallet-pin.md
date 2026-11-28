# Wallet PIN

**Sprint:** 2 · **Requirements:** FR-WAL-07 (wallet lock), FR-WAL-03 (holder control), NFR-08
(PDPA) · **Decision:** 025 (draft) · **Code:** [`wallet/src/security/`](../../wallet/src/security/),
[`wallet/app/setup/security.tsx`](../../wallet/app/setup/security.tsx) · **Tests:**
`wallet/test/pin-rules.test.ts`, `pin.test.ts`, `pin-flow.test.tsx`

The holder creates a 6-digit PIN at the end of onboarding. It will open the wallet and approve
every share (the app-lock and presentation tasks use it). This document covers how the PIN is
checked and stored, and why.

## 1. What has to be protected

| Threat                                                       | What the attacker has                                   | What stops or slows them                                                                                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Guessing in the app** (stolen or borrowed phone, unlocked) | The UI only                                             | Attempt limits with growing lock-outs (app-lock task; the record exists now, §6). Weak-PIN rules remove the guesses people try first (§4)                                                                             |
| **Offline guessing** of a stolen verifier                    | The verifier record: salt, parameters, hash             | Getting it at all: the secure store (§3). If it is extracted anyway: the salt (no precomputed tables, one attack per phone) and scrypt (every guess costs 4 MiB of memory and time)                                   |
| **Device theft** (phone locked)                              | The phone, no passcode                                  | `WHEN_UNLOCKED_THIS_DEVICE_ONLY`: the Keychain / Keystore does not release the record while the phone is locked                                                                                                       |
| **Backups and new phones**                                   | A device backup (cloud or computer) or a restored phone | `…THIS_DEVICE_ONLY` (iOS: never migrated to another device); Android: the secure-store data is excluded from auto-backup (`expo-secure-store` plugin, `configureAndroidBackup`), and Keystore keys cannot be exported |
| **Screen capture and shoulder surfing**                      | A screenshot, a recording, a person watching            | Dots only, never digits; screen capture blocked on the PIN screens in release builds (§7)                                                                                                                             |
| **Leaks through the app itself**                             | Logs, crash reports, navigation state, AsyncStorage     | The PIN is never logged, never in a route param, an error or AsyncStorage; a test searches all of them (§6)                                                                                                           |

Out of scope for Sprint 2: a rooted or jailbroken phone with code running inside the app (it can
read the PIN as it is typed), and hardware attacks on the Keystore.

**Be honest about the numbers:** a 6-digit PIN has only 1,000,000 values. No key-derivation
function that a phone can run in half a second makes an EXTRACTED verifier safe against a
determined offline attacker with a GPU: even at 4 MiB per guess, trying all 1,000,000 PINs is a
matter of hours or days of hardware time, not years. So the KDF is one layer, not the protection. The
protection is that the verifier never leaves the secure store of an unlocked phone, plus attempt
limits in the app. The PIN-derived vault key (option 4 of Decision 025) would not change that
arithmetic either, which is why it is not used now.

## 2. Why the layers together

- **Salt (16 random bytes, `expo-crypto` `getRandomValues`)**: two holders with the same PIN have
  different verifiers, and a table of precomputed hashes for all 1,000,000 PINs is useless.
- **Slow KDF (scrypt)**: every guess costs time and memory, on the attacker's hardware as well.
  It matters for the extracted-verifier case only, but it is cheap for the holder (one derivation
  per unlock or share).
- **Secure store, this device only**: the verifier is encrypted by the OS keystore and readable
  only on this phone while it is unlocked; it is not in backups.
- **Attempt limits**: the only defence against guessing through the app itself, where scrypt's
  half second is no obstacle (1,000,000 × 0.4 s is still only about 4.6 days of tapping).

## 3. Storage

One secure-store entry, `univault.pinVerifier` (`PIN_VERIFIER_KEY`), JSON:

```json
{
  "v": 1,
  "alg": "scrypt",
  "params": { "N": 4096, "r": 8, "p": 1, "dkLen": 32 },
  "salt": "<16 bytes, hex>",
  "hash": "<32 bytes, hex>"
}
```

- Written and read with `{ keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY, requireAuthentication: false }`
  (`SECURE_STORE_OPTIONS`): no OS prompt (the wallet asks for the PIN itself; biometrics come in
  the next task), readable only while the phone is unlocked, never synced.
- **Never in AsyncStorage** (Decision 023): a test checks nothing is written there.
- The algorithm and its parameters are stored WITH the verifier, so the default can be raised
  later and old verifiers still verify with the parameters they were made with.
- `verifyPin(pin)` reads the verifier, re-derives with ITS salt and parameters and compares in
  constant time (`constantTimeEqual`: no early exit). It returns `true` / `false` and never
  throws. A malformed or tampered record (unknown version or algorithm, parameters outside
  N 2^10–2^17, r 1–16, p 1–4, dkLen 32) counts as "no PIN", so the gate sends the holder to setup.
- `isSecuritySetupComplete()` (the gate) = a well-formed verifier exists.
- `deletePinData()` removes the verifier and the attempt record (Diagnostics → Reset onboarding,
  development builds only).

## 4. PIN rules

Exactly 6 digits (0–9). Refused with "This PIN is too easy to guess. Avoid repeated or consecutive
numbers." (`src/security/pin-rules.ts`):

| Rule             | Examples                                  |  PINs |
| ---------------- | ----------------------------------------- | ----: |
| All the same     | 000000, 777777                            |    10 |
| Consecutive      | 123456, 890123, 654321, 098765 (wrapping) |    20 |
| Repeated block   | 121212, 696969, 123123, 520520            | 1,090 |
| Counting pairs   | 112233, 998877                            |    20 |
| Mirrored         | 123321, 112211                            | 1,000 |
| Common PINs list | 159753, 147258, 789456, 102030 … (23)     |    23 |

Together 2,053 of 1,000,000 (0.21 %, counted by a test; the rows overlap). The aim is to remove
the guesses an attacker tries FIRST, not to shrink the space: people do not choose PINs uniformly,
and the top of the distribution is where in-app guessing (within the attempt limit) succeeds.

**Sources and reasoning.** Studies of real 6-digit PINs find that a small set of patterns
dominates: repeated digits, runs, repeated blocks, mirrored halves and keypad shapes (lines,
crosses). See P. Markert, D. V. Bailey, M. Golla, M. Dürmuth and A. J. Aviv, "This PIN Can Be
Easily Guessed: Analyzing the Security of Smartphone Unlock PINs", IEEE Symposium on Security and
Privacy 2020 (which also measures how blocklists change user choice), and D. Wang, Q. Gu, X. Huang
and P. Wang, "Understanding Human-Chosen PINs: Characteristics, Distribution and Security", ACM
AsiaCCS 2017. The structural rules cover the patterns those papers describe; the explicit list
holds keypad shapes and a few frequent numbers they do not catch. **The list was compiled by the
developer from those patterns, not copied from a published table: check it against the papers'
lists before release** and extend it if needed (a test fails if an entry duplicates a rule).

## 5. KDF and its parameters

**scrypt (RFC 7914), N = 2^12, r = 8, p = 1, 32-byte output: 4 MiB of memory per derivation**,
from `@noble/hashes` 2.4.0 (pure JavaScript, the version crypto-core already uses; pinned in the
wallet). `scryptAsync` with 10 ms ticks keeps the UI responsive while it runs.

Why scrypt: it is memory-hard, so a guess on a GPU costs memory as well as time. PBKDF2-HMAC-SHA256
at the same phone time would be only about 12,000 iterations (measured below), far under the
600,000 OWASP gives for servers, and cheap on GPUs. Argon2id (also in `@noble/hashes`) is the
current first choice for servers; it was not benchmarked on Hermes for this task and scrypt is
the long-established, widely implemented memory-hard option, so scrypt was chosen; Argon2id is
the candidate if the measurements allow it (the `alg` field makes that switch possible).

**Choosing N without a phone to measure on.** On the developer's PC (Node 26, V8 with JIT):

| KDF                     |   Time |
| ----------------------- | -----: |
| scrypt N 2^12, r 8, p 1 |  15 ms |
| scrypt N 2^13           |  29 ms |
| scrypt N 2^14           |  55 ms |
| PBKDF2-SHA256 100,000   | 119 ms |

Hermes (React Native's engine) interprets without a JIT, and a mid-range Android core is slower
than a desktop core; together an estimated 10–40 times slower for this kind of tight integer
code. That puts N = 2^12 at about 150–600 ms on the phone, around the 250–500 ms target; N = 2^13
would likely be 300 ms–1.2 s. The estimate is uncertain, so:

**Measure and tune:** Settings → Diagnostics → **PIN hashing time** (development builds) runs one
derivation with the default parameters on random data (never a PIN) and shows the time.

- Under 250 ms on the target phone: raise `DEFAULT_KDF_PARAMS.N` to 2^13 (`src/security/pin.ts`).
- Over 600 ms: keep 2^12 (the floor; going lower weakens the extracted-verifier case for little
  gain) and look at Argon2id or a native KDF in a development build.
- Existing verifiers keep their stored parameters. The app-lock task can re-hash with the new
  default after a successful unlock (the PIN is in hand at that moment).

## 6. What is never stored, and attempt limits

- **The PIN itself, or anything it can be recovered from without guessing**: never, anywhere.
- The entry lives in the setup screen's state only until the 6th digit; the first PIN waits in a
  ref until it is confirmed and hashed, then the ref is cleared (also after 3 mismatches or a
  failed save). The byte copy given to scrypt is wiped after use; JavaScript strings cannot be
  wiped, so they are dropped as early as possible.
- Never in logs, route params or navigation state, AsyncStorage, the secure store or error
  messages: `PinStoreError` has fixed messages per code (`PIN_REJECTED`, `STORE_FAILED`) and no
  cause; `verifyPin` returns `false` instead of throwing. `test/pin-flow.test.tsx` runs the whole
  flow with a known PIN and searches all of these for it.
- **Failed attempts (used since 28 Nov by `authenticate()`'s PIN prompt; schedule in
  [wallet-authentication.md](wallet-authentication.md) §5):** a separate secure-store record
  `univault.pinAttempts` = `{ "failedAttempts": n, "lockedUntil": ISO instant | null }` with
  `readPinAttempts`, `writePinAttempts`, `clearPinAttempts` (same options; malformed = no
  attempts; a new PIN clears it). The app-lock task decides the policy (for example lock-outs that
  grow after 5 failures) and records it in Decision 025.

## 7. Screenshot blocking

`useBlockScreenCapture()` (`src/security/screen-capture.ts`) calls `expo-screen-capture`'s
`preventScreenCaptureAsync('univault-pin')` while the PIN screen is open and
`allowScreenCaptureAsync` when it closes. Android: `FLAG_SECURE` (screenshots and recordings
refused, the app switcher shows a blank card). iOS: what expo-screen-capture supports on that
iOS version (at least a blank screen in recordings); check it on a device.

**Release builds only** (`screenCaptureBlockingEnabled()` = `!__DEV__`), so the evidence
screenshots can be taken in development builds. A test checks it is not called in development
and is called (and released) when the gate says release. Since 28 Nov, release builds also block
capture for the WHOLE wallet (`useAppScreenCaptureBlock()`, key `univault-app`, in the
`LockProvider`): wallet-authentication.md §9.

## 8. Not yet

- ~~Biometric unlock~~ and ~~the attempt policy~~: done on 28 Nov (Decision 026,
  [wallet-authentication.md](wallet-authentication.md)).
- App lock (it will call `authenticate()`).
- "Change PIN" in Settings → Security (needs the current PIN; backlog).
