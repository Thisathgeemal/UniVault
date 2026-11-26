import { cn } from './cn.js';

export type StackedBarTone = 'brand' | 'destructive' | 'info' | 'warning' | 'muted';

export interface StackedBarSegment {
  id: string;
  /** e.g. "Active" (already translated) */
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
  brand: 'fill-brand-500',
  destructive: 'fill-destructive',
  info: 'fill-info',
  warning: 'fill-accent-foreground',
  muted: 'fill-muted-foreground',
};
const SWATCH: Record<StackedBarTone, string> = {
  brand: 'bg-brand-500',
  destructive: 'bg-destructive',
  info: 'bg-info',
  warning: 'bg-accent-foreground',
  muted: 'bg-muted-foreground',
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
        className="h-4 w-full overflow-hidden rounded-full bg-muted"
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
      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {segments.map((segment) => (
          <li key={segment.id} className="flex items-center gap-2" data-segment={segment.id}>
            <span
              aria-hidden="true"
              className={cn('inline-block h-3 w-3 rounded-sm', SWATCH[segment.tone])}
            />
            <span className="text-muted-foreground">{segment.label}</span>
            <span className="font-semibold tabular-nums text-foreground">{segment.valueText}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}
