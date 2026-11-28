import { useTranslation } from 'react-i18next';
import { TabStack } from '../../../src/navigation/TabStack';

/** A deep link to /credentials/<id> still has the list under it, so Back goes to the list. */
export const unstable_settings = { anchor: 'index' };

export default function CredentialsStack() {
  const { t } = useTranslation();
  return (
    <TabStack
      screens={[
        { name: 'index', title: t('credentials.title') },
        { name: '[id]', title: t('credentials.detailTitle') },
      ]}
    />
  );
}
