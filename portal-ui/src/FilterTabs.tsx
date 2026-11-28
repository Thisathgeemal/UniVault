import { cn } from './cn.js';

export interface FilterTab {
  id: string;
  /** Visible label (already translated). */
  label: string;
  /** Shown after the label; omitted while unknown. */
  count?: string;
}

export interface FilterTabsProps {
  /** The group's accessible name, e.g. "Filter by status". */
  label: string;
  tabs: readonly FilterTab[];
  selected: string;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * A row of filter buttons for one list (e.g. statuses). Each is a toggle button with
 * aria-pressed; the selected one is highlighted. Not ARIA tabs: there are no separate panels,
 * the same list below is filtered.
 */
export function FilterTabs({ label, tabs, selected, onSelect, className }: FilterTabsProps) {
  return (
    <div role="group" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map((tab) => {
        const active = tab.id === selected;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(tab.id)}
            className={cn(
              'inline-flex min-h-10 items-center gap-2 rounded-pill border px-3 py-1.5 text-label focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              active
                ? 'border-brand bg-brand-soft text-text'
                : 'border-border-strong bg-surface text-text hover:bg-surface-sunken',
            )}
          >
            {tab.label}
            {/* The space keeps the accessible name "Active 7", not "Active7" (no visual effect in flex) */}
            {tab.count !== undefined ? ' ' : null}
            {tab.count !== undefined ? (
              <span
                className={cn(
                  'rounded-pill px-2 text-caption',
                  active ? 'bg-surface text-text' : 'bg-surface-sunken text-text-muted',
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
