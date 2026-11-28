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
    system: 'Automatic',
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
    unlockSection: 'Unlock',
    testSection: 'Test',
    testHint: 'Try how you unlock UniVault. Nothing is changed or shared.',
    testButton: 'Test unlock',
    testReason: 'Test unlock',
    testOkBiometric: 'Unlocked with {{kind}}.',
    testOkPin: 'Unlocked with your PIN.',
    testFailed: {
      cancelled: 'Not unlocked: you cancelled.',
      'locked-out': 'Not unlocked: too many wrong PINs. Wait and try again.',
      'no-pin': 'Not unlocked: no PIN is set up.',
    },
    lockSection: 'Lock',
    lockNow: 'Lock now',
    pinSection: 'PIN',
    changePin: 'Change PIN',
    comingSoon: 'Coming soon',
  },
  /** Biometric unlock (src/security/biometrics.ts). {{kind}} is one of biometrics.kind. */
  biometrics: {
    kind: {
      fingerprint: 'fingerprint',
      face: 'face recognition',
      fingerprintOrFace: 'fingerprint or face',
    },
    supported: 'This phone supports unlock with {{kind}}.',
    unavailable: {
      'no-hardware': 'Fingerprint and face unlock aren’t available on this phone.',
      'not-enrolled':
        'No fingerprint or face is set up on this phone. Add one in the phone’s settings to use it here.',
      'available-weak-only':
        'This phone’s {{kind}} unlock isn’t secure enough for UniVault. Use your PIN.',
      'unsupported-in-expo-go': 'Unlock with {{kind}} needs the full UniVault app, not Expo Go.',
    },
    /** The platform limitation: any enrolled biometric unlocks (docs: Known limitations). */
    sharedNotice: {
      fingerprint:
        'Anyone whose fingerprint is saved on this phone will be able to unlock UniVault. Only turn this on if every fingerprint on this phone is yours.',
      face: 'Anyone whose face is saved on this phone will be able to unlock UniVault. Only turn this on if every face saved on this phone is yours.',
      fingerprintOrFace:
        'Anyone whose fingerprint or face is saved on this phone will be able to unlock UniVault. Only turn this on if every fingerprint and face on this phone is yours.',
    },
    pinOnlyOption: 'You can always use your PIN only.',
    /** Weak-only phones with camera face unlock (Settings → Security, "PIN set"). */
    weakFace: {
      fingerprint:
        'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your fingerprint or your PIN.',
      pin: 'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your PIN.',
    },
    switchLabel: 'Unlock with {{kind}}',
    switchUnavailable: 'Not available on this phone',
    enablePrompt: 'Turn on unlock with {{kind}}',
    turnedOn: 'Unlock with {{kind}} is on',
    turnedOff: 'Unlock with {{kind}} is off',
    enableFailed: 'Unlock with {{kind}} is still off. Try again.',
    disableReason: 'Turn off unlock with {{kind}}',
  },
  /** After "PIN set", when the phone has strong biometrics (app/setup/biometrics.tsx). */
  setupBiometrics: {
    title: {
      fingerprint: 'Use fingerprint to unlock?',
      face: 'Use face recognition to unlock?',
      fingerprintOrFace: 'Use fingerprint or face to unlock?',
    },
    body: {
      fingerprint: 'Your fingerprint stays on this phone. UniVault never sees it.',
      face: 'Your face data stays on this phone. UniVault never sees it.',
      fingerprintOrFace:
        'Your fingerprint and face data stay on this phone. UniVault never sees them.',
    },
    pinStill: 'You can always use your PIN instead.',
    turnOn: 'Turn on',
    notNow: 'Not now',
    enabling: 'Turning on unlock with {{kind}}…',
    success: {
      title: 'Unlock with {{kind}} is on',
      body: 'Next time, open UniVault with your {{kind}}. You can always use your PIN instead.',
      cta: 'Continue',
    },
    failed: 'Unlock with {{kind}} is off. You can turn it on later in Settings.',
  },
  /** The app lock (src/security/app-lock.tsx). */
  lock: {
    title: 'UniVault is locked',
    subtitle: 'Unlock to continue',
    unlock: 'Unlock',
    usePin: 'Use PIN',
    reason: 'Unlock UniVault',
  },
  lockDelay: {
    title: 'Lock after leaving the app',
    hint: 'How soon UniVault locks after you switch to another app or the screen turns off.',
    options: {
      immediately: 'Immediately',
      '30s': '30 seconds',
      '1m': '1 minute',
      '5m': '5 minutes',
    },
    saved: 'Lock setting changed',
    notSaved: 'Lock setting changed, but it could not be saved for next time.',
  },
  /** The PIN prompt of authenticate() (src/security/authenticate.tsx). */
  auth: {
    title: 'Enter your PIN',
    wrong: 'That PIN isn’t right. Try again.',
    attemptsLeft_one: '{{count}} attempt left before a short wait.',
    attemptsLeft_other: '{{count}} attempts left before a short wait.',
    correct: 'PIN correct',
    lockedSeconds_one: 'Too many attempts. Try again in {{seconds}} second.',
    lockedSeconds_other: 'Too many attempts. Try again in {{seconds}} seconds.',
    lockedMinutes_one: 'Too many attempts. Try again in {{minutes}} minute.',
    lockedMinutes_other: 'Too many attempts. Try again in {{minutes}} minutes.',
    lockedHours_one: 'Too many attempts. Try again in {{hours}} hour.',
    lockedHours_other: 'Too many attempts. Try again in {{hours}} hours.',
    useBiometric: 'Use {{kind}}',
    invalidated:
      'Your {{kind}} settings changed. Unlock with your PIN, then turn {{kind}} unlock on again in Settings.',
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
      lead: 'Three simple steps.',
      receiveTitle: 'You receive it',
      receive: 'An employer or bank gives you a credential.',
      keepTitle: 'You keep it',
      keep: 'It stays in this wallet on your phone.',
      showTitle: 'You show it',
      show: 'Show it to someone who needs to check it.',
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
      lead: 'Only you can use it.',
      pin: 'You use your PIN or fingerprint before every share.',
      encrypted: 'Your credentials are encrypted on this phone.',
      offline: 'It works without the internet.',
    },
    privacy: {
      title: 'Your privacy',
      lead: 'You stay in control of your data.',
      stays: 'Your credentials stay on this phone.',
      shared: 'Something is shared only when you approve it. You choose what.',
      noUniVault: 'Nothing is sent to UniVault when you share.',
      biometric: 'Your fingerprint or face data never leaves your phone.',
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
  /** After onboarding, before the wallet: the PIN (app/setup/security.tsx). */
  setup: {
    title: 'Set up security',
    intro: {
      title: 'Set up your PIN',
      body: 'Create a 6-digit PIN. You’ll use it to open UniVault and approve every share.',
      cta: 'Create PIN',
    },
    create: {
      title: 'Create your PIN',
      body: 'Enter 6 digits. Choose numbers that are hard to guess.',
    },
    confirm: {
      title: 'Confirm your PIN',
      body: 'Enter the same 6 digits again.',
    },
    success: {
      title: 'PIN set',
      body: 'You’ll use this PIN to open UniVault and approve every share.',
      cta: 'Continue',
    },
    weak: 'This PIN is too easy to guess. Avoid repeated or consecutive numbers.',
    mismatch: 'The PINs don’t match. Enter your new PIN again.',
    restart: 'Let’s start again',
    saveFailed: 'Something went wrong. Please create your PIN again.',
    saving: 'Securing your PIN…',
    startAgain: 'Start again',
    notCompleted: 'Something went wrong. Please try again.',
  },
  /** The PIN keypad (src/components/PinPad.tsx). Never the digits in a label. */
  pin: {
    dots: '{{count}} of {{total}} digits entered',
    keypad: 'Number pad',
    checking: 'Checking your PIN…',
    delete: 'Delete',
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
      inverse: 'Inverse',
      textOnBrand: 'Text on brand',
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
    inverseSample: 'Primary on navy – only on full-navy screens such as the lock screen',
    swipeHint: 'Swipe a toast left or right to dismiss it.',
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
    headerInTabs: 'Every tab screen and every screen inside a tab: the navy header',
    headerOutside: 'Outside the tabs only: the surface header',
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
    lastLock: 'Last lock reason',
    captureTitle: 'Screen capture',
    captureSwitch: 'Block screenshots and recents preview',
    captureHint:
      'Development builds only, off by default. Release builds always block screenshots and the recent-apps preview of the whole wallet.',
    lockReason: {
      'app-start': 'App start',
      background: 'Left the app',
      manual: 'Lock now',
      none: 'Not locked yet',
    },
    resetTitle: 'Onboarding',
    resetDescription:
      'Shows the first-start screens again. Clears the onboarding and privacy flags and deletes the PIN (verifier and attempt record); keeps the language and appearance.',
    resetButton: 'Reset onboarding',
    resetConfirmTitle: 'Reset onboarding?',
    resetConfirmMessage:
      'The app will open the first-start screens. Your language and appearance stay as they are.',
    resetConfirm: 'Reset',
    resetDone: 'Onboarding reset',
    resetFailed: 'Could not reset onboarding.',
    pinTitle: 'PIN hashing time',
    pinDescription:
      'Times one scrypt derivation with the default PIN parameters on random data (never a PIN). Target: 250–500 ms on a mid-range Android phone.',
    pinParams: 'scrypt N = {{N}}, r = {{r}}, p = {{p}} ({{mib}} MiB)',
    pinResult: '{{ms}} ms',
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
