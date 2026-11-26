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

const locale = (language: string) => (language === 'si' ? 'si-LK' : 'en-LK');

/** e.g. "15:30": the 24-hour time of an ISO instant in Asia/Colombo; null if invalid. */
export function formatColomboTime(iso: string, language: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale(language), {
    timeZone: PORTAL_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/** A count with the language's digit grouping, e.g. 12,345. */
export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(locale(language)).format(value);
}

/** A fraction as a whole percentage, e.g. 0.734 → "73%". */
export function formatPercent(fraction: number, language: string): string {
  return new Intl.NumberFormat(locale(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(fraction);
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * How long before `reference` an instant was, e.g. "3 hours ago" / "yesterday", in the
 * portal's language. Both are ISO strings (the reference is the server's generatedAt, so the
 * text is the same whatever the browser clock says). Null if either is invalid.
 */
export function formatRelativeTime(
  iso: string,
  reference: string,
  language: string,
): string | null {
  const at = Date.parse(iso);
  const ref = Date.parse(reference);
  if (Number.isNaN(at) || Number.isNaN(ref)) return null;
  const seconds = Math.round((at - ref) / 1000);
  const format = new Intl.RelativeTimeFormat(locale(language), { numeric: 'auto' });
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.trunc(seconds / size), unit);
  }
  return format.format(0, 'minute'); // "this minute" / "now"
}

/** e.g. "24 Nov 2026" for an ISO instant, as the date in Asia/Colombo; null if invalid. */
export function formatColomboDate(iso: string, language: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale(language), {
    timeZone: PORTAL_TIME_ZONE,
    dateStyle: 'medium',
  }).format(date);
}

/**
 * A calendar date claim (YYYY-MM-DD, e.g. a date of birth) in the language's style. It is a
 * date, not an instant, so it is formatted in UTC (never shifted by a time zone). Anything
 * else is returned unchanged.
 */
export function formatCalendarDate(value: string, language: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale(language), { timeZone: 'UTC', dateStyle: 'medium' }).format(
    date,
  );
}
