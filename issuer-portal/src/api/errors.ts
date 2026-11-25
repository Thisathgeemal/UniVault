import { z } from 'zod';

/** Code used when the request never got a response (offline, DNS, CORS, server down). */
export const NETWORK_ERROR = 'NETWORK_ERROR';

/** The backend's error body: { error: { code, message, details?, requestId? } } */
const errorBodySchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});

export interface ApiErrorInit {
  status: number;
  code: string;
  message: string;
  details?: unknown;
  requestId?: string | undefined;
}

/** Any failed API call. `status` 0 = no response (network failure). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }

  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/** Turns a non-2xx response into an ApiError (backend format, or a fallback code). */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // not JSON (e.g. a proxy error page)
  }
  const parsed = errorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details, requestId } = parsed.data.error;
    return new ApiError({ status: response.status, code, message, details, requestId });
  }
  return new ApiError({
    status: response.status,
    code: response.status === 429 ? 'RATE_LIMITED' : `HTTP_${response.status}`,
    message: response.statusText || `Request failed with status ${response.status}`,
  });
}

export const networkError = () =>
  new ApiError({ status: 0, code: NETWORK_ERROR, message: 'The server could not be reached' });
