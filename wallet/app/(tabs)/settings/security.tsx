/**
 * Settings → Security (Decision 026):
 * - what the phone supports (one status line);
 * - "Unlock with fingerprint" switch: ON stores the unlock secret behind the OS biometric prompt
 *   (enableBiometricUnlock: only for available-strong); OFF needs the PIN (authenticate with
 *   `pinOnly`) and deletes the secret;
 * - "Test unlock": authenticate({ reason: 'Test unlock' }) and the result (method, or why not);
 *   in every build, it changes nothing;
 * - "Lock after leaving the app" (the delay, a choice screen) and "Lock now" (the app lock);
 * - "Change PIN": shown, not yet available ("Coming soon", backlog: needs the current PIN).
 */
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import {
  AppText,
  Button,
  Card,
  ListItem,
  Screen,
  Section,
  Toggle,
  useToast,
} from '../../../src/components';
import { ROUTES } from '../../../src/navigation/routes';
import { useLock } from '../../../src/security/app-lock';
import { useAuthenticate, type AuthResult } from '../../../src/security/authenticate';
import { SharedBiometricNotice } from '../../../src/security/SharedBiometricNotice';
import {
  detectBiometrics,
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometricEnabled,
  unavailableMessageKey,
  type BiometricCapability,
} from '../../../src/security/biometrics';
import { LIST_ROW_MIN_HEIGHT } from '../../../src/theme';
import { useTheme } from '../../../src/theme/use-theme';

export default function SecurityScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const authenticate = useAuthenticate();
  const router = useRouter();
  const { delay, lock } = useLock();
  const [capability, setCapability] = useState<BiometricCapability | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<AuthResult | null>(null);

  /** Reads what the phone supports and whether biometric unlock is on. */
  const load = () => Promise.all([detectBiometrics(), isBiometricEnabled()]);
  const apply = ([cap, on]: [BiometricCapability, boolean]) => {
    setCapability(cap);
    setEnabled(on);
  };
  useEffect(() => {
    let active = true;
    void load().then((state) => {
      if (active) apply(state);
    });
    return () => {
      active = false;
    };
  }, []);

  const biometric = capability?.biometric ?? 'fingerprint';
  const kind = t(`biometrics.kind.${biometric}`);
  const available = capability?.kind === 'available-strong';
  const switchDisabled = busy || capability === null || (!available && !enabled);

  const toggle = async (on: boolean) => {
    setBusy(true);
    if (on) {
      const result = await enableBiometricUnlock(t('biometrics.enablePrompt', { kind }));
      toast.show(
        result.ok
          ? { message: t('biometrics.turnedOn', { kind }), tone: 'success' }
          : { message: t('biometrics.enableFailed', { kind }), tone: 'danger' },
      );
    } else {
      const result = await authenticate({
        reason: t('biometrics.disableReason', { kind }),
        pinOnly: true,
      });
      if (result.ok) {
        await disableBiometricUnlock();
        toast.show({ message: t('biometrics.turnedOff', { kind }), tone: 'success' });
      }
    }
    apply(await load());
    setBusy(false);
  };

  const testUnlock = async () => {
    setTestResult(null);
    setTestResult(await authenticate({ reason: t('security.testReason') }));
  };

  const resultText = (result: AuthResult): string =>
    result.ok
      ? result.method === 'biometric'
        ? t('security.testOkBiometric', { kind })
        : t('security.testOkPin')
      : t(`security.testFailed.${result.reason}`);

  return (
    <Screen testID="security-screen">
      <Section title={t('security.unlockSection')}>
        <Card>
          <View style={[styles.row, { gap: theme.space(3) }]}>
            <AppText style={styles.label}>{t('biometrics.switchLabel', { kind })}</AppText>
            <Toggle
              testID="biometric-switch"
              label={t('biometrics.switchLabel', { kind })}
              value={enabled}
              disabled={switchDisabled}
              {...(available || enabled ? {} : { hint: t('biometrics.switchUnavailable') })}
              onValueChange={(on) => void toggle(on)}
            />
          </View>
          {available || enabled ? (
            <>
              <SharedBiometricNotice biometric={biometric} />
              <AppText tone="muted" testID="biometric-pin-only">
                {t('biometrics.pinOnlyOption')}
              </AppText>
            </>
          ) : null}
          {capability ? (
            <AppText tone="muted" testID="biometric-status">
              {capability.kind === 'available-strong'
                ? t('biometrics.supported', { kind })
                : t(
                    unavailableMessageKey(
                      capability.kind,
                      capability.biometric,
                      capability.fingerprintEnrolled,
                    ),
                    { kind },
                  )}
            </AppText>
          ) : null}
        </Card>
      </Section>

      <Section title={t('security.lockSection')}>
        <Card>
          <ListItem
            testID="settings-lock-delay"
            icon="timer-outline"
            title={t('lockDelay.title')}
            value={t(`lockDelay.options.${delay}`)}
            onPress={() => router.push(ROUTES.lockDelay)}
          />
          <Button
            variant="secondary"
            icon="lock-closed-outline"
            label={t('security.lockNow')}
            onPress={() => lock('manual')}
            testID="lock-now"
          />
        </Card>
      </Section>

      <Section title={t('security.testSection')}>
        <Card>
          <AppText tone="muted">{t('security.testHint')}</AppText>
          <Button
            variant="secondary"
            label={t('security.testButton')}
            onPress={() => void testUnlock()}
            testID="test-unlock"
          />
          {testResult ? (
            <AppText
              testID="test-unlock-result"
              tone={testResult.ok ? 'default' : 'error'}
              accessibilityLiveRegion="polite"
            >
              {resultText(testResult)}
            </AppText>
          ) : null}
        </Card>
      </Section>

      <Section title={t('security.pinSection')}>
        <Card>
          <ListItem
            testID="change-pin"
            icon="keypad-outline"
            title={t('security.changePin')}
            value={t('security.comingSoon')}
          />
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: LIST_ROW_MIN_HEIGHT },
  label: { flex: 1, flexShrink: 1 },
});
