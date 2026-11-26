import { useEffect, useId, useRef } from 'react';

export interface ErrorSummaryItem {
  /** The id of the field to jump to; omit for a problem that belongs to no field. */
  fieldId?: string;
  message: string;
}

export interface ErrorSummaryProps {
  title: string;
  errors: readonly ErrorSummaryItem[];
  /**
   * Change it (e.g. a submit counter) to move focus to the summary again: after every
   * failed submit, so keyboard and screen-reader users land on the list of problems.
   */
  focusKey?: number;
}

/**
 * The list of problems at the top of a form (GOV.UK pattern): each one links to its field.
 * Renders nothing without errors.
 */
export function ErrorSummary({ title, errors, focusKey }: ErrorSummaryProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const hasErrors = errors.length > 0;

  useEffect(() => {
    if (hasErrors && focusKey !== undefined) ref.current?.focus();
  }, [focusKey, hasErrors]);

  if (!hasErrors) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby={titleId}
      className="mb-6 rounded-md border-2 border-destructive bg-destructive-muted px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h2 id={titleId} className="mb-2 font-semibold text-destructive">
        {title}
      </h2>
      <ul className="list-disc space-y-1 pl-5">
        {errors.map((error, index) => (
          <li key={`${error.fieldId ?? 'form'}-${index}`}>
            {error.fieldId ? (
              <a
                href={`#${error.fieldId}`}
                className="font-medium text-destructive underline underline-offset-2"
                onClick={(event) => {
                  event.preventDefault();
                  const field = document.getElementById(error.fieldId!);
                  field?.focus();
                  field?.scrollIntoView?.({ block: 'center' });
                }}
              >
                {error.message}
              </a>
            ) : (
              <span className="text-destructive">{error.message}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
