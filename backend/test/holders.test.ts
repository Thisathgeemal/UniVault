import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, holders } from '../src/db/schema.js';
import type { Db } from '../src/db/client.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import { ageOn, createHoldersService } from '../src/services/holders.service.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

// Valid claims taken from the synthetic seed fixtures (they pass the credential schemas)
const fixture = (file: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
    records: { claims: Record<string, unknown> }[];
  };
const employeeClaims = (employeeId: string, fullName = 'Nimesha Perera') => ({
  ...fixture('employees.json').records[0]!.claims,
  employee_id: employeeId,
  full_name: fullName,
});
const customerClaims = (overrides: Record<string, unknown> = {}) => {
  const { ...claims } = fixture('customers.json').records[0]!.claims;
  return { ...claims, full_name: 'Kasun Bandara', ...overrides };
};

let t: AuthedTestApp;
let employerOfficer: string;
let bankOfficer: string;
const post = (token: string, body: unknown) =>
  request(t.app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
const get = (token: string, path = '') =>
  request(t.app).get(`/api/v1/holders${path}`).set('Authorization', `Bearer ${token}`);

beforeAll(async () => {
  t = await authedTestApp();
  [employerOfficer, bankOfficer] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.bankOfficer),
  ]);
});
afterAll(() => t.database.close());

// ---------------------------------------------------------------------------
describe('POST /holders – new holder records can be created', () => {
  it('creates an employee record for an employer, linked to that employer', async () => {
    const res = await post(employerOfficer, { claims: employeeClaims('STC-90001') });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/holders/${res.body.id}`);
    expect(res.body).toMatchObject({
      issuerId: 'employer-a',
      recordType: 'employee',
      credentialType: 'EmploymentCredential',
      externalRef: 'STC-90001',
      fullName: 'Nimesha Perera',
      createdBy: { displayName: 'Serendib Trading Company (Demo) Officer' },
    });
    const [row] = await t.database.db.select().from(holders).where(eq(holders.id, res.body.id));
    expect(row?.createdByStaffId).toBe(res.body.createdBy.id);
  });

  it('creates a bank customer record with its customer number', async () => {
    const res = await post(bankOfficer, { externalRef: 'CUS-000123', claims: customerClaims() });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      issuerId: 'bank-a',
      recordType: 'customer',
      credentialType: 'KYCCredential',
      externalRef: 'CUS-000123',
    });
  });

  it('calculates age_over_18 on the server, ignoring the client value', async () => {
    const adult = await post(bankOfficer, {
      externalRef: 'CUS-000200',
      claims: customerClaims({ date_of_birth: '1990-05-01', age_over_18: false }),
    });
    expect(adult.body.claims.age_over_18).toBe(true);
    const minor = await post(bankOfficer, {
      externalRef: 'CUS-000201',
      claims: customerClaims({ date_of_birth: '2015-05-01', age_over_18: true }),
    });
    expect(minor.body.claims.age_over_18).toBe(false);
  });

  it('always uses the logged-in issuer, even if the body names another one', async () => {
    const res = await post(employerOfficer, {
      issuerId: 'bank-a',
      recordType: 'customer',
      claims: employeeClaims('STC-90002'),
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ issuerId: 'employer-a', recordType: 'employee' });
  });

  it('rejects a duplicate reference at the same issuer with 409, naming the existing record', async () => {
    const existing = await get(employerOfficer, '?search=STC-90001');
    const res = await post(employerOfficer, { claims: employeeClaims('STC-90001') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HOLDER_ALREADY_EXISTS');
    // The portal links to it; it is this issuer's own record, so nothing leaks
    expect(res.body.error.details).toEqual({ holderId: existing.body.holders[0].id });
  });

  it('allows the same reference at a different issuer (independent issuers)', async () => {
    const res = await post(bankOfficer, { externalRef: 'STC-90001', claims: customerClaims() });
    expect(res.status).toBe(201);
  });

  it('requires a login', async () => {
    expect(
      (
        await request(t.app)
          .post('/api/v1/holders')
          .send({ claims: employeeClaims('STC-90003') })
      ).status,
    ).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('POST /holders – invalid data is rejected', () => {
  const paths = (res: request.Response) =>
    (res.body.error.details as { path: string }[]).map((d) => d.path);

  it('lists every missing required claim', async () => {
    const res = await post(employerOfficer, {
      claims: { employee_id: 'STC-90010', full_name: 'A Person' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(paths(res)).toEqual(
      expect.arrayContaining([
        'claims.designation',
        'claims.department',
        'claims.employment_type',
        'claims.date_of_joining',
      ]),
    );
  });

  it('rejects fields that are not in the credential schema', async () => {
    const res = await post(employerOfficer, {
      claims: { ...employeeClaims('STC-90011'), salary: 250000 },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toContainEqual({
      path: 'claims.salary',
      code: 'notAllowed',
      message: 'is not allowed by the credential schema',
    });
  });

  it('rejects values outside the allowed options or formats', async () => {
    const res = await post(employerOfficer, {
      claims: {
        ...employeeClaims('STC-90012'),
        employment_type: 'freelance',
        date_of_joining: '03/07/2019',
      },
    });
    expect(paths(res)).toEqual(
      expect.arrayContaining(['claims.employment_type', 'claims.date_of_joining']),
    );
  });

  it('rejects employment claims sent by a bank (wrong schema for the issuer type)', async () => {
    const res = await post(bankOfficer, {
      externalRef: 'CUS-000300',
      claims: employeeClaims('STC-90013'),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/KYCCredential schema/);
  });

  it('applies KYC rules: passport needs an expiry date, P.O. Box addresses are refused', async () => {
    const claims = customerClaims({
      id_document_type: 'passport',
      id_document_number: 'N1234567',
      permanent_address: {
        line1: 'P.O. Box 44',
        city: 'Kandy',
        district: 'Kandy',
        postal_code: '20000',
        country: 'LK',
      },
    });
    delete (claims as Record<string, unknown>).id_document_expiry;
    const res = await post(bankOfficer, { externalRef: 'CUS-000301', claims });
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'claims.id_document_expiry', code: 'required', message: 'is required' },
        {
          path: 'claims.permanent_address.line1',
          code: 'poBox',
          message: 'must be a street address (P.O. Box addresses are not accepted)',
        },
      ]),
    );
  });

  it('requires a valid customer number for bank customers', async () => {
    expect(paths(await post(bankOfficer, { claims: customerClaims() }))).toContain('externalRef');
    const bad = await post(bankOfficer, { externalRef: 'bad ref!', claims: customerClaims() });
    expect(bad.body.error.details).toContainEqual({
      path: 'externalRef',
      code: 'pattern',
      message: 'must be 3–30 uppercase letters, digits or hyphens',
    });
  });

  it('gives every issue a stable code (the portal translates it)', async () => {
    const res = await post(employerOfficer, {
      claims: { employee_id: 'stc 1', full_name: 'A', date_of_joining: 'soon' },
    });
    const details = res.body.error.details as { path: string; code: string }[];
    expect(details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'claims.employee_id', code: 'pattern' }),
        expect.objectContaining({ path: 'claims.full_name', code: 'minLength' }),
        expect.objectContaining({ path: 'claims.date_of_joining', code: 'format' }),
        expect.objectContaining({ path: 'claims.designation', code: 'required' }),
      ]),
    );
    for (const d of details) expect(Object.keys(d).sort()).toEqual(['code', 'message', 'path']);
  });

  it('requires externalRef to match employee_id for employees', async () => {
    const res = await post(employerOfficer, {
      externalRef: 'OTHER-1',
      claims: employeeClaims('STC-90014'),
    });
    expect(res.body.error.details).toContainEqual({
      path: 'externalRef',
      code: 'mismatch',
      message: 'must equal claims.employee_id for employee records',
    });
  });

  it('rejects a body without claims', async () => {
    const res = await post(employerOfficer, {});
    expect(res.status).toBe(400);
    expect(paths(res)).toContain('claims');
  });
});

// ---------------------------------------------------------------------------
describe('GET /holders – existing records can be retrieved', () => {
  it('lists only the logged-in issuer’s records, as summaries without personal claims', async () => {
    const res = await get(employerOfficer);
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThanOrEqual(4); // 2 seeded + created above
    for (const h of res.body.holders) {
      expect(Object.keys(h).sort()).toEqual([
        'createdAt',
        'credentialCount',
        'externalRef',
        'fullName',
        'id',
        'idNumberLast4',
        'recordType',
      ]);
      expect(h.recordType).toBe('employee');
    }
    const bank = await get(bankOfficer);
    expect(
      bank.body.holders.every((h: { recordType: string }) => h.recordType === 'customer'),
    ).toBe(true);
    expect(bank.body.holders.map((h: { externalRef: string }) => h.externalRef)).not.toContain(
      'STC-90002',
    );
  });

  it('searches by name or reference, ignoring letter case', async () => {
    const byName = await get(employerOfficer, '?search=nimesha');
    expect(byName.body.holders.length).toBeGreaterThanOrEqual(1);
    expect(
      byName.body.holders.every((h: { fullName: string }) => /nimesha/i.test(h.fullName)),
    ).toBe(true);
    const byRef = await get(employerOfficer, '?search=stc-90002');
    expect(byRef.body.holders.map((h: { externalRef: string }) => h.externalRef)).toEqual([
      'STC-90002',
    ]);
  });

  it('treats % and _ in a search literally', async () => {
    expect((await get(employerOfficer, '?search=%25')).body.total).toBe(0);
  });

  it('pages results and reports the total', async () => {
    const page1 = await get(employerOfficer, '?limit=2&offset=0&sort=name');
    const page2 = await get(employerOfficer, '?limit=2&offset=2&sort=name');
    expect(page1.body).toMatchObject({ limit: 2, offset: 0 });
    expect(page1.body.holders).toHaveLength(2);
    const names = [...page1.body.holders, ...page2.body.holders].map(
      (h: { fullName: string }) => h.fullName,
    );
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(
      new Set([...page1.body.holders, ...page2.body.holders].map((h: { id: string }) => h.id)).size,
    ).toBe(names.length);
  });

  it('counts each holder’s credentials', async () => {
    const created = await post(employerOfficer, {
      claims: employeeClaims('STC-90020', 'Counted Holder'),
    });
    await t.database.db.insert(credentialRecords).values({
      issuerId: 'employer-a',
      holderId: created.body.id,
      credentialType: 'EmploymentCredential',
      vct: 'urn:univault:vct:EmploymentCredential:1',
      claimsSnapshot: created.body.claims,
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    const res = await get(employerOfficer, '?search=STC-90020');
    expect(res.body.holders[0].credentialCount).toBe(1);
  });

  it('shows only the last 4 characters of the ID number (masking rule)', async () => {
    await post(bankOfficer, {
      externalRef: 'CUS-000400',
      claims: customerClaims({ id_document_number: '199012345678' }),
    });
    const [customer] = (await get(bankOfficer, '?search=CUS-000400')).body.holders;
    expect(customer.idNumberLast4).toBe('5678');
    expect(JSON.stringify(customer)).not.toContain('19901234');
    // Employees: the optional nic_number, or null without one
    const { nic_number: _nic, ...noNic } = employeeClaims('STC-90040', 'No Nic') as Record<
      string,
      unknown
    >;
    await post(employerOfficer, { claims: noNic });
    await post(employerOfficer, {
      claims: { ...employeeClaims('STC-90041', 'With Nic'), nic_number: '851234567V' },
    });
    const list = (await get(employerOfficer, '?search=STC-9004')).body.holders as {
      externalRef: string;
      idNumberLast4: string | null;
    }[];
    expect(Object.fromEntries(list.map((h) => [h.externalRef, h.idNumberLast4]))).toEqual({
      'STC-90040': null,
      'STC-90041': '567V',
    });
  });

  it('sorts by date, name or reference in both directions', async () => {
    const order = async (sort: string, key: 'fullName' | 'externalRef' | 'createdAt') =>
      (
        (await get(employerOfficer, `?sort=${sort}&limit=100`)).body.holders as Record<
          string,
          string
        >[]
      ).map((h) => h[key]!);
    // Names: as the existing paging test (collation and localeCompare agree on these names);
    // references and ISO timestamps: plain code-unit order
    const asc = (values: string[]) => [...values].sort();
    const names = await order('name', 'fullName');
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(await order('name_desc', 'fullName')).toEqual([...names].reverse());
    const refs = await order('ref', 'externalRef');
    expect(refs).toEqual(asc(refs));
    expect(await order('ref_desc', 'externalRef')).toEqual([...refs].reverse());
    const oldest = await order('oldest', 'createdAt');
    expect(oldest).toEqual(asc(oldest));
    expect((await order('newest', 'createdAt'))[0]).toBe(oldest.at(-1));
  });

  it('validates list parameters', async () => {
    expect((await get(employerOfficer, '?limit=0')).status).toBe(400);
    expect((await get(employerOfficer, '?sort=random')).status).toBe(400);
  });

  it('returns one record with its full claims', async () => {
    const created = await post(employerOfficer, {
      claims: employeeClaims('STC-90030', 'Detail Holder'),
    });
    const res = await get(employerOfficer, `/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.body.id,
      externalRef: 'STC-90030',
      claims: { designation: expect.any(String) },
    });
  });

  it('hides another issuer’s record as 404 (not 403)', async () => {
    const created = await post(employerOfficer, { claims: employeeClaims('STC-90031') });
    const res = await get(bankOfficer, `/${created.body.id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HOLDER_NOT_FOUND');
  });

  it('returns 404 for an unknown ID and 400 for a malformed one', async () => {
    expect((await get(employerOfficer, '/6f1c2b1e-1b7a-4a43-9a51-0d0f0d1c0e11')).status).toBe(404);
    expect((await get(employerOfficer, '/not-a-uuid')).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
describe('privacy', () => {
  it('logs the creation without any personal claim values', async () => {
    const { logger, lines } = captureLogger(testConfig({ LOG_LEVEL: 'info' }));
    const logged = await authedTestApp({}, logger);
    const token = await logged.tokenFor(STAFF.bankOfficer);
    await request(logged.app)
      .post('/api/v1/holders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        externalRef: 'CUS-777777',
        claims: customerClaims({ full_name: 'Private Person', mobile_number: '+94771234567' }),
      });
    const all = JSON.stringify(lines());
    expect(all).toContain('Holder record created');
    expect(all).not.toContain('Private Person');
    expect(all).not.toContain('+94771234567');
    await logged.database.close();
  });
});

describe('ageOn', () => {
  it('counts whole years and handles the birthday boundary', () => {
    const on = new Date('2026-11-20T00:00:00Z');
    expect(ageOn('2008-11-20', on)).toBe(18);
    expect(ageOn('2008-11-21', on)).toBe(17);
    expect(ageOn('not-a-date', on)).toBeNull();
  });
});

describe('createHoldersService – database errors', () => {
  const staff = {
    id: 'staff-1',
    email: 'officer@serendib-trading.example',
    displayName: 'Officer',
    role: 'officer' as const,
    issuer: { id: 'employer-a', name: 'Serendib Trading', type: 'employer' as const },
  };
  /** A database whose insert fails with `error` and whose lookups find nothing. */
  const failingDb = (error: unknown) =>
    ({
      insert: () => ({ values: () => ({ returning: () => Promise.reject(error) }) }),
      select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    }) as unknown as Db;

  it('rethrows a failure that is not a duplicate (it becomes a 500, never a 409)', async () => {
    const service = createHoldersService(
      failingDb(new Error('connection lost')),
      loadCredentialSchemas(),
    );
    await expect(service.create(staff, { claims: employeeClaims('STC-90050') })).rejects.toThrow(
      'connection lost',
    );
  });

  it('a duplicate found by the database (also via a wrapped cause) is a 409, without an id if the row is gone', async () => {
    const wrapped = new Error('insert failed', { cause: { code: '23505' } });
    const service = createHoldersService(failingDb(wrapped), loadCredentialSchemas());
    const error = await service
      .create(staff, { claims: employeeClaims('STC-90051') })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 409, code: 'HOLDER_ALREADY_EXISTS', details: undefined });
  });
});
