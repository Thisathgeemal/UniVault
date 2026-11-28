import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Card, EmptyState, ListItem, Screen, StatusBadge } from '../../../src/components';
import { sampleDataEnabled } from '../../../src/config/app-info';
import { findSampleCredential, sampleStatus } from '../../../src/fixtures/sample-data';
import { formatDate } from '../../../src/lib/format';
import { ROUTES } from '../../../src/navigation/routes';

/** Credential detail (placeholder on sample data; the vault and sharing come later). */
export default function CredentialDetailScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const credential =
    sampleDataEnabled() && typeof id === 'string' ? findSampleCredential(id) : undefined;

  if (!credential) {
    return (
      <Screen testID="credential-detail-screen">
        <EmptyState
          icon="document-outline"
          title={t('credentials.notFoundTitle')}
          message={t('credentials.notFoundMessage')}
          action={{
            label: t('credentials.backToList'),
            onPress: () => router.dismissTo(ROUTES.credentials),
          }}
        />
      </Screen>
    );
  }

  const status = sampleStatus(credential);
  return (
    <Screen testID="credential-detail-screen" title={t(`credentialTypes.${credential.type}`)}>
      <StatusBadge status={status} />
      <Card>
        <ListItem title={t('credentials.fields.issuer')} subtitle={credential.issuerName} />
        <ListItem title={t('credentials.fields.holder')} subtitle={credential.holderName} />
        <ListItem
          title={t('credentials.fields.expires')}
          subtitle={formatDate(credential.expiresAt, i18n.language)}
        />
      </Card>
      <AppText tone="muted">{t('credentials.detailPlaceholder')}</AppText>
    </Screen>
  );
}
