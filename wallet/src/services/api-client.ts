/**
 * UniVault backend API client (placeholder for Sprint 2: only GET /health so far).
 *
 * The base URL comes from EXPO_PUBLIC_API_BASE_URL (src/config/env.ts) and includes /api/v1.
 * Later tasks add the OpenID4VCI redemption calls here. Never log request or response bodies:
 * they will carry credentials and pre-authorised codes.
 */
import { getApiConfig, type ApiBaseUrlProblem } from '../config/env';

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the server could not be reached at all. */
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ApiNotConfiguredError extends Error {
  constructor(readonly problem: ApiBaseUrlProblem) {
    super(`EXPO_PUBLIC_API_BASE_URL is ${problem}`);
    this.name = 'ApiNotConfiguredError';
  }
}

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Abort after this many milliseconds (phones on bad Wi-Fi hang rather than fail). */
  timeoutMs?: number;
}

export interface ApiClient {
  readonly baseUrl: string;
  getJson<T>(path: string): Promise<{ status: number; body: T }>;
}

export const DEFAULT_TIMEOUT_MS = 8000;

export function createApiClient({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}: ApiClientOptions): ApiClient {
  return {
    baseUrl,
    async getJson<T>(path: string) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (error) {
        const timedOut = controller.signal.aborted;
        throw new ApiError(
          0,
          timedOut ? 'TIMEOUT' : 'NETWORK_ERROR',
          timedOut ? `No answer within ${timeoutMs} ms` : String(error),
        );
      } finally {
        clearTimeout(timer);
      }
      let body: T;
      try {
        body = (await response.json()) as T;
      } catch {
        throw new ApiError(response.status, 'INVALID_RESPONSE', 'Response is not JSON');
      }
      return { status: response.status, body };
    },
  };
}

/** The client for the configured base URL; throws ApiNotConfiguredError when it is unusable. */
export function getApiClient(options: Omit<ApiClientOptions, 'baseUrl'> = {}): ApiClient {
  const config = getApiConfig();
  if (!config.apiBaseUrl) throw new ApiNotConfiguredError(config.problem ?? 'missing');
  return createApiClient({ ...options, baseUrl: config.apiBaseUrl });
}

export interface HealthResult {
  reachable: boolean;
  /** The backend's own status ("ok" or "degraded"), when it answered. */
  serverStatus: string | null;
  httpStatus: number;
  durationMs: number;
  errorCode: string | null;
}

/**
 * GET /health. "Reachable" means the backend answered with its health JSON, even when it says
 * "degraded" (503): the phone can talk to it, which is what the check is for.
 */
export async function checkHealth(
  client: ApiClient,
  now: () => number = Date.now,
): Promise<HealthResult> {
  const started = now();
  try {
    const { status, body } = await client.getJson<{ status?: unknown }>('/health');
    const serverStatus = typeof body?.status === 'string' ? body.status : null;
    return {
      reachable: serverStatus !== null,
      serverStatus,
      httpStatus: status,
      durationMs: now() - started,
      errorCode: serverStatus === null ? 'UNEXPECTED_RESPONSE' : null,
    };
  } catch (error) {
    return {
      reachable: false,
      serverStatus: null,
      httpStatus: error instanceof ApiError ? error.status : 0,
      durationMs: now() - started,
      errorCode: error instanceof ApiError ? error.code : 'UNKNOWN',
    };
  }
}
