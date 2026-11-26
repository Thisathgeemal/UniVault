import type { ReactNode } from 'react';
import { cn } from './cn.js';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<StatusTone, string> = {
  success: 'bg-brand-100 text-brand-900',
  warning: 'bg-accent text-accent-foreground',
  danger: 'bg-destructive-muted text-destructive',
  info: 'bg-info-muted text-info',
  neutral: 'bg-muted text-muted-foreground',
};

export interface StatusBadgeProps {
  tone: StatusTone;
  /** The status in words (never colour alone). */
  children: ReactNode;
  className?: string;
}

/** A status label (e.g. a credential's status); the text carries the meaning, colour helps. */
export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <span
      data-tone={tone}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
