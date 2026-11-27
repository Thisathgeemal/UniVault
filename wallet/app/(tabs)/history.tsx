import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../../src/components';

/** History tab: on-device record of received and shared credentials (later tasks). */
export default function HistoryScreen() {
  const { t } = useTranslation();
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
