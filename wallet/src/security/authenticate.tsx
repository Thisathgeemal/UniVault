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
 * 3. PIN prompt (PinPrompt below, a full-screen modal): PinPad + verifyPin under the attempt
 *    limits (src/security/pin-attempts.ts), "Checking your PIN…" while it runs, a live lockout
 *    countdown (announced at most every 10 s). Correct → { ok, 'pin' }; Cancel or Android back →
 *    { ok: false, 'cancelled' } (or 'locked-out' while locked).
 * Results never contain a secret; the PIN and the unlock secret are never logged.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Modal, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { BottomActions } from '../components/BottomActions';
import { Button } from '../components/Button';
import { MAX_READABLE_WIDTH } from '../theme';
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
import { checkPinWithLimits, currentPinLock } from './pin-attempts';
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

/** Screen readers hear the lockout countdown at most this often. */
export const COUNTDOWN_ANNOUNCE_MS = 10_000;

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

/** "30 seconds" / "5 minutes" / "1 hour" for the lock message (count picks the plural form). */
export function useLockMessage(lockedUntil: number | null, now: number): string | null {
  const { t } = useTranslation();
  if (lockedUntil === null) return null;
  const seconds = Math.max(1, Math.ceil((lockedUntil - now) / 1000));
  if (seconds < 60) return t('auth.lockedSeconds', { count: seconds, seconds });
  if (seconds < 3600) {
    const minutes = Math.ceil(seconds / 60);
    return t('auth.lockedMinutes', { count: minutes, minutes });
  }
  const hours = Math.ceil(seconds / 3600);
  return t('auth.lockedHours', { count: hours, hours });
}

function PinPrompt({ request, onDone }: { request: PinRequest; onDone: (r: AuthResult) => void }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  useBlockScreenCapture();
  const kind = t(`biometrics.kind.${request.biometric}`);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [wrong, setWrong] = useState(false);
  const [notice, setNotice] = useState(request.notice);
  const [canRetry, setCanRetry] = useState(request.biometricRetry);
  const lastAnnounced = useRef(0);

  // a lock from before (even before a restart) applies at once
  useEffect(() => {
    let active = true;
    void currentPinLock().then((until) => {
      if (active) setLockedUntil(until);
    });
    return () => {
      active = false;
    };
  }, []);

  // live countdown: tick every second while locked; unlock when it runs out
  useEffect(() => {
    if (lockedUntil === null) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) setLockedUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const lockMessage = useLockMessage(lockedUntil, now);

  // announce the lock, then at most every 10 s (the visible text updates every second)
  useEffect(() => {
    if (!lockMessage) {
      lastAnnounced.current = 0;
      return;
    }
    const current = Date.now();
    if (current - lastAnnounced.current >= COUNTDOWN_ANNOUNCE_MS) {
      lastAnnounced.current = current;
      AccessibilityInfo.announceForAccessibility(lockMessage);
    }
  }, [lockMessage]);

  const verify = async (pin: string) => {
    const result = await checkPinWithLimits(pin);
    if (!result.ok) {
      setNow(Date.now());
      setLockedUntil(result.lockedUntil);
    }
    return result.ok;
  };

  const retryBiometric = async () => {
    setCanRetry(false); // once
    const result = await unlockWithBiometrics(request.reason);
    if (result.ok) onDone({ ok: true, method: 'biometric' });
    else if (result.reason === 'invalidated') setNotice('invalidated');
  };

  const cancel = () =>
    onDone({ ok: false, reason: lockedUntil !== null ? 'locked-out' : 'cancelled' });

  return (
    <Modal visible animationType="none" onRequestClose={cancel} testID="pin-prompt-modal">
      <View
        testID="pin-prompt"
        accessibilityViewIsModal
        style={[styles.root, { backgroundColor: theme.colors.bg, paddingTop: insets.top }]}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
          ]}
        >
          <View style={{ gap: theme.space(2) }}>
            <AppText variant="h2" accessibilityRole="header" style={styles.centre}>
              {t('auth.title')}
            </AppText>
            <AppText tone="muted" style={styles.centre} testID="pin-prompt-reason">
              {request.reason}
            </AppText>
          </View>
          {notice === 'invalidated' ? (
            <AppText tone="error" accessibilityRole="alert" testID="pin-prompt-notice">
              {t('auth.invalidated', { kind })}
            </AppText>
          ) : null}
          {lockMessage ? (
            <AppText tone="error" testID="pin-prompt-locked">
              {lockMessage}
            </AppText>
          ) : (
            <>
              {wrong ? (
                <AppText tone="error" accessibilityRole="alert" testID="pin-prompt-wrong">
                  {t('auth.wrong')}
                </AppText>
              ) : null}
              <PinCheck
                verify={verify}
                onResult={(correct) => {
                  if (correct) onDone({ ok: true, method: 'pin' });
                  else setWrong(true);
                }}
                testID="pin-prompt-check"
              />
            </>
          )}
        </ScrollView>
        <BottomActions testID="pin-prompt-actions">
          {canRetry && lockedUntil === null ? (
            <Button
              variant="secondary"
              icon="finger-print-outline"
              label={t('auth.useBiometric', { kind })}
              onPress={() => void retryBiometric()}
              testID="pin-prompt-biometric"
            />
          ) : null}
          <Button
            variant="text"
            label={t('common.cancel')}
            onPress={cancel}
            testID="pin-prompt-cancel"
          />
        </BottomActions>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
  centre: { textAlign: 'center' },
});
