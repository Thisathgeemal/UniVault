import { createContext, useContext } from 'react';
import type { Staff } from '../api/auth.js';
import type { ApiClient } from '../api/client.js';

export type AuthStatus = 'signedOut' | 'restoring' | 'signedIn' | 'restoreFailed';

/**
 * Why the last session ended. 'sessionExpired' (401 or token expiry) shows a message on the
 * login page and keeps a returnTo; 'signedOut' (the user's logout) goes to plain /login.
 */
export type AuthNotice = 'sessionExpired' | 'signedOut' | null;

export interface AuthContextValue {
  status: AuthStatus;
  /** The signed-in staff member (organisation, name, role), from /auth/login or /auth/me. */
  user: Staff | null;
  notice: AuthNotice;
  /** The API client bound to this session's token. */
  api: ApiClient;
  /** After a successful login. */
  startSession: (token: string, user: Staff) => void;
  /** Logout: tells the backend, clears token, storage and cache, goes to /login. */
  signOut: () => Promise<void>;
  signingOut: boolean;
  /** /auth/me failed for a reason other than an ended session (e.g. offline): try again. */
  retryRestore: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const ME_QUERY_KEY = ['auth', 'me'] as const;

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
