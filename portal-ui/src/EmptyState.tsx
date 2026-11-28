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
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
      {icon ? (
        <div className="text-brand" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      {badge ? <Badge>{badge}</Badge> : null}
      <h2 className="text-h2">{title}</h2>
      {description ? <p className="max-w-md text-body-sm text-text-muted">{description}</p> : null}
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
