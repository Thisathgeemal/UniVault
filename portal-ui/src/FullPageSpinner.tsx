export interface FullPageSpinnerProps {
  /** Announced to screen readers and shown under the spinner (already translated). */
  label: string;
}

export function FullPageSpinner({ label }: FullPageSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-8 w-8 animate-spin text-primary">
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="4"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}
