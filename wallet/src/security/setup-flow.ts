/**
 * What happens after "PIN set" (app/setup/security.tsx).
 *
 * The phone's biometrics decide (src/security/biometrics.ts):
 *   - available-strong → the biometric step `/setup/biometrics` ("Use fingerprint to unlock?"),
 *     which calls completeSecuritySetup() itself when the holder turns it on or chooses Not now;
 *   - anything else → setup completes at once, and the success screen shows one line saying why
 *     biometric unlock is not offered (`unavailable`).
 */
import { ROUTES } from '../navigation/routes';
import { detectBiometrics, type BiometricCapabilityKind, type BiometricKind } from './biometrics';

export type AfterPinStep =
  | {
      kind: 'complete';
      unavailable: Exclude<BiometricCapabilityKind, 'available-strong'>;
      biometric: BiometricKind;
      fingerprintEnrolled: boolean;
    }
  | { kind: 'route'; href: string };

export async function stepAfterPinCreated(): Promise<AfterPinStep> {
  const capability = await detectBiometrics();
  if (capability.kind === 'available-strong')
    return { kind: 'route', href: ROUTES.setupBiometrics };
  return {
    kind: 'complete',
    unavailable: capability.kind,
    biometric: capability.biometric,
    fingerprintEnrolled: capability.fingerprintEnrolled,
  };
}
