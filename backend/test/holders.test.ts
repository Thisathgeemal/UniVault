import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, holders } from '../src/db/schema.js';
import { ageOn } from '../src/services/holders.service.js';
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

  it('rejects a duplicate reference at the same issuer with 409', async () => {
    const res = await post(employerOfficer, { claims: employeeClaims('STC-90001') });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('HOLDER_ALREADY_EXISTS');
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
        { path: 'claims.id_document_expiry', message: 'is required' },
        {
          path: 'claims.permanent_address.line1',
          message: 'must be a street address (P.O. Box addresses are not accepted)',
        },
      ]),
    );
  });

  it('requires a valid customer number for bank customers', async () => {
    expect(paths(await post(bankOfficer, { claims: customerClaims() }))).toContain('externalRef');
    expect(
      paths(await post(bankOfficer, { externalRef: 'bad ref!', claims: customerClaims() })),
    ).toContain('externalRef');
  });

  it('requires externalRef to match employee_id for employees', async () => {
    const res = await post(employerOfficer, {
      externalRef: 'OTHER-1',
      claims: employeeClaims('STC-90014'),
    });
    expect(res.body.error.details).toContainEqual({
      path: 'externalRef',
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
