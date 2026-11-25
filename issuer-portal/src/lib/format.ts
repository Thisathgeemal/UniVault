/** Sri Lanka's time zone: the portal shows times in it whatever the browser's setting. */
export const PORTAL_TIME_ZONE = 'Asia/Colombo';

/** e.g. "24 Nov 2026, 3:30 pm" (en) for an ISO instant, in Asia/Colombo time; null if invalid. */
export function formatColomboDateTime(iso: string, language: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language === 'si' ? 'si-LK' : 'en-LK', {
    timeZone: PORTAL_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
