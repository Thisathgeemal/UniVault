/**
 * The embedded database ON DISK (pglite://<folder>), as `npm run dev` uses it.
 *
 * Heavy test (Vitest project "heavy", vitest.config.ts): on-disk PGlite is slow on Windows and
 * timed out under parallel load (Sprint 1, Issue 15), so it runs after the fast tests, one file
 * at a time. Both connections are closed even when an assertion fails or the test times out.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabase, type Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { holders } from '../../src/db/schema.js';
import { seedDatabase } from '../../src/db/seed.js';

const FIXTURES = fileURLToPath(new URL('../fixtures/seed-data/', import.meta.url));
const open: Database[] = [];
const dirs: string[] = [];

/** Alone this takes about 3 s; 60 s leaves room for a slow disk. */
const DISK_TEST_TIMEOUT_MS = 60_000;

afterEach(async () => {
  for (const database of open.splice(0)) await database.close().catch(() => undefined);
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

const connect = async (dir: string) => {
  const database = await createDatabase(`pglite://${dir}`);
  open.push(database);
  return database;
};

describe('embedded database on disk', () => {
  it(
    'keeps data between connections (pglite://<folder>)',
    async () => {
      const dir = await mkdtemp(join(tmpdir(), 'univault-pglite-'));
      dirs.push(dir);
      const first = await connect(dir);
      await runMigrations(first);
      await seedDatabase(first.db, { dataDir: FIXTURES, staffPassword: 'test-password-123' });
      await first.close();
      open.splice(open.indexOf(first), 1);

      const second = await connect(dir);
      expect(await second.db.select().from(holders)).toHaveLength(5);
    },
    DISK_TEST_TIMEOUT_MS,
  );
});
