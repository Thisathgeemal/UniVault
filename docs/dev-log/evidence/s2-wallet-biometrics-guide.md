# Evidence guide: biometric unlock with PIN fallback (S2, 28 Nov 2026)

What to run, open and capture for biometric unlock
([docs/security/wallet-authentication.md](../../security/wallet-authentication.md), Decision 026).
Save each screenshot in this folder under the file name given. Use a throwaway PIN; never show it.
The OS fingerprint / face sheet itself may be blank in screenshots on some phones (the system hides
it): then capture the screen just before and after it.

## Before you start

1. **Android phone with a fingerprint enrolled** (phone settings → Security). Expo Go for SDK 58,
   same Wi-Fi as the PC, `cd wallet; npm start` from PowerShell, scan the QR code.
2. **iPhone (optional):** Face ID / Touch ID need a **development build** (`npx expo run:ios` or an
   EAS development build); in Expo Go the wallet shows "needs the full UniVault app" and uses the
   PIN (step 10 captures that).
3. Start from a fresh holder: Settings → Diagnostics → Reset onboarding → Reset, then go through
   onboarding to "Set up your PIN".

## Steps

| #   | Step                         | What to do and capture                                                                                                                                                                                                                     | File name                                      |
| --- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 1   | Tests                        | `cd wallet; npm run test:coverage`: "Tests: 687 passed, 687 total", "Test Suites: 21 passed", the "All files" row (99.39 / 96.42 / 99.31 / 99.77)                                                                                          | `s2-2026-11-28-biometrics-tests.png`           |
| 2   | Setup step                   | Create and confirm the PIN, "PIN set" → Continue: "Use fingerprint to unlock?", "Your fingerprint stays on this phone. UniVault never sees it.", Turn on / Not now                                                                         | `s2-2026-11-28-biometrics-setup.png`           |
| 3   | Cancel at the prompt         | Turn on → cancel the fingerprint sheet: "Unlock with fingerprint is off. You can turn it on later in Settings."                                                                                                                            | `s2-2026-11-28-biometrics-setup-cancelled.png` |
| 4   | Turn on                      | Turn on → touch the sensor: the wallet opens, toast "Unlock with fingerprint is on"                                                                                                                                                        | `s2-2026-11-28-biometrics-on.png`              |
| 5   | Settings → Security          | The switch on, "This phone supports unlock with fingerprint.", Test unlock, Change PIN "Coming soon"                                                                                                                                       | `s2-2026-11-28-biometrics-settings.png`        |
| 6   | Test unlock: fingerprint     | Test unlock → touch the sensor: "Unlocked with fingerprint."                                                                                                                                                                               | `s2-2026-11-28-biometrics-test-ok.png`         |
| 7   | Fallback to PIN              | Test unlock → cancel the sheet: the PIN prompt ("Enter your PIN", "Test unlock", Use fingerprint, Cancel); enter the PIN: "Unlocked with your PIN."                                                                                        | `s2-2026-11-28-biometrics-fallback.png`        |
| 8   | Lockout                      | Test unlock → cancel → enter a wrong PIN five times: "Too many attempts. Try again in 30 seconds." counting down; close and reopen the app, Test unlock again: still locked                                                                | `s2-2026-11-28-biometrics-lockout.png`         |
| 9   | Biometrics changed           | Phone settings → add a second fingerprint; back in UniVault → Test unlock: the PIN prompt with "Your fingerprint settings changed. Unlock with your PIN, then turn fingerprint unlock on again in Settings."; the switch is off afterwards | `s2-2026-11-28-biometrics-invalidated.png`     |
| 10  | Turn off needs the PIN       | Turn the switch on again (sensor), then off: the PIN prompt (no fingerprint button); enter the PIN: "Unlock with fingerprint is off"                                                                                                       | `s2-2026-11-28-biometrics-off.png`             |
| 11  | iPhone in Expo Go (optional) | Settings → Security on an iPhone in Expo Go: "Unlock with face recognition needs the full UniVault app, not Expo Go.", the switch disabled                                                                                                 | `s2-2026-11-28-biometrics-ios-expo-go.png`     |
| 12  | Privacy line                 | Reset onboarding, go to "Your privacy": the row "Your fingerprint or face data never leaves your phone."                                                                                                                                   | `s2-2026-11-28-biometrics-privacy.png`         |

## After the screenshots

Record the file names in the 28 Nov "biometric unlock" entry of [sprint-2.md](../sprint-2.md) and
fill the "Biometrics on real phones" row of its Testing evidence table (note the phone models and
which steps showed the OS sheet). If the phone behaves differently from the guide (for example the
invalidation in step 9 does not happen), add an "Issues and resolutions" entry.
