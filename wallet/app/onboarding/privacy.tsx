import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Checkbox, useToast } from '../../src/components';
import { ROUTES } from '../../src/navigation/routes';
import { PrivacyIllustration } from '../../src/onboarding/illustrations';
import { OnboardingPoint, OnboardingStep } from '../../src/onboarding/OnboardingStep';
import { useSetup } from '../../src/onboarding/SetupProvider';

/**
 * Step 6 (last): what stays on the phone, what is shared and when, nothing sent to UniVault.
 * "Set up security" stays disabled until "I understand" is ticked; it stores the acknowledgement
 * (date + PRIVACY_POLICY_VERSION) and onboarding as done, and the gate moves the holder on to
 * /setup/security. Skip and swipes never pass this screen.
 */
export default function OnboardingPrivacyScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const toast = useToast();
  const { acknowledgePrivacy } = useSetup();
  const [understood, setUnderstood] = useState(false);

  const finish = async () => {
    const saved = await acknowledgePrivacy();
    if (!saved) toast.show({ message: i18n.t('onboarding.privacy.notSaved'), tone: 'danger' });
  };

  return (
    <OnboardingStep
      step="privacy"
      title={t('onboarding.privacy.title')}
      illustration={<PrivacyIllustration />}
      primary={{
        label: t('onboarding.privacy.cta'),
        onPress: () => void finish(),
        disabled: !understood,
        accessibilityHint: t('onboarding.privacy.ctaHint'),
      }}
    >
      <OnboardingPoint icon="phone-portrait-outline">
        {t('onboarding.privacy.stays')}
      </OnboardingPoint>
      <OnboardingPoint icon="hand-left-outline">{t('onboarding.privacy.shared')}</OnboardingPoint>
      <OnboardingPoint icon="cloud-offline-outline">
        {t('onboarding.privacy.noUniVault')}
      </OnboardingPoint>
      <View>
        <Button
          variant="text"
          label={t('onboarding.privacy.detailsLink')}
          onPress={() => router.push(ROUTES.onboardingPrivacyDetails)}
          testID="onboarding-privacy-details"
        />
      </View>
      <Checkbox
        label={t('onboarding.privacy.understand')}
        checked={understood}
        onChange={setUnderstood}
        testID="onboarding-understand"
      />
    </OnboardingStep>
  );
}
