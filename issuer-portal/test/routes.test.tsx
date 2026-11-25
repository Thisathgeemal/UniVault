/**
 * Roles: the menu and the guards come from the same route config, so an officer neither sees
 * nor opens admin pages; an admin does both. Also 404 and the route error boundary.
 */
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { RouteErrorPage } from '../src/pages/StatusPages.js';
import { APP_ROUTES, canAccess } from '../src/routes/app-routes.js';
import { ADMIN, OFFICER } from './mock-backend.js';
import { renderApp } from './render-app.js';

const ADMIN_ONLY = ['Issuer keys', 'Staff'];
const EVERYONE = ['Dashboard', 'Holders', 'Credentials', 'Credential offers'];
const menu = async () => within(await screen.findByRole('navigation', { name: 'Main navigation' }));

describe('role-based navigation and guards', () => {
  it('an officer sees only the shared items', async () => {
    renderApp('/', { signedInAs: OFFICER });
    const nav = await menu();
    for (const name of EVERYONE) expect(nav.getByRole('link', { name })).toBeInTheDocument();
    for (const name of ADMIN_ONLY)
      expect(nav.queryByRole('link', { name })).not.toBeInTheDocument();
  });

  it.each(['/issuer-keys', '/staff'])(
    'an officer opening %s gets "Not permitted", not a crash',
    async (path) => {
      const { location } = renderApp(path, { signedInAs: OFFICER });
      expect(await screen.findByRole('heading', { name: 'Not permitted' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Your role does not allow access to this page.',
      );
      expect(location()).toBe(path); // stays put, inside the layout
      expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute(
        'href',
        '/',
      );
    },
  );

  it('an admin sees and opens the admin pages (placeholders with their sprint)', async () => {
    const { user } = renderApp('/', { signedInAs: ADMIN });
    const nav = await menu();
    for (const name of [...EVERYONE, ...ADMIN_ONLY])
      expect(nav.getByRole('link', { name })).toBeInTheDocument();
    await user.click(nav.getByRole('link', { name: 'Issuer keys' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Issuer keys' }),
    ).toBeInTheDocument();
    expect(screen.getByText('This page is planned for Sprint 4.')).toBeInTheDocument();
    expect(nav.getByRole('link', { name: 'Issuer keys' })).toHaveAttribute('aria-current', 'page');
    await user.click(nav.getByRole('link', { name: 'Staff' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Staff' })).toBeInTheDocument();
  });

  it('every route in the config is either shared or admin-only, and canAccess agrees with the menu', () => {
    for (const route of APP_ROUTES) {
      expect(canAccess(route, 'admin')).toBe(true);
      expect(canAccess(route, 'officer')).toBe(!['issuer-keys', 'staff'].includes(route.id));
      expect(canAccess(route, undefined)).toBe(false);
    }
  });

  it('shows placeholder pages with the sprint they arrive in', async () => {
    renderApp('/credential-offers', { signedInAs: OFFICER });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Credential offers' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('This page is planned for Sprint 2.')).toBeInTheDocument();
  });
});

describe('404 and error boundary', () => {
  it('shows a 404 page inside the layout for an unknown path', async () => {
    renderApp('/no-such-page', { signedInAs: ADMIN });
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('a crashing page shows the route error page, without technical details', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error('secret internal detail');
    }
    const router = createMemoryRouter([
      { path: '/', element: <Broken />, errorElement: <RouteErrorPage /> },
    ]);
    render(<RouterProvider router={router} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This page could not be shown');
    expect(alert).not.toHaveTextContent('secret internal detail');
    expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it('a 404 route error response shows the not-found page', async () => {
    const router = createMemoryRouter(
      [{ path: '/', element: null, errorElement: <RouteErrorPage /> }],
      {
        initialEntries: ['/missing'],
      },
    );
    render(<RouterProvider router={router} />);
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
