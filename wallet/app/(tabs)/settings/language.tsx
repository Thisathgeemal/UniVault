import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Icon, Screen, useToast } from '../../../src/components';
import { chooseLanguage, SUPPORTED_LANGUAGES, type Language } from '../../../src/i18n';
import { MIN_TOUCH_TARGET } from '../../../src/theme';
import { useTheme } from '../../../src/theme/use-theme';

/**
 * Language: English / සිංහල as a radio group. The choice applies at once and is saved
 * (AsyncStorage, preference only) so the next start opens in it.
 */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const toast = useToast();

  const choose = async (language: Language) => {
    if (language === i18n.language) return;
    const saved = await chooseLanguage(language);
    // i18n.t, not the render's t: the message must be in the language just chosen
    toast.show({
      message: saved ? i18n.t('settings.languageSaved') : i18n.t('settings.languageNotSaved'),
      tone: saved ? 'success' : 'danger',
    });
  };

  return (
    <Screen testID="language-screen">
      <AppText tone="muted">{t('settings.languageHint')}</AppText>
      <Card>
        <View accessibilityRole="radiogroup" style={{ gap: theme.space(2) }}>
          {SUPPORTED_LANGUAGES.map((language) => {
            const selected = i18n.language === language;
            return (
              <Pressable
                key={language}
                accessibilityRole="radio"
                accessibilityLabel={t(`language.${language}`)}
                accessibilityState={{ checked: selected }}
                accessibilityLanguage={language}
                onPress={() => void choose(language)}
                testID={`language-${language}`}
                style={[
                  styles.option,
                  {
                    borderRadius: theme.radius.md,
                    borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
                    backgroundColor: selected ? theme.colors.accent : theme.colors.surface,
                    paddingHorizontal: theme.space(4),
                    gap: theme.space(3),
                  },
                ]}
              >
                <Icon
                  name={selected ? 'radio-button-on' : 'radio-button-off'}
                  color={selected ? theme.colors.onAccent : theme.colors.accentText}
                />
                <AppText
                  variant="label"
                  style={[
                    styles.label,
                    { color: selected ? theme.colors.onAccent : theme.colors.text },
                  ]}
                >
                  {t(`language.${language}`)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: { flexShrink: 1 },
});
