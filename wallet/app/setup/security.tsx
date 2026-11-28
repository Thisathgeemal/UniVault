/**
 * "Set up your PIN": PLACEHOLDER for the PIN and biometric task, which replaces this screen.
 *
 * It explains what comes next. In DEVELOPMENT BUILDS only, a "Continue" button marks security
 * setup as done (the securitySetupCompleted placeholder flag) so the wallet can be reached; the
 * inline `__DEV__` gate drops it from release bundles, so a release build cannot get past this
 * screen until real security setup exists.
 */
import { useTranslation } from 'react-i18next';
import { AppText, Button, EmptyState, Screen, useToast } from '../../src/components';
import { securitySetupPlaceholderEnabled } from '../../src/config/app-info';
import { useSetup } from '../../src/onboarding/SetupProvider';

export default function SetupSecurityScreen() {
  const { t } = useTranslation();
  const toast = useToast();
  const { completeSecuritySetup } = useSetup();

  const continueDev = async () => {
    const saved = await completeSecuritySetup();
    if (!saved) toast.show({ message: t('setup.notSaved'), tone: 'danger' });
  };

  return (
    <Screen testID="setup-security-screen">
      <EmptyState icon="keypad-outline" title={t('setup.heading')} message={t('setup.body')} />
      <AppText tone="muted" testID="setup-coming-soon">
        {t('setup.comingSoon')}
      </AppText>
      {__DEV__ && securitySetupPlaceholderEnabled() ? (
        <>
          <AppText variant="caption" tone="muted">
            {t('setup.devNote')}
          </AppText>
          <Button
            label={t('setup.devContinue')}
            onPress={() => void continueDev()}
            testID="setup-dev-continue"
          />
        </>
      ) : null}
    </Screen>
  );
}
