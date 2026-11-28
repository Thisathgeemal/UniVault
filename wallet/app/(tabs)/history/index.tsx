import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText, Card, EmptyState, ListItem, Screen } from '../../../src/components';
import { sampleDataEnabled } from '../../../src/config/app-info';
import { SAMPLE_HISTORY } from '../../../src/fixtures/sample-data';
import { formatDate } from '../../../src/lib/format';
import { ROUTES } from '../../../src/navigation/routes';

/** History tab root: on-device record of received and shared credentials (placeholder). */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();

  if (!sampleDataEnabled()) {
    return (
      <Screen testID="history-screen">
        <EmptyState
          icon="time-outline"
          title={t('history.emptyTitle')}
          message={t('history.emptyMessage')}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="history-screen">
      <AppText tone="muted">{t('sampleData.notice')}</AppText>
      <Card>
        {SAMPLE_HISTORY.map((entry) => (
          <ListItem
            key={entry.id}
            testID={`history-${entry.id}`}
            icon={entry.kind === 'shared' ? 'share-outline' : 'download-outline'}
            title={t(`history.kinds.${entry.kind}`)}
            subtitle={t('history.entrySubtitle', {
              party: entry.party,
              date: formatDate(entry.at, i18n.language),
            })}
            onPress={() => router.push(ROUTES.historyEntry(entry.id))}
          />
        ))}
      </Card>
    </Screen>
  );
}
