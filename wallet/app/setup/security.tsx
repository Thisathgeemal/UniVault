/**
 * Security setup: the PIN flow (Decision 025, docs/security/wallet-pin.md).
 *
 *   intro → create → confirm → saving (full screen) → success "PIN set" → Continue →
 *   stepAfterPinCreated()
 *
 * - Create: the PIN must pass the rules (src/security/pin-rules.ts); a weak one is refused with
 *   one plain message and the entry is cleared.
 * - Confirm: a mismatch says so and clears the entry; after 3 mismatches the flow goes back to
 *   create ("Let's start again"). A match removes the keypad at once and shows the full-screen
 *   progress state "Securing your PIN…" (announced) for at least 600 ms while the PIN is hashed
 *   and stored; "PIN set" only after the save resolved. A failed save goes back to Create PIN with
 *   "Something went wrong. Please create your PIN again." (no technical detail).
 * - Success: the success state (check mark, "PIN set" announced, one line) and Continue.
 * - Continue: stepAfterPinCreated() (src/security/setup-flow.ts, decided when the PIN is saved):
 *   the biometric step when the phone has strong biometrics, otherwise setup completes and the
 *   gate opens the tabs ("PIN set" then shows one line on why biometric unlock is not offered).
 * The PIN lives only in this screen: the entry in state (cleared the moment it is complete) and
 * the first PIN in a ref until it is confirmed and hashed, then cleared. Nothing goes into route
 * params, logs, errors or AsyncStorage. Screen capture is blocked here in release builds.
 * Android back: confirm → create → intro; from the intro the app goes to the background; never
 * during the save.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import {
  AppText,
  BottomActions,
  Button,
  PinPad,
  ProcessingState,
  SuccessState,
  useToast,
} from '../../src/components';
import { withMinimumDuration, yieldToUi } from '../../src/lib/timing';
import { SecurityIllustration } from '../../src/onboarding/illustrations';
import { useSetup } from '../../src/onboarding/SetupProvider';
import { savePin } from '../../src/security/pin';
import { pinProblem } from '../../src/security/pin-rules';
import { useBlockScreenCapture } from '../../src/security/screen-capture';
import { unavailableMessageKey } from '../../src/security/biometrics';
import { stepAfterPinCreated, type AfterPinStep } from '../../src/security/setup-flow';
import { MAX_READABLE_WIDTH } from '../../src/theme';
import { useTheme } from '../../src/theme/use-theme';

export type PinPhase = 'intro' | 'create' | 'confirm' | 'saving' | 'success';
type Message = 'weak' | 'mismatch' | 'restart' | 'saveFailed' | null;

/** Mismatches allowed in the confirm step before starting again. */
export const MAX_CONFIRM_MISMATCHES = 3;

const MESSAGE_KEYS = {
  weak: 'setup.weak',
  mismatch: 'setup.mismatch',
  restart: 'setup.restart',
  saveFailed: 'setup.saveFailed',
} as const;

export default function SetupSecurityScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { completeSecuritySetup } = useSetup();
  useBlockScreenCapture();

  const [phase, setPhase] = useState<PinPhase>('intro');
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<Message>(null);
  const [errorCount, setErrorCount] = useState(0);
  const firstPin = useRef<string | null>(null);
  // decided when the PIN is saved: the biometric step, or why there is none (shown on "PIN set")
  const [after, setAfter] = useState<AfterPinStep | null>(null);
  const mismatches = useRef(0);

  const signal = (next: Message) => {
    setMessage(next);
    setErrorCount((n) => n + 1);
  };

  const restart = useCallback((next: Message) => {
    firstPin.current = null;
    mismatches.current = 0;
    setEntry('');
    setMessage(next);
    setPhase('create');
  }, []);

  const onCreate = (pin: string) => {
    setEntry(''); // the PIN leaves state at once
    if (pinProblem(pin) !== null) {
      signal('weak');
      return;
    }
    firstPin.current = pin;
    setMessage(null);
    setPhase('confirm');
  };

  const onConfirm = async (pin: string) => {
    setEntry('');
    if (pin !== firstPin.current) {
      mismatches.current += 1;
      if (mismatches.current >= MAX_CONFIRM_MISMATCHES) {
        restart('restart');
        setErrorCount((n) => n + 1);
      } else {
        signal('mismatch');
      }
      return;
    }
    await save(pin);
  };

  /**
   * Hash and store behind the full-screen progress state (the keypad is gone, so nothing more can
   * be typed), shown for at least PROCESSING_MIN_MS and drawn before scrypt starts; "PIN set" only
   * once the save resolved. A failure starts again at Create PIN with a plain message.
   */
  const save = async (pin: string) => {
    setPhase('saving');
    setMessage(null);
    await yieldToUi();
    try {
      await withMinimumDuration(() => savePin(pin));
      firstPin.current = null;
      mismatches.current = 0;
      setAfter(await stepAfterPinCreated());
      setPhase('success');
    } catch {
      restart('saveFailed');
    }
  };

  const finish = async () => {
    if (after?.kind === 'route') {
      router.push(after.href);
      return;
    }
    // the gate opens the tabs as soon as the stored verifier is confirmed
    if (!(await completeSecuritySetup())) {
      toast.show({ message: t('setup.notCompleted'), tone: 'danger' });
    }
  };

  // Android back: one step back inside the flow; from the intro the app goes to the background
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (phase === 'saving') return true; // never interrupt a save
        if (phase === 'confirm') {
          restart(null);
          return true;
        }
        if (phase === 'create') {
          setEntry('');
          setMessage(null);
          setPhase('intro');
          return true;
        }
        return false;
      });
      return () => subscription.remove();
    }, [phase, restart]),
  );

  const root = [styles.root, { backgroundColor: theme.colors.bg }];

  if (phase === 'saving') {
    return (
      <View testID="setup-security-screen" style={root}>
        <ProcessingState fullScreen message={t('setup.saving')} testID="setup-saving" />
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <View testID="setup-security-screen" style={root}>
        <SuccessState
          title={t('setup.success.title')}
          body={t('setup.success.body')}
          testID="setup-success"
          titleTestID="setup-title"
        >
          {after?.kind === 'complete' ? (
            <AppText tone="muted" style={styles.centre} testID="setup-biometric-unavailable">
              {t(
                unavailableMessageKey(
                  after.unavailable,
                  after.biometric,
                  after.fingerprintEnrolled,
                ),
                { kind: t(`biometrics.kind.${after.biometric}`) },
              )}
            </AppText>
          ) : null}
        </SuccessState>
        <BottomActions testID="setup-actions">
          <Button
            label={t('setup.success.cta')}
            onPress={() => void finish()}
            testID="setup-continue"
          />
        </BottomActions>
      </View>
    );
  }

  return (
    <View testID="setup-security-screen" style={root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
        ]}
      >
        {phase === 'intro' ? (
          <View
            testID="setup-illustration"
            style={{
              backgroundColor: theme.colors.brandSoft,
              borderRadius: theme.radius.lg,
              padding: theme.space(4),
            }}
          >
            <SecurityIllustration />
          </View>
        ) : null}
        <View style={{ gap: theme.space(2) }}>
          <AppText
            variant="h2"
            accessibilityRole="header"
            style={styles.centre}
            testID="setup-title"
          >
            {t(`setup.${phase}.title`)}
          </AppText>
          <AppText>{t(`setup.${phase}.body`)}</AppText>
        </View>

        {message ? (
          <AppText
            tone="error"
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            testID="setup-message"
          >
            {t(MESSAGE_KEYS[message])}
          </AppText>
        ) : null}

        {phase === 'create' || phase === 'confirm' ? (
          <PinPad
            value={entry}
            onChange={setEntry}
            onComplete={(pin) => (phase === 'create' ? onCreate(pin) : void onConfirm(pin))}
            errorCount={errorCount}
          />
        ) : null}
      </ScrollView>

      {phase === 'intro' ? (
        <BottomActions testID="setup-actions">
          <Button
            label={t('setup.intro.cta')}
            onPress={() => setPhase('create')}
            testID="setup-start"
          />
        </BottomActions>
      ) : null}
      {phase === 'confirm' ? (
        <BottomActions testID="setup-actions">
          <Button
            variant="secondary"
            label={t('setup.startAgain')}
            onPress={() => restart(null)}
            testID="setup-start-again"
          />
        </BottomActions>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
  // hero headings (h2) are centred (design-system.md, Wallet typography and layout)
  centre: { textAlign: 'center' },
});
