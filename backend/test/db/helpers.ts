import { createDatabase, type Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrate.js';
import { issuerKeys, issuers } from '../../src/db/schema.js';

/** A fresh, migrated, in-memory PostgreSQL database (PGlite). */
export async function freshDatabase(): Promise<Database> {
  const database = await createDatabase('pglite://memory');
  await runMigrations(database);
  return database;
}

export const KID_A = 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs';
export const KID_B = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

/** Inserts two issuers and an active signing key for employer-a. */
export async function insertIssuersAndKey(database: Database): Promise<void> {
  await database.db.insert(issuers).values([
    { id: 'employer-a', name: 'Serendib Trading Company (Demo)', issuerType: 'employer' },
    { id: 'bank-a', name: 'UniVault Demo Bank', issuerType: 'bank' },
  ]);
  await database.db.insert(issuerKeys).values({
    kid: KID_A,
    issuerId: 'employer-a',
    publicJwk: { kty: 'RSA', n: 'test-n', e: 'AQAB', kid: KID_A, alg: 'RS256', use: 'sig' },
  });
}

/** Runs a promise and returns the PostgreSQL error message it fails with (searches nested causes). */
export async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const messages: string[] = [];
    let current: unknown = err;
    while (current instanceof Error) {
      messages.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
    }
    return messages.join(' | ');
  }
  throw new Error('Expected the database to reject this operation');
}
