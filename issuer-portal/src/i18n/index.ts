/**
 * i18n (NFR-02): English and Sinhala through react-i18next. Every UI string goes through t().
 * The chosen language is a preference stored in localStorage (never anything secret) and is
 * reflected in <html lang>, so screen readers and fonts switch with it.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en.js';
import { si } from './locales/si.js';

export const SUPPORTED_LANGUAGES = ['en', 'si'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';
export const LANGUAGE_STORAGE_KEY = 'univault.language';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);

/** The saved preference, or English. Storage may be unavailable (private mode): ignore it. */
export function storedLanguage(): Language {
  try {
    const value = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function applyLanguage(language: string): void {
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // preference only: nothing to do if storage is blocked
  }
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof en };
  }
}

/** Initialises i18next once (synchronously: the resources are bundled). */
export function setupI18n(language: Language = storedLanguage()) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: { en: { translation: en }, si: { translation: si } },
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      interpolation: { escapeValue: false }, // React escapes already
      initAsync: false,
      returnNull: false,
    });
    i18n.on('languageChanged', applyLanguage);
  } else if (i18n.language !== language) {
    void i18n.changeLanguage(language);
  }
  document.documentElement.lang = i18n.language;
  return i18n;
}

export { i18n };
