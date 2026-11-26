/**
 * Route tree (React Router data router, so every route has an error boundary):
 *
 *   /login                  public (signed in → returnTo or the dashboard)
 *   <ProtectedLayout>       everything else: session required
 *     APP_ROUTES            each wrapped in RequireRole with the route's roles
 *     /holders/new          register a holder (the Holders route's roles)
 *     /holders/:holderId    one holder (the Holders route's roles)
 *     /credentials/new      issue a credential (the Credentials route's roles)
 *     /credentials/:id      one credential; the success page after issuing (?issued=1)
 *     *                     404
 */
import type { ReactNode } from 'react';
import type { RouteObject } from 'react-router';
import { RequireRole } from './auth/RequireRole.js';
import { ProtectedLayout } from './layout/ProtectedLayout.js';
import { RootLayout } from './layout/RootLayout.js';
import { ComingSoonPage } from './pages/ComingSoonPage.js';
import { CredentialPage } from './pages/credentials/CredentialPage.js';
import { CredentialsPage } from './pages/credentials/CredentialsPage.js';
import { IssueCredentialPage } from './pages/credentials/IssueCredentialPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { HolderDetailPage } from './pages/holders/HolderDetailPage.js';
import { HolderRegisterPage } from './pages/holders/HolderRegisterPage.js';
import { HoldersListPage } from './pages/holders/HoldersListPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { NotFoundPage, RouteErrorPage } from './pages/StatusPages.js';
import { APP_ROUTES, type AppRoute } from './routes/app-routes.js';

/** The built pages; every other menu route is a placeholder (comingInSprint). */
const PAGES: Partial<Record<string, ReactNode>> = {
  dashboard: <DashboardPage />,
  holders: <HoldersListPage />,
  credentials: <CredentialsPage />,
};

function pageFor(route: AppRoute) {
  return route.comingInSprint === undefined ? PAGES[route.id] : <ComingSoonPage route={route} />;
}

const HOLDERS = APP_ROUTES.find((route) => route.id === 'holders')!;
const CREDENTIALS = APP_ROUTES.find((route) => route.id === 'credentials')!;

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
            {
              path: '/holders/new',
              element: (
                <RequireRole roles={HOLDERS.roles}>
                  <HolderRegisterPage />
                </RequireRole>
              ),
              errorElement: <RouteErrorPage />,
            },
            {
              path: '/holders/:holderId',
              element: (
                <RequireRole roles={HOLDERS.roles}>
                  <HolderDetailPage />
                </RequireRole>
              ),
              errorElement: <RouteErrorPage />,
            },
            {
              path: '/credentials/new',
              element: (
                <RequireRole roles={CREDENTIALS.roles}>
                  <IssueCredentialPage />
                </RequireRole>
              ),
              errorElement: <RouteErrorPage />,
            },
            {
              path: '/credentials/:credentialId',
              element: (
                <RequireRole roles={CREDENTIALS.roles}>
                  <CredentialPage />
                </RequireRole>
              ),
              errorElement: <RouteErrorPage />,
            },
            { path: '*', element: <NotFoundPage /> },
          ],
        },
      ],
    },
  ];
}
