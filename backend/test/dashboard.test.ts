/**
 * Issuer dashboard summary: GET /api/v1/dashboard/summary (docs/api/dashboard-api.md).
 *
 * One fixture covers every status for employer-a (active, expiring soon, expired by the clock,
 * revoked after signing, revoked while pending, superseded, pending), plus bank-a data that
 * must never be counted for employer-a, and an issuer with no data at all.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords, holders, issuers, issuerStaff } from '../src/db/schema.js';
import { createKeyStore } from '../src/keys/key-store.js';
import { hashPassword } from '../src/lib/passwords.js';
import type { AuthMiddleware } from '../src/auth/middleware.js';
import { createErrorHandler } from '../src/middleware/error-handler.js';
import { dashboardRouter } from '../src/routes/dashboard.routes.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import { effectiveStatus } from '../src/services/credential-status.js';
import {
  createCredentialsService,
  type CredentialsService,
} from '../src/services/credentials.service.js';
import type { DashboardCounts } from '../src/services/dashboard.service.js';
import { authedTestApp, PASSWORD, STAFF, type AuthedTestApp } from './auth-helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const DAY = 86_400_000;
const HOUR = 3_600_000;
/** The instant the dashboard is evaluated at (the fixture is built relative to it). */
const NOW = new Date('2026-11-25T06:00:00.000Z');
const EMPTY_ADMIN = 'admin@empty-issuer.example';
const SECRET_NOTE = 'confidential-note-should-never-appear';

const fixture = (file: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
    records: { claims: Record<string, unknown> }[];
  };
const EMPLOYEE_CLAIMS = fixture('employees.json').records[0]!.claims;
const CUSTOMER_CLAIMS = fixture('customers.json').records[0]!.claims;

let fixedNow = NOW;
const clock = () => fixedNow;

let keysDir: string;
let t: AuthedTestApp;
let signer: CredentialsService;
let tokens: Record<'officer' | 'admin' | 'bankOfficer' | 'bankAdmin' | 'emptyAdmin', string>;
/** employer-a credential ids by role in the fixture. */
const ids: Record<string, string> = {};
const bankCredentialIds: string[] = [];

const api = (method: 'get' | 'post', path: string, token: string) =>
  request(t.app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
const summary = async (token = tokens.officer) => {
  const res = await api('get', '/dashboard/summary', token);
  expect(res.status).toBe(200);
  return res.body as {
    issuer: { id: string; name: string };
    counts: DashboardCounts;
    expiringSoonDays: number;
    recentActivity: Record<string, unknown>[];
    generatedAt: string;
  };
};
const walletKey = () =>
  generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
/** Runs a step with the shared clock at `at`. */
async function atTime<T>(at: Date, step: () => Promise<T>): Promise<T> {
  fixedNow = at;
  try {
    return await step();
  } finally {
    fixedNow = NOW;
  }
}

let employeeCounter = 0;
async function newEmployee() {
  employeeCounter += 1;
  const res = await api('post', '/holders', tokens.officer).send({
    claims: { ...EMPLOYEE_CLAIMS, employee_id: `DSH-${String(employeeCounter).padStart(5, '0')}` },
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}
async function createPending(at: Date, token = tokens.officer, holderId?: string) {
  return atTime(at, async () => {
    const res = await api('post', '/credentials', token).send({
      holderId: holderId ?? (await newEmployee()),
    });
    expect(res.status).toBe(201);
    return res.body.id as string;
  });
}
async function createSigned(at: Date) {
  const id = await createPending(at);
  await atTime(new Date(at.getTime() + HOUR), () => signer.signCredential(id, walletKey()));
  return id;
}
const oneYearBefore = (d: Date) => {
  const r = new Date(d);
  r.setUTCFullYear(r.getUTCFullYear() - 1);
  return r;
};
const expiresAtOf = async (id: string) =>
  (await t.database.db.select().from(credentialRecords).where(eq(credentialRecords.id, id)))[0]!
    .expiresAt;

/** Reference implementation in JS: the dashboard definitions applied with effectiveStatus(). */
async function expectedCounts(issuerId: string, at: Date): Promise<DashboardCounts> {
  const rows = await t.database.db
    .select()
    .from(credentialRecords)
    .where(eq(credentialRecords.issuerId, issuerId));
  const holderRows = await t.database.db
    .select()
    .from(holders)
    .where(eq(holders.issuerId, issuerId));
  const c: DashboardCounts = {
    issued: 0,
    active: 0,
    revoked: 0,
    superseded: 0,
    expired: 0,
    awaitingWallet: 0,
    expiringSoon: 0,
    holders: holderRows.length,
  };
  for (const row of rows) {
    const status = effectiveStatus(row, at);
    if (status === 'pending') c.awaitingWallet += 1;
    if (row.issuedAt === null) continue;
    c.issued += 1;
    if (status === 'valid') {
      c.active += 1;
      if (row.expiresAt.getTime() < at.getTime() + 30 * DAY) c.expiringSoon += 1;
    } else if (status !== 'pending') c[status] += 1;
  }
  return c;
}

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-dashboard-'));
  t = await authedTestApp(
    { ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: PASSPHRASE, PUBLIC_BASE_URL: BASE_URL },
    undefined,
    { now: clock },
  );
  // An issuer with no holders and no credentials at all
  await t.database.db
    .insert(issuers)
    .values({ id: 'empty-issuer', name: 'Empty Issuer (Test)', issuerType: 'employer' });
  await t.database.db.insert(issuerStaff).values({
    issuerId: 'empty-issuer',
    email: EMPTY_ADMIN,
    displayName: 'Empty Admin',
    role: 'admin',
    passwordHash: await hashPassword(PASSWORD),
  });
  const [officer, admin, bankOfficer, bankAdmin, emptyAdmin] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.employerAdmin),
    t.tokenFor(STAFF.bankOfficer),
    t.tokenFor(STAFF.bankAdmin),
    t.tokenFor(EMPTY_ADMIN),
  ]);
  tokens = { officer, admin, bankOfficer, bankAdmin, emptyAdmin };
  expect((await api('post', '/issuers/employer-a/keys', admin)).status).toBe(201);
  expect((await api('post', '/issuers/bank-a/keys', bankAdmin)).status).toBe(201);
  signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
    keyStore: createKeyStore({
      db: t.database.db,
      source: 'file',
      keysDir,
      passphrase: PASSPHRASE,
    }),
    publicBaseUrl: BASE_URL,
    now: clock,
  });

  // --- employer-a: every status ---
  ids.active1 = await createSigned(new Date(NOW.getTime() - 10 * DAY));
  ids.active2 = await createSigned(new Date(NOW.getTime() - 5 * DAY));
  // Default validity P1Y: created a year before NOW + 20 days â†’ expires 20 days after NOW
  ids.expiringSoon = await createSigned(oneYearBefore(new Date(NOW.getTime() + 20 * DAY)));
  // Expired by the clock only (stored 'valid'; no simulated-expiry event)
  ids.expiredByClock = await createSigned(oneYearBefore(new Date(NOW.getTime() - 15 * DAY)));
  ids.revokedSigned = await createSigned(new Date(NOW.getTime() - 20 * DAY));
  await atTime(new Date(NOW.getTime() - 2 * DAY), async () => {
    const res = await api('post', `/credentials/${ids.revokedSigned}/revoke`, tokens.admin).send({
      reason: 'other',
      note: SECRET_NOTE,
    });
    expect(res.status).toBe(200);
  });
  ids.pendingRevoked = await createPending(new Date(NOW.getTime() - 3 * DAY));
  await atTime(new Date(NOW.getTime() - 3 * DAY + HOUR), async () => {
    const res = await api('post', `/credentials/${ids.pendingRevoked}/revoke`, tokens.admin).send({
      reason: 'issued_in_error',
    });
    expect(res.status).toBe(200);
  });
  ids.superseded = await createSigned(new Date(NOW.getTime() - 30 * DAY));
  ids.replacement = await atTime(new Date(NOW.getTime() - DAY), async () => {
    const res = await api('post', `/credentials/${ids.superseded}/reissue`, tokens.officer).send({
      reason: 'details_changed',
    });
    expect(res.status).toBe(201);
    return res.body.credential.id as string;
  });
  ids.pending = await createPending(new Date(NOW.getTime() - HOUR));

  // --- bank-a: its own data, never counted for employer-a ---
  const customer = await api('post', '/holders', tokens.bankOfficer).send({
    externalRef: 'DASH-CUST-1',
    claims: CUSTOMER_CLAIMS,
  });
  expect(customer.status).toBe(201);
  const bankPending = await createPending(
    new Date(NOW.getTime() - 4 * DAY),
    tokens.bankOfficer,
    customer.body.id as string,
  );
  await atTime(new Date(NOW.getTime() - 4 * DAY + HOUR), () =>
    signer.signCredential(bankPending, walletKey()),
  );
  bankCredentialIds.push(bankPending);
});

afterEach(() => {
  fixedNow = NOW;
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

describe('GET /dashboard/summary â€“ counts', () => {
  it('returns every count for the fixture covering all statuses', async () => {
    const body = await summary();
    expect(body.issuer).toEqual({ id: 'employer-a', name: 'Serendib Trading Company (Demo)' });
    expect(body.counts).toEqual({
      // active1, active2, expiringSoon, expiredByClock, revokedSigned, superseded
      issued: 6,
      active: 3, // active1, active2, expiringSoon
      revoked: 1, // revokedSigned only: pendingRevoked was never signed
      superseded: 1,
      expired: 1, // expiredByClock
      awaitingWallet: 2, // pending, replacement
      expiringSoon: 1,
      holders: 2 + employeeCounter, // 2 fixture employees + the ones created here
    });
    expect(body.expiringSoonDays).toBe(30);
    expect(body.generatedAt).toBe(NOW.toISOString());
  });

  it('holds the invariant issued = active + revoked + superseded + expired', async () => {
    const { counts } = await summary();
    expect(counts.issued).toBe(counts.active + counts.revoked + counts.superseded + counts.expired);
  });

  it('counts a credential revoked while pending in none of the issued counts', async () => {
    const before = await summary();
    // Same issuer, one more pending credential revoked before signing
    const id = await createPending(NOW);
    expect(
      (
        await api('post', `/credentials/${id}/revoke`, tokens.admin).send({
          reason: 'issued_in_error',
        })
      ).status,
    ).toBe(200);
    const after = await summary();
    expect(after.counts).toEqual({ ...before.counts, holders: before.counts.holders + 1 });
    ids.pendingRevoked2 = id;
  });

  it('treats expires_at itself as expired (inclusive boundary, like effectiveStatus)', async () => {
    const expiresAt = await expiresAtOf(ids.expiringSoon!);
    const before = await atTime(new Date(expiresAt.getTime() - 1), () => summary());
    const atExpiry = await atTime(expiresAt, () => summary());
    expect(atExpiry.counts.active).toBe(before.counts.active - 1);
    expect(atExpiry.counts.expired).toBe(before.counts.expired + 1);
    expect(atExpiry.counts.issued).toBe(before.counts.issued);
  });

  it('counts expiringSoon only when expires_at < now + 30 days (strict)', async () => {
    const expiresAt = await expiresAtOf(ids.expiringSoon!);
    const exactly30 = await atTime(new Date(expiresAt.getTime() - 30 * DAY), () => summary());
    const justInside = await atTime(new Date(expiresAt.getTime() - 30 * DAY + 1), () => summary());
    expect(justInside.counts.expiringSoon).toBe(exactly30.counts.expiringSoon + 1);
    expect(exactly30.counts.active).toBe(justInside.counts.active);
  });

  it('matches effectiveStatus() at every expiry boundary of the fixture (SQL = JS rule)', async () => {
    const rows = await t.database.db
      .select({ expiresAt: credentialRecords.expiresAt })
      .from(credentialRecords)
      .where(eq(credentialRecords.issuerId, 'employer-a'));
    const instants = [NOW];
    for (const { expiresAt } of rows) {
      for (const offset of [-1, 0, 1, -30 * DAY, -30 * DAY + 1]) {
        instants.push(new Date(expiresAt.getTime() + offset));
      }
    }
    for (const at of instants) {
      const body = await atTime(at, () => summary());
      expect(body.counts, at.toISOString()).toEqual(await expectedCounts('employer-a', at));
      const c = body.counts;
      expect(c.issued).toBe(c.active + c.revoked + c.superseded + c.expired);
    }
  });

  it('equals the totals of GET /credentials?effectiveStatus=â€¦ for each status', async () => {
    const { counts } = await summary();
    const total = async (effectiveStatus: string) => {
      const res = await api(
        'get',
        `/credentials?effectiveStatus=${effectiveStatus}`,
        tokens.officer,
      );
      expect(res.status).toBe(200);
      return res.body.total as number;
    };
    expect(await total('valid')).toBe(counts.active);
    expect(await total('expired')).toBe(counts.expired);
    expect(await total('superseded')).toBe(counts.superseded);
    expect(await total('pending')).toBe(counts.awaitingWallet);
    // The list's 'revoked' also includes credentials revoked while pending (never signed); the
    // dashboard's 'revoked' counts only issued ones. The difference is exactly those.
    const revokedWhilePending = (
      await t.database.db
        .select()
        .from(credentialRecords)
        .where(eq(credentialRecords.issuerId, 'employer-a'))
    ).filter((r) => r.status === 'revoked' && r.issuedAt === null).length;
    expect(revokedWhilePending).toBeGreaterThan(0);
    expect(await total('revoked')).toBe(counts.revoked + revokedWhilePending);
  });

  it("never counts another issuer's data (two issuers in one database)", async () => {
    const employer = await summary();
    expect(employer.counts).toEqual(await expectedCounts('employer-a', NOW));
    const bank = await summary(tokens.bankOfficer);
    expect(bank.issuer.id).toBe('bank-a');
    expect(bank.counts).toEqual({
      issued: 1,
      active: 1,
      revoked: 0,
      superseded: 0,
      expired: 0,
      awaitingWallet: 0,
      expiringSoon: 0,
      holders: 3, // 2 fixture customers + the one created here
    });
    const bankIds = bank.recentActivity.map((a) => a.credentialId);
    expect(new Set(bankIds)).toEqual(new Set(bankCredentialIds));
    const employerIds = employer.recentActivity.map((a) => a.credentialId);
    for (const id of bankCredentialIds) expect(employerIds).not.toContain(id);
  });

  it('returns all zeros and no activity for an issuer with no data', async () => {
    const body = await summary(tokens.emptyAdmin);
    expect(body.issuer).toEqual({ id: 'empty-issuer', name: 'Empty Issuer (Test)' });
    expect(body.counts).toEqual({
      issued: 0,
      active: 0,
      revoked: 0,
      superseded: 0,
      expired: 0,
      awaitingWallet: 0,
      expiringSoon: 0,
      holders: 0,
    });
    expect(body.recentActivity).toEqual([]);
  });
});

describe('GET /dashboard/summary â€“ recent activity', () => {
  it('lists the last 10 status changes of this issuer, newest first', async () => {
    const { recentActivity } = await summary();
    expect(recentActivity).toHaveLength(10);
    const times = recentActivity.map((a) => Date.parse(a.at as string));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
    // The newest event is the revocation of pendingRevoked2 (created in an earlier test at NOW)
    expect(recentActivity[0]).toMatchObject({
      credentialId: ids.pendingRevoked2,
      fromStatus: 'pending',
      toStatus: 'revoked',
      reason: 'issued_in_error',
    });
  });

  it('orders events of the same instant in reverse lifecycle order', async () => {
    // Reissue writes the superseded event and the replacement's creation at the same instant
    const { recentActivity } = await summary();
    const reissueAt = recentActivity.filter(
      (a) => a.at === new Date(NOW.getTime() - DAY).toISOString(),
    );
    expect(reissueAt.map((a) => a.toStatus)).toEqual(['superseded', 'pending']);
  });

  it('returns exactly the documented fields: reason codes, staff names, no notes or claims', async () => {
    const { recentActivity } = await summary(tokens.admin);
    for (const a of recentActivity) {
      expect(Object.keys(a).sort()).toEqual(
        [
          'at',
          'credentialId',
          'credentialType',
          'fromStatus',
          'reason',
          'staffName',
          'toStatus',
        ].sort(),
      );
    }
    const json = JSON.stringify(recentActivity);
    expect(json).not.toContain(SECRET_NOTE);
    for (const value of [EMPLOYEE_CLAIMS.full_name, EMPLOYEE_CLAIMS.nic_number, 'DSH-0000']) {
      if (typeof value === 'string') expect(json).not.toContain(value);
    }
    expect(json).not.toMatch(/"note"|"claims"|"holder"/);
  });

  it('names the staff member, or null for wallet (signing) events', async () => {
    const res = await api('get', '/dashboard/summary', tokens.officer);
    const activity = res.body.recentActivity as Record<string, unknown>[];
    const signing = activity.find((a) => a.toStatus === 'valid');
    const revoke = activity.find((a) => a.toStatus === 'revoked');
    const create = activity.find((a) => a.toStatus === 'pending');
    expect(signing?.staffName).toBeNull();
    expect(revoke?.staffName).toBe('Serendib Trading Company (Demo) Admin');
    expect(create?.staffName).toBe('Serendib Trading Company (Demo) Officer');
    expect(create?.credentialType).toBe('EmploymentCredential');
  });
});

describe('GET /dashboard/summary â€“ access', () => {
  it('allows officers and admins, with the same issuer-scoped result', async () => {
    const officer = await summary(tokens.officer);
    const admin = await summary(tokens.admin);
    expect(admin.counts).toEqual(officer.counts);
    expect(admin.issuer).toEqual(officer.issuer);
  });

  it('answers 401 without a token or with an invalid one', async () => {
    const none = await request(t.app).get('/api/v1/dashboard/summary');
    expect(none.status).toBe(401);
    expect(none.body.error.code).toBe('UNAUTHENTICATED');
    const bad = await api('get', '/dashboard/summary', 'not-a-token');
    expect(bad.status).toBe(401);
  });

  it('takes the issuer from the token only (an issuer id in the query is ignored)', async () => {
    const res = await api('get', '/dashboard/summary?issuerId=bank-a', tokens.officer);
    expect(res.status).toBe(200);
    expect(res.body.issuer.id).toBe('employer-a');
  });

  it('sends Cache-Control: no-store', async () => {
    const res = await api('get', '/dashboard/summary', tokens.officer);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 503 SERVICE_UNAVAILABLE when no dashboard service is configured', async () => {
    const pass: AuthMiddleware = {
      requireAuth: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      requireOwnIssuer: (_req, _res, next) => next(),
    };
    const bare = express()
      .use('/dashboard', dashboardRouter(pass))
      .use(createErrorHandler({ exposeInternalErrors: false }));
    const res = await request(bare).get('/dashboard/summary');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
