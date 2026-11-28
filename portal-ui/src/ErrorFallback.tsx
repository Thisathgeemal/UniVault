import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './ui/button.js';

export interface ErrorFallbackProps {
  title: string;
  message: string;
  /** e.g. "Reference: <requestId>" for support (already translated) */
  reference?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Extra action, e.g. a link back to the dashboard */
  action?: ReactNode;
}

/** What the user sees when a page fails. Never shows stack traces. */
export function ErrorFallback({
  title,
  message,
  reference,
  retryLabel,
  onRetry,
  action,
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-lg flex-col items-center gap-3 px-6 py-16 text-center"
    >
      <h1 className="text-page-title font-semibold">{title}</h1>
      <p className="text-text-muted">{message}</p>
      {reference ? <p className="font-mono text-caption text-text-muted">{reference}</p> : null}
      <div className="flex gap-2">
        {onRetry && retryLabel ? <Button onClick={onRetry}>{retryLabel}</Button> : null}
        {action}
      </div>
    </div>
  );
}

export interface ErrorBoundaryProps {
  fallback: (error: unknown, reset: () => void) => ReactNode;
  /** Optional reporting hook (must not log personal data) */
  onError?: (error: unknown, info: ErrorInfo) => void;
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

/** Catches render errors below it and shows `fallback` instead of a blank page. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  reset = (): void => this.setState({ error: null, hasError: false });

  override render(): ReactNode {
    if (this.state.hasError) return this.props.fallback(this.state.error, this.reset);
    return this.props.children;
  }
}
