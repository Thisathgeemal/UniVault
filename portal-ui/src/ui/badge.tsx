import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/**
 * A small non-status label (a credential's status uses StatusBadge). `default` sits on
 * surface; `onBrand` sits on the navy top bar (role-tag-bg, on-brand text).
 */
export const badgeVariants = cva(
  'inline-flex items-center rounded-sm px-2.5 py-0.5 text-caption font-semibold',
  {
    variants: {
      variant: {
        default: 'bg-brand-soft text-text',
        onBrand: 'bg-role-tag-bg text-on-brand',
        outline: 'border border-border text-text-muted',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export type BadgeProps = ComponentProps<'span'> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
