import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createDatabase, type Database } from '../../src/db/client.js';
import { holders, issuerStaff } from '../../src/db/schema.js';
import { seedDatabase } from '../../src/db/seed.js';
import { verifyPassword } from '../../src/lib/passwords.js';
import { testConfig } from '../helpers.js';
import { freshDatabase } from './helpers.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/seed-data/', import.meta.url));

describe('seeding sample records', () => {
  let database: Database;
  beforeAll(async () => {
    database = await freshDatabase();
  });
  afterAll(() => database.close());

  it('stores issuers, staff and holders from the synthetic seed data', async () => {
    const result = await seedDatabase(database.db, {
      dataDir: FIXTURES,
      staffPassword: 'test-password-123',
    });
    expect(result).toMatchObject({ issuers: 3, staff: 6, holders: 5 });
  });

  it('retrieves holders with their issuer and original claims', async () => {
    const employee = await database.db.query.holders.findFirst({
      where: eq(holders.externalRef, 'STC-00001'),
      with: { issuer: true },
    });
    expect(employee?.issuer.id).toBe('employer-a');
    expect(employee?.recordType).toBe('employee');
    expect(employee?.claims).toHaveProperty('designation');
    expect(employee?.subjectRef).toBe('P0001');

    const customers = await database.db
      .select()
      .from(holders)
      .where(eq(holders.issuerId, 'bank-a'));
    expect(customers).toHaveLength(2);
    expect(customers[0]?.claims).toHaveProperty('id_document_number');
  });

  it('links the same synthetic person across two issuers via subject_ref', async () => {
    const records = await database.db.select().from(holders).where(eq(holders.subjectRef, 'P0001'));
    expect(records.map((r) => r.issuerId).sort()).toEqual(['bank-a', 'employer-a']);
  });

  it('creates working staff logins', async () => {
    const admin = await database.db.query.issuerStaff.findFirst({
      where: eq(issuerStaff.email, 'admin@bank-a.example'),
    });
    expect(admin?.role).toBe('admin');
    expect(await verifyPassword('test-password-123', admin!.passwordHash)).toBe(true);
  });

  it('is safe to run again (no duplicates)', async () => {
    const again = await seedDatabase(database.db, {
      dataDir: FIXTURES,
      staffPassword: 'test-password-123',
    });
    expect(again).toMatchObject({ issuers: 0, staff: 0, holders: 0 });
  });
});

describe('database URL', () => {
  it('rejects an unsupported DATABASE_URL', async () => {
    await expect(createDatabase('mysql://localhost/db')).rejects.toThrow(
      /pglite:\/\/ or postgres:\/\//,
    );
  });
});

describe('health endpoint reports the database', () => {
  it('reports database "up" when connected', async () => {
    const database = await freshDatabase();
    const app = createApp(testConfig(), pino({ level: 'silent' }), { database });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
    expect(res.body.keys).toEqual({ status: 'ok', activeKeys: 0, loaded: 0 });
    await database.close();
  });

  it('returns 503 "degraded" when the database is down', async () => {
    const database = await freshDatabase();
    await database.close();
    const app = createApp(testConfig(), pino({ level: 'silent' }), { database });
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: 'degraded', database: 'down' });
    // The keys can't be counted without the database: unknown, not "ok" with zero counts
    expect(res.body.keys).toEqual({ status: 'unknown' });
  });
});
