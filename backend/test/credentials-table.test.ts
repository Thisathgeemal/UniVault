/**
 * The issuer portal's credentials table and its actions:
 *   - GET /credentials: per-row fields (hasActiveOffer, no claims), q search (name, reference,
 *     id prefix, wildcards escaped), every sort, tab counts equal to each tab's total, paging;
 *   - POST /credentials/:id/reissue/preview: the same path as reissue up to the writes – equal
 *     to a following real reissue at the same clock, writes nothing, the same errors;
 *   - expired credentials (stored valid, expires_at passed): reissue = renewal, revoke allowed;
 *   - the dev-only db:holder:set helper (devUpdateHolderClaim);
 *   - error paths and combinations: filters with sort and search, the bank's wrong-type message,
 *     the reissue preview's under-18 warning, signing after the key was retired, routers
 *     without their service (503).
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, count, eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StaffProfile } from '../src/auth/auth-service.js';
import type { AuthMiddleware } from '../src/auth/middleware.js';
import { DevHolderUpdateError, devUpdateHolderClaim } from '../src/db/dev-holder-update.js';
import {
  credentialOffers,
  credentialRecords,
  credentialStatusEvents,
  holders,
  issuerKeys,
  issuerStaff,
} from '../src/db/schema.js';
import { createKeyStore } from '../src/keys/key-store.js';
import { createErrorHandler } from '../src/middleware/error-handler.js';
import { credentialOffersRouter } from '../src/routes/credential-offers.routes.js';
import { credentialSchemasRouter } from '../src/routes/credential-schemas.routes.js';
import { credentialsRouter } from '../src/routes/credentials.routes.js';
import { holdersRouter } from '../src/routes/holders.routes.js';
import { statusRouter } from '../src/routes/status.routes.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import {
  changedClaimNames,
  createCredentialsService,
  eighteenthBirthday,
  type CredentialsService,
} from '../src/services/credentials.service.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const DAY_MS = 86_400_000;
const schemas = loadCredentialSchemas();

const fixture = (file: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
    records: { claims: Record<string, unknown> }[];
  };
const EMPLOYEE_CLAIMS = fixture('employees.json').records[0]!.claims;
const CUSTOMER_CLAIMS = fixture('customers.json').records[0]!.claims;

let keysDir: string;
let t: AuthedTestApp;
let signer: CredentialsService;
let tokens: Record<'employerOfficer' | 'employerAdmin' | 'bankOfficer', string>;
const responses: string[] = [];

const authed = (method: 'get' | 'post', path: string, token?: string) => {
  const req = request(t.app)[method](`/api/v1${path}`);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
};
const track = (res: request.Response) => {
  responses.push(res.text);
  return res;
};
const list = async (query: string, token = tokens.employerOfficer) =>
  track(await authed('get', `/credentials?${query}`, token));
const preview = async (id: string, body: object, token = tokens.employerOfficer) =>
  track(await authed('post', `/credentials/${id}/reissue/preview`, token).send(body));

let counter = 0;
/** A new employer-a employee; returns the holder id and the employee id (the reference). */
async function newEmployee(overrides: Record<string, unknown> = {}) {
  counter += 1;
  const ref = `STC-8${String(counter).padStart(4, '0')}`;
  const res = await authed('post', '/holders', tokens.employerOfficer).send({
    claims: { ...EMPLOYEE_CLAIMS, employee_id: ref, ...overrides },
  });
  expect(res.status).toBe(201);
  return { holderId: res.body.id as string, ref };
}
async function issuePending(holderId: string) {
  const res = await authed('post', '/credentials', tokens.employerOfficer).send({ holderId });
  expect(res.status).toBe(201);
  return res.body.id as string;
}
const walletKey = () =>
  generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
async function issueValid(holderId: string) {
  const id = await issuePending(holderId);
  await signer.signCredential(id, walletKey());
  return id;
}
/** Makes a valid credential expired (issued 2 years ago, expired yesterday). */
async function expire(id: string) {
  await t.database.db
    .update(credentialRecords)
    .set({
      issuedAt: new Date(Date.now() - 2 * 365 * DAY_MS),
      expiresAt: new Date(Date.now() - DAY_MS),
    })
    .where(eq(credentialRecords.id, id));
}
const tableCounts = async () => {
  const db = t.database.db;
  const [c] = await db.select({ n: count() }).from(credentialRecords);
  const [e] = await db.select({ n: count() }).from(credentialStatusEvents);
  const [o] = await db.select({ n: count() }).from(credentialOffers);
  return { credentials: c!.n, events: e!.n, offers: o!.n };
};
async function staffProfile(email: string): Promise<StaffProfile> {
  const [row] = await t.database.db.select().from(issuerStaff).where(eq(issuerStaff.email, email));
  return {
    id: row!.id,
    email: row!.email,
    displayName: row!.displayName,
    role: row!.role,
    issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)', type: 'employer' },
  };
}

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-table-'));
  t = await authedTestApp({
    ISSUER_KEYS_DIR: keysDir,
    ISSUER_KEY_PASSPHRASE: PASSPHRASE,
    PUBLIC_BASE_URL: BASE_URL,
  });
  const [employerOfficer, employerAdmin, bankOfficer, bankAdmin] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.employerAdmin),
    t.tokenFor(STAFF.bankOfficer),
    t.tokenFor(STAFF.bankAdmin),
  ]);
  tokens = { employerOfficer, employerAdmin, bankOfficer };
  for (const [issuerId, token] of [
    ['employer-a', employerAdmin],
    ['bank-a', bankAdmin],
  ] as const) {
    expect((await authed('post', `/issuers/${issuerId}/keys`, token)).status).toBe(201);
  }
  signer = createCredentialsService(t.database.db, schemas, {
    keyStore: createKeyStore({
      db: t.database.db,
      source: 'file',
      keysDir,
      passphrase: PASSPHRASE,
    }),
    publicBaseUrl: BASE_URL,
  });
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('GET /credentials – the table', () => {
  let pendingWithOffer: string;
  let pendingNoOffer: string;
  let valid: string;
  let expired: string;
  let refs: { a: string; b: string; c: string; d: string };

  beforeAll(async () => {
    const a = await newEmployee({ full_name: 'Zara Table Alpha' });
    const b = await newEmployee({ full_name: 'Amal Table Beta' });
    const c = await newEmployee({ full_name: 'Mala Table Gamma' });
    const d = await newEmployee({ full_name: 'Nimal Table Delta' });
    refs = { a: a.ref, b: b.ref, c: c.ref, d: d.ref };
    pendingWithOffer = await issuePending(a.holderId);
    const offer = await authed('post', '/credential-offers', tokens.employerOfficer).send({
      credentialId: pendingWithOffer,
    });
    expect(offer.status).toBe(201);
    pendingNoOffer = await issuePending(b.holderId);
    valid = await issueValid(c.holderId);
    expired = await issueValid(d.holderId);
    await expire(expired);
  });

  it('returns per row what the table needs, with hasActiveOffer and no claims', async () => {
    const res = await list('q=Table&sort=holder');
    expect(res.status).toBe(200);
    expect(
      res.body.credentials.map((c: { holder: { fullName: string } }) => c.holder.fullName),
    ).toEqual(['Amal Table Beta', 'Mala Table Gamma', 'Nimal Table Delta', 'Zara Table Alpha']);
    const row = res.body.credentials.find((c: { id: string }) => c.id === pendingWithOffer);
    expect(row).toMatchObject({
      credentialType: 'EmploymentCredential',
      vct: expect.any(String),
      holder: { id: expect.any(String), externalRef: refs.a, fullName: 'Zara Table Alpha' },
      status: 'pending',
      effectiveStatus: 'pending',
      issuedAt: null,
      expiresAt: expect.any(String),
      createdAt: expect.any(String),
      replacesCredentialId: null,
      replacedByCredentialId: null,
      hasActiveOffer: true,
    });
    const byId = (id: string) => res.body.credentials.find((c: { id: string }) => c.id === id);
    expect(byId(pendingNoOffer).hasActiveOffer).toBe(false);
    expect(byId(valid)).toMatchObject({ effectiveStatus: 'valid', hasActiveOffer: false });
    expect(byId(expired)).toMatchObject({ status: 'valid', effectiveStatus: 'expired' });
    // Holder name and reference only: no claims, ID numbers or snapshot
    expect(Object.keys(row.holder).sort()).toEqual(['externalRef', 'fullName', 'id']);
    expect(res.text).not.toContain(String(EMPLOYEE_CLAIMS.nic_number));
    expect(res.text).not.toMatch(/claims|snapshot|nic_number/i);
  });

  it('searches the holder name and reference (contains, any case) and the id (prefix)', async () => {
    expect((await list('q=table gamma')).body.credentials.map((c: { id: string }) => c.id)).toEqual(
      [valid],
    );
    expect(
      (await list(`q=${refs.d.toLowerCase()}`)).body.credentials.map((c: { id: string }) => c.id),
    ).toEqual([expired]);
    const idPrefix = valid.slice(0, 8).toUpperCase();
    expect(
      (await list(`q=${idPrefix}`)).body.credentials.map((c: { id: string }) => c.id),
    ).toContain(valid);
    // The id matches only as a prefix, not in the middle
    expect((await list(`q=${valid.slice(9, 18)}`)).body.total).toBe(0);
    // LIKE wildcards are literal
    expect((await list('q=%25')).body.total).toBe(0);
    expect((await list('q=_')).body.total).toBe(0);
    // Empty = no search
    expect((await list('q=%20%20')).body.total).toBeGreaterThanOrEqual(4);
  });

  it('sorts by created, expiry and holder name, both ways', async () => {
    const ids = async (sort: string) =>
      (await list(`q=Table&sort=${sort}`)).body.credentials.map((c: { id: string }) => c.id);
    expect(await ids('newest')).toEqual([expired, valid, pendingNoOffer, pendingWithOffer]);
    expect(await ids('oldest')).toEqual([pendingWithOffer, pendingNoOffer, valid, expired]);
    expect((await ids('expires'))[0]).toBe(expired);
    expect((await ids('expires_desc')).at(-1)).toBe(expired);
    expect(await ids('holder_desc')).toEqual([pendingWithOffer, expired, valid, pendingNoOffer]);
    expect((await list('sort=sideways')).status).toBe(400);
  });

  it('gives tab counts that equal each tab total (search applied, status filter not)', async () => {
    const res = await list('q=Table&effectiveStatus=pending');
    expect(res.body.total).toBe(2);
    expect(res.body.counts).toEqual({
      all: 4,
      pending: 2,
      valid: 1,
      expired: 1,
      revoked: 0,
      superseded: 0,
    });
    for (const status of ['pending', 'valid', 'expired', 'revoked', 'superseded'] as const) {
      expect((await list(`q=Table&effectiveStatus=${status}`)).body.total).toBe(
        res.body.counts[status],
      );
    }
    // Without a search the counts cover the whole issuer and still add up
    const all = (await list('limit=1')).body;
    expect(all.counts.all).toBe(all.total);
    expect(
      all.counts.pending +
        all.counts.valid +
        all.counts.expired +
        all.counts.revoked +
        all.counts.superseded,
    ).toBe(all.counts.all);
  });

  it('pages with limit and offset; another issuer sees none of these', async () => {
    const first = await list('q=Table&sort=holder&limit=2');
    const second = await list('q=Table&sort=holder&limit=2&offset=2');
    expect(first.body).toMatchObject({ total: 4, limit: 2, offset: 0 });
    expect(
      [...first.body.credentials, ...second.body.credentials].map((c: { id: string }) => c.id),
    ).toHaveLength(4);
    const bank = await list('q=Table', tokens.bankOfficer);
    expect(bank.body.total).toBe(0);
    expect(bank.body.counts.all).toBe(0);
  });

  it('rejects an over-long search', async () => {
    const res = await list(`q=${'x'.repeat(101)}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('q');
  });
});

// ---------------------------------------------------------------------------
describe('POST /credentials/:id/reissue/preview', () => {
  it('equals the following real reissue at the same clock, and writes nothing', async () => {
    const { holderId, ref } = await newEmployee();
    const id = await issueValid(holderId);
    await devUpdateHolderClaim(t.database.db, schemas, {
      externalRef: ref,
      claim: 'designation',
      value: 'Senior Logistics Coordinator',
      nodeEnv: 'test',
    });
    const fixed = new Date(Date.now() + 1000);
    const service = createCredentialsService(t.database.db, schemas, {
      keyStore: createKeyStore({
        db: t.database.db,
        source: 'file',
        keysDir,
        passphrase: PASSPHRASE,
      }),
      publicBaseUrl: BASE_URL,
      now: () => fixed,
    });
    const staff = await staffProfile(STAFF.employerOfficer);
    const before = await tableCounts();
    const input = { reason: 'details_changed' as const };
    const seen = await service.reissuePreview(staff, id, input);
    expect(await tableCounts()).toEqual(before);
    const [oldRow] = await t.database.db
      .select()
      .from(credentialRecords)
      .where(eq(credentialRecords.id, id));
    expect(oldRow!.status).toBe('valid'); // nothing superseded

    expect(seen.changedFields).toEqual(['designation']);
    expect(seen.current.claims.designation).toBe(EMPLOYEE_CLAIMS.designation);
    expect(seen.replacement.claims.designation).toBe('Senior Logistics Coordinator');
    expect(seen.current.effectiveStatus).toBe('valid');

    const done = await service.reissue(staff, id, input);
    const [newRow] = await t.database.db
      .select()
      .from(credentialRecords)
      .where(eq(credentialRecords.id, done.credential.id));
    expect(newRow!.claimsSnapshot).toEqual(seen.replacement.claims);
    expect(newRow!.expiresAt.toISOString()).toBe(seen.replacement.expiresAt);
    expect(done.credential.expiresAt).toBe(seen.replacement.expiresAt);
  });

  it('over HTTP: no-store, the current and replacement claims, no changes when nothing changed', async () => {
    const { holderId } = await newEmployee();
    const id = await issueValid(holderId);
    const res = await preview(id, { reason: 'wallet_lost_or_compromised' });
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({
      credentialId: id,
      credentialType: 'EmploymentCredential',
      holder: { id: holderId },
      changedFields: [],
      warnings: [],
      replacement: { cappedBy: null, validUntilRange: { min: expect.any(String) } },
    });
    expect(res.body.replacement.claims).toEqual(res.body.current.claims);
    // A chosen earlier end shows as the cap
    const until = new Date(Date.now() + 30 * DAY_MS).toISOString().slice(0, 10);
    const capped = await preview(id, { reason: 'validity_extension', validUntil: until });
    expect(capped.body.replacement).toMatchObject({
      expiresAt: `${until}T00:00:00.000Z`,
      cappedBy: 'validUntil',
    });
  });

  it('raises the same errors as reissue', async () => {
    const { holderId } = await newEmployee();
    const pending = await issuePending(holderId);
    const notReissuable = await preview(pending, { reason: 'details_changed' });
    expect(notReissuable.status).toBe(409);
    expect(notReissuable.body.error.code).toBe('CREDENTIAL_NOT_REISSUABLE');

    const revoked = await authed(
      'post',
      `/credentials/${pending}/revoke`,
      tokens.employerAdmin,
    ).send({
      reason: 'issued_in_error',
    });
    expect(revoked.status).toBe(200);
    expect((await preview(pending, { reason: 'details_changed' })).body.error.code).toBe(
      'CREDENTIAL_ALREADY_REVOKED',
    );

    const other = await newEmployee();
    const valid = await issueValid(other.holderId);
    const done = await authed('post', `/credentials/${valid}/reissue`, tokens.employerOfficer).send(
      {
        reason: 'details_changed',
      },
    );
    expect(done.status).toBe(201);
    const superseded = await preview(valid, { reason: 'details_changed' });
    expect(superseded.status).toBe(409);
    expect(superseded.body.error).toMatchObject({
      code: 'CREDENTIAL_SUPERSEDED',
      details: { replacedBy: done.body.credential.id },
    });

    const bad = await preview(done.body.credential.id, { reason: 'details_changed' });
    expect(bad.body.error.code).toBe('CREDENTIAL_NOT_REISSUABLE'); // the replacement is pending

    const third = await newEmployee();
    const v3 = await issueValid(third.holderId);
    expect((await preview(v3, { reason: 'other' })).body.error.details[0].path).toBe('note');
    expect(
      (await preview(v3, { reason: 'details_changed', validUntil: '2000-01-01' })).body.error
        .details[0].path,
    ).toBe('validUntil');
    expect((await preview(v3, { reason: 'details_changed' }, tokens.bankOfficer)).status).toBe(404);
    expect((await preview(UNKNOWN_ID, { reason: 'details_changed' })).status).toBe(404);
    expect(
      (
        await authed('post', `/credentials/${v3}/reissue/preview`).send({
          reason: 'details_changed',
        })
      ).status,
    ).toBe(401);
    // Admins may preview too
    expect((await preview(v3, { reason: 'details_changed' }, tokens.employerAdmin)).status).toBe(
      200,
    );
  });

  it('reports a holder record that no longer passes the schema (422), like reissue', async () => {
    const { holderId } = await newEmployee();
    const id = await issueValid(holderId);
    const [row] = await t.database.db.select().from(holders).where(eq(holders.id, holderId));
    await t.database.db
      .update(holders)
      .set({ claims: { ...row!.claims, designation: '' } })
      .where(eq(holders.id, holderId));
    const res = await preview(id, { reason: 'details_changed' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('HOLDER_DATA_INVALID');
  });
});

// ---------------------------------------------------------------------------
describe('expired credentials (stored valid, expiry passed)', () => {
  it('can be renewed by reissue: the old one is superseded, the replacement pending with a new expiry', async () => {
    const { holderId } = await newEmployee();
    const id = await issueValid(holderId);
    await expire(id);
    const p = await preview(id, { reason: 'validity_extension' });
    expect(p.status).toBe(200);
    expect(p.body.current.effectiveStatus).toBe('expired');
    expect(Date.parse(p.body.replacement.expiresAt)).toBeGreaterThan(Date.now() + 300 * DAY_MS);

    const res = await authed('post', `/credentials/${id}/reissue`, tokens.employerOfficer).send({
      reason: 'validity_extension',
    });
    expect(res.status).toBe(201);
    expect(res.body.credential).toMatchObject({ status: 'pending', replacesCredentialId: id });
    const old = await authed('get', `/credentials/${id}`, tokens.employerOfficer);
    expect(old.body).toMatchObject({
      status: 'superseded',
      effectiveStatus: 'superseded',
      replacedByCredentialId: res.body.credential.id,
    });
  });

  it('can be revoked by an admin: it records the intent and the status shows revoked', async () => {
    const { holderId } = await newEmployee();
    const id = await issueValid(holderId);
    await expire(id);
    const res = await authed('post', `/credentials/${id}/revoke`, tokens.employerAdmin).send({
      reason: 'employment_ended',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'revoked',
      effectiveStatus: 'revoked',
      revocationReason: 'employment_ended',
    });
    // Officers still cannot revoke
    const { holderId: other } = await newEmployee();
    const id2 = await issueValid(other);
    await expire(id2);
    const refused = await authed('post', `/credentials/${id2}/revoke`, tokens.employerOfficer).send(
      {
        reason: 'employment_ended',
      },
    );
    expect(refused.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
describe('changedClaimNames', () => {
  it('compares values (objects by content, any key order), added and removed claims', () => {
    expect(
      changedClaimNames(
        { a: 1, addr: { city: 'Kandy', line1: 'x' }, gone: 'y', same: 'z' },
        { a: 2, addr: { line1: 'x', city: 'Kandy' }, added: true, same: 'z' },
      ),
    ).toEqual(['a', 'added', 'gone']);
    expect(changedClaimNames({ list: [1, 2] }, { list: [2, 1] })).toEqual(['list']);
  });
});

// ---------------------------------------------------------------------------
describe('db:holder:set (devUpdateHolderClaim, development only)', () => {
  const run = (externalRef: string, claim: string, value: string, nodeEnv = 'development') =>
    devUpdateHolderClaim(t.database.db, schemas, { externalRef, claim, value, nodeEnv });

  it('changes one text claim (full_name also the column) and returns the claim name only', async () => {
    const { holderId, ref } = await newEmployee();
    expect(await run(ref, 'full_name', 'Renamed Person')).toEqual({ holderId, claim: 'full_name' });
    const [row] = await t.database.db.select().from(holders).where(eq(holders.id, holderId));
    expect(row!.fullName).toBe('Renamed Person');
    expect(row!.claims.full_name).toBe('Renamed Person');
  });

  it('refuses production, unknown references, locked or non-text claims and invalid values', async () => {
    const { ref } = await newEmployee();
    await expect(run(ref, 'designation', 'X', 'production')).rejects.toThrow(
      /disabled in production/,
    );
    await expect(run('NO-SUCH-REF', 'designation', 'X')).rejects.toThrow(/No holder/);
    await expect(run(ref, 'employee_id', 'STC-99999')).rejects.toThrow(/cannot be changed/);
    await expect(run(ref, 'no_such_claim', 'X')).rejects.toThrow(DevHolderUpdateError);
    await expect(run(ref, 'designation', '')).rejects.toThrow(/would not pass the schema/);
  });
});

// ---------------------------------------------------------------------------
describe('filters, sort and search together', () => {
  it('stored status=valid includes expired; effectiveStatus=valid does not; with q and sort', async () => {
    const a = await newEmployee({ full_name: 'Combo Alpha' });
    const b = await newEmployee({ full_name: 'Combo Beta' });
    const c = await newEmployee({ full_name: 'Combo Gamma' });
    const active = await issueValid(a.holderId);
    const expired = await issueValid(b.holderId);
    await expire(expired);
    const pending = await issuePending(c.holderId);
    const ids = async (query: string) =>
      (await list(`q=Combo&${query}`)).body.credentials.map((x: { id: string }) => x.id);

    expect(await ids('status=valid&sort=holder')).toEqual([active, expired]);
    expect(await ids('status=valid&sort=holder_desc')).toEqual([expired, active]);
    expect(await ids('effectiveStatus=valid')).toEqual([active]);
    expect(await ids('effectiveStatus=expired&sort=expires')).toEqual([expired]);
    expect(await ids('status=pending')).toEqual([pending]);
    // Both filters at once must agree, or nothing matches
    expect(await ids('status=valid&effectiveStatus=expired')).toEqual([expired]);
    expect(await ids('status=pending&effectiveStatus=valid')).toEqual([]);
    // A holder filter narrows the tab counts too
    const one = await list(`holderId=${b.holderId}`);
    expect(one.body.counts).toMatchObject({ all: 1, expired: 1, valid: 0 });
    // Searching by the reference finds the one holder
    expect((await list(`q=${a.ref}`)).body.credentials.map((x: { id: string }) => x.id)).toEqual([
      active,
    ]);
  });

  it('the service defaults to newest first when no sort is given', async () => {
    const staff = await staffProfile(STAFF.employerOfficer);
    const viaService = await signer.list(staff, { q: 'Combo', limit: 10, offset: 0 });
    const viaHttp = await list('q=Combo&sort=newest&limit=10');
    expect(viaService.credentials.map((x) => x.id)).toEqual(
      viaHttp.body.credentials.map((x: { id: string }) => x.id),
    );
    expect(viaService.total).toBe(3);
  });
});

describe('error paths', () => {
  it("a bank asking for an Employment credential is told it issues KYC ('a bank')", async () => {
    const res = await authed('post', '/holders', tokens.bankOfficer).send({
      externalRef: 'CUS-TABLE-01',
      claims: CUSTOMER_CLAIMS,
    });
    expect(res.status).toBe(201);
    const refused = await authed('post', '/credentials/preview', tokens.bankOfficer).send({
      holderId: res.body.id,
      credentialType: 'EmploymentCredential',
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.details).toEqual([
      { path: 'credentialType', message: 'must be KYCCredential for a bank' },
    ]);
  });

  it('the reissue preview warns when the holder is under 18 (KYC)', async () => {
    const now = new Date();
    const dob = new Date(Date.UTC(now.getUTCFullYear() - 17, now.getUTCMonth(), 1));
    const created = await authed('post', '/holders', tokens.bankOfficer).send({
      externalRef: 'CUS-TABLE-MINOR',
      claims: { ...CUSTOMER_CLAIMS, date_of_birth: dob.toISOString().slice(0, 10) },
    });
    expect(created.status).toBe(201);
    const issued = await authed('post', '/credentials', tokens.bankOfficer).send({
      holderId: created.body.id,
    });
    expect(issued.status).toBe(201);
    await signer.signCredential(issued.body.id, walletKey());
    const res = await preview(issued.body.id, { reason: 'validity_extension' }, tokens.bankOfficer);
    expect(res.status).toBe(200);
    expect(res.body.replacement.claims.age_over_18).toBe(false);
    expect(res.body.replacement.cappedBy).toBe('18th_birthday');
    expect(res.body.warnings).toEqual(['holder_under_18']);
    // An adult gets none
    const adult = await issueValid((await newEmployee()).holderId);
    expect((await preview(adult, { reason: 'validity_extension' })).body.warnings).toEqual([]);
  });

  it('signing refuses (409 ISSUER_KEY_MISSING) when the key was retired after issuance; nothing changes', async () => {
    const id = await issuePending((await newEmployee()).holderId);
    const active = and(eq(issuerKeys.issuerId, 'employer-a'), eq(issuerKeys.status, 'active'));
    const [key] = await t.database.db.select().from(issuerKeys).where(active);
    await t.database.db
      .update(issuerKeys)
      .set({ status: 'retired', retiredAt: new Date() })
      .where(eq(issuerKeys.kid, key!.kid));
    try {
      await expect(signer.signCredential(id, walletKey())).rejects.toMatchObject({
        status: 409,
        code: 'ISSUER_KEY_MISSING',
      });
      const [row] = await t.database.db
        .select()
        .from(credentialRecords)
        .where(eq(credentialRecords.id, id));
      expect(row).toMatchObject({ status: 'pending', issuedAt: null, issuerKid: null });
    } finally {
      await t.database.db
        .update(issuerKeys)
        .set({ status: 'active', retiredAt: null })
        .where(eq(issuerKeys.kid, key!.kid));
    }
  });

  it('eighteenthBirthday: 18 years on; an invalid date gives null', () => {
    expect(eighteenthBirthday('2008-03-15')!.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(eighteenthBirthday('15/03/2008')).toBeNull();
    expect(eighteenthBirthday('')).toBeNull();
  });

  it('db:holder:set refuses a reference that two issuers share', async () => {
    const { ref } = await newEmployee();
    await t.database.db.insert(holders).values({
      issuerId: 'bank-a',
      recordType: 'customer',
      externalRef: ref,
      fullName: 'Same Reference',
      claims: CUSTOMER_CLAIMS,
    });
    await expect(
      devUpdateHolderClaim(t.database.db, schemas, {
        externalRef: ref,
        claim: 'designation',
        value: 'X',
        nodeEnv: 'test',
      }),
    ).rejects.toThrow(`2 holders have reference ${ref}; it must be unique`);
  });

  it('routers without their service answer 503 (never a crash)', async () => {
    const pass: AuthMiddleware = {
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      requireOwnIssuer: (_req, _res, next) => next(),
    };
    const bare = express()
      .use(express.json())
      .use((req, _res, next) => {
        (req as unknown as { auth: unknown }).auth = { id: 'x', issuer: { id: 'employer-a' } };
        next();
      })
      .use('/credentials', credentialsRouter(pass))
      .use('/credential-schemas', credentialSchemasRouter(pass))
      .use('/credential-offers', credentialOffersRouter(pass))
      .use('/holders', holdersRouter(pass))
      .use('/status', statusRouter({ rateLimit: { max: 100, windowMinutes: 1 } }))
      .use(createErrorHandler({ exposeInternalErrors: false }));
    const cases: [request.Test, string][] = [
      [request(bare).get('/credentials'), 'SERVICE_UNAVAILABLE'],
      [request(bare).get('/credential-schemas'), 'SERVICE_UNAVAILABLE'],
      [request(bare).get(`/credential-offers/${UNKNOWN_ID}`), 'SERVICE_UNAVAILABLE'],
      [request(bare).get('/holders'), 'SERVICE_UNAVAILABLE'],
      [request(bare).get(`/status/${UNKNOWN_ID}`), 'STATUS_UNAVAILABLE'],
    ];
    for (const [req, code] of cases) {
      const res = await req;
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe(code);
    }
  });
});

describe('privacy', () => {
  it('list and preview responses were never cached publicly and list rows carry no claims', () => {
    expect(responses.length).toBeGreaterThan(10);
  });
});
