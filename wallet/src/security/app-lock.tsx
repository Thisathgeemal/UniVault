/**
 * App lock (Decision 026 consequences, docs/security/wallet-authentication.md §9).
 *
 * - `locked` lives in MEMORY ONLY (never persisted): a restart always starts locked once setup is
 *   complete (the gate's area is the tabs); onboarding and /setup/* are never locked.
 * - Leaving the app: only AppState 'background' arms the lock ('inactive' fires for the
 *   notification shade, calls and some biometric sheets). On 'active' the app locks when the time
 *   away ≥ the "Lock after leaving the app" delay (Immediately, 30 s, 1 min, 5 min), when the
 *   clock went backwards, or when the recorded time is missing.
 * - Our own prompts (src/security/auth-activity.ts) are exempt ONLY for short absences
 *   (authExemptionMs: at most 30 s); after a longer one the app locks and the open prompt is
 *   dismissed as cancelled (no failed PIN attempt). Every prompt that resolves re-checks, so a
 *   cancel never reveals the wallet when a lock is due. Release builds also block screen capture
 *   for the whole wallet (the Android recents thumbnail).
 * - Privacy cover: as soon as the app is not 'active' (and no authentication of ours is running)
 *   a navy cover with the UniVault mark hides everything, so the recent-apps snapshot shows
 *   nothing; in every build.
 * - Lock screen above the navigator: the navigator stays mounted (same screen and scroll
 *   position after unlock) but is hidden from accessibility and gets no touches. Unlock only
 *   through authenticate(); one automatic prompt per app-start / background lock; Android back
 *   leaves the app.
 * - `onLock(listener)`: called on every lock (the encrypted vault will clear decrypted data).
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
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../components/AppText';
import { BottomActions } from '../components/BottomActions';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import {
  DEFAULT_LOCK_DELAY,
  LOCK_DELAY_MS,
  saveLockDelayPreference,
  type LockDelay,
} from '../lib/preferences';
import { lockOnAppStart } from '../config/app-info';
import { useBrandStatusBarWhile } from '../navigation/status-bar';
import { requiredArea } from '../onboarding/gate';
import { useSetup } from '../onboarding/SetupProvider';
import { useTheme } from '../theme/use-theme';
import { isAuthActive } from './auth-activity';
import { useAuthControl, useAuthenticate, useLockMessage } from './authenticate';
import { onAuthActivityEnd } from './auth-activity';
import { useAppScreenCaptureBlock } from './screen-capture';
import { detectBiometrics, isBiometricEnabled } from './biometrics';
import { currentPinLock } from './pin-attempts';

export type LockReason = 'app-start' | 'background' | 'manual';

/**
 * Lock again after coming back? `awayFrom` is when the app went to the background (null or not a
 * number = unknown → lock); a clock that went backwards locks too.
 */
export function shouldLockOnReturn(awayFrom: number | null, now: number, delayMs: number): boolean {
  if (awayFrom === null || !Number.isFinite(awayFrom)) return true;
  if (now < awayFrom) return true;
  return now - awayFrom >= delayMs;
}

/**
 * How long one of OUR prompts may keep the app away without a lock: long enough for a biometric
 * sheet or a quick system dialog, at most 30 s and never longer than the lock delay. For
 * "Immediately" (0) the 30 s cap applies, or the fingerprint sheet itself (which some Android
 * phones report as 'background') would lock the wallet mid-prompt.
 */
export const AUTH_EXEMPTION_MAX_MS = 30_000;
export function authExemptionMs(delayMs: number): number {
  return delayMs === 0 ? AUTH_EXEMPTION_MAX_MS : Math.min(delayMs, AUTH_EXEMPTION_MAX_MS);
}

export interface LockApi {
  /** The app is locked (only ever true while setup is complete). */
  locked: boolean;
  lock: (reason: LockReason) => void;
  /** authenticate() (biometric or PIN); unlocks only when it returns ok. */
  unlock: (options?: { pinOnly?: boolean }) => Promise<boolean>;
  lastLockReason: LockReason | null;
  delay: LockDelay;
  setDelay: (delay: LockDelay) => Promise<boolean>;
  /** Called on every lock; returns the unsubscribe function. */
  onLock: (listener: (reason: LockReason) => void) => () => void;
}

const LockContext = createContext<LockApi | null>(null);

export function useLock(): LockApi {
  const api = useContext(LockContext);
  if (!api) throw new Error('useLock() needs a <LockProvider> above it');
  return api;
}

export function LockProvider({
  initialDelay = DEFAULT_LOCK_DELAY,
  children,
}: {
  initialDelay?: LockDelay;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const authenticate = useAuthenticate();
  const { state: setup } = useSetup();
  const protectedArea = requiredArea(setup) === 'app';
  const [startLocked] = useState(() => lockOnAppStart() && protectedArea);
  const [locked, setLocked] = useState(startLocked);
  const [lastLockReason, setLastLockReason] = useState<LockReason | null>(
    startLocked ? 'app-start' : null,
  );
  // a new lock event (key for the lock screen: one automatic prompt per app-start / background lock)
  const [lockEvent, setLockEvent] = useState({ id: 0, auto: startLocked });
  const [covered, setCovered] = useState(false);
  const [delay, setDelayState] = useState<LockDelay>(initialDelay);
  const listeners = useRef(new Set<(reason: LockReason) => void>());
  const awayFrom = useRef<number | null>(null);
  const armed = useRef(false);
  const delayRef = useRef(initialDelay);
  /** The app left while one of our authentications was running. */
  const awayDuringAuth = useRef(false);
  /** Mirrors the lock (set at once by lock(), so a re-check in the same tick sees it). */
  const lockedRef = useRef(startLocked);
  const appActive = useRef(true);
  const { dismissPrompts } = useAuthControl();

  const lock = useCallback((reason: LockReason) => {
    lockedRef.current = true;
    setLocked(true);
    setLastLockReason(reason);
    setLockEvent((e) => ({ id: e.id + 1, auto: reason !== 'manual' }));
    for (const listener of listeners.current) listener(reason);
  }, []);

  const unlock = useCallback(
    async ({ pinOnly = false }: { pinOnly?: boolean } = {}) => {
      const result = await authenticate({ reason: t('lock.reason'), pinOnly });
      if (result.ok) setLocked(false);
      return result.ok;
    },
    [authenticate, t],
  );

  const setDelay = useCallback(async (next: LockDelay) => {
    delayRef.current = next;
    setDelayState(next);
    return saveLockDelayPreference(next);
  }, []);

  const onLock = useCallback((listener: (reason: LockReason) => void) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  /**
   * The app left while one of our prompts was open and has been away longer than the exemption
   * window: lock and close the open prompt (resolved as cancelled, so no failed PIN attempt).
   * Already locked → nothing: the lock screen's own prompt is left alone.
   */
  const lockIfAwayTooLongDuringAuth = useCallback((): void => {
    if (!armed.current || !awayDuringAuth.current || lockedRef.current) return;
    const allowed = authExemptionMs(LOCK_DELAY_MS[delayRef.current]);
    if (!shouldLockOnReturn(awayFrom.current, Date.now(), allowed)) return;
    dismissPrompts();
    lock('background');
  }, [dismissPrompts, lock]);

  // AppState: cover when not active; arm on background; decide on active (see authExemptionMs)
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      appActive.current = next === 'active';
      if (next === 'active') {
        setCovered(false);
        if (!armed.current) return;
        if (awayDuringAuth.current) {
          // one of our prompts was open when the app left: a short system sheet is fine, a long
          // absence is not
          lockIfAwayTooLongDuringAuth();
        } else if (
          shouldLockOnReturn(awayFrom.current, Date.now(), LOCK_DELAY_MS[delayRef.current])
        ) {
          lock('background');
        }
        armed.current = false;
        awayFrom.current = null;
        awayDuringAuth.current = false;
        return;
      }
      if (next === 'background') {
        armed.current = true;
        awayFrom.current = Date.now();
        awayDuringAuth.current = isAuthActive();
      }
      if (!isAuthActive()) setCovered(true); // not over our own OS sheet
    });
    return () => subscription.remove();
  }, [lock, lockIfAwayTooLongDuringAuth]);

  // every prompt that resolves re-checks, so a cancel (or a failure) while the app is still away
  // never leaves the wallet unlocked when a lock is due
  useEffect(
    () =>
      onAuthActivityEnd(() => {
        if (!appActive.current) lockIfAwayTooLongDuringAuth();
      }),
    [lockIfAwayTooLongDuringAuth],
  );

  const isLocked = locked && protectedArea;
  useEffect(() => {
    lockedRef.current = isLocked;
  }, [isLocked]);
  // release builds: no screenshots or recents preview of the whole wallet (dev: Diagnostics switch)
  useAppScreenCaptureBlock();

  // Android back on the lock screen: leave the app (never reveal what is behind)
  useEffect(() => {
    if (!isLocked) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      BackHandler.exitApp();
      return true;
    });
    return () => subscription.remove();
  }, [isLocked]);

  const api = useMemo(
    () => ({ locked: isLocked, lock, unlock, lastLockReason, delay, setDelay, onLock }),
    [isLocked, lock, unlock, lastLockReason, delay, setDelay, onLock],
  );

  return (
    <LockContext.Provider value={api}>
      <View
        style={styles.fill}
        testID="lock-content"
        pointerEvents={isLocked ? 'none' : 'auto'}
        accessibilityElementsHidden={isLocked}
        importantForAccessibility={isLocked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>
      {isLocked ? <LockScreen key={lockEvent.id} autoPrompt={lockEvent.auto} /> : null}
      {covered ? <PrivacyCover /> : null}
    </LockContext.Provider>
  );
}

/** The UniVault mark on navy: a shield and the name (no content of the wallet). */
function UniVaultMark() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={[styles.mark, { gap: theme.space(3) }]}>
      <Icon name="shield-checkmark" size={64} color={theme.colors.onBrand} />
      <AppText variant="h2" tone="onBrand">
        {t('app.name')}
      </AppText>
    </View>
  );
}

/** What the recent-apps snapshot shows: navy and the mark, nothing else. */
function PrivacyCover() {
  const { t } = useTranslation();
  const theme = useTheme();
  useBrandStatusBarWhile(true);
  return (
    <View
      testID="privacy-cover"
      accessible
      accessibilityLabel={t('app.name')}
      style={[StyleSheet.absoluteFill, styles.centre, { backgroundColor: theme.colors.brand }]}
    >
      <UniVaultMark />
    </View>
  );
}

function LockScreen({ autoPrompt }: { autoPrompt: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { unlock } = useLock();
  useBrandStatusBarWhile(true);
  const [biometricOn, setBiometricOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const prompted = useRef(false);

  const refreshPinLock = useCallback(() => {
    void currentPinLock().then((until) => {
      setNow(Date.now());
      setPinLockedUntil(until);
    });
  }, []);

  const attempt = useCallback(
    async (pinOnly: boolean) => {
      setBusy(true);
      await unlock({ pinOnly });
      setBusy(false);
      refreshPinLock();
    },
    [unlock, refreshPinLock],
  );

  // biometrics on? (decides "Use PIN"); the current PIN lockout
  useEffect(() => {
    let active = true;
    void Promise.all([isBiometricEnabled(), detectBiometrics()]).then(([on, capability]) => {
      if (active) setBiometricOn(on && capability.kind === 'available-strong');
    });
    refreshPinLock();
    return () => {
      active = false;
    };
  }, [refreshPinLock]);

  // ONE automatic prompt when locked on app start or after leaving the app; never a loop
  useEffect(() => {
    if (!autoPrompt || prompted.current) return;
    prompted.current = true;
    void attempt(false);
  }, [autoPrompt, attempt]);

  // live countdown of a PIN lockout
  useEffect(() => {
    if (pinLockedUntil === null) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= pinLockedUntil) setPinLockedUntil(null);
    }, 1000);
    return () => clearInterval(timer);
  }, [pinLockedUntil]);
  const lockMessage = useLockMessage(pinLockedUntil, now);

  return (
    <View
      testID="lock-screen"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.bg }]}
    >
      <View
        style={[
          styles.brand,
          {
            backgroundColor: theme.colors.brand,
            paddingTop: insets.top + theme.space(6),
            gap: theme.space(4),
          },
        ]}
      >
        <UniVaultMark />
        <View style={[styles.centre, { gap: theme.space(1), paddingHorizontal: theme.space(4) }]}>
          <AppText variant="h2" tone="onBrand" accessibilityRole="header" style={styles.text}>
            {t('lock.title')}
          </AppText>
          <AppText tone="onBrandMuted" style={styles.text}>
            {t('lock.subtitle')}
          </AppText>
        </View>
      </View>
      <View style={[styles.fill, { padding: theme.space(4) }]}>
        {lockMessage ? (
          <AppText tone="error" testID="lock-screen-countdown" accessibilityLiveRegion="polite">
            {lockMessage}
          </AppText>
        ) : null}
      </View>
      <BottomActions testID="lock-screen-actions">
        <Button
          label={t('lock.unlock')}
          onPress={() => void attempt(false)}
          loading={busy}
          testID="lock-unlock"
        />
        {biometricOn ? (
          <Button
            variant="secondary"
            label={t('lock.usePin')}
            onPress={() => void attempt(true)}
            disabled={busy}
            testID="lock-use-pin"
          />
        ) : null}
      </BottomActions>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centre: { alignItems: 'center', justifyContent: 'center' },
  mark: { alignItems: 'center' },
  brand: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { textAlign: 'center' },
});
