import { useTranslation } from 'react-i18next';
import { AppText, Card, ListItem, Screen, SectionHeader } from '../../../src/components';
import { getAppInfo } from '../../../src/config/app-info';

/** About: what UniVault is, app version, Expo SDK, and the bundled font's licence notice. */
export default function AboutScreen() {
  const { t } = useTranslation();
  const info = getAppInfo();
  return (
    <Screen testID="about-screen">
      <AppText>{t('about.description')}</AppText>
      <Card>
        <ListItem testID="app-version" title={t('about.appVersion')} value={info.appVersion} />
        <ListItem testID="sdk-version" title={t('about.sdkVersion')} value={info.sdkVersion} />
      </Card>
      <SectionHeader title={t('about.licences')} />
      <Card>
        <AppText testID="font-licence">{t('about.fontLicence')}</AppText>
      </Card>
    </Screen>
  );
}
