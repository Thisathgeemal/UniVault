/**
 * authenticate(): THE way to confirm the holder before anything sensitive (Decision 026,
 * docs/security/wallet-authentication.md). Never a bare biometric boolean.
 *
 *   const authenticate = useAuthenticate();
 *   const result = await authenticate({ reason: t('…') });   // { ok, method } | { ok: false, reason }
 *
 * 1. No PIN verifier → { ok: false, reason: 'no-pin' }.
 * 2. Biometric unlock on AND the phone available-strong (and not `pinOnly`): ONE OS prompt that
 *    releases the unlock secret (src/security/biometrics.ts). Released → { ok, 'biometric' }.
 *    Cancel, failure, OS lockout or error → the PIN prompt (no automatic repeat; its
 *    "Use fingerprint" button retries once). Biometrics changed (the item invalidated, or no
 *    strong biometric enrolled any more) → biometric unlock is turned off and the PIN prompt says so.
 * 3. PIN prompt (PinPrompt below, a full-screen modal around the shared PinCheck flow): the
 *    keypad, then the full-screen "Checking your PIN…" (≥ 400 ms; no Cancel, Back ignored) under
 *    the attempt limits (src/security/pin-attempts.ts); wrong → back to the keypad with the
 *    message (and the attempts left); the lockout countdown (announced at most every 10 s).
 *    Correct → { ok, 'pin' } straight away; Cancel or Android back → { ok: false, 'cancelled' }
 *    (or 'locked-out' while locked).
 * Results never contain a secret; the PIN and the unlock secret are never logged.
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { useTheme } from '../theme/use-theme';
import {
  detectBiometrics,
  disableBiometricUnlock,
  isBiometricEnabled,
  unlockWithBiometrics,
  type BiometricKind,
} from './biometrics';
import { withAuthActivity } from './auth-activity';
import { hasPinVerifier } from './pin';
import { PinCheck } from './PinCheck';
import { useBlockScreenCapture } from './screen-capture';

export type AuthMethod = 'biometric' | 'pin';
export type AuthFailure = 'cancelled' | 'locked-out' | 'no-pin';
export type AuthResult = { ok: true; method: AuthMethod } | { ok: false; reason: AuthFailure };

export interface AuthenticateOptions {
  /** Why the holder is asked (already translated): the OS prompt text and the PIN screen's line. */
  reason: string;
  /** PIN only (turning biometric unlock off must not be done with the biometric). */
  pinOnly?: boolean;
}

export type Authenticate = (options: AuthenticateOptions) => Promise<AuthResult>;

// the lock message and its announcement live with the shared PIN flow
export { COUNTDOWN_ANNOUNCE_MS, useLockMessage } from './PinCheck';

interface PinRequest {
  reason: string;
  notice: 'invalidated' | null;
  /** The PIN screen may offer ONE more biometric try. */
  biometricRetry: boolean;
  biometric: BiometricKind;
  resolve: (result: AuthResult) => void;
}

const AuthContext = createContext<Authenticate | null>(null);

/** Closes our open prompts (the app lock, after a long absence during one). */
export interface AuthControl {
  dismissPrompts: () => void;
}
const AuthControlContext = createContext<AuthControl | null>(null);

export function AuthenticationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<PinRequest | null>(null);
  const requestRef = useRef<PinRequest | null>(null);
  // bumped by dismissPrompts(): an authentication started before must not open a PIN prompt later
  const generation = useRef(0);
  const show = useCallback((next: PinRequest | null) => {
    requestRef.current = next;
    setRequest(next);
  }, []);

  const authenticateNow = useCallback<Authenticate>(
    async ({ reason, pinOnly = false }) => {
      const started = generation.current;
      if (!(await hasPinVerifier())) return { ok: false, reason: 'no-pin' };
      const [enabled, capability] = await Promise.all([isBiometricEnabled(), detectBiometrics()]);
      let notice: PinRequest['notice'] = null;
      let usable = enabled && capability.kind === 'available-strong';
      if (
        enabled &&
        (capability.kind === 'not-enrolled' || capability.kind === 'available-weak-only')
      ) {
        // the strong biometric the secret was bound to is gone: the OS has invalidated it
        await disableBiometricUnlock();
        notice = 'invalidated';
      }
      if (usable && !pinOnly) {
        const result = await unlockWithBiometrics(reason);
        // dismissed meanwhile (the app lock after a long absence): never report a late success
        if (generation.current !== started) return { ok: false, reason: 'cancelled' };
        if (result.ok) return { ok: true, method: 'biometric' };
        if (result.reason === 'invalidated') {
          notice = 'invalidated';
          usable = false;
        }
      }
      if (generation.current !== started) return { ok: false, reason: 'cancelled' };
      return new Promise<AuthResult>((resolve) => {
        show({
          reason,
          notice,
          biometricRetry: usable && !pinOnly,
          biometric: capability.biometric,
          resolve,
        });
      });
    },
    [show],
  );

  // marked as our own authentication, so the app lock ignores the OS sheet's app-state changes
  const authenticate = useCallback<Authenticate>(
    (options) => withAuthActivity(() => authenticateNow(options)),
    [authenticateNow],
  );

  const finish = useCallback(
    (result: AuthResult) => {
      requestRef.current?.resolve(result);
      show(null);
    },
    [show],
  );

  /** Resolves the open prompt as cancelled (no PIN checked, so no failed attempt counted). */
  const dismissPrompts = useCallback(() => {
    generation.current += 1;
    if (requestRef.current) finish({ ok: false, reason: 'cancelled' });
  }, [finish]);
  const control = useMemo(() => ({ dismissPrompts }), [dismissPrompts]);

  return (
    <AuthContext.Provider value={authenticate}>
      <AuthControlContext.Provider value={control}>
        {children}
        {request ? <PinPrompt request={request} onDone={finish} /> : null}
      </AuthControlContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuthControl(): AuthControl {
  const control = useContext(AuthControlContext);
  if (!control) throw new Error('useAuthControl() needs an <AuthenticationProvider> above it');
  return control;
}

export function useAuthenticate(): Authenticate {
  const authenticate = useContext(AuthContext);
  if (!authenticate)
    throw new Error('useAuthenticate() needs an <AuthenticationProvider> above it');
  return authenticate;
}

/** The PIN prompt: a full-screen modal around the shared PinCheck flow (src/security/PinCheck.tsx). */
function PinPrompt({ request, onDone }: { request: PinRequest; onDone: (r: AuthResult) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  useBlockScreenCapture();
  const kind = t(`biometrics.kind.${request.biometric}`);
  const [notice, setNotice] = useState(request.notice);
  const [canRetry, setCanRetry] = useState(request.biometricRetry);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  // while the PIN is checked there is no way out: no Cancel, and Android back is ignored
  const busy = useRef(false);

  const retryBiometric = async () => {
    setCanRetry(false); // once
    const result = await unlockWithBiometrics(request.reason);
    if (result.ok) onDone({ ok: true, method: 'biometric' });
    else if (result.reason === 'invalidated') setNotice('invalidated');
  };

  const cancel = (lockedOut: boolean) =>
    onDone({ ok: false, reason: lockedOut ? 'locked-out' : 'cancelled' });

  const onBack = () => {
    if (!busy.current) cancel(lockedUntil !== null);
  };

  return (
    <Modal visible animationType="none" onRequestClose={onBack} testID="pin-prompt-modal">
      <View
        testID="pin-prompt"
        accessibilityViewIsModal
        style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}
      >
        <PinCheck
          title={t('auth.title')}
          reason={request.reason}
          notice={
            notice === 'invalidated' ? (
              <AppText tone="error" accessibilityRole="alert" testID="pin-prompt-notice">
                {t('auth.invalidated', { kind })}
              </AppText>
            ) : null
          }
          onSuccess={() => onDone({ ok: true, method: 'pin' })}
          onCancel={cancel}
          onBusyChange={(next) => {
            busy.current = next;
          }}
          onLockChange={setLockedUntil}
          extraActions={
            canRetry && lockedUntil === null ? (
              <Button
                variant="secondary"
                icon="finger-print-outline"
                label={t('auth.useBiometric', { kind })}
                onPress={() => void retryBiometric()}
                testID="pin-prompt-biometric"
              />
            ) : null
          }
          testID="pin-prompt"
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
