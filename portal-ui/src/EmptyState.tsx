import type { ReactNode } from 'react';
import { Badge } from './ui/badge.js';

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  badge?: string;
}

export function EmptyState({ title, description, icon, action, badge }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border bg-surface px-6 py-12 text-center">
      {icon ? (
        <div className="text-brand-600" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {badge ? <Badge variant="accent">{badge}</Badge> : null}
      <h2 className="text-lg font-semibold">{title}</h2>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action}
    </div>
  );
}

export interface ComingSoonProps {
  title: string;
  /** e.g. "Arrives in Sprint 2" (already translated) */
  description: string;
  badge: string;
  icon?: ReactNode;
}

/** Placeholder for a page that is planned but not built yet. */
export function ComingSoon({ title, description, badge, icon }: ComingSoonProps) {
  return <EmptyState title={title} description={description} badge={badge} icon={icon} />;
}
