/**
 * MSW handlers that behave like the backend's /auth endpoints (backend/src/routes/auth.routes.ts)
 * and GET /dashboard/summary for the seeded demo staff. Tokens are fake JWT-shaped strings (unsigned): the portal never
 * verifies them, it only reads `exp` for timing.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Staff } from '../src/api/auth.js';
import type { DashboardSummary } from '../src/api/dashboard.js';
import { DEFAULT_API_BASE_URL } from '../src/config.js';

export const API = DEFAULT_API_BASE_URL;
export const GOOD_PASSWORD = 'correct horse battery';

export const ADMIN: Staff = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'admin@serendib-trading.example',
  displayName: 'Serendib Trading Company (Demo) Admin',
  role: 'admin',
  issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)', type: 'employer' },
};
export const OFFICER: Staff = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'officer@serendib-trading.example',
  displayName: 'Serendib Trading Company (Demo) Officer',
  role: 'officer',
  issuer: ADMIN.issuer,
};
const STAFF = [ADMIN, OFFICER];

const base64url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

/** A JWT-shaped token for `staff`, expiring `expiresInSeconds` from now. */
export function makeToken(staff: Staff, expiresInSeconds = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({ sub: staff.id, role: staff.role, iat: now, exp: now + expiresInSeconds }),
    'fake-signature',
  ].join('.');
}

const tokens = new Map<string, Staff>();
export const issued = (staff: Staff, expiresInSeconds?: number) => {
  const token = makeToken(staff, expiresInSeconds);
  tokens.set(token, staff);
  return token;
};

/** Requests the portal made (method, path, Authorization header), for assertions. */
export const requests: {
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}[] = [];

export const errorBody = (code: string, message: string, details?: unknown) => ({
  error: {
    code,
    message,
    ...(details === undefined ? {} : { details }),
    requestId: 'req-test-0001',
  },
});

/** The demo issuer's dashboard (the shape of backend GET /dashboard/summary). */
export const DEMO_SUMMARY: DashboardSummary = {
  issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)' },
  counts: {
    issued: 12345,
    active: 11000,
    revoked: 845,
    superseded: 300,
    expired: 200,
    awaitingWallet: 3,
    expiringSoon: 4,
    holders: 25,
  },
  expiringSoonDays: 30,
  recentActivity: [
    {
      credentialId: '3f2a9c1b-0000-4000-8000-000000000001',
      credentialType: 'EmploymentCredential',
      fromStatus: 'valid',
      toStatus: 'revoked',
      reason: 'employment_ended',
      staffName: 'Serendib Trading Company (Demo) Admin',
      at: '2026-11-25T03:30:00.000Z',
    },
    {
      credentialId: '7b1e0d4c-0000-4000-8000-000000000002',
      credentialType: 'EmploymentCredential',
      fromStatus: 'pending',
      toStatus: 'valid',
      reason: null,
      staffName: null,
      at: '2026-11-25T01:00:00.000Z',
    },
    {
      credentialId: '9c8d7e6f-0000-4000-8000-000000000003',
      credentialType: 'KYCCredential',
      fromStatus: 'valid',
      toStatus: 'superseded',
      reason: 'details_changed',
      staffName: 'Serendib Trading Company (Demo) Officer',
      at: '2026-11-24T04:30:00.000Z',
    },
    {
      credentialId: 'a1b2c3d4-0000-4000-8000-000000000004',
      credentialType: 'EmploymentCredential',
      fromStatus: null,
      toStatus: 'pending',
      reason: null,
      staffName: 'Serendib Trading Company (Demo) Officer',
      at: '2026-11-20T04:30:00.000Z',
    },
  ],
  // 11:30 in Sri Lanka (UTC+05:30)
  generatedAt: '2026-11-25T06:00:00.000Z',
};

/** The staff member a request's Bearer token belongs to (null if none or unknown). */
const staffFor = (request: Request) =>
  tokens.get(request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? '') ?? null;

export const handlers = [
  http.post(`${API}/auth/login`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    requests.push({
      method: 'POST',
      path: '/auth/login',
      authorization: request.headers.get('Authorization'),
      body,
    });
    const staff = STAFF.find((s) => s.email === body.email);
    if (!staff || body.password !== GOOD_PASSWORD) {
      return HttpResponse.json(errorBody('INVALID_CREDENTIALS', 'Invalid email or password'), {
        status: 401,
      });
    }
    return HttpResponse.json({
      accessToken: issued(staff),
      tokenType: 'Bearer',
      expiresIn: 3600,
      staff,
    });
  }),
  http.get(`${API}/auth/me`, ({ request }) => {
    const authorization = request.headers.get('Authorization');
    requests.push({ method: 'GET', path: '/auth/me', authorization, body: null });
    const staff = tokens.get(authorization?.replace(/^Bearer /, '') ?? '');
    if (!staff)
      return HttpResponse.json(errorBody('INVALID_TOKEN', 'Invalid authentication token'), {
        status: 401,
      });
    return HttpResponse.json({ staff });
  }),
  http.get(`${API}/dashboard/summary`, ({ request }) => {
    requests.push({
      method: 'GET',
      path: '/dashboard/summary',
      authorization: request.headers.get('Authorization'),
      body: null,
    });
    if (!staffFor(request))
      return HttpResponse.json(errorBody('INVALID_TOKEN', 'Invalid authentication token'), {
        status: 401,
      });
    return HttpResponse.json(DEMO_SUMMARY);
  }),
  http.post(`${API}/auth/logout`, ({ request }) => {
    requests.push({
      method: 'POST',
      path: '/auth/logout',
      authorization: request.headers.get('Authorization'),
      body: null,
    });
    return new HttpResponse(null, { status: 204 });
  }),
];

export const server = setupServer(...handlers);

export function resetMockBackend() {
  tokens.clear();
  requests.length = 0;
}
