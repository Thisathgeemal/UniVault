import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Button } from './ui/button.js';

export interface ActionMenuItem {
  id: string;
  /** Visible label (already translated). */
  label: string;
  onSelect: () => void;
  /** Shown but not usable; `disabledReason` explains why (visible and read out). */
  disabled?: boolean;
  disabledReason?: string;
  tone?: 'default' | 'destructive';
}

export interface ActionMenuProps {
  /** The button's accessible name, e.g. "Actions for Lahiru Silva's credential". */
  label: string;
  /** The button's visible content (e.g. an icon or "Actions"). */
  trigger: ReactNode;
  items: readonly ActionMenuItem[];
  className?: string;
}

/**
 * A button that opens a short list of actions (a disclosure: aria-expanded / aria-controls).
 * Items are ordinary buttons; a disabled item stays focusable (aria-disabled) and shows its
 * reason underneath, linked with aria-describedby. Escape or a click outside closes the list
 * and focus returns to the button. With no items the menu renders nothing.
 */
export function ActionMenu({ label, trigger, items, className }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('[data-action-item]')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div ref={rootRef} className={cn('relative inline-block text-left', className)}>
      <Button
        ref={buttonRef}
        variant="outline"
        size="sm"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        {trigger}
      </Button>
      {open ? (
        <ul
          id={listId}
          className="absolute right-0 z-30 mt-1 flex min-w-56 flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-lg"
        >
          {items.map((item) => {
            const reasonId = `${listId}-${item.id}-reason`;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  data-action-item=""
                  aria-disabled={item.disabled ? true : undefined}
                  aria-describedby={item.disabled && item.disabledReason ? reasonId : undefined}
                  className={cn(
                    'flex w-full flex-col items-start rounded px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    item.disabled
                      ? 'cursor-not-allowed text-muted-foreground'
                      : item.tone === 'destructive'
                        ? 'text-destructive hover:bg-destructive-muted'
                        : 'hover:bg-muted',
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (item.disabled) return;
                    setOpen(false);
                    item.onSelect();
                  }}
                >
                  <span className="font-medium">{item.label}</span>
                  {item.disabled && item.disabledReason ? (
                    <span id={reasonId} className="text-xs">
                      {item.disabledReason}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
