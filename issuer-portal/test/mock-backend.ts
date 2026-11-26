/**
 * MSW handlers that behave like the backend's /auth endpoints (backend/src/routes/auth.routes.ts)
 * GET /dashboard/summary, /holders (list with search / sort / paging, detail, create with the
 * 409 duplicate rule), GET /credentials?holderId and the issuance endpoints (GET
 * /credential-schemas, POST /credentials/preview, POST /credentials, GET /credentials/:id) and the
 * credential offers (create, status, cancel; with a skewable server clock) for the seeded demo
 * staff. Tokens are fake JWT-shaped strings (unsigned): the portal never
 * verifies them, it only reads `exp` for timing.
 */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { Staff } from '../src/api/auth.js';
import { schemas as schemaFiles } from 'virtual:claims-validators';
import type { CredentialItem, CredentialMetadata } from '../src/api/credentials.js';
import type { DashboardSummary } from '../src/api/dashboard.js';
import type { OfferInvalidationReason, OfferStatus } from '../src/api/offers.js';
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
    const staff = staffFor(request)!;
    const holderId = url.searchParams.get('holderId');
    if (holderId) {
      const credentials = credentialStore.get(holderId) ?? [];
      return HttpResponse.json({ credentials, total: credentials.length, limit: 100, offset: 0 });
    }
    return HttpResponse.json(mockCredentialList(staff, url.searchParams));
  }),
];

/** GET /credentials for the table: the backend's filters, search, sorts, paging and counts. */
export function mockCredentialList(staff: Staff, params: URLSearchParams) {
  const own = [...issuedStore.values()].filter(
    (c) => holderStore.find((h) => h.id === c.holder.id)?.issuerId === staff.issuer.id,
  );
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const searched = q
    ? own.filter(
        (c) =>
          c.holder.fullName.toLowerCase().includes(q) ||
          c.holder.externalRef.toLowerCase().includes(q) ||
          c.id.startsWith(q),
      )
    : own;
  const status = params.get('effectiveStatus');
  const filtered = status ? searched.filter((c) => c.effectiveStatus === status) : searched;
  const sort = params.get('sort') ?? 'newest';
  const cmp: Record<string, (a: MockCredential, b: MockCredential) => number> = {
    newest: (a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
    oldest: (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    expires: (a, b) => a.expiresAt.localeCompare(b.expiresAt) || a.id.localeCompare(b.id),
    expires_desc: (a, b) => b.expiresAt.localeCompare(a.expiresAt) || b.id.localeCompare(a.id),
    holder: (a, b) =>
      a.holder.fullName.localeCompare(b.holder.fullName) || a.id.localeCompare(b.id),
    holder_desc: (a, b) =>
      b.holder.fullName.localeCompare(a.holder.fullName) || b.id.localeCompare(a.id),
  };
  const sorted = [...filtered].sort(cmp[sort] ?? cmp.newest);
  const limit = Number(params.get('limit') ?? 20);
  const offset = Number(params.get('offset') ?? 0);
  const count = (s: string) => searched.filter((c) => c.effectiveStatus === s).length;
  return {
    credentials: sorted.slice(offset, offset + limit).map(({ claims: _claims, ...c }) => ({
      ...c,
      vct: `urn:univault:vct:${c.credentialType}:1`,
      hasActiveOffer: c.status === 'pending' && activeOfferOfCredential(c.id) !== null,
    })),
    total: filtered.length,
    limit,
    offset,
    counts: {
      all: searched.length,
      pending: count('pending'),
      valid: count('valid'),
      expired: count('expired'),
      revoked: count('revoked'),
      superseded: count('superseded'),
    },
  };
}

// ---------------------------------------------------------------------------
// Issuance: GET /credential-schemas, POST /credentials/preview, POST /credentials,
// GET /credentials/:id. Field flags come from the same schema files the backend reads.

/** The mock backend's clock for issuance (fixed: previews and results are predictable). */
export const MOCK_NOW = '2026-11-26T04:30:00.000Z';
const TYPE_OF_ISSUER = { employer: 'EmploymentCredential', bank: 'KYCCredential' } as const;
const ENVELOPE = [
  'iss',
  'issuer_name',
  'vct',
  'schema_version',
  'jti',
  'iat',
  'exp',
  'cnf',
  'status',
];

interface SchemaFile {
  title: string;
  required: string[];
  properties: Record<string, unknown>;
  'x-univault': {
    vct: string;
    schemaVersion: string;
    selectivelyDisclosable: string[];
    alwaysVisible: string[];
    defaultValidity: string;
    derivedClaims?: Record<string, string>;
  };
}
export function mockSchemaResponse(type: 'EmploymentCredential' | 'KYCCredential') {
  const file = schemaFiles[type] as unknown as SchemaFile;
  const meta = file['x-univault'];
  return {
    credentialType: type,
    vct: meta.vct,
    title: file.title,
    schemaVersion: meta.schemaVersion,
    defaultValidity: meta.defaultValidity,
    fields: Object.keys(file.properties).map((name) => ({
      name,
      required: file.required.includes(name),
      selectivelyDisclosable: meta.selectivelyDisclosable.includes(name),
      derived: Object.keys(meta.derivedClaims ?? {}).includes(name),
    })),
    alwaysVisible: [
      ...ENVELOPE,
      ...(type === 'KYCCredential' ? ['kyc_verification_date'] : []),
      ...meta.alwaysVisible,
    ],
    alwaysVisibleClaims: meta.alwaysVisible,
  };
}

/** A credential in the mock: metadata plus the detail fields and the claims snapshot. */
export interface MockCredential extends CredentialMetadata {
  revokedAt?: string | null;
  revocationReason?: string | null;
  revokedBy?: { id: string; displayName: string } | null;
  supersededAt?: string | null;
  replacesCredentialId?: string | null;
  replacedByCredentialId?: string | null;
  createdBy?: { id: string; displayName: string } | null;
  /** The claims the credential was created with (reissue preview "current"). */
  claims?: Record<string, unknown>;
}

/** Credentials created in this test (id -> credential). */
export const issuedStore = new Map<string, MockCredential>();

export interface MockEvent {
  id: string;
  fromStatus: CredentialMetadata['status'] | null;
  toStatus: CredentialMetadata['status'];
  reason: string | null;
  note: string | null;
  staff: { id: string; displayName: string } | null;
  createdAt: string;
}
/** Status history per credential (GET /credentials/:id/events). */
export const eventStore = new Map<string, MockEvent[]>();
const pushEvent = (
  credentialId: string,
  event: Omit<MockEvent, 'id' | 'note'> & { note?: string | null },
) => {
  const list = eventStore.get(credentialId) ?? [];
  list.push({ id: `ev-${credentialId}-${list.length + 1}`, note: null, ...event });
  eventStore.set(credentialId, list);
};
const activeCredentialOf = (holderId: string) =>
  (credentialStore.get(holderId) ?? []).find((c) =>
    ['pending', 'valid'].includes(c.effectiveStatus),
  )?.id ??
  [...issuedStore.values()].find((c) => c.holder.id === holderId && c.status === 'pending')?.id;

const addYears = (iso: string, years: number) => {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString();
};

/** What the backend's preview gives for a holder of this mock (same shape and rules). */
export function mockPreview(holder: HolderDetail, staff: Staff, validUntil?: string) {
  const type = TYPE_OF_ISSUER[staff.issuer.type];
  const file = schemaFiles[type] as unknown as SchemaFile;
  const meta = file['x-univault'];
  const derived = Object.keys(meta.derivedClaims ?? {});
  const defaultExpiresAt = addYears(MOCK_NOW, meta.defaultValidity === 'P2Y' ? 2 : 1);
  let expiresAt = defaultExpiresAt;
  let cappedBy: string | null = null;
  const documentExpiry = holder.claims.id_document_expiry;
  if (typeof documentExpiry === 'string' && `${documentExpiry}T00:00:00.000Z` < expiresAt) {
    expiresAt = `${documentExpiry}T00:00:00.000Z`;
    cappedBy = 'id_document_expiry';
  }
  const range = { min: '2026-11-27', max: expiresAt.slice(0, 10) };
  if (validUntil) {
    if (validUntil < range.min || validUntil > range.max) return null;
    expiresAt = `${validUntil}T00:00:00.000Z`;
    cappedBy = 'validUntil';
  }
  return {
    credentialType: type,
    vct: meta.vct,
    schemaVersion: meta.schemaVersion,
    issuer: { id: staff.issuer.id, name: staff.issuer.name },
    holder: { id: holder.id, externalRef: holder.externalRef, fullName: holder.fullName },
    alwaysVisible: {
      iss: `http://localhost:4000/api/v1/issuers/${staff.issuer.id}`,
      issuer_name: staff.issuer.name,
      vct: meta.vct,
      schema_version: meta.schemaVersion,
      jti: null,
      iat: MOCK_NOW,
      exp: expiresAt,
      cnf: null,
      status: null,
    },
    disclosable: meta.selectivelyDisclosable
      .filter((name) => name in holder.claims && !derived.includes(name))
      .map((name) => ({ name, value: holder.claims[name] })),
    derived: derived
      .filter((name) => name in holder.claims)
      .map((name) => ({ name, value: holder.claims[name] })),
    expiry: { expiresAt, defaultExpiresAt, cappedBy, validUntilRange: range },
    warnings: holder.claims.age_over_18 === false ? ['holder_under_18'] : [],
  };
}

const notFoundHolder = () =>
  HttpResponse.json(errorBody('HOLDER_NOT_FOUND', 'Holder record not found'), { status: 404 });

/** The shared checks of preview and issue (one issuance path, like the backend). */
async function issuanceCheck(request: Request) {
  const staff = staffFor(request);
  if (!staff) return { response: unauthenticated() };
  const body = (await request.json()) as {
    holderId: string;
    credentialType?: string;
    validUntil?: string;
  };
  const type = TYPE_OF_ISSUER[staff.issuer.type];
  if (body.credentialType && body.credentialType !== type) {
    return {
      body,
      response: HttpResponse.json(
        errorBody('VALIDATION_ERROR', 'Wrong credential type for this issuer', [
          { path: 'credentialType', message: `must be ${type}` },
        ]),
        { status: 400 },
      ),
    };
  }
  const holder = holderStore.find((h) => h.id === body.holderId);
  if (!holder || holder.issuerId !== staff.issuer.id) return { body, response: notFoundHolder() };
  const existing = activeCredentialOf(holder.id);
  if (existing) {
    return {
      body,
      response: HttpResponse.json(
        errorBody(
          'ACTIVE_CREDENTIAL_EXISTS',
          'This holder already has a pending or valid credential',
          {
            credentialId: existing,
          },
        ),
        { status: 409 },
      ),
    };
  }
  const preview = mockPreview(holder, staff, body.validUntil);
  if (!preview) {
    return {
      body,
      response: HttpResponse.json(
        errorBody('VALIDATION_ERROR', 'Invalid validUntil', [
          { path: 'validUntil', message: 'out of range' },
        ]),
        { status: 400 },
      ),
    };
  }
  return { body, staff, holder, preview };
}

export const issuanceHandlers = [
  http.get(`${API}/credential-schemas`, ({ request }) => {
    record(request, '/credential-schemas');
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    return HttpResponse.json({ schemas: [mockSchemaResponse(TYPE_OF_ISSUER[staff.issuer.type])] });
  }),
  http.post(`${API}/credentials/preview`, async ({ request }) => {
    const check = await issuanceCheck(request.clone());
    record(request, '/credentials/preview', check.body ?? null);
    if (check.response) return check.response;
    return HttpResponse.json(check.preview, { headers: { 'Cache-Control': 'no-store' } });
  }),
  http.post(`${API}/credentials`, async ({ request }) => {
    const check = await issuanceCheck(request.clone());
    record(request, '/credentials', check.body ?? null);
    if (check.response) return check.response;
    const id = `d0000000-0000-4000-8000-${String(issuedStore.size + 1).padStart(12, '0')}`;
    const credential: CredentialMetadata = {
      id,
      holder: check.preview.holder,
      credentialType: check.preview.credentialType,
      status: 'pending',
      effectiveStatus: 'pending',
      issuedAt: null,
      expiresAt: check.preview.expiry.expiresAt,
      createdAt: MOCK_NOW,
    };
    issuedStore.set(id, credential);
    return HttpResponse.json(credential, { status: 201 });
  }),
];

// ---------------------------------------------------------------------------
// Credential offers: POST /credential-offers, GET /credential-offers/:offerId,
// POST /credential-offers/:offerId/cancel, and activeOffer on GET /credentials/:id.
// The mock server has its own clock (this browser's clock + mockServerClock.offsetMs), so
// tests can give the PC a wrong time.

/** The backend's default CREDENTIAL_OFFER_TTL_SECONDS (5 minutes; Decisions 011, 021). */
export const OFFER_TTL_SECONDS = 300;
export const mockServerClock = { offsetMs: 0 };
const serverNow = () => Date.now() + mockServerClock.offsetMs;
const OFFER_PREFIX = 'openid-credential-offer://?credential_offer=';
const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';

export interface MockOffer {
  offerId: string;
  credentialId: string;
  /** The one-time code (the real backend stores only its hash). */
  code: string;
  qrContent: string;
  createdAt: number;
  expiresAt: number;
  redeemedAt: number | null;
  invalidatedAt: number | null;
  reason: OfferInvalidationReason | null;
}
export const offerStore = new Map<string, MockOffer>();

const offerStatusAt = (offer: MockOffer, at: number): OfferStatus =>
  offer.redeemedAt !== null
    ? 'redeemed'
    : offer.invalidatedAt !== null
      ? 'invalidated'
      : offer.expiresAt <= at
        ? 'expired'
        : 'active';

/**
 * A credential for `holderId` (an employer-a employee by default) in the given EFFECTIVE
 * status, with its claims snapshot (the holder's claims now) and a matching history.
 * 'expired' = stored valid with an expiry in the past.
 */
export function addPendingCredential(
  holderId: string = HOLDER_IDS.nimesha,
  effective: CredentialMetadata['effectiveStatus'] = 'pending',
  extra: Partial<MockCredential> = {},
): string {
  const holder = holderStore.find((h) => h.id === holderId)!;
  const id = `e0000000-0000-4000-8000-${String(issuedStore.size + 1).padStart(12, '0')}`;
  const status = effective === 'expired' ? 'valid' : effective;
  const signed = status !== 'pending' && !(status === 'revoked' && extra.issuedAt === null);
  const officer = { id: OFFICER.id, displayName: OFFICER.displayName };
  const admin = { id: ADMIN.id, displayName: ADMIN.displayName };
  issuedStore.set(id, {
    id,
    holder: { id: holder.id, externalRef: holder.externalRef, fullName: holder.fullName },
    credentialType: holder.credentialType,
    status,
    effectiveStatus: effective,
    issuedAt: signed ? '2026-11-21T05:00:00.000Z' : null,
    expiresAt: effective === 'expired' ? '2026-11-25T00:00:00.000Z' : '2027-11-26T04:30:00.000Z',
    createdAt: '2026-11-21T04:30:00.000Z',
    createdBy: officer,
    claims: structuredClone(holder.claims),
    ...(status === 'revoked'
      ? { revokedAt: MOCK_NOW, revocationReason: 'employment_ended', revokedBy: admin }
      : {}),
    ...extra,
  });
  pushEvent(id, {
    fromStatus: null,
    toStatus: 'pending',
    reason: null,
    staff: officer,
    createdAt: '2026-11-21T04:30:00.000Z',
  });
  if (signed) {
    pushEvent(id, {
      fromStatus: 'pending',
      toStatus: 'valid',
      reason: null,
      staff: null,
      createdAt: '2026-11-21T05:00:00.000Z',
    });
  }
  if (status === 'revoked') {
    pushEvent(id, {
      fromStatus: signed ? 'valid' : 'pending',
      toStatus: 'revoked',
      reason: 'employment_ended',
      staff: admin,
      createdAt: MOCK_NOW,
    });
  }
  if (status === 'superseded') {
    pushEvent(id, {
      fromStatus: 'valid',
      toStatus: 'superseded',
      reason: 'details_changed',
      staff: officer,
      createdAt: MOCK_NOW,
    });
  }
  return id;
}

/** Creates an offer directly in the store (e.g. one made in another tab). */
export function mockCreateOffer(credentialId: string): MockOffer {
  const at = serverNow();
  for (const other of offerStore.values()) {
    if (other.credentialId === credentialId && offerStatusAt(other, at) === 'active') {
      other.invalidatedAt = at;
      other.reason = 'replaced';
    }
  }
  const n = offerStore.size + 1;
  const code = `OneTimeCode${String(n).padStart(4, '0')}`.padEnd(43, 'Z');
  const credential = issuedStore.get(credentialId)!;
  const issuerId = holderStore.find((h) => h.id === credential.holder.id)!.issuerId;
  const credentialOffer = {
    credential_issuer: `http://localhost:4000/api/v1/issuers/${issuerId}`,
    credential_configuration_ids: [credential.credentialType],
    grants: { [PRE_AUTH_GRANT]: { 'pre-authorized_code': code } },
  };
  const offer: MockOffer = {
    offerId: `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    credentialId,
    code,
    qrContent: OFFER_PREFIX + encodeURIComponent(JSON.stringify(credentialOffer)),
    createdAt: at,
    expiresAt: at + OFFER_TTL_SECONDS * 1000,
    redeemedAt: null,
    invalidatedAt: null,
    reason: null,
  };
  offerStore.set(offer.offerId, offer);
  return offer;
}

/** The wallet redeemed it (Sprint 2): the credential becomes valid. */
export function mockRedeemOffer(offerId: string) {
  const offer = offerStore.get(offerId)!;
  offer.redeemedAt = serverNow();
  const credential = issuedStore.get(offer.credentialId)!;
  issuedStore.set(credential.id, { ...credential, status: 'valid', effectiveStatus: 'valid' });
}

export function mockInvalidateOffer(offerId: string, reason: OfferInvalidationReason) {
  const offer = offerStore.get(offerId)!;
  offer.invalidatedAt = serverNow();
  offer.reason = reason;
}

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function offerDetail(offer: MockOffer) {
  const at = serverNow();
  const credential = issuedStore.get(offer.credentialId)!;
  const status = offerStatusAt(offer, at);
  return {
    offerId: offer.offerId,
    credentialId: offer.credentialId,
    credentialType: credential.credentialType,
    credentialStatus: credential.status,
    holder: {
      id: credential.holder.id,
      fullName: credential.holder.fullName,
      externalRef: credential.holder.externalRef,
    },
    status,
    createdAt: iso(offer.createdAt),
    expiresAt: iso(offer.expiresAt),
    redeemedAt: iso(offer.redeemedAt),
    invalidatedAt: iso(offer.invalidatedAt),
    invalidationReason: status === 'invalidated' ? offer.reason : null,
    serverTime: iso(at),
  };
}

const activeOfferOf = (credentialId: string) => activeOfferOfCredential(credentialId);
function activeOfferOfCredential(credentialId: string) {
  const at = serverNow();
  const offer = [...offerStore.values()]
    .filter((o) => o.credentialId === credentialId && offerStatusAt(o, at) === 'active')
    .at(-1);
  return offer ? { offerId: offer.offerId, expiresAt: iso(offer.expiresAt)! } : null;
}

/** The credential if it belongs to the staff member's issuer. */
const ownCredential = (staff: Staff, credentialId: string) => {
  const known = issuedStore.get(credentialId);
  const holder = known && holderStore.find((h) => h.id === known.holder.id);
  return known && holder && holder.issuerId === staff.issuer.id ? known : undefined;
};
const offerNotFound = () =>
  HttpResponse.json(errorBody('OFFER_NOT_FOUND', 'Credential offer not found'), { status: 404 });

export const offerHandlers = [
  http.get(`${API}/credentials/:credentialId`, ({ request, params }) => {
    record(request, `/credentials/${String(params.credentialId)}`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const known = ownCredential(staff, String(params.credentialId));
    if (!known) {
      return HttpResponse.json(errorBody('CREDENTIAL_NOT_FOUND', 'Credential not found'), {
        status: 404,
      });
    }
    const { claims: _claims, ...metadata } = known; // the backend never returns claims here
    return HttpResponse.json({
      ...metadata,
      activeOffer: known.status === 'pending' ? activeOfferOf(known.id) : null,
    });
  }),
  http.post(`${API}/credential-offers`, async ({ request }) => {
    const body = (await request.json()) as { credentialId: string };
    record(request, '/credential-offers', body);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const credential = ownCredential(staff, body.credentialId);
    if (!credential) {
      return HttpResponse.json(errorBody('CREDENTIAL_NOT_FOUND', 'Credential not found'), {
        status: 404,
      });
    }
    if (credential.status !== 'pending') {
      return HttpResponse.json(
        errorBody(
          'CREDENTIAL_NOT_PENDING',
          `Only a pending credential can be offered (this one is ${credential.status})`,
        ),
        { status: 409 },
      );
    }
    const offer = mockCreateOffer(credential.id);
    return HttpResponse.json(
      {
        offerId: offer.offerId,
        credentialId: credential.id,
        credentialType: credential.credentialType,
        holder: {
          id: credential.holder.id,
          fullName: credential.holder.fullName,
          externalRef: credential.holder.externalRef,
        },
        status: 'active',
        expiresAt: iso(offer.expiresAt),
        expiresInSeconds: OFFER_TTL_SECONDS,
        serverTime: iso(offer.createdAt),
        credentialOffer: JSON.parse(
          decodeURIComponent(offer.qrContent.slice(OFFER_PREFIX.length)),
        ) as unknown,
        qrContent: offer.qrContent,
      },
      { status: 201, headers: { 'Cache-Control': 'no-store' } },
    );
  }),
  http.get(`${API}/credential-offers/:offerId`, ({ request, params }) => {
    record(request, `/credential-offers/${String(params.offerId)}`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const offer = offerStore.get(String(params.offerId));
    if (!offer || !ownCredential(staff, offer.credentialId)) return offerNotFound();
    return HttpResponse.json(offerDetail(offer), { headers: { 'Cache-Control': 'no-store' } });
  }),
  http.post(`${API}/credential-offers/:offerId/cancel`, ({ request, params }) => {
    record(request, `/credential-offers/${String(params.offerId)}/cancel`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const offer = offerStore.get(String(params.offerId));
    if (!offer || !ownCredential(staff, offer.credentialId)) return offerNotFound();
    const status = offerStatusAt(offer, serverNow());
    if (status !== 'active') {
      return HttpResponse.json(
        errorBody(
          'OFFER_NOT_ACTIVE',
          `Only an active offer can be cancelled (this one is ${status})`,
          { status },
        ),
        { status: 409 },
      );
    }
    mockInvalidateOffer(offer.offerId, 'cancelled');
    return HttpResponse.json(offerDetail(offer), { headers: { 'Cache-Control': 'no-store' } });
  }),
];

// ---------------------------------------------------------------------------
// Revoke, reissue, reissue preview and the status history (the backend's rules and codes)

const credentialNotFound = () =>
  HttpResponse.json(errorBody('CREDENTIAL_NOT_FOUND', 'Credential not found'), { status: 404 });
const conflict = (code: string, message: string, details?: unknown) =>
  HttpResponse.json(errorBody(code, message, details), { status: 409 });

/** The same order of checks as the backend's prepareReissue(). */
function reissueCheck(
  credential: MockCredential,
  body: { reason?: string; note?: string; validUntil?: string },
) {
  if (credential.status === 'pending') {
    return conflict('CREDENTIAL_NOT_REISSUABLE', 'A pending credential cannot be reissued');
  }
  if (credential.status === 'revoked')
    return conflict('CREDENTIAL_ALREADY_REVOKED', 'Already revoked');
  if (credential.status === 'superseded') {
    return conflict('CREDENTIAL_SUPERSEDED', 'Already replaced', {
      replacedBy: credential.replacedByCredentialId ?? null,
    });
  }
  if (body.reason === 'other' && !body.note) {
    return HttpResponse.json(
      errorBody('VALIDATION_ERROR', 'Invalid request', [{ path: 'note', message: 'is required' }]),
      { status: 400 },
    );
  }
  if (body.validUntil && (body.validUntil < '2026-11-27' || body.validUntil > '2027-11-26')) {
    return HttpResponse.json(
      errorBody('VALIDATION_ERROR', 'Invalid validUntil', [
        { path: 'validUntil', message: 'out of range' },
      ]),
      { status: 400 },
    );
  }
  return null;
}

export function mockReissuePreview(credential: MockCredential, validUntil?: string) {
  const holder = holderStore.find((h) => h.id === credential.holder.id)!;
  const current = credential.claims ?? {};
  const replacement = structuredClone(holder.claims);
  const names = [...new Set([...Object.keys(current), ...Object.keys(replacement)])];
  return {
    credentialId: credential.id,
    credentialType: credential.credentialType,
    holder: credential.holder,
    current: {
      claims: current,
      expiresAt: credential.expiresAt,
      effectiveStatus: credential.effectiveStatus,
    },
    replacement: {
      claims: replacement,
      expiresAt: validUntil ? `${validUntil}T00:00:00.000Z` : '2027-11-26T04:30:00.000Z',
      defaultExpiresAt: '2027-11-26T04:30:00.000Z',
      cappedBy: validUntil ? 'validUntil' : null,
      validUntilRange: { min: '2026-11-27', max: '2027-11-26' },
    },
    changedFields: names
      .filter((n) => JSON.stringify(current[n]) !== JSON.stringify(replacement[n]))
      .sort(),
    warnings: [],
  };
}

const ownCredentialOf = (staff: Staff, id: string) => {
  const known = issuedStore.get(id);
  const holder = known && holderStore.find((h) => h.id === known.holder.id);
  return known && holder && holder.issuerId === staff.issuer.id ? known : undefined;
};

export const credentialActionHandlers = [
  http.get(`${API}/credentials/:credentialId/events`, ({ request, params }) => {
    const id = String(params.credentialId);
    record(request, `/credentials/${id}/events`);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    if (!ownCredentialOf(staff, id)) return credentialNotFound();
    return HttpResponse.json({ credentialId: id, events: eventStore.get(id) ?? [] });
  }),
  http.post(`${API}/credentials/:credentialId/revoke`, async ({ request, params }) => {
    const id = String(params.credentialId);
    const body = (await request.json()) as { reason?: string; note?: string };
    record(request, `/credentials/${id}/revoke`, body);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    if (staff.role !== 'admin') {
      return HttpResponse.json(errorBody('FORBIDDEN', 'Admins only'), { status: 403 });
    }
    const credential = ownCredentialOf(staff, id);
    if (!credential) return credentialNotFound();
    if (credential.status === 'revoked')
      return conflict('CREDENTIAL_ALREADY_REVOKED', 'Already revoked');
    if (credential.status === 'superseded') {
      return conflict('CREDENTIAL_SUPERSEDED', 'Already replaced', {
        replacedBy: credential.replacedByCredentialId ?? null,
      });
    }
    const by = { id: staff.id, displayName: staff.displayName };
    const updated: MockCredential = {
      ...credential,
      status: 'revoked',
      effectiveStatus: 'revoked',
      revokedAt: MOCK_NOW,
      revocationReason: body.reason ?? null,
      revokedBy: by,
    };
    issuedStore.set(id, updated);
    for (const offer of offerStore.values()) {
      if (offer.credentialId === id && offer.redeemedAt === null && offer.invalidatedAt === null) {
        mockInvalidateOffer(offer.offerId, 'credential_revoked');
      }
    }
    pushEvent(id, {
      fromStatus: credential.status,
      toStatus: 'revoked',
      reason: body.reason ?? null,
      staff: by,
      createdAt: MOCK_NOW,
    });
    const { claims: _claims, ...metadata } = updated;
    return HttpResponse.json(metadata);
  }),
  http.post(`${API}/credentials/:credentialId/reissue/preview`, async ({ request, params }) => {
    const id = String(params.credentialId);
    const body = (await request.json()) as { reason?: string; note?: string; validUntil?: string };
    record(request, `/credentials/${id}/reissue/preview`, body);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const credential = ownCredentialOf(staff, id);
    if (!credential) return credentialNotFound();
    const refused = reissueCheck(credential, body);
    if (refused) return refused;
    return HttpResponse.json(mockReissuePreview(credential, body.validUntil), {
      headers: { 'Cache-Control': 'no-store' },
    });
  }),
  http.post(`${API}/credentials/:credentialId/reissue`, async ({ request, params }) => {
    const id = String(params.credentialId);
    const body = (await request.json()) as { reason?: string; note?: string; validUntil?: string };
    record(request, `/credentials/${id}/reissue`, body);
    const staff = staffFor(request);
    if (!staff) return unauthenticated();
    const credential = ownCredentialOf(staff, id);
    if (!credential) return credentialNotFound();
    const refused = reissueCheck(credential, body);
    if (refused) return refused;
    const preview = mockReissuePreview(credential, body.validUntil);
    const newId = `e0000000-0000-4000-8000-${String(issuedStore.size + 1).padStart(12, '0')}`;
    const by = { id: staff.id, displayName: staff.displayName };
    const replacement: MockCredential = {
      id: newId,
      holder: credential.holder,
      credentialType: credential.credentialType,
      status: 'pending',
      effectiveStatus: 'pending',
      issuedAt: null,
      expiresAt: preview.replacement.expiresAt,
      createdAt: MOCK_NOW,
      createdBy: by,
      replacesCredentialId: id,
      claims: preview.replacement.claims,
    };
    issuedStore.set(newId, replacement);
    issuedStore.set(id, {
      ...credential,
      status: 'superseded',
      effectiveStatus: 'superseded',
      supersededAt: MOCK_NOW,
      replacedByCredentialId: newId,
    });
    pushEvent(newId, {
      fromStatus: null,
      toStatus: 'pending',
      reason: null,
      staff: by,
      createdAt: MOCK_NOW,
    });
    pushEvent(id, {
      fromStatus: 'valid',
      toStatus: 'superseded',
      reason: body.reason ?? null,
      staff: by,
      createdAt: MOCK_NOW,
    });
    const { claims: _claims, ...metadata } = replacement;
    return HttpResponse.json(
      { credential: metadata, replaces: { id, status: 'superseded' } },
      { status: 201 },
    );
  }),
];

export const server = setupServer(
  ...handlers,
  ...holderHandlers,
  ...issuanceHandlers,
  ...offerHandlers,
  ...credentialActionHandlers,
);

export function resetMockBackend() {
  tokens.clear();
  requests.length = 0;
  holderStore.splice(0, holderStore.length, ...seedHolders());
  issuedStore.clear();
  eventStore.clear();
  offerStore.clear();
  mockServerClock.offsetMs = 0;
}
