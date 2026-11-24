/**
 * Development-only simulated redemption (DEV_SIMULATE_REDEMPTION): off by default,
 * refused in production, admin-only and issuer-scoped, and it never returns the SD-JWT.
 */
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { authedTestApp, STAFF, type AuthedTestApp } from './auth-helpers.js';
import { captureLogger } from './helpers.js';

const EMPLOYEE_CLAIMS = (
  JSON.parse(
    readFileSync(new URL('./fixtures/seed-data/employees.json', import.meta.url), 'utf8'),
  ) as { records: { claims: Record<string, unknown> }[] }
).records[0]!.claims;

let keysDir: string;
let enabled: AuthedTestApp;
let disabled: AuthedTestApp;
let admin: string;
let officer: string;
let bankAdmin: string;
let enabledLogs: ReturnType<typeof captureLogger>['lines'];
let disabledLogs: ReturnType<typeof captureLogger>['lines'];

const simulate = (app: AuthedTestApp, id: string, token: string) =>
  request(app.app)
    .post(`/api/v1/dev/credentials/${id}/simulate-redemption`)
    .set('Authorization', `Bearer ${token}`);

async function pendingCredential(employeeId: string) {
  const holder = await request(enabled.app)
    .post('/api/v1/holders')
    .set('Authorization', `Bearer ${officer}`)
    .send({ claims: { ...EMPLOYEE_CLAIMS, employee_id: employeeId } });
  const credential = await request(enabled.app)
    .post('/api/v1/credentials')
    .set('Authorization', `Bearer ${officer}`)
    .send({ holderId: holder.body.id });
  expect(credential.status).toBe(201);
  return credential.body.id as string;
}

beforeAll(async () => {
  keysDir = await mkdtemp(join(tmpdir(), 'univault-dev-routes-'));
  const keys = { ISSUER_KEYS_DIR: keysDir, ISSUER_KEY_PASSPHRASE: 'test-key-passphrase-123' };
  const enabledLogger = captureLogger();
  const disabledLogger = captureLogger();
  enabledLogs = enabledLogger.lines;
  disabledLogs = disabledLogger.lines;
  [enabled, disabled] = await Promise.all([
    authedTestApp({ ...keys, DEV_SIMULATE_REDEMPTION: 'true' }, enabledLogger.logger),
    authedTestApp(keys, disabledLogger.logger),
  ]);
  [admin, officer, bankAdmin] = await Promise.all([
    enabled.tokenFor(STAFF.employerAdmin),
    enabled.tokenFor(STAFF.employerOfficer),
    enabled.tokenFor(STAFF.bankAdmin),
  ]);
  const key = await request(enabled.app)
    .post('/api/v1/issuers/employer-a/keys')
    .set('Authorization', `Bearer ${admin}`);
  expect(key.status).toBe(201);
});

afterAll(async () => {
  await Promise.all([enabled.database.close(), disabled.database.close()]);
  await rm(keysDir, { recursive: true, force: true });
});

describe('POST /dev/credentials/:id/simulate-redemption', () => {
  it('is not mounted unless DEV_SIMULATE_REDEMPTION=true (404)', async () => {
    const token = await disabled.tokenFor(STAFF.employerAdmin);
    const res = await simulate(disabled, '00000000-0000-4000-8000-000000000000', token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('logs exactly one warning at start-up when enabled, and none when disabled', () => {
    const startupWarnings = (lines: Record<string, unknown>[]) =>
      lines.filter((l) => String(l.msg).startsWith('DEV_SIMULATE_REDEMPTION=true'));
    const warnings = startupWarnings(enabledLogs());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ level: 40 }); // pino "warn"
    expect(startupWarnings(disabledLogs())).toHaveLength(0);
  });

  it('is refused in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'x'.repeat(40),
        ISSUER_KEY_PASSPHRASE: 'production-passphrase',
        DATABASE_URL: 'postgres://u:p@localhost:5432/db',
        DEV_SIMULATE_REDEMPTION: 'true',
      }),
    ).toThrow(/DEV_SIMULATE_REDEMPTION: must not be enabled in production/);
  });

  it('signs a pending credential through signCredential and returns metadata only', async () => {
    const id = await pendingCredential('DEV-00001');
    const res = await simulate(enabled, id, admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ simulated: true, credential: { id, status: 'valid' } });
    expect(res.body.credential.issuerKid).toEqual(expect.any(String));
    expect(res.text).not.toMatch(/~/); // no SD-JWT (compact form contains "~")
    expect(res.body).not.toHaveProperty('sdJwt');

    const again = await simulate(enabled, id, admin);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('CREDENTIAL_NOT_PENDING');
  });

  it("is admin-only (403) and hides another issuer's credential (404)", async () => {
    const id = await pendingCredential('DEV-00002');
    expect((await simulate(enabled, id, officer)).status).toBe(403);
    const other = await simulate(enabled, id, bankAdmin);
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });
});
