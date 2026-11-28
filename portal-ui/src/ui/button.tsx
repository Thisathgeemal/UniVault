import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../cn.js';

/**
 * Button in the shadcn/ui style (copied and trimmed), with the design system's kinds
 * (docs/design/design-system.md, Buttons):
 * - `primary`: azure, the ONE main action on a page;
 * - `secondary`: surface with a border-strong edge, every other action;
 * - `text`: no fill, accent-text label, low-weight actions ("View details");
 * - `destructive`: status-revoked fill (Revoke), always behind a confirmation;
 * - `onBrand`: role-tag-bg fill with an on-brand label, inside the navy top bar only.
 * Minimum height 40 px (portal pointer target), radius-md, label type step.
 */
export const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-label transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60',
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-on-accent hover:bg-accent-hover focus-visible:ring-focus-ring focus-visible:ring-offset-bg',
        secondary:
          'border border-border-strong bg-surface text-text hover:bg-surface-sunken focus-visible:ring-focus-ring focus-visible:ring-offset-bg',
        text: 'text-accent-text hover:underline focus-visible:ring-focus-ring focus-visible:ring-offset-bg',
        destructive:
          'bg-status-revoked text-on-status-revoked hover:opacity-90 focus-visible:ring-focus-ring focus-visible:ring-offset-bg',
        onBrand:
          'bg-role-tag-bg text-on-brand hover:bg-brand-hover focus-visible:ring-focus-ring-on-brand focus-visible:ring-offset-brand',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-3 py-1.5',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'default' },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>['variant']>;
export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      data-variant={variant ?? 'primary'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
