import { cn } from './cn.js';
import type { StatusSet } from './tokens.js';

/**
 * The bar shows credentials BY STATUS, so each segment takes its status colour set (the only
 * use of status colours here: a segment is a status, never a decorative series).
 */
export type StackedBarTone = StatusSet;

export interface StackedBarSegment {
  id: string;
  /** e.g. "Valid" (already translated) */
  label: string;
  value: number;
  /** What the legend shows next to the label, e.g. "8 (73%)" (already formatted). */
  valueText: string;
  tone: StackedBarTone;
}

export interface StackedBarProps {
  /** Accessible name of the whole figure (already translated). */
  label: string;
  segments: readonly StackedBarSegment[];
  className?: string;
}

// Literal class names, so Tailwind finds them when it scans this package
const FILL: Record<StackedBarTone, string> = {
  valid: 'fill-status-valid',
  expired: 'fill-status-expired',
  revoked: 'fill-status-revoked',
  pending: 'fill-status-pending',
};
const SWATCH: Record<StackedBarTone, string> = {
  valid: 'bg-status-valid',
  expired: 'bg-status-expired',
  revoked: 'bg-status-revoked',
  pending: 'bg-status-pending',
};
/** Gap between neighbouring segments, in percent of the width. */
const GAP = 0.6;

/**
 * A horizontal stacked bar with a legend: no chart library. The segments are SVG rectangles
 * (plain attributes, so no inline style is needed under a `style-src 'self'` CSP). The bar
 * itself is hidden from assistive technology; the legend is a list with every label and
 * number in text, so nothing is conveyed by colour alone.
 */
export function StackedBar({ label, segments, className }: StackedBarProps) {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  // Each drawn segment with its start and width, in percent of the bar
  const drawn = segments
    .filter((s) => s.value > 0)
    .map((segment, index, all) => {
      const before = all.slice(0, index).reduce((sum, s) => sum + s.value, 0);
      return { segment, x: (before / total) * 100, width: (segment.value / total) * 100 };
    });

  return (
    <figure aria-label={label} className={cn('flex flex-col gap-3', className)}>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
        className="h-4 w-full overflow-hidden rounded-full bg-surface-sunken"
        data-testid="stacked-bar"
      >
        {total > 0
          ? drawn.map(({ segment, x, width }, index) => (
              <rect
                key={segment.id}
                data-segment={segment.id}
                x={x}
                y={0}
                width={Math.max(0, index < drawn.length - 1 ? width - GAP : width)}
                height={1}
                className={FILL[segment.tone]}
              />
            ))
          : null}
      </svg>
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
        {segments.map((segment) => (
          <li key={segment.id} className="flex items-center gap-2" data-segment={segment.id}>
            <span
              aria-hidden="true"
              className={cn('inline-block h-3 w-3 rounded-sm', SWATCH[segment.tone])}
            />
            <span className="text-text-muted">{segment.label}</span>
            <span className="font-semibold tabular-nums text-text">{segment.valueText}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
