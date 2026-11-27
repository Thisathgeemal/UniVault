# Sprint 2: Mobile Wallet and Credential Issuance

| Item   | Detail                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------- |
| Dates  | Mon 23 Nov – Sat 28 Nov 2026                                                                               |
| Goal   | Holder can receive a signed SD-JWT credential into the mobile wallet from an issuer's QR offer and view it |
| Review | Sun 29 Nov 2026                                                                                            |

[Back to the dev-log index](README.md)

Sprint 1 carry-over work done in this sprint's dates (revoke and reissue, status endpoint, key
store, issuer portal) is logged in [sprint-1.md](sprint-1.md).

## Daily log

### Fri 27 Nov (wallet project initialised)

- **Done:** Mobile wallet initialised in `wallet/` (Decision 022, draft): **Expo SDK 58**
  (expo 58.1.0, React Native 0.88.1, React 19.3.0) with **Expo Router** (root Stack + four tabs:
  Credentials, Scan, History, Settings; `settings/diagnostics`; `+not-found`), TypeScript
  **6.0.3** in the wallet only (Expo SDK 58 requires `~6.0.3`; every other package stays on
  5.9.3; CLAUDE.md rule updated). Exact versions throughout (`npx expo install` for Expo
  packages); six Windows native bindings pinned in `optionalDependencies`; clean `npm ci`
  verified. App config: "UniVault" 0.1.0, scheme `univault`, `lk.univault.wallet` on Android
  and iOS, camera and Face ID permission texts, portrait, automatic light/dark, placeholder
  icon and splash drawn from the design tokens. Shared code: `@univault/crypto-core` via
  `file:` with build pre-hooks and a Metro config for the symlinked package (universal entry
  only; the Node entry is refused); Hermes setup (`getRandomValues` from expo-crypto, checks
  for TextEncoder/TextDecoder/BigInt). **Design tokens:** `portal-ui/src/tokens.ts` is now the
  single source, `theme.css` is generated from it (test checks they match; issuer portal CSS
  byte-identical), exported as `@univault/portal-ui/tokens` and consumed by `wallet/src/theme`.
  Themed, accessible components (Screen, Button, Card, StatusBadge, EmptyState, ErrorBoundary,
  AppText: roles, labels, 44 pt targets, dynamic type). English/Sinhala (i18next +
  expo-localization; Noto Sans Sinhala bundled with its OFL licence; `si.ts` needs
  native-speaker review). Diagnostics (dev builds only): versions, platform, Hermes, API URL,
  crypto-core check on a synthetic SD-JWT (5 of 5 disclosures), `GET /health`. Root ESLint
  covers the wallet (react, react-hooks, react-native, expo plugins). Wallet tests: **62**
  (8 files), coverage 98.61 / 93.71 / 96.96 / 100 (thresholds 98 / 93 / 96 / 99); portal-ui
  74 → **80** tests. expo-doctor 20/20; Metro bundles `index.ts` for Android (1,545 modules).
  Checked: the backend already binds to all interfaces (`app.listen(PORT)` without a host), so
  the phone can reach it on the LAN; no backend change.
- **Next:** Run the wallet on a real phone in Expo Go and take the evidence screenshots
  (`evidence/s2-wallet-init-guide.md`); supervisor review of Decision 022; wallet holder key
  (ES256) and secure storage; OpenID4VCI redemption (`POST /credential-offers/token`,
  `/credential`) calling `signCredential()`, then remove the dev-only simulate routes.
- **Blockers:** None.
- **Evidence:** `wallet/test/` (62 tests), `portal-ui/test/tokens.test.ts`, issuer-portal CSS
  hashes before/after (`index-CS6Xois6.css`, `vendor-BWIVbSOu.css` unchanged),
  [s2-wallet-init-guide.md](evidence/s2-wallet-init-guide.md) (screenshots to be taken).

### Fri 27 Nov (follow-up: tokens from source, audit note, evidence guide)

- **Done:** The wallet now reads the design tokens from the **source** file
  `portal-ui/src/tokens.ts` instead of `portal-ui/dist/tokens.js`, so a fresh clone works without
  building portal-ui first: Metro `resolveRequest`, tsconfig `paths`, Jest `moduleNameMapper` and
  `app.config.ts` (imports `../portal-ui/src/tokens.ts`; tsconfig gains
  `allowImportingTsExtensions`, allowed with Expo's `noEmit`); the artwork script loads it with
  Node's type stripping. `build:deps` builds crypto-core only. Proven with `portal-ui/dist`
  deleted: wallet typecheck, 62 tests, `npx expo export --platform android` (1,331 modules) and
  expo-doctor 20/20 all pass. **npm audit:** recorded that the wallet's 24 moderate findings are
  in the Expo toolchain and left as they are (backlog). Evidence guide rewritten as 13 steps.
- **Next:** Take the 13 screenshots; then as in the previous entry.
- **Blockers:** None.
- **Evidence:** the commands above with `portal-ui/dist` absent;
  [s2-wallet-init-guide.md](evidence/s2-wallet-init-guide.md).

### Fri 27 Nov (follow-up: silent wallet tests)

- **Done:** Removed the console warnings printed by the wallet tests (expo-router "Too many
  screens defined" / "No route named …", React "overlapping act() calls"): the cause was the
  **tests**, not the layouts (Issue 5). `test/app.test.tsx` now renders the **real `app/`
  directory** and checks every declared screen; one render per test; `clearMocks` on. New
  **console guard** in `test/setup.ts`: any unexpected `console.error` / `console.warn` fails the
  test (allow-list empty). `npm test` three times: 68/68, no console output; also clean with
  `--runInBand`. Wallet tests 62 → **68**; coverage unchanged (98.61 / 93.71 / 96.96 / 100).
- **Next:** As before (screenshots, holder key, redemption).
- **Blockers:** None.
- **Evidence:** `wallet/test/app.test.tsx`, `wallet/test/setup.ts`; three clean `npm test` runs.

## Backlog

- **Persist the language choice** once wallet storage exists (the credential vault task); until
  then the Settings choice lasts until the app restarts and the start language follows the
  phone.
- **npm audit: 24 moderate findings in the wallet** (27 Nov 2026; 0 high, 0 critical), all in
  the Expo toolchain: three advisories, in `glob` and `minimatch` (through Jest and
  `@expo/fingerprint`, the Expo CLI's build fingerprinting) and `uuid` 3.4.0 (through
  `@expo/ngrok`, the dev tunnel); the other 21 entries are the packages that depend on them.
  These are development-time tools, not code in the app bundle (`npm audit --omit=dev` still
  lists them only because npm counts the Expo CLI and expo-router's Jest peer as runtime). Not fixed on purpose: `npm audit fix` would move packages off the versions Expo
  tested for SDK 58 (expo-doctor would flag them), and `--force` would break the SDK alignment.
  Re-check with every Expo SDK update (`npm audit` in `wallet/`), and fix any finding that
  reaches the app bundle or a high/critical level at once.
- **EAS development build** (`expo-dev-client`) when push notifications or OS-level
  `openid-credential-offer://` links are scheduled (Decision 022).
- **Native-speaker review** of `wallet/src/i18n/locales/si.ts`.
- **Final app icon and splash** (the current ones are generated placeholders).

## Testing evidence

Record the tests that show the sprint goal is met, with links to output in `evidence/`.

| Test / check                         | Type (unit / integration / manual) | Result         | Evidence                                                    |
| ------------------------------------ | ---------------------------------- | -------------- | ----------------------------------------------------------- |
| Wallet unit and component tests      | unit / component (Jest + RNTL)     | 68 passed      | `wallet/test/`                                              |
| Expo SDK alignment and config checks | tooling (expo-doctor)              | 20/20 passed   | `npm run doctor`                                            |
| crypto-core on the phone (Hermes)    | manual (Expo Go, Diagnostics)      | to be recorded | [s2-wallet-init-guide.md](evidence/s2-wallet-init-guide.md) |

## Sprint review (Sun 29 Nov)

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

### What to change in Sprint 3

-

## Issues and resolutions

### Issue 1: Expo SDK 58 requires TypeScript 6, the repository pins 5.9.3 (27 Nov 2026)

- **Task:** Wallet project initialisation
- **Symptom:** The SDK 58 templates pin `typescript ~6.0.3`; the repository rule was 5.9.3
  everywhere.
- **Cause:** Expo's version registry (`api.expo.dev`, `relatedPackages`) lists
  `typescript ~6.0.3` for SDK 58; `npx expo install --check` and expo-doctor check against it.
  Expo Go runs only the current SDK, so an older SDK is not an option.
- **Resolution:** Stopped and asked; decision: TypeScript 6.0.3 in `wallet/` only, recorded in
  CLAUDE.md and Decision 022. Root lint (TypeScript 6.0.3, typescript-eslint 8.73.0, no
  type-aware rules) handles both versions.
- **Lesson:** Check the framework's version registry before pinning tool versions repo-wide.

### Issue 2: Generated theme.css added a `.ring` utility to the issuer portal (27 Nov 2026)

- **Task:** Design tokens as a TypeScript module
- **Symptom:** After adding `portal-ui/src/tokens.ts`, the issuer portal's built CSS grew by a
  `.ring` rule (hash changed).
- **Cause:** The portal's stylesheet has `@source '../../portal-ui/src'`, so Tailwind scanned the
  token file and treated the word `ring` (a colour name) as a class.
- **Resolution:** `@source not` for `tokens.ts` and `theme-css.ts` in
  `issuer-portal/src/index.css` (and in the generated header's usage note). Rebuilt: both CSS
  files byte-identical to the baseline.
- **Lesson:** Data files inside a Tailwind source folder can create utilities; compare build
  hashes, not just tests.

### Issue 3: expo-doctor reported duplicate React through the portal-ui link (27 Nov 2026)

- **Task:** Wallet shared tokens
- **Symptom:** `expo-doctor`: "Found duplicates for react: 19.3.0 (wallet) and 19.3.1
  (`..\portal-ui\node_modules`)", and the same for react-dom.
- **Cause:** portal-ui as a `file:` dependency exposed its own development install (React for
  its web tests). Metro never bundled it (block-listed), but expo-doctor scans the installed
  tree and has no exclusion for this check.
- **Resolution:** portal-ui is no longer an npm dependency of the wallet; the import
  `@univault/portal-ui/tokens` is mapped to the import-free tokens module by Metro, TypeScript
  `paths` and Jest `moduleNameMapper` (first `portal-ui/dist/tokens.js`; since the follow-up the
  source file `portal-ui/src/tokens.ts`, so no portal-ui build is needed). expo-doctor: 20/20.
- **Lesson:** A `file:` link brings the linked package's whole `node_modules` into view.

### Issue 4: Jest could not load the SD-JWT libraries through the crypto-core link (27 Nov 2026)

- **Task:** crypto-core check in Jest
- **Symptom:** First "Cannot find module '@babel/runtime/helpers/…' from
  ../crypto-core/node_modules/@noble/hashes", then "ESM syntax that could not be executed" for
  `@sd-jwt/core`, then for Expo Router's `standard-navigation`.
- **Cause:** Files reached through the symlink live outside `wallet/`, so the Babel helpers the
  transform injects were not resolvable there; `@sd-jwt/core` and `@owf/identity-common` ship
  `.mjs` only, which jest-expo's transform pattern (`.js/.ts(x)`) does not cover; and those
  packages were not in `transformIgnorePatterns`.
- **Resolution:** `modulePaths: ['<rootDir>/node_modules']`; the preset's own Babel transformer
  reused for `\.mjs$`; `@noble`, `@sd-jwt`, `@owf`, `@univault`, `standard-navigation` added to
  the transform allow-list. The same fixture now passes in Jest and Metro.
- **Lesson:** Reuse the preset's transformer entry; a bare `babel-jest` has no Expo Babel preset.

### Issue 5: Wallet tests passed but printed router and act() warnings (27 Nov 2026)

- **Task:** Wallet test hygiene
- **Symptom:** `npm test` passed (62/62) but printed expo-router "[Layout children]: Too many
  screens defined. Route `settings/diagnostics` is extraneous" (and `+not-found`), "No route
  named `(tabs)` exists in nested children: [ 'index' ]" (and two more), and React's "You seem
  to have overlapping act() calls" twice.
- **Cause:** The **tests**, not the app. All of it came from `test/app.test.tsx`: it rendered the
  real root layout (whose Stack declares `(tabs)`, `settings/diagnostics` and `+not-found`) with
  a partial route map: `_layout` + `(tabs)/index` in one test, `_layout` + `index` in the other.
  The second test also rendered twice in one test, which overlapped React's act scopes. The real
  layouts were correct: rendering the real `app/` directory gives no warning, and
  `npx expo export --platform android` bundles cleanly (layout warnings are runtime-only, so the
  render is the real check). The warnings were easy to miss because Jest hides per-file console
  output with parallel workers and piped output; `--runInBand` showed them.
- **Resolution:** `renderRouter(join(__dirname, '..', 'app'), …)` (the real route tree), a
  test per declared screen, the font tests split into one render each, `clearMocks: true`, and
  a console guard in `test/setup.ts` that fails a test on unexpected `console.error` /
  `console.warn` (proven with a throwaway probe test, then deleted). Also found: Metro /
  `expo export` cannot resolve the linked crypto-core under Git Bash (works in PowerShell),
  added to the wallet README.
- **Lesson:** A test route map must mirror `app/`; better, render the real directory. Fail on
  console output so warnings cannot pile up unseen.
