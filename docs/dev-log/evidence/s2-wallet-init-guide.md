# Evidence guide: mobile wallet initialised (S2, 27 Nov 2026)

What to run, open and capture for each screenshot of the wallet project set-up
([docs/frontend/mobile-wallet.md](../../frontend/mobile-wallet.md), Decision 022). Save each
one in this folder under the file name given. Never capture `.env` contents, tokens or
passwords; the API base URL (a LAN IP) is fine.

## Before you start

1. Phone: install or update **Expo Go** from the store (it must support SDK 58). Phone and PC
   on the same Wi-Fi, network set to **Private** in Windows, firewall rules for TCP 4000 and
   8081 added ([wallet/README.md](../../../wallet/README.md), "Reaching the backend").
2. `wallet/.env` from `.env.example`, with
   `EXPO_PUBLIC_API_BASE_URL=http://<PC LAN IP>:4000/api/v1`.
3. Use PowerShell (not Git Bash) for every command.

## Steps

| #   | Step                    | What to do and capture                                                                                                                                                                                                                                                                                   | File name                         |
| --- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | Tests                   | `cd wallet; npm run test:coverage`: "Tests: 68 passed, 68 total", "Test Suites: 8 passed" and the coverage table (98.61 / 93.71 / 96.96 / 100)                                                                                                                                                           | `s2-wallet-init-tests.png`        |
| 2   | Doctor                  | `npm run doctor`: "20/20 checks passed. No issues detected!"                                                                                                                                                                                                                                             | `s2-wallet-init-doctor.png`       |
| 3   | App config              | `wallet/app.config.ts` open in VS Code, scrolled to the `ios` and `android` sections: `lk.univault.wallet` on both, the camera and Face ID texts (`infoPlist`), the adaptive icon colour from the tokens                                                                                                 | `s2-wallet-init-config.png`       |
| 4   | Folder structure        | VS Code Explorer with `wallet/` expanded: `app/` (with `(tabs)/` and `settings/`), `src/` (components, theme, i18n, lib, services, config), `assets/`, `test/`, and the config files                                                                                                                     | `s2-wallet-init-structure.png`    |
| 5   | Start the backend       | Second terminal: `cd backend; npm run dev`, wait for "UniVault backend listening". Setup step: no screenshot (step 12 shows it is reachable)                                                                                                                                                             | –                                 |
| 6   | `npm start` with the QR | `cd wallet; npm start`: the terminal with the QR code and the `exp://<LAN IP>:8081` address (after the phone opens the app, "Android Bundled … index.ts" or "iOS Bundled …" may show too)                                                                                                                | `s2-wallet-init-expo-start.png`   |
| 7   | Phone home              | Scan the QR with Expo Go (Android) or the Camera app (iOS). The **Credentials** tab: "No credentials yet" and the four tabs at the bottom                                                                                                                                                                | `s2-wallet-init-phone-home.png`   |
| 8   | Scan tab                | Tap **Scan**: "Scanning is coming soon" and its explanation                                                                                                                                                                                                                                              | `s2-wallet-init-tab-scan.png`     |
| 9   | History tab             | Tap **History**: "No activity yet" and its explanation                                                                                                                                                                                                                                                   | `s2-wallet-init-tab-history.png`  |
| 10  | Settings tab            | Tap **Settings**: Language (English selected), About → App version **0.1.0**, the **Diagnostics** link                                                                                                                                                                                                   | `s2-wallet-init-tab-settings.png` |
| 11  | Sinhala                 | Tap **සිංහල**: Settings and the tab labels in Sinhala (Noto Sans Sinhala). Switch back to English afterwards                                                                                                                                                                                              | `s2-wallet-init-sinhala.png`      |
| 12  | Diagnostics             | **Settings → Diagnostics**: tap **Run check** under **crypto-core check** (Pass, "5 of 5 disclosures decoded") and under **API reachability** (Pass, "Reachable: server status "ok" (HTTP 200)"). Capture both results; scroll so they fit, or the top half shows Hermes engine: On and the API base URL | `s2-wallet-init-diagnostics.png`  |
| 13  | iPhone home (optional)  | If an iPhone is available: the same project in Expo Go on iOS, Credentials tab                                                                                                                                                                                                                           | `s2-wallet-init-iphone-home.png`  |

If step 12's API check says "Not reachable", see the Troubleshooting table in
[wallet/README.md](../../../wallet/README.md); a screenshot of the failing state plus the fix is
good evidence for an "Issues and resolutions" entry in [sprint-2.md](../sprint-2.md).

## After the screenshots

- Record the phone model, OS version and the crypto-core check time (shown under the result) in
  [sprint-2.md](../sprint-2.md) (Fri 27 Nov entry, Evidence) and in its Testing evidence table.
- Stop Metro and the backend (Ctrl+C in each terminal).
