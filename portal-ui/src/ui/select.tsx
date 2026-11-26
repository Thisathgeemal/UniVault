import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/** A native <select> styled like Input (native = accessible and mobile-friendly for free). */
export function Select({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
