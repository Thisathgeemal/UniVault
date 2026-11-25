/**
 * Content-Security-Policy of the PRODUCTION build (vite.config.ts injects it as a <meta> tag).
 *
 * - default-src 'self'; scripts and styles only from the portal's own origin: no inline
 *   scripts, no eval, no CDNs (fonts are self-hosted).
 * - connect-src: the portal's origin plus the API origin from VITE_API_BASE_URL.
 * - frame-ancestors 'none' (clickjacking) is NOT allowed in a <meta> CSP; the static host must
 *   send it as a header (docs/frontend/issuer-portal.md, "Security headers").
 *
 * The dev server gets no CSP: Vite's hot reload needs inline scripts and websockets.
 */
export function apiOrigin(apiBaseUrl: string): string | null {
  try {
    const url = new URL(apiBaseUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null; // relative URL: the API is on the portal's own origin ('self')
  }
}

export function contentSecurityPolicy(apiBaseUrl: string): string {
  const api = apiOrigin(apiBaseUrl);
  const directives: [string, string][] = [
    ['default-src', "'self'"],
    ['script-src', "'self'"],
    ['style-src', "'self'"],
    ['img-src', "'self' data:"],
    ['font-src', "'self'"],
    ['connect-src', api ? `'self' ${api}` : "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
  ];
  return directives.map(([name, value]) => `${name} ${value}`).join('; ');
}
