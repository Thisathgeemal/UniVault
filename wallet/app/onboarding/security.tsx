import { useTranslation } from 'react-i18next';
import { SecurityIllustration } from '../../src/onboarding/illustrations';
import { OnboardingPoint, OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 5: PIN or fingerprint before every share, encrypted on the phone, works offline. */
export default function OnboardingSecurityScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="security"
      title={t('onboarding.security.title')}
      lead={t('onboarding.security.lead')}
      illustration={<SecurityIllustration />}
    >
      <OnboardingPoint icon="finger-print-outline">{t('onboarding.security.pin')}</OnboardingPoint>
      <OnboardingPoint icon="lock-closed-outline">
        {t('onboarding.security.encrypted')}
      </OnboardingPoint>
      <OnboardingPoint icon="cloud-offline-outline">
        {t('onboarding.security.offline')}
      </OnboardingPoint>
    </OnboardingStep>
  );
}
