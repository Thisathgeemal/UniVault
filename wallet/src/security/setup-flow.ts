/**
 * What happens after "PIN set" (app/setup/security.tsx, Continue).
 *
 * BIOMETRIC HOOK: the biometric-setup task inserts its step HERE: return
 * `{ kind: 'route', href: ROUTES.setupBiometrics }` (a new app/setup/biometrics.tsx that calls
 * `completeSecuritySetup()` itself when done or skipped). Today there is no further step, so
 * setup completes and the gate opens the tabs.
 */
export type AfterPinStep = { kind: 'complete' } | { kind: 'route'; href: string };

export function stepAfterPinCreated(): AfterPinStep {
  return { kind: 'complete' };
}
