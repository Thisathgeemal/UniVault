import { useTranslation } from 'react-i18next';
import { AppText, Card } from '../../src/components';
import { SelectiveDisclosureIllustration } from '../../src/onboarding/illustrations';
import { OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 4: you choose what to share, with the over-18 example in a card. */
export default function OnboardingSelectiveDisclosureScreen() {
  const { t } = useTranslation();
  return (
    <OnboardingStep
      step="selectiveDisclosure"
      title={t('onboarding.selectiveDisclosure.title')}
      lead={t('onboarding.selectiveDisclosure.body')}
      illustration={<SelectiveDisclosureIllustration />}
    >
      <Card title={t('onboarding.selectiveDisclosure.exampleTitle')} testID="onboarding-example">
        <AppText>{t('onboarding.selectiveDisclosure.example')}</AppText>
      </Card>
    </OnboardingStep>
  );
}
