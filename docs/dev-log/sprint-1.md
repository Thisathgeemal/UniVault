# Sprint 1: Foundations, Cryptographic Core and Issuer Portal

| Item   | Detail                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------- |
| Dates  | Mon 16 Nov – Sat 21 Nov 2026                                                                      |
| Goal   | Issuer can create, sign, revoke and reissue SD-JWT credentials; issuance API ready for the wallet |
| Review | Sun 22 Nov 2026                                                                                   |

[Back to the dev-log index](README.md)

## Daily log

### Mon 16 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Tue 17 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Wed 18 Nov

- **Done:** _To be filled in._
- **Next:** _To be filled in._
- **Blockers:** _To be filled in._
- **Evidence:** _To be filled in._

### Thu 19 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

### Fri 20 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

### Sat 21 Nov

- **Done:**
- **Next:**
- **Blockers:**
- **Evidence:**

## Testing evidence

Record the tests that show the sprint goal is met, with links to output in `evidence/`.

| Test / check | Type (unit / integration / manual) | Result | Evidence |
| ------------ | ---------------------------------- | ------ | -------- |
|              |                                    |        |          |

## Sprint review (Sun 22 Nov)

### Demoed

-

### Supervisor feedback

-

### Actions

| Action | Owner | Due / sprint |
| ------ | ----- | ------------ |
|        |       |              |

## Retrospective

### What went well

-

### What did not go well

-

### What to change in Sprint 2

-

## Issues and resolutions

### Issue 1: Expo Go could not connect to the development server (18 Nov 2026)

- **Task:** SD-JWT library spike (phone compatibility test)
- **Symptom:** After scanning the QR code from `npx expo start`, Expo Go on the phone did not finish loading the project.
- **Cause:** The phone could not reach the Metro server on the laptop over the local Wi-Fi network (likely network isolation or firewall).
- **Attempt:** Switched to tunnel mode with `npx expo start --tunnel`.
- **Follow-up error:** `CommandError: Couldn't create a signed tunnel URL for this project. You're not logged in to your Expo account` – newer Expo versions require an Expo account for their own tunnel.
- **Resolution:** Used the ngrok tunnel instead: `npx expo start --tunnel ngrok`. The app loaded and all 10 checks passed.
- **Lesson:** Tunnel mode avoids local network restrictions. An Expo account will be needed anyway for the Android build in Sprint 5.

### Issue 2: Test runner failed with "Cannot find native binding" (19 Nov 2026)

- **Task:** Issuer key generation (crypto-core), and again in createSdJwt
- **Symptom:** `npm test` failed with `Error: Cannot find native binding ... Cannot find module '@rolldown/binding-wasm32-wasi'`.
- **Cause (first time):** The `package-lock.json` supplied with the code had been generated on Linux, so it only listed the Linux build of Vitest's native component (rolldown). On Windows, npm did not install the Windows build – a known npm bug with optional dependencies (npm/cli#4828).
- **Resolution (first time):** Deleted `node_modules` and `package-lock.json` in `crypto-core/` and ran `npm install`, so npm generated a lock file for Windows.
- **Cause (second time):** The same npm bug recurred when new dependencies were installed on top of the existing `node_modules`.
- **Resolution (second time):** [describe what fixed it – e.g. clean reinstall with `npm cache verify`]
- **Lesson:** Never share lock files generated on another operating system. After adding dependencies, do a clean reinstall if native-binding errors appear.