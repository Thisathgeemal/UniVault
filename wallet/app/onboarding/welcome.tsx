import { useTranslation } from 'react-i18next';
import { AppText } from '../../src/components';
import { WelcomeIllustration } from '../../src/onboarding/illustrations';
import { OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 2: what UniVault is, in one sentence. */
export default function OnboardingWelcomeScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="welcome"
      title={t('onboarding.welcome.title')}
      illustration={<WelcomeIllustration />}
    >
      <AppText>{t('onboarding.welcome.body')}</AppText>
      <AppText tone="muted">{t('onboarding.welcome.body2')}</AppText>
    </OnboardingStep>
  );
}
