/**
 * The holder's setup state (onboarding, privacy acknowledgement, security setup) for the gate
 * (src/onboarding/gate.ts), restored before the first frame (app/_layout.tsx) and changed only
 * through the three actions below. Each action updates the state at once (the gate redirects
 * straight away) and saves it as non-secret preferences; it resolves false when saving failed.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  clearSetupProgress,
  loadOnboardingProgress,
  saveOnboardingCompleted,
} from '../lib/preferences';
import { deletePinData } from '../security/pin';
import {
  gateRedirect,
  INITIAL_SETUP_STATE,
  PRIVACY_POLICY_VERSION,
  type GateArea,
  type SetupState,
} from './gate';
import { isSecuritySetupComplete } from './security-setup';

export interface SetupApi {
  state: SetupState;
  /** Privacy screen, "Set up security": stores the acknowledgement (now + text version). */
  acknowledgePrivacy: (now?: Date) => Promise<boolean>;
  /**
   * After the PIN flow (and, later, biometrics): re-checks isSecuritySetupComplete() (a PIN
   * verifier in the secure store); resolves true when the gate may open the tabs.
   */
  completeSecuritySetup: () => Promise<boolean>;
  /**
   * Diagnostics (development builds only): back to the first onboarding screen; removes the
   * onboarding flags, the PIN verifier and the attempt record.
   */
  resetOnboarding: () => Promise<boolean>;
}

const SetupContext = createContext<SetupApi | null>(null);

/** Reads the saved setup state (never rejects: failed reads count as "not done"). */
export async function restoreSetupState(): Promise<SetupState> {
  const [progress, securitySetupComplete] = await Promise.all([
    loadOnboardingProgress(),
    isSecuritySetupComplete(),
  ]);
  return { ...progress, securitySetupComplete };
}

export function SetupProvider({ initial, children }: { initial: SetupState; children: ReactNode }) {
  const [state, setState] = useState<SetupState>(initial);

  const acknowledgePrivacy = useCallback(async (now: Date = new Date()) => {
    const privacyAcknowledgement = { at: now.toISOString(), version: PRIVACY_POLICY_VERSION };
    setState((s) => ({ ...s, onboardingCompleted: true, privacyAcknowledgement }));
    return saveOnboardingCompleted(privacyAcknowledgement);
  }, []);

  const completeSecuritySetup = useCallback(async () => {
    const complete = await isSecuritySetupComplete();
    setState((s) => ({ ...s, securitySetupComplete: complete }));
    return complete;
  }, []);

  const resetOnboarding = useCallback(async () => {
    const [cleared, pinDeleted] = await Promise.all([clearSetupProgress(), deletePinData()]);
    if (cleared && pinDeleted) {
      setState(INITIAL_SETUP_STATE);
    }
    return cleared && pinDeleted;
  }, []);

  const api = useMemo(
    () => ({ state, acknowledgePrivacy, completeSecuritySetup, resetOnboarding }),
    [state, acknowledgePrivacy, completeSecuritySetup, resetOnboarding],
  );
  return <SetupContext.Provider value={api}>{children}</SetupContext.Provider>;
}

export function useSetup(): SetupApi {
  const api = useContext(SetupContext);
  if (!api) throw new Error('useSetup() needs a <SetupProvider> above it');
  return api;
}

/** For a layout: null if the holder may be in `area`, else where the gate sends them. */
export function useGateRedirect(area: GateArea): string | null {
  return gateRedirect(useSetup().state, area);
}
