import { Outlet } from 'react-router';
import { AuthProvider } from '../auth/AuthProvider.js';

/** Root route: the session provider lives inside the router so pages can use both. */
export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
