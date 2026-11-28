import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './ui/button.js';

export interface FullscreenOverlayProps {
  open: boolean;
  /** Heading and accessible name of the overlay. */
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A full-window modal view (role="dialog", aria-modal) for showing one thing large, e.g. a QR
 * code to scan across a desk. Focus moves to the close button, Tab stays inside, Escape
 * closes, and focus returns to where it was afterwards.
 */
export function FullscreenOverlay({
  open,
  title,
  closeLabel,
  onClose,
  children,
}: FullscreenOverlayProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [
        ...dialogRef.current.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]'),
      ];
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
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-50 flex flex-col bg-surface p-6"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id={titleId} className="text-h2">
          {title}
        </h2>
        <Button ref={closeRef} variant="secondary" onClick={onClose}>
          {closeLabel}
        </Button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-auto">
        {children}
      </div>
    </div>
  );
}
