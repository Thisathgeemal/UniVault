import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getTableColumns, sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { MIGRATIONS_DIR, runMigrations } from '../../src/db/migrate.js';
import * as schema from '../../src/db/schema.js';
import { freshDatabase } from './helpers.js';

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
    expect(result.applied).toEqual(['0001_initial_schema.sql', '0002_staff_login_protection.sql']);
    const tables = await rows<{ table_name: string }>(
      database,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'credential_offers',
      'credential_records',
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
      alreadyApplied: ['0001_initial_schema.sql', '0002_staff_login_protection.sql'],
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
});
