import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Screen } from './Screen';
import { EmptyState } from './EmptyState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called with the error name only (never the message: it may contain data). */
  onError?: (errorName: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** The translated fallback (a function component, so it can use hooks). */
export function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Screen testID="error-fallback">
      <EmptyState
        icon="alert-circle-outline"
        title={t('errors.boundaryTitle')}
        message={t('errors.boundaryMessage')}
        action={{ label: t('common.tryAgain'), onPress: onRetry }}
      />
    </Screen>
  );
}

/**
 * Catches render errors below it and shows a friendly fallback with "Try again" (re-renders the
 * children). Error details are not shown or logged: they could contain credential data.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onError?.(error.name);
  }

  private readonly retry = () => this.setState({ hasError: false });

  override render() {
    return this.state.hasError ? <ErrorFallback onRetry={this.retry} /> : this.props.children;
  }
}
