/**
 * Date display for the wallet: day, short month and year in the UI language, in Sri Lanka
 * time (Asia/Colombo, like the issuer portal). Falls back to the ISO date (YYYY-MM-DD) if the
 * JavaScript engine lacks the locale or time zone data.
 */
export const TIME_ZONE = 'Asia/Colombo';

export function formatDate(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(language === 'si' ? 'si-LK' : 'en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: TIME_ZONE,
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}
