# Evidence guide: automatic wallet lock (S2, 28 Nov 2026)

What to run, open and capture for the app lock
([docs/security/wallet-authentication.md](../../security/wallet-authentication.md) §9). Save each
screenshot in this folder under the file name given. Use a throwaway PIN; never show it.

## Before you start

1. Android phone (Expo Go) as in [s2-wallet-biometrics-guide.md](s2-wallet-biometrics-guide.md);
   an iPhone for the iOS rows if available. `cd wallet; npm start` (PowerShell), scan the QR code.
2. A holder who finished onboarding and set a PIN (Diagnostics → Reset onboarding first if
   needed). Settings → Security → "Lock after leaving the app" = Immediately.

## Steps

| #   | Step                       | What to do and capture                                                                                                                          | File name                               |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 1   | Tests                      | `cd wallet; npm run test:coverage`: "Tests: 720 passed, 720 total", "Test Suites: 22 passed", the "All files" row (99.4 / 96.43 / 99.19 / 99.8) | `s2-2026-11-28-applock-tests.png`       |
| 2   | Locked on start            | Close Expo Go completely, reopen the project: the lock screen ("UniVault is locked", "Unlock to continue") with the PIN prompt on top           | `s2-2026-11-28-applock-start.png`       |
| 3   | Cancel → no loop           | Cancel the prompt: the lock screen stays, no new prompt; tap Unlock: the prompt again; enter the PIN: the wallet, on the screen you left        | `s2-2026-11-28-applock-cancel.png`      |
| 4   | App switcher               | Open the recent-apps view: the UniVault card shows only the navy cover with the mark                                                            | `s2-2026-11-28-applock-recents.png`     |
| 5   | Shade does not lock        | Pull the notification shade down and up again: still unlocked                                                                                   | `s2-2026-11-28-applock-shade.png`       |
| 6   | Leave and return           | Press Home, reopen UniVault: locked, one prompt                                                                                                 | `s2-2026-11-28-applock-return.png`      |
| 7   | 30-second delay            | Set "Lock after leaving the app" to 30 seconds; leave for about 10 s and return: unlocked; leave for over 30 s: locked                          | `s2-2026-11-28-applock-delay.png`       |
| 8   | Fingerprint                | With fingerprint unlock on: leave and return: the fingerprint prompt; cancel it twice: the lock screen with Unlock and Use PIN                  | `s2-2026-11-28-applock-fingerprint.png` |
| 9   | Android back               | On the lock screen press back: the app goes to the background (nothing behind it is shown); reopen: still locked                                | `s2-2026-11-28-applock-back.png`        |
| 10  | Lock now                   | Settings → Security → Lock now: locked at once, no automatic prompt                                                                             | `s2-2026-11-28-applock-lock-now.png`    |
| 11  | Lockout on the lock screen | Unlock with a wrong PIN five times, cancel: the countdown under the title on the lock screen                                                    | `s2-2026-11-28-applock-lockout.png`     |
| 12  | Dark and large text        | Appearance Dark and the largest font size: the lock screen fits, buttons stacked                                                                | `s2-2026-11-28-applock-dark-large.png`  |
| 13  | Diagnostics                | Settings → Diagnostics: "Last lock reason" (Left the app / Lock now / App start)                                                                | `s2-2026-11-28-applock-diagnostics.png` |

## After the screenshots

Record the file names in the 28 Nov "automatic wallet lock" entry of [sprint-2.md](../sprint-2.md).
If the phone locks on the notification shade or during its own fingerprint prompt, or the
recent-apps card shows wallet content, add an "Issues and resolutions" entry with the phone model.
