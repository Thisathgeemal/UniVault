import { useTranslation } from 'react-i18next';
import { AppText, ChoiceList, useToast } from '../../src/components';
import { chooseLanguage, isLanguage, SUPPORTED_LANGUAGES, type Language } from '../../src/i18n';
import { LanguageIllustration } from '../../src/onboarding/illustrations';
import { OnboardingStep } from '../../src/onboarding/OnboardingStep';

/** Step 1: English / සිංහල, big and clear; applies at once (and is saved, as in Settings). */
export default function OnboardingLanguageScreen() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const current = isLanguage(i18n.language) ? i18n.language : 'en';

  const choose = async (language: Language) => {
    if (language === i18n.language) return;
    const saved = await chooseLanguage(language);
    if (!saved) toast.show({ message: i18n.t('settings.languageNotSaved'), tone: 'danger' });
  };

  return (
    <OnboardingStep
      step="language"
      title={t('onboarding.language.title')}
      illustration={<LanguageIllustration />}
    >
      <AppText tone="muted">{t('onboarding.language.body')}</AppText>
      <ChoiceList
        size="large"
        testID="onboarding-language-choices"
        choices={SUPPORTED_LANGUAGES.map((language) => ({
          value: language,
          label: t(`language.${language}`),
          testID: `onboarding-language-${language}`,
          accessibilityLanguage: language,
        }))}
        selected={current}
        onSelect={(language) => void choose(language)}
      />
    </OnboardingStep>
  );
}
