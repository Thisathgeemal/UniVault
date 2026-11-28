import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/** A native <select> styled like Input (native = accessible and mobile-friendly for free). */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex min-h-10 w-full rounded-sm border border-border-strong bg-surface px-3 py-2 text-body text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring aria-[invalid=true]:border-status-revoked disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
