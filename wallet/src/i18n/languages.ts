/** Supported UI languages (no i18next import, so storage code can use it without the setup). */
export const SUPPORTED_LANGUAGES = ['en', 'si'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
