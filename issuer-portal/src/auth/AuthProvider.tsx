/**
 * Staff session (Decision 016).
 *
 * - The token is kept in memory, with one copy in sessionStorage so a refresh keeps the
 *   session. Never localStorage.
 * - On load, a stored token is checked with GET /auth/me (organisation, name, role come from
 *   the server, not from the token).
 * - Any 401 TOKEN_EXPIRED / INVALID_TOKEN / UNAUTHENTICATED from any request ends the session:
 *   token, storage and the TanStack Query cache are cleared and the protected layout sends the
 *   user to /login with a safe returnTo and the "session expired" notice.
 * - A timer also ends the session at the token's `exp` (read for UI timing only).
 * - The provider never navigates itself: the protected layout is the ONE place that redirects
 *   a signed-out user (with returnTo after an expiry, plain /login after a logout), so two
 *   navigations can never race.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, logout, type Staff } from '../api/auth.js';
import { createApiClient, type ApiClient } from '../api/client.js';
import { ApiError } from '../api/errors.js';
import { API_BASE_URL } from '../config.js';
import {
  AuthContext,
  ME_QUERY_KEY,
  type AuthContextValue,
  type AuthNotice,
  type AuthStatus,
} from './auth-context.js';
import { sessionTokenStore, tokenExpiresAt } from './session-store.js';

/** setTimeout overflows above 2^31-1 ms (~24.8 days) and would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * The token the API client sends, outside React state so a request always uses the current
 * one, plus the handler the client calls when the server says the session is over.
 */
interface Session {
  api: ApiClient;
  token: () => string | null;
  setToken: (token: string | null) => void;
  onSessionEnded: (handler: () => void) => void;
}

function createSession(initialToken: string | null): Session {
  let token = initialToken;
  let sessionEnded = () => {};
  return {
    api: createApiClient({
      baseUrl: API_BASE_URL,
      getToken: () => token,
      onSessionEnded: () => sessionEnded(),
    }),
    token: () => token,
    setToken: (next) => {
      token = next;
      if (next === null) sessionTokenStore.clear();
      else sessionTokenStore.write(next);
    },
    onSessionEnded: (handler) => {
      sessionEnded = handler;
    },
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session] = useState(() => createSession(sessionTokenStore.read()));
  const [token, setToken] = useState<string | null>(() => session.token());
  const [notice, setNotice] = useState<AuthNotice>(null);
  const [signingOut, setSigningOut] = useState(false);

  const clearSession = useCallback(() => {
    session.setToken(null);
    setToken(null);
    queryClient.clear();
  }, [queryClient, session]);

  /** Session ended by the server (401) or by the expiry timer. */
  const expireSession = useCallback(() => {
    if (session.token() === null) return; // already ended (parallel 401s)
    clearSession();
    setNotice('sessionExpired');
  }, [clearSession, session]);

  useEffect(() => session.onSessionEnded(expireSession), [session, expireSession]);

  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: () => fetchMe(session.api),
    enabled: token !== null,
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // Sign out when the token expires (UI timing only; the backend enforces expiry)
  useEffect(() => {
    if (token === null) return undefined;
    const exp = tokenExpiresAt(token);
    if (exp === null) return undefined;
    const delay = Math.min(Math.max(exp * 1000 - Date.now(), 0), MAX_TIMER_MS);
    const timer = setTimeout(expireSession, delay);
    return () => clearTimeout(timer);
  }, [token, expireSession]);

  const startSession = useCallback(
    (newToken: string, user: Staff) => {
      session.setToken(newToken);
      queryClient.setQueryData(ME_QUERY_KEY, user);
      setNotice(null);
      setToken(newToken);
    },
    [queryClient, session],
  );

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout(session.api);
    } catch {
      // The session ends locally whatever the server says (offline, already expired)
    } finally {
      setSigningOut(false);
    }
    clearSession();
    setNotice('signedOut');
  }, [clearSession, session]);

  const { refetch } = me;
  const retryRestore = useCallback(() => void refetch(), [refetch]);

  let status: AuthStatus;
  if (token === null) status = 'signedOut';
  else if (me.data) status = 'signedIn';
  else if (!me.isError) status = 'restoring';
  else if (me.error instanceof ApiError && me.error.status === 401) status = 'signedOut';
  else status = 'restoreFailed';

  const user = status === 'signedIn' ? (me.data ?? null) : null;
  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      notice,
      api: session.api,
      startSession,
      signOut,
      signingOut,
      retryRestore,
    }),
    [status, user, notice, session, startSession, signOut, signingOut, retryRestore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
