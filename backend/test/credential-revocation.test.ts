/**
 * Revocation, reissue (supersede) and status history of credentials
 * (FR-ISS-03, Decision 012): POST /credentials/:id/revoke, POST /credentials/:id/reissue,
 * GET /credentials/:id/events, and the signing / offer safety rules that go with them.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, holders, issuerKeys } from '../src/db/schema.js';
import {
  createCredentialOffersService,
  PRE_AUTHORIZED_CODE_GRANT,
  type CredentialOffersService,
} from '../src/services/credential-offers.service.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import {
  createCredentialsService,
  type CredentialsService,
} from '../src/services/credentials.service.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const DAY_MS = 86_400_000;
const SECRET_NOTE = 'Synthetic note: holder phoned the HR desk on 24 Nov';

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
let offersService: CredentialOffersService;
let tokens: Record<'employerOfficer' | 'employerAdmin' | 'bankOfficer' | 'bankAdmin', string>;
const responses: string[] = []; // every API response – checked by the privacy test

const track = (res: request.Response) => {
  responses.push(res.text);
  return res;
};
const authed = (method: 'get' | 'post', path: string, token?: string) => {
  const req = request(t.app)[method](`/api/v1${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const revoke = async (id: string, body: object, token = tokens.employerAdmin) =>
  track(await authed('post', `/credentials/${id}/revoke`, token).send(body));
const reissue = async (id: string, body: object, token = tokens.employerOfficer) =>
  track(await authed('post', `/credentials/${id}/reissue`, token).send(body));
const getCredential = async (id: string, token = tokens.employerOfficer) =>
  track(await authed('get', `/credentials/${id}`, token));
const eventsOf = async (id: string, token = tokens.employerOfficer) =>
  track(await authed('get', `/credentials/${id}/events`, token));

const walletKey = () =>
  generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });

let employeeCounter = 0;
async function newEmployee(overrides: Record<string, unknown> = {}) {
  employeeCounter += 1;
  const res = await authed('post', '/holders', tokens.employerOfficer).send({
    claims: {
      ...EMPLOYEE_CLAIMS,
      employee_id: `STC-7${String(employeeCounter).padStart(4, '0')}`,
      ...overrides,
    },
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

let customerCounter = 0;
async function newCustomer(overrides: Record<string, unknown> = {}) {
  customerCounter += 1;
  const res = await authed('post', '/holders', tokens.bankOfficer).send({
    externalRef: `CUS-REV-${String(customerCounter).padStart(3, '0')}`,
    claims: { ...CUSTOMER_CLAIMS, ...overrides },
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function issuePending(holderId: string, token = tokens.employerOfficer) {
  const res = track(await authed('post', '/credentials', token).send({ holderId }));
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** A pending credential signed the way Sprint 2 redemption will do it → 'valid'. */
async function issueValid(holderId: string, token = tokens.employerOfficer) {
  const id = await issuePending(holderId, token);
  await signer.signCredential(id, walletKey());
  return id;
}

async function createOffer(credentialId: string, token = tokens.employerOfficer) {
  const res = await authed('post', '/credential-offers', token).send({ credentialId });
  expect(res.status).toBe(201);
  return {
    offerId: res.body.offerId as string,
    code: res.body.credentialOffer.grants[PRE_AUTHORIZED_CODE_GRANT]['pre-authorized_code'],
  };
}

const recordOf = async (id: string) =>
  (await t.database.db.select().from(credentialRecords).where(eq(credentialRecords.id, id)))[0]!;

const replacementsOf = async (id: string) =>
  (
    await t.database.db
      .select({ n: count() })
      .from(credentialRecords)
      .where(eq(credentialRecords.replacesCredentialId, id))
  )[0]!.n;

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-revocation-'));
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
    const res = await authed('post', `/issuers/${issuerId}/keys`, token);
    expect(res.status).toBe(201);
  }
  // The signing and offer services the Sprint 2 redemption endpoint will use, on the same database
  signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
    keysDir,
    passphrase: PASSPHRASE,
    publicBaseUrl: BASE_URL,
  });
  offersService = createCredentialOffersService(t.database.db, {
    ttlSeconds: 600,
    publicBaseUrl: BASE_URL,
  });
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('POST /credentials/:id/revoke', () => {
  it('revokes a valid credential and records who, when and why', async () => {
    const id = await issueValid(await newEmployee());
    const before = Date.now();
    const res = await revoke(id, { reason: 'employment_ended' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id,
      status: 'revoked',
      revocationReason: 'employment_ended',
      revokedBy: { displayName: 'Serendib Trading Company (Demo) Admin' },
      supersededAt: null,
      replacedByCredentialId: null,
    });
    expect(new Date(res.body.revokedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(res.body.statusUpdatedAt).toBe(res.body.revokedAt);

    // Same shape and values as GET /credentials/:id
    const get = await getCredential(id);
    expect(get.body).toEqual(res.body);

    const row = await recordOf(id);
    expect(row.revokedByStaffId).toBe(res.body.revokedBy.id);
    expect(row.revocationReason).toBe('employment_ended');
  });

  it('records the revocation in the status history, with the trimmed note', async () => {
    const id = await issueValid(await newEmployee());
    expect((await revoke(id, { reason: 'other', note: `  ${SECRET_NOTE}  ` })).status).toBe(200);
    const res = await eventsOf(id);
    expect(res.body.events.at(-1)).toMatchObject({
      fromStatus: 'valid',
      toStatus: 'revoked',
      reason: 'other',
      note: SECRET_NOTE,
      staff: { displayName: 'Serendib Trading Company (Demo) Admin' },
    });
  });

  it('revokes a pending credential and invalidates its open offer in the same step', async () => {
    const id = await issuePending(await newEmployee());
    const offer = await createOffer(id);
    expect((await offersService.findOfferByCode(offer.code))?.status).toBe('active');

    const res = await revoke(id, { reason: 'issued_in_error' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('revoked');

    const status = await authed(
      'get',
      `/credential-offers/${offer.offerId}`,
      tokens.employerOfficer,
    );
    expect(status.body).toMatchObject({ status: 'invalidated', credentialStatus: 'revoked' });
    expect(status.body.invalidatedAt).toBe(res.body.revokedAt);
    const found = await offersService.findOfferByCode(offer.code);
    expect(found).toMatchObject({ status: 'invalidated', credentialStatus: 'revoked' });
  });

  it('lets a new credential be issued for the same holder afterwards', async () => {
    const holderId = await newEmployee();
    const id = await issuePending(holderId);
    const blocked = track(
      await authed('post', '/credentials', tokens.employerOfficer).send({ holderId }),
    );
    expect(blocked.body.error.code).toBe('ACTIVE_CREDENTIAL_EXISTS');

    expect((await revoke(id, { reason: 'issued_in_error' })).status).toBe(200);
    const again = track(
      await authed('post', '/credentials', tokens.employerOfficer).send({ holderId }),
    );
    expect(again.status).toBe(201);
  });

  it('refuses to revoke twice (409 CREDENTIAL_ALREADY_REVOKED)', async () => {
    const id = await issueValid(await newEmployee());
    await revoke(id, { reason: 'employment_ended' });
    const res = await revoke(id, { reason: 'employment_ended' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CREDENTIAL_ALREADY_REVOKED');
  });

  it('refuses a superseded credential (409 CREDENTIAL_SUPERSEDED with replacedBy)', async () => {
    const id = await issueValid(await newEmployee());
    const reissued = await reissue(id, { reason: 'details_changed' });
    const res = await revoke(id, { reason: 'employment_ended' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'CREDENTIAL_SUPERSEDED',
      details: { replacedBy: reissued.body.credential.id },
    });
  });

  it('is admin-only: officers get 403 and nothing changes', async () => {
    const id = await issueValid(await newEmployee());
    const res = await revoke(id, { reason: 'employment_ended' }, tokens.employerOfficer);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
    expect((await recordOf(id)).status).toBe('valid');
  });

  it("hides another issuer's credential (404 CREDENTIAL_NOT_FOUND) and unknown ids", async () => {
    const id = await issueValid(await newEmployee());
    const other = await revoke(id, { reason: 'employment_ended' }, tokens.bankAdmin);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
    expect((await recordOf(id)).status).toBe('valid');

    const unknown = await revoke(UNKNOWN_ID, { reason: 'employment_ended' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });

  it.each([
    ['reason "other" without a note', { reason: 'other' }, 'note'],
    ['reason "other" with a blank note', { reason: 'other', note: '   ' }, 'note'],
    ['a note over 500 characters', { reason: 'employment_ended', note: 'x'.repeat(501) }, 'note'],
    ['an unknown reason', { reason: 'validity_extension' }, 'reason'],
    ['no reason', {}, 'reason'],
  ])('rejects %s (400 VALIDATION_ERROR)', async (_label, body, path) => {
    const id = await issueValid(await newEmployee());
    const res = await revoke(id, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toContain(path);
    expect((await recordOf(id)).status).toBe('valid');
  });

  it('requires a login (401)', async () => {
    const id = await issueValid(await newEmployee());
    const res = track(
      await authed('post', `/credentials/${id}/revoke`).send({ reason: 'employment_ended' }),
    );
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('POST /credentials/:id/reissue', () => {
  it('supersedes the old credential and creates a pending replacement, linked both ways', async () => {
    const holderId = await newEmployee();
    const oldId = await issueValid(holderId);

    const res = await reissue(oldId, { reason: 'details_changed', note: SECRET_NOTE });
    expect(res.status).toBe(201);
    const newId = res.body.credential.id;
    expect(res.headers.location).toBe(`/api/v1/credentials/${newId}`);
    expect(res.body.replaces).toEqual({ id: oldId, status: 'superseded' });
    expect(res.body.credential).toMatchObject({
      status: 'pending',
      holder: { id: holderId },
      replacesCredentialId: oldId,
      replacedByCredentialId: null,
      issuerKid: null,
      createdBy: { displayName: 'Serendib Trading Company (Demo) Officer' },
    });

    const old = await getCredential(oldId);
    expect(old.body).toMatchObject({
      status: 'superseded',
      replacedByCredentialId: newId,
      supersededBy: { displayName: 'Serendib Trading Company (Demo) Officer' },
      revokedAt: null,
      revocationReason: null,
    });
    expect(old.body.supersededAt).toBe(res.body.credential.createdAt);
    // The new credential's own GET matches the reissue response
    expect((await getCredential(newId)).body).toEqual(res.body.credential);
  });

  it("builds the replacement from the holder's CURRENT record", async () => {
    const holderId = await newEmployee({ designation: 'Logistics Coordinator' });
    const oldId = await issueValid(holderId);
    // Holder records have no update endpoint yet: change the record directly
    const [holder] = await t.database.db.select().from(holders).where(eq(holders.id, holderId));
    await t.database.db
      .update(holders)
      .set({ claims: { ...holder!.claims, designation: 'Branch Supervisor' } })
      .where(eq(holders.id, holderId));

    const res = await reissue(oldId, { reason: 'details_changed' });
    expect(res.status).toBe(201);
    expect((await recordOf(res.body.credential.id)).claimsSnapshot.designation).toBe(
      'Branch Supervisor',
    );
    expect((await recordOf(oldId)).claimsSnapshot.designation).toBe('Logistics Coordinator');
  });

  it('applies the issuance expiry caps: passport expiry', async () => {
    const passportExpiry = isoDate(new Date(Date.now() + 200 * DAY_MS));
    const holderId = await newCustomer({
      id_document_type: 'passport',
      id_document_number: 'N2345678',
      id_document_expiry: passportExpiry,
    });
    const oldId = await issueValid(holderId, tokens.bankOfficer);
    const res = await reissue(oldId, { reason: 'validity_extension' }, tokens.bankOfficer);
    expect(res.status).toBe(201);
    expect(res.body.credential.expiresAt).toBe(`${passportExpiry}T00:00:00.000Z`);
  });

  it('applies the issuance expiry caps: 18th birthday, with age_over_18 recalculated', async () => {
    const today = new Date();
    const [y, m, d] = [today.getUTCFullYear() - 18, today.getUTCMonth(), today.getUTCDate() + 40];
    const dob = isoDate(new Date(Date.UTC(y, m, d)));
    const eighteenth = new Date(Date.UTC(y + 18, m, d));
    const holderId = await newCustomer({ date_of_birth: dob });
    const oldId = await issueValid(holderId, tokens.bankOfficer);

    const res = await reissue(oldId, { reason: 'details_changed' }, tokens.bankOfficer);
    expect(res.status).toBe(201);
    expect(res.body.credential.expiresAt).toBe(eighteenth.toISOString());
    expect((await recordOf(res.body.credential.id)).claimsSnapshot.age_over_18).toBe(false);
  });

  it('accepts an earlier validUntil and rejects one beyond the cap or in the past (400)', async () => {
    const holderId = await newEmployee();
    const oldId = await issueValid(holderId);
    for (const validUntil of [
      isoDate(new Date(Date.now() + 3 * 365 * DAY_MS)), // beyond the 1-year default
      isoDate(new Date(Date.now() - DAY_MS)), // in the past
    ]) {
      const bad = await reissue(oldId, { reason: 'validity_extension', validUntil });
      expect(bad.status).toBe(400);
      expect(bad.body.error.details[0].path).toBe('validUntil');
      expect((await recordOf(oldId)).status).toBe('valid'); // rolled back
    }
    const wrongFormat = await reissue(oldId, {
      reason: 'validity_extension',
      validUntil: '31/12/2027',
    });
    expect(wrongFormat.status).toBe(400);

    const validUntil = isoDate(new Date(Date.now() + 90 * DAY_MS));
    const ok = await reissue(oldId, { reason: 'validity_extension', validUntil });
    expect(ok.status).toBe(201);
    expect(ok.body.credential.expiresAt).toBe(`${validUntil}T00:00:00.000Z`);
  });

  it('refuses a second reissue of the same credential (409 CREDENTIAL_SUPERSEDED)', async () => {
    const oldId = await issueValid(await newEmployee());
    const first = await reissue(oldId, { reason: 'details_changed' });
    const second = await reissue(oldId, { reason: 'details_changed' });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'CREDENTIAL_SUPERSEDED',
      details: { replacedBy: first.body.credential.id },
    });
    expect(await replacementsOf(oldId)).toBe(1);
  });

  it('refuses a pending credential (409 CREDENTIAL_NOT_REISSUABLE) and a revoked one', async () => {
    const pendingId = await issuePending(await newEmployee());
    const pending = await reissue(pendingId, { reason: 'details_changed' });
    expect(pending.status).toBe(409);
    expect(pending.body.error.code).toBe('CREDENTIAL_NOT_REISSUABLE');
    expect(pending.body.error.message).toMatch(/Revoke it and issue a new one/);

    const revokedId = await issueValid(await newEmployee());
    await revoke(revokedId, { reason: 'employment_ended' });
    const revoked = await reissue(revokedId, { reason: 'details_changed' });
    expect(revoked.status).toBe(409);
    expect(revoked.body.error.code).toBe('CREDENTIAL_ALREADY_REVOKED');
  });

  it("hides another issuer's credential (404) and requires a login (401)", async () => {
    const id = await issueValid(await newEmployee());
    const other = await reissue(id, { reason: 'details_changed' }, tokens.bankOfficer);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
    const anonymous = track(
      await authed('post', `/credentials/${id}/reissue`).send({ reason: 'details_changed' }),
    );
    expect(anonymous.status).toBe(401);
    expect((await recordOf(id)).status).toBe('valid');
  });

  it('lets admins reissue too, and requires a note for reason "other"', async () => {
    const id = await issueValid(await newEmployee());
    const noNote = await reissue(id, { reason: 'other' }, tokens.employerAdmin);
    expect(noNote.status).toBe(400);
    const ok = await reissue(
      id,
      { reason: 'other', note: 'Name spelling fixed' },
      tokens.employerAdmin,
    );
    expect(ok.status).toBe(201);
  });

  it('lets exactly one of two simultaneous reissues succeed', async () => {
    const oldId = await issueValid(await newEmployee());
    const results = await Promise.all([
      reissue(oldId, { reason: 'details_changed' }),
      reissue(oldId, { reason: 'wallet_lost_or_compromised' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.body.error.code).toBe('CREDENTIAL_SUPERSEDED');
    expect(await replacementsOf(oldId)).toBe(1);
  });

  it('answers 422 HOLDER_DATA_INVALID (same as issuance) when the holder record no longer validates', async () => {
    const holderId = await newEmployee();
    const oldId = await issueValid(holderId);
    const [holder] = await t.database.db.select().from(holders).where(eq(holders.id, holderId));
    await t.database.db
      .update(holders)
      .set({ claims: { ...holder!.claims, employment_type: 'freelance' } })
      .where(eq(holders.id, holderId));

    const res = await reissue(oldId, { reason: 'details_changed' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDER_DATA_INVALID');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'claims.employment_type' })]),
    );
    // Nothing changed: the old credential is still valid and has no replacement
    expect((await recordOf(oldId)).status).toBe('valid');
    expect(await replacementsOf(oldId)).toBe(0);
  });

  it('answers 409 ISSUER_KEY_MISSING, like issuance, when the issuer has no active key', async () => {
    const oldId = await issueValid(await newEmployee());
    const active = and(eq(issuerKeys.issuerId, 'employer-a'), eq(issuerKeys.status, 'active'));
    const [key] = await t.database.db.select().from(issuerKeys).where(active);
    await t.database.db
      .update(issuerKeys)
      .set({ status: 'retired', retiredAt: new Date() })
      .where(eq(issuerKeys.kid, key!.kid));
    try {
      const res = await reissue(oldId, { reason: 'details_changed' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ISSUER_KEY_MISSING');
      expect((await recordOf(oldId)).status).toBe('valid');
    } finally {
      await t.database.db
        .update(issuerKeys)
        .set({ status: 'active', retiredAt: null })
        .where(eq(issuerKeys.kid, key!.kid));
    }
  });

  it("invalidates the old credential's open offers, and the replacement can be offered and signed", async () => {
    const oldId = await issuePending(await newEmployee());
    const oldOffer = await createOffer(oldId);
    await signer.signCredential(oldId, walletKey()); // offer not marked redeemed: still open

    const res = await reissue(oldId, { reason: 'wallet_lost_or_compromised' });
    expect(res.status).toBe(201);
    const found = await offersService.findOfferByCode(oldOffer.code);
    expect(found).toMatchObject({ status: 'invalidated', credentialStatus: 'superseded' });
    expect(found?.invalidatedAt?.toISOString()).toBe(res.body.credential.createdAt);

    const newOffer = await createOffer(res.body.credential.id);
    expect((await offersService.findOfferByCode(newOffer.code))?.status).toBe('active');
    const signed = await signer.signCredential(res.body.credential.id, walletKey());
    expect(signed.credential).toMatchObject({ status: 'valid', replacesCredentialId: oldId });
  });
});

// ---------------------------------------------------------------------------
describe('signing and offers after revoke or reissue', () => {
  it('never signs a revoked credential (409 CREDENTIAL_NOT_PENDING)', async () => {
    const id = await issuePending(await newEmployee());
    await revoke(id, { reason: 'issued_in_error' });
    await expect(signer.signCredential(id, walletKey())).rejects.toMatchObject({
      status: 409,
      code: 'CREDENTIAL_NOT_PENDING',
    });
    expect(await recordOf(id)).toMatchObject({
      status: 'revoked',
      issuedAt: null,
      issuerKid: null,
    });
  });

  it('never signs a superseded credential', async () => {
    const id = await issueValid(await newEmployee());
    await reissue(id, { reason: 'details_changed' });
    await expect(signer.signCredential(id, walletKey())).rejects.toMatchObject({
      status: 409,
      code: 'CREDENTIAL_NOT_PENDING',
    });
    expect((await recordOf(id)).status).toBe('superseded');
  });

  it('reports an offer whose credential is no longer pending as not redeemable', async () => {
    // Second line of defence: even an offer that was never invalidated is not 'active'
    const id = await issuePending(await newEmployee());
    const offer = await createOffer(id);
    await signer.signCredential(id, walletKey());
    const found = await offersService.findOfferByCode(offer.code);
    expect(found).toMatchObject({ status: 'invalidated', credentialStatus: 'valid' });
    expect(found?.invalidatedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('GET /credentials/:id/events', () => {
  it('returns the full history oldest first: created → valid → superseded', async () => {
    const id = await issueValid(await newEmployee());
    await reissue(id, { reason: 'details_changed', note: 'New designation' });

    const res = await eventsOf(id);
    expect(res.status).toBe(200);
    expect(res.body.credentialId).toBe(id);
    expect(
      res.body.events.map((e: Record<string, unknown>) => [e.fromStatus, e.toStatus, e.reason]),
    ).toEqual([
      [null, 'pending', null],
      ['pending', 'valid', null],
      ['valid', 'superseded', 'details_changed'],
    ]);
    const [created, signed, superseded] = res.body.events;
    expect(created.staff.displayName).toBe('Serendib Trading Company (Demo) Officer');
    expect(signed.staff).toBeNull(); // wallet-driven
    expect(superseded.note).toBe('New designation');
    const times = res.body.events.map((e: { createdAt: string }) => Date.parse(e.createdAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('returns created → revoked for a revoked pending credential', async () => {
    const id = await issuePending(await newEmployee());
    await revoke(id, { reason: 'issued_in_error' });
    const res = await eventsOf(id, tokens.employerAdmin);
    expect(
      res.body.events.map((e: Record<string, unknown>) => [e.fromStatus, e.toStatus, e.reason]),
    ).toEqual([
      [null, 'pending', null],
      ['pending', 'revoked', 'issued_in_error'],
    ]);
  });

  it('starts the replacement history with its own creation', async () => {
    const id = await issueValid(await newEmployee());
    const newId = (await reissue(id, { reason: 'details_changed' })).body.credential.id;
    const res = await eventsOf(newId);
    expect(res.body.events.map((e: { toStatus: string }) => e.toStatus)).toEqual(['pending']);
  });

  it("hides another issuer's history (404), unknown ids (404) and requires a login (401)", async () => {
    const id = await issuePending(await newEmployee());
    expect((await eventsOf(id, tokens.bankOfficer)).status).toBe(404);
    expect((await eventsOf(UNKNOWN_ID)).status).toBe(404);
    expect(track(await authed('get', `/credentials/${id}/events`)).status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
describe('GET /credentials with the new statuses', () => {
  it('filters by superseded and revoked, and shows the links in the list', async () => {
    const superseded = await issueValid(await newEmployee());
    const newId = (await reissue(superseded, { reason: 'details_changed' })).body.credential.id;
    const revoked = await issueValid(await newEmployee());
    await revoke(revoked, { reason: 'employment_ended' });

    const list = async (status: string) =>
      track(await authed('get', `/credentials?status=${status}&limit=100`, tokens.employerOfficer))
        .body.credentials as Record<string, unknown>[];
    const supersededList = await list('superseded');
    expect(supersededList.every((c) => c.status === 'superseded')).toBe(true);
    expect(supersededList.find((c) => c.id === superseded)?.replacedByCredentialId).toBe(newId);
    const revokedList = await list('revoked');
    expect(revokedList.every((c) => c.status === 'revoked')).toBe(true);
    expect(revokedList.map((c) => c.id)).toContain(revoked);
  });
});

// ---------------------------------------------------------------------------
describe('privacy', () => {
  it('logs revoke and reissue with ids, action and reason only', () => {
    const actions = logs().filter((l) => l.action === 'revoke' || l.action === 'reissue');
    expect(actions.length).toBeGreaterThan(0);
    for (const line of actions) {
      expect(line).toHaveProperty('credentialId');
      expect(line).toHaveProperty('issuerId');
      expect(line).toHaveProperty('staffId');
      expect(line).toHaveProperty('reason');
      expect(line).not.toHaveProperty('note');
      expect(line).not.toHaveProperty('claims');
    }
  });

  it('never writes notes, names or claims to the logs', () => {
    const text = JSON.stringify(logs());
    for (const secret of [
      SECRET_NOTE,
      'New designation',
      'Name spelling fixed',
      String(EMPLOYEE_CLAIMS.full_name),
      String(CUSTOMER_CLAIMS.full_name),
      'Branch Supervisor',
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it('returns no claims in revoke, reissue or events responses', () => {
    const text = responses.join('\n');
    expect(text).not.toContain('claimsSnapshot');
    expect(text).not.toContain(String(CUSTOMER_CLAIMS.date_of_birth));
  });
});
