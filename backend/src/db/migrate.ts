/**
 * Minimal, transparent migration runner.
 *
 * - Migrations are plain SQL files in backend/migrations, named NNNN_description.sql.
 * - They run in name order, each inside a transaction (all or nothing).
 * - Applied versions are recorded in the schema_migrations table, so running
 *   the migrator again only applies new files.
 * - A file that was already applied must never be edited – add a new one instead.
 *   A checksum detects edits.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Database } from './client.js';

/** backend/migrations – the same path from src/db (tsx) and dist/db (compiled). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));
const FILE_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;

export interface MigrationResult {
  applied: string[];
  alreadyApplied: string[];
}

export async function runMigrations(
  database: Database,
  migrationsDir: string = MIGRATIONS_DIR,
): Promise<MigrationResult> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const files = (await readdir(migrationsDir)).filter((f) => FILE_PATTERN.test(f)).sort();
  const existing = (await database.db.execute(
    sql`select version, checksum from schema_migrations`,
  )) as unknown as { rows: { version: string; checksum: string }[] };
  const applied = new Map(existing.rows.map((r) => [r.version, r.checksum]));

  const result: MigrationResult = { applied: [], alreadyApplied: [] };
  for (const file of files) {
    const content = await readFile(`${migrationsDir}${file}`, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    const previous = applied.get(file);
    if (previous !== undefined) {
      if (previous !== checksum) {
        throw new Error(
          `Migration ${file} was changed after it was applied. Create a new migration file instead.`,
        );
      }
      result.alreadyApplied.push(file);
      continue;
    }
    const escaped = checksum.replace(/'/g, "''");
    await database.exec(
      `BEGIN;\n${content}\nINSERT INTO schema_migrations (version, checksum) VALUES ('${file}', '${escaped}');\nCOMMIT;`,
    );
    result.applied.push(file);
  }
  return result;
}
