import { cn } from './cn.js';

/** Whole seconds as mm:ss (minutes may exceed 59); negative values show 00:00. */
export function formatCountdown(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  return `${String(minutes).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export interface CountdownProps {
  /** Seconds left (the caller ticks it). */
  seconds: number;
  /** Visible label before the time, e.g. "Expires in". */
  label: string;
  /** Amber warning look (e.g. in the last minute). */
  warning?: boolean;
  /**
   * Text for screen readers, in a polite live region. Change it only when it should be read
   * out (e.g. once a minute): the ticking mm:ss itself is never announced.
   */
  announcement?: string;
  size?: 'default' | 'large';
  className?: string;
}

/**
 * A countdown display. The visible mm:ss is a timer (role="timer", not live), so it does
 * not flood screen readers every second; `announcement` carries the occasional spoken update.
 */
export function Countdown({
  seconds,
  label,
  warning = false,
  announcement,
  size = 'default',
  className,
}: CountdownProps) {
  const time = formatCountdown(seconds);
  return (
    <div
      className={cn(
        'inline-flex items-baseline gap-2 rounded-md border px-3 py-2',
        warning
          ? 'border-status-expired bg-status-expired-bg text-status-expired-text'
          : 'border-border bg-surface text-text',
        className,
      )}
      data-warning={warning ? 'true' : undefined}
    >
      <span className={size === 'large' ? 'text-h3' : 'text-body-sm'}>{label}</span>
      <span
        role="timer"
        aria-label={`${label} ${time}`}
        className={cn(
          'font-mono font-semibold tabular-nums',
          size === 'large' ? 'text-display' : 'text-h1',
        )}
      >
        {time}
      </span>
      {announcement !== undefined ? (
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {announcement}
        </span>
      ) : null}
    </div>
  );
}
