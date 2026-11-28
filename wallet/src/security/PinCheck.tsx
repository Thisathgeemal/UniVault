/**
 * PinCheck: THE flow for entering a PIN to verify it (design-system.md "PIN checking pattern",
 * docs/security/wallet-authentication.md §5). Every PIN verification goes through it: today the
 * PIN prompt of authenticate() (src/security/authenticate.tsx), which the lock screen's PIN path,
 * Test unlock, turning biometric unlock off and every later approval use. Creating a PIN keeps its
 * own "Securing your PIN…" step (app/setup/security.tsx) with the same progress component.
 *
 *   entry ──6th digit──▶ checking (full screen, ≥ PIN_CHECK_MIN_MS) ──▶ correct: onSuccess()
 *     ▲                                   │ wrong: back to entry, digits cleared, shake,
 *     └───────────────────────────────────┘ "That PIN isn't right. Try again." (+ attempts left)
 *                                         └ limit reached: straight to the lockout countdown
 *
 * - Checking: the keypad and dots are replaced by the full-screen ProcessingState "Checking your
 *   PIN…" (announced); nothing else is on screen (no status text, no Cancel); the caller ignores
 *   Back while `onBusyChange(true)`.
 * - Correct: onSuccess() at once (announced "PIN correct"); no success screen.
 * - Wrong: "That PIN isn't right. Try again." above the keypad, plus "2 attempts left before a
 *   short wait." / "1 attempt left…" when that few remain before the next lockout (announced).
 * - Lockout (also one from before a restart): the countdown, no keypad, until it runs out.
 * The PIN never leaves this component except as the argument to `verify`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from '../components/AppText';
import { BottomActions } from '../components/BottomActions';
import { Button } from '../components/Button';
import { PinPad } from '../components/PinPad';
import { ProcessingState } from '../components/ProcessingState';
import { withMinimumDuration, yieldToUi } from '../lib/timing';
import { MAX_READABLE_WIDTH } from '../theme';
import { useTheme } from '../theme/use-theme';
import {
  checkPinWithLimits,
  currentPinLock,
  FREE_ATTEMPTS,
  type PinCheckResult,
} from './pin-attempts';

/** The checking screen stays at least this long, so it never flickers. */
export const PIN_CHECK_MIN_MS = 400;
/** Screen readers hear the lockout countdown at most this often. */
export const COUNTDOWN_ANNOUNCE_MS = 10_000;
/** "N attempts left before a short wait" is shown once this few (or fewer) remain. */
export const ATTEMPTS_LEFT_WARNING = 2;

/** Wrong PINs still possible before the next one locks PIN entry (0 once locking has started). */
export function attemptsBeforeLockout(failedAttempts: number): number {
  return Math.max(0, FREE_ATTEMPTS + 1 - failedAttempts);
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

export interface PinCheckProps {
  /** The heading ("Enter your PIN") and why the PIN is asked (already translated). */
  title: string;
  reason: string;
  /** A line under the reason (e.g. "Your fingerprint settings changed…"). */
  notice?: ReactNode;
  /** Correct PIN: continue to where the holder was going. */
  onSuccess: () => void;
  /** Cancel pressed; `lockedOut` when PIN entry is locked at that moment. */
  onCancel: (lockedOut: boolean) => void;
  /** Called with true while the PIN is checked (the caller ignores Back), false after. */
  onBusyChange?: (busy: boolean) => void;
  /** Called with the lock instant (or null) whenever it changes. */
  onLockChange?: (lockedUntil: number | null) => void;
  /** Extra buttons above Cancel (e.g. "Use fingerprint"), shown only at the keypad. */
  extraActions?: ReactNode;
  /** The check under the attempt limits (default checkPinWithLimits). */
  verify?: (pin: string) => Promise<PinCheckResult>;
  testID?: string;
}

type Phase = 'entry' | 'checking' | 'locked';

export function PinCheck({
  title,
  reason,
  notice,
  onSuccess,
  onCancel,
  onBusyChange,
  onLockChange,
  extraActions,
  verify = checkPinWithLimits,
  testID = 'pin-check',
}: PinCheckProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [phase, setPhase] = useState<Phase>('entry');
  const [entry, setEntry] = useState('');
  const [errorCount, setErrorCount] = useState(0);
  const [wrong, setWrong] = useState<{ attemptsLeft: number } | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const lastAnnounced = useRef(0);

  const lock = (until: number) => {
    setNow(Date.now());
    setLockedUntil(until);
    setPhase('locked');
  };

  // the caller hears about every change of the lock (Cancel then reports 'locked-out')
  useEffect(() => {
    onLockChange?.(lockedUntil);
  }, [lockedUntil, onLockChange]);

  // a lock from before (even before a restart) applies at once
  useEffect(() => {
    let active = true;
    void currentPinLock().then((until) => {
      if (active && until !== null) {
        setNow(Date.now());
        setLockedUntil(until);
        setPhase('locked');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // live countdown: tick every second while locked; back to the keypad when it runs out
  useEffect(() => {
    if (lockedUntil === null) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= lockedUntil) {
        setLockedUntil(null);
        setWrong(null);
        setPhase('entry');
      }
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

  const wrongMessage = wrong
    ? [
        t('auth.wrong'),
        wrong.attemptsLeft > 0 && wrong.attemptsLeft <= ATTEMPTS_LEFT_WARNING
          ? t('auth.attemptsLeft', { count: wrong.attemptsLeft })
          : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  const check = async (pin: string) => {
    setEntry(''); // the PIN leaves state at once
    setWrong(null);
    setPhase('checking');
    onBusyChange?.(true);
    await yieldToUi(); // draw "Checking your PIN…" before the hash starts
    let result: PinCheckResult;
    try {
      result = await withMinimumDuration(() => verify(pin), PIN_CHECK_MIN_MS);
    } catch {
      result = { ok: false, lockedUntil: null, failedAttempts: 0 };
    }
    onBusyChange?.(false);
    if (result.ok) {
      AccessibilityInfo.announceForAccessibility(t('auth.correct'));
      onSuccess();
      return;
    }
    if (result.lockedUntil !== null) {
      setErrorCount(0); // no shake when the keypad comes back after the wait
      lock(result.lockedUntil);
      return;
    }
    const next = { attemptsLeft: attemptsBeforeLockout(result.failedAttempts) };
    setWrong(next);
    setErrorCount((n) => n + 1);
    setPhase('entry');
  };

  // the result is announced once the keypad is back (the alert text is also a live region)
  useEffect(() => {
    if (wrongMessage) AccessibilityInfo.announceForAccessibility(wrongMessage);
  }, [wrongMessage]);

  if (phase === 'checking') {
    return (
      <View testID={`${testID}-flow`} style={styles.root}>
        <ProcessingState fullScreen message={t('pin.checking')} testID={`${testID}-checking`} />
      </View>
    );
  }

  return (
    <View testID={`${testID}-flow`} style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
        ]}
      >
        <View style={{ gap: theme.space(2) }}>
          <AppText variant="h2" accessibilityRole="header" style={styles.centre}>
            {title}
          </AppText>
          <AppText tone="muted" style={styles.centre} testID={`${testID}-reason`}>
            {reason}
          </AppText>
        </View>
        {notice}
        {phase === 'locked' && lockMessage ? (
          <AppText tone="error" testID={`${testID}-locked`}>
            {lockMessage}
          </AppText>
        ) : (
          <>
            {wrongMessage ? (
              <AppText
                tone="error"
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                testID={`${testID}-wrong`}
              >
                {wrongMessage}
              </AppText>
            ) : null}
            <PinPad
              value={entry}
              onChange={setEntry}
              onComplete={(pin) => void check(pin)}
              errorCount={errorCount}
            />
          </>
        )}
      </ScrollView>
      <BottomActions testID={`${testID}-actions`}>
        {phase === 'entry' ? extraActions : null}
        <Button
          variant="text"
          label={t('common.cancel')}
          onPress={() => onCancel(lockedUntil !== null)}
          testID={`${testID}-cancel`}
        />
      </BottomActions>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
  centre: { textAlign: 'center' },
});
