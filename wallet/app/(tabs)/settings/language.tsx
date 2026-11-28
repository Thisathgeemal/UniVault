import { useTranslation } from 'react-i18next';
import { AppText, Card, ChoiceList, Screen, useToast } from '../../../src/components';
import { chooseLanguage, isLanguage, SUPPORTED_LANGUAGES, type Language } from '../../../src/i18n';

/**
 * Language: English / සිංහල as a radio group. The choice applies at once and is saved
 * (AsyncStorage, preference only) so the next start opens in it.
 */
export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const current = isLanguage(i18n.language) ? i18n.language : 'en';

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
        <ChoiceList
          choices={SUPPORTED_LANGUAGES.map((language) => ({
            value: language,
            label: t(`language.${language}`),
            testID: `language-${language}`,
            accessibilityLanguage: language,
          }))}
          selected={current}
          onSelect={(language) => void choose(language)}
        />
      </Card>
    </Screen>
  );
}
