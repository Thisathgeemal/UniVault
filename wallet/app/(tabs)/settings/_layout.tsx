import { useTranslation } from 'react-i18next';
import { TabStack } from '../../../src/navigation/TabStack';

export const unstable_settings = { anchor: 'index' };

/** Diagnostics and UI kit are declared always; the screens themselves refuse release builds. */
export default function SettingsStack() {
  const { t } = useTranslation();
  return (
    <TabStack
      screens={[
        { name: 'index', title: t('settings.title') },
        { name: 'language', title: t('settings.language') },
        { name: 'security', title: t('security.title') },
        { name: 'about', title: t('about.title') },
        { name: 'diagnostics', title: t('diagnostics.title') },
        { name: 'ui-kit', title: t('uiKit.title') },
      ]}
    />
  );
}
