import { useTranslation } from 'react-i18next';
import { WelcomeIllustration } from '../../src/onboarding/illustrations';
import { OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 2: what UniVault is, in two short centred sentences. */
export default function OnboardingWelcomeScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="welcome"
      title={t('onboarding.welcome.title')}
      lead={[t('onboarding.welcome.body'), t('onboarding.welcome.body2')]}
      illustration={<WelcomeIllustration />}
    />
  );
}
