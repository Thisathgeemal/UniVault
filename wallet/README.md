# UniVault mobile wallet

The holder's app in the UniVault trust triangle: receives SD-JWT credentials from an issuer and
presents them, selectively disclosed, to a verifier. React Native + **Expo SDK 58** (React
Native 0.88.1, React 19.3.0, Expo Router 58), TypeScript **6.0.3** (the version Expo SDK 58
requires; the rest of the repository stays on 5.9.3, see CLAUDE.md and Decision 022).

**Status (27 Nov 2026):** application shell: four tabs with a stack each (Credentials, Scan,
History, Settings), header back and Android back handling, the shared component set, credential
status badges in the issuer portal's words, the "Navy and azure" design system
([docs/design/design-system.md](../docs/design/design-system.md): light/dark from the shared
tokens, Noto Sans + Noto Sans Sinhala, WCAG AA contrast tested in both themes), the saved
language preference, About, and the dev-only Diagnostics and UI kit.
Credentials and History show **synthetic sample data in development builds only**; credential
redemption, the vault, the camera and presentation follow in the next Sprint 2 tasks. Design
doc: [docs/frontend/mobile-wallet.md](../docs/frontend/mobile-wallet.md).

## Prerequisites

| Tool           | Version                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Node.js        | 22.22 or newer (the repository uses Node 26)                                                                           |
| npm            | 10 or newer                                                                                                            |
| Expo Go        | The current store version on the phone (Android or iOS). It must support **SDK 58**: Expo Go runs only the current SDK |
| Phone + laptop | On the **same Wi-Fi** (or use a tunnel, below)                                                                         |
| ngrok account  | Only for tunnel mode (`npm run start:tunnel`), see Troubleshooting                                                     |

No Android Studio or Xcode is needed for Expo Go. A development build (later, see
[docs/frontend/mobile-wallet.md](../docs/frontend/mobile-wallet.md) §12) will need them.

## Setup

From PowerShell (not Git Bash, see Troubleshooting):

```powershell
cd wallet
npm ci                                # exact versions from package-lock.json
Copy-Item .env.example .env           # then edit EXPO_PUBLIC_API_BASE_URL (next section)
npm start                             # builds crypto-core first, then Metro on :8081
```

Scan the QR code from the terminal with Expo Go (Android) or the Camera app (iOS).

`npm start` (and `test`, `typecheck`, `android`, `ios`) first runs `build:deps`, which builds
`../crypto-core` (the wallet uses its `dist/` output). The design tokens are read from the
source file `../portal-ui/src/tokens.ts`, so portal-ui needs no build.

## Reaching the backend from the phone

The phone cannot use `localhost`: on a phone, `localhost` is the phone itself.

1. Find the PC's LAN address: `ipconfig` in PowerShell → the **IPv4 Address** of the Wi-Fi
   adapter, e.g. `192.168.1.20`.
2. In `wallet/.env`:

   ```
   EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:4000/api/v1
   ```

3. Start the backend (`cd backend; npm run dev`). It already listens on **all network
   interfaces** (`app.listen(PORT)` without a host; its start-up line just prints
   `localhost`), so no backend change is needed.
4. Allow the ports through **Windows Firewall** (once, PowerShell as Administrator; Private
   network profile only):

   ```powershell
   New-NetFirewallRule -DisplayName "UniVault backend 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow -Profile Private
   New-NetFirewallRule -DisplayName "Expo Metro 8081"      -Direction Inbound -Protocol TCP -LocalPort 8081 -Action Allow -Profile Private
   ```

   The Wi-Fi network must be set to **Private** in Windows settings. To remove the rules later:
   `Remove-NetFirewallRule -DisplayName "UniVault backend 4000"` (and the Metro one).

5. Restart `npm start` after changing `.env` (values are read at bundle time). In the app:
   **Settings → Diagnostics → API reachability → Run check** should say "Reachable".

**Tunnel instead of LAN** (guest Wi-Fi, campus networks with client isolation): tunnel the
backend too, e.g. `ngrok http 4000`, and use its `https://…/api/v1` URL. Metro itself:
`npm run start:tunnel`.

**Later (credential offers from the phone):** the backend's `PUBLIC_BASE_URL` in `backend/.env`
must then use the same LAN address or tunnel (e.g. `http://192.168.1.20:4000`), because it is the
OpenID4VCI `credential_issuer` inside the QR code the phone scans.

**Everything `EXPO_PUBLIC_*` is visible in the app.** It is compiled into the JavaScript
bundle; never put a secret in one.

## Scripts

| Command                       | What it does                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `npm start`                   | Metro dev server on :8081 (LAN); scan the QR with Expo Go                      |
| `npm run start:tunnel`        | Same through an ngrok tunnel (`expo start --tunnel ngrok`, as in the spike)    |
| `npm run android` / `ios`     | Starts Metro and opens an Android emulator / iOS simulator, if installed       |
| `npm run typecheck`           | `tsc --noEmit` (TypeScript 6.0.3)                                              |
| `npm run lint`                | Root ESLint config on `wallet/`, 0 warnings allowed                            |
| `npm test`                    | Jest (jest-expo) + React Native Testing Library                                |
| `npm run test:coverage`       | Same with coverage; fails below 99 / 95 / 98 / 99 (stmts/branches/funcs/lines) |
| `npm run doctor`              | `npx expo-doctor`: SDK version alignment, config and dependency checks         |
| `npm run fixture:diagnostics` | Regenerates the synthetic SD-JWT used by Diagnostics (throwaway keys)          |
| `npm run art:placeholder`     | Regenerates the placeholder icon and splash PNGs from the design tokens        |

Formatting: `npm run format:check` from the repository root.

## Structure

```
wallet/
  index.ts                 entry: crypto setup FIRST, then expo-router/entry
  app.config.ts            name, slug, version, scheme, identifiers, permission texts, splash
  metro.config.js          linked crypto-core, tokens mapping, guards (see the file header)
  jest.config.js           jest-expo + .mjs transform + tokens mapping, coverage thresholds
  app/                     Expo Router routes (every path is in src/navigation/routes.ts)
    _layout.tsx            root Stack: i18n + saved language, safe areas, font, splash, toasts, ErrorBoundary
    index.tsx              / → /credentials
    +not-found.tsx
    (tabs)/_layout.tsx     Credentials · Scan · History · Settings (backBehavior firstRoute)
    (tabs)/credentials/    _layout (Stack), index (list), [id] (detail placeholder)
    (tabs)/scan/           _layout, index (placeholder; camera later)
    (tabs)/history/        _layout, index, [id] (placeholder)
    (tabs)/settings/       _layout, index, language, security (placeholder), about,
                           diagnostics (dev only), ui-kit (dev only)
  src/
    components/            Header, Button, Card, CredentialCard, StatusBadge, Badge, ListItem,
                           SectionHeader, LoadingState, EmptyState, ErrorState, OfflineNotice,
                           Toast, ConfirmDialog, Icon, Screen, AppText, ErrorBoundary
    credentials/           status.ts: backend status → wallet state (the one mapping)
    theme/                 the shared tokens (design names, light/dark); useTheme; contrast.ts
    i18n/                  i18next setup, languages, locales/en.ts, locales/si.ts (needs review)
    lib/                   crypto-setup, crypto-check, preferences (AsyncStorage), format (dates)
    navigation/            routes.ts (route table), tabs.ts, TabStack, stack-options (Header)
    services/              api-client (EXPO_PUBLIC_API_BASE_URL, GET /health)
    config/                env (API URL parsing), app-info (versions, __DEV__ gates)
    fixtures/              synthetic SD-JWT for Diagnostics; sample-data (dev builds only)
  assets/images/           placeholder icon, adaptive icon, splash marks (generated)
  assets/fonts/            NotoSansSinhala-OFL.txt (licence of the bundled font)
  scripts/                 fixture and artwork generators (Node, development only)
  test/                    Jest tests
```

## Storage rule

`@react-native-async-storage/async-storage` holds **UI preferences only** (today: the language,
key `univault.language`). It is unencrypted: never put a key, credential, SD-JWT, claim, token,
PIN or anything personal in it. Those go in secure storage (`expo-secure-store`) from the
holder-key and vault tasks. Every AsyncStorage key is listed in `src/lib/preferences.ts`.

## Design system

All UI follows [docs/design/design-system.md](../docs/design/design-system.md); every colour,
font, size and radius comes from `portal-ui/src/tokens.ts` through `src/theme` (never a hex value
in a component; tests fail otherwise). Status colours mean valid, expired, revoked and pending
only, each status shown as icon + word. One primary (azure) button per screen. The light/dark
theme follows the phone; there is no switch in the app.

## Developer screens

**Settings → Developer** (development builds only): **Diagnostics** (versions, crypto-core and
API checks) and **UI kit** (every component, variant and status in the current language and
colour scheme; switch the phone to dark mode to see the dark theme). Neither is reachable in a
release build.

## Identifiers

| Setting                | Value                |
| ---------------------- | -------------------- |
| `android.package`      | `lk.univault.wallet` |
| `ios.bundleIdentifier` | `lk.univault.wallet` |
| `scheme` (deep links)  | `univault://`        |
| `slug`                 | `univault-wallet`    |

Changing the package or bundle id after a store release creates a different app, so these are
fixed now.

## Troubleshooting

| Problem                                                                                                   | Fix                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expo Go: "Project is incompatible with this version of Expo Go" / SDK mismatch                            | Update Expo Go from the store. Expo Go runs only the **current** SDK (58); an older Expo Go cannot open this project, and a newer one needs the project upgraded (`npx expo install expo@latest --fix`, a separate task).                                               |
| Expo Go keeps loading, or "Could not connect to development server"                                       | Phone and PC on the same Wi-Fi? Windows Firewall must allow TCP **8081** (rule above) and the network must be **Private**. Campus/guest Wi-Fi often blocks device-to-device traffic: use `npm run start:tunnel`.                                                        |
| Diagnostics: API "Not reachable (NETWORK_ERROR)" or "TIMEOUT"                                             | Check `EXPO_PUBLIC_API_BASE_URL` (LAN IP, port 4000, ends in `/api/v1`), the backend is running, firewall rule for **4000**. Open `http://<LAN-IP>:4000/api/v1/health` in the phone's browser to test outside the app. Restart `npm start` after editing `.env`.        |
| `npm run start:tunnel`: "Couldn't create a signed tunnel URL… not logged in"                              | That is Expo's own tunnel. This script uses ngrok (`--tunnel ngrok`, the `@expo/ngrok` dev dependency), which works without an Expo login (Sprint 1, Issue 1). If ngrok asks for an auth token, sign up at ngrok and run `npx ngrok config add-authtoken <token>` once. |
| "Cannot find native binding" (lightningcss, @parcel/watcher, …)                                           | npm optional-dependency bug (npm/cli#4828): delete `node_modules` and `package-lock.json` in `wallet/`, run `npm install`. The Windows bindings are pinned in `optionalDependencies`.                                                                                   |
| Jest fails in every file, or Metro / `expo export` cannot resolve `@univault/crypto-core`, under Git Bash | Run tests, `npm start` and `expo export` from PowerShell or cmd (the drive path issue of Sprint 1, Issue 6).                                                                                                                                                            |
| Metro: "@univault/crypto-core/node is Node.js only"                                                       | Import `@univault/crypto-core` (the universal entry). The `./node` entry uses `node:crypto`.                                                                                                                                                                            |
| Metro or Jest cannot find `crypto-core/dist`                                                              | Run `npm run build:deps` (the `start` / `test` scripts do it automatically).                                                                                                                                                                                            |
