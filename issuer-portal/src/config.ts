/**
 * Build-time configuration. Everything that starts with VITE_ is compiled into the browser
 * bundle and is PUBLIC: never put a secret in a VITE_ variable.
 */
export const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).replace(
  /\/+$/,
  '',
);
