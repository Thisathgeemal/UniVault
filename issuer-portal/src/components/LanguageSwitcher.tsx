import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isLanguage, SUPPORTED_LANGUAGES } from '../i18n/index.js';

/** English / සිංහල selector, used in the header and on the login page. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {t('language.label')}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage ?? i18n.language}
        onChange={(event) => {
          if (isLanguage(event.target.value)) void i18n.changeLanguage(event.target.value);
        }}
        className="h-9 rounded-md border border-border bg-surface px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language}>
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
