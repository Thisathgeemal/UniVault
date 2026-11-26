/**
 * Development demo data for the issuer dashboard (npm run db:seed:demo [-- --reset]).
 *
 * For the seed issuer "Serendib Trading" (id employer-a) ONLY, creates credentials for existing
 * seed holders covering every status, through the REAL services – nothing is written around them:
 *
 *   active (4)                  create() + signCredential() with a throwaway wallet key
 *   expiring within 30 days (3) the same, created just under a year ago (default validity P1Y),
 *                               so the real expiry rule puts expires_at 6–23 days ahead
 *   superseded (1)              signed, then reissue(); the pending replacement is signed (active)
 *   expired (1)                 signed, then simulateExpiry() (the dev simulate-expiry mechanism)
 *   revoked after signing (1)   signed, then revoke()
 *   revoked while pending (1)   revoke() of a pending credential (in no "issued" count)
 *   pending (3)                 create() + createOffer() (an open QR offer each)
 *
 * Past steps run with an injected clock (as the tests do), so the history looks like weeks of
 * use. Offers are created at the real time, so they are open when the seeder finishes.
 *
 * Every action is performed by a dedicated, INACTIVE staff member (demo-data@<issuer domain>;
 * random password that is never printed, so it can never sign in). Demo rows are exactly the
 * credentials created by that account, which makes the seeder idempotent (skips when demo data
 * exists) and lets --reset remove only the demo rows. Refuses NODE_ENV=production.
 * (--reset has to lift the append-only guard on credential_status_events for the demo rows,
 * inside one transaction: see removeDemoData() and Decision 017.)
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import type { StaffProfile } from '../auth/auth-service.js';
import type { KeyStore } from '../keys/key-store.js';
import { hashPassword } from '../lib/passwords.js';
import { createCredentialOffersService } from '../services/credential-offers.service.js';
import type { CredentialSchemas } from '../services/credential-schemas.js';
import { effectiveStatus } from '../services/credential-status.js';
import { createCredentialsService } from '../services/credentials.service.js';
import type { Db } from './client.js';
import {
  credentialOffers,
  credentialRecords,
  credentialStatusEvents,
  holders,
  issuerKeys,
  issuers,
  issuerStaff,
} from './schema.js';

/** The seed issuer the demo data belongs to (backend/seed-data/issuers.json). */
export const DEMO_ISSUER_ID = 'employer-a';
const DEMO_ISSUER_NAME_PREFIX = 'Serendib Trading';
export const DEMO_STAFF_LOCAL_PART = 'demo-data';
export const DEMO_STAFF_NAME = 'Demo data (development)';
/** Holders needed: 4 active + 3 expiring + 1 superseded + 1 expired + 2 revoked + 3 pending. */
export const DEMO_HOLDERS_NEEDED = 14;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Counts of the demo rows by status (what the CLI prints; no ids, names or claims). */
export interface DemoCounts {
  active: number;
  expiringSoon: number;
  pending: number;
  openOffers: number;
  revokedAfterSigning: number;
  revokedWhilePending: number;
  superseded: number;
  expired: number;
}

/**
 * `counts` are always the demo rows' counts at `options.now()` (default: the real time),
 * also for 'skipped': the CLI prints them so a re-run shows what is there NOW. They change
 * with time on their own: open offers drop to 0 once they pass CREDENTIAL_OFFER_TTL_SECONDS,
 * and the "expiring" credentials become expired 6–23 days after the data was created.
 */
export interface DemoSeedResult {
  outcome: 'created' | 'skipped';
  counts: DemoCounts;
}

export interface DemoSeedOptions {
  keyStore: KeyStore;
  schemas: CredentialSchemas;
  publicBaseUrl: string;
  offerTtlSeconds: number;
  /** NODE_ENV: 'production' is refused. */
  nodeEnv: string;
  /**
   * The clock (default: the real time; tests inject one). Past steps are placed relative to
   * it, and the returned counts (created or skipped) are taken at it.
   */
  now?: () => Date;
}

function assertNotProduction(nodeEnv: string): void {
  if (nodeEnv === 'production') throw new Error('db:seed:demo is disabled in production');
}

async function findDemoIssuer(db: Db) {
  const [issuer] = await db.select().from(issuers).where(eq(issuers.id, DEMO_ISSUER_ID));
  if (!issuer || !issuer.name.startsWith(DEMO_ISSUER_NAME_PREFIX)) {
    throw new Error(
      `Seed issuer "${DEMO_ISSUER_NAME_PREFIX}" (${DEMO_ISSUER_ID}) not found: run npm run db:seed first`,
    );
  }
  return issuer;
}

const demoStaffEmail = (issuer: { id: string; emailDomain: string | null }) =>
  `${DEMO_STAFF_LOCAL_PART}@${issuer.emailDomain ?? `${issuer.id}.example`}`;

async function findDemoStaff(db: Db, email: string) {
  const [staff] = await db.select().from(issuerStaff).where(eq(issuerStaff.email, email));
  return staff ?? null;
}

const demoCredentialIds = async (db: Db, staffId: string) =>
  (
    await db
      .select({ id: credentialRecords.id })
      .from(credentialRecords)
      .where(eq(credentialRecords.createdByStaffId, staffId))
  ).map((r) => r.id);

/** Counts the demo rows by status at `at`. */
async function countDemoRows(db: Db, staffId: string, at: Date): Promise<DemoCounts> {
  const counts: DemoCounts = {
    active: 0,
    expiringSoon: 0,
    pending: 0,
    openOffers: 0,
    revokedAfterSigning: 0,
    revokedWhilePending: 0,
    superseded: 0,
    expired: 0,
  };
  const rows = await db
    .select()
    .from(credentialRecords)
    .where(eq(credentialRecords.createdByStaffId, staffId));
  for (const row of rows) {
    const status = effectiveStatus(row, at);
    if (status === 'valid') {
      counts.active += 1;
      if (row.expiresAt.getTime() < at.getTime() + 30 * DAY) counts.expiringSoon += 1;
    } else if (status === 'revoked') {
      if (row.issuedAt) counts.revokedAfterSigning += 1;
      else counts.revokedWhilePending += 1;
    } else {
      counts[status] += 1;
    }
  }
  if (rows.length > 0) {
    const offers = await db
      .select()
      .from(credentialOffers)
      .where(
        inArray(
          credentialOffers.credentialId,
          rows.map((r) => r.id),
        ),
      );
    counts.openOffers = offers.filter(
      (o) => !o.redeemedAt && !o.invalidatedAt && o.expiresAt > at,
    ).length;
  }
  return counts;
}

/** The CLI's table: one row per status, counts only (no ids, names, claims or keys). */
export function demoCountsTable(counts: DemoCounts): { status: string; credentials: number }[] {
  return [
    { status: 'active', credentials: counts.active },
    { status: '  of which expiring within 30 days', credentials: counts.expiringSoon },
    { status: 'awaiting wallet (pending)', credentials: counts.pending },
    { status: '  open offers', credentials: counts.openOffers },
    { status: 'revoked after signing', credentials: counts.revokedAfterSigning },
    { status: 'revoked while pending', credentials: counts.revokedWhilePending },
    { status: 'superseded', credentials: counts.superseded },
    { status: 'expired', credentials: counts.expired },
  ];
}

/**
 * Creates the demo data, or skips (outcome 'skipped') when demo data already exists.
 * Needs: npm run db:seed (issuer, holders) and npm run keys:init (an active signing key).
 */
export async function seedDemoData(db: Db, options: DemoSeedOptions): Promise<DemoSeedResult> {
  assertNotProduction(options.nodeEnv);
  const realNow = options.now ?? (() => new Date()); // the one clock for every step and count
  const issuer = await findDemoIssuer(db);
  const email = demoStaffEmail(issuer);

  const existing = await findDemoStaff(db, email);
  if (existing && (await demoCredentialIds(db, existing.id)).length > 0) {
    return { outcome: 'skipped', counts: await countDemoRows(db, existing.id, realNow()) };
  }

  const [key] = await db
    .select({ kid: issuerKeys.kid })
    .from(issuerKeys)
    .where(and(eq(issuerKeys.issuerId, issuer.id), eq(issuerKeys.status, 'active')));
  if (!key) throw new Error(`${issuer.id} has no active signing key: run npm run keys:init first`);

  // Seed holders of this issuer that have no pending or valid credential yet
  const busy = db
    .select({ id: credentialRecords.holderId })
    .from(credentialRecords)
    .where(
      and(
        eq(credentialRecords.issuerId, issuer.id),
        inArray(credentialRecords.status, ['pending', 'valid']),
      ),
    );
  const free = await db
    .select({ id: holders.id })
    .from(holders)
    .where(and(eq(holders.issuerId, issuer.id), notInArray(holders.id, busy)))
    .orderBy(holders.externalRef)
    .limit(DEMO_HOLDERS_NEEDED);
  if (free.length < DEMO_HOLDERS_NEEDED) {
    throw new Error(
      `Not enough free holders for ${issuer.id}: ${DEMO_HOLDERS_NEEDED} needed, ${free.length} found (run npm run db:seed, or --reset)`,
    );
  }

  const staffRow =
    existing ??
    (
      await db
        .insert(issuerStaff)
        .values({
          issuerId: issuer.id,
          email,
          displayName: DEMO_STAFF_NAME,
          role: 'admin',
          isActive: false, // can never sign in; the random password is not kept anywhere
          passwordHash: await hashPassword(randomBytes(32).toString('base64url')),
        })
        .returning()
    )[0]!;
  const staff: StaffProfile = {
    id: staffRow.id,
    email: staffRow.email,
    displayName: staffRow.displayName,
    role: 'admin',
    issuer: { id: issuer.id, name: issuer.name, type: issuer.issuerType },
  };

  // One clock for the services: each step sets it, offers use the real time
  const start = realNow();
  let current = start;
  const at = (offsetMs: number) => {
    current = new Date(start.getTime() + offsetMs);
  };
  const clock = () => current;
  const credentials = createCredentialsService(db, options.schemas, {
    keyStore: options.keyStore,
    publicBaseUrl: options.publicBaseUrl,
    now: clock,
  });
  const offers = createCredentialOffersService(db, {
    ttlSeconds: options.offerTtlSeconds,
    publicBaseUrl: options.publicBaseUrl,
    now: clock,
  });
  /** Throwaway wallet key: only its public half is ever used, then it is discarded. */
  const walletKey = () =>
    generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'jwk' });
  const holderIds = free.map((h) => h.id);
  let next = 0;
  const holder = () => holderIds[next++]!;

  const create = async (offsetMs: number) => {
    at(offsetMs);
    return (await credentials.create(staff, { holderId: holder() })).id;
  };
  const sign = async (id: string, offsetMs: number) => {
    at(offsetMs);
    await credentials.signCredential(id, walletKey());
  };
  /** Created and signed (an hour apart) at a time in the past. */
  const signed = async (offsetMs: number) => {
    const id = await create(offsetMs);
    await sign(id, offsetMs + HOUR);
    return id;
  };
  /** The past instant one year before `fromNow` (default validity P1Y ends at `fromNow`). */
  const oneYearBefore = (fromNowMs: number) => {
    const d = new Date(start.getTime() + fromNowMs);
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    return d.getTime() - start.getTime();
  };

  // Active
  for (const daysAgo of [60, 45, 30, 12]) await signed(-daysAgo * DAY);
  // Expiring within 30 days: issued just under a year ago (the signing hour is inside the margin)
  for (const daysLeft of [6, 14, 23]) await signed(oneYearBefore(daysLeft * DAY));
  // Superseded by a reissue; the replacement is signed into the wallet (active)
  const toReplace = await signed(-200 * DAY);
  at(-3 * DAY);
  const reissued = await credentials.reissue(staff, toReplace, { reason: 'details_changed' });
  await sign(reissued.credential.id, -3 * DAY + 2 * HOUR);
  // Expired through the dev simulate-expiry mechanism
  const toExpire = await signed(-120 * DAY);
  at(-2 * DAY);
  await credentials.simulateExpiry(staff, toExpire);
  // Revoked after signing
  const toRevoke = await signed(-90 * DAY);
  at(-1 * DAY);
  await credentials.revoke(staff, toRevoke, { reason: 'employment_ended' });
  // Revoked while pending (never signed)
  const neverSigned = await create(-5 * DAY);
  at(-4 * DAY);
  await credentials.revoke(staff, neverSigned, { reason: 'issued_in_error' });
  // Pending, each with an open offer created at the real time
  const pending = [];
  for (const minutesAgo of [120, 60, 30]) pending.push(await create(-minutesAgo * MINUTE));
  at(0);
  for (const id of pending) await offers.createOffer(staff, id);

  return { outcome: 'created', counts: await countDemoRows(db, staff.id, realNow()) };
}

/** Removes ONLY the demo rows (credentials created by the demo account, their offers and history). */
export async function removeDemoData(db: Db, nodeEnv: string): Promise<{ credentials: number }> {
  assertNotProduction(nodeEnv);
  const issuer = await findDemoIssuer(db);
  const staff = await findDemoStaff(db, demoStaffEmail(issuer));
  if (!staff) return { credentials: 0 };
  return db.transaction(async (tx) => {
    const ids = (
      await tx
        .select({ id: credentialRecords.id })
        .from(credentialRecords)
        .where(eq(credentialRecords.createdByStaffId, staff.id))
    ).map((r) => r.id);
    if (ids.length > 0) {
      await tx.delete(credentialOffers).where(inArray(credentialOffers.credentialId, ids));
      // credential_status_events is append-only (trigger from migration 0005). The development
      // reset lifts that guard for THIS transaction only and only for the demo credentials'
      // rows: DDL is transactional, so the trigger is back on at commit, and on any failure
      // the rollback restores it too. Never available in production (assertNotProduction).
      await tx.execute(
        sql`ALTER TABLE credential_status_events DISABLE TRIGGER credential_status_events_no_change`,
      );
      await tx
        .delete(credentialStatusEvents)
        .where(inArray(credentialStatusEvents.credentialId, ids));
      await tx.execute(
        sql`ALTER TABLE credential_status_events ENABLE TRIGGER credential_status_events_no_change`,
      );
      // One statement: replaces_credential_id references between demo rows are checked at its end
      await tx.delete(credentialRecords).where(inArray(credentialRecords.id, ids));
    }
    await tx.delete(issuerStaff).where(eq(issuerStaff.id, staff.id));
    return { credentials: ids.length };
  });
}
