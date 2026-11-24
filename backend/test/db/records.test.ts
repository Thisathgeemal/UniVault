/**
 * Storing and retrieving records in every table, the relationships between
 * them, and the integrity rules the database enforces.
 */
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Database } from '../../src/db/client.js';
import {
  credentialOffers,
  credentialRecords,
  credentialStatusEvents,
  holders,
  issuerKeys,
  issuerStaff,
  issuers,
} from '../../src/db/schema.js';
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js';
import { dbError, freshDatabase, insertIssuersAndKey, KID_A, KID_B } from './helpers.js';

const DAY = 24 * 3600 * 1000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);
const codeHash = () => createHash('sha256').update(randomBytes(32)).digest('base64url');
const employmentClaims = {
  employee_id: 'STC-00001',
  full_name: 'Lahiru Silva',
  designation: 'Logistics Coordinator',
  department: 'Operations',
  employment_type: 'contract',
  date_of_joining: '2019-07-03',
};

let database: Database;
let holderId: string;
let staffId: string;

beforeAll(async () => {
  database = await freshDatabase();
  await insertIssuersAndKey(database);
  const [holder] = await database.db
    .insert(holders)
    .values({
      issuerId: 'employer-a',
      recordType: 'employee',
      externalRef: 'STC-00001',
      fullName: 'Lahiru Silva',
      claims: employmentClaims,
    })
    .returning();
  holderId = holder!.id;
  const [staff] = await database.db
    .insert(issuerStaff)
    .values({
      issuerId: 'employer-a',
      email: 'Admin@Serendib-Trading.example',
      displayName: 'Admin',
      passwordHash: await hashPassword('correct horse battery'),
      role: 'admin',
    })
    .returning();
  staffId = staff!.id;
});
afterAll(() => database.close());

/** A credential that has been signed and delivered (status 'valid'). */
const validCredential = (overrides: Partial<typeof credentialRecords.$inferInsert> = {}) => ({
  issuerId: 'employer-a',
  holderId,
  credentialType: 'EmploymentCredential' as const,
  vct: 'urn:univault:vct:EmploymentCredential:1',
  status: 'valid' as const,
  claimsSnapshot: employmentClaims,
  issuerKid: KID_A,
  holderKeyThumbprint: 'wallet-key-thumbprint-001',
  issuedAt: new Date(),
  expiresAt: inDays(365),
  ...overrides,
});

describe('issuers and issuer keys', () => {
  it('stores and retrieves an issuer with its name and type', async () => {
    const [bank] = await database.db.select().from(issuers).where(eq(issuers.id, 'bank-a'));
    expect(bank).toMatchObject({ name: 'UniVault Demo Bank', issuerType: 'bank' });
    expect(bank?.createdAt).toBeInstanceOf(Date);
  });

  it('stores the public key and key ID, linked to the issuer', async () => {
    const issuer = await database.db.query.issuers.findFirst({
      where: eq(issuers.id, 'employer-a'),
      with: { keys: true },
    });
    expect(issuer?.keys).toHaveLength(1);
    expect(issuer?.keys[0]).toMatchObject({ kid: KID_A, alg: 'RS256', status: 'active' });
    expect(issuer?.keys[0]?.publicJwk).toMatchObject({ kty: 'RSA', kid: KID_A });
  });

  it('rejects an invalid issuer ID or type', async () => {
    expect(
      await dbError(
        database.db.insert(issuers).values({ id: 'Bad ID!', name: 'X Corp', issuerType: 'bank' }),
      ),
    ).toMatch(/check constraint/);
    expect(
      await dbError(
        database.db
          .insert(issuers)
          .values({ id: 'gov-a', name: 'Gov', issuerType: 'government' as 'bank' }),
      ),
    ).toMatch(/invalid input value for enum/);
  });

  it('allows only one active key per issuer', async () => {
    const second = database.db.insert(issuerKeys).values({
      kid: KID_B,
      issuerId: 'employer-a',
      publicJwk: { kty: 'RSA', kid: KID_B },
    });
    expect(await dbError(second)).toMatch(/issuer_keys_one_active_per_issuer/);
  });

  it('requires retired keys to record when they were retired', async () => {
    const bad = database.db.insert(issuerKeys).values({
      kid: KID_B,
      issuerId: 'bank-a',
      publicJwk: { kty: 'RSA', kid: KID_B },
      status: 'retired',
    });
    expect(await dbError(bad)).toMatch(/check constraint/);
  });

  it('rejects a public key whose JWK kid does not match the row', async () => {
    const bad = database.db.insert(issuerKeys).values({
      kid: KID_B,
      issuerId: 'bank-a',
      publicJwk: { kty: 'RSA', kid: 'something-else' },
    });
    expect(await dbError(bad)).toMatch(/check constraint/);
  });

  it('rejects a key for an issuer that does not exist', async () => {
    const bad = database.db
      .insert(issuerKeys)
      .values({ kid: KID_B, issuerId: 'nobody', publicJwk: { kty: 'RSA', kid: KID_B } });
    expect(await dbError(bad)).toMatch(/foreign key/);
  });
});

describe('issuer staff', () => {
  it('stores staff linked to their issuer, with a verifiable password hash', async () => {
    const staff = await database.db.query.issuerStaff.findFirst({
      where: eq(issuerStaff.id, staffId),
      with: { issuer: true },
    });
    expect(staff?.issuer.name).toBe('Serendib Trading Company (Demo)');
    expect(staff?.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('correct horse battery', staff!.passwordHash)).toBe(true);
    expect(await verifyPassword('wrong password', staff!.passwordHash)).toBe(false);
  });

  it('treats email addresses as unique regardless of case', async () => {
    const duplicate = database.db.insert(issuerStaff).values({
      issuerId: 'bank-a',
      email: 'admin@serendib-trading.EXAMPLE',
      displayName: 'Copy',
      passwordHash: 'scrypt$x',
    });
    expect(await dbError(duplicate)).toMatch(/issuer_staff_email_unique/);
  });

  it('refuses a plain-text password', async () => {
    const bad = database.db.insert(issuerStaff).values({
      issuerId: 'bank-a',
      email: 'x@bank-a.example',
      displayName: 'X',
      passwordHash: 'password123',
    });
    expect(await dbError(bad)).toMatch(/check constraint/);
  });
});

describe('holders', () => {
  it('stores and retrieves claims exactly, including Sinhala text and nested objects', async () => {
    const claims = {
      full_name: 'ලහිරු සිල්වා',
      age_over_18: true,
      permanent_address: {
        line1: 'No. 12, Temple Road',
        city: 'Kandy',
        district: 'Kandy',
        postal_code: '20000',
        country: 'LK',
      },
    };
    const [inserted] = await database.db
      .insert(holders)
      .values({
        issuerId: 'bank-a',
        recordType: 'customer',
        externalRef: 'KYC-REC-0001',
        fullName: 'ලහිරු සිල්වා',
        claims,
      })
      .returning();
    const [read] = await database.db.select().from(holders).where(eq(holders.id, inserted!.id));
    expect(read?.claims).toEqual(claims);
  });

  it('rejects a duplicate external reference within the same issuer only', async () => {
    const dup = database.db.insert(holders).values({
      issuerId: 'employer-a',
      recordType: 'employee',
      externalRef: 'STC-00001',
      fullName: 'Copy',
      claims: {},
    });
    expect(await dbError(dup)).toMatch(/duplicate key/);
    // The same reference at a different issuer is a different person record
    await database.db.insert(holders).values({
      issuerId: 'bank-a',
      recordType: 'customer',
      externalRef: 'STC-00001',
      fullName: 'Other',
      claims: {},
    });
  });

  it('keeps updated_at current on every change', async () => {
    const [before] = await database.db.select().from(holders).where(eq(holders.id, holderId));
    await new Promise((r) => setTimeout(r, 20));
    await database.db
      .update(holders)
      .set({ fullName: 'Lahiru Silva' })
      .where(eq(holders.id, holderId));
    const [after] = await database.db.select().from(holders).where(eq(holders.id, holderId));
    expect(after!.updatedAt.getTime()).toBeGreaterThan(before!.updatedAt.getTime());
  });

  it('cannot delete an issuer that still has holders', async () => {
    expect(await dbError(database.db.delete(issuers).where(eq(issuers.id, 'employer-a')))).toMatch(
      /foreign key/,
    );
  });
});

describe('credential records', () => {
  it('stores a pending credential (offered, not yet signed) with ID, type and expiry', async () => {
    const [pending] = await database.db
      .insert(credentialRecords)
      .values({
        issuerId: 'employer-a',
        holderId,
        credentialType: 'EmploymentCredential',
        vct: 'urn:univault:vct:EmploymentCredential:1',
        claimsSnapshot: employmentClaims,
        expiresAt: inDays(365),
        createdByStaffId: staffId,
      })
      .returning();
    expect(pending?.id).toMatch(/^[0-9a-f-]{36}$/); // becomes the credential's jti
    expect(pending).toMatchObject({ status: 'pending', issuedAt: null, issuerKid: null });
  });

  it('stores a valid credential with issue date, expiry, signing key and holder key', async () => {
    const [valid] = await database.db
      .insert(credentialRecords)
      .values(validCredential())
      .returning();
    const read = await database.db.query.credentialRecords.findFirst({
      where: eq(credentialRecords.id, valid!.id),
      with: { holder: true, issuer: true, signingKey: true },
    });
    expect(read).toMatchObject({ status: 'valid', credentialType: 'EmploymentCredential' });
    expect(read?.issuedAt).toBeInstanceOf(Date);
    expect(read!.expiresAt.getTime()).toBeGreaterThan(read!.issuedAt!.getTime());
    expect(read?.holder.fullName).toBe('Lahiru Silva');
    expect(read?.issuer.issuerType).toBe('employer');
    expect(read?.signingKey?.kid).toBe(KID_A);
  });

  it('refuses a valid credential without issue date, signing key or holder key', async () => {
    for (const missing of [
      { issuedAt: null },
      { issuerKid: null },
      { holderKeyThumbprint: null },
    ]) {
      expect(
        await dbError(database.db.insert(credentialRecords).values(validCredential(missing))),
      ).toMatch(/check constraint/);
    }
  });

  it('refuses an expiry date before the issue date', async () => {
    const bad = validCredential({ issuedAt: new Date(), expiresAt: inDays(-1) });
    expect(await dbError(database.db.insert(credentialRecords).values(bad))).toMatch(
      /check constraint/,
    );
  });

  it('records revocation with a time and reason, and refuses revocation without a time', async () => {
    const [cred] = await database.db
      .insert(credentialRecords)
      .values(
        validCredential({
          status: 'revoked',
          revokedAt: new Date(),
          revocationReason: 'employment_ended',
        }),
      )
      .returning();
    expect(cred).toMatchObject({ status: 'revoked', revocationReason: 'employment_ended' });
    const bad = validCredential({ status: 'revoked' });
    expect(await dbError(database.db.insert(credentialRecords).values(bad))).toMatch(
      /check constraint/,
    );
  });

  it('links a reissued credential to the one it replaces (superseded → valid)', async () => {
    const [original] = await database.db
      .insert(credentialRecords)
      .values(validCredential())
      .returning();
    // Revoke-then-reissue: the original becomes superseded, the new one points back to it
    await database.db
      .update(credentialRecords)
      .set({
        status: 'superseded',
        supersededAt: new Date(),
        supersededByStaffId: staffId,
        statusUpdatedAt: new Date(),
      })
      .where(eq(credentialRecords.id, original!.id));
    const [replacement] = await database.db
      .insert(credentialRecords)
      .values(
        validCredential({
          claimsSnapshot: { ...employmentClaims, designation: 'Branch Supervisor' },
          replacesCredentialId: original!.id,
        }),
      )
      .returning();

    const oldWithSuccessor = await database.db.query.credentialRecords.findFirst({
      where: eq(credentialRecords.id, original!.id),
      with: { replacedBy: true },
    });
    expect(oldWithSuccessor?.status).toBe('superseded');
    expect(oldWithSuccessor?.replacedBy.map((c) => c.id)).toEqual([replacement!.id]);

    const newWithPredecessor = await database.db.query.credentialRecords.findFirst({
      where: eq(credentialRecords.id, replacement!.id),
      with: { replaces: true },
    });
    expect(newWithPredecessor?.replaces?.claimsSnapshot.designation).toBe('Logistics Coordinator');
    expect(newWithPredecessor?.claimsSnapshot.designation).toBe('Branch Supervisor');

    // A credential can be replaced only once
    const second = validCredential({ replacesCredentialId: original!.id });
    expect(await dbError(database.db.insert(credentialRecords).values(second))).toMatch(
      /duplicate key/,
    );
  });

  it('refuses a credential that replaces itself', async () => {
    const id = crypto.randomUUID();
    const bad = database.db
      .insert(credentialRecords)
      .values({ ...validCredential(), id, replacesCredentialId: id });
    expect(await dbError(bad)).toMatch(/check constraint|foreign key/);
  });

  it('lists a holder’s credentials by status', async () => {
    const valid = await database.db
      .select({ id: credentialRecords.id })
      .from(credentialRecords)
      .where(and(eq(credentialRecords.holderId, holderId), eq(credentialRecords.status, 'valid')));
    expect(valid.length).toBeGreaterThanOrEqual(2);
  });

  it('cannot delete a holder who has credentials', async () => {
    expect(await dbError(database.db.delete(holders).where(eq(holders.id, holderId)))).toMatch(
      /foreign key/,
    );
  });
});

describe('credential offers', () => {
  let credentialId: string;
  beforeAll(async () => {
    const [pending] = await database.db
      .insert(credentialRecords)
      .values({
        issuerId: 'employer-a',
        holderId,
        credentialType: 'EmploymentCredential',
        vct: 'urn:univault:vct:EmploymentCredential:1',
        claimsSnapshot: employmentClaims,
        expiresAt: inDays(365),
      })
      .returning();
    credentialId = pending!.id;
  });

  it('stores an offer with expiry, then records its redemption', async () => {
    const [offer] = await database.db
      .insert(credentialOffers)
      .values({
        credentialId,
        preAuthorizedCodeHash: codeHash(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdByStaffId: staffId,
      })
      .returning();
    expect(offer).toMatchObject({ redeemedAt: null, failedAttempts: 0 });

    await database.db
      .update(credentialOffers)
      .set({ redeemedAt: new Date(), redeemedWalletThumbprint: 'wallet-key-thumbprint-001' })
      .where(eq(credentialOffers.id, offer!.id));
    const read = await database.db.query.credentialOffers.findFirst({
      where: eq(credentialOffers.id, offer!.id),
      with: { credential: true },
    });
    expect(read?.redeemedAt).toBeInstanceOf(Date);
    expect(read?.credential.id).toBe(credentialId);
  });

  it('stores only a hash of the pre-authorised code, and each hash once', async () => {
    const hash = codeHash();
    await database.db
      .insert(credentialOffers)
      .values({ credentialId, preAuthorizedCodeHash: hash, expiresAt: inDays(1) });
    const dup = database.db
      .insert(credentialOffers)
      .values({ credentialId, preAuthorizedCodeHash: hash, expiresAt: inDays(1) });
    expect(await dbError(dup)).toMatch(/duplicate key/);
    const plain = database.db
      .insert(credentialOffers)
      .values({ credentialId, preAuthorizedCodeHash: 'ABC123', expiresAt: inDays(1) });
    expect(await dbError(plain)).toMatch(/check constraint/);
  });

  it('refuses an offer that has already expired when created', async () => {
    const bad = database.db
      .insert(credentialOffers)
      .values({ credentialId, preAuthorizedCodeHash: codeHash(), expiresAt: inDays(-1) });
    expect(await dbError(bad)).toMatch(/check constraint/);
  });

  it('requires redemption time and wallet key together', async () => {
    const bad = database.db.insert(credentialOffers).values({
      credentialId,
      preAuthorizedCodeHash: codeHash(),
      expiresAt: inDays(1),
      redeemedAt: new Date(),
    });
    expect(await dbError(bad)).toMatch(/check constraint/);
  });
});

describe('revocation, supersede and status history (migration 0005)', () => {
  const insert = (overrides: Partial<typeof credentialRecords.$inferInsert>) =>
    database.db.insert(credentialRecords).values(validCredential(overrides));
  const pending = (overrides: Partial<typeof credentialRecords.$inferInsert> = {}) =>
    insert({
      status: 'pending',
      issuerKid: null,
      holderKeyThumbprint: null,
      issuedAt: null,
      ...overrides,
    });

  it('stores a revoked credential with time, reason and staff member', async () => {
    const [row] = await insert({
      status: 'revoked',
      revokedAt: new Date(),
      revocationReason: 'employment_ended',
      revokedByStaffId: staffId,
    }).returning();
    expect(row).toMatchObject({ status: 'revoked', revokedByStaffId: staffId });
  });

  it('stores a credential revoked while pending, which was never signed', async () => {
    const [row] = await pending({
      status: 'revoked',
      revokedAt: new Date(),
      revocationReason: 'issued_in_error',
    }).returning();
    expect(row).toMatchObject({ status: 'revoked', issuedAt: null, issuerKid: null });
  });

  it.each([
    ['revoked without a reason', { status: 'revoked', revokedAt: new Date() }],
    ['revoked without a time', { status: 'revoked', revocationReason: 'other' }],
    ['valid with a revocation time', { revokedAt: new Date() }],
    ['valid with a revocation reason', { revocationReason: 'other' }],
    ['valid with a revoking staff member', { revokedByStaffId: 'STAFF' }],
    [
      'revoked that is also marked superseded',
      {
        status: 'revoked',
        revokedAt: new Date(),
        revocationReason: 'other',
        supersededAt: new Date(),
      },
    ],
    ['superseded without a supersede time', { status: 'superseded' }],
    [
      'superseded with a revocation time (the old 0001 rule)',
      { status: 'superseded', supersededAt: new Date(), revokedAt: new Date() },
    ],
    ['valid with a supersede time', { supersededAt: new Date() }],
    ['valid with a superseding staff member', { supersededByStaffId: 'STAFF' }],
    ['pending with signing data', { status: 'pending' }],
    ['valid with only part of the signing data', { holderKeyThumbprint: null }],
    [
      'superseded without signing data',
      {
        status: 'superseded',
        supersededAt: new Date(),
        issuedAt: null,
        issuerKid: null,
        holderKeyThumbprint: null,
      },
    ],
  ] as const)('refuses a credential %s', async (_label, overrides) => {
    const values = Object.fromEntries(
      Object.entries(overrides).map(([k, v]) => [k, v === 'STAFF' ? staffId : v]),
    ) as Partial<typeof credentialRecords.$inferInsert>;
    expect(await dbError(insert(values))).toMatch(/check constraint/);
  });

  it('refuses a second replacement of the same credential (UNIQUE replaces_credential_id)', async () => {
    const [original] = await insert({ status: 'superseded', supersededAt: new Date() }).returning();
    await pending({ replacesCredentialId: original!.id });
    expect(await dbError(pending({ replacesCredentialId: original!.id }))).toMatch(
      /duplicate key|unique/,
    );
  });

  describe('credential_status_events', () => {
    let credentialId: string;
    beforeAll(async () => {
      const [row] = await pending().returning();
      credentialId = row!.id;
    });
    const event = (overrides: Partial<typeof credentialStatusEvents.$inferInsert> = {}) => ({
      credentialId,
      issuerId: 'employer-a',
      fromStatus: 'pending' as const,
      toStatus: 'revoked' as const,
      reason: 'issued_in_error',
      staffId,
      ...overrides,
    });

    it('stores creation (null -> pending) and later changes', async () => {
      await database.db
        .insert(credentialStatusEvents)
        .values([event({ fromStatus: null, toStatus: 'pending', reason: null }), event()]);
      const rows = await database.db
        .select()
        .from(credentialStatusEvents)
        .where(eq(credentialStatusEvents.credentialId, credentialId));
      expect(rows.map((r) => [r.fromStatus, r.toStatus])).toEqual([
        [null, 'pending'],
        ['pending', 'revoked'],
      ]);
    });

    it('is append-only: rows cannot be updated or deleted', async () => {
      const update = database.db
        .update(credentialStatusEvents)
        .set({ reason: 'changed' })
        .where(eq(credentialStatusEvents.credentialId, credentialId));
      expect(await dbError(update)).toMatch(/append-only/);
      const remove = database.db
        .delete(credentialStatusEvents)
        .where(eq(credentialStatusEvents.credentialId, credentialId));
      expect(await dbError(remove)).toMatch(/append-only/);
    });

    it('refuses an event whose issuer is not the issuer of the credential', async () => {
      const bad = database.db.insert(credentialStatusEvents).values(event({ issuerId: 'bank-a' }));
      expect(await dbError(bad)).toMatch(/foreign key/);
    });

    it.each([
      ['a change to the same status', { fromStatus: 'valid', toStatus: 'valid' }],
      ['a missing from_status for anything but creation', { fromStatus: null, toStatus: 'valid' }],
      ['a from_status on creation', { fromStatus: 'valid', toStatus: 'pending' }],
      ['a note longer than 500 characters', { note: 'x'.repeat(501) }],
    ] as const)('refuses %s', async (_label, overrides) => {
      const bad = database.db.insert(credentialStatusEvents).values(event(overrides));
      expect(await dbError(bad)).toMatch(/check constraint/);
    });

    it('keeps the audit trail: a staff member with events cannot be deleted', async () => {
      const remove = database.db.delete(issuerStaff).where(eq(issuerStaff.id, staffId));
      expect(await dbError(remove)).toMatch(/foreign key/);
    });
  });
});
