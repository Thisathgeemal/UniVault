import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Card, EmptyState, ListItem, Screen } from '../../../src/components';
import { sampleDataEnabled } from '../../../src/config/app-info';
import { findSampleCredential, findSampleHistoryEntry } from '../../../src/fixtures/sample-data';
import { formatDate } from '../../../src/lib/format';
import { ROUTES } from '../../../src/navigation/routes';

/** One history entry (placeholder on sample data). */
export default function HistoryEntryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry =
    sampleDataEnabled() && typeof id === 'string' ? findSampleHistoryEntry(id) : undefined;

  if (!entry) {
    return (
      <Screen testID="history-detail-screen">
        <EmptyState
          icon="document-outline"
          title={t('history.notFoundTitle')}
          message={t('history.notFoundMessage')}
          action={{
            label: t('history.backToList'),
            onPress: () => router.dismissTo(ROUTES.history),
          }}
        />
      </Screen>
    );
  }

  const credential = findSampleCredential(entry.credentialId);
  return (
    <Screen testID="history-detail-screen" title={t(`history.kinds.${entry.kind}`)}>
      <Card>
        <ListItem label={t('history.fields.with')} title={entry.party} />
        <ListItem label={t('history.fields.when')} title={formatDate(entry.at, i18n.language)} />
        {credential ? (
          <ListItem
            label={t('history.fields.credential')}
            title={t(`credentialTypes.${credential.type}`)}
            onPress={() => router.navigate(ROUTES.credential(credential.id))}
          />
        ) : null}
      </Card>
      <AppText tone="muted">{t('history.detailPlaceholder')}</AppText>
    </Screen>
  );
}
