import { useTranslation } from 'react-i18next';
import { TabStack } from '../../../src/navigation/TabStack';

export const unstable_settings = { anchor: 'index' };

export default function ScanStack() {
  const { t } = useTranslation();
  return <TabStack screens={[{ name: 'index', title: t('scan.title') }]} />;
}
