/**
 * Login page: success, every error code's message, the lockout time in Asia/Colombo,
 * client-side validation, pending state, show/hide toggle and autocomplete attributes.
 */
import { screen, waitFor } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { SESSION_TOKEN_KEY } from '../src/auth/session-store.js';
import { ADMIN, API, errorBody, GOOD_PASSWORD, requests, server } from './mock-backend.js';
import { renderApp, signIn } from './render-app.js';

const loginFails = (status: number, body?: unknown) =>
  server.use(
    http.post(`${API}/auth/login`, () =>
      body === undefined
        ? new HttpResponse('Too Many Requests', { status })
        : HttpResponse.json(body, { status }),
    ),
  );

describe('login page', () => {
  it('signs in and lands on the dashboard with organisation, name and role', async () => {
    const { user, location } = renderApp('/login');
    await signIn(user, ADMIN.email);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Welcome, ${ADMIN.displayName}` }),
    ).toBeInTheDocument();
    expect(location()).toBe('/');
    expect(screen.getByTestId('header-org')).toHaveTextContent(ADMIN.issuer.name);
    expect(screen.getByTestId('dashboard-role')).toHaveTextContent('Administrator');
    expect(window.sessionStorage.getItem(SESSION_TOKEN_KEY)).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    // Login sends no token; the email was sent exactly as validated
    expect(requests[0]).toMatchObject({
      path: '/auth/login',
      authorization: null,
      body: { email: ADMIN.email },
    });
  });

  it('trims a pasted email before sending it (same rule as the backend)', async () => {
    const { user } = renderApp('/login');
    await signIn(user, `  ${ADMIN.email}  `);
    await screen.findByRole('heading', { level: 1 });
    expect(requests[0]!.body).toEqual({ email: ADMIN.email, password: GOOD_PASSWORD });
  });

  it('INVALID_CREDENTIALS: one generic message that never says which field was wrong', async () => {
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email, 'wrong-password');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The email address or password is not correct.');
    expect(screen.getByLabelText('Email address')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText('Password')).not.toHaveAttribute('aria-invalid');
    expect(window.sessionStorage.length).toBe(0);
  });

  it('ACCOUNT_LOCKED: shows details.lockedUntil as Asia/Colombo local time', async () => {
    // 10:00 UTC = 15:30 in Sri Lanka (UTC+05:30), whatever the test machine's time zone
    loginFails(
      423,
      errorBody('ACCOUNT_LOCKED', 'Too many failed login attempts.', {
        lockedUntil: '2026-11-24T10:00:00.000Z',
      }),
    );
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/locked after too many failed sign-in attempts/);
    expect(alert).toHaveTextContent(/3:30\s?pm/i);
    // Day/month order depends on the ICU data of the runtime (en-LK)
    expect(alert).toHaveTextContent(/24 Nov,? 2026|Nov 24, 2026/);
    expect(alert).toHaveTextContent('(Sri Lanka time)');
  });

  it('ACCOUNT_LOCKED without a usable time still explains the lock', async () => {
    loginFails(423, errorBody('ACCOUNT_LOCKED', 'Locked', { lockedUntil: 'not-a-date' }));
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account is locked after too many failed sign-in attempts. Try again later.',
    );
  });

  it.each([
    [
      '429 RATE_LIMITED (backend error body)',
      429,
      errorBody('RATE_LIMITED', 'Too many login attempts'),
    ],
    ['429 without a JSON body (e.g. a proxy)', 429, undefined],
  ])('%s: asks the user to wait', async (_label, status, body) => {
    loginFails(status, body);
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many sign-in attempts from this device. Wait a few minutes, then try again.',
    );
  });

  it('VALIDATION_ERROR from the server: plain message', async () => {
    loginFails(
      400,
      errorBody('VALIDATION_ERROR', 'Invalid request body', [
        { path: 'email', message: 'Invalid email' },
      ]),
    );
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a valid email address and your password.',
    );
  });

  it('network failure: says the server cannot be reached', async () => {
    server.use(http.post(`${API}/auth/login`, () => HttpResponse.error()));
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot reach the UniVault server. Check your connection and try again.',
    );
  });

  it('an unexpected server error: generic message with the request reference', async () => {
    loginFails(500, errorBody('INTERNAL_ERROR', 'Internal server error'));
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).toHaveTextContent('Reference: req-test-0001');
  });

  it('validates on the client: required fields and a valid email, without calling the API', async () => {
    const { user } = renderApp('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Email address')).toHaveFocus();

    await user.type(screen.getByLabelText('Email address'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'x');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    const message = screen.getByText('Enter a valid email address, like name@example.com.');
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-describedby', message.id);
    expect(screen.queryByText('Enter your password.')).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Email address'));
    await user.type(screen.getByLabelText('Email address'), ADMIN.email);
    await user.clear(screen.getByLabelText('Password'));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(requests).toHaveLength(0);
  });

  it('refuses a password over 200 characters (backend limit)', async () => {
    const { user } = renderApp('/login');
    await user.type(await screen.findByLabelText('Email address'), ADMIN.email);
    await user.click(screen.getByLabelText('Password'));
    await user.paste('x'.repeat(201));
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('The password is too long.')).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('disables the submit button while the request is pending', async () => {
    server.use(
      http.post(`${API}/auth/login`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const { user } = renderApp('/login');
    await signIn(user, ADMIN.email);
    const button = await screen.findByRole('button', { name: 'Signing in…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('has the right autocomplete attributes and a show/hide password toggle', async () => {
    const { user } = renderApp('/login');
    const email = await screen.findByLabelText('Email address');
    const password = screen.getByLabelText('Password');
    expect(email).toHaveAttribute('autocomplete', 'username');
    expect(email).toHaveAttribute('type', 'email');
    expect(password).toHaveAttribute('autocomplete', 'current-password');
    expect(password).toHaveAttribute('type', 'password');

    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('aria-controls', password.id);
    await user.click(toggle);
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(password).toHaveAttribute('type', 'password');
  });

  it('redirects a signed-in user away from /login to the dashboard', async () => {
    const { location } = renderApp('/login', { signedInAs: ADMIN });
    await screen.findByRole('heading', { level: 1, name: /Welcome/ });
    await waitFor(() => expect(location()).toBe('/'));
  });
});
