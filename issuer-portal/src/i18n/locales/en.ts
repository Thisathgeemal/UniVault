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
    welcome: 'Welcome, {{name}}',
    description: 'Issue and manage verifiable credentials for your organisation.',
    organisation: 'Organisation',
    role: 'Your role',
    signedInAs: 'Signed in as {{email}}',
  },
  comingSoon: {
    badge: 'Coming soon',
    description: 'This page is planned for Sprint {{sprint}}.',
  },
};

export type Messages = typeof en;
