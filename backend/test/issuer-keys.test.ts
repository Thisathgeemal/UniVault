import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  computeRsaJwkThumbprint,
  createSdJwt,
  loadIssuerPrivateKey,
  verifySdJwt,
  type IssuerPublicJwk,
} from '@univault/crypto-core/node';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JWKS_CACHE_SECONDS } from '../src/routes/issuers.routes.js';
import { issuerKeys } from '../src/db/schema.js';
import { createIssuerKeysService } from '../src/services/issuer-keys.service.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi'];

let keysDir: string;
let t: AuthedTestApp;
let admin: string;

const jwks = (issuerId: string) => request(t.app).get(`/api/v1/issuers/${issuerId}/keys`);
const generate = (issuerId: string, token: string) =>
  request(t.app).post(`/api/v1/issuers/${issuerId}/keys`).set('Authorization', `Bearer ${token}`);

/** Signs a sample credential with a stored private key (as the issuance API will). */
async function signWith(kid: string) {
  const privateKey = await loadIssuerPrivateKey(keysDir, kid, PASSPHRASE);
  return createSdJwt(
    {
      iss: 'http://localhost:4000/api/v1/issuers/employer-a',
      issuer_name: 'Serendib Trading Company (Demo)',
      employee_id: 'STC-00001',
      full_name: 'Lahiru Silva',
    },
    ['employee_id', 'full_name'],
    { kid, privateKey },
  );
}

/** What a verifier does: read the kid from the credential header and find that key in the JWKS. */
function pickKey(set: { keys: IssuerPublicJwk[] }, credential: string): IssuerPublicJwk {
  const header = JSON.parse(Buffer.from(credential.split('.')[0]!, 'base64url').toString()) as {
    kid: string;
  };
  const key = set.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error('kid not found in JWKS');
  return key;
}

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-issuer-keys-'));
  t = await authedTestApp({ ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: PASSPHRASE });
  admin = await t.tokenFor(STAFF.employerAdmin);
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

describe('GET /issuers – issuer list', () => {
  it('lists issuers with their name, type and key-set URL (public)', async () => {
    const res = await request(t.app).get('/api/v1/issuers');
    expect(res.status).toBe(200);
    expect(res.body.issuers).toContainEqual({
      id: 'employer-a',
      name: 'Serendib Trading Company (Demo)',
      type: 'employer',
      jwksUri: 'http://localhost:4000/api/v1/issuers/employer-a/keys',
    });
    expect(res.body.issuers).toHaveLength(3);
  });
});

describe('GET /issuers/:issuerId/keys – before any key exists', () => {
  it('returns 404 ISSUER_KEYS_NOT_FOUND for a known issuer with no key yet', async () => {
    const res = await jwks('bank-a');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ISSUER_KEYS_NOT_FOUND');
  });
});

describe('POST /issuers/:issuerId/keys – key generation (admin of that issuer)', () => {
  it('generates a key: encrypted private key on disk, public key in the database', async () => {
    const res = await generate('employer-a', admin);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ issuerId: 'employer-a', alg: 'RS256', retiredKid: null });
    const kid = res.body.kid as string;

    const pem = await readFile(join(keysDir, `${kid}.private.pem`), 'utf8');
    expect(pem).toMatch(/^-----BEGIN ENCRYPTED PRIVATE KEY-----/);
    const [row] = await t.database.db.select().from(issuerKeys).where(eq(issuerKeys.kid, kid));
    expect(row).toMatchObject({ issuerId: 'employer-a', status: 'active', alg: 'RS256' });
    for (const m of PRIVATE_MEMBERS) expect(row?.publicJwk).not.toHaveProperty(m);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE KEY');
  });

  it('refuses officers (403)', async () => {
    const res = await generate('employer-a', await t.tokenFor(STAFF.employerOfficer));
    expect(res.status).toBe(403);
  });

  it('refuses an admin of a different issuer (403)', async () => {
    const res = await generate('employer-a', await t.tokenFor(STAFF.bankAdmin));
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('You can only access your own organisation');
  });

  it('refuses requests without a login (401)', async () => {
    expect((await request(t.app).post('/api/v1/issuers/employer-a/keys')).status).toBe(401);
  });

  it('returns 503 and writes nothing when no passphrase is configured', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'univault-nopass-'));
    const noPass = await authedTestApp({ ISSUER_KEYS_DIR: dir });
    const res = await request(noPass.app)
      .post('/api/v1/issuers/bank-a/keys')
      .set('Authorization', `Bearer ${await noPass.tokenFor(STAFF.bankAdmin)}`);
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('KEY_PASSPHRASE_NOT_CONFIGURED');
    expect(await readdir(dir)).toEqual([]);
    await noPass.database.close();
    await rm(dir, { recursive: true, force: true });
  });
});

describe('GET /issuers/:issuerId/keys – public key retrieval', () => {
  it('returns the public key as a JWK Set with the correct content type and caching', async () => {
    const res = await jwks('employer-a');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^application\/jwk-set\+json/);
    expect(res.headers['cache-control']).toBe(`public, max-age=${JWKS_CACHE_SECONDS}`);
    const body = JSON.parse(res.text) as { keys: IssuerPublicJwk[] };
    expect(body.keys).toHaveLength(1);
  });

  it('publishes only the standard public JWK members', async () => {
    const { keys } = JSON.parse((await jwks('employer-a')).text) as {
      keys: Record<string, unknown>[];
    };
    expect(Object.keys(keys[0]!).sort()).toEqual(['alg', 'e', 'kid', 'kty', 'n', 'use']);
    expect(keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig', e: 'AQAB' });
    for (const m of PRIVATE_MEMBERS) expect(keys[0]).not.toHaveProperty(m);
  });

  it('uses the RFC 7638 thumbprint of the key as its kid', async () => {
    const { keys } = JSON.parse((await jwks('employer-a')).text) as { keys: IssuerPublicJwk[] };
    expect(keys[0]!.kid).toBe(computeRsaJwkThumbprint(keys[0]!));
  });

  it('works without a login (verifiers and wallets are not staff)', async () => {
    expect((await request(t.app).get('/api/v1/issuers/employer-a/keys')).status).toBe(200);
  });

  it('end to end: a credential signed with the stored private key verifies with the published key', async () => {
    const [active] = await t.database.db
      .select()
      .from(issuerKeys)
      .where(eq(issuerKeys.issuerId, 'employer-a'));
    const credential = await signWith(active!.kid);
    const set = JSON.parse((await jwks('employer-a')).text) as { keys: IssuerPublicJwk[] };
    const result = await verifySdJwt(credential, pickKey(set, credential), { checkTime: false });
    expect(result.valid).toBe(true);
    expect(result.claims?.full_name).toBe('Lahiru Silva');
  });

  it('returns 404 ISSUER_NOT_FOUND for an unknown issuer', async () => {
    const res = await jwks('no-such-bank');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'ISSUER_NOT_FOUND',
      message: 'Issuer "no-such-bank" does not exist',
    });
  });

  it.each(['Bad_ID', 'ab', 'x'.repeat(41), '..%2F..%2Fetc'])(
    'returns 400 for the malformed issuer ID "%s"',
    async (id) => {
      const res = await jwks(id);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    },
  );
});

describe('key rotation', () => {
  let oldKid: string;
  let newKid: string;
  let oldCredential: string;

  beforeAll(async () => {
    const [current] = await t.database.db
      .select()
      .from(issuerKeys)
      .where(eq(issuerKeys.issuerId, 'employer-a'));
    oldKid = current!.kid;
    oldCredential = await signWith(oldKid); // issued before rotation
    const res = await generate('employer-a', admin);
    newKid = res.body.kid as string;
    expect(res.body.retiredKid).toBe(oldKid);
  });

  it('retires the old key (with a time) and activates the new one', async () => {
    const rows = await t.database.db
      .select()
      .from(issuerKeys)
      .where(eq(issuerKeys.issuerId, 'employer-a'));
    expect(rows.find((r) => r.kid === oldKid)).toMatchObject({ status: 'retired' });
    expect(rows.find((r) => r.kid === oldKid)?.retiredAt).toBeInstanceOf(Date);
    expect(rows.find((r) => r.kid === newKid)).toMatchObject({ status: 'active', retiredAt: null });
  });

  it('publishes both keys, active first', async () => {
    const { keys } = JSON.parse((await jwks('employer-a')).text) as { keys: IssuerPublicJwk[] };
    expect(keys.map((k) => k.kid)).toEqual([newKid, oldKid]);
  });

  it('a credential signed before rotation still verifies; a new one verifies with the new key', async () => {
    const set = JSON.parse((await jwks('employer-a')).text) as { keys: IssuerPublicJwk[] };
    expect(
      (await verifySdJwt(oldCredential, pickKey(set, oldCredential), { checkTime: false })).valid,
    ).toBe(true);
    const fresh = await signWith(newKid);
    expect(pickKey(set, fresh).kid).toBe(newKid);
    expect((await verifySdJwt(fresh, pickKey(set, fresh), { checkTime: false })).valid).toBe(true);
  });

  it('never exposes another issuer’s keys', async () => {
    await generate('bank-a', await t.tokenFor(STAFF.bankAdmin));
    const bank = JSON.parse((await jwks('bank-a')).text) as { keys: IssuerPublicJwk[] };
    expect(bank.keys.map((k) => k.kid)).not.toContain(newKid);
    expect(bank.keys).toHaveLength(1);
  });
});

describe('keys:init support', () => {
  it('lists issuers that still need a key', async () => {
    const service = createIssuerKeysService(t.database.db, {
      keysDir,
      passphrase: PASSPHRASE,
      publicBaseUrl: 'http://localhost:4000',
    });
    expect(await service.issuersWithoutActiveKey()).toEqual(['employer-b']);
  });
});
