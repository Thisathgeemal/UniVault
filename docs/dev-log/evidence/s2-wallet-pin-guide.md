# Evidence guide: wallet PIN and the typography pass (S2, 28 Nov 2026)

What to run, open and capture for the PIN setup ([docs/security/wallet-pin.md](../../security/wallet-pin.md),
Decision 025) and the wallet typography and layout pass
([docs/frontend/mobile-wallet.md](../../frontend/mobile-wallet.md) §16–17). Save each screenshot
in this folder under the file name given. **Use a throwaway PIN for the screenshots, never one
you use anywhere else, and never write it down in the evidence.**

## Before you start

1. As in [s2-wallet-init-guide.md](s2-wallet-init-guide.md): Expo Go for SDK 58, phone and PC on
   the same Wi-Fi, firewall rule for 8081. The backend is not needed.
2. PowerShell (not Git Bash). `cd wallet; npm start`, scan the QR code with Expo Go (a
   development build: screenshots are allowed there; release builds block them on the PIN screen).
3. Start from a holder who finished onboarding but has no PIN: **Settings → Diagnostics → Reset
   onboarding → Reset**, then go through the six onboarding steps (Skip is fine) and tick "I
   understand". Phone in light mode, English, normal text size.

## Steps

| #   | Step                  | What to do and capture                                                                                                                                                                                                                                           | File name                               |
| --- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Tests                 | `cd wallet; npm run test:coverage`: "Tests: 599 passed, 599 total", "Test Suites: 20 passed" and the "All files" row (99.56 / 96.27 / 99.43 / 99.9)                                                                                                              | `s2-2026-11-28-pin-tests.png`           |
| 2   | Intro                 | "Set up your PIN", the padlock drawing, "Create a 6-digit PIN. You'll use it to open UniVault and approve every share.", one full-width **Create PIN** button at the bottom                                                                                      | `s2-2026-11-28-pin-intro.png`           |
| 3   | Keypad                | Create PIN: "Create your PIN", six empty dots, the 1–9 / 0 / Delete pad, no system keyboard. Enter 3 digits: three filled dots                                                                                                                                   | `s2-2026-11-28-pin-keypad.png`          |
| 4   | Weak PIN              | Enter **123456** (or 111111): the dots shake, the red message "This PIN is too easy to guess. Avoid repeated or consecutive numbers." and empty dots                                                                                                             | `s2-2026-11-28-pin-weak.png`            |
| 5   | Confirm               | Enter your throwaway PIN: "Confirm your PIN", empty dots, **Start again** at the bottom                                                                                                                                                                          | `s2-2026-11-28-pin-confirm.png`         |
| 6   | Mismatch              | Enter a different PIN: "The PINs don't match. Enter your new PIN again." and empty dots                                                                                                                                                                          | `s2-2026-11-28-pin-mismatch.png`        |
| 7   | Three mismatches      | Enter wrong PINs twice more: back on "Create your PIN" with "Let's start again"                                                                                                                                                                                  | `s2-2026-11-28-pin-restart.png`         |
| 8   | PIN set               | Create and confirm the PIN correctly: "PIN set", the tick, **Continue**                                                                                                                                                                                          | `s2-2026-11-28-pin-set.png`             |
| 9   | Into the wallet       | Continue: the Credentials tab. Close Expo Go completely and reopen the project: it opens on Credentials (the verifier is in the secure store)                                                                                                                    | `s2-2026-11-28-pin-wallet.png`          |
| 10  | **PIN hashing time**  | Settings → Diagnostics → **PIN hashing time → Run check** three times; capture the screen with "scrypt N = 4096, r = 8, p = 1 (4 MiB)" and the time. **Write the three times and the phone model in sprint-2.md** (they decide the KDF tuning, wallet-pin.md §5) | `s2-2026-11-28-pin-hashing-time.png`    |
| 11  | Reset deletes the PIN | Diagnostics → Reset onboarding → Reset, go through onboarding again: you are asked to create a PIN (the old one is gone)                                                                                                                                         | `s2-2026-11-28-pin-reset.png`           |
| 12  | Screen reader         | Optional: TalkBack / VoiceOver on, on the keypad: each key reads its digit, Delete reads "Delete", the dots read "2 of 6 digits entered" (never the digits)                                                                                                      | `s2-2026-11-28-pin-screen-reader.png`   |
| 13  | Reduce motion         | Optional: phone setting "remove animations" on; a weak PIN shows the message without the shake. Not visible in a still: note the result in sprint-2.md                                                                                                           | (no file)                               |
| 14  | Dark and large text   | Settings → Appearance → Dark, and the largest font size: the keypad and dots stay centred and fit, the messages wrap. Reset both afterwards                                                                                                                      | `s2-2026-11-28-pin-dark-large.png`      |
| 15  | Typography: Settings  | Settings: Preferences / App / Developer headings (16, bold), rows 56 pt, values and hints in 14 grey, everything left-aligned                                                                                                                                    | `s2-2026-11-28-typography-settings.png` |
| 16  | Typography: detail    | Credentials → a card: "Issuer", "Holder", "Expires" small and grey above their values                                                                                                                                                                            | `s2-2026-11-28-typography-detail.png`   |
| 17  | Typography: states    | Scan tab: the empty state left-aligned; onboarding (after a reset): the centred title and the full-width Next above Back                                                                                                                                         | `s2-2026-11-28-typography-states.png`   |
| 18  | Release bundle        | `npx expo export --platform android --output-dir $env:TEMP\uv-export`, then search the `.hbc` for `run-pin-hashing` and `reset-onboarding-button` (0 matches: dev-only code stripped)                                                                            | `s2-2026-11-28-pin-release-bundle.png`  |

Screen-capture blocking itself can only be seen in a release build (EAS or `npx expo run:android
--variant release`, a development-build task): there, a screenshot of the PIN screen is refused.
`wallet/test/pin-flow.test.tsx` covers the switch.

## After the screenshots

Record the file names under "Evidence" in the 28 Nov "wallet PIN" entry of
[sprint-2.md](../sprint-2.md), fill the "PIN hashing time on a phone" row of its Testing evidence
table with the measured times, and if they are outside 250–500 ms follow wallet-pin.md §5.
