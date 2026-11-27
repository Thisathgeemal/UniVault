/**
 * Wallet settings from EXPO_PUBLIC_* environment variables.
 *
 * EVERY EXPO_PUBLIC_* VALUE IS COMPILED INTO THE APP AND IS PUBLIC: anyone with the app can read
 * it. Never put a secret (API key, token, password, private key) in one.
 *
 * Expo replaces `process.env.EXPO_PUBLIC_NAME` at build time only when it is written out in
 * full (no destructuring, no process.env[name]); eslint-plugin-expo enforces that.
 */

export type ApiBaseUrlProblem = 'missing' | 'placeholder' | 'invalid';

export interface ApiBaseUrlConfig {
  /** Normalised base URL without a trailing slash (e.g. http://192.168.1.20:4000/api/v1). */
  apiBaseUrl: string | null;
  problem: ApiBaseUrlProblem | null;
  /**
   * True for localhost / 127.x: that is the PHONE itself, so a real device cannot reach the
   * backend on the PC this way (an emulator or simulator might).
   */
  isLoopback: boolean;
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/i;

/** Parses and checks the API base URL. An empty value means "not set". */
export function parseApiBaseUrl(raw: string | undefined): ApiBaseUrlConfig {
  const value = (raw || '').trim();
  if (!value) return { apiBaseUrl: null, problem: 'missing', isLoopback: false };
  if (value.includes('<') || value.includes('192.168.x.x')) {
    return { apiBaseUrl: null, problem: 'placeholder', isLoopback: false };
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { apiBaseUrl: null, problem: 'invalid', isLoopback: false };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { apiBaseUrl: null, problem: 'invalid', isLoopback: false };
  }
  return {
    apiBaseUrl: value.replace(/\/+$/, ''),
    problem: null,
    isLoopback: LOOPBACK.test(url.hostname),
  };
}

/** The configured API base URL (read once per call, so tests can change the variable). */
export function getApiConfig(): ApiBaseUrlConfig {
  return parseApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
}
