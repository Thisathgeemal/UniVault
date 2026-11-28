# Evidence guide: wallet navigation and application shell (S2, 27 Nov 2026)

What to run, open and capture for each screenshot of the wallet shell
([docs/frontend/mobile-wallet.md](../../frontend/mobile-wallet.md) §3, §5–§10). Save each one in
this folder under the file name given. Credentials and History show **synthetic sample data**
(development build only); never capture `.env` contents, tokens or passwords.

## Before you start

1. As in [s2-wallet-init-guide.md](s2-wallet-init-guide.md) "Before you start": Expo Go for SDK
   58, phone and PC on the same Wi-Fi (Private network), firewall rules for 4000 and 8081,
   `wallet/.env` with `EXPO_PUBLIC_API_BASE_URL`.
2. Use PowerShell (not Git Bash) for every command.
3. `cd wallet; npm start`, scan the QR code with Expo Go. The backend is not needed for these
   steps.

## Steps

| #   | Step               | What to do and capture                                                                                                                                                                                 | File name                                    |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| 1   | Tests              | `cd wallet; npm run test:coverage`: "Tests: 223 passed, 223 total", "Test Suites: 14 passed" and the "All files" row (99.19 / 95.41 / 98.74 / 100)                                                     | `s2-2026-11-27-wallet-shell-tests.png`       |
| 2   | CSS proof          | `cd issuer-portal; npm run build`, then `Get-FileHash dist\assets\*.css`: `index-CS6Xois6.css` `4FCD3220…` and `vendor-BWIVbSOu.css` `29219633…` (same as before the token change)                     | `s2-2026-11-27-wallet-shell-css-hashes.png`  |
| 3   | Credentials list   | Phone, light mode, English: Credentials tab with the sample notice and cards (Active, Replaced, Revoked, Expired, Not checked, Checking…), each with icon + word                                       | `s2-2026-11-27-wallet-shell-credentials.png` |
| 4   | Credential detail  | Tap the first card: header "Credential" with the back arrow, status badge, Issuer / Holder / Expires                                                                                                   | `s2-2026-11-27-wallet-shell-detail.png`      |
| 5   | Android back       | Android only: press the **hardware/gesture back** on the detail (back to the list), then switch to Settings and press back (lands on Credentials, app stays open). One screenshot of the list after it | `s2-2026-11-27-wallet-shell-back.png`        |
| 6   | History            | History tab: three sample entries; tap one: With / When / Credential link                                                                                                                              | `s2-2026-11-27-wallet-shell-history.png`     |
| 7   | Settings           | Settings tab: Preferences (Language = English, Security), App (About 0.1.0), Developer (Diagnostics, UI kit)                                                                                           | `s2-2026-11-27-wallet-shell-settings.png`    |
| 8   | Language → Sinhala | Settings → Language → **සිංහල**: the toast "භාෂාව වෙනස් කළා", tab labels in Sinhala                                                                                                                      | `s2-2026-11-27-wallet-shell-sinhala.png`     |
| 9   | Restart in Sinhala | Close Expo Go completely (swipe it away), open the project again: it starts **in Sinhala** without an English flash. Capture the Credentials tab. Switch back to English afterwards                    | `s2-2026-11-27-wallet-shell-restart-si.png`  |
| 10  | About              | Settings → About: description, App version 0.1.0, Expo SDK 58.0.0, the Noto Sans Sinhala / SIL Open Font License notice                                                                                | `s2-2026-11-27-wallet-shell-about.png`       |
| 11  | UI kit (light)     | Settings → UI kit: top of the screen (intro says "light mode") and the Buttons section; scroll for Credential statuses and Credential cards (two screenshots are fine: `-1`, `-2`)                     | `s2-2026-11-27-wallet-shell-uikit-light.png` |
| 12  | Toast and dialog   | UI kit → "Open a destructive confirmation": the dialog with the red Remove button; then Remove: the toast "Confirmed (example)"                                                                        | `s2-2026-11-27-wallet-shell-dialog.png`      |
| 13  | Dark mode          | Phone settings → dark mode on; back in the app: UI kit (intro says "dark mode") and the Credentials list. Turn dark mode off afterwards                                                                | `s2-2026-11-27-wallet-shell-dark.png`        |
| 14  | Largest text size  | Phone settings → largest font / display size; Credentials list and Settings: text wraps, nothing is cut off or overlaps. Reset the size afterwards                                                     | `s2-2026-11-27-wallet-shell-large-text.png`  |
| 15  | Not found          | Open `exp://<LAN IP>:8081/--/no-such-screen` on the phone (type it in the browser, or send it to yourself and tap it); Expo Go opens the app on "Page not found"                                       | `s2-2026-11-27-wallet-shell-not-found.png`   |

Step 15 is optional if the link does not open Expo Go on your phone; the not-found screen is
covered by `wallet/test/navigation.test.tsx`.

## After the screenshots

Record the file names under "Evidence" in the 27 Nov "wallet navigation and application shell"
entry of [sprint-2.md](../sprint-2.md) and fill the "Wallet shell on the phone" row of its
Testing evidence table. If something looks wrong on the phone (a cut-off label, a colour that
is hard to read, a back press that leaves the app), capture it and add an "Issues and
resolutions" entry.
