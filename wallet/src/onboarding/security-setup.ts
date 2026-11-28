/**
 * Has the holder set up the wallet's security (PIN, and optionally fingerprint / face)?
 *
 * PLACEHOLDER (28 Nov 2026): returns the `univault.securitySetupCompleted` preference, which the
 * placeholder screen app/setup/security.tsx sets in development builds only. The PIN and
 * biometric task REPLACES THE BODY of this function with a check against the secure store
 * (expo-secure-store: the PIN verifier / wallet key exists), removes the preference from
 * PREFERENCE_KEYS and the placeholder button. Nothing else changes: the gate
 * (src/onboarding/gate.ts) and SetupProvider only ever call this function.
 *
 * Never rejects: a failing read means "not set up", so the holder is sent to setup, never past it.
 */
import { loadSecuritySetupFlag } from '../lib/preferences';

export async function isSecuritySetupComplete(): Promise<boolean> {
  return loadSecuritySetupFlag();
}
