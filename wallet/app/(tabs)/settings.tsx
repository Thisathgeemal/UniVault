import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Screen } from '../../src/components';
import { diagnosticsEnabled, getAppInfo } from '../../src/config/app-info';
import { SUPPORTED_LANGUAGES, type Language } from '../../src/i18n';
import { MIN_TOUCH_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme/use-theme';

/** Settings tab: language, app version and (development builds) a link to Diagnostics. */
export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { appVersion } = getAppInfo();

  const choose = (language: Language) => {
    void i18n.changeLanguage(language);
  };

  return (
    <Screen testID="settings-screen">
      <Card title={t('settings.language')}>
        <AppText tone="muted">{t('settings.languageHint')}</AppText>
        <View accessibilityRole="radiogroup" style={[styles.row, { gap: theme.space(2) }]}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const selected = i18n.language === language;
            return (
              <Pressable
                key={language}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLanguage={language}
                onPress={() => choose(language)}
                testID={`language-${language}`}
                style={[
                  styles.option,
                  {
                    borderRadius: theme.radii.lg,
                    borderColor: theme.colors.primary,
                    backgroundColor: selected ? theme.colors.primary : theme.colors.surface,
                    paddingHorizontal: theme.space(4),
                  },
                ]}
              >
                <AppText
                  variant="label"
                  style={{
                    color: selected ? theme.colors.primaryForeground : theme.colors.primary,
                  }}
                >
                  {t(`language.${language}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>

      <Card title={t('settings.about')}>
        <View style={styles.between}>
          <AppText>{t('settings.appVersion')}</AppText>
          <AppText tone="muted" testID="app-version">
            {appVersion}
          </AppText>
        </View>
      </Card>

      {diagnosticsEnabled() ? (
        <Link href="/settings/diagnostics" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityHint={t('settings.diagnosticsHint')}
            testID="diagnostics-link"
            // Link asChild passes the style through a Slot: one flat object, not an array
            style={StyleSheet.flatten([
              styles.option,
              styles.link,
              {
                borderRadius: theme.radii.card,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                padding: theme.space(4),
              },
            ])}
          >
            <AppText variant="label" tone="primary">
              {t('settings.diagnostics')}
            </AppText>
            <AppText variant="caption" tone="muted">
              {t('settings.diagnosticsHint')}
            </AppText>
          </Pressable>
        </Link>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    borderWidth: 1,
    justifyContent: 'center',
  },
  link: { alignItems: 'flex-start', gap: 4 },
  between: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
});
