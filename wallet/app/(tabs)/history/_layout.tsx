import { useTranslation } from 'react-i18next';
import { TabStack } from '../../../src/navigation/TabStack';

export const unstable_settings = { anchor: 'index' };

export default function HistoryStack() {
  const { t } = useTranslation();
  return (
    <TabStack
      screens={[
        { name: 'index', title: t('history.title') },
        { name: '[id]', title: t('history.detailTitle') },
      ]}
    />
  );
}
