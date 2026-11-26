import { ToastProvider } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';
import { AuthProvider } from '../auth/AuthProvider.js';

/**
 * Root route: the session provider lives inside the router so pages can use both; toasts
 * (e.g. "holder registered") survive navigating to the next page.
 */
export function RootLayout() {
  const { t } = useTranslation();
  return (
    <AuthProvider>
      <ToastProvider closeLabel={t('common.close')}>
        <Outlet />
      </ToastProvider>
    </AuthProvider>
  );
}
