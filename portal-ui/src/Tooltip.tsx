import { useId, type ReactNode } from 'react';

export interface TooltipProps {
  /** The tooltip text (already translated). */
  content: string;
  /** The trigger; spread the props on a focusable element. */
  children: (trigger: { 'aria-describedby': string }) => ReactNode;
}

/**
 * A short description shown on hover and keyboard focus, and always available to screen
 * readers through aria-describedby. For a disabled action use aria-disabled (not disabled),
 * so the button stays focusable and the tooltip can be reached.
 */
export function Tooltip({ content, children }: TooltipProps) {
  const id = useId();
  return (
    <span className="group relative inline-flex">
      {children({ 'aria-describedby': id })}
      <span
        role="tooltip"
        id={id}
        className="pointer-events-none absolute left-1/2 top-full z-40 mt-2 w-max max-w-xs -translate-x-1/2 rounded-md bg-text px-2.5 py-1.5 text-caption text-bg opacity-0 shadow transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      >
        {content}
      </span>
    </span>
  );
}
