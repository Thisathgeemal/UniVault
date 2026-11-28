import { cn } from './cn.js';

export interface StepperStep {
  id: string;
  /** Already translated. */
  label: string;
}

export interface StepperProps {
  /** The <nav> name, e.g. "Issuing steps". */
  label: string;
  steps: readonly StepperStep[];
  /** 0-based index of the current step. */
  current: number;
  /** Screen-reader words for each state, e.g. { complete: "completed", current: "current step" }. */
  statusLabels: { complete: string; current: string; upcoming: string };
  /** Lets the user go back to a completed step (later steps are never links). */
  onSelect?: (index: number) => void;
}

/**
 * Numbered steps of a multi-step task. The current step carries aria-current="step"; each
 * step states its status in words for screen readers, not only by colour.
 */
export function Stepper({ label, steps, current, statusLabels, onSelect }: StepperProps) {
  return (
    <nav aria-label={label} className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {steps.map((step, index) => {
          const state = index < current ? 'complete' : index === current ? 'current' : 'upcoming';
          const content = (
            <>
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-caption font-semibold',
                  state === 'complete' && 'border-brand bg-brand text-on-brand',
                  state === 'current' && 'border-accent text-accent-text',
                  state === 'upcoming' && 'border-border-strong text-text-muted',
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  'text-body-sm',
                  state === 'current' ? 'font-semibold' : 'text-text-muted',
                )}
              >
                {step.label}
              </span>
              <span className="sr-only">{` (${statusLabels[state]})`}</span>
            </>
          );
          return (
            <li
              key={step.id}
              aria-current={state === 'current' ? 'step' : undefined}
              className="flex items-center gap-2"
            >
              {state === 'complete' && onSelect ? (
                <button
                  type="button"
                  className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                  onClick={() => onSelect(index)}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
