/** API client: Authorization header, error parsing, session-ending 401s, network errors. */
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../src/api/client.js';
import { ApiError } from '../src/api/errors.js';
import { API, errorBody, server } from './mock-backend.js';

const client = (token: string | null = 'tok', onSessionEnded = vi.fn()) => ({
  api: createApiClient({ baseUrl: API, getToken: () => token, onSessionEnded }),
  onSessionEnded,
});

describe('api client', () => {
  it('sends the Bearer token and JSON, and returns the body', async () => {
    let seen: Request | undefined;
    server.use(
      http.post(`${API}/things`, ({ request }) => {
        seen = request.clone();
        return HttpResponse.json({ ok: true });
      }),
    );
    const { api } = client();
    expect(await api.request('/things', { method: 'POST', body: { a: 1 } })).toEqual({ ok: true });
    expect(seen!.headers.get('Authorization')).toBe('Bearer tok');
    expect(seen!.headers.get('Content-Type')).toBe('application/json');
    expect(await seen!.json()).toEqual({ a: 1 });
  });

  it('omits the token for auth: false and returns undefined for 204', async () => {
    let authorization: string | null = 'unset';
    server.use(
      http.get(`${API}/public`, ({ request }) => {
        authorization = request.headers.get('Authorization');
        return new HttpResponse(null, { status: 204 });
      }),
    );
    expect(await client().api.request('/public', { auth: false })).toBeUndefined();
    expect(authorization).toBeNull();
  });

  it('parses the backend error format into ApiError', async () => {
    server.use(
      http.get(`${API}/x`, () =>
        HttpResponse.json(errorBody('CREDENTIAL_NOT_FOUND', 'Not found', { id: 1 }), {
          status: 404,
        }),
      ),
    );
    const error = await client()
      .api.request('/x')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'CREDENTIAL_NOT_FOUND',
      message: 'Not found',
      details: { id: 1 },
      requestId: 'req-test-0001',
      isNetworkError: false,
    });
  });

  it('falls back to HTTP_<status> for a non-JSON error, and flags network failures', async () => {
    server.use(
      http.get(`${API}/html`, () => new HttpResponse('<h1>Bad gateway</h1>', { status: 502 })),
    );
    await expect(client().api.request('/html')).rejects.toMatchObject({
      status: 502,
      code: 'HTTP_502',
    });
    server.use(http.get(`${API}/down`, () => HttpResponse.error()));
    await expect(client().api.request('/down')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
      isNetworkError: true,
    });
  });

  it('rejects an invalid JSON success body', async () => {
    server.use(http.get(`${API}/bad`, () => new HttpResponse('not json', { status: 200 })));
    await expect(client().api.request('/bad')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('reports a session-ending 401, but not for login-style or ignored requests', async () => {
    server.use(
      http.get(`${API}/me`, () =>
        HttpResponse.json(errorBody('TOKEN_EXPIRED', 'Expired'), { status: 401 }),
      ),
    );
    const a = client();
    await expect(a.api.request('/me')).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
    expect(a.onSessionEnded).toHaveBeenCalledWith('TOKEN_EXPIRED');

    const b = client();
    await expect(b.api.request('/me', { auth: false })).rejects.toBeInstanceOf(ApiError);
    await expect(b.api.request('/me', { ignoreSessionEnd: true })).rejects.toBeInstanceOf(ApiError);
    expect(b.onSessionEnded).not.toHaveBeenCalled();

    server.use(
      http.get(`${API}/login-ish`, () =>
        HttpResponse.json(errorBody('INVALID_CREDENTIALS', 'No'), { status: 401 }),
      ),
    );
    const c = client();
    await expect(c.api.request('/login-ish')).rejects.toBeInstanceOf(ApiError);
    expect(c.onSessionEnded).not.toHaveBeenCalled();
  });

  it('passes an abort through unchanged', async () => {
    server.use(http.get(`${API}/slow`, () => new Promise<Response>(() => undefined)));
    const controller = new AbortController();
    const pending = client().api.request('/slow', { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
