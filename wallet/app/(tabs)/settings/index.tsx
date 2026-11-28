import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Card, ListItem, Screen, Section } from '../../../src/components';
import { diagnosticsEnabled, getAppInfo, uiKitEnabled } from '../../../src/config/app-info';
import { isLanguage } from '../../../src/i18n';
import { ROUTES } from '../../../src/navigation/routes';
import { useAppearance } from '../../../src/theme/appearance';

/**
 * Settings tab root: Language and Appearance (each with its current value), Security, About and
 * (development builds) dev tools.
 */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const language = isLanguage(i18n.language) ? i18n.language : 'en';
  const { preference: appearance } = useAppearance();
  const showDeveloper = diagnosticsEnabled() || uiKitEnabled();

  return (
    <Screen testID="settings-screen">
      <Section title={t('settings.sections.preferences')}>
        <Card>
          <ListItem
            testID="settings-language"
            icon="language-outline"
            title={t('settings.language')}
            value={t(`language.${language}`)}
            onPress={() => router.push(ROUTES.language)}
          />
          <ListItem
            testID="settings-appearance"
            icon="contrast-outline"
            title={t('settings.appearance')}
            value={t(`appearance.${appearance}`)}
            onPress={() => router.push(ROUTES.appearance)}
          />
          <ListItem
            testID="settings-security"
            icon="lock-closed-outline"
            title={t('settings.security')}
            subtitle={t('settings.securityHint')}
            onPress={() => router.push(ROUTES.security)}
          />
        </Card>
      </Section>

      <Section title={t('settings.sections.app')}>
        <Card>
          <ListItem
            testID="settings-about"
            icon="information-circle-outline"
            title={t('settings.about')}
            value={getAppInfo().appVersion}
            subtitle={t('settings.aboutHint')}
            onPress={() => router.push(ROUTES.about)}
          />
        </Card>
      </Section>

      {showDeveloper ? (
        <Section title={t('settings.sections.developer')}>
          <Card>
            {diagnosticsEnabled() ? (
              <ListItem
                testID="diagnostics-link"
                icon="pulse-outline"
                title={t('settings.diagnostics')}
                subtitle={t('settings.diagnosticsHint')}
                onPress={() => router.push(ROUTES.diagnostics)}
              />
            ) : null}
            {uiKitEnabled() ? (
              <ListItem
                testID="ui-kit-link"
                icon="color-palette-outline"
                title={t('settings.uiKit')}
                subtitle={t('settings.uiKitHint')}
                onPress={() => router.push(ROUTES.uiKit)}
              />
            ) : null}
          </Card>
        </Section>
      ) : null}
    </Screen>
  );
}
