/**
 * Database commands (run from backend/):
 *   npm run db:migrate   apply new SQL migrations
 *   npm run db:seed      migrate, then load synthetic issuers, staff and holders
 *   npm run db:inspect   show tables, row counts and sample rows
 *   npm run db:reset     DELETE all data and recreate (development only)
 *   npm run keys:init    generate a signing key for every issuer without one
 *   npm run keys:bundle  write the active encrypted keys as ISSUER_KEYS_BUNDLE to
 *                        <ISSUER_KEYS_DIR>/issuer-keys.bundle.b64 (add --force to replace it)
 *   npm run db:seed:demo dashboard demo credentials for Serendib Trading only (development;
 *                        skips if present; add --reset to remove only the demo rows)
 */
import 'dotenv/config';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { count, sql } from 'drizzle-orm';
import { loadConfig } from '../config/env.js';
import { createDatabase, PGLITE_PREFIX, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import * as schema from './schema.js';
import { KEY_BUNDLE_FILE_NAME, keyStoreFromConfig } from '../keys/key-store.js';
import { createIssuerKeysService } from '../services/issuer-keys.service.js';
import { loadCredentialSchemas } from '../services/credential-schemas.js';
import { DEFAULT_SEED_PASSWORD, seedDatabase } from './seed.js';
import { demoCountsTable, removeDemoData, seedDemoData } from './seed-demo.js';

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
  if (command === 'seed-demo' && config.NODE_ENV === 'production') {
    throw new Error('db:seed:demo is disabled in production');
  }
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
          keyStore: keyStoreFromConfig(database.db, config),
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
      case 'bundle': {
        // Reads the ACTIVE encrypted key files (checked like start-up) and writes the bundle for
        // ISSUER_KEYS_BUNDLE. The bundle itself is never printed: only ids, kids and the path
        await migrate(database);
        const fileStore = keyStoreFromConfig(database.db, { ...config, ISSUER_KEY_SOURCE: 'file' });
        const result = await fileStore.writeBundle(
          resolve(config.ISSUER_KEYS_DIR, KEY_BUNDLE_FILE_NAME),
          { force: process.argv.includes('--force') },
        );
        for (const key of result.keys)
          console.log(`  bundled   ${key.issuerId.padEnd(12)} kid ${key.kid}`);
        console.log(`\nBundle written (mode 0600): ${result.path}`);
        console.log(
          'Set its content as the host secret ISSUER_KEYS_BUNDLE, with ISSUER_KEY_SOURCE=env and ISSUER_KEY_PASSPHRASE. Do not commit or paste it anywhere else.',
        );
        console.log(
          'Reminder: delete this local bundle file once ISSUER_KEYS_BUNDLE is set on the host.',
        );
        break;
      }
      case 'seed-demo': {
        await migrate(database);
        if (process.argv.includes('--reset')) {
          const removed = await removeDemoData(database.db, config.NODE_ENV);
          console.log(`  removed   ${removed.credentials} demo credentials (other data untouched)`);
          break;
        }
        const result = await seedDemoData(database.db, {
          keyStore: keyStoreFromConfig(database.db, config),
          schemas: loadCredentialSchemas(config.CREDENTIAL_SCHEMAS_DIR),
          publicBaseUrl: config.PUBLIC_BASE_URL,
          offerTtlSeconds: config.CREDENTIAL_OFFER_TTL_SECONDS,
          nodeEnv: config.NODE_ENV,
        });
        console.log(
          result.outcome === 'created'
            ? '  created   demo credentials:'
            : '  skipped   demo data already exists (npm run db:seed:demo -- --reset removes it):',
        );
        console.table(demoCountsTable(result.counts)); // counts only
        break;
      }
      default:
        console.log(
          'Usage: tsx src/db/cli.ts <migrate | seed | inspect | reset | keys | bundle | seed-demo>',
        );
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
