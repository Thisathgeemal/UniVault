/**
 * Issuer key store (Decision 014): the single owner of private keys.
 * File and env sources, every KeyStoreError, the 503 mapping, decrypt-once, rotation, the
 * start-up check (strict and degraded), the health keys block, public-only JWKS and a leak scan
 * of every log line and error body produced here.
 *
 * Keys are generated at runtime into temp folders: no key fixtures exist in the repository.
 */
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateIssuerKeys, issuerKeyFileNames } from '@univault/crypto-core/node';
import { and, eq } from 'drizzle-orm';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { issuerKeys } from '../src/db/schema.js';
import {
  createKeyStore,
  KEY_BUNDLE_FILE_NAME,
  KeyStoreError,
  type KeyStore,
  type KeyStoreErrorCode,
} from '../src/keys/key-store.js';
import { checkIssuerKeysAtStartup } from '../src/keys/startup-check.js';
import { createIssuerKeysService } from '../src/services/issuer-keys.service.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

const PASSPHRASE = 'test-key-store-passphrase-123';
const JWT_SECRET = 'test-jwt-secret-that-is-long-enough-123456'; // same as authedTestApp
const fixture = (file: string) =>
  (
    JSON.parse(readFileSync(new URL(`./fixtures/seed-data/${file}`, import.meta.url), 'utf8')) as {
      records: { claims: Record<string, unknown> }[];
    }
  ).records[0]!.claims;
const EMPLOYEE_CLAIMS = fixture('employees.json');
const CUSTOMER_CLAIMS = fixture('customers.json');

let t: AuthedTestApp;
let keysDir: string;
let scratch: string;
let tokens: Record<'employerAdmin' | 'employerOfficer' | 'bankAdmin' | 'bankOfficer', string>;
let kids: { employer: string; bank: string };
let bundle: string;

// Every log line and error body produced in this file, for the leak scan at the end
const allLogs: (() => Record<string, unknown>[])[] = [];
const errorBodies: string[] = [];
const newLogger = (level: 'debug' | 'info' = 'debug') => {
  const captured = captureLogger(testConfig({ LOG_LEVEL: level }));
  allLogs.push(captured.lines);
  return captured;
};

const fileStore = (overrides: Partial<Parameters<typeof createKeyStore>[0]> = {}) =>
  createKeyStore({
    db: t.database.db,
    source: 'file',
    keysDir,
    passphrase: PASSPHRASE,
    ...overrides,
  });
const envStore = (
  value: string | undefined,
  overrides: Partial<Parameters<typeof createKeyStore>[0]> = {},
) =>
  createKeyStore({
    db: t.database.db,
    source: 'env',
    keysDir: '/nonexistent',
    passphrase: PASSPHRASE,
    bundle: value,
    ...overrides,
  });
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi'];
const toBase64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64');

/** An app on the shared test database with the given key store (tokens from `t` still work). */
const appWith = (keyStore: KeyStore, logger = newLogger().logger): Express =>
  createApp(
    testConfig({
      JWT_SECRET,
      LOGIN_RATE_LIMIT_MAX: '1000',
      DEV_SIMULATE_REDEMPTION: 'true',
      ISSUER_KEYS_DIR: keysDir,
      ISSUER_KEY_PASSPHRASE: PASSPHRASE,
    }),
    logger,
    { database: t.database, keyStore },
  );

let holderCount = 0;
async function pendingCredential(app: Express, issuer: 'employer' | 'bank') {
  holderCount += 1;
  const token = issuer === 'employer' ? tokens.employerOfficer : tokens.bankOfficer;
  const holder = await request(app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${token}`)
    .send(
      issuer === 'employer'
        ? {
            claims: {
              ...EMPLOYEE_CLAIMS,
              employee_id: `KS-${String(holderCount).padStart(5, '0')}`,
            },
          }
        : { externalRef: `CUS-KS-${holderCount}`, claims: CUSTOMER_CLAIMS },
    );
  expect(holder.status).toBe(201);
  const credential = await request(app)
    .post('/api/v1/credentials')
    .set('Authorization', `Bearer ${token}`)
    .send({ holderId: holder.body.id });
  expect(credential.status).toBe(201);
  return credential.body.id as string;
}

/** Signs through the one signing path (dev simulated redemption, admin of that issuer). */
async function simulateRedemption(app: Express, issuer: 'employer' | 'bank', id: string) {
  const res = await request(app)
    .post(`/api/v1/dev/credentials/${id}/simulate-redemption`)
    .set(
      'Authorization',
      `Bearer ${issuer === 'employer' ? tokens.employerAdmin : tokens.bankAdmin}`,
    );
  if (res.status >= 400) errorBodies.push(res.text);
  return res;
}

async function expectKeyError(store: KeyStore, issuerId: string, code: KeyStoreErrorCode) {
  const error = await store.getSigningKey(issuerId).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(KeyStoreError);
  expect(error).toMatchObject({ code, issuerId });
  const err = error as KeyStoreError;
  expect(err.message).toContain(issuerId);
  expect(err.message).toContain(code);
  expect(err.cause).toBeUndefined();
  errorBodies.push(err.message);
  return err;
}

beforeAll(async () => {
  scratch = await mkdtemp(join(tmpdir(), 'univault-keystore-'));
  keysDir = join(scratch, 'keys');
  t = await authedTestApp({ ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: PASSPHRASE });
  const [employerAdmin, employerOfficer, bankAdmin, bankOfficer] = await Promise.all([
    t.tokenFor(STAFF.employerAdmin),
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.bankAdmin),
    t.tokenFor(STAFF.bankOfficer),
  ]);
  tokens = { employerAdmin, employerOfficer, bankAdmin, bankOfficer };
  const keys = createIssuerKeysService(t.database.db, {
    keyStore: fileStore(),
    publicBaseUrl: 'http://localhost:4000',
  });
  kids = {
    employer: (await keys.generateKey('employer-a')).kid,
    bank: (await keys.generateKey('bank-a')).kid,
  };
  const written = await fileStore().writeBundle(join(scratch, KEY_BUNDLE_FILE_NAME));
  bundle = (await readFile(written.path, 'utf8')).trim();
});

afterAll(async () => {
  await t.database.close();
  await rm(scratch, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('key sources', () => {
  it('loads and signs from files and from the env bundle, with the same kid', async () => {
    const data = Buffer.from('UniVault key-store test');
    const fromFile = await fileStore().getSigningKey('employer-a');
    const fromEnv = await envStore(bundle).getSigningKey('employer-a');
    expect(fromFile.kid).toBe(kids.employer);
    expect(fromEnv.kid).toBe(kids.employer);

    const [row] = await t.database.db
      .select({ publicJwk: issuerKeys.publicJwk })
      .from(issuerKeys)
      .where(eq(issuerKeys.kid, kids.employer));
    const publicKey = createPublicKey({
      key: { kty: 'RSA', n: row!.publicJwk.n as string, e: row!.publicJwk.e as string },
      format: 'jwk',
    });
    for (const key of [fromFile, fromEnv]) {
      expect(verify('sha256', data, publicKey, sign('sha256', data, key.privateKey))).toBe(true);
    }
  });

  it('bundles every active key, encrypted, with ids and kids only in the result', async () => {
    const entries = JSON.parse(Buffer.from(bundle, 'base64').toString()) as {
      issuerId: string;
      kid: string;
      encryptedPrivateKeyPem: string;
    }[];
    expect(entries.map((e) => [e.issuerId, e.kid])).toEqual([
      ['bank-a', kids.bank],
      ['employer-a', kids.employer],
    ]);
    for (const entry of entries) {
      expect(entry.encryptedPrivateKeyPem.startsWith('-----BEGIN ENCRYPTED PRIVATE KEY-----')).toBe(
        true,
      );
    }
  });

  it('refuses to overwrite a bundle unless forced', async () => {
    const out = join(scratch, 'again.bundle.b64');
    await fileStore().writeBundle(out);
    await expect(fileStore().writeBundle(out)).rejects.toThrow(/already exists.*--force/);
    const result = await fileStore().writeBundle(out, { force: true });
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    expect(Object.keys(result).sort()).toEqual(['keys', 'path']);
  });
});

// ---------------------------------------------------------------------------
describe('KeyStoreError for every failure', () => {
  it('KEY_NOT_FOUND: no key file, or no bundle entry', async () => {
    await expectKeyError(
      fileStore({ keysDir: join(scratch, 'empty') }),
      'employer-a',
      'KEY_NOT_FOUND',
    );
    const onlyBank = toBase64(
      (JSON.parse(Buffer.from(bundle, 'base64').toString()) as { issuerId: string }[]).filter(
        (e) => e.issuerId === 'bank-a',
      ),
    );
    await expectKeyError(envStore(onlyBank), 'employer-a', 'KEY_NOT_FOUND');
    await expectKeyError(fileStore(), 'employer-b', 'KEY_NOT_FOUND'); // no active key at all
  });

  it('KEY_DECRYPT_FAILED: wrong or missing passphrase (both sources)', async () => {
    const err = await expectKeyError(
      fileStore({ passphrase: 'a-wrong-passphrase-0000' }),
      'employer-a',
      'KEY_DECRYPT_FAILED',
    );
    expect(err.kid).toBe(kids.employer);
    await expectKeyError(fileStore({ passphrase: undefined }), 'employer-a', 'KEY_DECRYPT_FAILED');
    await expectKeyError(
      envStore(bundle, { passphrase: 'a-wrong-passphrase-0000' }),
      'bank-a',
      'KEY_DECRYPT_FAILED',
    );
  });

  it('KEY_UNENCRYPTED: plain PKCS#8 or PKCS#1 keys are refused in both modes', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const plainDir = join(scratch, 'plain');
    await rm(plainDir, { recursive: true, force: true });
    await mkdir(plainDir, { recursive: true });
    const file = join(plainDir, issuerKeyFileNames(kids.employer).privateKey);
    for (const type of ['pkcs8', 'pkcs1'] as const) {
      const pem = privateKey.export({ type, format: 'pem' }) as string;
      await writeFile(file, pem);
      await expectKeyError(fileStore({ keysDir: plainDir }), 'employer-a', 'KEY_UNENCRYPTED');
      const plainBundle = toBase64([
        { issuerId: 'employer-a', kid: kids.employer, encryptedPrivateKeyPem: pem },
      ]);
      await expectKeyError(envStore(plainBundle), 'employer-a', 'KEY_UNENCRYPTED');
    }
  });

  it.each([
    ['missing', undefined],
    ['not base64', 'not base64 !!'],
    ['base64 of non-JSON', Buffer.from('hello').toString('base64')],
    ['an empty list', toBase64([])],
    [
      'a bad entry',
      toBase64([{ issuerId: 'employer-a', kid: 'short', encryptedPrivateKeyPem: 'x' }]),
    ],
    [
      'duplicate entries',
      toBase64([
        { issuerId: 'employer-a', kid: 'A'.repeat(43), encryptedPrivateKeyPem: 'x' },
        { issuerId: 'employer-a', kid: 'A'.repeat(43), encryptedPrivateKeyPem: 'y' },
      ]),
    ],
  ])('KEY_SOURCE_INVALID: a malformed bundle (%s)', async (_label, value) => {
    await expectKeyError(envStore(value), 'employer-a', 'KEY_SOURCE_INVALID');
  });

  it("KEY_KID_MISMATCH: another key stored under this issuer's kid", async () => {
    const other = await generateIssuerKeys({ passphrase: PASSPHRASE });
    const swapDir = join(scratch, 'swapped');
    await mkdir(swapDir, { recursive: true });
    await writeFile(
      join(swapDir, issuerKeyFileNames(kids.employer).privateKey),
      other.privateKeyPem,
    );
    await expectKeyError(fileStore({ keysDir: swapDir }), 'employer-a', 'KEY_KID_MISMATCH');
    const swapped = toBase64([
      { issuerId: 'employer-a', kid: kids.employer, encryptedPrivateKeyPem: other.privateKeyPem },
    ]);
    await expectKeyError(envStore(swapped), 'employer-a', 'KEY_KID_MISMATCH');
  });

  it('KEY_PUBLIC_MISMATCH: the stored public JWK differs from the private key', async () => {
    const keys = createIssuerKeysService(t.database.db, {
      keyStore: fileStore(),
      publicBaseUrl: 'http://localhost:4000',
    });
    const { kid } = await keys.generateKey('employer-b');
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({
      format: 'jwk',
    });
    const [row] = await t.database.db.select().from(issuerKeys).where(eq(issuerKeys.kid, kid));
    await t.database.db
      .update(issuerKeys)
      .set({ publicJwk: { ...row!.publicJwk, n: other.n } })
      .where(eq(issuerKeys.kid, kid));
    try {
      await expectKeyError(fileStore(), 'employer-b', 'KEY_PUBLIC_MISMATCH');
    } finally {
      await t.database.db
        .update(issuerKeys)
        .set({ publicJwk: row!.publicJwk })
        .where(eq(issuerKeys.kid, kid));
    }
  });

  it('never puts paths, PEM text or the passphrase in a KeyStoreError', async () => {
    const err = await expectKeyError(
      fileStore({ keysDir: join(scratch, 'empty') }),
      'employer-a',
      'KEY_NOT_FOUND',
    );
    for (const secret of [scratch, keysDir, PASSPHRASE, 'PRIVATE KEY', '.pem']) {
      expect(err.message).not.toContain(secret);
    }
    expect(JSON.stringify(err)).not.toContain(scratch);
  });
});

// ---------------------------------------------------------------------------
describe('API mapping: 503 ISSUER_KEY_UNAVAILABLE with no detail', () => {
  it('answers a generic 503 and logs the code with issuer id and kid only', async () => {
    const captured = newLogger();
    const app = appWith(fileStore({ passphrase: 'a-wrong-passphrase-0000' }), captured.logger);
    const id = await pendingCredential(app, 'employer');
    const res = await simulateRedemption(app, 'employer', id);
    expect(res.status).toBe(503);
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message', 'requestId']);
    expect(res.body.error).toMatchObject({
      code: 'ISSUER_KEY_UNAVAILABLE',
      message: 'The issuer signing key is not available. Try again later.',
    });
    expect(res.text).not.toMatch(/KEY_DECRYPT_FAILED|employer-a|PRIVATE|passphrase/);
    expect(res.text).not.toContain(kids.employer);
    expect(captured.lines()).toContainEqual(
      expect.objectContaining({
        level: 50,
        msg: 'Issuer signing key unavailable',
        keyStore: { code: 'KEY_DECRYPT_FAILED', issuerId: 'employer-a', kid: kids.employer },
      }),
    );
  });
});

// ---------------------------------------------------------------------------
describe('decrypt once, reload on rotation', () => {
  it('decrypts each key once across many signings, and again only after rotation', async () => {
    let decryptions = 0;
    const store = fileStore({
      decrypt: (pem, passphrase) => {
        decryptions += 1;
        return createPrivateKey({ key: pem, format: 'pem', passphrase });
      },
    });
    const app = appWith(store);
    const ids = await Promise.all([1, 2, 3, 4, 5].map(() => pendingCredential(app, 'employer')));
    // Concurrent first use: still one decryption
    const signed = await Promise.all(
      ids.slice(0, 3).map((id) => simulateRedemption(app, 'employer', id)),
    );
    for (const id of ids.slice(3)) signed.push(await simulateRedemption(app, 'employer', id));
    expect(signed.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(decryptions).toBe(1);
    expect((await store.status()).loaded).toBeGreaterThanOrEqual(1);

    // Rotation through the API: the entry is cleared and the NEW key loaded (one decryption)
    const rotated = await request(app)
      .post('/api/v1/issuers/employer-a/keys')
      .set('Authorization', `Bearer ${tokens.employerAdmin}`);
    expect(rotated.status).toBe(201);
    // The rotation response carries public information only
    for (const member of PRIVATE_MEMBERS) expect(rotated.body).not.toHaveProperty(member);
    expect(rotated.text).not.toMatch(/PRIVATE KEY|privateKey|Pem|passphrase/i);
    expect(decryptions).toBe(2);
    expect((await store.getSigningKey('employer-a')).kid).toBe(rotated.body.kid);
    const after = await simulateRedemption(
      app,
      'employer',
      await pendingCredential(app, 'employer'),
    );
    expect(after.body.credential.issuerKid).toBe(rotated.body.kid);
    expect(decryptions).toBe(2);
    kids.employer = rotated.body.kid; // later tests use the current key
    bundle = (
      await readFile(
        (await fileStore().writeBundle(join(scratch, 'current.bundle.b64'))).path,
        'utf8',
      )
    ).trim();
  });

  it('refuses rotation in env mode (409) and creates nothing', async () => {
    const app = appWith(envStore(bundle));
    const before = await t.database.db.select().from(issuerKeys);
    const res = await request(app)
      .post('/api/v1/issuers/employer-a/keys')
      .set('Authorization', `Bearer ${tokens.employerAdmin}`);
    errorBodies.push(res.text);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('KEY_ROTATION_UNSUPPORTED_IN_ENV_MODE');
    expect(res.body.error.message).toMatch(
      /generate the key locally.*ISSUER_KEYS_BUNDLE.*redeploy/i,
    );
    expect(await t.database.db.select().from(issuerKeys)).toHaveLength(before.length);
  });

  it('signs in env mode through the API', async () => {
    const app = appWith(envStore(bundle));
    const res = await simulateRedemption(app, 'bank', await pendingCredential(app, 'bank'));
    expect(res.status).toBe(200);
    expect(res.body.credential.issuerKid).toBe(kids.bank);
  });
});

// ---------------------------------------------------------------------------
describe('retry backoff after a failed load (KEY_RETRY_BACKOFF_SECONDS)', () => {
  /**
   * A file store with an injected clock whose decryption can be "broken" (real decryption with
   * a wrong passphrase) and "fixed" again, counting every decryption attempt.
   */
  function backoffStore(retryBackoffSeconds?: number) {
    const state = { broken: true, decryptions: 0, clock: 1_000_000 };
    const store = fileStore({
      ...(retryBackoffSeconds === undefined ? {} : { retryBackoffSeconds }),
      now: () => state.clock,
      decrypt: (pem, passphrase) => {
        state.decryptions += 1;
        return createPrivateKey({
          key: pem,
          format: 'pem',
          passphrase: state.broken ? 'a-wrong-passphrase-0000' : passphrase,
        });
      },
    });
    return { store, state };
  }

  it('answers repeated signings within the window from the cached failure (one decryption)', async () => {
    const { store, state } = backoffStore(); // default 30 s
    for (let i = 0; i < 5; i += 1) {
      await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    }
    expect(state.decryptions).toBe(1);
    state.clock += 29_999;
    const cached = await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    expect(cached.kid).toBe(kids.employer);
    expect(state.decryptions).toBe(1);
    expect(await store.status()).toMatchObject({ status: 'degraded', failed: 1 });
  });

  it('retries after the window, and a fixed key then works', async () => {
    const { store, state } = backoffStore(30);
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    state.clock += 30_000; // window over: the next call retries (still broken)
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    expect(state.decryptions).toBe(2);

    state.broken = false; // fixed, but a new failure window has just started
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    expect(state.decryptions).toBe(2);
    state.clock += 30_000;
    expect((await store.getSigningKey('employer-a')).kid).toBe(kids.employer);
    expect(state.decryptions).toBe(3);
    await store.getSigningKey('employer-a'); // cached from now on
    expect(state.decryptions).toBe(3);
    expect((await store.status()).failed).toBe(0);
  });

  it('reload() clears the cached failure at once', async () => {
    const { store, state } = backoffStore(3600);
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    state.broken = false;
    await store.reload('employer-a'); // no clock change needed
    expect(state.decryptions).toBe(2);
    expect((await store.getSigningKey('employer-a')).kid).toBe(kids.employer);
    expect(state.decryptions).toBe(2);
  });

  it('a start-up failure counts too: signings in the window do not decrypt again (API)', async () => {
    const { store, state } = backoffStore();
    const captured = newLogger();
    await checkIssuerKeysAtStartup(store, {
      strict: false,
      production: false,
      logger: captured.logger,
    });
    const before = state.decryptions;
    const app = appWith(store, captured.logger);
    for (let i = 0; i < 3; i += 1) {
      const res = await simulateRedemption(
        app,
        'employer',
        await pendingCredential(app, 'employer'),
      );
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('ISSUER_KEY_UNAVAILABLE');
    }
    expect(state.decryptions).toBe(before);
  });

  it('0 disables the backoff: every call retries', async () => {
    const { store, state } = backoffStore(0);
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    await expectKeyError(store, 'employer-a', 'KEY_DECRYPT_FAILED');
    expect(state.decryptions).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('start-up check', () => {
  /** A file store whose folder holds every key file except bank-a's. */
  async function storeMissingBank() {
    const dir = await mkdtemp(join(scratch, 'partial-'));
    const bankFile = issuerKeyFileNames(kids.bank).privateKey;
    for (const name of await readdir(keysDir)) {
      if (name.endsWith('.private.pem') && name !== bankFile) {
        await copyFile(join(keysDir, name), join(dir, name));
      }
    }
    return fileStore({ keysDir: dir });
  }

  it('development: warns per failed issuer, starts degraded, only that issuer fails', async () => {
    const captured = newLogger();
    const store = await storeMissingBank();
    const result = await checkIssuerKeysAtStartup(store, {
      strict: false,
      production: false,
      logger: captured.logger,
    });
    expect(result).toMatchObject({ ok: true, loaded: 2 }); // employer-a and employer-b load
    const lines = captured.lines();
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 40,
        issuerId: 'bank-a',
        kid: kids.bank,
        code: 'KEY_NOT_FOUND',
      }),
    );
    expect(lines).toContainEqual(
      expect.objectContaining({
        level: 40,
        msg: expect.stringMatching(/^issuer keys loaded: 2\/3/),
      }),
    );

    const app = appWith(store, captured.logger);
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(503);
    expect(health.body).toMatchObject({
      status: 'degraded',
      database: 'up',
      keys: { status: 'degraded', activeKeys: 3, loaded: 2 },
    });
    expect(Object.keys(health.body.keys).sort()).toEqual(['activeKeys', 'loaded', 'status']);
    expect(health.text).not.toMatch(/bank-a|employer-a|KEY_NOT_FOUND/);
    expect(health.text).not.toContain(kids.bank);

    expect(
      (await simulateRedemption(app, 'employer', await pendingCredential(app, 'employer'))).status,
    ).toBe(200);
    const bank = await simulateRedemption(app, 'bank', await pendingCredential(app, 'bank'));
    expect(bank.status).toBe(503);
    expect(bank.body.error.code).toBe('ISSUER_KEY_UNAVAILABLE');
  });

  it('health is ok with every key loaded', async () => {
    const store = fileStore();
    const captured = newLogger();
    expect(
      (
        await checkIssuerKeysAtStartup(store, {
          strict: true,
          production: true,
          logger: captured.logger,
        })
      ).ok,
    ).toBe(true);
    expect(captured.lines()).toContainEqual(
      expect.objectContaining({ level: 30, msg: 'issuer keys loaded: 3/3', source: 'file' }),
    );
    const health = await request(appWith(store)).get('/api/v1/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      status: 'ok',
      keys: { status: 'ok', activeKeys: 3, loaded: 3 },
    });
  });

  const strictCases: [string, () => Promise<KeyStore>, KeyStoreErrorCode][] = [
    ['a missing key', storeMissingBank, 'KEY_NOT_FOUND'],
    [
      'a wrong passphrase',
      async () => fileStore({ passphrase: 'a-wrong-passphrase-0000' }),
      'KEY_DECRYPT_FAILED',
    ],
    ['a malformed bundle', async () => envStore('bm90IGpzb24='), 'KEY_SOURCE_INVALID'],
    [
      'an unencrypted key',
      async () => {
        const pem = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
          type: 'pkcs8',
          format: 'pem',
        });
        return envStore(
          toBase64([{ issuerId: 'bank-a', kid: kids.bank, encryptedPrivateKeyPem: pem }]),
        );
      },
      'KEY_UNENCRYPTED',
    ],
    [
      'a kid mismatch',
      async () => {
        const other = await generateIssuerKeys({ passphrase: PASSPHRASE });
        return envStore(
          toBase64([
            { issuerId: 'bank-a', kid: kids.bank, encryptedPrivateKeyPem: other.privateKeyPem },
          ]),
        );
      },
      'KEY_KID_MISMATCH',
    ],
  ];
  it.each(strictCases)(
    'production (strict): refuses to start with %s',
    async (_label, makeStore, code) => {
      const captured = newLogger();
      const result = await checkIssuerKeysAtStartup(await makeStore(), {
        strict: true,
        production: true,
        logger: captured.logger,
      });
      expect(result.ok).toBe(false);
      const errors = captured.lines().filter((l) => l.level === 50);
      expect(errors).toContainEqual(
        expect.objectContaining({ issuerId: 'bank-a', kid: kids.bank, code }),
      );
      for (const line of errors) expect(Object.keys(line)).not.toContain('err');
      expect(captured.lines()).toContainEqual(
        expect.objectContaining({ level: 60, msg: expect.stringMatching(/refusing to start/) }),
      );
    },
  );

  it('warns about key files readable by others (POSIX) and skips the check on Windows', async () => {
    const name = issuerKeyFileNames(kids.employer).privateKey;
    await chmod(join(keysDir, name), 0o644);
    const posix = newLogger();
    await checkIssuerKeysAtStartup(fileStore({ platform: 'linux' }), {
      strict: false,
      production: false,
      logger: posix.logger,
    });
    expect(posix.lines()).toContainEqual(
      expect.objectContaining({
        level: 40,
        issuerId: 'employer-a',
        kid: kids.employer,
        msg: expect.stringMatching(/readable by group or others/),
      }),
    );
    await chmod(join(keysDir, name), 0o600);

    const windows = newLogger();
    await checkIssuerKeysAtStartup(fileStore({ platform: 'win32' }), {
      strict: false,
      production: false,
      logger: windows.logger,
    });
    const skipped = windows
      .lines()
      .filter((l) => String(l.msg).includes('permission check skipped'));
    expect(skipped).toHaveLength(1);
    expect(skipped[0]!.level).toBe(20);

    const production = newLogger();
    await checkIssuerKeysAtStartup(fileStore({ platform: 'linux' }), {
      strict: true,
      production: true,
      logger: production.logger,
    });
    expect(production.lines().some((l) => String(l.msg).includes('readable'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('public keys only', () => {
  const expectPublicOnly = (jwks: { keys: Record<string, unknown>[] }) => {
    for (const key of jwks.keys) {
      for (const member of PRIVATE_MEMBERS) expect(key).not.toHaveProperty(member);
      expect(
        Object.keys(key).every((k) => ['kty', 'n', 'e', 'kid', 'alg', 'use'].includes(k)),
      ).toBe(true);
    }
  };

  it('never publishes private JWK members, even if one were stored', async () => {
    const [row] = await t.database.db
      .select()
      .from(issuerKeys)
      .where(and(eq(issuerKeys.issuerId, 'bank-a'), eq(issuerKeys.status, 'active')));
    // Plant private members in the stored JWK: the API must still publish public members only
    await t.database.db
      .update(issuerKeys)
      .set({ publicJwk: { ...row!.publicJwk, d: 'x', p: 'x', q: 'x', dp: 'x', dq: 'x', qi: 'x' } })
      .where(eq(issuerKeys.kid, row!.kid));
    try {
      for (const issuerId of ['employer-a', 'bank-a']) {
        const res = await request(t.app).get(`/api/v1/issuers/${issuerId}/keys`);
        expect(res.status).toBe(200);
        expectPublicOnly(JSON.parse(res.text) as { keys: Record<string, unknown>[] });
      }
    } finally {
      await t.database.db
        .update(issuerKeys)
        .set({ publicJwk: row!.publicJwk })
        .where(eq(issuerKeys.kid, row!.kid));
    }
  });
});

// ---------------------------------------------------------------------------
describe('leak scan', () => {
  it('no log line or error body contains key material, the passphrase, the bundle or paths', () => {
    const texts = [
      ...allLogs.flatMap((lines) => lines().map((l) => JSON.stringify(l))),
      ...errorBodies,
    ];
    expect(texts.length).toBeGreaterThan(20);
    const escaped = (s: string) => JSON.stringify(s).slice(1, -1); // as it appears inside JSON
    for (const text of texts) {
      expect(text).not.toContain('PRIVATE KEY');
      expect(text).not.toContain(PASSPHRASE);
      expect(text).not.toContain(bundle.slice(200, 260)); // inside the encrypted key data
      for (const path of [keysDir, scratch]) {
        expect(text).not.toContain(path);
        expect(text).not.toContain(escaped(path));
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('single owner of private keys', () => {
  it('no source file except src/keys/key-store.ts loads, decrypts, generates or saves private keys', async () => {
    const { readdir: list, readFile: read } = await import('node:fs/promises');
    const srcDir = new URL('../src/', import.meta.url);
    const files = (await list(srcDir, { recursive: true }))
      .map(String)
      .filter((f) => f.endsWith('.ts'))
      .map((f) => f.split('\\').join('/'));
    expect(files).toContain('keys/key-store.ts');
    const forbidden =
      /createPrivateKey|loadIssuerPrivateKey|saveIssuerKeyPair|generateIssuerKeys|\.private\.pem/;
    const offenders = [];
    for (const file of files.filter((f) => f !== 'keys/key-store.ts')) {
      if (forbidden.test(await read(new URL(file, srcDir), 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
