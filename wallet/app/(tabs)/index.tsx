import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../../src/components';

/** Credentials tab: the holder's stored credentials (the vault arrives in a later task). */
export default function CredentialsScreen() {
  const { t } = useTranslation();
  return (
    <Screen testID="credentials-screen">
      <EmptyState
        icon="wallet-outline"
        title={t('credentials.emptyTitle')}
        message={t('credentials.emptyMessage')}
      />
    </Screen>
  );
}
