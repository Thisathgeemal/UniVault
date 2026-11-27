/**
 * API client: the base URL comes from EXPO_PUBLIC_API_BASE_URL (empty = not set, placeholders
 * refused, loopback flagged), requests go to <base>/health, failures never throw out of
 * checkHealth().
 */
import { getApiConfig, parseApiBaseUrl } from '../src/config/env';
import {
  ApiError,
  ApiNotConfiguredError,
  checkHealth,
  createApiClient,
  getApiClient,
} from '../src/services/api-client';

const ORIGINAL = process.env.EXPO_PUBLIC_API_BASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL;
});

const jsonResponse = (status: number, body: unknown) =>
  ({ status, json: async () => body }) as unknown as Response;

describe('API base URL (EXPO_PUBLIC_API_BASE_URL)', () => {
  it('uses the env value, without a trailing slash', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.20:4000/api/v1/';
    expect(getApiConfig()).toEqual({
      apiBaseUrl: 'http://192.168.1.20:4000/api/v1',
      problem: null,
      isLoopback: false,
    });
  });

  it('treats an empty value as not set', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    expect(getApiConfig()).toMatchObject({ apiBaseUrl: null, problem: 'missing' });
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(getApiConfig().problem).toBe('missing');
  });

  it('refuses the .env.example placeholders and non-http values', () => {
    expect(parseApiBaseUrl('http://<your-lan-ip>:4000/api/v1').problem).toBe('placeholder');
    expect(parseApiBaseUrl('http://192.168.x.x:4000/api/v1').problem).toBe('placeholder');
    expect(parseApiBaseUrl('not a url').problem).toBe('invalid');
    expect(parseApiBaseUrl('ftp://192.168.1.20/api').problem).toBe('invalid');
  });

  it('flags localhost: on a phone that is the phone itself', () => {
    expect(parseApiBaseUrl('http://localhost:4000/api/v1').isLoopback).toBe(true);
    expect(parseApiBaseUrl('http://127.0.0.1:4000/api/v1').isLoopback).toBe(true);
    expect(parseApiBaseUrl('https://abc.ngrok.app/api/v1').isLoopback).toBe(false);
  });
});

describe('API client', () => {
  it('calls GET <EXPO_PUBLIC_API_BASE_URL>/health', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.20:4000/api/v1';
    const fetchImpl = jest.fn(async () => jsonResponse(200, { status: 'ok' }));
    const client = getApiClient({ fetchImpl });
    expect(client.baseUrl).toBe('http://192.168.1.20:4000/api/v1');
    const result = await checkHealth(client, () => 0);
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://192.168.1.20:4000/api/v1/health',
      expect.objectContaining({ method: 'GET', headers: { Accept: 'application/json' } }),
    );
    expect(result).toEqual({
      reachable: true,
      serverStatus: 'ok',
      httpStatus: 200,
      durationMs: 0,
      errorCode: null,
    });
  });

  it('refuses to build a client without a usable URL', () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://<your-lan-ip>:4000/api/v1';
    expect(() => getApiClient()).toThrow(ApiNotConfiguredError);
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
    expect(() => getApiClient()).toThrow(/missing/);
  });

  it('a degraded backend (503) is still reachable', async () => {
    const client = createApiClient({
      baseUrl: 'http://pc:4000/api/v1',
      fetchImpl: async () => jsonResponse(503, { status: 'degraded' }),
    });
    await expect(checkHealth(client)).resolves.toMatchObject({
      reachable: true,
      serverStatus: 'degraded',
      httpStatus: 503,
    });
  });

  it('reports a network failure, a timeout, non-JSON and an unexpected body', async () => {
    const offline = createApiClient({
      baseUrl: 'http://pc:4000/api/v1',
      fetchImpl: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(checkHealth(offline)).resolves.toMatchObject({
      reachable: false,
      httpStatus: 0,
      errorCode: 'NETWORK_ERROR',
    });

    const hanging = createApiClient({
      baseUrl: 'http://pc:4000/api/v1',
      timeoutMs: 10,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    await expect(checkHealth(hanging)).resolves.toMatchObject({ errorCode: 'TIMEOUT' });

    const html = createApiClient({
      baseUrl: 'http://pc:4000/api/v1',
      fetchImpl: async () =>
        ({
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token <');
          },
        }) as unknown as Response,
    });
    await expect(html.getJson('/health')).rejects.toEqual(
      new ApiError(200, 'INVALID_RESPONSE', 'Response is not JSON'),
    );
    await expect(checkHealth(html)).resolves.toMatchObject({ errorCode: 'INVALID_RESPONSE' });

    const odd = createApiClient({
      baseUrl: 'http://pc:4000/api/v1',
      fetchImpl: async () => jsonResponse(200, { hello: 'world' }),
    });
    await expect(checkHealth(odd)).resolves.toMatchObject({
      reachable: false,
      errorCode: 'UNEXPECTED_RESPONSE',
    });
  });

  it('a client that throws something unexpected is reported, not thrown', async () => {
    const broken = {
      baseUrl: 'x',
      getJson: async () => {
        throw new Error('bug');
      },
    };
    await expect(checkHealth(broken)).resolves.toMatchObject({ errorCode: 'UNKNOWN' });
  });
});
