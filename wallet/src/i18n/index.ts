/**
 * i18n (NFR-02): English and Sinhala through react-i18next. Every UI string goes through t().
 *
 * Start language: the choice saved in Settings (AsyncStorage, src/lib/preferences.ts), else
 * Sinhala when the phone's first preferred language is Sinhala, else English. The root layout
 * awaits `restoreLanguage()` while the splash screen is up, so the first frame is already in
 * the right language (no flash of English).
 */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { loadLanguagePreference, saveLanguagePreference } from '../lib/preferences';
import { DEFAULT_LANGUAGE, isLanguage, SUPPORTED_LANGUAGES, type Language } from './languages';
import { en } from './locales/en';
import { si } from './locales/si';

export { DEFAULT_LANGUAGE, isLanguage, SUPPORTED_LANGUAGES, type Language };

/** Sinhala if the phone's first preferred language is Sinhala, otherwise English. */
export function deviceLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return isLanguage(code) ? code : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

/** Initialises i18next once, synchronously (the resources are bundled). */
export function setupI18n(language: Language = deviceLanguage()) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, si: { translation: si } },
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      interpolation: { escapeValue: false }, // React Native renders text, no HTML
      initAsync: false,
      returnNull: false,
    });
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  return i18n;
}

/**
 * Applies the saved language (if any) before the first render; resolves with the language in
 * use. Never rejects: storage problems fall back to the device language.
 */
export async function restoreLanguage(): Promise<Language> {
  const saved = await loadLanguagePreference();
  const language = saved ?? deviceLanguage();
  setupI18n(language);
  if (i18n.language !== language) await i18n.changeLanguage(language);
  return language;
}

/** The Settings choice: switches the UI at once and saves it for the next start. */
export async function chooseLanguage(language: Language): Promise<boolean> {
  await i18n.changeLanguage(language);
  return saveLanguagePreference(language);
}

export { i18n };
