import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { isLanguage, SUPPORTED_LANGUAGES } from '../i18n/index.js';

/**
 * English / සිංහල selector: in the navy top bar (`onBrand`: role-tag-bg, on-brand text, the
 * on-brand focus ring) and on the login page (surface).
 */
export function LanguageSwitcher({
  className,
  onBrand = false,
}: {
  className?: string;
  onBrand?: boolean;
}) {
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
        className={
          onBrand
            ? 'min-h-10 rounded-sm border border-transparent bg-role-tag-bg px-2 text-body-sm text-on-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring-on-brand'
            : 'min-h-10 rounded-sm border border-border-strong bg-surface px-2 text-body-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring'
        }
      >
        {SUPPORTED_LANGUAGES.map((language) => (
          <option key={language} value={language} lang={language} className="bg-surface text-text">
            {t(`language.${language}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
