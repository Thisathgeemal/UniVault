/**
 * THE GATE: which part of the app a holder may see. One rule, used by every layout that can be
 * opened (app/index.tsx, app/(tabs)/_layout.tsx, app/onboarding/_layout.tsx,
 * app/setup/_layout.tsx), so typed URLs and deep links are redirected the same way as the app
 * start:
 *
 *   onboarding not complete                → onboarding  (/onboarding/language)
 *   onboarding complete, security not set  → setup       (/setup/security)
 *   both complete                          → app         (the tabs, /credentials)
 *
 * "Onboarding complete" = the onboardingCompleted flag AND a privacy acknowledgement of the
 * CURRENT privacy text (PRIVACY_POLICY_VERSION): a new version of the text sends the holder
 * through onboarding again. No route lets a holder skip security setup: the tabs need both.
 */
import { ROUTES } from '../navigation/routes';
import type { PrivacyAcknowledgement } from '../lib/preferences';

/** Version of the privacy text on the Privacy screens; bump it when that text changes. */
export const PRIVACY_POLICY_VERSION = 'privacy-v1';

export interface SetupState {
  onboardingCompleted: boolean;
  privacyAcknowledgement: PrivacyAcknowledgement | null;
  /** From isSecuritySetupComplete() (src/onboarding/security-setup.ts). */
  securitySetupComplete: boolean;
}

/** A fresh install: nothing done. */
export const INITIAL_SETUP_STATE: SetupState = {
  onboardingCompleted: false,
  privacyAcknowledgement: null,
  securitySetupComplete: false,
};

export type GateArea = 'onboarding' | 'setup' | 'app';

export function isOnboardingComplete(state: SetupState): boolean {
  return (
    state.onboardingCompleted && state.privacyAcknowledgement?.version === PRIVACY_POLICY_VERSION
  );
}

/** The part of the app this holder must be in. */
export function requiredArea(state: SetupState): GateArea {
  if (!isOnboardingComplete(state)) return 'onboarding';
  if (!state.securitySetupComplete) return 'setup';
  return 'app';
}

/** Where each area starts. */
export const AREA_ENTRY: Record<GateArea, string> = {
  onboarding: ROUTES.onboardingLanguage,
  setup: ROUTES.setupSecurity,
  app: ROUTES.credentials,
};

/** null if the holder may be in `area`; otherwise the route to send them to. */
export function gateRedirect(state: SetupState, area: GateArea): string | null {
  const required = requiredArea(state);
  return required === area ? null : AREA_ENTRY[required];
}
