import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/** A plain <label> styled like shadcn/ui's Label (no Radix dependency needed). */
export function Label({ className, ...props }: ComponentProps<'label'>) {
  // eslint-disable-next-line jsx-a11y/label-has-associated-control -- htmlFor is passed by the caller
  return <label className={cn('text-sm font-medium text-foreground', className)} {...props} />;
}
