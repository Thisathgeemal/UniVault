import type { ReactNode } from 'react';
import type { Role } from '../api/auth.js';
import { NotPermittedPage } from '../pages/StatusPages.js';
import { useAuth } from './auth-context.js';

/**
 * Renders `children` only for the given roles; anyone else sees "Not permitted" (no crash, no
 * redirect). UI only: the backend enforces the same roles on every API call.
 */
export function RequireRole({ roles, children }: { roles: readonly Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <NotPermittedPage />;
  return children;
}
