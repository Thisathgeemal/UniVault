/**
 * Session (Decision 016): protected-route redirect with a safe returnTo, restore through
 * /auth/me, a 401 mid-session, sign-out at token expiry, logout, and the storage rule
 * (memory + sessionStorage, never localStorage).
 */
import type { QueryClient } from '@tanstack/react-query';
import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ME_QUERY_KEY } from '../src/auth/auth-context.js';
import { loginPathFor, safeReturnTo } from '../src/auth/return-to.js';
import { SESSION_TOKEN_KEY, tokenExpiresAt } from '../src/auth/session-store.js';
import {
  ADMIN,
  API,
  errorBody,
  issued,
  makeToken,
  OFFICER,
  requests,
  server,
} from './mock-backend.js';
import { renderApp, signIn } from './render-app.js';

const EXPIRED_MESSAGE = 'Your session has expired, please sign in again.';

/**
 * The cache was cleared: no query holds data. (The signed-out AuthProvider's disabled
 * /auth/me observer may re-register an EMPTY query entry, which holds nothing.)
 */
function expectNoCachedData(queryClient: QueryClient) {
  expect(queryClient.getQueryData(ME_QUERY_KEY)).toBeUndefined();
  for (const query of queryClient.getQueryCache().getAll()) {
    expect(query.state.data, String(query.queryKey)).toBeUndefined();
  }
}

afterEach(() => vi.restoreAllMocks());

describe('protected routes and returnTo', () => {
  it('sends a signed-out visitor to /login with returnTo, and back there after signing in', async () => {
    const { user, location } = renderApp('/holders?page=2');
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(location()).toBe(`/login?returnTo=${encodeURIComponent('/holders?page=2')}`);
    expect(screen.queryByText(EXPIRED_MESSAGE)).not.toBeInTheDocument(); // never signed in
    await signIn(user, ADMIN.email);
    expect(await screen.findByRole('heading', { level: 1, name: 'Holders' })).toBeInTheDocument();
    expect(location()).toBe('/holders?page=2');
  });

  it.each([
    'https://evil.example/phish',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    '/login',
  ])('rejects returnTo=%s and goes to the dashboard instead', async (returnTo) => {
    const { user, location } = renderApp(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    await signIn(user, ADMIN.email);
    await screen.findByRole('heading', { level: 1, name: /Welcome/ });
    expect(location()).toBe('/');
  });

  it('safeReturnTo accepts internal paths only', () => {
    expect(safeReturnTo('/credentials?status=valid#top')).toBe('/credentials?status=valid#top');
    expect(safeReturnTo('/a/../holders')).toBe('/holders');
    for (const bad of [
      null,
      '',
      'holders',
      'http://x.example',
      '//x.example',
      '/\\x',
      '/a\u0000b',
      `/${'a'.repeat(2050)}`,
    ]) {
      expect(safeReturnTo(bad)).toBe('/');
    }
    expect(safeReturnTo('/%0a')).toBe('/%0a'); // encoded text is a harmless internal path
    expect(loginPathFor({ pathname: '/', search: '', hash: '' })).toBe('/login');
    expect(loginPathFor({ pathname: '/staff', search: '?q=1', hash: '' })).toBe(
      '/login?returnTo=%2Fstaff%3Fq%3D1',
    );
  });
});

describe('session restore', () => {
  it('restores the user from a stored token through GET /auth/me', async () => {
    const token = issued(OFFICER);
    renderApp('/credentials', { token });
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Credentials' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('header-user')).toHaveTextContent(OFFICER.displayName);
    expect(screen.getByText('Officer')).toBeInTheDocument();
    expect(requests).toContainEqual(
      expect.objectContaining({ path: '/auth/me', authorization: `Bearer ${token}` }),
    );
  });

  it('clears an invalid stored token and goes to /login', async () => {
    const { location } = renderApp('/credentials', { token: makeToken(ADMIN) }); // not known to the server
    expect(await screen.findByText(EXPIRED_MESSAGE)).toBeInTheDocument();
    expect(location()).toBe('/login?returnTo=%2Fcredentials');
    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
  });

  it('offers a retry when /auth/me cannot be reached, keeping the session', async () => {
    const token = issued(ADMIN);
    server.use(http.get(`${API}/auth/me`, () => HttpResponse.error(), { once: true }));
    const { user } = renderApp('/', { token });
    expect(
      await screen.findByRole('heading', { name: 'We could not load your session' }),
    ).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(token);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 1, name: /Welcome/ })).toBeInTheDocument();
  });
});

describe('session end', () => {
  it.each(['TOKEN_EXPIRED', 'INVALID_TOKEN', 'UNAUTHENTICATED'])(
    'a 401 %s from any request signs out with the session-expired message and a returnTo',
    async (code) => {
      const { queryClient, location } = renderApp('/credentials', { signedInAs: ADMIN });
      await screen.findByRole('heading', { level: 1, name: 'Credentials' });
      server.use(
        http.get(`${API}/auth/me`, () =>
          HttpResponse.json(errorBody(code, 'Session over'), { status: 401 }),
        ),
      );
      await act(() => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY }));
      expect(await screen.findByText(EXPIRED_MESSAGE)).toBeInTheDocument();
      expect(location()).toBe('/login?returnTo=%2Fcredentials');
      expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expectNoCachedData(queryClient);
    },
  );

  it('a 403 does not end the session', async () => {
    const { queryClient, location } = renderApp('/credentials', { signedInAs: ADMIN });
    await screen.findByRole('heading', { level: 1, name: 'Credentials' });
    server.use(
      http.get(`${API}/auth/me`, () =>
        HttpResponse.json(errorBody('FORBIDDEN', 'No'), { status: 403 }),
      ),
    );
    await act(() => queryClient.refetchQueries({ queryKey: ME_QUERY_KEY }));
    expect(location()).toBe('/credentials');
    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).not.toBeNull();
  });

  it("signs out at the token's expiry time (read from the JWT for timing only)", async () => {
    const token = issued(ADMIN, 1); // expires in 1 s
    expect(tokenExpiresAt(token)).toBeGreaterThan(Date.now() / 1000);
    const { location } = renderApp('/holders', { token });
    await screen.findByRole('heading', { level: 1, name: 'Holders' });
    expect(await screen.findByText(EXPIRED_MESSAGE, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(location()).toBe('/login?returnTo=%2Fholders');
  });

  it('tokenExpiresAt ignores tokens without a readable exp', () => {
    expect(tokenExpiresAt('not-a-jwt')).toBeNull();
    expect(tokenExpiresAt('a.%%%.c')).toBeNull();
    expect(tokenExpiresAt(`a.${btoa(JSON.stringify({ exp: 'soon' }))}.c`)).toBeNull();
  });

  it('logout calls the backend, clears sessionStorage and the query cache, and goes to /login', async () => {
    const token = issued(ADMIN);
    const { user, queryClient, location } = renderApp('/holders', { token });
    await screen.findByRole('heading', { level: 1, name: 'Holders' });
    expect(queryClient.getQueryData(ME_QUERY_KEY)).toEqual(ADMIN);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(location()).toBe('/login');
    expect(screen.queryByText(EXPIRED_MESSAGE)).not.toBeInTheDocument();
    expect(requests).toContainEqual(
      expect.objectContaining({ path: '/auth/logout', authorization: `Bearer ${token}` }),
    );
    expect(window.sessionStorage.length).toBe(0);
    expectNoCachedData(queryClient);
  });

  it('logout still signs out locally when the backend cannot be reached', async () => {
    server.use(http.post(`${API}/auth/logout`, () => HttpResponse.error()));
    const { user, location } = renderApp('/', { signedInAs: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(location()).toBe('/login'));
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe('token storage', () => {
  it('never writes the token to localStorage (login, restore and logout)', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { user, unmount } = renderApp('/login');
    await signIn(user, ADMIN.email);
    await screen.findByRole('heading', { level: 1, name: /Welcome/ });
    const token = window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    expect(token).toBeTruthy();
    unmount();

    // Refresh: restore from sessionStorage, then sign out
    const again = renderApp('/');
    await screen.findByRole('heading', { level: 1, name: /Welcome/ });
    await again.user.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('heading', { name: 'Sign in' });

    const localWrites = setItem.mock.contexts
      .map((storage, i) => ({ storage, args: setItem.mock.calls[i]! }))
      .filter(({ storage }) => storage === window.localStorage);
    for (const { args } of localWrites) {
      expect(args[0]).toBe('univault.language');
      expect(args[1]).not.toContain(token!);
    }
    expect(Object.keys(window.localStorage)).not.toContain(SESSION_TOKEN_KEY);
    expect(JSON.stringify({ ...window.localStorage })).not.toContain(token!.split('.')[1]!);
  });
});
