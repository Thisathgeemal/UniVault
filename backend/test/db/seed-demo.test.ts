/**
 * Dashboard demo data (npm run db:seed:demo): src/db/seed-demo.ts on a throwaway in-memory
 * database loaded with the real synthetic seed data (backend/seed-data).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, isNotNull, ne } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StaffProfile } from '../../src/auth/auth-service.js';
import type { Database } from '../../src/db/client.js';
import {
  credentialOffers,
  credentialRecords,
  credentialStatusEvents,
  issuerStaff,
} from '../../src/db/schema.js';
import { seedDatabase } from '../../src/db/seed.js';
import {
  DEMO_STAFF_NAME,
  demoCountsTable,
  removeDemoData,
  seedDemoData,
  type DemoSeedOptions,
} from '../../src/db/seed-demo.js';
import { createKeyStore, type KeyStore } from '../../src/keys/key-store.js';
import { loadCredentialSchemas } from '../../src/services/credential-schemas.js';
import { createCredentialsService } from '../../src/services/credentials.service.js';
import { createDashboardService } from '../../src/services/dashboard.service.js';
import { createIssuerKeysService } from '../../src/services/issuer-keys.service.js';
import { fileURLToPath } from 'node:url';
import { testConfig } from '../helpers.js';
import { freshDatabase } from './helpers.js';

/** The configured default offer lifetime, as db:seed:demo uses it. */
const OFFER_TTL_SECONDS = testConfig().CREDENTIAL_OFFER_TTL_SECONDS;

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const NOW = new Date('2026-11-25T06:00:00.000Z');
const DEMO_EMAIL = 'demo-data@serendib-trading.example';

let database: Database;
let keysDir: string;
let keyStore: KeyStore;
const schemas = loadCredentialSchemas();
const options = (overrides: Partial<DemoSeedOptions> = {}): DemoSeedOptions => ({
  keyStore,
  schemas,
  publicBaseUrl: BASE_URL,
  offerTtlSeconds: OFFER_TTL_SECONDS,
  nodeEnv: 'development',
  now: () => NOW,
  ...overrides,
});
const EXPECTED_COUNTS = {
  active: 8, // 4 active + 3 expiring + the superseded credential's signed replacement
  expiringSoon: 3,
  pending: 3,
  openOffers: 3,
  revokedAfterSigning: 1,
  revokedWhilePending: 1,
  superseded: 1,
  expired: 1,
};

const staffProfile = async (email: string): Promise<StaffProfile> => {
  const row = await database.db.query.issuerStaff.findFirst({
    where: eq(issuerStaff.email, email),
    with: { issuer: true },
  });
  return {
    id: row!.id,
    email: row!.email,
    displayName: row!.displayName,
    role: row!.role,
    issuer: { id: row!.issuer.id, name: row!.issuer.name, type: row!.issuer.issuerType },
  };
};
const rowCounts = async () => ({
  credentials: (await database.db.select().from(credentialRecords)).length,
  events: (await database.db.select().from(credentialStatusEvents)).length,
  offers: (await database.db.select().from(credentialOffers)).length,
  staff: (await database.db.select().from(issuerStaff)).length,
});

beforeAll(async () => {
  database = await freshDatabase();
  await seedDatabase(database.db, { staffPassword: 'test-password-123' });
  keysDir = await mkdtemp(join(tmpdir(), 'univault-demo-'));
  keyStore = createKeyStore({ db: database.db, source: 'file', keysDir, passphrase: PASSPHRASE });
});

afterAll(async () => {
  await database.close();
  await rm(keysDir, { recursive: true, force: true });
});

describe('db:seed:demo', () => {
  it('refuses NODE_ENV=production (seed and reset)', async () => {
    await expect(seedDemoData(database.db, options({ nodeEnv: 'production' }))).rejects.toThrow(
      /disabled in production/,
    );
    await expect(removeDemoData(database.db, 'production')).rejects.toThrow(
      /disabled in production/,
    );
  });

  it('asks for keys:init when the issuer has no active signing key, and writes nothing', async () => {
    const before = await rowCounts();
    await expect(seedDemoData(database.db, options())).rejects.toThrow(/keys:init/);
    expect(await rowCounts()).toEqual(before);
  });

  it('creates credentials of every status for Serendib Trading only, through the real services', async () => {
    await createIssuerKeysService(database.db, { keyStore, publicBaseUrl: BASE_URL }).generateKey(
      'employer-a',
    );
    const result = await seedDemoData(database.db, options());
    expect(result).toEqual({ outcome: 'created', counts: EXPECTED_COUNTS });

    // The dashboard sees exactly the demo data
    const staff = await staffProfile('admin@serendib-trading.example');
    const summary = await createDashboardService(database.db, { now: () => NOW }).summary(staff);
    expect(summary.counts).toEqual({
      issued: 11,
      active: 8,
      revoked: 1,
      superseded: 1,
      expired: 1,
      awaitingWallet: 3,
      expiringSoon: 3,
      holders: 25,
    });
    expect(summary.recentActivity).toHaveLength(10);

    // Every other issuer stays empty
    const others = await database.db
      .select()
      .from(credentialRecords)
      .where(ne(credentialRecords.issuerId, 'employer-a'));
    expect(others).toEqual([]);

    // Real signing path: issuer kid + wallet key thumbprint on every signed credential
    const signed = await database.db
      .select()
      .from(credentialRecords)
      .where(isNotNull(credentialRecords.issuedAt));
    expect(signed).toHaveLength(11); // the issued count (pending and pending-revoked are unsigned)
    for (const row of signed) {
      expect(row.issuerKid).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(row.holderKeyThumbprint).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
    // Superseded through the real reissue (replacement linked), expired through simulateExpiry
    const replacement = signed.find((r) => r.replacesCredentialId !== null);
    expect(replacement?.status).toBe('valid');
    const expiryEvents = await database.db
      .select()
      .from(credentialStatusEvents)
      .where(eq(credentialStatusEvents.reason, 'dev_simulated_expiry'));
    expect(expiryEvents).toHaveLength(1);
  });

  it('uses an inactive demo account that can never sign in', async () => {
    const [staff] = await database.db
      .select()
      .from(issuerStaff)
      .where(eq(issuerStaff.email, DEMO_EMAIL));
    expect(staff).toMatchObject({
      isActive: false,
      displayName: DEMO_STAFF_NAME,
      issuerId: 'employer-a',
    });
  });

  it('is idempotent: a second run skips and creates nothing', async () => {
    const before = await rowCounts();
    // Same injected clock as the first run: never mix it with the real time (Sprint 1 Issue
    // "date-dependent test – time bomb": the offers expire OFFER_TTL_SECONDS after NOW)
    const again = await seedDemoData(database.db, options());
    expect(again).toEqual({ outcome: 'skipped', counts: EXPECTED_COUNTS });
    expect(await rowCounts()).toEqual(before);
  });

  it('a skipped run counts at its own clock: open offers drop to 0 after their TTL', async () => {
    const before = await rowCounts();
    const afterTtl = new Date(NOW.getTime() + OFFER_TTL_SECONDS * 1000); // expiry is exclusive
    const later = await seedDemoData(database.db, options({ now: () => afterTtl }));
    expect(later).toEqual({ outcome: 'skipped', counts: { ...EXPECTED_COUNTS, openOffers: 0 } });
    expect(await rowCounts()).toEqual(before);
  });

  it('--reset removes only the demo rows; seeding again works', async () => {
    // A credential made by a real officer must survive the reset
    const officer = await staffProfile('officer@serendib-trading.example');
    const holder = await database.db.query.holders.findFirst({
      where: (h, { eq: equals }) => equals(h.externalRef, 'STC-00049'),
    });
    const credentials = createCredentialsService(database.db, schemas, {
      keyStore,
      publicBaseUrl: BASE_URL,
      now: () => NOW,
    });
    const own = await credentials.create(officer, { holderId: holder!.id });

    const removed = await removeDemoData(database.db, 'development');
    expect(removed.credentials).toBe(15); // one per demo holder (14) + the reissue replacement
    const left = await database.db.select().from(credentialRecords);
    expect(left.map((r) => r.id)).toEqual([own.id]);
    const leftEvents = await database.db.select().from(credentialStatusEvents);
    expect(leftEvents.every((e) => e.credentialId === own.id)).toBe(true);
    expect(
      await database.db.select().from(issuerStaff).where(eq(issuerStaff.email, DEMO_EMAIL)),
    ).toEqual([]);
    expect(await removeDemoData(database.db, 'development')).toEqual({ credentials: 0 });
    // The append-only guard is back on after the reset
    const remove = database.db
      .delete(credentialStatusEvents)
      .where(eq(credentialStatusEvents.credentialId, own.id));
    await expect(remove).rejects.toThrow();
    expect(
      (
        await database.db
          .select()
          .from(credentialStatusEvents)
          .where(eq(credentialStatusEvents.credentialId, own.id))
      ).length,
    ).toBe(1);

    // Fresh demo data again (the officer's holder is skipped: it has a pending credential)
    const again = await seedDemoData(database.db, options());
    expect(again.outcome).toBe('created');
    expect(again.counts).toEqual(EXPECTED_COUNTS);
    const ownStill = await database.db
      .select()
      .from(credentialRecords)
      .where(and(eq(credentialRecords.id, own.id), eq(credentialRecords.status, 'pending')));
    expect(ownStill).toHaveLength(1);
  });

  it('prints counts per status only', () => {
    const table = demoCountsTable(EXPECTED_COUNTS);
    expect(table).toHaveLength(8);
    expect(table[0]).toEqual({ status: 'active', credentials: 8 });
    for (const row of table) expect(Object.keys(row).sort()).toEqual(['credentials', 'status']);
  });
});

describe('db:seed:demo – missing prerequisites', () => {
  it('asks for db:seed when the Serendib Trading seed issuer is missing', async () => {
    const empty = await freshDatabase();
    try {
      await expect(seedDemoData(empty.db, options())).rejects.toThrow(/db:seed/);
      await expect(removeDemoData(empty.db, 'development')).rejects.toThrow(/db:seed/);
    } finally {
      await empty.close();
    }
  });

  it('refuses when the issuer has too few free holders, and writes nothing', async () => {
    const small = await freshDatabase();
    const dir = await mkdtemp(join(tmpdir(), 'univault-demo-small-'));
    try {
      // The test fixtures have only 2 Serendib Trading employees
      await seedDatabase(small.db, {
        dataDir: fileURLToPath(new URL('../fixtures/seed-data/', import.meta.url)),
        staffPassword: 'test-password-123',
      });
      const store = createKeyStore({
        db: small.db,
        source: 'file',
        keysDir: dir,
        passphrase: PASSPHRASE,
      });
      await createIssuerKeysService(small.db, {
        keyStore: store,
        publicBaseUrl: BASE_URL,
      }).generateKey('employer-a');
      await expect(seedDemoData(small.db, options({ keyStore: store }))).rejects.toThrow(
        /Not enough free holders for employer-a: 14 needed, 2 found/,
      );
      expect(await small.db.select().from(credentialRecords)).toEqual([]);
      expect(
        await small.db.select().from(issuerStaff).where(eq(issuerStaff.email, DEMO_EMAIL)),
      ).toEqual([]);
    } finally {
      await small.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
