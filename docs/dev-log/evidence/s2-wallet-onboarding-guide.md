# Evidence guide: wallet onboarding, the security gate and Appearance (S2, 28 Nov 2026)

What to run, open and capture for each screenshot of the onboarding flow, the gate and the
Appearance setting ([docs/frontend/mobile-wallet.md](../../frontend/mobile-wallet.md) §7, §9,
§15). Save each one in this folder under the file name given. Never capture `.env` contents,
tokens or passwords.

## Before you start

1. As in [s2-wallet-init-guide.md](s2-wallet-init-guide.md) "Before you start": Expo Go for SDK
   58, phone and PC on the same Wi-Fi (Private network), firewall rule for 8081. The backend is
   not needed for these steps.
2. Use PowerShell (not Git Bash) for every command.
3. `cd wallet; npm start`, scan the QR code with Expo Go (a development build: the placeholder
   "Continue" button and Reset onboarding exist only there).
4. If the app was used before, start from a first launch: **Settings → Diagnostics → Reset
   onboarding → Reset** (or clear Expo Go's storage). Phone in light mode, English, normal text
   size.

## Steps

| #   | Step                     | What to do and capture                                                                                                                                                                                                         | File name                                      |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| 1   | Tests                    | `cd wallet; npm run test:coverage`: "Tests: 473 passed, 473 total", "Test Suites: 17 passed" and the "All files" row (99.54 / 95.93 / 99.32 / 99.87)                                                                           | `s2-2026-11-28-onboarding-tests.png`           |
| 2   | First launch             | After the reset: the app opens on **Choose your language** (step 1 of 6), large English / සිංහල options, the speech-bubble drawing on navy, no Back button                                                                      | `s2-2026-11-28-onboarding-language.png`        |
| 3   | Sinhala at once          | Tap **සිංහල**: the screen switches to Sinhala immediately. Capture, then tap **English** again                                                                                                                                  | `s2-2026-11-28-onboarding-language-si.png`     |
| 4   | Welcome                  | **Next**: "Welcome to UniVault", "UniVault keeps your digital identity on your phone.", Skip at the top, Back / Next at the bottom, dots with "Step 2 of 6"                                                                    | `s2-2026-11-28-onboarding-welcome.png`         |
| 5   | How it works             | **Swipe left** (instead of Next): the issuer → holder → verifier drawing with Organisation / You / Checker under it, and the three sentences                                                                                   | `s2-2026-11-28-onboarding-how-it-works.png`    |
| 6   | You choose what to share | Next: the card drawing (one line shared) and the "Prove you are over 18 without showing your birthday" example panel                                                                                                           | `s2-2026-11-28-onboarding-disclosure.png`      |
| 7   | Your wallet is protected | Next: PIN or fingerprint, encrypted on this phone, works without the internet. Then **swipe right** once (back to step 4) and Next again                                                                                       | `s2-2026-11-28-onboarding-security.png`        |
| 8   | Your privacy (locked)    | Next: the three privacy points, "Privacy details" link, the unticked **I understand** box, and **Set up security** greyed out                                                                                                  | `s2-2026-11-28-onboarding-privacy-locked.png`  |
| 9   | Privacy details          | Tap **Privacy details**: the four sections and "Privacy text version: privacy-v1"; Back returns to Privacy                                                                                                                     | `s2-2026-11-28-onboarding-privacy-details.png` |
| 10  | Skip and Back            | Back to Welcome (Back button three times), tap **Skip**: lands on Privacy (never past it). Press **Back**: goes to "Your wallet is protected" (the step before Privacy). One screenshot of that screen                         | `s2-2026-11-28-onboarding-skip-back.png`       |
| 11  | Android back             | Android only: on step 2 press the hardware/gesture back (goes to the language step), press it again on the language step (Expo Go / the app goes to the background). Reopen the app: it is still in onboarding. Capture step 1 | `s2-2026-11-28-onboarding-android-back.png`    |
| 12  | I understand             | Go to Privacy, tick **I understand**: Set up security turns azure. Capture before tapping it                                                                                                                                   | `s2-2026-11-28-onboarding-privacy-ticked.png`  |
| 13  | Security setup           | Tap **Set up security**: "Set up your PIN", the explanation, "PIN setup comes in the next version" and the development-only Continue button                                                                                    | `s2-2026-11-28-onboarding-setup.png`           |
| 14  | Gate (setup)             | Close Expo Go completely and reopen the project: it opens on **Set up your PIN** again (onboarding done, security not). Optional: open `exp://<LAN IP>:8081/--/settings` on the phone: still Set up your PIN                   | `s2-2026-11-28-onboarding-gate-setup.png`      |
| 15  | Into the wallet          | Tap **Continue (development placeholder)**: the Credentials tab opens. Restart the app: it opens on Credentials                                                                                                                | `s2-2026-11-28-onboarding-wallet.png`          |
| 16  | Appearance               | Settings: **Appearance** right below Language, value "Automatic". Open it and choose **Dark**: the whole app turns dark at once. Capture the Appearance screen                                                                 | `s2-2026-11-28-appearance-dark.png`            |
| 17  | Dark app-wide            | Back to Settings (row says "Dark"), then the Credentials tab: navy header with white status-bar icons, dark tab bar. Restart the app: it starts dark with no light flash                                                       | `s2-2026-11-28-appearance-dark-home.png`       |
| 18  | Light ignores the phone  | Choose **Light**, then switch the phone to dark mode: the app stays light. Switch to **Automatic**: the app turns dark (follows the phone). Capture that, then turn the phone back to light: the app follows                   | `s2-2026-11-28-appearance-device.png`          |
| 19  | Onboarding in dark       | Set Appearance to Dark, then Diagnostics → **Reset onboarding** → Reset: the language step in the dark theme (language and appearance kept). Capture one more step (e.g. Privacy)                                              | `s2-2026-11-28-onboarding-dark.png`            |
| 20  | Largest text size        | Phone settings → largest font / display size; walk the six steps: text wraps, Back / Next stack instead of overlapping, nothing is cut off (scroll where needed). Capture Privacy. Reset the size afterwards                   | `s2-2026-11-28-onboarding-large-text.png`      |
| 21  | Screen reader            | Optional: TalkBack / VoiceOver on, on any step focus the dots: it reads "Step 3 of 6". Capture with the focus visible                                                                                                          | `s2-2026-11-28-onboarding-screen-reader.png`   |
| 22  | Reduce motion            | Optional: phone settings → remove animations / reduce motion on; Next changes steps without a slide. Not visible in a screenshot: note the result in sprint-2.md instead                                                       | (no file)                                      |
| 23  | Release bundle           | `npx expo export --platform android --output-dir $env:TEMP\uv-export`, then search the `.hbc` for `setup-dev-continue` and `reset-onboarding-button` (0 matches each) and `onboarding-language` (found)                        | `s2-2026-11-28-onboarding-release-bundle.png`  |

## After the screenshots

Record the file names under "Evidence" in the 28 Nov entry of [sprint-2.md](../sprint-2.md) and
fill the "Onboarding on the phone" row of its Testing evidence table. If something looks wrong
on the phone (a cut-off label at the largest text size, a drawing that is hard to see in dark, a
back press that leaves the app on a later step, a Sinhala line that reads badly), capture it and
add an "Issues and resolutions" entry. Finish with Appearance on "Automatic" and the
phone back in light mode.
