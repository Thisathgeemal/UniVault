import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from './cn.js';

export interface DialogProps {
  open: boolean;
  title: string;
  /** Optional text under the title, linked with aria-describedby. */
  description?: string;
  /** Escape (and nothing else) calls this; ignored while `busy`. */
  onClose: () => void;
  children: ReactNode;
  /** The buttons at the bottom (already translated). */
  footer: ReactNode;
  /** While true (e.g. a request is running) Escape does not close the dialog. */
  busy?: boolean;
  className?: string;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A modal dialog with a form or other content (role="dialog", aria-modal). Focus moves to the
 * first control, Tab stays inside, Escape closes (unless busy), and focus returns to where it
 * was afterwards. For a yes/no question use ConfirmDialog.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  busy = false,
  className,
}: DialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  }, [onClose, busy]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'flex max-h-full w-full max-w-lg flex-col gap-4 overflow-auto rounded-md border border-border bg-surface p-6 shadow-lg',
          className,
        )}
      >
        <div>
          <h2 id={titleId} className="text-h2">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-body-sm text-text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {children}
        <div className="flex flex-wrap justify-end gap-2">{footer}</div>
      </div>
    </div>
  );
}
