import { eq } from 'drizzle-orm';
import { decodeJwt, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOKEN_AUDIENCE, TOKEN_ISSUER } from '../src/auth/tokens.js';
import { issuerStaff } from '../src/db/schema.js';
import { authedTestApp, PASSWORD, STAFF, type AuthedTestApp } from './auth-helpers.js';

const SECRET = 'test-jwt-secret-that-is-long-enough-123456';
const UUID = '6f1c2b1e-1b7a-4a43-9a51-0d0f0d1c0e11';
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Signs a token by hand, for tampering and expiry tests. */
async function craftToken(
  overrides: {
    secret?: string;
    exp?: number;
    aud?: string;
    alg?: string;
    sub?: string;
    role?: string;
    issuerId?: string;
  } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    issuer_id: overrides.issuerId ?? 'employer-a',
    role: overrides.role ?? 'admin',
  })
    .setProtectedHeader({ alg: overrides.alg ?? 'HS256' })
    .setSubject(overrides.sub ?? UUID)
    .setIssuer(TOKEN_ISSUER)
    .setAudience(overrides.aud ?? TOKEN_AUDIENCE)
    .setIssuedAt(now - 7200)
    .setExpirationTime(overrides.exp ?? now + 3600)
    .sign(new TextEncoder().encode(overrides.secret ?? SECRET));
}

let t: AuthedTestApp;
beforeAll(async () => {
  t = await authedTestApp();
});
afterAll(() => t.database.close());

const staffRow = async (email: string) =>
  (await t.database.db.select().from(issuerStaff).where(eq(issuerStaff.email, email)))[0]!;

// ---------------------------------------------------------------------------
describe('AC1 – valid issuer staff can log in', () => {
  it('logs in an officer and returns a token and profile (never the password hash)', async () => {
    const res = await t.login(STAFF.employerOfficer);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 3600,
      staff: {
        email: STAFF.employerOfficer,
        role: 'officer',
        issuer: { id: 'employer-a', name: 'Serendib Trading Company (Demo)', type: 'employer' },
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|password/i);
  });

  it('accepts the email in any letter case and with surrounding spaces', async () => {
    expect((await t.login('  ADMIN@Bank-A.example ')).status).toBe(200);
  });

  it('records the login time and resets failed attempts', async () => {
    await t.login(STAFF.bankOfficer, 'wrong-password');
    expect((await staffRow(STAFF.bankOfficer)).failedLoginAttempts).toBe(1);
    await t.login(STAFF.bankOfficer);
    const row = await staffRow(STAFF.bankOfficer);
    expect(row.failedLoginAttempts).toBe(0);
    expect(row.lastLoginAt).toBeInstanceOf(Date);
  });

  it('GET /auth/me returns the logged-in staff member', async () => {
    const token = await t.tokenFor(STAFF.bankAdmin);
    const res = await request(t.app).get('/api/v1/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.staff).toMatchObject({
      email: STAFF.bankAdmin,
      role: 'admin',
      issuer: { id: 'bank-a' },
    });
  });

  it('POST /auth/logout returns 204', async () => {
    const token = await t.tokenFor(STAFF.bankAdmin);
    expect((await request(t.app).post('/api/v1/auth/logout').set(bearer(token))).status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
describe('AC2 – authentication tokens are generated', () => {
  it('issues a signed JWT with staff, issuer, role, issuer/audience and expiry claims', async () => {
    const token = await t.tokenFor(STAFF.employerAdmin);
    expect(token.split('.')).toHaveLength(3);
    const claims = decodeJwt(token);
    const row = await staffRow(STAFF.employerAdmin);
    expect(claims).toMatchObject({
      sub: row.id,
      issuer_id: 'employer-a',
      role: 'admin',
      iss: TOKEN_ISSUER,
      aud: TOKEN_AUDIENCE,
    });
    expect(claims.exp! - claims.iat!).toBe(3600);
    expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('uses the configured lifetime', async () => {
    const short = await authedTestApp({ JWT_EXPIRES_IN_SECONDS: '900' });
    const claims = decodeJwt(await short.tokenFor(STAFF.bankOfficer));
    expect(claims.exp! - claims.iat!).toBe(900);
    await short.database.close();
  });

  it('issues a different token for every login', async () => {
    expect(await t.tokenFor(STAFF.bankAdmin)).not.toBe(await t.tokenFor(STAFF.bankAdmin));
  });
});

// ---------------------------------------------------------------------------
describe('AC3 – protected endpoints require valid authentication', () => {
  it('rejects a missing token with 401 and a WWW-Authenticate header', async () => {
    const res = await request(t.app).get('/api/v1/holders');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(res.headers['www-authenticate']).toMatch(/^Bearer/);
  });

  it.each([
    ['a non-Bearer scheme', 'Basic dXNlcjpwYXNz'],
    ['an empty Bearer value', 'Bearer '],
    ['two tokens', 'Bearer a.b.c d.e.f'],
  ])('rejects %s', async (_label, header) => {
    const res = await request(t.app).get('/api/v1/holders').set('Authorization', header);
    expect(res.status).toBe(401);
  });

  it('accepts a valid token', async () => {
    const res = await request(t.app)
      .get('/api/v1/holders')
      .set(bearer(await t.tokenFor(STAFF.employerOfficer)));
    expect(res.status).toBe(200); // authenticated – holder list returned
  });

  it('rejects an expired token with TOKEN_EXPIRED', async () => {
    const row = await staffRow(STAFF.employerAdmin);
    const expired = await craftToken({ sub: row.id, exp: Math.floor(Date.now() / 1000) - 120 });
    const res = await request(t.app).get('/api/v1/auth/me').set(bearer(expired));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it.each([
    ['signed with a different secret', { secret: 'another-secret-that-is-also-long-enough' }],
    ['for a different audience', { aud: 'univault-verifier-portal' }],
    ['with an unexpected algorithm (HS512)', { alg: 'HS512' }],
  ])('rejects a token %s with INVALID_TOKEN', async (_label, overrides) => {
    const row = await staffRow(STAFF.employerAdmin);
    const res = await request(t.app)
      .get('/api/v1/auth/me')
      .set(bearer(await craftToken({ sub: row.id, ...overrides })));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects a token whose payload was edited (e.g. role raised to admin)', async () => {
    const token = await t.tokenFor(STAFF.employerOfficer);
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p!, 'base64url').toString());
    const forged = `${h}.${Buffer.from(JSON.stringify({ ...payload, role: 'admin' })).toString('base64url')}.${s}`;
    expect((await request(t.app).get('/api/v1/staff').set(bearer(forged))).status).toBe(401);
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const none = `${enc({ alg: 'none' })}.${enc({ sub: UUID, issuer_id: 'employer-a', role: 'admin', iss: TOKEN_ISSUER, aud: TOKEN_AUDIENCE })}.`;
    expect((await request(t.app).get('/api/v1/auth/me').set(bearer(none))).status).toBe(401);
  });

  it('rejects a valid token for a staff member who does not exist', async () => {
    const res = await request(t.app)
      .get('/api/v1/auth/me')
      .set(bearer(await craftToken({ sub: UUID })));
    expect(res.status).toBe(401);
  });

  it('keeps public endpoints public (verifiers and wallets do not log in)', async () => {
    expect((await request(t.app).get('/api/v1/health')).status).toBe(200);
    expect((await request(t.app).get('/api/v1/issuers')).status).toBe(200);
    // No key generated in this test app yet → 404, but never 401
    expect((await request(t.app).get('/api/v1/issuers/employer-a/keys')).status).toBe(404);
    // Unknown credential → 404 CREDENTIAL_STATUS_NOT_FOUND, but never 401
    const status = await request(t.app).get(`/api/v1/status/${UUID}`);
    expect(status.status).toBe(404);
    expect(status.body.error.code).toBe('CREDENTIAL_STATUS_NOT_FOUND');
    expect((await request(t.app).post('/api/v1/credential-offers/token')).status).toBe(501);
  });
});

// ---------------------------------------------------------------------------
describe('AC4 – unauthorised users are rejected', () => {
  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const res = await t.login(STAFF.employerAdmin, 'not-the-password');
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });

  it('gives an unknown email exactly the same response (no account discovery)', async () => {
    const unknown = await t.login('nobody@serendib-trading.example', 'not-the-password');
    const wrong = await t.login(STAFF.employerAdmin, 'not-the-password');
    expect(unknown.status).toBe(wrong.status);
    expect(unknown.body.error.code).toBe(wrong.body.error.code);
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
  });

  it('rejects a disabled account with the same generic error, even with the right password', async () => {
    await t.database.db
      .update(issuerStaff)
      .set({ isActive: false })
      .where(eq(issuerStaff.email, STAFF.bankOfficer));
    const res = await t.login(STAFF.bankOfficer);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    await t.database.db
      .update(issuerStaff)
      .set({ isActive: true })
      .where(eq(issuerStaff.email, STAFF.bankOfficer));
  });

  it('immediately rejects an existing token once the account is disabled', async () => {
    const token = await t.tokenFor(STAFF.bankOfficer);
    await t.database.db
      .update(issuerStaff)
      .set({ isActive: false })
      .where(eq(issuerStaff.email, STAFF.bankOfficer));
    const res = await request(t.app).get('/api/v1/auth/me').set(bearer(token));
    expect(res.status).toBe(401);
    await t.database.db
      .update(issuerStaff)
      .set({ isActive: true })
      .where(eq(issuerStaff.email, STAFF.bankOfficer));
  });

  it('validates the login request', async () => {
    const res = await request(t.app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d: { path: string }) => d.path)).toEqual(
      expect.arrayContaining(['email', 'password']),
    );
  });

  it('locks the account after 5 failed attempts – even the right password is refused', async () => {
    const locked = await authedTestApp();
    for (let i = 0; i < 5; i += 1) {
      expect((await locked.login(STAFF.employerOfficer, `wrong-${i}`)).status).toBe(401);
    }
    const res = await locked.login(STAFF.employerOfficer);
    expect(res.status).toBe(423);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
    expect(new Date(res.body.error.details.lockedUntil).getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );

    // Once the lock period has passed, the correct password works again
    await locked.database.db
      .update(issuerStaff)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(issuerStaff.email, STAFF.employerOfficer));
    expect((await locked.login(STAFF.employerOfficer)).status).toBe(200);
    await locked.database.close();
  });

  it('rate-limits login attempts per IP address with 429', async () => {
    const limited = await authedTestApp({ LOGIN_RATE_LIMIT_MAX: '3' });
    for (let i = 0; i < 3; i += 1) await limited.login('someone@bank-a.example', 'x');
    const res = await limited.login(STAFF.bankAdmin);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.headers['ratelimit-policy'] ?? res.headers.ratelimit).toBeDefined();
    await limited.database.close();
  });
});

// ---------------------------------------------------------------------------
describe('AC5 – issuer role restrictions are enforced', () => {
  let officer: string;
  let admin: string;
  let bankAdmin: string;
  beforeAll(async () => {
    [officer, admin, bankAdmin] = await Promise.all([
      t.tokenFor(STAFF.employerOfficer),
      t.tokenFor(STAFF.employerAdmin),
      t.tokenFor(STAFF.bankAdmin),
    ]);
  });

  it('officers can issue and reissue credentials', async () => {
    const issue = await request(t.app)
      .post('/api/v1/credentials')
      .set(bearer(officer))
      .send({ holderId: UUID, credentialType: 'EmploymentCredential' });
    expect(issue.status).toBe(404); // allowed for officers: reached the holder lookup
    expect(issue.body.error.code).toBe('HOLDER_NOT_FOUND');
    const reissue = await request(t.app)
      .post(`/api/v1/credentials/${UUID}/reissue`)
      .set(bearer(officer))
      .send({ reason: 'details_changed' });
    expect(reissue.status).toBe(404); // allowed for officers: reached the credential lookup
    expect(reissue.body.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('officers cannot revoke credentials (403); admins can', async () => {
    const body = { reason: 'employment_ended' };
    const asOfficer = await request(t.app)
      .post(`/api/v1/credentials/${UUID}/revoke`)
      .set(bearer(officer))
      .send(body);
    expect(asOfficer.status).toBe(403);
    expect(asOfficer.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'This action requires the admin role',
    });
    expect(
      (
        await request(t.app)
          .post(`/api/v1/credentials/${UUID}/revoke`)
          .set(bearer(admin))
          .send(body)
      ).status,
    ).toBe(404); // allowed for admins: reached the credential lookup
  });

  it('only admins can list staff, and only their own issuer’s staff', async () => {
    expect((await request(t.app).get('/api/v1/staff').set(bearer(officer))).status).toBe(403);
    const res = await request(t.app).get('/api/v1/staff').set(bearer(bankAdmin));
    expect(res.status).toBe(200);
    expect(res.body.staff.map((s: { email: string }) => s.email)).toEqual([
      STAFF.bankAdmin,
      STAFF.bankOfficer,
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passwordHash/);
  });

  it('admins can manage keys for their own issuer only', async () => {
    // Own issuer: passes auth and reaches key generation (no passphrase in this test app → 503)
    const own = await request(t.app).post('/api/v1/issuers/employer-a/keys').set(bearer(admin));
    expect(own.body.error.code).toBe('KEY_PASSPHRASE_NOT_CONFIGURED');
    const other = await request(t.app).post('/api/v1/issuers/bank-a/keys').set(bearer(admin));
    expect(other.status).toBe(403);
    expect(other.body.error.message).toBe('You can only access your own organisation');
    expect(
      (await request(t.app).post('/api/v1/issuers/employer-a/keys').set(bearer(officer))).status,
    ).toBe(403);
  });

  it('applies a role change immediately, without logging in again', async () => {
    const token = await t.tokenFor(STAFF.bankAdmin);
    await t.database.db
      .update(issuerStaff)
      .set({ role: 'officer' })
      .where(eq(issuerStaff.email, STAFF.bankAdmin));
    expect((await request(t.app).get('/api/v1/staff').set(bearer(token))).status).toBe(403);
    await t.database.db
      .update(issuerStaff)
      .set({ role: 'admin' })
      .where(eq(issuerStaff.email, STAFF.bankAdmin));
  });

  it('ignores a token that claims a different issuer than the database record', async () => {
    const row = await staffRow(STAFF.employerAdmin);
    const lying = await craftToken({ sub: row.id, issuerId: 'bank-a' });
    expect((await request(t.app).get('/api/v1/auth/me').set(bearer(lying))).status).toBe(401);
  });
});

describe('seeded password is the one under test', () => {
  it('uses the shared test password', () => {
    expect(PASSWORD.length).toBeGreaterThanOrEqual(10);
  });
});
