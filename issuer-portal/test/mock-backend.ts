/**
 * MSW handlers that behave like the backend's /auth endpoints (backend/src/routes/auth.routes.ts)
 * GET /dashboard/summary, /holders (list with search / sort / paging, detail, create with the
 * 409 duplicate rule) and GET /credentials?holderId for the seeded demo staff. Tokens are fake JWT-shaped strings (unsigned): the portal never
 * verifies them, it only reads `exp` for timing.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Staff } from '../src/api/auth.js';
import type { CredentialItem } from '../src/api/credentials.js';
import type { DashboardSummary } from '../src/api/dashboard.js';
import type { HolderDetail } from '../src/api/holders.js';
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
export const BANK_ADMIN: Staff = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'admin@bank-a.example',
  displayName: 'UniVault Demo Bank Admin',
  role: 'admin',
  issuer: { id: 'bank-a', name: 'UniVault Demo Bank', type: 'bank' },
};
const STAFF = [ADMIN, OFFICER, BANK_ADMIN];

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

// ---------------------------------------------------------------------------
// Holder records and their credentials (in memory, reset after each test)

const holderId = (n: number) => `aaaaaaaa-0000-4000-8000-${String(n).padStart(12, '0')}`;
const employee = (
  n: number,
  fullName: string,
  extra: Record<string, unknown> = {},
  createdAt = `2026-11-${String(10 + n).padStart(2, '0')}T04:30:00.000Z`,
): HolderDetail => ({
  id: holderId(n),
  issuerId: 'employer-a',
  recordType: 'employee',
  credentialType: 'EmploymentCredential',
  externalRef: `STC-0000${n}`,
  fullName,
  claims: {
    employee_id: `STC-0000${n}`,
    full_name: fullName,
    designation: 'Logistics Coordinator',
    department: 'Operations',
    employment_type: 'contract',
    date_of_joining: '2019-07-03',
    ...extra,
  },
  createdBy: { id: OFFICER.id, displayName: OFFICER.displayName },
  createdAt,
  updatedAt: createdAt,
});

/** The fixtures every test starts with. */
export function seedHolders(): HolderDetail[] {
  return [
    employee(1, 'Lahiru Silva', { nic_number: '199935300063', work_location: 'Galle Branch' }),
    employee(2, 'Nimesha Perera'),
    employee(3, 'Amal Fernando', { nic_number: '851234567V' }),
    {
      id: holderId(9),
      issuerId: 'bank-a',
      recordType: 'customer',
      credentialType: 'KYCCredential',
      externalRef: 'CUS-000123',
      fullName: 'Kasun Bandara',
      claims: {
        full_name: 'Kasun Bandara',
        id_document_type: 'passport',
        id_document_number: 'N1234567',
        id_document_expiry: '2030-01-31',
        date_of_birth: '1990-05-01',
        age_over_18: true,
        nationality: 'LK',
        permanent_address: {
          line1: 'No. 12, Temple Road',
          city: 'Kandy',
          district: 'Kandy',
          postal_code: '20000',
          country: 'LK',
        },
        mobile_number: '+94771234567',
      },
      createdBy: null,
      createdAt: '2026-11-20T04:30:00.000Z',
      updatedAt: '2026-11-20T04:30:00.000Z',
    },
  ];
}
export const HOLDER_IDS = { lahiru: holderId(1), nimesha: holderId(2), kasun: holderId(9) };
export const holderStore: HolderDetail[] = seedHolders();

/** Credentials per holder id (GET /credentials?holderId=). */
export const credentialStore = new Map<string, CredentialItem[]>([
  [
    holderId(1),
    [
      {
        id: 'c0000000-0000-4000-8000-000000000001',
        credentialType: 'EmploymentCredential',
        effectiveStatus: 'valid',
        issuedAt: '2026-11-20T05:00:00.000Z',
        expiresAt: '2027-11-20T05:00:00.000Z',
      },
      {
        id: 'c0000000-0000-4000-8000-000000000002',
        credentialType: 'EmploymentCredential',
        effectiveStatus: 'superseded',
        issuedAt: '2026-11-12T05:00:00.000Z',
        expiresAt: '2027-11-12T05:00:00.000Z',
      },
      {
        id: 'c0000000-0000-4000-8000-000000000003',
        credentialType: 'EmploymentCredential',
        effectiveStatus: 'pending',
        issuedAt: null,
        expiresAt: '2027-11-25T05:00:00.000Z',
      },
    ],
  ],
]);

const ID_NUMBER_PATHS = ['id_document_number', 'nic_number'];
const summaryOf = (h: HolderDetail) => {
  const id = ID_NUMBER_PATHS.map((p) => h.claims[p]).find((v) => typeof v === 'string') as
    string | undefined;
  return {
    id: h.id,
    externalRef: h.externalRef,
    fullName: h.fullName,
    recordType: h.recordType,
    idNumberLast4: id ? id.slice(-4) : null,
    credentialCount: credentialStore.get(h.id)?.length ?? 0,
    createdAt: h.createdAt,
  };
};
const SORTERS: Record<string, (a: HolderDetail, b: HolderDetail) => number> = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  name: (a, b) => a.fullName.localeCompare(b.fullName),
  name_desc: (a, b) => b.fullName.localeCompare(a.fullName),
  ref: (a, b) => a.externalRef.localeCompare(b.externalRef),
  ref_desc: (a, b) => b.externalRef.localeCompare(a.externalRef),
};
const unauthenticated = () =>
  HttpResponse.json(errorBody('INVALID_TOKEN', 'Invalid authentication token'), { status: 401 });
const record = (request: Request, path: string, body: unknown = null) =>
  requests.push({
    method: request.method,
    path,
    authorization: request.headers.get('Authorization'),
    body,
  });

export const holderHandlers = [
  http.get(`${API}/holders`, ({ request }) => {
    const url = new URL(request.url);
    record(request, `/holders${url.search}`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const search = url.searchParams.get('search')?.toLowerCase();
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const sort = url.searchParams.get('sort') ?? 'newest';
    const matching = holderStore
      .filter((h) => h.issuerId === staff.issuer.id)
      .filter(
        (h) =>
          !search ||
          h.fullName.toLowerCase().includes(search) ||
          h.externalRef.toLowerCase().includes(search),
      )
      .sort(SORTERS[sort]);
    return HttpResponse.json({
      holders: matching.slice(offset, offset + limit).map(summaryOf),
      total: matching.length,
      limit,
      offset,
    });
  }),
  http.get(`${API}/holders/:holderId`, ({ request, params }) => {
    record(request, `/holders/${String(params.holderId)}`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const holder = holderStore.find((h) => h.id === params.holderId);
    // Another issuer's record looks exactly like an unknown one
    if (!holder || holder.issuerId !== staff.issuer.id) {
      return HttpResponse.json(errorBody('HOLDER_NOT_FOUND', 'Holder record not found'), {
        status: 404,
      });
    }
    return HttpResponse.json(holder);
  }),
  http.post(`${API}/holders`, async ({ request }) => {
    const body = (await request.json()) as {
      externalRef?: string;
      claims: Record<string, unknown>;
    };
    record(request, '/holders', body);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const customer = staff.issuer.type === 'bank';
    const externalRef = customer ? String(body.externalRef) : String(body.claims.employee_id);
    const existing = holderStore.find(
      (h) => h.issuerId === staff.issuer.id && h.externalRef === externalRef,
    );
    if (existing) {
      return HttpResponse.json(
        errorBody(
          'HOLDER_ALREADY_EXISTS',
          `A holder with reference "${externalRef}" already exists`,
          { holderId: existing.id },
        ),
        { status: 409 },
      );
    }
    const now = '2026-11-26T04:30:00.000Z';
    const created: HolderDetail = {
      id: holderId(100 + holderStore.length),
      issuerId: staff.issuer.id,
      recordType: customer ? 'customer' : 'employee',
      credentialType: customer ? 'KYCCredential' : 'EmploymentCredential',
      externalRef,
      fullName: String(body.claims.full_name),
      claims: customer ? { ...body.claims, age_over_18: true } : body.claims,
      createdBy: { id: staff.id, displayName: staff.displayName },
      createdAt: now,
      updatedAt: now,
    };
    holderStore.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),
  http.get(`${API}/credentials`, ({ request }) => {
    const url = new URL(request.url);
    record(request, `/credentials${url.search}`);
    if (!staffFor(request)) return unauthenticated();
    const credentials = credentialStore.get(url.searchParams.get('holderId') ?? '') ?? [];
    return HttpResponse.json({ credentials, total: credentials.length, limit: 100, offset: 0 });
  }),
];

export const server = setupServer(...handlers, ...holderHandlers);

export function resetMockBackend() {
  tokens.clear();
  requests.length = 0;
  holderStore.splice(0, holderStore.length, ...seedHolders());
}
