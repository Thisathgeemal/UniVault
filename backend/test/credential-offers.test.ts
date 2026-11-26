import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialOffers, credentialRecords, holders, issuerStaff } from '../src/db/schema.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import type { StaffProfile } from '../src/auth/auth-service.js';
import { loadConfig } from '../src/config/env.js';
import {
  createCredentialOffersService,
  OFFER_INVALIDATION_REASONS,
  offerStatus,
  PRE_AUTHORIZED_CODE_GRANT,
  type CredentialOffersService,
} from '../src/services/credential-offers.service.js';
import { createCredentialsService } from '../src/services/credentials.service.js';
import { dbError } from './db/helpers.js';
import { createKeyStore } from '../src/keys/key-store.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://192.168.1.20:4000'; // a LAN address, as a phone needs in Sprint 2
const QR_PREFIX = 'openid-credential-offer://?credential_offer=';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
/** The configured default offer lifetime (config.test.ts pins the value itself). */
const DEFAULT_TTL = testConfig().CREDENTIAL_OFFER_TTL_SECONDS;

const EMPLOYEE_CLAIMS = (
  JSON.parse(
    readFileSync(new URL('./fixtures/seed-data/employees.json', import.meta.url), 'utf8'),
  ) as { records: { claims: Record<string, unknown> }[] }
).records[0]!.claims;

let keysDir: string;
let t: AuthedTestApp;
let logs: () => Record<string, unknown>[];
let offersService: CredentialOffersService;
let tokens: Record<'employerOfficer' | 'employerAdmin' | 'bankOfficer' | 'bankAdmin', string>;
let holderIds: Record<string, string>;

// Every plain code issued, and every GET response – checked by the privacy tests
const issuedCodes: string[] = [];
const getResponses: string[] = [];

const sha256 = (code: string) => createHash('sha256').update(code).digest('base64url');
const codeOf = (body: {
  credentialOffer: Record<string, Record<string, Record<string, string>>>;
}) => body.credentialOffer.grants![PRE_AUTHORIZED_CODE_GRANT]!['pre-authorized_code']!;

async function createOffer(token: string, credentialId: unknown, app = t.app) {
  const res = await request(app)
    .post('/api/v1/credential-offers')
    .set('Authorization', `Bearer ${token}`)
    .send({ credentialId });
  if (res.status === 201) issuedCodes.push(codeOf(res.body));
  return res;
}

async function getOffer(token: string, offerId: string) {
  const res = await request(t.app)
    .get(`/api/v1/credential-offers/${offerId}`)
    .set('Authorization', `Bearer ${token}`);
  getResponses.push(res.text);
  return res;
}

async function pendingCredential(token: string, holderId: string, app = t.app) {
  const res = await request(app)
    .post('/api/v1/credentials')
    .set('Authorization', `Bearer ${token}`)
    .send({ holderId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

let employeeCounter = 0;
/** A new employee at employer-a with a pending Employment credential. */
async function newPendingEmployment() {
  employeeCounter += 1;
  const holder = await request(t.app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${tokens.employerOfficer}`)
    .send({
      claims: {
        ...EMPLOYEE_CLAIMS,
        employee_id: `STC-7${String(employeeCounter).padStart(4, '0')}`,
      },
    });
  expect(holder.status).toBe(201);
  return pendingCredential(tokens.employerOfficer, holder.body.id);
}

const offerRow = async (offerId: string) =>
  (await t.database.db.select().from(credentialOffers).where(eq(credentialOffers.id, offerId)))[0]!;

const walletJwk = () =>
  generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-offers-'));
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
  for (const [issuerId, token] of [
    ['employer-a', employerAdmin],
    ['bank-a', bankAdmin],
  ] as const) {
    const res = await request(t.app)
      .post(`/api/v1/issuers/${issuerId}/keys`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
  }
  offersService = createCredentialOffersService(t.database.db, {
    ttlSeconds: DEFAULT_TTL,
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
describe('POST /credential-offers – Employment credential', () => {
  let credentialId: string;
  let res: request.Response;
  let before: number;
  let after: number;

  beforeAll(async () => {
    credentialId = await pendingCredential(tokens.employerOfficer, holderIds['STC-00001']!);
    before = Date.now();
    res = await createOffer(tokens.employerOfficer, credentialId);
    after = Date.now();
  });

  it('returns 201 with a Location header and Cache-Control: no-store', () => {
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/credential-offers/${res.body.offerId}`);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('returns exactly the documented fields', async () => {
    expect(Object.keys(res.body).sort()).toEqual(
      [
        'credentialId',
        'credentialOffer',
        'credentialType',
        'expiresAt',
        'expiresInSeconds',
        'holder',
        'offerId',
        'qrContent',
        'serverTime',
        'status',
      ].sort(),
    );
    expect(res.body).toMatchObject({
      credentialId,
      credentialType: 'EmploymentCredential',
      holder: { id: holderIds['STC-00001'], fullName: 'Lahiru Silva', externalRef: 'STC-00001' },
      status: 'active',
      expiresInSeconds: DEFAULT_TTL,
    });
    expect(res.body.offerId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the server time (ISO) for the portal to correct for clock skew', () => {
    const serverTime = Date.parse(res.body.serverTime);
    expect(res.body.serverTime).toBe(new Date(serverTime).toISOString());
    expect(serverTime).toBeGreaterThanOrEqual(before);
    expect(serverTime).toBeLessThanOrEqual(after);
    // expiresAt - serverTime is exactly the TTL the portal counts down
    expect(Date.parse(res.body.expiresAt) - serverTime).toBe(DEFAULT_TTL * 1000);
  });

  it('carries a 256-bit pre-authorised code: 43 base64url characters', () => {
    const code = codeOf(res.body);
    expect(code).toMatch(CODE_PATTERN);
    expect(Buffer.from(code, 'base64url')).toHaveLength(32);
  });

  it('builds the OpenID4VCI credential offer exactly', () => {
    expect(res.body.credentialOffer).toEqual({
      credential_issuer: `${BASE_URL}/api/v1/issuers/employer-a`,
      credential_configuration_ids: ['EmploymentCredential'],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': codeOf(res.body),
        },
      },
    });
  });

  it('puts the same offer, URL-encoded, in qrContent', () => {
    const qr = res.body.qrContent as string;
    expect(qr.startsWith(QR_PREFIX)).toBe(true);
    const encoded = qr.slice(QR_PREFIX.length);
    expect(encoded).not.toMatch(/[{}"\s]/); // fully encoded
    expect(JSON.parse(decodeURIComponent(encoded))).toEqual(res.body.credentialOffer);
    // A standard URL parser reads it back the same way
    expect(JSON.parse(new URL(qr).searchParams.get('credential_offer')!)).toEqual(
      res.body.credentialOffer,
    );
  });

  it('expires CREDENTIAL_OFFER_TTL_SECONDS (the default) after creation', () => {
    const expiresAt = new Date(res.body.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + DEFAULT_TTL * 1000);
    expect(expiresAt).toBeLessThanOrEqual(after + DEFAULT_TTL * 1000);
  });

  it('stores only the SHA-256 hash of the code, with the staff member who created it', async () => {
    const code = codeOf(res.body);
    const row = await offerRow(res.body.offerId);
    expect(row.preAuthorizedCodeHash).toBe(sha256(code));
    expect(row.preAuthorizedCodeHash).toMatch(CODE_PATTERN);
    expect(row).toMatchObject({
      credentialId,
      redeemedAt: null,
      redeemedWalletThumbprint: null,
      invalidatedAt: null,
      failedAttempts: 0,
    });
    const [officer] = await t.database.db
      .select({ id: issuerStaff.id })
      .from(issuerStaff)
      .where(eq(issuerStaff.email, STAFF.employerOfficer));
    expect(row.createdByStaffId).toBe(officer!.id);
    expect(row.expiresAt.toISOString()).toBe(res.body.expiresAt);
  });

  it('never stores the plain code anywhere in credential_offers', async () => {
    const everything = JSON.stringify(
      ((await t.database.db.execute(sql`select * from credential_offers`)) as { rows: unknown[] })
        .rows,
    );
    for (const code of issuedCodes) expect(everything).not.toContain(code);
  });
});

describe('POST /credential-offers – KYC credential', () => {
  it('creates an offer for a pending KYC credential at the bank', async () => {
    const credentialId = await pendingCredential(tokens.bankOfficer, holderIds['KYC-REC-0001']!);
    const res = await createOffer(tokens.bankOfficer, credentialId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      credentialType: 'KYCCredential',
      holder: { externalRef: 'KYC-REC-0001' },
      status: 'active',
    });
    expect(
      checkOpenId4VciOffer(res.body.credentialOffer, {
        allowHttp: true,
        credentialType: 'KYCCredential',
      }),
    ).toEqual([]);
    expect(res.body.credentialOffer).toEqual({
      credential_issuer: `${BASE_URL}/api/v1/issuers/bank-a`,
      credential_configuration_ids: ['KYCCredential'],
      grants: { [PRE_AUTHORIZED_CODE_GRANT]: { 'pre-authorized_code': codeOf(res.body) } },
    });
    expect((await offerRow(res.body.offerId)).preAuthorizedCodeHash).toBe(sha256(codeOf(res.body)));
  });

  it('lets admins create offers too', async () => {
    const credentialId = await pendingCredential(tokens.bankAdmin, holderIds['KYC-REC-0002']!);
    expect((await createOffer(tokens.bankAdmin, credentialId)).status).toBe(201);
  });
});

describe('offer expiry', () => {
  it('uses CREDENTIAL_OFFER_TTL_SECONDS from the configuration', async () => {
    const short = await authedTestApp({
      ISSUER_KEYS_DIR: keysDir,
      ISSUER_KEY_PASSPHRASE: PASSPHRASE,
      CREDENTIAL_OFFER_TTL_SECONDS: '60',
    });
    const admin = await short.tokenFor(STAFF.employerAdmin);
    await request(short.app)
      .post('/api/v1/issuers/employer-a/keys')
      .set('Authorization', `Bearer ${admin}`);
    const [holder] = await short.database.db
      .select({ id: holders.id })
      .from(holders)
      .where(eq(holders.externalRef, 'STC-00003'));
    const credentialId = await pendingCredential(admin, holder!.id, short.app);

    const before = Date.now();
    const res = await createOffer(admin, credentialId, short.app);
    expect(res.status).toBe(201);
    expect(res.body.expiresInSeconds).toBe(60);
    const expiresAt = new Date(res.body.expiresAt).getTime();
    expect(expiresAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 60_000);
    await short.database.close();
  });

  it('never lets an offer outlive its credential', async () => {
    const credentialId = await newPendingEmployment();
    const credentialExpiry = new Date(Date.now() + 120_000);
    await t.database.db
      .update(credentialRecords)
      .set({ expiresAt: credentialExpiry })
      .where(eq(credentialRecords.id, credentialId));
    const res = await createOffer(tokens.employerOfficer, credentialId);
    expect(res.status).toBe(201);
    expect(res.body.expiresAt).toBe(credentialExpiry.toISOString());
    expect(res.body.expiresInSeconds).toBeLessThanOrEqual(120);
  });
});

// ---------------------------------------------------------------------------
describe('one usable offer per credential', () => {
  it('gives every offer a different code and hash', async () => {
    const credentialId = await newPendingEmployment();
    const a = await createOffer(tokens.employerOfficer, credentialId);
    const b = await createOffer(tokens.employerOfficer, credentialId);
    expect(codeOf(a.body)).not.toBe(codeOf(b.body));
    const [rowA, rowB] = await Promise.all([offerRow(a.body.offerId), offerRow(b.body.offerId)]);
    expect(rowA.preAuthorizedCodeHash).not.toBe(rowB.preAuthorizedCodeHash);
  });

  it('invalidates the earlier offer when a new one is created', async () => {
    const credentialId = await newPendingEmployment();
    const first = await createOffer(tokens.employerOfficer, credentialId);
    const second = await createOffer(tokens.employerOfficer, credentialId);

    const firstStatus = await getOffer(tokens.employerOfficer, first.body.offerId);
    expect(firstStatus.body.status).toBe('invalidated');
    expect(firstStatus.body.invalidationReason).toBe('replaced');
    expect(firstStatus.body.invalidatedAt).toBe(second.body.serverTime);
    expect((await offerRow(first.body.offerId)).invalidationReason).toBe('replaced');
    expect((await getOffer(tokens.employerOfficer, second.body.offerId)).body.status).toBe(
      'active',
    );
    // The earlier code no longer leads to a usable offer
    expect((await offersService.findOfferByCode(codeOf(first.body)))?.status).toBe('invalidated');
  });

  it('leaves an already-expired earlier offer as expired, not invalidated', async () => {
    const credentialId = await newPendingEmployment();
    const old = await createOffer(tokens.employerOfficer, credentialId);
    await t.database.db
      .update(credentialOffers)
      .set({
        createdAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(credentialOffers.id, old.body.offerId));
    await createOffer(tokens.employerOfficer, credentialId);
    expect((await getOffer(tokens.employerOfficer, old.body.offerId)).body.status).toBe('expired');
    expect((await offerRow(old.body.offerId)).invalidatedAt).toBeNull();
  });

  it('serialises simultaneous requests: exactly one offer stays usable', async () => {
    const credentialId = await newPendingEmployment();
    const results = await Promise.all([
      createOffer(tokens.employerOfficer, credentialId),
      createOffer(tokens.employerOfficer, credentialId),
      createOffer(tokens.employerOfficer, credentialId),
    ]);
    expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
    const rows = await t.database.db
      .select()
      .from(credentialOffers)
      .where(eq(credentialOffers.credentialId, credentialId));
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.invalidatedAt === null)).toHaveLength(1);
  });

  it('is backed by a database rule: an offer cannot be both redeemed and invalidated', async () => {
    const credentialId = await newPendingEmployment();
    const res = await createOffer(tokens.employerOfficer, credentialId);
    const message = await dbError(
      t.database.db
        .update(credentialOffers)
        .set({
          redeemedAt: new Date(),
          redeemedWalletThumbprint: 'x'.repeat(43),
          invalidatedAt: new Date(),
          invalidationReason: 'replaced',
        })
        .where(eq(credentialOffers.id, res.body.offerId)),
    );
    expect(message).toMatch(/credential_offers_not_both_redeemed_and_invalidated/);
  });
});

// ---------------------------------------------------------------------------
describe('GET /credential-offers/:offerId – status tracking', () => {
  let offerId: string;
  let credentialId: string;
  let code: string;

  beforeAll(async () => {
    credentialId = await newPendingEmployment();
    const res = await createOffer(tokens.employerOfficer, credentialId);
    offerId = res.body.offerId;
    code = codeOf(res.body);
  });

  it('starts active, with the credential still pending', async () => {
    const res = await getOffer(tokens.employerOfficer, offerId);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      offerId,
      credentialId,
      credentialType: 'EmploymentCredential',
      credentialStatus: 'pending',
      status: 'active',
      redeemedAt: null,
      invalidatedAt: null,
      invalidationReason: null,
      createdBy: { displayName: 'Serendib Trading Company (Demo) Officer' },
    });
    expect(Math.abs(Date.parse(res.body.serverTime) - Date.now())).toBeLessThan(5000);
    expect(res.body.holder).toMatchObject({ externalRef: expect.stringMatching(/^STC-7/) });
  });

  it('shows expired once expires_at has passed', async () => {
    await t.database.db
      .update(credentialOffers)
      .set({
        createdAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(credentialOffers.id, offerId));
    expect((await getOffer(tokens.employerOfficer, offerId)).body.status).toBe('expired');
  });

  it('shows redeemed once redeemed – redeemed wins over expired', async () => {
    const redeemedAt = new Date(Date.now() - 15 * 60_000); // redeemed before it expired
    await t.database.db
      .update(credentialOffers)
      .set({ redeemedAt, redeemedWalletThumbprint: 'w'.repeat(43) })
      .where(eq(credentialOffers.id, offerId));
    const res = await getOffer(tokens.employerOfficer, offerId);
    expect(res.body).toMatchObject({ status: 'redeemed', redeemedAt: redeemedAt.toISOString() });
  });

  it('never returns the code or its hash', async () => {
    const row = await offerRow(offerId);
    for (const text of getResponses) {
      expect(text).not.toContain(code);
      expect(text).not.toContain(row.preAuthorizedCodeHash);
      expect(text).not.toMatch(/pre-?authori[sz]ed/i);
    }
  });

  it('works out the status in the documented order', () => {
    const at = new Date('2026-11-20T10:00:00Z');
    const past = new Date('2026-11-20T09:00:00Z');
    const future = new Date('2026-11-20T11:00:00Z');
    expect(offerStatus({ redeemedAt: null, invalidatedAt: null, expiresAt: future }, at)).toBe(
      'active',
    );
    expect(offerStatus({ redeemedAt: null, invalidatedAt: null, expiresAt: at }, at)).toBe(
      'expired',
    );
    expect(offerStatus({ redeemedAt: null, invalidatedAt: past, expiresAt: past }, at)).toBe(
      'invalidated',
    );
    expect(offerStatus({ redeemedAt: past, invalidatedAt: null, expiresAt: past }, at)).toBe(
      'redeemed',
    );
  });
});

// ---------------------------------------------------------------------------
describe('findOfferByCode (for Sprint 2 redemption)', () => {
  let code: string;
  let offerId: string;

  beforeAll(async () => {
    const res = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    code = codeOf(res.body);
    offerId = res.body.offerId;
  });

  it('finds the offer by its code, through the hash', async () => {
    const found = await offersService.findOfferByCode(code);
    expect(found).toMatchObject({
      offerId,
      issuerId: 'employer-a',
      status: 'active',
      redeemedAt: null,
      invalidatedAt: null,
      failedAttempts: 0,
    });
    expect(JSON.stringify(found)).not.toContain((await offerRow(offerId)).preAuthorizedCodeHash);
  });

  it('returns null for a wrong code', async () => {
    expect(await offersService.findOfferByCode(randomBytes(32).toString('base64url'))).toBeNull();
    // The stored hash itself is not a valid code
    expect(
      await offersService.findOfferByCode((await offerRow(offerId)).preAuthorizedCodeHash),
    ).toBeNull();
  });

  it.each([['abc'], [''], [`${'A'.repeat(42)}+`], [null], [42], [undefined]])(
    'returns null for a malformed code (%j)',
    async (bad) => {
      expect(await offersService.findOfferByCode(bad)).toBeNull();
    },
  );
});

// ---------------------------------------------------------------------------
describe('rejections', () => {
  it('requires a login (401)', async () => {
    expect(
      (await request(t.app).post('/api/v1/credential-offers').send({ credentialId: UNKNOWN_ID }))
        .status,
    ).toBe(401);
    expect((await request(t.app).get(`/api/v1/credential-offers/${UNKNOWN_ID}`)).status).toBe(401);
  });

  it("hides another issuer's credential (404 CREDENTIAL_NOT_FOUND)", async () => {
    const credentialId = await newPendingEmployment();
    const res = await createOffer(tokens.bankOfficer, credentialId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
    const rows = await t.database.db
      .select()
      .from(credentialOffers)
      .where(eq(credentialOffers.credentialId, credentialId));
    expect(rows).toHaveLength(0);
  });

  it('returns 404 for an unknown credential and 400 for a malformed ID', async () => {
    const unknown = await createOffer(tokens.employerOfficer, UNKNOWN_ID);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
    for (const bad of ['not-a-uuid', undefined, 42]) {
      const res = await createOffer(tokens.employerOfficer, bad);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(res.body.error.details[0].path).toBe('credentialId');
    }
  });

  it('refuses a credential that is no longer pending (409 CREDENTIAL_NOT_PENDING)', async () => {
    const credentialId = await newPendingEmployment();
    const signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: PASSPHRASE,
      }),
      publicBaseUrl: BASE_URL,
    });
    await signer.signCredential(credentialId, walletJwk());
    const res = await createOffer(tokens.employerOfficer, credentialId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CREDENTIAL_NOT_PENDING');
  });

  it('refuses a revoked credential (409 CREDENTIAL_NOT_PENDING): offers are for pending only', async () => {
    const credentialId = await newPendingEmployment();
    const revoke = await request(t.app)
      .post(`/api/v1/credentials/${credentialId}/revoke`)
      .set('Authorization', `Bearer ${tokens.employerAdmin}`)
      .send({ reason: 'issued_in_error' });
    expect(revoke.status).toBe(200);
    const res = await createOffer(tokens.employerOfficer, credentialId);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CREDENTIAL_NOT_PENDING',
      message: 'Only a pending credential can be offered (this one is revoked)',
    });
  });

  it('refuses an expired credential (409 CREDENTIAL_EXPIRED)', async () => {
    const credentialId = await newPendingEmployment();
    await t.database.db
      .update(credentialRecords)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(credentialRecords.id, credentialId));
    const res = await createOffer(tokens.employerOfficer, credentialId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CREDENTIAL_EXPIRED');
  });

  it("hides another issuer's offer (404 OFFER_NOT_FOUND)", async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    const res = await getOffer(tokens.bankOfficer, offer.body.offerId);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('OFFER_NOT_FOUND');
  });

  it('returns 404 for an unknown offer and 400 for a malformed offer ID', async () => {
    expect((await getOffer(tokens.employerOfficer, UNKNOWN_ID)).status).toBe(404);
    const bad = await getOffer(tokens.employerOfficer, 'not-a-uuid');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('offerId');
  });
});

// ---------------------------------------------------------------------------
describe('POST /credential-offers/:offerId/cancel', () => {
  const cancel = async (token: string | null, offerId: string) => {
    const req = request(t.app).post(`/api/v1/credential-offers/${offerId}/cancel`);
    const res = await (token ? req.set('Authorization', `Bearer ${token}`) : req);
    getResponses.push(res.text);
    return res;
  };

  it('cancels an active offer: invalidated with reason "cancelled", the code stops working', async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    const res = await cancel(tokens.employerOfficer, offer.body.offerId);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      offerId: offer.body.offerId,
      status: 'invalidated',
      invalidationReason: 'cancelled',
      credentialStatus: 'pending',
    });
    expect(res.body.invalidatedAt).toBe(res.body.serverTime);
    expect((await offerRow(offer.body.offerId)).invalidationReason).toBe('cancelled');
    expect((await offersService.findOfferByCode(codeOf(offer.body)))?.status).toBe('invalidated');
    expect((await getOffer(tokens.employerOfficer, offer.body.offerId)).body).toMatchObject({
      status: 'invalidated',
      invalidationReason: 'cancelled',
    });
  });

  it('lets admins cancel, and a new offer can be created afterwards', async () => {
    const credentialId = await newPendingEmployment();
    const offer = await createOffer(tokens.employerOfficer, credentialId);
    expect((await cancel(tokens.employerAdmin, offer.body.offerId)).status).toBe(200);
    const next = await createOffer(tokens.employerOfficer, credentialId);
    expect(next.status).toBe(201);
    expect(next.body.status).toBe('active');
  });

  it('refuses an offer that is not active (409 OFFER_NOT_ACTIVE): replaced, cancelled, expired, redeemed', async () => {
    const credentialId = await newPendingEmployment();
    const first = await createOffer(tokens.employerOfficer, credentialId);
    const second = await createOffer(tokens.employerOfficer, credentialId); // replaces the first
    const replaced = await cancel(tokens.employerOfficer, first.body.offerId);
    expect(replaced.status).toBe(409);
    expect(replaced.body.error).toMatchObject({
      code: 'OFFER_NOT_ACTIVE',
      message: 'Only an active offer can be cancelled (this one is invalidated)',
      details: { status: 'invalidated' },
    });
    expect((await offerRow(first.body.offerId)).invalidationReason).toBe('replaced'); // kept

    expect((await cancel(tokens.employerOfficer, second.body.offerId)).status).toBe(200);
    const twice = await cancel(tokens.employerOfficer, second.body.offerId);
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('OFFER_NOT_ACTIVE');

    const third = await createOffer(tokens.employerOfficer, credentialId);
    await t.database.db
      .update(credentialOffers)
      .set({
        createdAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(credentialOffers.id, third.body.offerId));
    const expired = await cancel(tokens.employerOfficer, third.body.offerId);
    expect(expired.status).toBe(409);
    expect(expired.body.error.details).toEqual({ status: 'expired' });
    expect((await offerRow(third.body.offerId)).invalidatedAt).toBeNull();

    const fourth = await createOffer(tokens.employerOfficer, credentialId);
    await t.database.db
      .update(credentialOffers)
      .set({ redeemedAt: new Date(), redeemedWalletThumbprint: 'r'.repeat(43) })
      .where(eq(credentialOffers.id, fourth.body.offerId));
    const redeemed = await cancel(tokens.employerOfficer, fourth.body.offerId);
    expect(redeemed.status).toBe(409);
    expect(redeemed.body.error.details).toEqual({ status: 'redeemed' });
  });

  it('requires a login (401) and leaves the offer active', async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    expect((await cancel(null, offer.body.offerId)).status).toBe(401);
    expect((await offerRow(offer.body.offerId)).invalidatedAt).toBeNull();
  });

  it("hides another issuer's offer (404 OFFER_NOT_FOUND) and leaves it active", async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    for (const token of [tokens.bankOfficer, tokens.bankAdmin]) {
      const res = await cancel(token, offer.body.offerId);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('OFFER_NOT_FOUND');
    }
    expect((await offerRow(offer.body.offerId)).invalidatedAt).toBeNull();
  });

  it('returns 404 for an unknown offer and 400 for a malformed offer ID', async () => {
    const unknown = await cancel(tokens.employerOfficer, UNKNOWN_ID);
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('OFFER_NOT_FOUND');
    const bad = await cancel(tokens.employerOfficer, 'not-a-uuid');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('offerId');
  });

  it('logs the cancellation by ID only', () => {
    const cancelled = logs().filter((l) => l.msg === 'Credential offer cancelled');
    expect(cancelled.length).toBeGreaterThan(0);
    for (const line of cancelled) {
      expect(line).toMatchObject({
        offerId: expect.any(String),
        credentialId: expect.any(String),
        issuerId: 'employer-a',
        staffId: expect.any(String),
      });
    }
  });
});

// ---------------------------------------------------------------------------
describe('invalidation reasons from revoke and reissue', () => {
  it("revoking a pending credential invalidates its offer with reason 'credential_revoked'", async () => {
    const credentialId = await newPendingEmployment();
    const offer = await createOffer(tokens.employerOfficer, credentialId);
    const revoke = await request(t.app)
      .post(`/api/v1/credentials/${credentialId}/revoke`)
      .set('Authorization', `Bearer ${tokens.employerAdmin}`)
      .send({ reason: 'issued_in_error' });
    expect(revoke.status).toBe(200);
    expect((await getOffer(tokens.employerOfficer, offer.body.offerId)).body).toMatchObject({
      status: 'invalidated',
      invalidationReason: 'credential_revoked',
      credentialStatus: 'revoked',
    });
  });

  it("reissuing a credential invalidates its open offer with reason 'credential_superseded'", async () => {
    const credentialId = await newPendingEmployment();
    const offer = await createOffer(tokens.employerOfficer, credentialId);
    // Signed without redeeming the offer (no redemption in Sprint 1): the offer stays open
    const signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: PASSPHRASE,
      }),
      publicBaseUrl: BASE_URL,
    });
    await signer.signCredential(credentialId, walletJwk());
    const reissue = await request(t.app)
      .post(`/api/v1/credentials/${credentialId}/reissue`)
      .set('Authorization', `Bearer ${tokens.employerOfficer}`)
      .send({ reason: 'details_changed' });
    expect(reissue.status).toBe(201);
    expect((await getOffer(tokens.employerOfficer, offer.body.offerId)).body).toMatchObject({
      status: 'invalidated',
      invalidationReason: 'credential_superseded',
    });
  });

  it('is backed by database rules: a reason exactly when invalidated, from the fixed list', async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    const set = (values: Partial<typeof credentialOffers.$inferInsert>) =>
      dbError(
        t.database.db
          .update(credentialOffers)
          .set(values)
          .where(eq(credentialOffers.id, offer.body.offerId)),
      );
    expect(await set({ invalidatedAt: new Date() })).toMatch(
      /credential_offers_invalidation_reason_with_time/,
    );
    expect(await set({ invalidationReason: 'cancelled' })).toMatch(
      /credential_offers_invalidation_reason_with_time/,
    );
    expect(await set({ invalidatedAt: new Date(), invalidationReason: 'lost' })).toMatch(
      /credential_offers_invalidation_reason_value/,
    );
    expect(OFFER_INVALIDATION_REASONS).toEqual([
      'replaced',
      'cancelled',
      'credential_revoked',
      'credential_superseded',
    ]);
  });
});

// ---------------------------------------------------------------------------
/**
 * OpenID4VCI 1.0, §4.1.1 (Credential Offer parameters) and §4.1.2 (credential_offer by value):
 *   credential_issuer             REQUIRED: the Credential Issuer's URL (https)
 *   credential_configuration_ids  REQUIRED: non-empty array of unique strings, each a key of
 *                                 credential_configurations_supported in the issuer metadata
 *   grants                        OPTIONAL; for the pre-authorised code grant:
 *     "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
 *        "pre-authorized_code" REQUIRED, "tx_code" OPTIONAL, "authorization_server" OPTIONAL }
 * UniVault does not support tx_code yet (Decision 021), so it must be absent.
 */
function checkOpenId4VciOffer(
  offer: Record<string, unknown>,
  { allowHttp, credentialType }: { allowHttp: boolean; credentialType: string },
): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(offer)) {
    if (!['credential_issuer', 'credential_configuration_ids', 'grants'].includes(key)) {
      problems.push(`unknown parameter ${key}`);
    }
  }
  const issuer = offer.credential_issuer;
  if (typeof issuer !== 'string') problems.push('credential_issuer missing');
  else {
    const url = new URL(issuer);
    if (!(allowHttp ? ['https:', 'http:'] : ['https:']).includes(url.protocol)) {
      problems.push(`credential_issuer scheme ${url.protocol}`);
    }
    if (url.search || url.hash) problems.push('credential_issuer has a query or fragment');
    if (issuer.endsWith('/')) problems.push('credential_issuer ends with /');
  }
  const ids = offer.credential_configuration_ids;
  if (!Array.isArray(ids) || ids.length === 0) problems.push('credential_configuration_ids empty');
  else {
    if (new Set(ids).size !== ids.length) problems.push('credential_configuration_ids not unique');
    if (!ids.every((id) => typeof id === 'string')) problems.push('non-string configuration id');
    if (!ids.includes(credentialType)) problems.push('configuration id does not match');
  }
  const grants = offer.grants as Record<string, Record<string, unknown>> | undefined;
  const grant = grants?.['urn:ietf:params:oauth:grant-type:pre-authorized_code'];
  if (!grant) problems.push('pre-authorized_code grant missing');
  else {
    const code = grant['pre-authorized_code'];
    if (typeof code !== 'string' || code === '') problems.push('pre-authorized_code missing');
    if ('tx_code' in grant) problems.push('tx_code present (not supported yet)');
    for (const key of Object.keys(grant)) {
      if (!['pre-authorized_code', 'tx_code', 'authorization_server'].includes(key)) {
        problems.push(`unknown grant parameter ${key}`);
      }
    }
  }
  return problems;
}

describe('the offer payload follows OpenID4VCI 1.0', () => {
  it('passes the structure check in development (http allowed)', async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    expect(
      checkOpenId4VciOffer(offer.body.credentialOffer, {
        allowHttp: true,
        credentialType: offer.body.credentialType,
      }),
    ).toEqual([]);
    expect(offer.body.credentialOffer.credential_configuration_ids).toEqual([
      'EmploymentCredential',
    ]);
  });

  it('carries the offer by value in an openid-credential-offer:// URI with no other parameter', async () => {
    const offer = await createOffer(tokens.employerOfficer, await newPendingEmployment());
    const url = new URL(offer.body.qrContent);
    expect(url.protocol).toBe('openid-credential-offer:');
    expect([...url.searchParams.keys()]).toEqual(['credential_offer']);
    expect(JSON.parse(url.searchParams.get('credential_offer')!)).toEqual(
      offer.body.credentialOffer,
    );
  });

  it('uses an https credential_issuer from PUBLIC_BASE_URL; production refuses anything else', async () => {
    const httpsOffers = createCredentialOffersService(t.database.db, {
      ttlSeconds: DEFAULT_TTL,
      publicBaseUrl: 'https://issuer.univault.example/',
    });
    const [officer] = await t.database.db
      .select({ id: issuerStaff.id })
      .from(issuerStaff)
      .where(eq(issuerStaff.email, STAFF.employerOfficer));
    const staff: StaffProfile = {
      id: officer!.id,
      email: STAFF.employerOfficer,
      displayName: 'Officer',
      role: 'officer',
      issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)', type: 'employer' },
    };
    const offer = await httpsOffers.createOffer(staff, await newPendingEmployment());
    issuedCodes.push(
      offer.credentialOffer.grants[PRE_AUTHORIZED_CODE_GRANT]['pre-authorized_code'],
    );
    expect(offer.credentialOffer.credential_issuer).toBe(
      'https://issuer.univault.example/api/v1/issuers/employer-a',
    );
    expect(
      checkOpenId4VciOffer(offer.credentialOffer as unknown as Record<string, unknown>, {
        allowHttp: false,
        credentialType: 'EmploymentCredential',
      }),
    ).toEqual([]);
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(32),
        ISSUER_KEY_PASSPHRASE: 'a-long-production-passphrase',
        DATABASE_URL: 'postgres://localhost/univault',
        PUBLIC_BASE_URL: 'http://issuer.univault.example',
      }),
    ).toThrow(/PUBLIC_BASE_URL: must be an https:\/\/ URL in production/);
  });

  it('the checker catches each deviation', () => {
    const good = {
      credential_issuer: 'https://a.example/api/v1/issuers/x',
      credential_configuration_ids: ['EmploymentCredential'],
      grants: { [PRE_AUTHORIZED_CODE_GRANT]: { 'pre-authorized_code': 'c' } },
    };
    const opts = { allowHttp: false, credentialType: 'EmploymentCredential' };
    const check = (offer: Record<string, unknown>) => checkOpenId4VciOffer(offer, opts);
    expect(check(good)).toEqual([]);
    expect(check({ ...good, credential_issuer: 'http://a.example' })).toEqual([
      'credential_issuer scheme http:',
    ]);
    expect(check({ ...good, credential_issuer: 'https://a.example/?x=1' })).toEqual([
      'credential_issuer has a query or fragment',
    ]);
    expect(check({ ...good, credential_issuer: 'https://a.example/x/' })).toEqual([
      'credential_issuer ends with /',
    ]);
    expect(check({ ...good, credential_issuer: 1 })).toEqual(['credential_issuer missing']);
    expect(check({ ...good, credential_configuration_ids: [] })).toEqual([
      'credential_configuration_ids empty',
    ]);
    expect(check({ ...good, credential_configuration_ids: ['KYCCredential'] })).toEqual([
      'configuration id does not match',
    ]);
    expect(check({ ...good, credential_configuration_ids: ['EmploymentCredential', 3] })).toEqual([
      'non-string configuration id',
    ]);
    expect(
      check({
        ...good,
        credential_configuration_ids: ['EmploymentCredential', 'EmploymentCredential'],
      }),
    ).toEqual(['credential_configuration_ids not unique']);
    expect(
      check({
        ...good,
        grants: {
          [PRE_AUTHORIZED_CODE_GRANT]: { 'pre-authorized_code': '', tx_code: {}, user_pin: true },
        },
      }),
    ).toEqual([
      'pre-authorized_code missing',
      'tx_code present (not supported yet)',
      'unknown grant parameter user_pin',
    ]);
    expect(check({ ...good, credentials: [] })).toEqual(['unknown parameter credentials']);
    expect(check({ ...good, grants: {} })).toEqual(['pre-authorized_code grant missing']);
  });
});

// ---------------------------------------------------------------------------
describe('GET /credentials/:id – activeOffer (id and expiry only)', () => {
  const credential = async (id: string) => {
    const res = await request(t.app)
      .get(`/api/v1/credentials/${id}`)
      .set('Authorization', `Bearer ${tokens.employerOfficer}`);
    getResponses.push(res.text);
    expect(res.status).toBe(200);
    return res.body as { activeOffer: { offerId: string; expiresAt: string } | null };
  };

  it('is null without an offer, the newest usable offer after one, null again once it ends', async () => {
    const credentialId = await newPendingEmployment();
    expect((await credential(credentialId)).activeOffer).toBeNull();

    await createOffer(tokens.employerOfficer, credentialId);
    const second = await createOffer(tokens.employerOfficer, credentialId);
    expect((await credential(credentialId)).activeOffer).toEqual({
      offerId: second.body.offerId,
      expiresAt: second.body.expiresAt,
    });

    const cancel = await request(t.app)
      .post(`/api/v1/credential-offers/${second.body.offerId}/cancel`)
      .set('Authorization', `Bearer ${tokens.employerOfficer}`);
    expect(cancel.status).toBe(200);
    expect((await credential(credentialId)).activeOffer).toBeNull();

    const third = await createOffer(tokens.employerOfficer, credentialId);
    await t.database.db
      .update(credentialOffers)
      .set({
        createdAt: new Date(Date.now() - 20 * 60_000),
        expiresAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(credentialOffers.id, third.body.offerId));
    expect((await credential(credentialId)).activeOffer).toBeNull();
  });

  it('is null once the credential is no longer pending', async () => {
    const credentialId = await newPendingEmployment();
    await createOffer(tokens.employerOfficer, credentialId);
    const signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: PASSPHRASE,
      }),
      publicBaseUrl: BASE_URL,
    });
    await signer.signCredential(credentialId, walletJwk());
    expect((await credential(credentialId)).activeOffer).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('privacy', () => {
  it('issued codes during this run', () => {
    expect(issuedCodes.length).toBeGreaterThan(10);
  });

  it('logs every offer by ID and never contain a code or its hash', () => {
    const all = JSON.stringify(logs());
    expect(all).toContain('Credential offer created');
    for (const code of issuedCodes) {
      expect(all).not.toContain(code);
      expect(all).not.toContain(sha256(code));
    }
  });

  it('GET responses never contain any code', () => {
    const all = getResponses.join('\n');
    for (const code of issuedCodes) expect(all).not.toContain(code);
  });
});
