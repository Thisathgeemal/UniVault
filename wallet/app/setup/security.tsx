/**
 * Security setup: the PIN flow (Decision 025, docs/security/wallet-pin.md).
 *
 *   intro → create → confirm → (saving) → success "PIN set" → Continue → stepAfterPinCreated()
 *
 * - Create: the PIN must pass the rules (src/security/pin-rules.ts); a weak one is refused with
 *   one plain message and the entry is cleared.
 * - Confirm: a mismatch says so and clears the entry; after 3 mismatches the flow goes back to
 *   create ("Let's start again"). A match is hashed and stored (savePin: scrypt verifier in the
 *   secure store, this device only).
 * - Continue: stepAfterPinCreated() (src/security/setup-flow.ts) is where the biometric task
 *   inserts its step; today it completes setup and the gate opens the tabs.
 * The PIN lives only in this screen: the entry in state (cleared the moment it is complete) and
 * the first PIN in a ref until it is confirmed and hashed, then cleared. Nothing goes into route
 * params, logs, errors or AsyncStorage. Screen capture is blocked here in release builds.
 * Android back: confirm → create → intro; from the intro the app goes to the background.
 */
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BackHandler, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, BottomActions, Button, Icon, PinPad, useToast } from '../../src/components';
import { SecurityIllustration } from '../../src/onboarding/illustrations';
import { useSetup } from '../../src/onboarding/SetupProvider';
import { savePin } from '../../src/security/pin';
import { pinProblem } from '../../src/security/pin-rules';
import { useBlockScreenCapture } from '../../src/security/screen-capture';
import { stepAfterPinCreated } from '../../src/security/setup-flow';
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
    setPhase('saving');
    setMessage(null);
    try {
      await savePin(pin);
      firstPin.current = null;
      mismatches.current = 0;
      setPhase('success');
    } catch {
      restart('saveFailed');
    }
  };

  const finish = async () => {
    const next = stepAfterPinCreated();
    if (next.kind === 'route') {
      router.push(next.href);
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

  const step = phase === 'saving' ? 'confirm' : phase;

  return (
    <View
      testID="setup-security-screen"
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
        ]}
      >
        {step === 'intro' ? (
          <View
            testID="setup-illustration"
            style={{
              backgroundColor: theme.colors.brand,
              borderRadius: theme.radius.lg,
              padding: theme.space(4),
            }}
          >
            <SecurityIllustration />
          </View>
        ) : null}
        {step === 'success' ? (
          <View style={styles.center}>
            <Icon name="checkmark-circle" size={64} color={theme.colors.accentText} />
          </View>
        ) : null}
        <View style={{ gap: theme.space(2) }}>
          <AppText
            variant="h1"
            accessibilityRole="header"
            style={styles.heroTitle}
            testID="setup-title"
          >
            {t(`setup.${step}.title`)}
          </AppText>
          <AppText>{t(`setup.${step}.body`)}</AppText>
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

        {step === 'create' || step === 'confirm' ? (
          <PinPad
            value={entry}
            onChange={setEntry}
            onComplete={(pin) => (step === 'create' ? onCreate(pin) : void onConfirm(pin))}
            errorCount={errorCount}
            disabled={phase === 'saving'}
          />
        ) : null}
        {phase === 'saving' ? (
          <AppText variant="bodySm" tone="muted" accessibilityLiveRegion="polite">
            {t('setup.saving')}
          </AppText>
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
      {phase === 'success' ? (
        <BottomActions testID="setup-actions">
          <Button
            label={t('setup.success.cta')}
            onPress={() => void finish()}
            testID="setup-continue"
          />
        </BottomActions>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
  center: { alignItems: 'center' },
  // hero headings are the one centred text (design-system.md, Wallet typography and layout)
  heroTitle: { textAlign: 'center' },
});
