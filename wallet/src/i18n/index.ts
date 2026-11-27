/**
 * i18n (NFR-02): English and Sinhala through react-i18next. Every UI string goes through t().
 *
 * The start language is the phone's language when it is Sinhala, otherwise English
 * (expo-localization). The choice made in Settings is NOT saved yet: wallet storage arrives
 * with the credential vault in a later Sprint 2 task.
 */
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { si } from './locales/si';

export const SUPPORTED_LANGUAGES = ['en', 'si'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

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

export { i18n };
