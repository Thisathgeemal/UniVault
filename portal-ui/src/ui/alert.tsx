import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

export const alertVariants = cva('rounded-md border px-4 py-3 text-sm', {
  variants: {
    variant: {
      info: 'border-info/30 bg-info-muted text-info',
      destructive: 'border-destructive/30 bg-destructive-muted text-destructive',
    },
  },
  defaultVariants: { variant: 'info' },
});

/**
 * A message box. Pass role="alert" for errors that must be announced at once and
 * role="status" for informational messages.
 */
export type AlertProps = ComponentProps<'div'> & VariantProps<typeof alertVariants>;

export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}
