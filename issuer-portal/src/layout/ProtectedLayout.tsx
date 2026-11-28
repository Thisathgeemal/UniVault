/**
 * Layout route for everything except /login. Waits for the session to be restored, sends a
 * signed-out user to /login?returnTo=<this page>, and frames the page with the shared AppShell.
 * The sidebar is built from APP_ROUTES, the same list the route guards use.
 */
import { AppShell, ErrorFallback, FullPageSpinner } from '@univault/portal-ui';
import { Certificate } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth/auth-context.js';
import { loginPathFor } from '../auth/return-to.js';
import { LanguageSwitcher } from '../components/LanguageSwitcher.js';
import { RouterLink } from '../components/RouterLink.js';
import { APP_ROUTES } from '../routes/app-routes.js';

export function ProtectedLayout() {
  const { t } = useTranslation();
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'restoring') return <FullPageSpinner label={t('common.loading')} />;
  if (auth.status === 'restoreFailed') {
    return (
      <ErrorFallback
        title={t('errors.restoreFailed.title')}
        message={t('errors.restoreFailed.message')}
        retryLabel={t('common.tryAgain')}
        onRetry={auth.retryRestore}
      />
    );
  }
  if (!auth.user) {
    // After a logout: plain /login. Otherwise (never signed in, session expired): come back here
    const to = auth.notice === 'signedOut' ? '/login' : loginPathFor(location);
    return <Navigate to={to} replace />;
  }

  const user = auth.user;
  return (
    <AppShell
      header={{
        appName: t('app.brand'),
        // the role tag is the only visual difference from the verifier portal (Decision 024)
        roleTag: { label: t('app.roleTag'), icon: Certificate },
        orgName: user.issuer.name,
        userName: user.displayName,
        roleLabel: t(`roles.${user.role}`),
        logoutLabel: t('header.signOut'),
        onLogout: () => void auth.signOut(),
        logoutPending: auth.signingOut,
        languageSwitcher: <LanguageSwitcher onBrand />,
      }}
      sidebar={{
        items: APP_ROUTES.map((route) => ({
          id: route.id,
          href: route.path,
          label: t(route.labelKey),
          icon: route.icon,
          roles: route.roles,
        })),
        currentRole: user.role,
        activePath: location.pathname,
        label: t('nav.label'),
        linkComponent: RouterLink,
      }}
      labels={{
        skipToContent: t('header.skipToContent'),
        openMenu: t('header.openMenu'),
        closeMenu: t('header.closeMenu'),
      }}
    >
      <Outlet />
    </AppShell>
  );
}
