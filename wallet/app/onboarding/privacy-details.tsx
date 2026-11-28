import { useTranslation } from 'react-i18next';
import { AppText, Card, Screen } from '../../src/components';
import { PRIVACY_POLICY_VERSION } from '../../src/onboarding/gate';

const SECTIONS = ['onPhone', 'sharing', 'univault', 'removing'] as const;

/** "Privacy details" (static text for now), opened from the Privacy step; Back returns to it. */
export default function PrivacyDetailsScreen() {
  const { t } = useTranslation();
  return (
    <Screen testID="privacy-details-screen">
      {SECTIONS.map((section) => (
        <Card key={section} title={t(`onboarding.privacyDetails.${section}Title`)}>
          <AppText>{t(`onboarding.privacyDetails.${section}`)}</AppText>
        </Card>
      ))}
      <AppText variant="caption" tone="muted" testID="privacy-version">
        {t('onboarding.privacyDetails.version', { version: PRIVACY_POLICY_VERSION })}
      </AppText>
    </Screen>
  );
}
