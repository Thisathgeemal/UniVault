/**
 * English UI strings (source language). Every string the wallet shows comes from here or from
 * si.ts, through t(), including accessibility labels. Keep both files in the same shape: the
 * `Messages` type and a test enforce it.
 */
export const en = {
  app: {
    name: 'UniVault',
  },
  common: {
    tryAgain: 'Try again',
    running: 'Running…',
  },
  language: {
    en: 'English',
    si: 'සිංහල',
  },
  tabs: {
    credentials: 'Credentials',
    scan: 'Scan',
    history: 'History',
    settings: 'Settings',
  },
  credentials: {
    title: 'My credentials',
    emptyTitle: 'No credentials yet',
    emptyMessage:
      'Credentials you receive from an employer or a bank will appear here. To add one, scan the QR code the issuer shows you, on the Scan tab.',
  },
  scan: {
    title: 'Scan a QR code',
    emptyTitle: 'Scanning is coming soon',
    emptyMessage:
      'Here you will scan QR codes: credential offers from an issuer, and requests from an organisation that wants to check one of your credentials. You will always see what is asked before anything is shared.',
  },
  history: {
    title: 'History',
    emptyTitle: 'No activity yet',
    emptyMessage:
      'A record of the credentials you receive and of who you share them with will appear here. It stays on this phone.',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    languageHint: 'Changes the language of the whole app.',
    about: 'About',
    appVersion: 'App version',
    diagnostics: 'Diagnostics',
    diagnosticsHint: 'Developer checks (development builds only)',
  },
  diagnostics: {
    title: 'Diagnostics',
    intro:
      'Checks for developers. They use synthetic test data only and never show credential contents.',
    unavailable: 'Diagnostics are only available in development builds.',
    environment: 'App and device',
    appVersion: 'App version',
    sdkVersion: 'Expo SDK',
    platform: 'Platform',
    hermes: 'Hermes engine',
    on: 'On',
    off: 'Off',
    apiBaseUrl: 'API base URL',
    apiProblem: {
      missing: 'Not set. Add EXPO_PUBLIC_API_BASE_URL to wallet/.env and restart Expo.',
      placeholder:
        'Still the example value. Put your PC’s LAN IP address in wallet/.env and restart Expo.',
      invalid: 'Not a valid http(s) address. Check EXPO_PUBLIC_API_BASE_URL in wallet/.env.',
    },
    loopbackWarning:
      'This points at the phone itself (localhost). A real phone needs your PC’s LAN IP address or a tunnel.',
    cryptoTitle: 'crypto-core check',
    cryptoDescription:
      'Decodes a bundled synthetic SD-JWT with the shared crypto library and checks every disclosure digest.',
    apiTitle: 'API reachability',
    apiDescription: 'Calls GET /health on the UniVault backend.',
    run: 'Run check',
    runLabel: 'Run the {{name}}',
    pass: 'Pass',
    fail: 'Fail',
    notRun: 'Not run',
    disclosures: '{{count}} of {{expected}} disclosures decoded',
    duration: 'Took {{ms}} ms',
    reason: 'Reason: {{reason}}',
    reachable: 'Reachable: server status “{{status}}” (HTTP {{http}})',
    unreachable: 'Not reachable ({{code}})',
    notConfigured: 'Set the API base URL first.',
  },
  errors: {
    boundaryTitle: 'Something went wrong',
    boundaryMessage:
      'The wallet hit an unexpected problem on this screen. Your credentials are not affected.',
  },
  notFound: {
    title: 'Page not found',
    message: 'This screen does not exist.',
    goHome: 'Go to my credentials',
  },
};

type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };

/** The shape every language must have (all strings). */
export type Messages = Widen<typeof en>;
