import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../../../src/components';

/** Security (placeholder): wallet lock and biometric unlock come with the secure-storage task. */
export default function SecurityScreen() {
  const { t } = useTranslation();
  return (
    <Screen testID="security-screen">
      <EmptyState
        icon="lock-closed-outline"
        title={t('security.placeholderTitle')}
        message={t('security.placeholderMessage')}
      />
    </Screen>
  );
}
