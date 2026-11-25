/**
 * returnTo handling for the login redirect. Only internal paths are accepted: absolute URLs,
 * protocol-relative URLs (//evil.example), backslash tricks and control characters fall back
 * to the dashboard, so the login page can never be used as an open redirect.
 */
const PROBE_ORIGIN = 'https://portal.invalid';
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point
const UNSAFE_CHARACTERS = /[\\\u0000-\u001f\u007f]/;

export function safeReturnTo(value: string | null | undefined, fallback = '/'): string {
  if (!value || value.length > 2048) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (UNSAFE_CHARACTERS.test(value)) return fallback;
  let url: URL;
  try {
    url = new URL(value, PROBE_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PROBE_ORIGIN || url.pathname === '/login') return fallback;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** The login URL that brings the user back to `location` after signing in. */
export function loginPathFor(location: { pathname: string; search: string; hash: string }): string {
  const target = `${location.pathname}${location.search}${location.hash}`;
  if (location.pathname === '/login' || target === '/') return '/login';
  return `/login?returnTo=${encodeURIComponent(target)}`;
}
