import type { ComponentType, ReactNode } from 'react';
import { cn } from './cn.js';
import type { StatusSet } from './tokens.js';

export type { StatusSet };

/** Badge classes of the four status colour sets (they mean these statuses and nothing else). */
export const STATUS_SET_CLASSES: Record<StatusSet, string> = {
  valid: 'bg-status-valid-bg text-status-valid-text',
  expired: 'bg-status-expired-bg text-status-expired-text',
  revoked: 'bg-status-revoked-bg text-status-revoked-text',
  pending: 'bg-status-pending-bg text-status-pending-text',
};

export interface StatusBadgeProps {
  /** Which status colour set (map the app's own status to one of the four). */
  status: StatusSet;
  /** The status icon (passed in: this package has no icon library). Always shown with the word. */
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  /** The status in words (never colour alone). */
  children: ReactNode;
  className?: string;
}

/** A status: icon + word in its status colour set's badge colours, radius-sm. */
export function StatusBadge({ status, icon: Icon, children, className }: StatusBadgeProps) {
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-caption font-semibold',
        STATUS_SET_CLASSES[status],
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}
