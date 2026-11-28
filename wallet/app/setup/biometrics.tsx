/**
 * Setup, after "PIN set", only when the phone has strong biometrics (stepAfterPinCreated):
 * "Use fingerprint to unlock?". Turn on → the OS biometric prompt stores the unlock secret
 * (enableBiometricUnlock); success → setup completes and the gate opens the tabs; failure or
 * cancel → it stays off with a short message (try again, or Not now). Not now → setup completes
 * with the PIN only. Biometric unlock can be changed later in Settings → Security. Above the
 * buttons: anyone whose fingerprint / face is saved on the phone could unlock (the platform
 * cannot tell which enrolled biometric matched); Turn on and Not now are both full width.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { AppText, BottomActions, Button, ProcessingState, useToast } from '../../src/components';
import { SharedBiometricNotice } from '../../src/security/SharedBiometricNotice';
import { SecurityIllustration } from '../../src/onboarding/illustrations';
import { useSetup } from '../../src/onboarding/SetupProvider';
import {
  detectBiometrics,
  enableBiometricUnlock,
  type BiometricKind,
} from '../../src/security/biometrics';
import { useBlockScreenCapture } from '../../src/security/screen-capture';
import { MAX_READABLE_WIDTH } from '../../src/theme';
import { useTheme } from '../../src/theme/use-theme';

export default function SetupBiometricsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const toast = useToast();
  const { completeSecuritySetup } = useSetup();
  useBlockScreenCapture();
  const [biometric, setBiometric] = useState<BiometricKind>('fingerprint');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const kind = t(`biometrics.kind.${biometric}`);

  useEffect(() => {
    let active = true;
    void detectBiometrics().then((capability) => {
      if (active) setBiometric(capability.biometric);
    });
    return () => {
      active = false;
    };
  }, []);

  const complete = async () => {
    if (!(await completeSecuritySetup())) {
      toast.show({ message: t('setup.notCompleted'), tone: 'danger' });
    }
  };

  const turnOn = async () => {
    setBusy(true);
    setFailed(false);
    const result = await enableBiometricUnlock(t('biometrics.enablePrompt', { kind }));
    setBusy(false);
    if (result.ok) {
      toast.show({ message: t('biometrics.turnedOn', { kind }), tone: 'success' });
      await complete();
    } else {
      setFailed(true);
    }
  };

  return (
    <View
      testID="setup-biometrics-screen"
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { padding: theme.space(4), paddingBottom: theme.space(6), gap: theme.space(6) },
        ]}
      >
        <View
          style={{
            backgroundColor: theme.colors.brandSoft,
            borderRadius: theme.radius.lg,
            padding: theme.space(4),
          }}
        >
          <SecurityIllustration />
        </View>
        <View style={{ gap: theme.space(2) }}>
          <AppText variant="h2" accessibilityRole="header" style={styles.centre}>
            {t(`setupBiometrics.title.${biometric}`)}
          </AppText>
          <AppText>{t(`setupBiometrics.body.${biometric}`)}</AppText>
          <AppText tone="muted">{t('setupBiometrics.pinStill')}</AppText>
        </View>
        {busy ? (
          <ProcessingState message={t('setupBiometrics.waiting')} testID="setup-biometrics-busy" />
        ) : null}
        {failed ? (
          <AppText tone="error" accessibilityRole="alert" testID="setup-biometrics-failed">
            {t('setupBiometrics.failed', { kind })}
          </AppText>
        ) : null}
      </ScrollView>
      <BottomActions
        testID="setup-biometrics-actions"
        above={<SharedBiometricNotice biometric={biometric} />}
      >
        <Button
          label={t('setupBiometrics.turnOn')}
          onPress={() => void turnOn()}
          loading={busy}
          testID="setup-biometrics-on"
        />
        <Button
          variant="secondary"
          label={t('setupBiometrics.notNow')}
          onPress={() => void complete()}
          disabled={busy}
          testID="setup-biometrics-not-now"
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
