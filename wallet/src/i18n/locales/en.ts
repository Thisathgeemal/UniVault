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
    loading: 'Loading…',
    back: 'Back',
    cancel: 'Cancel',
  },
  language: {
    en: 'English',
    si: 'සිංහල',
  },
  /** Settings → Appearance (theme). */
  appearance: {
    system: 'Use device setting',
    light: 'Light',
    dark: 'Dark',
  },
  tabs: {
    credentials: 'Credentials',
    scan: 'Scan',
    history: 'History',
    settings: 'Settings',
  },
  /** Credential status badge. Shared states use the issuer portal's words (a test checks). */
  status: {
    valid: 'Valid',
    expired: 'Expired',
    revoked: 'Revoked',
    replaced: 'Replaced',
    notChecked: 'Not checked yet',
    checking: 'Checking…',
  },
  /** Same words as the issuer portal's credentialTypes. */
  credentialTypes: {
    EmploymentCredential: 'Employment credential',
    KYCCredential: 'KYC credential',
  },
  credentialCard: {
    expires: 'Expires {{date}}',
    expiredOn: 'Expired on {{date}}',
    issuedBy: 'issued by {{issuer}}',
    holder: 'holder {{name}}',
    statusLabel: 'status {{status}}',
    openHint: 'Opens the credential details',
  },
  sampleData: {
    notice: 'Sample data (development build only). Real credentials arrive in a later version.',
  },
  credentials: {
    title: 'My credentials',
    detailTitle: 'Credential',
    emptyTitle: 'No credentials yet',
    emptyMessage:
      'Credentials you receive from an employer or a bank will appear here. To add one, scan the QR code the issuer shows you, on the Scan tab.',
    detailPlaceholder:
      'The full details and sharing options will appear here once credentials are stored in the wallet.',
    notFoundTitle: 'Credential not found',
    notFoundMessage: 'This credential is not in your wallet.',
    backToList: 'Back to my credentials',
    fields: {
      issuer: 'Issuer',
      type: 'Type',
      holder: 'Holder',
      expires: 'Expires',
      status: 'Status',
    },
  },
  scan: {
    title: 'Scan a QR code',
    emptyTitle: 'Scanning is coming soon',
    emptyMessage:
      'Here you will scan QR codes: credential offers from an issuer, and requests from an organisation that wants to check one of your credentials. You will always see what is asked before anything is shared.',
  },
  history: {
    title: 'History',
    detailTitle: 'Activity',
    emptyTitle: 'No activity yet',
    emptyMessage:
      'A record of the credentials you receive and of who you share them with will appear here. It stays on this phone.',
    kinds: {
      received: 'Credential received',
      shared: 'Credential shared',
    },
    entrySubtitle: '{{party}} · {{date}}',
    detailPlaceholder: 'Exactly what was shared, and with whom, will appear here.',
    notFoundTitle: 'Activity not found',
    notFoundMessage: 'This entry is not in your history.',
    backToList: 'Back to history',
    fields: {
      with: 'With',
      when: 'When',
      credential: 'Credential',
    },
  },
  settings: {
    title: 'Settings',
    sections: {
      preferences: 'Preferences',
      app: 'App',
      developer: 'Developer (development builds only)',
    },
    language: 'Language',
    languageHint: 'Changes the language of the whole app.',
    languageSaved: 'Language changed',
    languageNotSaved: 'Language changed, but it could not be saved for next time.',
    appearance: 'Appearance',
    appearanceHint: 'Light or dark colours for the whole app.',
    appearanceSaved: 'Appearance changed',
    appearanceNotSaved: 'Appearance changed, but it could not be saved for next time.',
    security: 'Security',
    securityHint: 'Wallet lock and fingerprint or face unlock',
    about: 'About',
    aboutHint: 'Version and licences',
    appVersion: 'App version',
    diagnostics: 'Diagnostics',
    diagnosticsHint: 'Developer checks (development builds only)',
    uiKit: 'UI kit',
    uiKitHint: 'Every component and state (development builds only)',
  },
  security: {
    title: 'Security',
    placeholderTitle: 'Security settings are coming soon',
    placeholderMessage:
      'Here you will choose how the wallet is locked (device passcode, fingerprint or face) before anything is shown or shared. Your keys will be kept in the phone’s secure storage.',
  },
  /** First start (app/onboarding). Short sentences, plain words (NFR-04). */
  onboarding: {
    next: 'Next',
    skip: 'Skip',
    skipHint: 'Goes to the privacy screen',
    stepOf: 'Step {{current}} of {{total}}',
    language: {
      title: 'Choose your language',
      body: 'You can change it later in Settings.',
    },
    welcome: {
      title: 'Welcome to UniVault',
      body: 'UniVault keeps your digital identity on your phone.',
      body2: 'You decide what to share, and with whom.',
    },
    howItWorks: {
      title: 'How it works',
      issue: 'An organisation, such as your employer or bank, gives you a credential.',
      keep: 'You keep it in this wallet.',
      show: 'You show it to someone who needs to check it.',
      issuer: 'Organisation',
      holder: 'You',
      verifier: 'Checker',
    },
    selectiveDisclosure: {
      title: 'You choose what to share',
      body: 'Share only what is needed. Nothing more.',
      exampleTitle: 'For example',
      example: 'Prove you are over 18 without showing your birthday.',
    },
    security: {
      title: 'Your wallet is protected',
      pin: 'You use your PIN or fingerprint before every share.',
      encrypted: 'Your credentials are encrypted on this phone.',
      offline: 'It works without the internet.',
    },
    privacy: {
      title: 'Your privacy',
      stays: 'Your credentials stay on this phone.',
      shared: 'Something is shared only when you approve it. You choose what.',
      noUniVault: 'Nothing is sent to UniVault when you share.',
      detailsLink: 'Privacy details',
      understand: 'I understand',
      cta: 'Set up security',
      ctaHint: 'Tick “I understand” first',
      notSaved: 'Could not save this. You may see these screens again next time.',
    },
    privacyDetails: {
      title: 'Privacy details',
      onPhoneTitle: 'What stays on this phone',
      onPhone:
        'Your credentials and your history are kept only on this phone, encrypted. UniVault has no copy.',
      sharingTitle: 'What is shared, and when',
      sharing:
        'When someone asks to check a credential, you see who is asking and what they ask for. Only what you approve is sent, straight to them.',
      univaultTitle: 'What UniVault receives',
      univault: 'Nothing. The wallet sends nothing to UniVault when you share.',
      removingTitle: 'If you remove the app',
      removing:
        'Your credentials are removed with it. Ask the organisation that gave you a credential to issue it again.',
      version: 'Privacy text version: {{version}}',
    },
  },
  /** After onboarding, before the wallet: security setup (placeholder until the PIN task). */
  setup: {
    title: 'Set up security',
    heading: 'Set up your PIN',
    body: 'Next, you choose a PIN for this wallet. You will use it, or your fingerprint, to open the wallet and before every share.',
    comingSoon: 'PIN setup comes in the next version of the app.',
    devNote:
      'Development builds only: this marks security as set up so you can reach the wallet. The real PIN setup replaces it.',
    devContinue: 'Continue (development placeholder)',
    notSaved: 'Could not save this. You may see this screen again next time.',
  },
  about: {
    title: 'About',
    description:
      'UniVault is a privacy-preserving identity wallet: you keep your credentials on this phone and choose what to share.',
    appVersion: 'App version',
    sdkVersion: 'Expo SDK',
    licences: 'Licences',
    fontLicence:
      'Sinhala text uses the Noto Sans Sinhala font, © 2022 The Noto Project Authors, used under the SIL Open Font License, Version 1.1.',
  },
  uiKit: {
    title: 'UI kit',
    unavailable: 'The UI kit is only available in development builds.',
    intro:
      'Every shared component in the current language and theme ({{scheme}} mode). Development builds only.',
    schemeLight: 'light',
    schemeDark: 'dark',
    sections: {
      buttons: 'Buttons',
      statuses: 'Credential statuses',
      cards: 'Credential cards',
      badges: 'Badges',
      list: 'List items',
      header: 'Header',
      states: 'Loading, empty and error states',
      feedback: 'Toast and confirmation',
      offline: 'Offline notice',
      disclosure: 'Disclosure panel (later)',
    },
    variants: {
      primary: 'Primary',
      secondary: 'Secondary',
      destructive: 'Destructive',
      text: 'Text button',
      onBrand: 'On brand',
    },
    disabled: '{{variant}} (disabled)',
    loading: '{{variant}} (loading)',
    tones: {
      valid: 'Valid colours',
      expired: 'Expired colours',
      revoked: 'Revoked colours',
      pending: 'Pending colours',
      neutral: 'Neutral (not a status)',
    },
    onBrandSample: 'Buttons on a navy card',
    offlineSample: '2 hours ago',
    disclosureVerifier: 'Sample Verifier (Demo)',
    disclosurePurpose: 'Wants to check your employment details.',
    disclosureLink: 'Why is this asked?',
    listTitle: 'List item title',
    listSubtitle: 'A subtitle that can wrap onto a second line at large text sizes',
    listValue: 'Value',
    headerTitle: 'Screen title',
    headerAction: 'Example action',
    headerAction2: 'Second example action',
    loadingMessage: 'Loading example…',
    emptyTitle: 'Nothing here',
    emptyMessage: 'An empty state explains what will appear and how to add it.',
    errorMessage: 'An error state says what went wrong and offers to try again.',
    showToast: 'Show a toast',
    showThreeToasts: 'Queue three toasts',
    toastMessage: 'Example toast {{n}}',
    confirm: 'Open a confirmation',
    confirmDestructive: 'Open a destructive confirmation',
    confirmTitle: 'Continue?',
    confirmMessage: 'A confirmation asks before an action that matters.',
    confirmAction: 'Continue',
    destructiveTitle: 'Remove this credential?',
    destructiveMessage: 'This cannot be undone. (Example only: nothing is removed.)',
    destructiveAction: 'Remove',
    confirmed: 'Confirmed (example)',
    cancelled: 'Cancelled (example)',
    pressed: 'Pressed (example)',
  },
  toast: {
    dismiss: 'Dismiss message',
  },
  offline: {
    lastChecked: 'Status last checked {{time}}',
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
    resetTitle: 'Onboarding',
    resetDescription:
      'Shows the first-start screens again. Clears the onboarding, privacy and security-setup flags; keeps the language and appearance.',
    resetButton: 'Reset onboarding',
    resetConfirmTitle: 'Reset onboarding?',
    resetConfirmMessage:
      'The app will open the first-start screens. Your language and appearance stay as they are.',
    resetConfirm: 'Reset',
    resetDone: 'Onboarding reset',
    resetFailed: 'Could not reset onboarding.',
  },
  errors: {
    title: 'Something went wrong',
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
