/**
 * GET /credential-schemas and POST /credentials/preview (docs/api/credential-schemas-api.md,
 * docs/api/credentials-api.md §7, Decision 019): the schemas an issuer may issue, read from the
 * schema files; the preview runs the SAME issuance path as POST /credentials without writing
 * anything, with the same values for the same clock, every expiry cap and every error.
 *
 * One injected clock for the whole file (NOW): every date below is relative to it, never to
 * the real time (CLAUDE.md, "Time in tests").
 */
import { readFileSync } from 'node:fs';
import { count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, credentialStatusEvents, holders } from '../src/db/schema.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const DAY_MS = 86_400_000;
/** The fixed clock of the app (whole seconds, close to the real time so tokens stay valid). */
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => isoDate(new Date(NOW.getTime() + n * DAY_MS));
const midnight = (date: string) => new Date(`${date}T00:00:00.000Z`).toISOString();

const schemaFile = (name: string) =>
  JSON.parse(readFileSync(new URL(`../../docs/schemas/${name}`, import.meta.url), 'utf8')) as {
    title: string;
    required: string[];
    properties: Record<string, unknown>;
    'x-univault': {
      vct: string;
      selectivelyDisclosable: string[];
      defaultValidity: string;
      derivedClaims?: Record<string, string>;
    };
  };
const EMPLOYMENT = schemaFile('employment-credential.v1.schema.json');
const KYC = schemaFile('kyc-credential.v1.schema.json');

const fixture = (file: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
    records: { claims: Record<string, unknown> }[];
  };
const EMPLOYEE_CLAIMS = fixture('employees.json').records[0]!.claims;
const CUSTOMER_CLAIMS = fixture('customers.json').records[0]!.claims;

let keysDir: string;
let t: AuthedTestApp;
let logs: () => Record<string, unknown>[];
let tokens: Record<'employerOfficer' | 'employerAdmin' | 'bankOfficer' | 'employerB', string>;
let seeded: Record<string, string>;

const call = (method: 'get' | 'post', path: string, token?: string, body?: object) => {
  const req = request(t.app)[method](`/api/v1${path}`);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return body ? req.send(body) : req;
};
const preview = (token: string, body: object) => call('post', '/credentials/preview', token, body);
const issue = (token: string, body: object) => call('post', '/credentials', token, body);

async function newHolder(token: string, body: object) {
  const res = await call('post', '/holders', token, body);
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const newEmployee = (employeeId: string, extra: Record<string, unknown> = {}) =>
  newHolder(tokens.employerOfficer, {
    claims: { ...EMPLOYEE_CLAIMS, employee_id: employeeId, ...extra },
  });
const newCustomer = (externalRef: string, extra: Record<string, unknown> = {}) =>
  newHolder(tokens.bankOfficer, { externalRef, claims: { ...CUSTOMER_CLAIMS, ...extra } });

const rowCounts = async () => ({
  credentials: (await t.database.db.select({ n: count() }).from(credentialRecords))[0]!.n,
  events: (await t.database.db.select({ n: count() }).from(credentialStatusEvents))[0]!.n,
  holders: (await t.database.db.select({ n: count() }).from(holders))[0]!.n,
});

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-preview-'));
  const captured = captureLogger(testConfig({ LOG_LEVEL: 'debug' }));
  logs = captured.lines;
  t = await authedTestApp(
    { ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: PASSPHRASE, PUBLIC_BASE_URL: BASE_URL },
    captured.logger,
    { now: () => NOW },
  );
  const [employerOfficer, employerAdmin, bankOfficer, bankAdmin, employerB] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.employerAdmin),
    t.tokenFor(STAFF.bankOfficer),
    t.tokenFor(STAFF.bankAdmin),
    t.tokenFor('officer@lanka-agro-tools.example'),
  ]);
  tokens = { employerOfficer, employerAdmin, bankOfficer, employerB };
  // employer-a and bank-a get signing keys; employer-b deliberately has none
  for (const [issuer, token] of [
    ['employer-a', employerAdmin],
    ['bank-a', bankAdmin],
  ] as const) {
    expect((await call('post', `/issuers/${issuer}/keys`, token)).status).toBe(201);
  }
  const rows = await t.database.db
    .select({ id: holders.id, ref: holders.externalRef })
    .from(holders);
  seeded = Object.fromEntries(rows.map((h) => [h.ref, h.id]));
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('GET /credential-schemas', () => {
  it('employer: only the Employment schema, its fields flagged from the schema file', async () => {
    const res = await call('get', '/credential-schemas', tokens.employerOfficer);
    expect(res.status).toBe(200);
    expect(res.body.schemas).toHaveLength(1);
    const [schema] = res.body.schemas;
    expect(schema).toMatchObject({
      credentialType: 'EmploymentCredential',
      vct: EMPLOYMENT['x-univault'].vct,
      title: EMPLOYMENT.title,
      schemaVersion: '1.0',
      defaultValidity: 'P1Y',
      alwaysVisibleClaims: [],
    });
    expect(schema.fields.map((f: { name: string }) => f.name)).toEqual(
      Object.keys(EMPLOYMENT.properties),
    );
    for (const field of schema.fields) {
      expect(field.required, field.name).toBe(EMPLOYMENT.required.includes(field.name));
      expect(field.selectivelyDisclosable, field.name).toBe(
        EMPLOYMENT['x-univault'].selectivelyDisclosable.includes(field.name),
      );
      expect(field.derived, field.name).toBe(false);
    }
    expect(schema.alwaysVisible).toEqual([
      'iss',
      'issuer_name',
      'vct',
      'schema_version',
      'jti',
      'iat',
      'exp',
      'cnf',
      'status',
    ]);
  });

  it('bank: only the KYC schema; age_over_18 is derived; kyc_verification_date always visible', async () => {
    const res = await call('get', '/credential-schemas', tokens.bankOfficer);
    const [schema] = res.body.schemas;
    expect(res.body.schemas).toHaveLength(1);
    expect(schema.credentialType).toBe('KYCCredential');
    expect(schema.defaultValidity).toBe(KYC['x-univault'].defaultValidity);
    const derived = schema.fields.filter((f: { derived: boolean }) => f.derived);
    expect(derived.map((f: { name: string }) => f.name)).toEqual(
      Object.keys(KYC['x-univault'].derivedClaims!),
    );
    for (const field of schema.fields) {
      expect(field.selectivelyDisclosable, field.name).toBe(
        KYC['x-univault'].selectivelyDisclosable.includes(field.name),
      );
    }
    expect(schema.alwaysVisible).toContain('kyc_verification_date');
  });

  it('requires a login', async () => {
    expect((await call('get', '/credential-schemas')).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('POST /credentials/preview – what issuance would create', () => {
  it('employer: envelope, disclosable claims and the default expiry; no-store; nothing written', async () => {
    const holderId = await newEmployee('STC-80001');
    const before = await rowCounts();
    const res = await preview(tokens.employerOfficer, { holderId });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await rowCounts()).toEqual(before); // no credential, no event

    const expiresAt = new Date(NOW);
    expiresAt.setUTCFullYear(expiresAt.getUTCFullYear() + 1); // P1Y
    expect(res.body).toMatchObject({
      credentialType: 'EmploymentCredential',
      vct: EMPLOYMENT['x-univault'].vct,
      issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)' },
      holder: { id: holderId, externalRef: 'STC-80001' },
      alwaysVisible: {
        iss: `${BASE_URL}/api/v1/issuers/employer-a`,
        issuer_name: 'Serendib Trading Company (Demo)',
        vct: EMPLOYMENT['x-univault'].vct,
        schema_version: '1.0',
        jti: null,
        iat: NOW.toISOString(),
        exp: expiresAt.toISOString(),
        cnf: null,
        status: null,
      },
      derived: [],
      expiry: {
        expiresAt: expiresAt.toISOString(),
        defaultExpiresAt: expiresAt.toISOString(),
        cappedBy: null,
        validUntilRange: { min: daysFromNow(1), max: isoDate(expiresAt) },
      },
      warnings: [],
    });
    const claims: Record<string, unknown> = { ...EMPLOYEE_CLAIMS, employee_id: 'STC-80001' };
    expect(res.body.disclosable).toEqual(
      EMPLOYMENT['x-univault'].selectivelyDisclosable
        .filter((name) => name in claims)
        .map((name) => ({ name, value: claims[name] })),
    );
  });

  it('equals the claims and expiry of a real issuance for the same input and clock', async () => {
    const holderId = await newCustomer('CUS-PREV-001');
    const shown = (await preview(tokens.bankOfficer, { holderId })).body;
    const created = await issue(tokens.bankOfficer, { holderId });
    expect(created.status).toBe(201);
    expect(created.body.expiresAt).toBe(shown.expiry.expiresAt);
    const [row] = await t.database.db
      .select()
      .from(credentialRecords)
      .where(eq(credentialRecords.id, created.body.id));
    const previewed = Object.fromEntries(
      [...shown.disclosable, ...shown.derived].map((c: { name: string; value: unknown }) => [
        c.name,
        c.value,
      ]),
    );
    expect(row!.claimsSnapshot).toEqual(previewed);
    expect(row!.vct).toBe(shown.vct);
    expect(shown.derived).toEqual([{ name: 'age_over_18', value: true }]);
    expect(shown.alwaysVisible.kyc_verification_date).toBe(isoDate(NOW));
  });

  it('takes no lock (lock: false): issuing right after a preview works', async () => {
    const holderId = await newEmployee('STC-80002');
    expect((await preview(tokens.employerOfficer, { holderId })).status).toBe(200);
    expect((await issue(tokens.employerOfficer, { holderId })).status).toBe(201);
  });

  it('logs identifiers only, never claims', async () => {
    const holderId = await newCustomer('CUS-PREV-LOG', { full_name: 'Previewed Person' });
    await preview(tokens.bankOfficer, { holderId });
    const all = JSON.stringify(logs());
    expect(all).toContain('Credential previewed');
    expect(all).not.toContain('Previewed Person');
    expect(all).not.toContain(String(CUSTOMER_CLAIMS.id_document_number));
  });
});

// ---------------------------------------------------------------------------
describe('preview – expiry caps (the same rules as issuance)', () => {
  it('id_document_expiry: limited to the passport expiry date', async () => {
    const passportExpiry = daysFromNow(200);
    const holderId = await newCustomer('CUS-PREV-PASS', {
      id_document_type: 'passport',
      id_document_number: 'N1234567',
      id_document_expiry: passportExpiry,
    });
    const res = await preview(tokens.bankOfficer, { holderId });
    expect(res.body.expiry).toMatchObject({
      expiresAt: midnight(passportExpiry),
      cappedBy: 'id_document_expiry',
      validUntilRange: { max: passportExpiry },
    });
    expect(new Date(res.body.expiry.defaultExpiresAt).getTime()).toBeGreaterThan(
      new Date(res.body.expiry.expiresAt).getTime(),
    );
    expect((await issue(tokens.bankOfficer, { holderId })).body.expiresAt).toBe(
      midnight(passportExpiry),
    );
  });

  it('18th_birthday: an under-18 holder, age_over_18 false, with a warning', async () => {
    const dob = new Date(
      Date.UTC(NOW.getUTCFullYear() - 18, NOW.getUTCMonth(), NOW.getUTCDate() + 30),
    );
    const eighteenth = new Date(
      Date.UTC(dob.getUTCFullYear() + 18, dob.getUTCMonth(), dob.getUTCDate()),
    );
    const holderId = await newCustomer('CUS-PREV-MINOR', { date_of_birth: isoDate(dob) });
    const res = await preview(tokens.bankOfficer, { holderId });
    expect(res.body.expiry).toMatchObject({
      expiresAt: eighteenth.toISOString(),
      cappedBy: '18th_birthday',
    });
    expect(res.body.derived).toEqual([{ name: 'age_over_18', value: false }]);
    expect(res.body.warnings).toEqual(['holder_under_18']);
  });

  it('validUntil: an earlier date chosen by staff, accepted by issuance too', async () => {
    const holderId = await newEmployee('STC-80003');
    const validUntil = daysFromNow(90);
    const res = await preview(tokens.employerOfficer, { holderId, validUntil });
    expect(res.body.expiry).toMatchObject({
      expiresAt: midnight(validUntil),
      cappedBy: 'validUntil',
    });
    const created = await issue(tokens.employerOfficer, { holderId, validUntil });
    expect(created.status).toBe(201);
    expect(created.body.expiresAt).toBe(midnight(validUntil));
  });

  it('validUntil equal to the capped date is no extra cap; out of range is 400', async () => {
    const holderId = await newEmployee('STC-80004');
    const { max, min } = (await preview(tokens.employerOfficer, { holderId })).body.expiry
      .validUntilRange;
    const atMax = await preview(tokens.employerOfficer, { holderId, validUntil: max });
    expect(atMax.body.expiry.cappedBy).toBe('validUntil'); // midnight of the last day < default instant
    expect((await preview(tokens.employerOfficer, { holderId, validUntil: min })).status).toBe(200);
    for (const validUntil of [isoDate(NOW), daysFromNow(400), 'not-a-date']) {
      const res = await preview(tokens.employerOfficer, { holderId, validUntil });
      expect(res.status, validUntil).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details[0].path).toBe('validUntil');
    }
  });
});

// ---------------------------------------------------------------------------
describe('preview – the errors issuance would raise', () => {
  it('409 ACTIVE_CREDENTIAL_EXISTS with the existing credential id', async () => {
    const holderId = await newEmployee('STC-80010');
    const first = await issue(tokens.employerOfficer, { holderId });
    const res = await preview(tokens.employerOfficer, { holderId });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'ACTIVE_CREDENTIAL_EXISTS',
      details: { credentialId: first.body.id },
    });
  });

  it('422 HOLDER_DATA_INVALID for an expired passport', async () => {
    const holderId = await newCustomer('CUS-PREV-OLD', {
      id_document_type: 'passport',
      id_document_number: 'N7654321',
      id_document_expiry: daysFromNow(-5),
    });
    // Registering the holder accepts a past expiry date; issuing (and so previewing) refuses it
    const res = await preview(tokens.bankOfficer, { holderId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDER_DATA_INVALID');
    expect(res.body.error.details).toContainEqual({
      path: 'claims.id_document_expiry',
      message: 'the ID document has expired',
    });
  });

  it('409 ISSUER_KEY_MISSING when the issuer has no active signing key', async () => {
    const res = await preview(tokens.employerB, { holderId: seeded['LAT-00002']! });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ISSUER_KEY_MISSING');
  });

  it('400 for a schema this issuer type may not issue (preview and issuance alike)', async () => {
    const holderId = await newEmployee('STC-80011');
    for (const send of [preview, issue]) {
      const res = await send(tokens.employerOfficer, { holderId, credentialType: 'KYCCredential' });
      expect(res.status).toBe(400);
      expect(res.body.error.details).toEqual([
        { path: 'credentialType', message: 'must be EmploymentCredential for an employer' },
      ]);
    }
    expect(
      (await preview(tokens.employerOfficer, { holderId, credentialType: 'EmploymentCredential' }))
        .status,
    ).toBe(200);
  });

  it("isolation: another issuer's holder is 404 HOLDER_NOT_FOUND", async () => {
    const res = await preview(tokens.bankOfficer, { holderId: seeded['STC-00001']! });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HOLDER_NOT_FOUND');
  });

  it('401 without a login; 400 for a malformed body', async () => {
    expect(
      (await call('post', '/credentials/preview', undefined, { holderId: seeded['STC-00001'] }))
        .status,
    ).toBe(401);
    const res = await preview(tokens.employerOfficer, { holderId: 'nope' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
