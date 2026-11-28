import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Label } from './ui/label.js';

/** Attributes to spread on the control (input, select, …) inside a FormField. */
export interface FormControlProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
  'aria-required': true | undefined;
}

export interface FormFieldProps {
  /** The control's id (the error summary links to it). */
  id: string;
  label: string;
  /** Shows a visual marker (*) and sets aria-required on the control. */
  required?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  /** Renders the control with the accessibility attributes it must carry. */
  children: (control: FormControlProps) => ReactNode;
  className?: string;
}

export const fieldHintId = (id: string) => `${id}-hint`;
export const fieldErrorId = (id: string) => `${id}-error`;

/**
 * Label, optional hint, the control and its error message, wired together: the control gets
 * aria-invalid, aria-required and aria-describedby (hint and error), so a screen reader reads
 * the error when the field is focused.
 */
export function FormField({
  id,
  label,
  required,
  hint,
  error,
  children,
  className,
}: FormFieldProps) {
  const describedBy =
    [hint ? fieldHintId(id) : null, error ? fieldErrorId(id) : null].filter(Boolean).join(' ') ||
    undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-status-revoked">
            *
          </span>
        ) : null}
      </Label>
      {hint ? (
        <p id={fieldHintId(id)} className="text-body-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required ? true : undefined,
      })}
      {error ? (
        <p id={fieldErrorId(id)} className="text-body-sm font-medium text-status-revoked">
          {error}
        </p>
      ) : null}
    </div>
  );
}
