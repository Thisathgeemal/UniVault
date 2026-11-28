import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { Close } from './icons.js';

export type ToastTone = 'success' | 'info' | 'error';
export interface ToastOptions {
  message: string;
  tone?: ToastTone;
}
interface ToastItem extends Required<ToastOptions> {
  id: number;
}

export interface ToastApi {
  show: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible name of each toast's close button (already translated). */
  closeLabel: string;
  /** How long a toast stays (default 6 s); it can always be closed earlier. */
  durationMs?: number;
}

const TONES: Record<ToastTone, string> = {
  success: 'border-status-valid bg-status-valid-bg text-status-valid-text',
  info: 'border-border bg-brand-soft text-text',
  error: 'border-status-revoked bg-status-revoked-bg text-status-revoked-text',
};

/**
 * Short confirmations ("Holder registered") in a polite live region (aria-live) at the bottom
 * of the screen. The region is always present, so screen readers announce new toasts.
 */
export function ToastProvider({ children, closeLabel, durationMs = 6000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    ({ message, tone = 'success' }: ToastOptions) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
    },
    [dismiss, durationMs],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const api = useMemo(() => ({ show }), [show]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* A polite live region without role="status", so it never competes with a page's own
          status message (e.g. a loading spinner) */}
      <div
        aria-live="polite"
        data-testid="toast-region"
        className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-tone={toast.tone}
            className={cn(
              'pointer-events-auto flex items-start justify-between gap-3 rounded-md border px-4 py-3 text-body-sm shadow-md',
              TONES[toast.tone],
            )}
          >
            <p>{toast.message}</p>
            <button
              type="button"
              aria-label={closeLabel}
              className="rounded-md p-0.5 hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
              onClick={() => dismiss(toast.id)}
            >
              <Close className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** show({ message, tone }) from anywhere inside a ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
