import { useTranslation } from 'react-i18next';
import { EmptyState, Screen } from '../../../src/components';

/** Scan tab: QR scanning of credential offers and verification requests (camera: later task). */
export default function ScanScreen() {
  const { t } = useTranslation();
  return (
    <Screen testID="scan-screen">
      <EmptyState
        icon="qr-code-outline"
        title={t('scan.emptyTitle')}
        message={t('scan.emptyMessage')}
      />
    </Screen>
  );
}
