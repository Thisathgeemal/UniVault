import { useId, type ReactNode } from 'react';
import { cn } from './cn.js';

export interface CredentialCardItem {
  id: string;
  label: string;
  value: ReactNode;
  /** e.g. a "Selectively disclosable" badge with its info tooltip. */
  badge?: ReactNode;
  /** A short note under the value (e.g. "Calculated by UniVault"). */
  note?: ReactNode;
}

export interface CredentialCardSection {
  id: string;
  title: string;
  description?: string;
  items: readonly CredentialCardItem[];
  /** 'muted' for envelope data, 'default' for the holder's claims. */
  tone?: 'default' | 'muted';
}

export interface CredentialCardPreviewProps {
  /** e.g. "Employment credential". */
  title: string;
  /** e.g. the issuer's name. */
  subtitle: string;
  sections: readonly CredentialCardSection[];
  /** e.g. "Bound to the holder's wallet when they accept it." */
  footer?: ReactNode;
  className?: string;
}

/**
 * A credential drawn like a card in the wallet, with clearly separated sections (for example
 * what verifiers always see and what the holder chooses to share). Every label is passed in.
 */
export function CredentialCardPreview({
  title,
  subtitle,
  sections,
  footer,
  className,
}: CredentialCardPreviewProps) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      className={cn(
        'overflow-hidden rounded-card border border-border bg-surface shadow-sm',
        className,
      )}
    >
      <header className="bg-brand-900 px-6 py-5 text-sidebar-foreground">
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-sidebar-muted">{subtitle}</p>
      </header>
      {sections.map((section) => (
        <section
          key={section.id}
          aria-labelledby={`${titleId}-${section.id}`}
          className={cn(
            'border-t border-border px-6 py-5 first-of-type:border-t-0',
            section.tone === 'muted' && 'bg-muted/50',
          )}
        >
          <h3 id={`${titleId}-${section.id}`} className="font-semibold">
            {section.title}
          </h3>
          {section.description ? (
            <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
          ) : null}
          <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {section.items.map((item) => (
              <div key={item.id} className="flex flex-col gap-1">
                <dt className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  {item.label}
                  {item.badge}
                </dt>
                <dd className="font-medium break-words">
                  {item.value}
                  {item.note ? (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {item.note}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      {footer ? (
        <footer className="border-t border-border px-6 py-4 text-sm text-muted-foreground">
          {footer}
        </footer>
      ) : null}
    </article>
  );
}
