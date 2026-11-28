import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/**
 * Placeholder block shown while data loads. Hidden from assistive technology: the page
 * announces loading once (e.g. a role="status" text), not once per block.
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-sunken', className)}
      {...props}
    />
  );
}
