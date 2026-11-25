/**
 * Route tree (React Router data router, so every route has an error boundary):
 *
 *   /login                  public (signed in → returnTo or the dashboard)
 *   <ProtectedLayout>       everything else: session required
 *     APP_ROUTES            each wrapped in RequireRole with the route's roles
 *     *                     404
 */
import type { RouteObject } from 'react-router';
import { RequireRole } from './auth/RequireRole.js';
import { ProtectedLayout } from './layout/ProtectedLayout.js';
import { RootLayout } from './layout/RootLayout.js';
import { ComingSoonPage } from './pages/ComingSoonPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage, RouteErrorPage } from './pages/StatusPages.js';
import { APP_ROUTES, type AppRoute } from './routes/app-routes.js';

function pageFor(route: AppRoute) {
  return route.comingInSprint === undefined ? <DashboardPage /> : <ComingSoonPage route={route} />;
}

export function createRoutes(): RouteObject[] {
  return [
    {
      element: <RootLayout />,
      errorElement: <RouteErrorPage />,
      children: [
        { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
        {
          element: <ProtectedLayout />,
          children: [
            ...APP_ROUTES.map((route): RouteObject => ({
              path: route.path,
              element: <RequireRole roles={route.roles}>{pageFor(route)}</RequireRole>,
              errorElement: <RouteErrorPage />,
            })),
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ];
}
