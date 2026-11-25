import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type { Staff } from '../src/api/auth.js';
import { sessionTokenStore } from '../src/auth/session-store.js';
import { createQueryClient } from '../src/query-client.js';
import { createRoutes } from '../src/router.js';
import { GOOD_PASSWORD, issued } from './mock-backend.js';

/** Renders the real route tree in a memory router, optionally with a stored session. */
export function renderApp(path = '/', options: { signedInAs?: Staff; token?: string } = {}) {
  if (options.token) sessionTokenStore.write(options.token);
  else if (options.signedInAs) sessionTokenStore.write(issued(options.signedInAs));
  const queryClient = createQueryClient();
  queryClient.setDefaultOptions({ queries: { retry: false } });
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  const user = userEvent.setup();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  const location = () => `${router.state.location.pathname}${router.state.location.search}`;
  return { ...view, router, queryClient, user, location };
}

/** Fills in and submits the login form. */
export async function signIn(
  user: ReturnType<typeof userEvent.setup>,
  email: string,
  password = GOOD_PASSWORD,
) {
  await user.type(await screen.findByLabelText('Email address'), email);
  await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}
