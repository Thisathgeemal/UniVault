import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { AppText } from '../../src/components';
import { SelectiveDisclosureIllustration } from '../../src/onboarding/illustrations';
import { OnboardingStep } from '../../src/onboarding/OnboardingStep';
import { useTheme } from '../../src/theme/use-theme';

/** Step 4: you choose what to share, with the over-18 example on a brand-soft panel. */
export default function OnboardingSelectiveDisclosureScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <OnboardingStep
      step="selectiveDisclosure"
      title={t('onboarding.selectiveDisclosure.title')}
      illustration={<SelectiveDisclosureIllustration />}
    >
      <AppText>{t('onboarding.selectiveDisclosure.body')}</AppText>
      <View
        testID="onboarding-example"
        style={{
          backgroundColor: theme.colors.brandSoft,
          borderRadius: theme.radius.md,
          padding: theme.space(4),
          gap: theme.space(1),
        }}
      >
        <AppText variant="h3" accessibilityRole="header">
          {t('onboarding.selectiveDisclosure.exampleTitle')}
        </AppText>
        {/* text on brand-soft is text or text-muted, never text-subtle (dark 4.04:1) */}
        <AppText tone="muted">{t('onboarding.selectiveDisclosure.example')}</AppText>
      </View>
    </OnboardingStep>
  );
}
