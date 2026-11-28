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

### Fri 27 Nov (wallet navigation and application shell)

- **Done:** Extended the initialised wallet (nothing rebuilt). **Navigation:** a Stack per tab
  (`credentials/` index + `[id]`, `scan/`, `history/` index + `[id]`, `settings/` index,
  language, security placeholder, about, diagnostics and the new ui-kit, both dev only); `/`
  redirects to `/credentials`; one typed route table `src/navigation/routes.ts` checked against
  `app/` (Expo Router typed routes left off: generated into git-ignored `.expo/types`); shared
  Header with back on every stack; `anchor: 'index'` so deep links keep the list; Android back:
  stack → Credentials tab → leave the app only from the Credentials root (`backBehavior:
'firstRoute'`, BackHandler simulated in tests); unknown routes and ids → not found.
  **Components:** Header, Button (primary / secondary / destructive / ghost, loading, disabled,
  icon), CredentialCard, StatusBadge (credential state), Badge (generic tone), ListItem,
  SectionHeader, LoadingState, ErrorState, Toast (FIFO, max 3), ConfirmDialog, Icon; EmptyState
  and Card kept. **Status:** `walletStatusFromBackend()` (valid → active, revoked, superseded →
  replaced, expired; anything else → notChecked) plus wallet-only notChecked / checking, each
  with its own icon and label; words copied from the issuer portal's `credentials.statuses` and
  `credentialTypes` (en + si) with a parity test. **Theme:** `darkSemanticColors` added to
  `portal-ui/src/tokens.ts` (not emitted to `theme.css`); `theme.css` and the issuer portal's
  built CSS byte-identical (SHA-256 before/after: `index-CS6Xois6.css` `4FCD3220…`,
  `vendor-BWIVbSOu.css` `29219633…`, `theme.css` `3A91F8AE…`); WCAG AA contrast test for 28
  colour pairs in light and dark (lowest 5.35:1 light, 7.18:1 dark). **Preferences:** AsyncStorage 2.2.0
  (`npx expo install`), language only (`univault.language`), applied under the splash screen
  before the first frame; storage rule documented. **Settings:** Language (radio group,
  saved, toast), About (version, Expo SDK, Noto Sans Sinhala OFL notice), Security placeholder,
  Developer section (dev only). **UI kit** (dev only; inline `__DEV__` gate, so its code is not in
  the release bundle). Synthetic sample credentials / history in dev builds only. Wallet tests
  68 → **223** (14 files), coverage 99.19 / 95.41 / 98.74 / 100, thresholds raised to
  99 / 95 / 98 / 99. portal-ui 80, issuer-portal 396 tests still pass. expo-doctor 20/20;
  `npx expo export --platform android`: 1,367 modules, no bundler warnings.
- **Next:** Screenshots ([s2-wallet-shell-guide.md](evidence/s2-wallet-shell-guide.md)) on a
  phone in Expo Go, light and dark, English and Sinhala, largest text size; native-speaker
  review of the new Sinhala strings; holder key (ES256) in secure storage; OpenID4VCI
  redemption; camera on the Scan tab.
- **Blockers:** None.
- **Evidence:** `wallet/test/` (223 tests), the CSS hashes above,
  [s2-wallet-shell-guide.md](evidence/s2-wallet-shell-guide.md) (screenshots to be taken).

### Fri 27 Nov (review answers; design system blocked on contrast)

- **Done:** Answers to the wallet-shell review. **Decision 023** recorded (wallet storage tiers:
  secure store for keys and the vault key, encrypted vault for credentials, AsyncStorage only
  for non-secret preferences; FR-WAL-03, NFR-08; Draft – review). **Decision 022** consequences
  now record the typed-route choice (one route table checked by `wallet/test/routes.test.tsx`,
  Expo Router typed routes off), accepted in review. **Issuer portal wording:** `superseded` is
  "Replaced" / "ප්‍රතිස්ථාපනය කළ" everywhere: holder page (`holders.statuses`) and dashboard
  card (`dashboard.cards.superseded.label`) changed, tests and the dashboard e2e expectation
  updated, backlog note removed. Sample data in the release bundle stays on the backlog.
- **Design system ("Navy and azure"):** NOT applied. The two source files
  (`docs/design/source/univault-tokens.css`, `univault-theme.ts`) agree on every value (31
  colours per theme, spacing, radii, sans stack). But light-theme pairs the design system uses
  fail WCAG AA: `text-subtle` on `bg` 4.43:1 and on `surface-sunken` 4.23:1 (placeholders in
  input fills); `focus-ring` on `brand` 2.98:1 and on `brand-hover` 2.23:1 (keyboard focus on
  the sidebar, including the active item); `accent-text` on `brand-soft` 4.35:1 and
  `text-subtle` on `brand-soft` 4.01:1 (links and timestamps in a selected table row). The brief
  says to stop rather than change a colour, so nothing in Part B was changed. Dark theme: every
  pair passes.
- **Next:** Decision on the failing light pairs; then Part B (tokens, portals, wallet, tests).
- **Blockers:** Contrast failures in the source palette (above).
- **Evidence:** contrast figures computed from `univault-theme.ts` (WCAG 2.2 formula, the
  same one as `wallet/src/theme/contrast.ts`).

### Fri 27 Nov (design system "Navy and azure" applied)

- **Done:** The three agreed contrast fixes, then the design system in every app (Decision 024,
  [design-system.md](../design/design-system.md)). **Tokens:** every value in
  `portal-ui/src/tokens.ts` under the design-system names (light + dark, usage tokens
  `focus-ring-on-brand` = on-brand and `accent-text-on-soft` = accent-hover, `text-subtle`
  #5B6B80 in light, status sets, component token sets for the offline notice and the disclosure
  panel, type scale and per-weight font names from `univault-theme.ts`, JetBrains Mono from
  `univault-tokens.css`); `theme.css` regenerated as `:root` variables (`--brand`) + Tailwind
  utilities with the same names (`bg-brand`, `text-text-muted`); `docs/design/source/` deleted;
  old token names removed everywhere; a test fails on any hex colour outside tokens.ts (QrCode's
  black/white became `fill-text` / `fill-surface`). **Status:** four sets, an icon and a word per
  status in portal and wallet (Valid / circle-check, Expired / clock, Revoked / ban, Awaiting
  wallet / hourglass, Replaced / pending colours + swap, wallet Not checked yet / expired colours
  - offline, Checking… / pending colours + refresh); "Valid" (වලංගුයි) replaces "Active"; label
    parity test still passes. **Portals:** navy top bar with the role tag as an `AppShell` prop
    ("Issuer portal" + certificate), navy 240 px sidebar (active: brand-hover fill, on-brand label,
    3 px on-brand bar), pages on bg / surface / surface-sunken table heads, Button kinds primary /
    secondary / text / destructive / onBrand (min 40 px, radius-md), design type steps, Noto Sans +
    Noto Sans Sinhala + JetBrains Mono self-hosted (@fontsource 5.3.0); one primary per page:
    **Credentials** and **Holders** empty states demoted their repeated primary link to secondary.
    **Wallet:** same names in light and dark, brand header on the Credentials home (light status
    bar while focused), navy credential cards (radius-lg, badge in its own pill), surface tab bar
    with the active tab in accent, Button kinds (44 pt), `OfflineNotice`, disclosure panel tokens in
    the UI kit, Noto Sans + Noto Sans Sinhala imported per weight (5 font files; Issue 10), mono =
    system monospace on Diagnostics only; Diagnostics' second "Run check" demoted to secondary.
    **Contrast:** 74 pairs (light) and 73 (dark) checked, all pass; lowest text 4.58:1 light
    (text-subtle on brand-soft) and 4.90:1 dark (text-subtle on surface), lowest border/icon/focus
    3.08:1 light and 3.24:1 dark (border-strong); dark text-subtle on brand-soft is 4.04:1, so the
    wallet uses text-muted on brand-soft (Issue 9). Also Decision 023's secure-store wording
    replaced with the cited Expo statement. Tests: portal-ui 80 → **97**, issuer-portal 396 →
    **424** (+ 10 e2e), wallet 223 → **343**; coverage portal-ui 100 / 98.73 / 100 / 100,
    issuer-portal 97.56 / 92.2 / 98.02 / 98.57, wallet 99.06 / 95.61 / 98.28 / 99.79. expo-doctor
    20/20; Metro Android bundle 1,366 modules, no warnings.
- **Next:** Supervisor review of Decisions 023 and 024 and of the dark text-subtle restriction;
  native-speaker review of the new Sinhala strings (role tag, "Not checked yet", UI kit labels);
  screenshots from the final list; holder key and redemption.
- **Blockers:** None.
- **Evidence:** `portal-ui/test/tokens.test.ts`, `issuer-portal/test/design-system.test.tsx`,
  `wallet/test/contrast.test.ts`, `wallet/test/design-system.test.tsx`; e2e 10 passed.

### Sat 28 Nov (wallet onboarding, the security gate and the Appearance setting)

- **Done:** **Appearance** (Settings → Appearance, below Language): "Use device setting"
  (default), "Light", "Dark" (Sinhala පෙනුම: උපාංග සැකසුම භාවිත කරන්න / ආලෝක / අඳුරු, for native
  review); saved as `univault.appearance` and restored with the language before the first frame
  (`restoreAppState()`); the effective scheme (choice, or the phone for "Use device setting", live)
  drives `useTheme()`, so screens, header, tab bar, dialogs and toasts change at once; navigation
  theme and the root view colour (`expo-system-ui`) follow; native UI via
  `Appearance.setColorScheme()`; the Settings row shows the value. **Status bar:** one computed
  `<StatusBar>` (light content on the navy home header in both themes, else by theme), replacing
  the imperative `setStatusBarStyle` calls. **Onboarding** (`app/onboarding/`): language (large
  English / සිංහල options, applied at once) → welcome → how it works (issuer → holder → verifier
  drawing) → you choose what to share (over-18 example) → your wallet is protected → your privacy
  ("I understand" required before "Set up security"; "Privacy details" static screen); Next /
  Back, horizontal swipe, Skip to Privacy (never past it), progress dots with "Step X of 6" for
  screen readers (progressbar + live region), Android back exits on step 1 and goes to the
  previous step after it, reduce motion turns stack transitions (and the dialog fade) off; simple
  original SVG illustrations (`react-native-svg` 15.16.0 via `npx expo install`) in on-brand
  tokens on a navy panel. **Gate** (`src/onboarding/gate.ts`, applied by `index`, `(tabs)`,
  `onboarding` and `setup` layouts): not onboarded → onboarding; onboarded without security →
  `/setup/security`; both → tabs; typed URLs and deep links redirected the same way; onboarding
  counts only with an acknowledgement of the current privacy text (`privacy-v1`, stored with the
  date as `univault.privacyAcknowledgedAt`). `isSecuritySetupComplete()` is the one security
  check, a placeholder on the `univault.securitySetupCompleted` preference until the PIN task
  (`/setup/security` "Set up your PIN" placeholder; its Continue button is development-only and
  stripped from release bundles). **Diagnostics → Reset onboarding** (dev only, ConfirmDialog;
  keeps language and appearance); Diagnostics now gated inline (`!__DEV__ || …`), so its checks
  are dropped from release bundles too. New components `ChoiceList` (Language, Appearance,
  onboarding) and `Checkbox`. Contrast: 83 pairs in light and 82 in dark (illustration lines,
  progress dots, checkbox), lowest unchanged. Docs: mobile-wallet.md §7, §9 (preference keys
  table), §15 (flow, gate, screens); design-system.md (onboarding illustrations, Appearance, and
  "status-*-bg pill" → "badge (radius-sm)"); Decision 023 consequences (privacy acknowledgement,
  no skipping security setup; no new decision). Wallet tests 343 → **473** (17 files), coverage
  99.54 / 95.93 / 99.32 / 99.87 (functions threshold raised 98 → 99). expo-doctor 20/20; Metro
  Android bundle 1,505 modules; root lint 0 warnings, format and secrets checks pass.
- **Next:** Wording review of the onboarding text and native-speaker review of its Sinhala
  (about 70 new strings); screenshots ([s2-wallet-onboarding-guide.md](evidence/s2-wallet-onboarding-guide.md));
  the PIN and biometric task replaces `isSecuritySetupComplete()` and the placeholder flag.
- **Blockers:** None.
- **Evidence:** `wallet/test/onboarding.test.tsx` (83), `wallet/test/appearance.test.tsx` (19),
  `wallet/test/preferences.test.tsx` (storage rule over all five keys),
  [s2-wallet-onboarding-guide.md](evidence/s2-wallet-onboarding-guide.md) (screenshots to be
  taken).

### Sat 28 Nov (wallet PIN, and the wallet typography and layout pass)

- **Done:** **PIN** (Decision 025, draft; [wallet-pin.md](../security/wallet-pin.md)):
  `/setup/security` is now the PIN flow: intro ("Create a 6-digit PIN. You'll use it to open
  UniVault and approve every share.") → create → confirm → "PIN set" → Continue →
  `stepAfterPinCreated()` (the biometric task's hook; today it completes setup and the gate opens
  the tabs). Weak PINs refused (all the same, consecutive incl. wrapping, repeated blocks,
  counting pairs, mirrored, 23 common keypad/number patterns: 2,053 of 1,000,000); mismatch
  message and cleared entry, back to create after 3 ("Let's start again"). `PinPad`: six dots
  announced as "3 of 6 digits entered", 1–9 / 0 / Delete, 56 pt keys, no system keyboard, shake
  on error unless reduce motion. Storage: a `{ v: 1, alg: "scrypt", params, salt, hash }` verifier
  (scrypt N 2^12, r 8, p 1, 4 MiB; 16-byte salt from expo-crypto; `@noble/hashes` 2.4.0 pinned in
  the wallet) in `expo-secure-store` 58.0.3 with `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and no OS prompt,
  excluded from Android backup (secure-store config plugin); `verifyPin` re-derives with the
  stored parameters, constant-time compare, never throws; a separate `{ failedAttempts,
lockedUntil }` record with helpers for app lock. The PIN is cleared from state at once and
  never logged, put in route params, errors or storage (a test searches all of them). Screen
  capture blocked on the PIN screen in release builds only (`expo-screen-capture` 58.0.6). Gate:
  `isSecuritySetupComplete()` = a valid verifier exists (awaited under the splash: no tab flash);
  the placeholder preference and the dev-only Continue button are gone. Diagnostics: **PIN
  hashing time** (one derivation with the defaults on random data) and Reset onboarding now
  deletes the PIN data. **KDF choice:** 15 ms on the PC (V8); Hermes on a mid-range Android
  estimated 10–40× slower, so about 150–600 ms; to be measured on the phone. **Typography and
  layout pass** (design-system.md "Wallet typography and layout", mobile-wallet.md §17 lists every
  change per screen): muted text is 14, button labels 16/600, section headings h3 with `Section`
  grouping, screens space-4 / space-6 / 560 pt, list rows 56 pt with field labels above values,
  states and lists left-aligned, onboarding hero headings centred and buttons full width and
  stacked in `BottomActions`; a test checks the rules on every route. Wallet tests 473 → **599**
  (20 files), coverage 99.56 / 96.27 / 99.43 / 99.9 (branches threshold raised 95 → 96).
  expo-doctor 20/20; Metro Android bundle 1,523 modules (dev-only PIN-hashing card and Reset
  absent from it); root lint 0 warnings, format and secrets checks pass.
- **Next:** Measure **PIN hashing time** on a mid-range Android phone and tune N (wallet-pin.md
  §5); check the common-PIN list against the cited studies; native-speaker review of the new
  Sinhala strings (about 30); screenshots ([s2-wallet-pin-guide.md](evidence/s2-wallet-pin-guide.md));
  biometric setup at the hook; app lock with the attempt policy.
- **Blockers:** None.
- **Evidence:** `wallet/test/pin-rules.test.ts` (60), `pin.test.ts` (21), `pin-flow.test.tsx`
  (24), `design-system.test.tsx` (38, typography per route),
  [s2-wallet-pin-guide.md](evidence/s2-wallet-pin-guide.md) (screenshots to be taken).

### Sat 28 Nov (follow-up: Appearance option "Automatic")

- **Done:** Settings → Appearance: "Use device setting" renamed **"Automatic"** (Sinhala
  ස්වයංක්‍රීය), with the helper line "Matches your phone's light or dark mode." (ඔබේ දුරකථනයේ ආලෝකමත්
  හෝ අඳුරු ආකාරයට ගැලපේ.) under it on the Appearance screen only (`ChoiceList` gained an optional
  `description`: 14, text-muted, on-accent when selected, read as the option's hint). Sinhala
  "Light" is now ආලෝකමත් (was ආලෝක; also in the UI kit's light-mode intro). Order Automatic,
  Light, Dark; Automatic stays the default; the stored value stays `system`, so saved choices keep
  working (new test). The Settings row shows "Automatic" / ස්වයංක්‍රීය. Wallet tests 599 → **603**.
  Docs: mobile-wallet.md §7 and the preference keys table, design-system.md, CLAUDE.md, README,
  evidence guides.
- **Next:** Native-speaker review of ස්වයංක්‍රීය, ආලෝකමත් and the helper line.
- **Blockers:** None.
- **Evidence:** `wallet/test/appearance.test.tsx` (23).

### Sat 28 Nov (wallet UI refinements: header, onboarding visuals, Appearance, PIN states)

- **Done:** **Appearance**: exactly Automatic / Light / Dark (ස්වයංක්‍රීය / ආලෝකමත් / අඳුරු), no
  helper line (the one added earlier today was removed; `ChoiceList` lost its `description` and
  `size` options); stored `system` unchanged and tested. **Header and headings** (final sizes):
  the header bar is taller (space-4 above / space-3 below the title on tab roots, space-2 / space-2
  on detail screens, side padding space-4); every heading one step smaller than this morning:
  header titles h2 20 on roots and h3 16 on detail screens, screen titles h2, onboarding and setup
  heroes h2 (incl. "PIN set"), empty / error state and dialog titles h3; body text unchanged
  (16 / 26, secondary 14, captions 12); weight 600 in both scripts. **Onboarding**: one visual
  language on all six steps: one illustration in a brand-soft area (radius-lg, same size), centred
  h2 hero and centred short lead text (≤ 320 pt), then numbered rows (How it works: accent number
  circle, bold title, short muted sentence) or icon rows (security, privacy); new original
  drawings in text outlines, surface fills, small navy details and accent arrows, readable in both
  themes (How it works: building → phone with a credential card → person at a counter, with role
  labels); calm language step (h2, 14 muted note, 16 pt options in 56 pt rows); welcome text
  centred; a 220 ms fade-in only with reduce motion off (the setting is now cached so a new step
  never starts a forbidden fade). **PIN pad**: the position left of 0 is an invisible spacer (no
  border, the old style had lost its transparent border colour and drew a black outline; not
  focusable or announced). **PIN processing state**: on a match the confirm screen stays, keypad
  disabled, spinner + "Saving your PIN…" announced, at least 600 ms, UI drawn before scrypt starts
  (`yieldToUi`, `withMinimumDuration`, `ProcessingState`); "PIN set" only after the save; a failed
  save shows the error with Try again. `PinCheck` (the PIN prompt for app lock) uses the same
  pattern with "Checking your PIN…". Contrast: 87 pairs light / 86 dark (new illustration and row
  pairs), all pass. Wallet tests 603 → **631**; coverage 99.58 / 96.54 / 99.47 / 99.9.
- **Next:** Screenshots of the new onboarding (light, dark, Sinhala, largest text) and of the
  saving state; native-speaker review of the new Sinhala strings; wire `PinCheck` into app lock.
- **Blockers:** None.
- **Evidence:** `wallet/test/onboarding.test.tsx` (91), `pin-flow.test.tsx` (31),
  `design-system.test.tsx` (40), `appearance.test.tsx` (23).

### Sat 28 Nov (biometric unlock with PIN fallback)

- **Done:** Decision 026 (draft), [wallet-authentication.md](../security/wallet-authentication.md).
  `expo-local-authentication` 58.0.3 (`npx expo install`, pinned). **Capability**
  (`src/security/biometrics.ts`): available-strong / available-weak-only / not-enrolled /
  no-hardware / unsupported-in-expo-go (iOS Expo Go), named "fingerprint", "face recognition" or
  "fingerprint or face"; only strong may be enabled. **OS-enforced unlock:** enabling stores a
  random 32-byte secret in expo-secure-store with `requireAuthentication: true` and this-device-only
  (plus a separate `biometricEnabled` flag); unlock = the OS releasing it (checked in
  expo-secure-store's native code: Android BiometricPrompt BIOMETRIC_STRONG + Keystore CryptoObject,
  iOS Keychain `.biometryCurrentSet`; no device passcode on either); `authenticateAsync()` is never
  used as proof; a null read (key invalidated) or no strong biometric any more turns it off with
  "Your fingerprint settings changed…". **`authenticate({ reason })`** with an
  `AuthenticationProvider` in the root layout: one OS prompt, then a full-screen PIN prompt
  (PinCheck, one "Use fingerprint" retry, Cancel), attempt limits on the secure-store record (4
  free, then 30 s, 1 min, 5 min, 15 min, 1 h; survives restarts; reset on success; countdown
  announced at most every 10 s). **Setup step** `/setup/biometrics` ("Use fingerprint to unlock?",
  Turn on / Not now) only for strong phones; otherwise "PIN set" says why. **Settings → Security**
  replaces the placeholder: a token-styled `Toggle` (RN's Switch logged a native-command error in
  Jest when a cancelled change snapped back), status line, Test unlock (every build), Change PIN
  "Coming soon". Onboarding privacy gained "Your fingerprint or face data never leaves your
  phone."; Reset onboarding also removes the unlock secret. Contrast 91 / 90 pairs (Toggle).
  Wallet tests 631 → **687** (21 files); coverage 99.39 / 96.42 / 99.31 / 99.77.
- **Next:** Test on an Android phone in Expo Go (fingerprint on, Test unlock, cancel → PIN, add a
  fingerprint → invalidation message, lockout) and on an iPhone with a development build;
  native-speaker review of about 50 new Sinhala strings; app lock calls `authenticate()`.
- **Blockers:** None.
- **Evidence:** `wallet/test/biometrics.test.tsx` (48),
  [s2-wallet-biometrics-guide.md](evidence/s2-wallet-biometrics-guide.md) (screenshots to be taken).

### Sat 28 Nov (follow-up: shared-biometrics notice)

- **Done:** The platform limitation stated in the UI: the setup step "Use fingerprint to unlock?"
  shows "Anyone whose fingerprint is saved on this phone will be able to unlock UniVault. Only turn
  this on if every fingerprint on this phone is yours." above the buttons (face and
  fingerprint-or-face wordings too; Turn on and Not now equally full width); Settings → Security
  shows it under the switch with "You can always use your PIN only." (`SharedBiometricNotice`,
  brand-soft panel). Sinhala lockout messages now "වැරදි උත්සාහ වැඩියි. තත්පර {{seconds}} කින් නැවත
  උත්සාහ කරන්න." with minute and new hour variants (English gained "Try again in 1 hour."; the
  placeholders are `{{seconds}}` / `{{minutes}}` / `{{hours}}` in both languages).
  wallet-authentication.md §8 "Known limitations"; Decision 026 consequence. Wallet tests 687 →
  **692**.
- **Next:** Native-speaker review of the notice and lockout wording.
- **Blockers:** None.
- **Evidence:** `wallet/test/biometrics.test.tsx` (53).

### Sat 28 Nov (follow-up: weak face unlock message)

- **Done:** On weak-only phones with face unlock, Settings → Security and "PIN set" now say
  "This phone's face unlock uses the camera and isn't secure enough for UniVault. You can use your
  PIN." ("…your fingerprint or your PIN." when a strong fingerprint is enrolled; Sinhala for
  review). `BiometricCapability` gained `fingerprintEnrolled` (a fingerprint at the strong level:
  expo-local-authentication reports only the strongest enrolled class, so on a weak-only phone the
  PIN wording is the one that appears); `unavailableMessageKey()` picks the line. A strong vs weak
  table in wallet-authentication.md §2. Wallet tests 692 → **697**.
- **Next:** Check the message on a phone with 2D face unlock only.
- **Blockers:** None.
- **Evidence:** `wallet/test/biometrics.test.tsx` (58).

### Sat 28 Nov (automatic wallet lock and re-authentication)

- **Done:** `LockProvider` (`src/security/app-lock.tsx`) in the root layout around the navigator:
  the locked state in memory only, locked on app start once setup is complete (never in
  onboarding or setup), `lock(reason)` / `unlock()` (= `authenticate()`, ok only), `onLock`
  listeners (for the vault), `lastLockReason` in Diagnostics. **AppState rule:** only 'background'
  arms the lock (never 'inactive'); on 'active' it locks when away ≥ "Lock after leaving the app"
  (Immediately default, 30 s, 1 min, 5 min; `univault.lockDelay` preference), when the clock went
  backwards or the time is unknown; our own prompts never arm it (`withAuthActivity` around
  `authenticate()` and biometric enrolment). **Privacy cover** (navy + mark) whenever the app is
  not active, in every build. **Lock screen** above the mounted navigator (hidden from
  accessibility, no touches): "UniVault is locked" / "Unlock to continue", Unlock (primary), Use
  PIN (only with biometric unlock), one automatic prompt per lock (no loops), the PIN lockout
  countdown, Android back leaves the app, deep links shown after unlock. Settings → Security:
  "Lock after leaving the app" (choice screen) and "Lock now". Test seam: `lockOnAppStart`
  (other test files start unlocked). Wallet tests 697 → **720** (22 files); coverage 99.4 / 96.43 /
  99.19 / 99.8.
- **Next:** Check on Android and iOS: app switcher preview (cover), shade does not lock, delay
  timing, the fingerprint prompt not re-locking; native-speaker review of the lock strings.
- **Blockers:** None.
- **Evidence:** `wallet/test/app-lock.test.tsx` (23),
  [s2-wallet-applock-guide.md](evidence/s2-wallet-applock-guide.md) (screenshots to be taken).

### Sat 28 Nov (follow-up: app lock exemption window and the recents snapshot)

- **Done:** **Security fix:** the "authentication in progress" exemption now applies only to
  absences of at most `authExemptionMs(delay)` = min(lock delay, 30 s), measured from
  `'background'` (30 s for Immediately). After a longer absence the app locks and the open
  prompt is dismissed (`useAuthControl().dismissPrompts()` in `AuthenticationProvider`: resolved
  as cancelled, no PIN checked so no failed attempt; an authentication at its OS biometric step
  or still loading resolves as cancelled too). Every prompt that resolves re-checks
  (`onAuthActivityEnd` in `auth-activity.ts`), so a cancel while the app is still away never
  reveals the wallet; the lock screen's own prompt is left alone. **Recents snapshot:** release
  builds block screen capture for the whole wallet (`useAppScreenCaptureBlock()`, key
  `univault-app`; Android `FLAG_SECURE` blanks the recents card even when the snapshot comes
  before `'background'`); Diagnostics (dev) → "Screen capture" → "Block screenshots and recents
  preview" (off by default, memory only); iOS keeps the navy cover. The `expo-screen-capture`
  Jest mock moved into `test/setup.ts` (setup now loads `screen-capture.ts`, so a per-file mock
  came too late). Wallet tests 720 → **730** (app-lock 23 → 33); coverage 99.31 / 96.42 / 99.22 /
  99.8 (thresholds 99 / 96 / 99 / 99).
- **Next:** On an Android release build: recents card blank, screenshots refused; on Android Expo
  Go: the switch blanks the card; a fingerprint sheet that reports `'background'` does not lock;
  native-speaker review of the three new Sinhala strings (Diagnostics, dev only).
- **Blockers:** None.
- **Evidence:** `wallet/test/app-lock.test.tsx` (33).

### Sat 28 Nov (wallet UI: one-navy lock screen, PIN success, swipe-to-dismiss toasts)

- **Done:** **Lock screen** is one `brand` surface like the privacy cover: mark, "UniVault is
  locked" / "Unlock to continue" and the lockout countdown centred as one group in on-brand /
  on-brand-muted, the buttons at the bottom on the navy (`BottomActions tone="brand"`, bottom
  inset). New Button kinds **`inverse`** (on-brand fill, brand label: primary on navy, full-navy
  screens only) and **`textOnBrand`** (Use PIN); every Button draws a 2 pt focus ring 2 pt outside
  its edge, `focus-ring-on-brand` for the navy kinds. Contrast (both themes, in the test): inverse
  label 15.39:1 light / 10.83:1 dark, fill edge on navy the same, text on brand 15.39 / 10.83; all
  pass. Light status-bar icons on the lock screen in both themes. **PIN setup:** the keypad goes
  on a match and a full-screen "Securing your PIN…" (≥ 600 ms) replaces the inline "Saving your
  PIN…"; then `SuccessState` (circle-check in status-valid on a status-valid-bg circle, "PIN set"
  announced, "You'll use this PIN to open UniVault and approve every share.", Continue; scale-in
  unless reduce motion); a failed save goes back to Create PIN with "Something went wrong. Please
  create your PIN again." (Try again removed). **Fingerprint setup:** same pattern ("Turning on
  unlock with fingerprint…" → "Unlock with fingerprint is on" → Continue; the toast there
  removed). **Toasts:** swipe left / right to dismiss (follows the finger; past 35 % of the width
  or a flick ≥ 800 pt/s, else springs back), timer paused while touched, close button kept, a
  screen-reader "dismiss" action, reduce motion without slide or spring, every dismissal path
  once only. `react-native-gesture-handler` 3.3.0, `react-native-reanimated` 4.7.1,
  `react-native-worklets` 0.13.0 via `npx expo install` (the SDK 58 / Expo Go versions; pinned;
  the worklets Babel plugin comes from babel-preset-expo; `GestureHandlerRootView` in the root
  layout); a small reanimated Jest mock (`test/mocks/reanimated.ts`, Issue 16). UI kit: the two
  navy kinds on navy panels and a swipe hint by "Show a toast". Wallet tests 730 → **765** (23
  files); coverage 99.34 / 96.47 / 99.25 / 99.87.
- **Next:** Try the swipe and the lock screen in Expo Go on Android and iOS (gesture feel, the
  flick speed); native-speaker review of the new Sinhala strings (setup progress / success, UI kit
  labels, the swipe hint).
- **Blockers:** None.
- **Evidence:** `wallet/test/toast.test.tsx` (13), `appearance.test.tsx` (lock screen in both
  themes), `pin-flow.test.tsx`, `biometrics.test.tsx`, `contrast.test.ts`.

### Sat 28 Nov (consistency: navy headers, status colours only for status, PIN checking)

- **Done:** **Navy header on every tab:** the four tab roots and every screen inside a tab
  (credential and history detail, every Settings screen, Diagnostics, UI kit) use the `brand`
  header, set once in the tab stacks' shared options (`useStackScreenOptions('brand')` in
  `TabStack`; the per-screen `brandHeader` flag is gone); compact with an on-brand back arrow
  inside a tab, on-brand actions, focus ring `focus-ring-on-brand` on the header buttons. The
  header itself gives light status-bar icons while its screen is focused
  (`useBrandStatusBarWhileFocused`, replacing the Credentials home's own `useBrandStatusBar()`);
  onboarding, setup, the lock screen and "not found" unchanged. UI kit: navy root / compact and
  the surface header (outside the tabs). **Status colours only for status:** the success state
  ("PIN set", fingerprint on) now has an accent circle-check in a brand-soft circle; audit of the
  wallet, portal-ui and issuer portal: replaced the portal-ui success toast (status-valid edge /
  fill / text → accent edge, brand-soft, text), the issuer portal's "Accepted by the holder's
  wallet" check (status-valid → accent in a brand-soft circle) and the reissue table's changed-row
  highlight (status-expired-bg / -text → brand-soft / text); kept: status badges, the dashboard
  bar, the offer countdown's last minute and the expired offer (expired colours for an offer's
  status), "expiring soon" in the credentials table, errors, invalid fields and destructive
  actions (revoked), the offline notice, Diagnostics pass / fail. New allow-list tests
  (`wallet/test/status-colours.test.ts`, `portal-ui/test/tokens.test.ts`). **PIN checking:**
  `PinCheck` is now the whole shared flow (title, reason, keypad, full-screen "Checking your
  PIN…" ≥ 400 ms with no Cancel and Back ignored, correct → straight on, wrong → digits cleared +
  shake + "That PIN isn't right. Try again." + "2 / 1 attempts left before a short wait.", the
  limit → straight to the countdown, announcements); `PinPrompt` is a modal around it, used by
  the lock screen, Test unlock and turning biometric unlock off. Wallet tests 765 → **810** (25
  files); coverage 99.36 / 96.18 / 99.26 / 99.88. portal-ui 97 → **101**; issuer portal 424
  (two tests extended).
- **Next:** Check the navy headers and light icons on both phones (Android Expo Go, iOS dev
  build); native-speaker review of the new Sinhala strings (wrong PIN, attempts left, PIN
  correct, the UI kit header captions).
- **Blockers:** None.
- **Evidence:** `wallet/test/design-system.test.tsx` (header on every tab route),
  `appearance.test.tsx` (status bar), `pin-check.test.tsx` (16), `status-colours.test.ts` (11),
  `portal-ui/test/tokens.test.ts`.

## Backlog

- **Sample data in the release bundle:** `src/fixtures/sample-data.ts` (synthetic, never shown
  in a release build) is still bundled because the list screens import it; remove it when the
  vault provides real credentials.
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
- **Native-speaker review** of `wallet/src/i18n/locales/si.ts` (27 Nov: about 110 new strings
  for the shell, UI kit included; 28 Nov: about 70 more for onboarding, setup, Appearance and
  Reset onboarding, including "Step X of Y" = "පියවර Y න් X වැන්න").
- **"Change PIN"** in Settings → Security (shown as "Coming soon"; requires the current PIN via
  `authenticate({ pinOnly: true })`, then `savePin()` with a new salt; clears the attempt record).
- **Auto-lock after inactivity while the app stays open** (no touches for N minutes in the
  foreground); today the app locks only after leaving it, on start, or with Lock now.
- **Wipe after N failed PINs** (Decision 026 future work): needs a recovery story (re-issuance)
  first.
- **"Use PIN" label on the OS prompt:** expo-secure-store's prompt has a fixed system Cancel
  button; revisit if a later version exposes the negative-button text.
- **KDF parameters on a real phone:** record Diagnostics → PIN hashing time on a mid-range Android
  (and an iPhone if available) and tune `DEFAULT_KDF_PARAMS` (wallet-pin.md §5); consider re-hashing
  old verifiers after a successful unlock (app-lock task).
- **Common-PIN list:** compare `COMMON_PINS` with the published lists (Markert et al. 2020; Wang et
  al. 2017) before release.
- **Final app icon and splash** (the current ones are generated placeholders).

## Testing evidence

Record the tests that show the sprint goal is met, with links to output in `evidence/`.

| Test / check                         | Type (unit / integration / manual)           | Result         | Evidence                                                                          |
| ------------------------------------ | -------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| Wallet unit and component tests      | unit / component (Jest + RNTL)               | 810 passed     |
| Shared PIN check flow                | component (all PIN entry points)             | 16 passed      | `wallet/test/pin-check.test.tsx`                                                  |
| Status colours only for status       | unit (source scan, wallet and portals)       | passed         | `wallet/test/status-colours.test.ts`, `portal-ui/test/tokens.test.ts`             |
| App lock and re-authentication       | component (mocked AppState, fake clock)      | 33 passed      | `wallet/test/app-lock.test.tsx`                                                   |
| Swipe-to-dismiss toasts              | component (gesture-handler test utilities)   | 13 passed      | `wallet/test/toast.test.tsx`                                                      |
| Biometric unlock and PIN fallback    | unit / component (mocked OS prompt)          | 59 passed      | `wallet/test/biometrics.test.tsx`                                                 |
| Biometrics on real phones            | manual (Android Expo Go; iOS dev build)      | to be recorded | [s2-wallet-biometrics-guide.md](evidence/s2-wallet-biometrics-guide.md)           | `wallet/test/` |
| Onboarding gate and flows            | component (real `app/` tree)                 | 83 passed      | `wallet/test/onboarding.test.tsx`                                                 |
| Appearance setting and status bar    | component (simulated system changes)         | 23 passed      | `wallet/test/appearance.test.tsx`                                                 |
| Onboarding on the phone              | manual (Expo Go)                             | to be recorded | [s2-wallet-onboarding-guide.md](evidence/s2-wallet-onboarding-guide.md)           |
| PIN rules, verifier, flow, secrecy   | unit / component (Jest + RNTL)               | 105 passed     | `wallet/test/pin-rules.test.ts`, `pin.test.ts`, `pin-flow.test.tsx`               |
| PIN hashing time on a phone          | manual (Diagnostics, dev build)              | to be recorded | [s2-wallet-pin-guide.md](evidence/s2-wallet-pin-guide.md)                         |
| Wallet status words = issuer portal  | unit (parity test, en + si)                  | passed         | `wallet/test/status.test.tsx`                                                     |
| WCAG AA contrast, light and dark     | unit (91 / 90 design + component pairs)      | passed         | `wallet/test/contrast.test.ts`                                                    |
| One primary action per page / screen | component (portal and wallet)                | passed         | `issuer-portal/test/design-system.test.tsx`, `wallet/test/design-system.test.tsx` |
| No hex colour outside tokens.ts      | unit (scans every app's source)              | passed         | `portal-ui/test/tokens.test.ts`                                                   |
| theme.css generated from tokens.ts   | unit (replaces the byte-identical CSS check) | passed         | `portal-ui/test/tokens.test.ts`                                                   |
| Wallet shell on the phone            | manual (Expo Go)                             | to be recorded | [s2-wallet-shell-guide.md](evidence/s2-wallet-shell-guide.md)                     |
| Expo SDK alignment and config checks | tooling (expo-doctor)                        | 20/20 passed   | `npm run doctor`                                                                  |
| crypto-core on the phone (Hermes)    | manual (Expo Go, Diagnostics)                | to be recorded | [s2-wallet-init-guide.md](evidence/s2-wallet-init-guide.md)                       |

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

### Issue 6: `unstable_settings.initialRouteName` is deprecated in Expo Router 58 (27 Nov 2026)

- **Task:** Wallet navigation (a Stack per tab)
- **Symptom:** Every test rendering the app failed on the console guard: "`unstable_settings.
initialRouteName` is deprecated. Use `unstable_settings.anchor` instead."
- **Cause:** The older Expo Router documentation (and most examples) still use
  `initialRouteName`; SDK 58 renamed it.
- **Resolution:** `export const unstable_settings = { anchor: 'index' }` in each tab's
  `_layout.tsx`; a deep-link test proves Back still lands on the list.
- **Lesson:** The console guard turned a silent deprecation into a failing test on the first run.

### Issue 7: Tests passed against a dead AsyncStorage mock (27 Nov 2026)

- **Task:** Language preference
- **Symptom:** The "simulated restart" test read `null` for a language saved a line earlier,
  while the other preference tests passed.
- **Cause:** The official mock's `getItem` / `setItem` are `jest.fn`s holding the in-memory
  store. `jest.spyOn` on them returns the same `jest.fn`, and `restoreAllMocks` in `afterEach`
  then **removed their implementation**: every later test in the file ran against a store that
  saved nothing (some still passed for the wrong reason).
- **Resolution:** No `spyOn` / restore on the mock; one-shot `mockRejectedValueOnce` /
  `mockImplementationOnce` and `.mock.calls` (with `clearMocks`). Rule added to CLAUDE.md.
- **Lesson:** Spying on something that is already a mock and then restoring it does not restore
  the mock; check a later test still sees real behaviour.

### Issue 8: The dev-only UI kit was in the release bundle (27 Nov 2026)

- **Task:** UI kit hidden in production
- **Symptom:** The Jest tests (gate mocked to false) passed, but `npx expo export --platform
android` (a release bundle) still contained the kit's test IDs.
- **Cause:** The screen returned early on `uiKitEnabled()`, a function call returning
  `__DEV__`; Metro's minifier cannot fold a call across modules, so the code after it stayed.
  (Expo Router bundles every route file, so the screen module itself is always present.)
- **Resolution:** Gate with an inline `!__DEV__ || !uiKitEnabled()`: folded to `true` in a
  release build, the kit below is dropped (test IDs absent after re-export); a test keeps the
  inline gate. The synthetic sample data is still bundled (backlog).
- **Lesson:** "Hidden" (not reachable) and "stripped" (not in the bundle) are different
  claims; check the exported bundle, not only the tests.

### Issue 9: One source pairing fails AA in dark: text-subtle on brand-soft (27 Nov 2026)

- **Task:** Design system, contrast test for both themes
- **Symptom:** After the three agreed light-theme fixes, the extended contrast test failed one
  dark pair: `text-subtle` (#7D8DA6) on `brand-soft` (#1A2E4D) is 4.04:1 (needs 4.5:1).
- **Cause:** The stop check before Part B tested the brand-soft pairs in light only; in dark the
  pair was not measured. In light it is a portal pairing (timestamps in a selected table row) and
  passes after the fix (4.58:1).
- **Resolution:** No colour changed (the brief: dark text-subtle stays). Usage rule instead: in
  the wallet, text on a brand-soft panel is `text-muted` (5.77:1; the disclosure panel token set
  already uses it); the pair is marked light-only in `DESIGN_PAIRS` and a test pins both ratios.
  Recorded in design-system.md (Accessibility). Needs supervisor confirmation.
- **Lesson:** Check every pairing in every theme it can appear in before declaring a palette
  clean.

### Issue 10: The Expo font packages bundled every weight (27 Nov 2026)

- **Task:** Wallet fonts (Noto Sans)
- **Symptom:** `npx expo export` listed all 18 Noto Sans files (weights and italics, about 11 MB)
  and all 9 Noto Sans Sinhala files, although the app loads five.
- **Cause:** Importing from a package index (`@expo-google-fonts/noto-sans`) evaluates every
  `require('./…ttf')` in it, and Metro bundles each asset it sees. The Sinhala package had done
  the same since the wallet was initialised.
- **Resolution:** One import per weight (`@expo-google-fonts/noto-sans/400Regular` …) and
  `useFonts` from `expo-font`; the export now lists exactly the five design weights plus the icon
  font. `test/app.test.tsx` fails if a package index is imported again.
- **Lesson:** Read the asset list of a release bundle after adding a font or image package.

### Issue 11: The AsyncStorage mock counts a setItem twice (28 Nov 2026)

- **Task:** Storage rule test over the new preference keys
- **Symptom:** The rewritten "only listed keys are ever written" test expected 8 writes and saw 14.
- **Cause:** The official mock implements `setItem` through `multiSet`, so every `setItem` call
  also appears in `multiSet.mock.calls`. Counting both lists counts each write twice (except real
  `multiSet` calls).
- **Resolution:** The test checks every written key/value against its allowed values in both
  lists and counts distinct keys (all five), not calls.
- **Lesson:** Know how a mock is built before counting its calls; assert on what was written, not
  on how many calls it took.

### Issue 12: Mocking expo-status-bar broke every navigator in the test (28 Nov 2026)

- **Task:** Status bar style per theme
- **Symptom:** Every test in `appearance.test.tsx` failed with "useVerticalBarEdgeIOS is not a
  function" from expo-router's `Screen`.
- **Cause:** `jest.mock('expo-status-bar', () => ({{ StatusBar }}))` replaced the whole module;
  expo-router's React Navigation fork imports other functions from it.
- **Resolution:** Spread the real module and replace only `StatusBar`
  (`{{ ...jest.requireActual('expo-status-bar'), StatusBar }}`).
- **Lesson:** Partial mocks of a module the framework itself uses must keep its other exports.

### Issue 13: A PowerShell one-liner corrupted a test file's quotes (28 Nov 2026)

- **Task:** Diagnostics test for the PIN hashing time
- **Symptom:** After adding one import with `(Get-Content … -Raw) -replace … | Set-Content -Encoding
utf8`, the unrelated health-check test failed: its expected text "server status “ok”" had become
  "â€œokâ€", and the file started with a byte-order mark.
- **Cause:** Windows PowerShell 5.1 reads files in the ANSI code page by default and writes UTF-8
  WITH a BOM; the curly quotes were decoded as three Windows-1252 characters each.
- **Resolution:** Restored the quotes and removed the BOM (the diff then showed only the new
  lines). Edits to source files go through the editor or a UTF-8 Python script, never
  Get-Content / Set-Content without `-Encoding utf8` on both sides.
- **Lesson:** The console guard and the test caught it; check `git diff` for unrelated changes
  after any scripted edit.

### Issue 14: `useRef(new Animated.Value(0)).current` fails the React Compiler lint (28 Nov 2026)

- **Task:** PinPad shake
- **Symptom:** `react-hooks/refs`: "Cannot access refs during render" on the common React Native
  idiom.
- **Cause:** react-hooks 7 (React Compiler rules) forbids reading `ref.current` while rendering.
- **Resolution:** `const [shake] = useState(() => new Animated.Value(0))`: created once, no ref
  read in render. The colour keyword `'transparent'` moved to a theme constant (`TRANSPARENT`) for
  `react-native/no-color-literals`.
- **Lesson:** Prefer a lazy `useState` for values that are created once and never replaced.

### Issue 15: expo-router's renderRouter runs tests on fake timers (28 Nov 2026)

- **Task:** PIN processing state tests
- **Symptom:** A test that held the PIN save open and then waited with
  `await new Promise((r) => setTimeout(r, 700))` (or the same inside `act`) never finished; the
  app itself worked (a probe test reached "Saving your PIN…").
- **Cause:** After `renderRouter(...)` a plain `setTimeout` never fires: expo-router's testing
  library runs the test on Jest's fake timers. RNTL's `findBy*` / `waitFor` advance them, so every
  earlier test passed; a bare timer waits forever.
- **Resolution:** Move the clock explicitly: `await act(async () => {
jest.advanceTimersByTime(PROCESSING_MIN_MS + 100); })`; otherwise wait with `findBy*` /
  `waitFor`. Noted for future tests.
- **Lesson:** In router tests, never wait on a real timer; advance the fake clock or use
  `waitFor`.

### Issue 16: Reanimated's Jest mock crashed every test that showed a toast (28 Nov 2026)

- **Task:** Swipe-to-dismiss toasts
- **Symptom:** After adding `react-native-reanimated` 4.7.1, every test that rendered a toast
  failed with `useSharedValue is not a function`, and a direct require of
  `react-native-reanimated/mock` threw "`setCSSEventHandler` is not available in JSReanimated".
- **Cause:** Reanimated's own `mock.js` imports the real module, whose native initialiser throws
  under jest-expo. expo-router's testing library (`renderRouter`) mocks reanimated with that file
  and falls back to an empty object when it throws, so gesture-handler and the Toast got nothing.
- **Resolution:** A small mock of what the wallet uses, `wallet/test/mocks/reanimated.ts`
  (animations finish at once and are recorded; `useAnimatedStyle` runs on render; the hooks
  gesture-handler looks for), installed in `test/setup.ts` and mapped over
  `react-native-reanimated/mock` in `jest.config.js` so `renderRouter` loads it too.
  `react-native-worklets` is made unavailable in Jest, so gesture-handler takes its JS path;
  gestures are driven with `react-native-gesture-handler/jest-utils` (`fireGestureHandler`, and
  `createGestureController` to keep a finger down). The Toast writes the shared value with
  `get()` / `set()`, as the React Compiler lint requires.
- **Lesson:** Check a native library's Jest story before building on it; when the official mock
  does not load, mock only the surface the app uses and map every path to it.
