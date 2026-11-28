import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, CredentialCard, EmptyState, Screen } from '../../../src/components';
import { sampleDataEnabled } from '../../../src/config/app-info';
import { SAMPLE_CREDENTIALS, sampleStatus } from '../../../src/fixtures/sample-data';
import { ROUTES } from '../../../src/navigation/routes';

/**
 * Credentials tab root. Until the vault exists: the empty state in release builds, synthetic
 * sample cards (clearly labelled) in development builds so the detail screen can be reached.
 */
export default function CredentialsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  if (!sampleDataEnabled()) {
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

  return (
    <Screen testID="credentials-screen">
      <AppText tone="muted" testID="sample-notice">
        {t('sampleData.notice')}
      </AppText>
      {SAMPLE_CREDENTIALS.map((credential) => (
        <CredentialCard
          key={credential.id}
          testID={`credential-${credential.id}`}
          issuerName={credential.issuerName}
          typeLabel={t(`credentialTypes.${credential.type}`)}
          holderName={credential.holderName}
          expiresAt={credential.expiresAt}
          status={sampleStatus(credential)}
          onPress={() => router.push(ROUTES.credential(credential.id))}
        />
      ))}
    </Screen>
  );
}
