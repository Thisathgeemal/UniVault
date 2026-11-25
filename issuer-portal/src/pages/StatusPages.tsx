/** Not permitted, 404 and the route-level error page. */
import { buttonVariants, ErrorFallback } from '@univault/portal-ui';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';

function DashboardLink() {
  const { t } = useTranslation();
  return (
    <Link to="/" className={buttonVariants({ variant: 'outline' })}>
      {t('common.backToDashboard')}
    </Link>
  );
}

/** Shown inside the layout when the user's role may not open the page. */
export function NotPermittedPage() {
  const { t } = useTranslation();
  return (
    <ErrorFallback
      title={t('errors.notPermitted.title')}
      message={t('errors.notPermitted.message')}
      action={<DashboardLink />}
    />
  );
}

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <ErrorFallback
      title={t('errors.notFound.title')}
      message={t('errors.notFound.message')}
      action={<DashboardLink />}
    />
  );
}

/** Route errorElement: a crash in a page shows this instead of a blank screen (no details). */
export function RouteErrorPage() {
  const { t } = useTranslation();
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />;
  return (
    <ErrorFallback
      title={t('errors.pageCrashed.title')}
      message={t('errors.pageCrashed.message')}
      retryLabel={t('errors.pageCrashed.reload')}
      onRetry={() => window.location.reload()}
      action={<DashboardLink />}
    />
  );
}
