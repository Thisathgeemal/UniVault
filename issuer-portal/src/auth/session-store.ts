/**
 * Where the staff token lives (Decision 016): in memory (AuthProvider) plus ONE copy in
 * sessionStorage, so a page refresh keeps the session while closing the tab ends it.
 * NEVER localStorage: it outlives the tab and is shared with every tab and every later visit.
 */
export const SESSION_TOKEN_KEY = 'univault.issuer-portal.token';

export const sessionTokenStore = {
  read(): string | null {
    try {
      return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  write(token: string): void {
    try {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } catch {
      // storage blocked: the session then lasts until the page is reloaded
    }
  },
  clear(): void {
    try {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch {
      // nothing stored
    }
  },
};

/**
 * The token's `exp` (seconds), read WITHOUT verifying the signature: for UI timing only (when
 * to sign out). The backend verifies every token; never use this for a security decision.
 */
export function tokenExpiresAt(token: string): number | null {
  const payload = token.split('.')[1];
  if (!payload) return null;
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const exp = (JSON.parse(atob(padded)) as { exp?: unknown }).exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null;
  } catch {
    return null;
  }
}
