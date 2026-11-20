/**
 * Database commands (run from backend/):
 *   npm run db:migrate   apply new SQL migrations
 *   npm run db:seed      migrate, then load synthetic issuers, staff and holders
 *   npm run db:inspect   show tables, row counts and sample rows
 *   npm run db:reset     DELETE all data and recreate (development only)
 *   npm run keys:init    generate a signing key for every issuer without one
 */
import 'dotenv/config';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { count, sql } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDatabase, PGLITE_PREFIX, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';
import { createIssuerKeysService } from '../services/issuer-keys.service.js';
import { DEFAULT_SEED_PASSWORD, seedDatabase } from './seed.js';

const TABLES = [
  ['issuers', schema.issuers],
  ['issuer_keys', schema.issuerKeys],
  ['issuer_staff', schema.issuerStaff],
  ['holders', schema.holders],
  ['credential_records', schema.credentialRecords],
  ['credential_offers', schema.credentialOffers],
] as const;

async function migrate(database: Database): Promise<void> {
  const result = await runMigrations(database);
  for (const f of result.applied) console.log(`  applied   ${f}`);
  for (const f of result.alreadyApplied) console.log(`  up to date ${f}`);
}

async function inspect(database: Database): Promise<void> {
  const { db } = database;
  console.log('\nTables and row counts');
  const counts = [];
  for (const [name, table] of TABLES) {
    const [row] = await db.select({ n: count() }).from(table);
    counts.push({ table: name, rows: row?.n ?? 0 });
  }
  console.table(counts);

  console.log('Issuers');
  console.table(
    (await db.select().from(schema.issuers)).map((i) => ({
      id: i.id,
      name: i.name,
      type: i.issuerType,
    })),
  );

  console.log('Holders per issuer');
  const perIssuer = (await db.execute(
    sql`select issuer_id, record_type, count(*)::int as holders from holders group by 1, 2 order by 1`,
  )) as unknown as { rows: Record<string, unknown>[] };
  console.table(perIssuer.rows);

  console.log('Issuer signing keys (public keys only)');
  const keyRows = await db.query.issuerKeys.findMany({
    orderBy: (k, { asc: a }) => [a(k.issuerId), a(k.createdAt)],
  });
  console.table(
    keyRows.map((k) => ({
      issuer: k.issuerId,
      kid: `${k.kid.slice(0, 12)}…`,
      alg: k.alg,
      status: k.status,
    })),
  );

  console.log('Sample holders (with their issuer, via relation)');
  const sample = await db.query.holders.findMany({ limit: 3, with: { issuer: true } });
  console.table(
    sample.map((h) => ({
      externalRef: h.externalRef,
      fullName: h.fullName,
      issuer: h.issuer.name,
      recordType: h.recordType,
    })),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadConfig();
  if (command === 'reset') {
    if (config.NODE_ENV === 'production') throw new Error('db:reset is disabled in production');
    if (!config.DATABASE_URL.startsWith(PGLITE_PREFIX)) {
      throw new Error('db:reset only deletes the embedded development database (pglite://)');
    }
    const dir = resolve(config.DATABASE_URL.slice(PGLITE_PREFIX.length));
    await rm(dir, { recursive: true, force: true });
    console.log(`Deleted ${dir}`);
  }

  const database = await createDatabase(config.DATABASE_URL);
  try {
    console.log(
      `Database: ${database.driver} (${config.DATABASE_URL.replace(/\/\/[^@]*@/, '//***@')})`,
    );
    switch (command) {
      case 'migrate':
        await migrate(database);
        break;
      case 'seed':
      case 'reset': {
        await migrate(database);
        // An empty value (e.g. "SEED_STAFF_PASSWORD=" from .env.example) means "use the default"
        const password = process.env.SEED_STAFF_PASSWORD || DEFAULT_SEED_PASSWORD;
        const result = await seedDatabase(database.db, { staffPassword: password });
        console.log(
          `  seeded    ${result.issuers} issuers, ${result.staff} staff, ${result.holders} holders (new rows)`,
        );
        console.log('\nIssuer portal logins (development only):');
        console.table(result.staffLogins);
        if (password === DEFAULT_SEED_PASSWORD)
          console.log(`Password for all: ${DEFAULT_SEED_PASSWORD}`);
        break;
      }
      case 'inspect':
        await inspect(database);
        break;
      case 'keys': {
        // Generate a signing key for every issuer that does not have an active one yet
        await migrate(database);
        const service = createIssuerKeysService(database.db, {
          keysDir: config.ISSUER_KEYS_DIR,
          passphrase: config.ISSUER_KEY_PASSPHRASE,
          publicBaseUrl: config.PUBLIC_BASE_URL,
        });
        const missing = await service.issuersWithoutActiveKey();
        if (missing.length === 0) console.log('  every issuer already has an active signing key');
        for (const issuerId of missing) {
          const key = await service.generateKey(issuerId);
          console.log(`  generated ${issuerId.padEnd(12)} kid ${key.kid}`);
        }
        console.log(`\nPrivate keys (encrypted): ${resolve(config.ISSUER_KEYS_DIR)}`);
        console.log(`Public keys: ${config.PUBLIC_BASE_URL}/api/v1/issuers/<issuer-id>/keys`);
        break;
      }
      default:
        console.log('Usage: tsx src/db/cli.ts <migrate | seed | inspect | reset | keys>');
        process.exitCode = 1;
    }
  } finally {
    await database.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
