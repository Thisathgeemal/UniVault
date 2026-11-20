import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { AppError } from '../src/lib/errors.js';
import { createErrorHandler } from '../src/middleware/error-handler.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testApp, testConfig } from './helpers.js';

const UUID = '6f1c2b1e-1b7a-4a43-9a51-0d0f0d1c0e11';
const UUID_RE = /^[0-9a-f-]{36}$/;
const app = testApp();

describe('server and routing', () => {
  it('GET /api/v1/health returns 200 with service information', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'ok',
      service: 'univault-backend',
      environment: 'test',
    });
    expect(typeof res.body.uptimeSeconds).toBe('number');
  });

  it.each([
    ['GET', `/api/v1/status/${UUID}`],
    ['POST', '/api/v1/credential-offers/token'],
    ['POST', '/api/v1/verifications'],
    ['GET', `/api/v1/verifications/${UUID}/result`],
  ])('public route %s %s is routed (501 until its sprint)', async (method, path) => {
    const res = await request(app)[method === 'GET' ? 'get' : 'post'](path);
    expect(res.status).toBe(501);
    expect(res.body.error.code).toBe('NOT_IMPLEMENTED');
    expect(res.body.error.message).toMatch(/planned for Sprint \d/);
  });

  it.each([
    ['GET', '/api/v1/holders'],
    ['POST', '/api/v1/holders'],
    ['POST', '/api/v1/credentials'],
    ['POST', `/api/v1/credentials/${UUID}/revoke`],
    ['POST', `/api/v1/credentials/${UUID}/reissue`],
    ['POST', '/api/v1/credential-offers'],
    ['POST', '/api/v1/issuers/employer-a/keys'],
    ['GET', '/api/v1/staff'],
    ['GET', '/api/v1/auth/me'],
  ])('protected route %s %s is routed and requires login (401)', async (method, path) => {
    const res = await request(app)[method === 'GET' ? 'get' : 'post'](path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route GET /api/v1/does-not-exist not found',
    });
    expect(res.body.error.requestId).toMatch(UUID_RE);
  });

  it('only serves the API under /api/v1', async () => {
    expect((await request(app).get('/health')).status).toBe(404);
  });
});

describe('request IDs', () => {
  it('generates a request ID and returns it in X-Request-ID', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });

  it('reuses a valid incoming X-Request-ID', async () => {
    const res = await request(app).get('/api/v1/nope').set('X-Request-ID', 'portal-req-12345678');
    expect(res.headers['x-request-id']).toBe('portal-req-12345678');
    expect(res.body.error.requestId).toBe('portal-req-12345678');
  });

  it('replaces an unsafe incoming X-Request-ID', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Request-ID', '<script>alert(1)</script>');
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });
});

describe('request validation', () => {
  let authed: AuthedTestApp;
  let officer: string;
  let admin: string;
  beforeAll(async () => {
    authed = await authedTestApp();
    [officer, admin] = await Promise.all([
      authed.tokenFor(STAFF.employerOfficer),
      authed.tokenFor(STAFF.employerAdmin),
    ]);
  });
  afterAll(() => authed.database.close());

  it('rejects a body with missing and invalid fields, listing each problem', async () => {
    const res = await request(authed.app)
      .post('/api/v1/credentials')
      .set('Authorization', `Bearer ${officer}`)
      .send({ credentialType: 'Passport' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['holderId', 'credentialType']));
  });

  it('lets a valid body through to the handler', async () => {
    const res = await request(authed.app)
      .post('/api/v1/credentials')
      .set('Authorization', `Bearer ${officer}`)
      .send({ holderId: UUID, credentialType: 'EmploymentCredential' });
    // passed auth + validation and reached the handler, which looks the holder up
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HOLDER_NOT_FOUND');
  });

  it('validates route parameters', async () => {
    const res = await request(app).get('/api/v1/status/not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.details[0]).toMatchObject({
      path: 'credentialId',
      message: 'must be a UUID',
    });
  });

  it('validates query parameters', async () => {
    const res = await request(authed.app)
      .get('/api/v1/holders?limit=500')
      .set('Authorization', `Bearer ${officer}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('limit');
  });

  it('validates parameters and body together', async () => {
    const res = await request(authed.app)
      .post('/api/v1/credentials/bad-id/revoke')
      .set('Authorization', `Bearer ${admin}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('credentialId');
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('rejects bodies over the size limit with 413', async () => {
    const small = testApp({ REQUEST_BODY_LIMIT: '1kb' });
    const res = await request(small)
      .post('/api/v1/credentials')
      .send({ issuerId: 'x'.repeat(5000) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('CORS', () => {
  it('allows the issuer portal origin', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toBe('X-Request-ID');
  });

  it('answers preflight requests from an allowed origin', async () => {
    const res = await request(app)
      .options('/api/v1/credentials')
      .set('Origin', 'http://localhost:5174')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
    expect(res.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('blocks an unknown origin with 403 and no CORS headers', async () => {
    const res = await request(app).get('/api/v1/health').set('Origin', 'http://evil.example');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('allows requests without an Origin header (mobile wallet, server-to-server)', async () => {
    expect((await request(app).get('/api/v1/health')).status).toBe(200);
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

describe('central error handling', () => {
  const appWithError = (env: 'production' | 'development', error: unknown) => {
    const a = express();
    a.get('/boom', () => {
      throw error;
    });
    a.use(createErrorHandler({ exposeInternalErrors: env === 'development' }));
    return a;
  };

  it('hides internal error details in production', async () => {
    const res = await request(appWithError('production', new Error('DB password=abc failed'))).get(
      '/boom',
    );
    expect(res.status).toBe(500);
    expect(res.body.error).toEqual({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    });
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('shows the error message in development to help debugging', async () => {
    const res = await request(
      appWithError('development', new Error('Something specific broke')),
    ).get('/boom');
    expect(res.body.error.message).toBe('Something specific broke');
    expect(res.body.error).not.toHaveProperty('stack');
  });

  it('returns AppError status, code and details', async () => {
    const res = await request(
      appWithError(
        'production',
        new AppError(409, 'ALREADY_REVOKED', 'Credential already revoked', { id: 1 }),
      ),
    ).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      code: 'ALREADY_REVOKED',
      message: 'Credential already revoked',
      details: { id: 1 },
    });
  });

  it('handles errors thrown inside async handlers (Express 5)', async () => {
    const a = express();
    a.get('/async', async () => {
      await Promise.resolve();
      throw new AppError(418, 'TEAPOT', 'Async error');
    });
    a.use(createErrorHandler({ exposeInternalErrors: false }));
    expect((await request(a).get('/async')).status).toBe(418);
  });
});

describe('logging', () => {
  it('logs each request with method, URL, status and request ID', async () => {
    const { logger, lines } = captureLogger();
    const logged = createApp(testConfig(), logger);
    await request(logged).get('/api/v1/health').set('X-Request-ID', 'log-test-0001');
    const entry = lines().find((l) => l.msg === 'request completed');
    expect(entry).toMatchObject({
      level: 30,
      service: 'univault-backend',
      req: { id: 'log-test-0001', method: 'GET', url: '/api/v1/health' },
      res: { statusCode: 200 },
    });
  });

  it('logs client errors as warnings and never logs request headers', async () => {
    const { logger, lines } = captureLogger();
    const logged = createApp(testConfig(), logger);
    await request(logged).get('/api/v1/nope').set('Authorization', 'Bearer secret-token-123');
    const all = lines();
    expect(all.some((l) => l.level === 40 && l.code === 'NOT_FOUND')).toBe(true);
    expect(JSON.stringify(all)).not.toContain('secret-token-123');
  });

  it('logs 500 errors at error level with the error details', async () => {
    const { logger, lines } = captureLogger();
    const a = express();
    a.use((req, _res, next) => {
      req.log = logger;
      next();
    });
    a.get('/boom', () => {
      throw new Error('kaboom');
    });
    a.use(createErrorHandler({ exposeInternalErrors: false }));
    await request(a).get('/boom');
    const entry = lines().find((l) => l.level === 50);
    expect(entry?.msg).toBe('Unhandled error');
    expect(JSON.stringify(entry)).toContain('kaboom');
  });

  it('redacts secrets in logged objects', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      { issuer: { passphrase: 'p@ss-123456', privateKeyPem: '-----BEGIN', kid: 'abc' } },
      'key loaded',
    );
    const entry = lines()[0];
    expect(entry?.issuer).toEqual({
      passphrase: '[REDACTED]',
      privateKeyPem: '[REDACTED]',
      kid: 'abc',
    });
  });
});
