import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableColumns, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { MIGRATIONS_DIR, runMigrations } from '../../src/db/migrate.js';
import * as schema from '../../src/db/schema.js';
import {
  DEV_EVENT_REASONS,
  REISSUE_REASONS,
  REVOCATION_REASONS,
} from '../../src/services/credentials.service.js';
import { OFFER_INVALIDATION_REASONS } from '../../src/services/credential-offers.service.js';
import { dbError, freshDatabase } from './helpers.js';

const rows = async <T>(database: Database, query: ReturnType<typeof sql>) =>
  ((await database.db.execute(query)) as unknown as { rows: T[] }).rows;

describe('migrations', () => {
  let database: Database;
  beforeAll(async () => {
    database = await createDatabase('pglite://memory');
  });
  afterAll(() => database.close());

  it('creates all tables on an empty database', async () => {
    const result = await runMigrations(database);
    expect(result.applied).toEqual([
      '0001_initial_schema.sql',
      '0002_staff_login_protection.sql',
      '0003_holder_audit.sql',
      '0004_offer_invalidation.sql',
      '0005_revocation_and_status_events.sql',
      '0006_reason_value_checks.sql',
      '0007_dev_simulated_expiry_event.sql',
      '0008_offer_invalidation_reason.sql',
    ]);
    const tables = await rows<{ table_name: string }>(
      database,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'credential_offers',
      'credential_records',
      'credential_status_events',
      'holders',
      'issuer_keys',
      'issuer_staff',
      'issuers',
      'schema_migrations',
    ]);
  });

  it('does nothing when run again', async () => {
    const result = await runMigrations(database);
    expect(result).toEqual({
      applied: [],
      alreadyApplied: [
        '0001_initial_schema.sql',
        '0002_staff_login_protection.sql',
        '0003_holder_audit.sql',
        '0004_offer_invalidation.sql',
        '0005_revocation_and_status_events.sql',
        '0006_reason_value_checks.sql',
        '0007_dev_simulated_expiry_event.sql',
        '0008_offer_invalidation_reason.sql',
      ],
    });
  });

  it('creates the status and type enums', async () => {
    const values = await rows<{ v: string }>(
      database,
      sql`select unnest(enum_range(null::credential_status))::text as v`,
    );
    expect(values.map((r) => r.v)).toEqual(['pending', 'valid', 'revoked', 'superseded']);
  });

  it('refuses to run when an applied migration file was edited', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'univault-mig-'));
    const db2 = await createDatabase('pglite://memory');
    try {
      await writeFile(join(dir, '0001_test.sql'), 'CREATE TABLE t1 (id int);');
      await runMigrations(db2, `${dir}/`);
      await writeFile(join(dir, '0001_test.sql'), 'CREATE TABLE t1 (id int, extra text);');
      await expect(runMigrations(db2, `${dir}/`)).rejects.toThrow(
        /was changed after it was applied/,
      );
    } finally {
      await db2.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rolls back a failing migration completely', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'univault-mig-'));
    const db2 = await createDatabase('pglite://memory');
    try {
      await writeFile(
        join(dir, '0001_bad.sql'),
        'CREATE TABLE half (id int);\nSELECT * FROM missing_table;',
      );
      await expect(runMigrations(db2, `${dir}/`)).rejects.toThrow();
      const exists = await rows<{ n: number }>(
        db2,
        sql`select count(*)::int as n from information_schema.tables where table_name = 'half'`,
      );
      expect(exists[0]?.n).toBe(0);
    } finally {
      await db2.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('points at the backend/migrations folder', () => {
    expect(MIGRATIONS_DIR.replace(/\\/g, '/')).toMatch(/backend\/migrations\/$/);
  });
});

describe('migration 0005 on existing credentials', () => {
  let database: Database;
  let oldDir: string;
  const KID = 'A'.repeat(43);
  const HOLDER = '11111111-1111-4111-8111-111111111111';

  beforeAll(async () => {
    database = await createDatabase('pglite://memory');
    // Apply 0001–0004 only, store credentials the old way, then apply 0005
    oldDir = await mkdtemp(join(tmpdir(), 'univault-0005-'));
    for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f < '0005')) {
      await copyFile(join(MIGRATIONS_DIR, file), join(oldDir, file));
    }
    await runMigrations(database, `${oldDir}/`);
    await database.exec(`
      INSERT INTO issuers (id, name, issuer_type) VALUES ('employer-a', 'Employer A', 'employer');
      INSERT INTO issuer_keys (kid, issuer_id, public_jwk)
        VALUES ('${KID}', 'employer-a', '{"kty":"RSA","kid":"${KID}"}');
      INSERT INTO holders (id, issuer_id, record_type, external_ref, full_name, claims)
        VALUES ('${HOLDER}', 'employer-a', 'employee', 'E-1', 'Test', '{}');
      INSERT INTO credential_records (id, issuer_id, holder_id, credential_type, vct, status,
          claims_snapshot, issuer_kid, holder_key_thumbprint, issued_at, expires_at, created_at,
          status_updated_at, revoked_at, revocation_reason)
      VALUES
        ('a0000000-0000-4000-8000-000000000001', 'employer-a', '${HOLDER}', 'EmploymentCredential',
         'v', 'superseded', '{}', '${KID}', 't', now() - interval '2 days', now() + interval '1 year',
         now() - interval '3 days', now() - interval '1 day', now() - interval '1 day',
         'Designation changed'),
        ('a0000000-0000-4000-8000-000000000002', 'employer-a', '${HOLDER}', 'EmploymentCredential',
         'v', 'revoked', '{}', '${KID}', 't', now() - interval '2 days', now() + interval '1 year',
         now() - interval '3 days', now() - interval '1 day', now() - interval '1 day', NULL),
        ('a0000000-0000-4000-8000-000000000003', 'employer-a', '${HOLDER}', 'EmploymentCredential',
         'v', 'pending', '{}', NULL, NULL, NULL, now() + interval '1 year',
         now() - interval '3 days', now() - interval '3 days', NULL, NULL);
    `);
    await runMigrations(database);
  });
  afterAll(async () => {
    await database.close();
    await rm(oldDir, { recursive: true, force: true });
  });

  it('moves the superseded time out of revoked_at and fills a missing revocation reason', async () => {
    const result = await rows<Record<string, unknown>>(
      database,
      sql`select status, revoked_at is not null as revoked, revocation_reason,
                 superseded_at is not null as superseded
          from credential_records order by id`,
    );
    expect(result).toEqual([
      { status: 'superseded', revoked: false, revocation_reason: null, superseded: true },
      { status: 'revoked', revoked: true, revocation_reason: 'other', superseded: false },
      { status: 'pending', revoked: false, revocation_reason: null, superseded: false },
    ]);
  });

  it('backfills a creation event for every credential, plus signing and the last change', async () => {
    const result = await rows<{
      id: string;
      from_status: string | null;
      to_status: string;
      reason: string | null;
    }>(
      database,
      sql`select credential_id as id, from_status, to_status, reason
          from credential_status_events order by credential_id, created_at`,
    );
    const history = (n: number) =>
      result
        .filter((r) => r.id.endsWith(String(n)))
        .map((r) => [r.from_status, r.to_status, r.reason]);
    expect(history(1)).toEqual([
      [null, 'pending', null],
      ['pending', 'valid', null],
      ['valid', 'superseded', 'Designation changed'],
    ]);
    expect(history(2)).toEqual([
      [null, 'pending', null],
      ['pending', 'valid', null],
      ['valid', 'revoked', 'other'],
    ]);
    expect(history(3)).toEqual([[null, 'pending', null]]);
  });
});

describe('migration 0006 (reason value CHECKs, NOT VALID)', () => {
  let database: Database;
  let oldDir: string;
  const KID = 'B'.repeat(43);
  const HOLDER = '22222222-2222-4222-8222-222222222222';
  const OLD_REVOKED = 'b0000000-0000-4000-8000-000000000001';
  const VALID = 'b0000000-0000-4000-8000-000000000002';

  /** Inserts a credential revoked with `reason` (free text was allowed before 0006). */
  const insertRevoked = (id: string, reason: string) =>
    database.exec(`
      INSERT INTO credential_records (id, issuer_id, holder_id, credential_type, vct, status,
          claims_snapshot, expires_at, revoked_at, revocation_reason)
      VALUES ('${id}', 'employer-a', '${HOLDER}', 'EmploymentCredential', 'v', 'revoked', '{}',
          now() + interval '1 year', now(), '${reason}')`);
  const insertEvent = (credentialId: string, reason: string) =>
    database.exec(`
      INSERT INTO credential_status_events (credential_id, issuer_id, from_status, to_status, reason)
      VALUES ('${credentialId}', 'employer-a', 'valid', 'revoked', '${reason}')`);

  beforeAll(async () => {
    database = await createDatabase('pglite://memory');
    // Apply 0001–0005, store free-text reasons (allowed then), then apply 0006
    oldDir = await mkdtemp(join(tmpdir(), 'univault-0006-'));
    for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f < '0006')) {
      await copyFile(join(MIGRATIONS_DIR, file), join(oldDir, file));
    }
    await runMigrations(database, `${oldDir}/`);
    await database.exec(`
      INSERT INTO issuers (id, name, issuer_type) VALUES ('employer-a', 'Employer A', 'employer');
      INSERT INTO issuer_keys (kid, issuer_id, public_jwk)
        VALUES ('${KID}', 'employer-a', '{"kty":"RSA","kid":"${KID}"}');
      INSERT INTO holders (id, issuer_id, record_type, external_ref, full_name, claims)
        VALUES ('${HOLDER}', 'employer-a', 'employee', 'E-1', 'Test', '{}');
    `);
    await insertRevoked(OLD_REVOKED, 'Left the company');
    await insertEvent(OLD_REVOKED, 'Designation changed');
    // Now 0006 only (0007 is tested separately)
    await copyFile(
      join(MIGRATIONS_DIR, '0006_reason_value_checks.sql'),
      join(oldDir, '0006_reason_value_checks.sql'),
    );
    const result = await runMigrations(database, `${oldDir}/`);
    expect(result.applied).toEqual(['0006_reason_value_checks.sql']);
  });
  afterAll(async () => {
    await database.close();
    await rm(oldDir, { recursive: true, force: true });
  });

  it('keeps rows stored before 0006 with their free-text reasons', async () => {
    const records = await rows<{ revocation_reason: string }>(
      database,
      sql`select revocation_reason from credential_records where id = ${OLD_REVOKED}`,
    );
    expect(records).toEqual([{ revocation_reason: 'Left the company' }]);
    const events = await rows<{ reason: string }>(
      database,
      sql`select reason from credential_status_events where credential_id = ${OLD_REVOKED}`,
    );
    expect(events).toEqual([{ reason: 'Designation changed' }]);
  });

  it('adds both constraints as NOT VALID (existing rows not checked)', async () => {
    const constraints = await rows<{ conname: string; convalidated: boolean }>(
      database,
      sql`select conname, convalidated from pg_constraint
          where conname like '%reason_value' order by conname`,
    );
    expect(constraints).toEqual([
      { conname: 'credential_records_revocation_reason_value', convalidated: false },
      { conname: 'credential_status_events_reason_value', convalidated: false },
    ]);
  });

  it('rejects a new credential with a reason outside the API enum', async () => {
    expect(
      await dbError(insertRevoked('b0000000-0000-4000-8000-000000000009', 'Left the company')),
    ).toContain('credential_records_revocation_reason_value');
  });

  it('rejects a new status event with a reason outside the API enum', async () => {
    expect(await dbError(insertEvent(OLD_REVOKED, 'Designation changed'))).toContain(
      'credential_status_events_reason_value',
    );
  });

  it('accepts every API reason value', async () => {
    for (const [n, reason] of REVOCATION_REASONS.entries()) {
      await insertRevoked(`b0000000-0000-4000-8000-0000000001${n}0`, reason);
    }
    await insertRevoked(VALID, 'other');
    for (const reason of new Set([...REVOCATION_REASONS, ...REISSUE_REASONS])) {
      await insertEvent(VALID, reason);
    }
    const count = await rows<{ n: number }>(
      database,
      sql`select count(*)::int as n from credential_status_events where credential_id = ${VALID}`,
    );
    expect(count).toEqual([{ n: new Set([...REVOCATION_REASONS, ...REISSUE_REASONS]).size }]);
  });

  it('lists exactly the API enum values (SQL and TypeScript agree)', async () => {
    const defs = await rows<{ conname: string; def: string }>(
      database,
      sql`select conname, pg_get_constraintdef(oid) as def from pg_constraint
          where conname like '%reason_value' order by conname`,
    );
    const values = (def: string) => [...def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(values(defs[0]!.def)).toEqual([...REVOCATION_REASONS].sort());
    expect(values(defs[1]!.def)).toEqual(
      [...new Set([...REVOCATION_REASONS, ...REISSUE_REASONS])].sort(),
    );
  });
});

describe('migration 0007 (dev simulated expiry event)', () => {
  let database: Database;
  const KID = 'C'.repeat(43);
  const HOLDER = '33333333-3333-4333-8333-333333333333';
  const CREDENTIAL = 'c0000000-0000-4000-8000-000000000001';

  const insertEvent = (from: string, to: string, reason: string | null) =>
    database.exec(`
      INSERT INTO credential_status_events (credential_id, issuer_id, from_status, to_status, reason)
      VALUES ('${CREDENTIAL}', 'employer-a', '${from}', '${to}', ${reason ? `'${reason}'` : 'NULL'})`);

  beforeAll(async () => {
    database = await freshDatabase(); // every migration, 0007 included
    await database.exec(`
      INSERT INTO issuers (id, name, issuer_type) VALUES ('employer-a', 'Employer A', 'employer');
      INSERT INTO issuer_keys (kid, issuer_id, public_jwk)
        VALUES ('${KID}', 'employer-a', '{"kty":"RSA","kid":"${KID}"}');
      INSERT INTO holders (id, issuer_id, record_type, external_ref, full_name, claims)
        VALUES ('${HOLDER}', 'employer-a', 'employee', 'E-1', 'Test', '{}');
      INSERT INTO credential_records (id, issuer_id, holder_id, credential_type, vct, status,
          claims_snapshot, issuer_kid, holder_key_thumbprint, issued_at, expires_at)
      VALUES ('${CREDENTIAL}', 'employer-a', '${HOLDER}', 'EmploymentCredential', 'v', 'valid',
          '{}', '${KID}', 't', now() - interval '1 day', now() + interval '1 year');
    `);
  });
  afterAll(() => database.close());

  it("allows a valid → valid event only with reason 'dev_simulated_expiry'", async () => {
    await insertEvent('valid', 'valid', 'dev_simulated_expiry');
    expect(await dbError(insertEvent('valid', 'valid', null))).toContain(
      'credential_status_events_changes_status',
    );
    expect(await dbError(insertEvent('valid', 'valid', 'other'))).toContain(
      'credential_status_events_changes_status',
    );
    expect(await dbError(insertEvent('revoked', 'revoked', 'dev_simulated_expiry'))).toContain(
      'credential_status_events_changes_status',
    );
  });

  it('keeps the reason CHECK NOT VALID and adds the dev reason to the API values', async () => {
    const [constraint] = await rows<{ convalidated: boolean; def: string }>(
      database,
      sql`select convalidated, pg_get_constraintdef(oid) as def from pg_constraint
          where conname = 'credential_status_events_reason_value'`,
    );
    expect(constraint!.convalidated).toBe(false);
    const values = [...constraint!.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(values).toEqual(
      [...new Set([...REVOCATION_REASONS, ...REISSUE_REASONS, ...DEV_EVENT_REASONS])].sort(),
    );
    expect(await dbError(insertEvent('valid', 'revoked', 'Left the company'))).toContain(
      'credential_status_events_reason_value',
    );
  });
});

describe('migration 0008 (offer invalidation reason)', () => {
  let database: Database;
  let oldDir: string;
  const KID = 'D'.repeat(43);
  const HOLDER = '44444444-4444-4444-8444-444444444444';
  const PENDING = 'd0000000-0000-4000-8000-000000000001';
  const REVOKED = 'd0000000-0000-4000-8000-000000000002';
  const SUPERSEDED = 'd0000000-0000-4000-8000-000000000003';
  const offer = (n: number) => `e0000000-0000-4000-8000-00000000000${n}`;

  beforeAll(async () => {
    database = await createDatabase('pglite://memory');
    // Apply 0001–0007, store invalidated offers without a reason, then apply 0008
    oldDir = await mkdtemp(join(tmpdir(), 'univault-0008-'));
    for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f < '0008')) {
      await copyFile(join(MIGRATIONS_DIR, file), join(oldDir, file));
    }
    await runMigrations(database, `${oldDir}/`);
    await database.exec(`
      INSERT INTO issuers (id, name, issuer_type) VALUES ('employer-a', 'Employer A', 'employer');
      INSERT INTO issuer_keys (kid, issuer_id, public_jwk)
        VALUES ('${KID}', 'employer-a', '{"kty":"RSA","kid":"${KID}"}');
      INSERT INTO holders (id, issuer_id, record_type, external_ref, full_name, claims)
        VALUES ('${HOLDER}', 'employer-a', 'employee', 'E-1', 'Test', '{}');
      INSERT INTO credential_records (id, issuer_id, holder_id, credential_type, vct, status,
          claims_snapshot, expires_at, revoked_at, revocation_reason)
      VALUES
        ('${PENDING}', 'employer-a', '${HOLDER}', 'EmploymentCredential', 'v', 'pending', '{}',
         now() + interval '1 year', NULL, NULL),
        ('${REVOKED}', 'employer-a', '${HOLDER}', 'EmploymentCredential', 'v', 'revoked', '{}',
         now() + interval '1 year', now(), 'issued_in_error');
      INSERT INTO credential_records (id, issuer_id, holder_id, credential_type, vct, status,
          claims_snapshot, issuer_kid, holder_key_thumbprint, issued_at, expires_at, created_at,
          superseded_at)
      VALUES ('${SUPERSEDED}', 'employer-a', '${HOLDER}', 'EmploymentCredential', 'v',
          'superseded', '{}', '${KID}', 't', now() - interval '2 days', now() + interval '1 year',
          now() - interval '3 days', now());
      INSERT INTO credential_offers (id, credential_id, pre_authorized_code_hash, expires_at,
          created_at, invalidated_at)
      VALUES
        -- replaced by offer 2 (created at the instant offer 1 was invalidated)
        ('${offer(1)}', '${PENDING}', 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH1', now() + interval '1 hour',
         '2026-11-20T10:00:00Z', '2026-11-20T10:05:00Z'),
        ('${offer(2)}', '${PENDING}', 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH2', now() + interval '1 hour',
         '2026-11-20T10:05:00Z', NULL),
        -- invalidated when its credential was revoked
        ('${offer(3)}', '${REVOKED}', 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH3', now() + interval '1 hour',
         '2026-11-20T10:00:00Z', '2026-11-20T11:00:00Z'),
        -- replaced, then the credential was revoked: still 'replaced'
        ('${offer(4)}', '${REVOKED}', 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH4', now() + interval '1 hour',
         '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z'),
        -- invalidated when its credential was reissued
        ('${offer(5)}', '${SUPERSEDED}', 'HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH5', now() + interval '1 hour',
         '2026-11-20T09:00:00Z', '2026-11-20T12:00:00Z');
    `);
    await runMigrations(database);
  });
  afterAll(async () => {
    await database.close();
    await rm(oldDir, { recursive: true, force: true });
  });

  it('backfills a reason for every invalidated offer, and none for the others', async () => {
    const result = await rows<{ id: string; invalidation_reason: string | null }>(
      database,
      sql`select id, invalidation_reason from credential_offers order by id`,
    );
    expect(result.map((r) => r.invalidation_reason)).toEqual([
      'replaced',
      null,
      'credential_revoked',
      'replaced',
      'credential_superseded',
    ]);
  });

  it('validates both constraints (every existing row satisfies them)', async () => {
    const constraints = await rows<{ conname: string; convalidated: boolean }>(
      database,
      sql`select conname, convalidated from pg_constraint
          where conname like 'credential_offers_invalidation_reason%' order by conname`,
    );
    expect(constraints).toEqual([
      { conname: 'credential_offers_invalidation_reason_value', convalidated: true },
      { conname: 'credential_offers_invalidation_reason_with_time', convalidated: true },
    ]);
  });

  it('lists exactly the service reasons (SQL and TypeScript agree)', async () => {
    const [constraint] = await rows<{ def: string }>(
      database,
      sql`select pg_get_constraintdef(oid) as def from pg_constraint
          where conname = 'credential_offers_invalidation_reason_value'`,
    );
    const values = [...constraint!.def.matchAll(/'([a-z_]+)'::text/g)].map((m) => m[1]).sort();
    expect(values).toEqual([...OFFER_INVALIDATION_REASONS].sort());
  });
});

describe('Drizzle definitions match the SQL migration', () => {
  let database: Database;
  beforeAll(async () => {
    database = await freshDatabase();
  });
  afterAll(() => database.close());

  const tables = [
    schema.issuers,
    schema.issuerKeys,
    schema.issuerStaff,
    schema.holders,
    schema.credentialRecords,
    schema.credentialOffers,
    schema.credentialStatusEvents,
  ];

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    'table %s has exactly the columns Drizzle expects, with matching nullability',
    async (name, table) => {
      const dbColumns = await rows<{ column_name: string; is_nullable: string }>(
        database,
        sql`select column_name, is_nullable from information_schema.columns
            where table_schema = 'public' and table_name = ${name}`,
      );
      const drizzleColumns = Object.values(getTableColumns(table));
      expect(dbColumns.map((c) => c.column_name).sort()).toEqual(
        drizzleColumns.map((c) => c.name).sort(),
      );
      for (const column of drizzleColumns) {
        const dbColumn = dbColumns.find((c) => c.column_name === column.name);
        expect(dbColumn?.is_nullable, `${name}.${column.name} nullability`).toBe(
          column.notNull ? 'NO' : 'YES',
        );
      }
    },
  );

  it.each(tables.map((t) => [getTableConfig(t).name, t] as const))(
    'table %s: every Drizzle foreign key exists in the SQL schema',
    async (name, table) => {
      const sqlForeignKeys = await rows<{ column_name: string; foreign_table: string }>(
        database,
        sql`select kcu.column_name, ccu.table_name as foreign_table
            from information_schema.table_constraints tc
            join information_schema.key_column_usage kcu
              on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
            join information_schema.constraint_column_usage ccu
              on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
            where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
              and tc.table_name = ${name}`,
      );
      const inSql = new Set(sqlForeignKeys.map((r) => `${r.column_name} -> ${r.foreign_table}`));
      const inDrizzle = getTableConfig(table).foreignKeys.flatMap((fk) => {
        const ref = fk.reference();
        const target = getTableConfig(ref.foreignTable).name;
        return ref.columns.map((c) => `${c.name} -> ${target}`);
      });
      for (const pair of inDrizzle) expect(inSql, `${name}: ${pair}`).toContain(pair);
    },
  );
});
