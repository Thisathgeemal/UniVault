/**
 * Has the holder set up the wallet's security?
 *
 * True only if a well-formed PIN verifier is in the secure store (src/security/pin.ts, Decision
 * 025). The biometric task adds nothing here: the PIN is always the base factor. The gate
 * (src/onboarding/gate.ts) and SetupProvider only ever call this function.
 *
 * Async (a secure-store read): the root layout awaits it under the splash screen
 * (restoreAppState), so the tabs never flash before the answer is known. Never rejects: a
 * failing read means "not set up", so the holder is sent to setup, never past it.
 */
import { hasPinVerifier } from '../security/pin';

export async function isSecuritySetupComplete(): Promise<boolean> {
  return hasPinVerifier();
}
