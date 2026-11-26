/**
 * English UI strings (source language). Every string the issuer portal shows comes from here
 * or from si.ts, through t(). Keep both files in the same shape: a test fails otherwise.
 */
export const en = {
  app: {
    name: 'UniVault Issuer Portal',
    shortName: 'Issuer Portal',
  },
  common: {
    loading: 'Loading…',
    tryAgain: 'Try again',
    backToDashboard: 'Back to the dashboard',
    reference: 'Reference: {{requestId}}',
  },
  language: {
    label: 'Language',
    en: 'English',
    si: 'සිංහල',
  },
  login: {
    title: 'Sign in',
    subtitle: 'For staff of issuing organisations (employers and banks).',
    email: 'Email address',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    submit: 'Sign in',
    submitting: 'Signing in…',
    fieldErrors: {
      emailRequired: 'Enter your email address.',
      emailInvalid: 'Enter a valid email address, like name@example.com.',
      passwordRequired: 'Enter your password.',
      passwordTooLong: 'The password is too long.',
    },
    errors: {
      invalidCredentials: 'The email address or password is not correct.',
      accountLocked:
        'This account is locked after too many failed sign-in attempts. Try again later.',
      accountLockedUntil:
        'This account is locked after too many failed sign-in attempts. Try again after {{time}} (Sri Lanka time).',
      rateLimited:
        'Too many sign-in attempts from this device. Wait a few minutes, then try again.',
      validation: 'Enter a valid email address and your password.',
    },
  },
  session: {
    expired: 'Your session has expired, please sign in again.',
  },
  errors: {
    network: 'Cannot reach the UniVault server. Check your connection and try again.',
    generic: 'Something went wrong. Please try again.',
    rateLimited: 'Too many requests. Wait a minute, then try again.',
    restoreFailed: {
      title: 'We could not load your session',
      message: 'The UniVault server did not respond. Check your connection and try again.',
    },
    pageCrashed: {
      title: 'This page could not be shown',
      message: 'Something went wrong on this page. Reload it, or go back to the dashboard.',
      reload: 'Reload page',
    },
    notFound: {
      title: 'Page not found',
      message: 'The page you asked for does not exist.',
    },
    notPermitted: {
      title: 'Not permitted',
      message: 'Your role does not allow access to this page. Ask an administrator if you need it.',
    },
  },
  header: {
    signOut: 'Sign out',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
    skipToContent: 'Skip to main content',
  },
  nav: {
    label: 'Main navigation',
    dashboard: 'Dashboard',
    holders: 'Holders',
    credentials: 'Credentials',
    credentialOffers: 'Credential offers',
    issuerKeys: 'Issuer keys',
    staff: 'Staff',
  },
  roles: {
    admin: 'Administrator',
    officer: 'Officer',
  },
  issuerTypes: {
    employer: 'Employer',
    bank: 'Bank',
  },
  dashboard: {
    lastUpdated: 'Last updated {{time}} (Sri Lanka time)',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    loading: 'Loading the dashboard…',
    loadFailed: 'The dashboard could not be loaded.',
    primaryLabel: 'Credential totals',
    secondaryLabel: 'More figures',
    cards: {
      issued: {
        label: 'Issued',
        description: "Credentials signed into holders' wallets so far",
      },
      active: {
        label: 'Active',
        description: "Credentials currently valid in holders' wallets",
      },
      revoked: {
        label: 'Revoked',
        description: 'Credentials withdrawn after they were issued',
      },
      awaitingWallet: {
        label: 'Awaiting wallet',
        description: 'Created, waiting for the holder to scan the QR code',
      },
      superseded: {
        label: 'Superseded',
        description: 'Replaced by a newer credential',
      },
      expired: {
        label: 'Expired',
        description: 'Past their expiry date',
      },
      expiringSoon: {
        label: 'Expiring in {{days}} days',
        description: 'Active credentials that expire soon',
      },
      holders: {
        label: 'Holders',
        description: 'Holder records in your organisation',
      },
    },
    breakdown: {
      title: 'Status of issued credentials',
      noneIssued: 'No credential has been signed into a wallet yet.',
      value: '{{count}} ({{percent}})',
    },
    activity: {
      title: 'Recent activity',
      empty: 'No activity yet.',
      byWallet: "Holder's wallet",
      credential: 'Credential {{id}}',
      actions: {
        created: 'Created – waiting for the wallet',
        signed: 'Signed into wallet',
        superseded: 'Replaced by a new credential',
        revoked: 'Revoked – {{reason}}',
        expirySimulated: 'Expiry simulated (development)',
        other: 'Status changed',
      },
      reasons: {
        details_changed: 'details changed',
        employment_ended: 'employment ended',
        relationship_ended: 'relationship ended',
        wallet_lost_or_compromised: 'wallet lost or compromised',
        issued_in_error: 'issued in error',
        validity_extension: 'validity extended',
        other: 'other reason',
        unknown: 'no reason given',
      },
    },
    empty: {
      title: 'No credentials issued yet',
      description:
        'Start by adding a holder record. Then create a credential and show its QR code to the holder, who scans it with the UniVault wallet.',
      action: 'Go to Holders',
    },
  },
  credentialTypes: {
    EmploymentCredential: 'Employment credential',
    KYCCredential: 'KYC credential',
  },
  comingSoon: {
    badge: 'Coming soon',
    description: 'This page is planned for Sprint {{sprint}}.',
  },
};

export type Messages = typeof en;
