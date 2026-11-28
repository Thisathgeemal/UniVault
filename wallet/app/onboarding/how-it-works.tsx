import { useTranslation } from 'react-i18next';
import { HowItWorksIllustration } from '../../src/onboarding/illustrations';
import { OnboardingNumberedStep, OnboardingStep } from '../../src/onboarding/OnboardingStep';

const STEPS = ['receive', 'keep', 'show'] as const;

/**
 * Step 3: issuer → holder → verifier: the three-figure drawing with role names, then the same
 * three steps as numbered rows (number, one-line title, one short sentence).
 */
export default function OnboardingHowItWorksScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="howItWorks"
      title={t('onboarding.howItWorks.title')}
      lead={t('onboarding.howItWorks.lead')}
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
      {STEPS.map((step, i) => (
        <OnboardingNumberedStep
          key={step}
          number={i + 1}
          title={t(`onboarding.howItWorks.${step}Title`)}
          body={t(`onboarding.howItWorks.${step}`)}
        />
      ))}
    </OnboardingStep>
  );
}
