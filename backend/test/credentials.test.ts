import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeDisclosures, verifySdJwt, type IssuerPublicJwk } from '@univault/crypto-core/node';
import { and, count, eq } from 'drizzle-orm';
import { calculateJwkThumbprint } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, holders } from '../src/db/schema.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import {
  addIsoDuration,
  computeExpiry,
  createCredentialsService,
  type CredentialsService,
} from '../src/services/credentials.service.js';
import { createKeyStore } from '../src/keys/key-store.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const EMPLOYER_B_OFFICER = 'officer@lanka-agro-tools.example';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const DAY_MS = 86_400_000;

// Holder claims from the synthetic seed fixtures (they pass the credential schemas)
const fixture = (file: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
    records: { claims: Record<string, unknown> }[];
  };
const EMPLOYEE_CLAIMS = fixture('employees.json').records[0]!.claims;
const CUSTOMER_CLAIMS = fixture('customers.json').records[0]!.claims;

let keysDir: string;
let t: AuthedTestApp;
let logs: () => Record<string, unknown>[];
let signer: CredentialsService;
let tokens: Record<'employerOfficer' | 'employerAdmin' | 'bankOfficer' | 'bankAdmin', string>;
let holderIds: Record<string, string>; // seeded holders by external reference
const employerKids: string[] = []; // employer-a keys, oldest first

// Everything the API returned and every SD-JWT issued – checked by the privacy tests
const responses: string[] = [];
const issuedSdJwts: string[] = [];

const track = (res: request.Response) => {
  responses.push(res.text);
  return res;
};
const createCredential = async (token: string, body: object) =>
  track(
    await request(t.app)
      .post('/api/v1/credentials')
      .set('Authorization', `Bearer ${token}`)
      .send(body),
  );
const getCredentials = async (token: string, path = '') =>
  track(
    await request(t.app).get(`/api/v1/credentials${path}`).set('Authorization', `Bearer ${token}`),
  );

/** A holder public key as a wallet would send it (EC P-256, public members only). */
function walletKey(curve = 'P-256') {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: curve });
  return {
    publicJwk: publicKey.export({ format: 'jwk' }) as Record<string, string>,
    privateJwk: privateKey.export({ format: 'jwk' }) as Record<string, string>,
  };
}

async function sign(credentialId: string, jwk: Record<string, string>) {
  const result = await signer.signCredential(credentialId, jwk);
  issuedSdJwts.push(result.sdJwt);
  return result;
}

/** What a verifier does: fetch the issuer's JWKS and pick the key named in the credential header. */
async function verifyAgainstJwks(sdJwt: string, issuerId: string) {
  const res = await request(t.app).get(`/api/v1/issuers/${issuerId}/keys`);
  expect(res.status).toBe(200);
  const jwks = JSON.parse(res.text) as { keys: IssuerPublicJwk[] };
  const header = JSON.parse(Buffer.from(sdJwt.split('.')[0]!, 'base64url').toString()) as {
    kid: string;
    typ: string;
  };
  const key = jwks.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error(`kid ${header.kid} is not in the issuer's JWKS`);
  return { header, jwks, result: await verifySdJwt(sdJwt, key) };
}

async function newEmployee(employeeId: string, overrides: Record<string, unknown> = {}) {
  const res = await request(t.app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${tokens.employerOfficer}`)
    .send({ claims: { ...EMPLOYEE_CLAIMS, employee_id: employeeId, ...overrides } });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function newCustomer(externalRef: string, overrides: Record<string, unknown> = {}) {
  const res = await request(t.app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${tokens.bankOfficer}`)
    .send({ externalRef, claims: { ...CUSTOMER_CLAIMS, ...overrides } });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function generateKey(issuerId: string, adminToken: string) {
  const res = await request(t.app)
    .post(`/api/v1/issuers/${issuerId}/keys`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(201);
  return res.body.kid as string;
}

const recordOf = async (id: string) =>
  (await t.database.db.select().from(credentialRecords).where(eq(credentialRecords.id, id)))[0]!;
const credentialCount = async (holderId: string) =>
  (
    await t.database.db
      .select({ n: count() })
      .from(credentialRecords)
      .where(eq(credentialRecords.holderId, holderId))
  )[0]!.n;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const midnightUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
/** The expiry was computed from "now" somewhere between `before` and `after`. */
function expectExpiryBetween(expiresAt: string, before: Date, after: Date, duration: string) {
  const actual = new Date(expiresAt).getTime();
  expect(actual % 1000).toBe(0); // whole seconds, so the SD-JWT exp equals expires_at
  const lowest = Math.floor(addIsoDuration(before, duration).getTime() / 1000) * 1000;
  expect(actual).toBeGreaterThanOrEqual(lowest);
  expect(actual).toBeLessThanOrEqual(addIsoDuration(after, duration).getTime());
}

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-credentials-'));
  const captured = captureLogger(testConfig({ LOG_LEVEL: 'info' }));
  logs = captured.lines;
  t = await authedTestApp(
    { ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: PASSPHRASE, PUBLIC_BASE_URL: BASE_URL },
    captured.logger,
  );
  const [employerOfficer, employerAdmin, bankOfficer, bankAdmin] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.employerAdmin),
    t.tokenFor(STAFF.bankOfficer),
    t.tokenFor(STAFF.bankAdmin),
  ]);
  tokens = { employerOfficer, employerAdmin, bankOfficer, bankAdmin };

  // employer-a and bank-a get signing keys; employer-b deliberately has none
  employerKids.push(await generateKey('employer-a', employerAdmin));
  await generateKey('bank-a', bankAdmin);

  // The same signing service the Sprint 2 redemption endpoint will use, on the same database
  signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
    keyStore: createKeyStore({
      db: t.database.db,
      source: 'file',
      keysDir,
      passphrase: PASSPHRASE,
    }),
    publicBaseUrl: BASE_URL,
  });

  const seeded = await t.database.db
    .select({ id: holders.id, ref: holders.externalRef })
    .from(holders);
  holderIds = Object.fromEntries(seeded.map((h) => [h.ref, h.id]));
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('POST /credentials – pending Employment credential', () => {
  let credentialId: string;

  it('creates a pending, unsigned credential from a seeded employee record', async () => {
    const before = new Date();
    const res = await createCredential(tokens.employerOfficer, {
      holderId: holderIds['STC-00001'],
    });
    const after = new Date();
    expect(res.status).toBe(201);
    credentialId = res.body.id;
    expect(res.headers.location).toBe(`/api/v1/credentials/${credentialId}`);
    expect(res.body).toMatchObject({
      issuerId: 'employer-a',
      holder: { id: holderIds['STC-00001'], externalRef: 'STC-00001', fullName: 'Lahiru Silva' },
      credentialType: 'EmploymentCredential',
      vct: 'urn:univault:vct:EmploymentCredential:1',
      schemaVersion: '1.0',
      status: 'pending',
      issuerKid: null,
      issuedAt: null,
      revokedAt: null,
      createdBy: { displayName: 'Serendib Trading Company (Demo) Officer' },
    });
    expectExpiryBetween(res.body.expiresAt, before, after, 'P1Y');
    // Metadata only: no claims, signature or key material
    expect(res.body).not.toHaveProperty('claims');
    expect(res.body).not.toHaveProperty('claimsSnapshot');
    expect(res.body).not.toHaveProperty('holderKeyThumbprint');
  });

  it('stores the claims snapshot and the staff member, with nothing signed yet', async () => {
    const row = await recordOf(credentialId);
    expect(row.claimsSnapshot).toEqual(EMPLOYEE_CLAIMS);
    expect(row.createdByStaffId).not.toBeNull();
    expect(row).toMatchObject({
      status: 'pending',
      issuerKid: null,
      holderKeyThumbprint: null,
      issuedAt: null,
    });
  });

  it('accepts a matching credentialType and lets admins issue too', async () => {
    const holderId = await newEmployee('STC-80001');
    const res = await createCredential(tokens.employerAdmin, {
      holderId,
      credentialType: 'EmploymentCredential',
    });
    expect(res.status).toBe(201);
    expect(res.body.createdBy.displayName).toBe('Serendib Trading Company (Demo) Admin');
  });
});

describe('POST /credentials – pending KYC credential', () => {
  it('creates a pending KYC credential with a 2-year default expiry', async () => {
    const before = new Date();
    const res = await createCredential(tokens.bankOfficer, { holderId: holderIds['KYC-REC-0001'] });
    const after = new Date();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      issuerId: 'bank-a',
      credentialType: 'KYCCredential',
      vct: 'urn:univault:vct:KYCCredential:1',
      status: 'pending',
    });
    expectExpiryBetween(res.body.expiresAt, before, after, 'P2Y');
    expect((await recordOf(res.body.id)).claimsSnapshot.age_over_18).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('signCredential – Employment credential', () => {
  let credentialId: string;
  let wallet: ReturnType<typeof walletKey>;
  let sdJwt: string;

  beforeAll(async () => {
    const res = await getCredentials(
      tokens.employerOfficer,
      `?holderId=${holderIds['STC-00001']}&status=pending`,
    );
    credentialId = res.body.credentials[0].id;
    wallet = walletKey();
    const signed = await sign(credentialId, wallet.publicJwk);
    sdJwt = signed.sdJwt;
    expect(signed.credential).toMatchObject({ id: credentialId, status: 'valid' });
  });

  it('verifies with the issuer key published in the JWKS (picked by the header kid)', async () => {
    const { header, result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    expect(header).toMatchObject({ kid: employerKids[0], typ: 'dc+sd-jwt' });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('carries every envelope claim, visible in the signed payload', async () => {
    const { result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    const row = await recordOf(credentialId);
    expect(result.payload).toMatchObject({
      iss: `${BASE_URL}/api/v1/issuers/employer-a`,
      issuer_name: 'Serendib Trading Company (Demo)',
      vct: 'urn:univault:vct:EmploymentCredential:1',
      schema_version: '1.0',
      jti: credentialId,
      iat: Math.floor(row.issuedAt!.getTime() / 1000),
      exp: Math.floor(row.expiresAt.getTime() / 1000),
      status: { status_uri: `${BASE_URL}/api/v1/status/${credentialId}` },
      _sd_alg: 'sha-256',
    });
    expect(result.payload).not.toHaveProperty('kyc_verification_date');
  });

  it('binds the credential to the wallet key: cnf.jwk equals the wallet public key', async () => {
    const { result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    expect(result.payload?.cnf).toEqual({ jwk: wallet.publicJwk });
  });

  it('makes every subject claim a disclosure, not a visible payload claim', async () => {
    const { result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    for (const name of Object.keys(EMPLOYEE_CLAIMS))
      expect(result.payload).not.toHaveProperty(name);
    expect(result.payload?._sd).toHaveLength(Object.keys(EMPLOYEE_CLAIMS).length);

    const decoded = decodeDisclosures(sdJwt);
    expect(decoded.valid).toBe(true);
    expect(Object.fromEntries(decoded.disclosures.map((d) => [d.name, d.value]))).toEqual(
      EMPLOYEE_CLAIMS,
    );
  });

  it('updates the record to valid with the signing key and the wallet key thumbprint', async () => {
    const row = await recordOf(credentialId);
    expect(row.status).toBe('valid');
    expect(row.issuerKid).toBe(employerKids[0]);
    expect(row.issuedAt).toBeInstanceOf(Date);
    expect(row.statusUpdatedAt).toEqual(row.issuedAt);
    // RFC 7638 thumbprint, cross-checked with jose's independent implementation
    expect(row.holderKeyThumbprint).toBe(await calculateJwkThumbprint(wallet.publicJwk, 'sha256'));
  });

  it('shows the credential as valid through GET /credentials/:id', async () => {
    const res = await getCredentials(tokens.employerOfficer, `/${credentialId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'valid', issuerKid: employerKids[0] });
    expect(res.body.issuedAt).not.toBeNull();
  });

  it('never signs the same credential twice (409 CREDENTIAL_NOT_PENDING)', async () => {
    await expect(signer.signCredential(credentialId, walletKey().publicJwk)).rejects.toMatchObject({
      status: 409,
      code: 'CREDENTIAL_NOT_PENDING',
    });
    // The first binding is untouched
    expect((await recordOf(credentialId)).holderKeyThumbprint).toBe(
      await calculateJwkThumbprint(wallet.publicJwk, 'sha256'),
    );
  });

  it('allows only one of two simultaneous signing attempts', async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: await newEmployee('STC-80002'),
    });
    const outcomes = await Promise.allSettled([
      signer.signCredential(res.body.id, walletKey().publicJwk),
      signer.signCredential(res.body.id, walletKey().publicJwk),
    ]);
    for (const o of outcomes) if (o.status === 'fulfilled') issuedSdJwts.push(o.value.sdJwt);
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find((o) => o.status === 'rejected')).toMatchObject({
      reason: { status: 409, code: 'CREDENTIAL_NOT_PENDING' },
    });
  });
});

describe('signCredential – KYC credential', () => {
  let credentialId: string;
  let createdAt: string;
  let sdJwt: string;
  const wallet = walletKey();

  beforeAll(async () => {
    const res = await getCredentials(
      tokens.bankOfficer,
      `?holderId=${holderIds['KYC-REC-0001']}&status=pending`,
    );
    credentialId = res.body.credentials[0].id;
    createdAt = res.body.credentials[0].createdAt;
    sdJwt = (await sign(credentialId, wallet.publicJwk)).sdJwt;
  });

  it('verifies, with the KYC envelope including kyc_verification_date', async () => {
    const { result } = await verifyAgainstJwks(sdJwt, 'bank-a');
    expect(result.valid).toBe(true);
    expect(result.payload).toMatchObject({
      iss: `${BASE_URL}/api/v1/issuers/bank-a`,
      issuer_name: 'UniVault Demo Bank',
      vct: 'urn:univault:vct:KYCCredential:1',
      schema_version: '1.0',
      jti: credentialId,
      cnf: { jwk: wallet.publicJwk },
      status: { status_uri: `${BASE_URL}/api/v1/status/${credentialId}` },
      kyc_verification_date: createdAt.slice(0, 10),
    });
  });

  it("discloses the customer's claims, including the derived age_over_18", async () => {
    const { result } = await verifyAgainstJwks(sdJwt, 'bank-a');
    for (const name of Object.keys(CUSTOMER_CLAIMS))
      expect(result.payload).not.toHaveProperty(name);
    const decoded = decodeDisclosures(sdJwt);
    expect(decoded.valid).toBe(true);
    const disclosed = Object.fromEntries(decoded.disclosures.map((d) => [d.name, d.value]));
    expect(disclosed).toEqual({ ...CUSTOMER_CLAIMS, age_over_18: true });
    expect(disclosed.permanent_address).toEqual(CUSTOMER_CLAIMS.permanent_address); // one unit
  });
});

// ---------------------------------------------------------------------------
describe('signCredential – the holder key must be an EC P-256 public JWK', () => {
  let pendingId: string;

  beforeAll(async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: await newEmployee('STC-80003'),
    });
    pendingId = res.body.id;
  });

  it.each([
    ['a private key (contains "d")', () => walletKey().privateJwk],
    ['a P-384 key (wrong curve)', () => walletKey('P-384').publicJwk],
    [
      'an RSA key',
      () => generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ format: 'jwk' }),
    ],
    ['an EC key without y', () => ({ ...walletKey().publicJwk, y: undefined })],
    ['no key at all', () => undefined],
    ['a string', () => 'not-a-jwk'],
  ])('rejects %s with 400 INVALID_HOLDER_KEY', async (_label, makeKey) => {
    await expect(signer.signCredential(pendingId, makeKey())).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_HOLDER_KEY',
    });
  });

  it('rejects coordinates that are not a point on the P-256 curve', async () => {
    const jwk = walletKey().publicJwk;
    const y = Buffer.from(jwk.y!, 'base64url');
    y[31] = y[31]! ^ 1; // flip one bit
    await expect(
      signer.signCredential(pendingId, { ...jwk, y: y.toString('base64url') }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_HOLDER_KEY' });
  });

  it('leaves the credential pending and unsigned after every rejected key', async () => {
    expect(await recordOf(pendingId)).toMatchObject({
      status: 'pending',
      issuerKid: null,
      holderKeyThumbprint: null,
    });
  });

  it('copies only kty, crv, x and y into cnf.jwk (extra members are dropped)', async () => {
    const jwk = walletKey().publicJwk;
    const { sdJwt } = await sign(pendingId, { ...jwk, kid: 'wallet-1', alg: 'ES256' });
    const { result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    expect(result.payload?.cnf).toEqual({ jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y } });
  });

  it('returns 404 CREDENTIAL_NOT_FOUND for an unknown credential', async () => {
    await expect(signer.signCredential(UNKNOWN_ID, walletKey().publicJwk)).rejects.toMatchObject({
      status: 404,
      code: 'CREDENTIAL_NOT_FOUND',
    });
  });
});

describe('signCredential – refusals before signing', () => {
  let pendingId: string;

  beforeAll(async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: await newEmployee('STC-80004'),
    });
    pendingId = res.body.id;
  });

  it('refuses a pending credential whose expiry has passed (409 CREDENTIAL_EXPIRED)', async () => {
    const later = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: PASSPHRASE,
      }),
      publicBaseUrl: BASE_URL,
      now: () => new Date(Date.now() + 400 * DAY_MS), // past the 1-year expiry
    });
    await expect(later.signCredential(pendingId, walletKey().publicJwk)).rejects.toMatchObject({
      status: 409,
      code: 'CREDENTIAL_EXPIRED',
    });
  });

  it('refuses with KEY_DECRYPT_FAILED when no key passphrase is configured', async () => {
    const noPass = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: undefined,
      }),
      publicBaseUrl: BASE_URL,
    });
    // KeyStoreError: the API answers 503 ISSUER_KEY_UNAVAILABLE (test/key-store.test.ts)
    await expect(noPass.signCredential(pendingId, walletKey().publicJwk)).rejects.toMatchObject({
      name: 'KeyStoreError',
      code: 'KEY_DECRYPT_FAILED',
    });
  });

  it('refuses with KEY_DECRYPT_FAILED (no file paths) when the key cannot be decrypted', async () => {
    const wrongPass = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: 'a-different-passphrase',
      }),
      publicBaseUrl: BASE_URL,
    });
    const error = await wrongPass.signCredential(pendingId, walletKey().publicJwk).catch((e) => e);
    expect(error).toMatchObject({ name: 'KeyStoreError', code: 'KEY_DECRYPT_FAILED' });
    expect(String(error.message)).not.toContain(keysDir);
  });

  it('leaves the credential pending after each refusal', async () => {
    expect((await recordOf(pendingId)).status).toBe('pending');
  });
});

// ---------------------------------------------------------------------------
describe('expiry rules', () => {
  it('caps a KYC credential at the passport expiry date', async () => {
    const passportExpiry = isoDate(new Date(Date.now() + 200 * DAY_MS));
    const holderId = await newCustomer('CUS-PASS-001', {
      id_document_type: 'passport',
      id_document_number: 'N1234567',
      id_document_expiry: passportExpiry,
    });
    const res = await createCredential(tokens.bankOfficer, { holderId });
    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(midnightUtc(passportExpiry).toISOString());
  });

  it('keeps the 2-year default when the passport expires later than that', async () => {
    const holderId = await newCustomer('CUS-PASS-002', {
      id_document_type: 'passport',
      id_document_number: 'N7654321',
      id_document_expiry: isoDate(new Date(Date.now() + 5 * 365 * DAY_MS)),
    });
    const before = new Date();
    const res = await createCredential(tokens.bankOfficer, { holderId });
    expectExpiryBetween(res.body.expiresAt, before, new Date(), 'P2Y');
  });

  it('refuses a passport that has already expired (422 HOLDER_DATA_INVALID)', async () => {
    const holderId = await newCustomer('CUS-PASS-003', {
      id_document_type: 'passport',
      id_document_number: 'N1111111',
      id_document_expiry: isoDate(new Date(Date.now() - 10 * DAY_MS)),
    });
    const res = await createCredential(tokens.bankOfficer, { holderId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDER_DATA_INVALID');
    expect(res.body.error.details).toContainEqual({
      path: 'claims.id_document_expiry',
      message: 'the ID document has expired',
    });
  });

  it('caps an under-18 credential at the 18th birthday, with age_over_18 false', async () => {
    const today = new Date();
    const dob = isoDate(
      new Date(Date.UTC(today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate() + 30)),
    );
    const [y, m, d] = dob.split('-').map(Number) as [number, number, number];
    const eighteenth = new Date(Date.UTC(y + 18, m - 1, d));

    const holderId = await newCustomer('CUS-MINOR-01', { date_of_birth: dob });
    const res = await createCredential(tokens.bankOfficer, { holderId });
    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(eighteenth.toISOString());
    expect((await recordOf(res.body.id)).claimsSnapshot.age_over_18).toBe(false);

    const { sdJwt } = await sign(res.body.id, walletKey().publicJwk);
    const { result } = await verifyAgainstJwks(sdJwt, 'bank-a');
    expect(result.valid).toBe(true);
    expect(result.payload?.exp).toBe(eighteenth.getTime() / 1000);
    expect(result.claims?.age_over_18).toBe(false);
  });

  describe('addIsoDuration / computeExpiry', () => {
    const now = new Date('2026-11-20T10:30:00.000Z');

    it('adds years, months and days in UTC, clamping 29 February', () => {
      expect(addIsoDuration(now, 'P1Y').toISOString()).toBe('2027-11-20T10:30:00.000Z');
      expect(addIsoDuration(now, 'P2Y').toISOString()).toBe('2028-11-20T10:30:00.000Z');
      expect(addIsoDuration(now, 'P1M10D').toISOString()).toBe('2026-12-30T10:30:00.000Z');
      expect(addIsoDuration(new Date('2028-02-29T00:00:00Z'), 'P1Y').toISOString()).toBe(
        '2029-02-28T00:00:00.000Z',
      );
      expect(() => addIsoDuration(now, 'PT1H')).toThrow(/Unsupported/);
      expect(() => addIsoDuration(now, 'P')).toThrow(/Unsupported/);
    });

    it('takes the earliest of the default, the ID document expiry and the 18th birthday', () => {
      expect(computeExpiry(now, 'P2Y', {}).toISOString()).toBe('2028-11-20T10:30:00.000Z');
      expect(computeExpiry(now, 'P2Y', { id_document_expiry: '2027-03-01' }).toISOString()).toBe(
        '2027-03-01T00:00:00.000Z',
      );
      expect(
        computeExpiry(now, 'P2Y', {
          age_over_18: false,
          date_of_birth: '2009-01-15',
        }).toISOString(),
      ).toBe('2027-01-15T00:00:00.000Z');
      // age_over_18 true: the birthday is not a cap
      expect(
        computeExpiry(now, 'P2Y', { age_over_18: true, date_of_birth: '2000-01-15' }).toISOString(),
      ).toBe('2028-11-20T10:30:00.000Z');
    });
  });
});

// ---------------------------------------------------------------------------
describe('POST /credentials – rejections', () => {
  it('requires a login (401)', async () => {
    const res = track(
      await request(t.app).post('/api/v1/credentials').send({ holderId: holderIds['STC-00003'] }),
    );
    expect(res.status).toBe(401);
  });

  it("hides another issuer's holder (404 HOLDER_NOT_FOUND)", async () => {
    const fromBank = await createCredential(tokens.bankOfficer, {
      holderId: holderIds['STC-00003'],
    });
    expect(fromBank.status).toBe(404);
    expect(fromBank.body.error.code).toBe('HOLDER_NOT_FOUND');
    // employer-b's employee is invisible to employer-a too
    const otherEmployer = await createCredential(tokens.employerOfficer, {
      holderId: holderIds['LAT-00002'],
    });
    expect(otherEmployer.status).toBe(404);
    expect(await credentialCount(holderIds['STC-00003']!)).toBe(0);
  });

  it('returns 404 for a holder that does not exist', async () => {
    const res = await createCredential(tokens.employerOfficer, { holderId: UNKNOWN_ID });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('HOLDER_NOT_FOUND');
  });

  it("rejects a credentialType that does not match the issuer's type (400)", async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: holderIds['STC-00003'],
      credentialType: 'KYCCredential',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([
      { path: 'credentialType', message: 'must be EmploymentCredential for an employer' },
    ]);
  });

  it('rejects holder claims that no longer pass the credential schema (422)', async () => {
    const holderId = await newEmployee('STC-80005');
    // Simulate a record stored under an older schema: designation missing, unknown field added
    const { designation: _removed, ...claims } = EMPLOYEE_CLAIMS;
    await t.database.db
      .update(holders)
      .set({ claims: { ...claims, shoe_size: 42 } })
      .where(eq(holders.id, holderId));

    const res = await createCredential(tokens.employerOfficer, { holderId });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDER_DATA_INVALID');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'claims.designation', message: 'is required' },
        { path: 'claims.shoe_size', message: 'is not allowed by the credential schema' },
      ]),
    );
    expect(await credentialCount(holderId)).toBe(0);
  });

  it('rejects a second credential while one is pending (409 ACTIVE_CREDENTIAL_EXISTS)', async () => {
    const holderId = await newEmployee('STC-80006');
    const first = await createCredential(tokens.employerOfficer, { holderId });
    expect(first.status).toBe(201);
    const second = await createCredential(tokens.employerOfficer, { holderId });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'ACTIVE_CREDENTIAL_EXISTS',
      details: { credentialId: first.body.id },
    });
  });

  it('rejects a new credential while a valid one exists (409)', async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: holderIds['STC-00001'], // signed above
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACTIVE_CREDENTIAL_EXISTS');
  });

  it('serialises simultaneous requests for one holder: only one credential is created', async () => {
    const holderId = await newEmployee('STC-80007');
    const results = await Promise.all([
      createCredential(tokens.employerOfficer, { holderId }),
      createCredential(tokens.employerOfficer, { holderId }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await credentialCount(holderId)).toBe(1);
  });

  it('requires the issuer to have an active signing key (409 ISSUER_KEY_MISSING)', async () => {
    const res = await createCredential(await t.tokenFor(EMPLOYER_B_OFFICER), {
      holderId: holderIds['LAT-00002'],
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ISSUER_KEY_MISSING');
    expect(res.body.error.message).toContain('npm run keys:init');
    expect(await credentialCount(holderIds['LAT-00002']!)).toBe(0);
  });

  it.each([
    ['a holderId that is not a UUID', { holderId: 'P0001' }, 'holderId'],
    ['a missing holderId', {}, 'holderId'],
    [
      'an unknown credentialType',
      { holderId: UNKNOWN_ID, credentialType: 'Passport' },
      'credentialType',
    ],
  ])('rejects %s (400 VALIDATION_ERROR)', async (_label, body, path) => {
    const res = await createCredential(tokens.employerOfficer, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
  });

  it('ignores an issuerId in the body: the issuer always comes from the login', async () => {
    const res = await createCredential(tokens.bankOfficer, {
      holderId: holderIds['KYC-REC-0002'],
      issuerId: 'employer-a',
    });
    expect(res.status).toBe(201);
    expect(res.body.issuerId).toBe('bank-a');
  });
});

// ---------------------------------------------------------------------------
describe('GET /credentials and /credentials/:id', () => {
  it('lists only the logged-in issuer’s credentials, newest first, with paging', async () => {
    const all = await getCredentials(tokens.employerOfficer, '?limit=100');
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(all.body.credentials.length);
    expect(all.body.total).toBeGreaterThan(3);
    expect(
      all.body.credentials.every((c: { issuerId: string }) => c.issuerId === 'employer-a'),
    ).toBe(true);
    const created = all.body.credentials.map((c: { createdAt: string }) => c.createdAt);
    expect([...created].sort().reverse()).toEqual(created);

    const page = await getCredentials(tokens.employerOfficer, '?limit=2&offset=1');
    expect(page.body).toMatchObject({ limit: 2, offset: 1, total: all.body.total });
    expect(page.body.credentials.map((c: { id: string }) => c.id)).toEqual(
      all.body.credentials.slice(1, 3).map((c: { id: string }) => c.id),
    );
  });

  it('filters by status and by holder', async () => {
    const valid = await getCredentials(tokens.employerOfficer, '?status=valid&limit=100');
    expect(valid.body.credentials.length).toBeGreaterThan(0);
    expect(valid.body.credentials.every((c: { status: string }) => c.status === 'valid')).toBe(
      true,
    );

    const forHolder = await getCredentials(
      tokens.employerOfficer,
      `?holderId=${holderIds['STC-00001']}`,
    );
    expect(forHolder.body.total).toBe(1);
    expect(forHolder.body.credentials[0].holder.externalRef).toBe('STC-00001');

    // Another issuer's holder gives an empty list, not their credentials
    const otherIssuer = await getCredentials(
      tokens.bankOfficer,
      `?holderId=${holderIds['STC-00001']}`,
    );
    expect(otherIssuer.body).toMatchObject({ credentials: [], total: 0 });
  });

  it('returns one credential’s metadata to its issuer', async () => {
    const list = await getCredentials(tokens.bankOfficer, '?limit=1');
    const res = await getCredentials(tokens.bankOfficer, `/${list.body.credentials[0].id}`);
    expect(res.status).toBe(200);
    // The detail adds activeOffer; the list row has hasActiveOffer instead
    const { hasActiveOffer, ...row } = list.body.credentials[0];
    expect(hasActiveOffer).toBe(false);
    expect(res.body).toEqual({ ...row, activeOffer: null });
  });

  it("hides another issuer's credential (404 CREDENTIAL_NOT_FOUND)", async () => {
    const bankList = await getCredentials(tokens.bankOfficer, '?limit=1');
    const res = await getCredentials(tokens.employerOfficer, `/${bankList.body.credentials[0].id}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('requires a login (401)', async () => {
    expect((await request(t.app).get('/api/v1/credentials')).status).toBe(401);
    expect((await request(t.app).get(`/api/v1/credentials/${UNKNOWN_ID}`)).status).toBe(401);
  });

  it.each([
    ['/not-a-uuid', 'credentialId'],
    ['?status=active', 'status'],
    ['?holderId=STC-00001', 'holderId'],
    ['?limit=500', 'limit'],
  ])('rejects invalid input %s (400)', async (path, field) => {
    const res = await getCredentials(tokens.employerOfficer, path);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe(field);
  });
});

// ---------------------------------------------------------------------------
describe('key rotation', () => {
  it('signs with the NEW active key after rotation; old and new credentials both verify', async () => {
    const res = await createCredential(tokens.employerOfficer, {
      holderId: await newEmployee('STC-80008'),
    });
    employerKids.push(await generateKey('employer-a', tokens.employerAdmin)); // rotate

    const { sdJwt } = await sign(res.body.id, walletKey().publicJwk);
    const { header, jwks, result } = await verifyAgainstJwks(sdJwt, 'employer-a');
    expect(header.kid).toBe(employerKids[1]);
    expect(header.kid).not.toBe(employerKids[0]);
    expect(result.valid).toBe(true);
    expect(jwks.keys.map((k) => k.kid)).toEqual([employerKids[1], employerKids[0]]);
    expect((await recordOf(res.body.id)).issuerKid).toBe(employerKids[1]);

    // A credential signed before the rotation still verifies with the retired key
    const old = issuedSdJwts[0]!;
    const before = await verifyAgainstJwks(old, 'employer-a');
    expect(before.header.kid).toBe(employerKids[0]);
    expect(before.result.valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('privacy', () => {
  const secretsAndClaims = () => {
    const nic = String(EMPLOYEE_CLAIMS.nic_number);
    const customerNic = String(CUSTOMER_CLAIMS.id_document_number);
    return [
      PASSPHRASE,
      'PRIVATE KEY',
      nic,
      customerNic,
      String(CUSTOMER_CLAIMS.date_of_birth),
      String(CUSTOMER_CLAIMS.mobile_number),
      String((CUSTOMER_CLAIMS.permanent_address as { line1: string }).line1),
      String(EMPLOYEE_CLAIMS.designation),
      // every issued SD-JWT, and each issuer-signed JWT inside it
      ...issuedSdJwts.flatMap((s) => [s, s.split('~')[0]!]),
    ];
  };

  it('issued at least one SD-JWT during this test file', () => {
    expect(issuedSdJwts.length).toBeGreaterThan(4);
  });

  it('API responses contain no SD-JWT, private key, passphrase or personal claims', () => {
    const all = responses.join('\n');
    for (const value of secretsAndClaims()) expect(all).not.toContain(value);
  });

  it('logs contain no SD-JWT, key material, passphrase, names or claims – only IDs', () => {
    const all = JSON.stringify(logs());
    expect(all).toContain('Pending credential created');
    for (const value of [...secretsAndClaims(), 'Lahiru Silva', String(CUSTOMER_CLAIMS.full_name)])
      expect(all).not.toContain(value);
  });

  it('does not store the signed SD-JWT in the database', async () => {
    const rows = JSON.stringify(
      await t.database.db
        .select()
        .from(credentialRecords)
        .where(
          and(eq(credentialRecords.issuerId, 'employer-a'), eq(credentialRecords.status, 'valid')),
        ),
    );
    for (const sdJwt of issuedSdJwts) {
      const [jwt, ...disclosures] = sdJwt.split('~');
      expect(rows).not.toContain(jwt!.split('.')[2]); // signature
      for (const d of disclosures.filter(Boolean)) expect(rows).not.toContain(d);
    }
  });
});
