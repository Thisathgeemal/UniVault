/**
 * The wallet's routes: ONE typed table for every link and router.push(). Never write a path
 * string anywhere else. test/routes.test.ts checks this table against the files in app/ (every
 * route file is listed, every listed file exists), so a renamed screen breaks a test, not a link.
 *
 * Why not Expo Router's typed routes (experiments.typedRoutes): its types are generated into the
 * git-ignored .expo/types by `expo start`, so a fresh clone (CI, `npm run typecheck`) would
 * type-check against different types than a developer machine. This table needs no generation.
 */

const segment = (id: string) => encodeURIComponent(id);

export const ROUTES = {
  home: '/',
  credentials: '/credentials',
  credential: (id: string) => `/credentials/${segment(id)}`,
  scan: '/scan',
  history: '/history',
  historyEntry: (id: string) => `/history/${segment(id)}`,
  settings: '/settings',
  language: '/settings/language',
  appearance: '/settings/appearance',
  security: '/settings/security',
  lockDelay: '/settings/lock-delay',
  about: '/settings/about',
  diagnostics: '/settings/diagnostics',
  uiKit: '/settings/ui-kit',
  // First start (src/onboarding/steps.ts holds the order), then security setup (the gate:
  // src/onboarding/gate.ts)
  onboardingLanguage: '/onboarding/language',
  onboardingWelcome: '/onboarding/welcome',
  onboardingHowItWorks: '/onboarding/how-it-works',
  onboardingSelectiveDisclosure: '/onboarding/selective-disclosure',
  onboardingSecurity: '/onboarding/security',
  onboardingPrivacy: '/onboarding/privacy',
  onboardingPrivacyDetails: '/onboarding/privacy-details',
  setupSecurity: '/setup/security',
  setupBiometrics: '/setup/biometrics',
} as const;

/**
 * Every file in app/ and the URL pattern it serves (layouts have none). Kept in the same order
 * as the navigation map in docs/frontend/mobile-wallet.md.
 */
export const ROUTE_FILES: readonly { file: string; pattern: string | null }[] = [
  { file: '_layout.tsx', pattern: null },
  { file: 'index.tsx', pattern: ROUTES.home },
  { file: '+not-found.tsx', pattern: null },
  { file: '(tabs)/_layout.tsx', pattern: null },
  { file: '(tabs)/credentials/_layout.tsx', pattern: null },
  { file: '(tabs)/credentials/index.tsx', pattern: ROUTES.credentials },
  { file: '(tabs)/credentials/[id].tsx', pattern: '/credentials/[id]' },
  { file: '(tabs)/scan/_layout.tsx', pattern: null },
  { file: '(tabs)/scan/index.tsx', pattern: ROUTES.scan },
  { file: '(tabs)/history/_layout.tsx', pattern: null },
  { file: '(tabs)/history/index.tsx', pattern: ROUTES.history },
  { file: '(tabs)/history/[id].tsx', pattern: '/history/[id]' },
  { file: '(tabs)/settings/_layout.tsx', pattern: null },
  { file: '(tabs)/settings/index.tsx', pattern: ROUTES.settings },
  { file: '(tabs)/settings/language.tsx', pattern: ROUTES.language },
  { file: '(tabs)/settings/appearance.tsx', pattern: ROUTES.appearance },
  { file: '(tabs)/settings/security.tsx', pattern: ROUTES.security },
  { file: '(tabs)/settings/lock-delay.tsx', pattern: ROUTES.lockDelay },
  { file: '(tabs)/settings/about.tsx', pattern: ROUTES.about },
  { file: '(tabs)/settings/diagnostics.tsx', pattern: ROUTES.diagnostics },
  { file: '(tabs)/settings/ui-kit.tsx', pattern: ROUTES.uiKit },
  { file: 'onboarding/_layout.tsx', pattern: null },
  { file: 'onboarding/language.tsx', pattern: ROUTES.onboardingLanguage },
  { file: 'onboarding/welcome.tsx', pattern: ROUTES.onboardingWelcome },
  { file: 'onboarding/how-it-works.tsx', pattern: ROUTES.onboardingHowItWorks },
  { file: 'onboarding/selective-disclosure.tsx', pattern: ROUTES.onboardingSelectiveDisclosure },
  { file: 'onboarding/security.tsx', pattern: ROUTES.onboardingSecurity },
  { file: 'onboarding/privacy.tsx', pattern: ROUTES.onboardingPrivacy },
  { file: 'onboarding/privacy-details.tsx', pattern: ROUTES.onboardingPrivacyDetails },
  { file: 'setup/_layout.tsx', pattern: null },
  { file: 'setup/security.tsx', pattern: ROUTES.setupSecurity },
  { file: 'setup/biometrics.tsx', pattern: ROUTES.setupBiometrics },
];
