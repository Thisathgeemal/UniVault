/**
 * Public credential status (FR-BAK-01, Decision 013): GET /api/v1/status/:credentialId,
 * the shared effectiveStatus() rule, effectiveStatus in the issuer's credential metadata,
 * and the jti / exp consistency between the signed SD-JWT and the status endpoint.
 */
import { generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeSdJwt } from '@univault/crypto-core';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { credentialRecords } from '../src/db/schema.js';
import { effectiveStatus, type CredentialStatus } from '../src/services/credential-status.js';
import { loadCredentialSchemas } from '../src/services/credential-schemas.js';
import {
  createCredentialsService,
  type CredentialsService,
} from '../src/services/credentials.service.js';
import { createKeyStore } from '../src/keys/key-store.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger, testConfig } from './helpers.js';

const PASSPHRASE = 'test-key-passphrase-123';
const BASE_URL = 'http://localhost:4000';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';
const DAY_MS = 86_400_000;
const STATUS_KEYS = ['checkedAt', 'credentialId', 'expiresAt', 'status'];
const VERIFIER_ORIGIN = 'https://verifier.example';

const EMPLOYEE_CLAIMS = (
  JSON.parse(
    readFileSync(new URL('./fixtures/seed-data/employees.json', import.meta.url), 'utf8'),
  ) as { records: { claims: Record<string, unknown> }[] }
).records[0]!.claims;

/** Test clock shared by the app and the signer: null = real time. */
let fixedNow: Date | null = null;
const clock = () => fixedNow ?? new Date();

let keysDir: string;
let t: AuthedTestApp;
let logs: () => Record<string, unknown>[];
let signer: CredentialsService;
let officer: string;
let admin: string;

const status = (id: string) => request(t.app).get(`/api/v1/status/${id}`);
const authed = (method: 'get' | 'post', path: string, token = officer) =>
  request(t.app)[method](`/api/v1${path}`).set('Authorization', `Bearer ${token}`);
const walletKey = () =>
  generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });

let employeeCounter = 0;
async function newEmployee() {
  employeeCounter += 1;
  const res = await authed('post', '/holders').send({
    claims: { ...EMPLOYEE_CLAIMS, employee_id: `STS-${String(employeeCounter).padStart(5, '0')}` },
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

async function issuePending() {
  const res = await authed('post', '/credentials').send({ holderId: await newEmployee() });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

/** Pending, then signed the way Sprint 2 redemption will do it → 'valid'. */
async function issueValid() {
  const id = await issuePending();
  const signed = await signer.signCredential(id, walletKey());
  return { id, sdJwt: signed.sdJwt };
}

const recordOf = async (id: string) =>
  (await t.database.db.select().from(credentialRecords).where(eq(credentialRecords.id, id)))[0]!;

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-status-'));
  const captured = captureLogger(testConfig({ LOG_LEVEL: 'debug' }));
  logs = captured.lines;
  t = await authedTestApp(
    {
      ISSUER_KEYS_DIR: keysDir,
      ISSUER_KEY_PASSPHRASE: PASSPHRASE,
      PUBLIC_BASE_URL: BASE_URL,
      STATUS_RATE_LIMIT_MAX: '1000', // the rate-limit test uses its own app
    },
    captured.logger,
    { now: clock },
  );
  [officer, admin] = await Promise.all([
    t.tokenFor(STAFF.employerOfficer),
    t.tokenFor(STAFF.employerAdmin),
  ]);
  const key = await authed('post', '/issuers/employer-a/keys', admin);
  expect(key.status).toBe(201);
  signer = createCredentialsService(t.database.db, loadCredentialSchemas(), {
    keyStore: createKeyStore({
      db: t.database.db,
      source: 'file',
      keysDir,
      passphrase: PASSPHRASE,
    }),
    publicBaseUrl: BASE_URL,
    now: clock,
  });
});

afterEach(() => {
  fixedNow = null;
});

afterAll(async () => {
  await t.database.close();
  await rm(keysDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
describe('effectiveStatus() (pure, shared by the status endpoint and the portal)', () => {
  const expiresAt = new Date('2027-06-30T00:00:00.000Z');
  const at = (offsetMs: number) => new Date(expiresAt.getTime() + offsetMs);

  it.each<[string, CredentialStatus, number, string]>([
    ['valid before expiry', 'valid', -DAY_MS, 'valid'],
    ['valid one second before expiry', 'valid', -1000, 'valid'],
    ['valid one millisecond before expiry', 'valid', -1, 'valid'],
    ['valid exactly at expiry (inclusive boundary)', 'valid', 0, 'expired'],
    ['valid after expiry', 'valid', DAY_MS, 'expired'],
    ['revoked before expiry', 'revoked', -DAY_MS, 'revoked'],
    ['revoked after expiry (revoked wins)', 'revoked', DAY_MS, 'revoked'],
    ['superseded before expiry', 'superseded', -DAY_MS, 'superseded'],
    ['superseded after expiry (superseded wins)', 'superseded', DAY_MS, 'superseded'],
    ['pending before expiry', 'pending', -DAY_MS, 'pending'],
    ['pending after expiry (stays pending)', 'pending', DAY_MS, 'pending'],
  ])('%s', (_label, stored, offset, expected) => {
    expect(effectiveStatus({ status: stored, expiresAt }, at(offset))).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
describe('GET /status/:credentialId', () => {
  it('returns 200 valid with exactly the four documented keys, without a token', async () => {
    const { id } = await issueValid();
    const res = await status(id); // no Authorization header
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(STATUS_KEYS);
    expect(res.body).toEqual({
      credentialId: id,
      status: 'valid',
      expiresAt: (await recordOf(id)).expiresAt.toISOString(),
      checkedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
    });
  });

  it('uses the injected clock for checkedAt', async () => {
    const { id } = await issueValid();
    fixedNow = new Date(Date.now() + DAY_MS);
    expect((await status(id)).body.checkedAt).toBe(fixedNow.toISOString());
  });

  it('reports a revoked valid credential as revoked', async () => {
    const { id } = await issueValid();
    const res = await authed('post', `/credentials/${id}/revoke`, admin).send({
      reason: 'employment_ended',
    });
    expect(res.status).toBe(200);
    expect((await status(id)).body).toMatchObject({ credentialId: id, status: 'revoked' });
  });

  it('hides a credential revoked while pending (never signed): same 404 as an unknown id', async () => {
    const id = await issuePending();
    const revoked = await authed('post', `/credentials/${id}/revoke`, admin).send({
      reason: 'issued_in_error',
    });
    expect(revoked.status).toBe(200);
    const [unknown, res] = await Promise.all([status(UNKNOWN_ID), status(id)]);
    expect(res.status).toBe(404);
    const { requestId: _a, ...body } = res.body.error as Record<string, unknown>;
    const { requestId: _b, ...unknownBody } = unknown.body.error as Record<string, unknown>;
    expect(body).toEqual(unknownBody);
    expect(res.text).not.toContain(id);
    // The issuer API still shows the real status: effectiveStatus() is unchanged
    expect((await authed('get', `/credentials/${id}`)).body).toMatchObject({
      status: 'revoked',
      effectiveStatus: 'revoked',
      issuedAt: null,
    });
  });

  it('hides any credential without issued_at, whatever its stored status', async () => {
    const { id } = await issueValid();
    // Simulate a row that is not pending but was never signed (defence in depth)
    await t.database.db
      .update(credentialRecords)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: 'other',
        issuedAt: null,
        issuerKid: null,
        holderKeyThumbprint: null,
      })
      .where(eq(credentialRecords.id, id));
    const res = await status(id);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CREDENTIAL_STATUS_NOT_FOUND');
  });

  it('reports a reissued credential as superseded (and hides its pending replacement)', async () => {
    const { id } = await issueValid();
    const res = await authed('post', `/credentials/${id}/reissue`).send({
      reason: 'details_changed',
    });
    expect(res.status).toBe(201);
    expect((await status(id)).body).toMatchObject({ status: 'superseded' });
    expect((await status(res.body.credential.id)).status).toBe(404);
  });

  it('reports expired once the injected clock passes expires_at', async () => {
    const { id } = await issueValid();
    const { expiresAt } = await recordOf(id);
    fixedNow = new Date(expiresAt.getTime() + DAY_MS);
    const res = await status(id);
    expect(res.body).toEqual({
      credentialId: id,
      status: 'expired',
      expiresAt: expiresAt.toISOString(),
      checkedAt: fixedNow.toISOString(),
    });
    expect((await recordOf(id)).status).toBe('valid'); // nothing writes 'expired'
  });

  it('treats now == expires_at as expired and one second before as valid', async () => {
    const { id } = await issueValid();
    const { expiresAt } = await recordOf(id);
    fixedNow = new Date(expiresAt.getTime() - 1000);
    expect((await status(id)).body.status).toBe('valid');
    fixedNow = expiresAt;
    expect((await status(id)).body.status).toBe('expired');
  });

  it('keeps revoked and superseded ahead of expired', async () => {
    const { id: revokedId } = await issueValid();
    await authed('post', `/credentials/${revokedId}/revoke`, admin).send({
      reason: 'other',
      note: 'x',
    });
    const { id: supersededId } = await issueValid();
    await authed('post', `/credentials/${supersededId}/reissue`).send({
      reason: 'details_changed',
    });

    fixedNow = new Date(Date.now() + 5 * 365 * DAY_MS); // past every expiry
    expect((await status(revokedId)).body.status).toBe('revoked');
    expect((await status(supersededId)).body.status).toBe('superseded');
  });

  it('answers 404 CREDENTIAL_STATUS_NOT_FOUND for an unknown id', async () => {
    const res = await status(UNKNOWN_ID);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'CREDENTIAL_STATUS_NOT_FOUND',
      message: 'No status is available for this credential',
    });
    expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message', 'requestId']);
  });

  it('hides a pending credential: same status, body and headers as an unknown id', async () => {
    const pendingId = await issuePending();
    const [unknown, pending] = await Promise.all([status(UNKNOWN_ID), status(pendingId)]);
    expect(pending.status).toBe(404);
    const withoutRequestId = (body: { error: Record<string, unknown> }) => {
      const { requestId: _ignored, ...rest } = body.error;
      return rest;
    };
    expect(withoutRequestId(pending.body)).toEqual(withoutRequestId(unknown.body));
    for (const header of ['cache-control', 'content-type', 'access-control-allow-origin']) {
      expect(pending.headers[header]).toBe(unknown.headers[header]);
    }
    expect(pending.text).not.toContain(pendingId);
  });

  it('answers other methods under /status with a 404 that does not echo the id', async () => {
    const res = await request(t.app).post(`/api/v1/status/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'Route POST /api/v1/status/:credentialId not found',
    });
    expect(res.text).not.toContain(UNKNOWN_ID);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('answers 400 VALIDATION_ERROR for a malformed id', async () => {
    const res = await status('not-a-uuid');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details[0]).toMatchObject({ path: 'credentialId' });
  });

  it('never returns reasons, notes, replacement ids, holder data or staff', async () => {
    const { id } = await issueValid();
    await authed('post', `/credentials/${id}/reissue`).send({
      reason: 'other',
      note: 'Synthetic note that must not leak',
    });
    const res = await status(id);
    expect(Object.keys(res.body).sort()).toEqual(STATUS_KEYS);
    for (const secret of [
      'Synthetic note',
      'details_changed',
      'other',
      String(EMPLOYEE_CLAIMS.full_name),
      'replacedBy',
      'staff',
      'holder',
    ]) {
      expect(res.text).not.toContain(secret);
    }
  });

  it('sends Cache-Control: no-store and JSON on success and on errors', async () => {
    const { id } = await issueValid();
    for (const res of [await status(id), await status(UNKNOWN_ID), await status('bad')]) {
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['content-type']).toMatch(/^application\/json/);
    }
  });

  it('allows any origin on this route only (no credentials)', async () => {
    const { id } = await issueValid();
    const res = await status(id).set('Origin', VERIFIER_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();

    const preflight = await request(t.app)
      .options(`/api/v1/status/${id}`)
      .set('Origin', VERIFIER_ORIGIN)
      .set('Access-Control-Request-Method', 'GET');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('*');
    expect(preflight.headers['access-control-allow-methods']).toBe('GET');

    // Everything else keeps the allow-list
    const other = await authed('get', `/credentials/${id}`).set('Origin', VERIFIER_ORIGIN);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe('CORS_ORIGIN_NOT_ALLOWED');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
    const portal = await authed('get', `/credentials/${id}`).set('Origin', 'http://localhost:5173');
    expect(portal.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('logs lookups at debug level only, with the id and result and never an IP', async () => {
    const { id } = await issueValid();
    await status(id);
    await status(UNKNOWN_ID);
    const lines = logs();
    const lookups = lines.filter((l) => l.msg === 'Credential status lookup');
    expect(lookups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ level: 20, credentialId: id, result: 'valid' }),
        expect.objectContaining({ level: 20, credentialId: UNKNOWN_ID, result: 'not_found' }),
      ]),
    );
    // Nothing about a status lookup is written at info level or above
    const loud = lines.filter((l) => (l.level as number) >= 30);
    for (const line of loud) expect(JSON.stringify(line)).not.toContain(UNKNOWN_ID);
    // Every level: the route template, never the full URL
    const statusLines = lines.filter((l) =>
      String((l.req as { url?: string } | undefined)?.url ?? '').startsWith('/api/v1/status'),
    );
    expect(statusLines.length).toBeGreaterThan(0);
    for (const line of statusLines) {
      expect((line.req as { url: string }).url).toBe('/api/v1/status/:credentialId');
    }
    for (const line of lines) {
      if (line.msg === 'Credential status lookup') continue; // the one field that names the id
      expect(JSON.stringify(line)).not.toContain(`/api/v1/status/${UNKNOWN_ID}`);
      expect(JSON.stringify(line)).not.toContain(`/api/v1/status/${id}`);
    }
    for (const line of lines) {
      const text = JSON.stringify(line);
      expect(text).not.toMatch(/remoteAddress|"ip"|127\.0\.0\.1|::ffff/);
    }
  });
});

// ---------------------------------------------------------------------------
describe('rate limit', () => {
  it('answers 429 RATE_LIMITED after STATUS_RATE_LIMIT_MAX requests per window', async () => {
    const captured = captureLogger(testConfig({ LOG_LEVEL: 'info' }));
    const limited = await authedTestApp({ STATUS_RATE_LIMIT_MAX: '3' }, captured.logger);
    try {
      for (let i = 0; i < 3; i += 1) {
        expect((await request(limited.app).get(`/api/v1/status/${UNKNOWN_ID}`)).status).toBe(404);
      }
      const res = await request(limited.app).get(`/api/v1/status/${UNKNOWN_ID}`);
      expect(res.status).toBe(429);
      expect(res.body.error).toMatchObject({
        code: 'RATE_LIMITED',
        requestId: expect.any(String),
      });
      expect(res.headers['cache-control']).toBe('no-store');
      // The 429 is a warning, logged with the route template and no credential id or IP
      const warnings = captured.lines().filter((l) => l.level === 40);
      expect(warnings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'RATE_LIMITED',
            req: expect.objectContaining({ url: '/api/v1/status/:credentialId' }),
          }),
        ]),
      );
      const text = JSON.stringify(captured.lines());
      expect(text).not.toContain(UNKNOWN_ID);
      expect(text).not.toMatch(/remoteAddress|127\.0\.0\.1|::ffff/);
      // Other routes are not affected by the status limit
      expect((await request(limited.app).get('/api/v1/health')).status).toBe(200);
    } finally {
      await limited.database.close();
    }
  });
});

// ---------------------------------------------------------------------------
describe('effectiveStatus in the issuer portal metadata', () => {
  it("GET /credentials/:id shows effectiveStatus 'expired' while the stored status is 'valid'", async () => {
    const { id } = await issueValid();
    expect((await authed('get', `/credentials/${id}`)).body).toMatchObject({
      status: 'valid',
      effectiveStatus: 'valid',
    });
    fixedNow = new Date((await recordOf(id)).expiresAt.getTime() + 1000);
    expect((await authed('get', `/credentials/${id}`)).body).toMatchObject({
      status: 'valid',
      effectiveStatus: 'expired',
    });
  });

  it('filters the list by ?effectiveStatus (expired / valid) and shows the field', async () => {
    const { id } = await issueValid();
    const { holderId, expiresAt } = await recordOf(id);
    const list = async (query: string) =>
      (await authed('get', `/credentials?holderId=${holderId}&${query}`)).body;

    expect((await list('effectiveStatus=expired')).total).toBe(0);
    expect((await list('effectiveStatus=valid')).credentials[0]).toMatchObject({
      id,
      effectiveStatus: 'valid',
    });

    fixedNow = expiresAt; // inclusive boundary, as in effectiveStatus()
    const expired = await list('effectiveStatus=expired');
    expect(expired.total).toBe(1);
    expect(expired.credentials[0]).toMatchObject({
      id,
      status: 'valid',
      effectiveStatus: 'expired',
    });
    expect((await list('effectiveStatus=valid')).total).toBe(0);
    expect((await list('status=valid')).total).toBe(1); // the stored status is unchanged
  });

  it('accepts every effective status value and rejects others (400)', async () => {
    for (const value of ['pending', 'valid', 'revoked', 'superseded', 'expired']) {
      expect((await authed('get', `/credentials?effectiveStatus=${value}`)).status).toBe(200);
    }
    const bad = await authed('get', '/credentials?effectiveStatus=active');
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('effectiveStatus');
  });
});

// ---------------------------------------------------------------------------
describe('credential id and expiry in the signed SD-JWT', () => {
  it('carries jti = credential id (always visible) and exp = expires_at in seconds', async () => {
    const { id, sdJwt } = await issueValid();
    const { expiresAt } = await recordOf(id);
    const decoded = await decodeSdJwt(sdJwt);

    expect(decoded.payload.jti).toBe(id);
    expect(decoded.disclosures.map((d) => d.name)).not.toContain('jti');
    expect(decoded.payload.status).toEqual({ status_uri: `${BASE_URL}/api/v1/status/${id}` });
    // Exactly equal: expiry instants are whole seconds, so token and status never disagree
    expect(expiresAt.getTime() % 1000).toBe(0);
    expect((decoded.payload.exp as number) * 1000).toBe(expiresAt.getTime());

    const res = await status(id);
    expect(res.body.expiresAt).toBe(new Date((decoded.payload.exp as number) * 1000).toISOString());
  });
});
