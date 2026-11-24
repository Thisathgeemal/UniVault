/**
 * Issuer keys in REAL processes (Decision 014): the server's start-up key check and the
 * keys:bundle CLI, run exactly as `npm run dev` / `npm run keys:bundle` run them.
 *
 * - strict start-up (ISSUER_KEYS_STRICT_STARTUP=true, which production always uses) exits
 *   non-zero before listening for a wrong passphrase or a kid mismatch;
 * - a non-strict start-up starts degraded; env mode (ISSUER_KEYS_BUNDLE) starts and serves;
 * - production configuration refuses a weak or development passphrase and env mode without a
 *   bundle (these fail before the database connects, so a real NODE_ENV=production process
 *   can be used even though this machine has no PostgreSQL server);
 * - keys:bundle writes the bundle, refuses to overwrite without --force and prints ids and kids
 *   only.
 * No output may contain key material, the passphrase, the bundle or the keys folder path.
 *
 * Every process gets its own copy of a prepared PGlite folder and keys folder.
 *
 * Heavy test (Vitest project "heavy"): runs after the fast tests, one file at a time (Sprint 1,
 * Issue 15). Every spawned process is killed in afterEach, even when a test fails or times out.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { cp, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateIssuerKeys, issuerKeyFileNames } from '@univault/crypto-core/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createDatabase } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedDatabase } from '../src/db/seed.js';
import { createKeyStore, KEY_BUNDLE_FILE_NAME } from '../src/keys/key-store.js';
import { createIssuerKeysService } from '../src/services/issuer-keys.service.js';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const FIXTURES = fileURLToPath(new URL('./fixtures/seed-data/', import.meta.url));
const PASSPHRASE = 'startup-test-passphrase-0001';

let scratch: string;
let baseDb: string;
let baseKeys: string;
let kids: { employer: string; bank: string };
let bundle: string;
const outputs: { text: string; printsPaths: boolean }[] = [];
const live = new Set<ChildProcess>();

/** A spawned server or CLI takes about 3–10 s alone; these leave room for a slow machine. */
const PROCESS_TEST_TIMEOUT_MS = 90_000;
const CLI_TEST_TIMEOUT_MS = 120_000; // three CLI runs in one test

/** Kills every process still running (a failed or timed-out test) and waits until it is gone. */
afterEach(async () => {
  await Promise.all(
    [...live].map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          const timer = setTimeout(resolve, 10_000); // never hang the run on a stuck process
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill();
        }),
    ),
  );
  live.clear();
});

/** A private copy of the prepared database and keys for one process. */
async function workspace() {
  const dir = await mkdtemp(join(scratch, 'run-'));
  await cp(baseDb, join(dir, 'db'), { recursive: true });
  await cp(baseKeys, join(dir, 'keys'), { recursive: true });
  return { db: join(dir, 'db'), keys: join(dir, 'keys') };
}

function run(args: string[], env: Record<string, string>, options: { printsPaths?: boolean } = {}) {
  const child = spawn(process.execPath, ['--import', 'tsx', ...args], {
    cwd: backendDir,
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      DOTENV_CONFIG_PATH: 'test/does-not-exist.env', // never read the developer's backend/.env
      NODE_ENV: 'test',
      LOG_LEVEL: 'info',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  live.add(child);
  child.once('exit', () => live.delete(child));
  let output = '';
  child.stdout?.on('data', (d) => (output += String(d)));
  child.stderr?.on('data', (d) => (output += String(d)));
  const record = { text: '', printsPaths: options.printsPaths ?? false };
  outputs.push(record);
  const exited = new Promise<number | null>((resolve) =>
    child.on('exit', (code) => {
      record.text = output;
      resolve(code);
    }),
  );
  const waitFor = async (text: string, timeoutMs = 60_000) => {
    const start = Date.now();
    while (!output.includes(text)) {
      if (child.exitCode !== null)
        throw new Error(`Process exited (${child.exitCode}):\n${output}`);
      if (Date.now() - start > timeoutMs)
        throw new Error(`Timed out waiting for "${text}":\n${output}`);
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const stop = async () => {
    record.text = output;
    if (child.exitCode === null) child.kill();
    await exited;
  };
  return { child, exited, waitFor, stop, output: () => output };
}

const server = (ws: { db: string; keys: string }, env: Record<string, string> = {}) =>
  run(['src/server.ts'], {
    PORT: String(4600 + Math.floor(Math.random() * 300)),
    DATABASE_URL: `pglite://${ws.db.replace(/\\/g, '/')}`,
    ISSUER_KEYS_DIR: ws.keys,
    ISSUER_KEY_PASSPHRASE: PASSPHRASE,
    ...env,
  });

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'univault-key-startup-'));
  baseDb = join(scratch, 'base-db');
  baseKeys = join(scratch, 'base-keys');
  const database = await createDatabase(`pglite://${baseDb.replace(/\\/g, '/')}`);
  try {
    await runMigrations(database);
    await seedDatabase(database.db, { dataDir: FIXTURES, staffPassword: 'startup-test-password' });
    const keyStore = createKeyStore({
      db: database.db,
      source: 'file',
      keysDir: baseKeys,
      passphrase: PASSPHRASE,
    });
    const keys = createIssuerKeysService(database.db, {
      keyStore,
      publicBaseUrl: 'http://localhost:4000',
    });
    kids = {
      employer: (await keys.generateKey('employer-a')).kid,
      bank: (await keys.generateKey('bank-a')).kid,
    };
    const written = await keyStore.writeBundle(join(scratch, KEY_BUNDLE_FILE_NAME));
    bundle = (await readFile(written.path, 'utf8')).trim();
  } finally {
    await database.close();
  }
}, CLI_TEST_TIMEOUT_MS); // migrate, seed and two keys on disk

afterAll(async () => {
  await rm(scratch, { recursive: true, force: true });
});

describe('strict start-up (the production key policy)', () => {
  it(
    'exits non-zero before listening when the passphrase is wrong',
    async () => {
      const ws = await workspace();
      const proc = server(ws, {
        ISSUER_KEYS_STRICT_STARTUP: 'true',
        ISSUER_KEY_PASSPHRASE: 'a-wrong-passphrase-00000',
      });
      expect(await proc.exited).toBe(1);
      const out = proc.output();
      expect(out).not.toContain('UniVault backend listening');
      for (const kid of [kids.employer, kids.bank]) {
        expect(out).toMatch(new RegExp(`"kid":"${kid}"[^\\n]*"code":"KEY_DECRYPT_FAILED"`));
      }
      expect(out).toContain('issuer keys loaded: 0/2');
      expect(out).toContain('refusing to start');
    },
    PROCESS_TEST_TIMEOUT_MS,
  );

  it(
    'exits non-zero when a key file holds a different key (kid mismatch)',
    async () => {
      const ws = await workspace();
      const other = await generateIssuerKeys({ passphrase: PASSPHRASE });
      await writeFile(join(ws.keys, issuerKeyFileNames(kids.bank).privateKey), other.privateKeyPem);
      const proc = server(ws, { ISSUER_KEYS_STRICT_STARTUP: 'true' });
      expect(await proc.exited).toBe(1);
      expect(proc.output()).toMatch(
        new RegExp(`"issuerId":"bank-a","kid":"${kids.bank}","code":"KEY_KID_MISMATCH"`),
      );
      expect(proc.output()).toContain('issuer keys loaded: 1/2');
    },
    PROCESS_TEST_TIMEOUT_MS,
  );
});

describe('non-strict start-up and env mode', () => {
  it(
    'development: starts degraded with a missing key; /health says so',
    async () => {
      const ws = await workspace();
      await rm(join(ws.keys, issuerKeyFileNames(kids.bank).privateKey));
      const proc = server(ws);
      try {
        await proc.waitFor('UniVault backend listening');
        expect(proc.output()).toMatch(/"issuerId":"bank-a"[^\n]*"code":"KEY_NOT_FOUND"/);
        expect(proc.output()).toContain('issuer keys loaded: 1/2');
        const port = /localhost:(\d+)\/api\/v1/.exec(proc.output())![1];
        const health = await fetch(`http://localhost:${port}/api/v1/health`);
        expect(health.status).toBe(503);
        expect(await health.json()).toMatchObject({
          status: 'degraded',
          keys: { status: 'degraded', activeKeys: 2, loaded: 1 },
        });
      } finally {
        await proc.stop();
      }
    },
    PROCESS_TEST_TIMEOUT_MS,
  );

  it(
    'env mode: loads every key from ISSUER_KEYS_BUNDLE (no key files at all)',
    async () => {
      const ws = await workspace();
      await rm(ws.keys, { recursive: true, force: true });
      const proc = server(ws, {
        ISSUER_KEY_SOURCE: 'env',
        ISSUER_KEYS_BUNDLE: bundle,
        ISSUER_KEYS_STRICT_STARTUP: 'true',
      });
      try {
        await proc.waitFor('UniVault backend listening');
        expect(proc.output()).toMatch(/"source":"env"[^\n]*issuer keys loaded: 2\/2/);
        const port = /localhost:(\d+)\/api\/v1/.exec(proc.output())![1];
        const health = await fetch(`http://localhost:${port}/api/v1/health`);
        expect(await health.json()).toMatchObject({
          status: 'ok',
          keys: { status: 'ok', activeKeys: 2, loaded: 2 },
        });
      } finally {
        await proc.stop();
      }
    },
    PROCESS_TEST_TIMEOUT_MS,
  );
});

describe('production configuration', () => {
  const PRODUCTION = {
    NODE_ENV: 'production',
    JWT_SECRET: 'x'.repeat(40),
    DATABASE_URL: 'postgres://univault@localhost:1/univault', // never reached: config fails first
  };
  it.each([
    [
      'a passphrase under 20 characters',
      { ISSUER_KEY_PASSPHRASE: 'only-19-characters!' },
      /ISSUER_KEY_PASSPHRASE: must be at least 20/,
    ],
    [
      'the development passphrase',
      { ISSUER_KEY_PASSPHRASE: 'univault-dev-key-passphrase-change-me' },
      /ISSUER_KEY_PASSPHRASE: must not be the development value/,
    ],
    [
      'env mode without a bundle',
      { ISSUER_KEY_PASSPHRASE: PASSPHRASE, ISSUER_KEY_SOURCE: 'env' },
      /ISSUER_KEYS_BUNDLE: is required in production/,
    ],
  ])(
    'refuses to start with %s',
    async (_label, env, message) => {
      const proc = run(['src/server.ts'], { ...PRODUCTION, ...env });
      expect(await proc.exited).toBe(1);
      expect(proc.output()).toMatch(message);
      expect(proc.output()).not.toContain('listening');
    },
    PROCESS_TEST_TIMEOUT_MS,
  );
});

describe('npm run keys:bundle', () => {
  it(
    'writes the bundle (0600), refuses to overwrite, and prints ids and kids only',
    async () => {
      const ws = await workspace();
      const env = {
        DATABASE_URL: `pglite://${ws.db.replace(/\\/g, '/')}`,
        ISSUER_KEYS_DIR: ws.keys,
        ISSUER_KEY_PASSPHRASE: PASSPHRASE,
      };
      const first = run(['src/db/cli.ts', 'bundle'], env, { printsPaths: true });
      expect(await first.exited).toBe(0);
      const out = first.output();
      expect(out).toMatch(new RegExp(`bundled\\s+bank-a\\s+kid ${kids.bank}`));
      expect(out).toMatch(new RegExp(`bundled\\s+employer-a\\s+kid ${kids.employer}`));
      expect(out).toContain(KEY_BUNDLE_FILE_NAME);
      expect(out).toContain(
        'Reminder: delete this local bundle file once ISSUER_KEYS_BUNDLE is set on the host.',
      );

      const file = join(ws.keys, KEY_BUNDLE_FILE_NAME);
      const written = (await readFile(file, 'utf8')).trim();
      expect(written).toBe(bundle); // same keys, same order → same bundle
      expect(out).not.toContain(written.slice(100, 160));
      if (process.platform !== 'win32') expect((await stat(file)).mode & 0o777).toBe(0o600);

      const second = run(['src/db/cli.ts', 'bundle'], env, { printsPaths: true });
      expect(await second.exited).toBe(1);
      expect(second.output()).toMatch(/already exists.*--force/);

      const forced = run(['src/db/cli.ts', 'bundle', '--force'], env, { printsPaths: true });
      expect(await forced.exited).toBe(0);
      expect((await readdir(ws.keys)).filter((f) => f.endsWith('.b64'))).toEqual([
        KEY_BUNDLE_FILE_NAME,
      ]);
    },
    CLI_TEST_TIMEOUT_MS,
  );
});

describe('leak scan of every process output', () => {
  it('never shows key material, the passphrase, the bundle or (server) the keys path', () => {
    expect(outputs.length).toBeGreaterThanOrEqual(9);
    for (const { text, printsPaths } of outputs) {
      expect(text).not.toContain('PRIVATE KEY');
      expect(text).not.toContain(PASSPHRASE);
      expect(text).not.toContain('a-wrong-passphrase-00000');
      expect(text).not.toContain(bundle.slice(300, 360));
      if (!printsPaths) {
        expect(text).not.toContain(scratch);
        expect(text).not.toContain(JSON.stringify(scratch).slice(1, -1));
      }
    }
  });
});
