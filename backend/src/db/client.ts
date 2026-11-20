/**
 * Database connection.
 *
 * DATABASE_URL decides which PostgreSQL is used:
 *   pglite://./.data/univault   embedded PostgreSQL in a local folder (development, no install)
 *   pglite://memory             embedded, in memory only (tests)
 *   postgres://user:pass@host/db  a real PostgreSQL server (deployment, e.g. Neon or Supabase)
 *
 * Both run genuine PostgreSQL, so the same SQL migrations and queries work everywhere.
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle as drizzleNodePg } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface Database {
  db: Db;
  driver: 'pglite' | 'postgres';
  /** Runs one or more raw SQL statements (used by the migration runner). */
  exec(sqlText: string): Promise<void>;
  /** True if the database answers a trivial query. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export const PGLITE_PREFIX = 'pglite://';

export function isPostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//.test(url);
}

export async function createDatabase(url: string): Promise<Database> {
  if (url.startsWith(PGLITE_PREFIX)) {
    const location = url.slice(PGLITE_PREFIX.length);
    let client: PGlite;
    if (location === 'memory' || location === '') {
      client = new PGlite();
    } else {
      const dataDir = resolve(location);
      mkdirSync(dataDir, { recursive: true });
      client = new PGlite(dataDir);
    }
    await client.waitReady;
    const db = drizzlePglite({ client, schema }) as unknown as Db;
    return {
      db,
      driver: 'pglite',
      exec: async (sqlText) => {
        try {
          await client.exec(sqlText);
        } catch (err) {
          await client.exec('ROLLBACK').catch(() => undefined); // leave no open transaction
          throw err;
        }
      },
      ping: () => ping(db),
      close: () => client.close(),
    };
  }

  if (isPostgresUrl(url)) {
    const pool = new pg.Pool({ connectionString: url, max: 10 });
    const db = drizzleNodePg({ client: pool, schema }) as unknown as Db;
    return {
      db,
      driver: 'postgres',
      exec: async (sqlText) => {
        // One dedicated connection, so a failed migration can be rolled back on it
        const connection = await pool.connect();
        try {
          await connection.query(sqlText);
        } catch (err) {
          await connection.query('ROLLBACK').catch(() => undefined);
          throw err;
        } finally {
          connection.release();
        }
      },
      ping: () => ping(db),
      close: () => pool.end(),
    };
  }

  throw new Error('DATABASE_URL must start with pglite:// or postgres://');
}

async function ping(db: Db): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
