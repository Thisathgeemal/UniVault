/**
 * The one way the portal talks to the backend. Adds `Authorization: Bearer <token>`, parses
 * errors into ApiError, and reports a 401 that means "your session is over" so the auth layer
 * can sign the user out from ANY request.
 */
import { apiErrorFromResponse, ApiError, networkError } from './errors.js';

/** 401 codes that end the session (the backend's requireAuth middleware). */
export const SESSION_ENDED_CODES: ReadonlySet<string> = new Set([
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'UNAUTHENTICATED',
]);

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the staff token (default true). Login sends none. */
  auth?: boolean;
  /** Don't report a session-ending 401 (logout: the session is ending anyway). */
  ignoreSessionEnd?: boolean;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  onSessionEnded: (code: string) => void;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  return {
    async request<T>(path: string, request: RequestOptions = {}): Promise<T> {
      const { method = 'GET', body, auth = true, ignoreSessionEnd = false, signal } = request;
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const token = auth ? options.getToken() : null;
      if (token) headers.Authorization = `Bearer ${token}`;

      let response: Response;
      try {
        response = await fetch(`${options.baseUrl}${path}`, {
          method,
          headers,
          // Bearer tokens only: never send cookies to the API
          credentials: 'omit',
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
          ...(signal ? { signal } : {}),
        });
      } catch (err) {
        if (signal?.aborted) throw err; // the caller cancelled: not a network failure
        throw networkError();
      }

      if (!response.ok) {
        const error = await apiErrorFromResponse(response);
        const sessionEnded =
          auth &&
          !ignoreSessionEnd &&
          response.status === 401 &&
          SESSION_ENDED_CODES.has(error.code);
        if (sessionEnded) options.onSessionEnded(error.code);
        throw error;
      }
      if (response.status === 204) return undefined as T;
      try {
        return (await response.json()) as T;
      } catch {
        throw new ApiError({
          status: response.status,
          code: 'INVALID_RESPONSE',
          message: 'The server sent an invalid response',
        });
      }
    },
  };
}
