import { useId, type ComponentType, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Card } from './ui/card.js';
import { Skeleton } from './ui/skeleton.js';

/** Props the pluggable link receives (same idea as Sidebar's linkComponent). */
export interface StatCardLinkProps {
  href: string;
  className: string;
  children: ReactNode;
  'aria-labelledby': string;
  'aria-describedby'?: string | undefined;
}

export interface StatCardProps {
  /** Short name of the figure, e.g. "Issued" (already translated). */
  label: string;
  /** The number, already formatted for the language (e.g. with Intl.NumberFormat). */
  value: string;
  /** One plain-language sentence explaining the number (already translated). */
  description?: string;
  /** Makes the whole card a link, e.g. to a filtered list. */
  href?: string;
  linkComponent?: ComponentType<StatCardLinkProps>;
  icon?: ReactNode;
  /** 'lg' for the primary figures, 'md' for secondary ones. */
  size?: 'lg' | 'md';
  /** Shows a skeleton instead of the value. */
  loading?: boolean;
  className?: string;
}

function PlainLink({ children, ...props }: StatCardLinkProps) {
  return <a {...props}>{children}</a>;
}

/**
 * One headline number. The accessible name is "<label> <value>" and the description is
 * attached with aria-describedby, so a screen reader hears e.g. "Active 8, link, Credentials
 * currently valid in holders' wallets". Without href it is a labelled group instead of a link.
 */
export function StatCard({
  label,
  value,
  description,
  href,
  linkComponent: Link = PlainLink,
  icon,
  size = 'md',
  loading = false,
  className,
}: StatCardProps) {
  const id = useId();
  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const descriptionId = description ? `${id}-description` : undefined;
  const labelledBy = loading ? labelId : `${labelId} ${valueId}`;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span id={labelId} className="text-body-sm font-medium text-text-muted">
          {label}
        </span>
        {icon ? (
          <span aria-hidden="true" className="text-brand">
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton
          className={size === 'lg' ? 'h-10 w-24' : 'h-8 w-16'}
          data-testid="stat-skeleton"
        />
      ) : (
        <span
          id={valueId}
          className={cn(
            'font-semibold tabular-nums leading-none text-text',
            size === 'lg' ? 'text-display' : 'text-h1',
          )}
        >
          {value}
        </span>
      )}
      {description ? (
        <p id={descriptionId} className="text-body-sm text-text-muted">
          {description}
        </p>
      ) : null}
    </>
  );

  const inner = cn('flex h-full flex-col gap-2', size === 'lg' ? 'p-6' : 'p-4');
  return (
    <Card className={cn('h-full', className)}>
      {href ? (
        <Link
          href={href}
          className={cn(
            inner,
            'rounded-md transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          )}
          aria-labelledby={labelledBy}
          aria-describedby={descriptionId}
        >
          {body}
        </Link>
      ) : (
        <div
          role="group"
          className={inner}
          aria-labelledby={labelledBy}
          aria-describedby={descriptionId}
        >
          {body}
        </div>
      )}
    </Card>
  );
}
