import { useEffect, useState } from 'react';
import { Check, Copy } from './icons.js';
import { cn } from './cn.js';

export interface CopyButtonProps {
  /** The text put on the clipboard. */
  value: string;
  /** Accessible name, e.g. "Copy credential ID". */
  label: string;
  /** Announced (and shown as the name) for a moment after copying, e.g. "Copied". */
  copiedLabel: string;
  className?: string;
}

/** A small icon button that copies `value` and confirms with a polite announcement. */
export function CopyButton({ value, label, copiedLabel, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <>
      <button
        type="button"
        aria-label={copied ? copiedLabel : label}
        title={label}
        className={cn(
          'inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        onClick={(event) => {
          event.stopPropagation();
          void navigator.clipboard?.writeText(value).then(
            () => setCopied(true),
            () => setCopied(false),
          );
        }}
      >
        {copied ? <Check /> : <Copy />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? copiedLabel : ''}
      </span>
    </>
  );
}
