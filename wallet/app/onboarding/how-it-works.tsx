import { useTranslation } from 'react-i18next';
import { HowItWorksIllustration } from '../../src/onboarding/illustrations';
import { OnboardingPoint, OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 3: issuer → holder → verifier in three plain sentences. */
export default function OnboardingHowItWorksScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="howItWorks"
      title={t('onboarding.howItWorks.title')}
      illustration={
        <HowItWorksIllustration
          labels={[
            t('onboarding.howItWorks.issuer'),
            t('onboarding.howItWorks.holder'),
            t('onboarding.howItWorks.verifier'),
          ]}
        />
      }
    >
      <OnboardingPoint icon="business-outline">{t('onboarding.howItWorks.issue')}</OnboardingPoint>
      <OnboardingPoint icon="phone-portrait-outline">
        {t('onboarding.howItWorks.keep')}
      </OnboardingPoint>
      <OnboardingPoint icon="search-outline">{t('onboarding.howItWorks.show')}</OnboardingPoint>
    </OnboardingStep>
  );
}
