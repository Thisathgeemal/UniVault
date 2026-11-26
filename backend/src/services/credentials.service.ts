/**
 * Credential issuance (FR-ISS-01, FR-ISS-02), revocation and reissue (FR-ISS-03).
 *
 * Issuance happens in two steps, because a credential must be bound to the
 * holder's wallet key (`cnf`), which is only known when the wallet redeems the
 * QR offer (Sprint 2):
 *
 *   1. create()          – issuer staff create a PENDING credential record from a
 *                          holder record. Claims are re-validated and snapshotted,
 *                          expiry is fixed. Nothing is signed.
 *   2. signCredential()  – called by the redemption endpoint with the wallet's
 *                          public key. Signs the SD-JWT with the issuer's ACTIVE
 *                          key and marks the record 'valid'. The compact SD-JWT
 *                          is returned to the caller only: never stored, never logged.
 *
 * A credential is never signed without a holder public key, and never twice.
 *
 * Afterwards (Decision 012):
 *   revoke()   – an admin withdraws a pending or valid credential; its open offers are
 *                invalidated in the same transaction.
 *   reissue()  – a valid credential is superseded at once by a new PENDING credential built
 *                from the holder's CURRENT record, through the same code as create().
 * Every status change is written to credential_status_events (append-only) in the same
 * transaction as the change itself; events() returns that history.
 *
 * Metadata carries `effectiveStatus` next to the stored `status`: 'expired' is computed by
 * effectiveStatus() in credential-status.ts (shared with the public status endpoint), never
 * stored. Expiry instants are whole seconds, so the SD-JWT `exp` equals expires_at exactly.
 */
import { createPublicKey } from 'node:crypto';
import { computeEcJwkThumbprint, createSdJwt } from '@univault/crypto-core/node';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { z } from 'zod';
import type { StaffProfile } from '../auth/auth-service.js';
import type { Db } from '../db/client.js';
import {
  credentialOffers,
  credentialRecords,
  credentialStatusEvents,
  holders,
  issuerKeys,
  issuers,
  issuerStaff,
  type Holder,
  type NewCredentialStatusEvent,
} from '../db/schema.js';
import type { KeyStore } from '../keys/key-store.js';
import { AppError } from '../lib/errors.js';
import type {
  CredentialSchemas,
  CredentialTypeName,
  SchemaDescription,
} from './credential-schemas.js';

/** HOLDER_DATA_INVALID details: path + English message (no code; unchanged API). */
interface HolderDataIssue {
  path: string;
  message: string;
}
import {
  effectiveStatus,
  effectiveStatusCondition,
  type CredentialStatus,
  type EffectiveStatus,
} from './credential-status.js';
import { ageOn, holderNotFound, ISSUER_RECORD_TYPES } from './holders.service.js';

export type { CredentialStatus, EffectiveStatus } from './credential-status.js';

/** Why an admin revoked a credential (stored in revocation_reason and the status history). */
export const REVOCATION_REASONS = [
  'details_changed',
  'employment_ended',
  'relationship_ended',
  'wallet_lost_or_compromised',
  'issued_in_error',
  'other',
] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];

/** Why a credential was reissued (stored in the status history of the superseded credential). */
export const REISSUE_REASONS = [
  'details_changed',
  'wallet_lost_or_compromised',
  'validity_extension',
  'other',
] as const;
export type ReissueReason = (typeof REISSUE_REASONS)[number];

/**
 * DEVELOPMENT ONLY: reason of the status event written by simulateExpiry() (TEMPORARY, remove
 * in Sprint 2 with the dev routes; migration 0007 allows it in the database).
 */
export const DEV_EVENT_REASONS = ['dev_simulated_expiry'] as const;

export interface StaffRef {
  id: string;
  displayName: string;
}

/** Credential metadata shown in the issuer portal. No claims, signature or key material. */
export interface CredentialMetadata {
  id: string;
  issuerId: string;
  holder: { id: string; externalRef: string; fullName: string };
  credentialType: CredentialTypeName;
  vct: string;
  schemaVersion: string;
  /** Stored status (the database value; never 'expired'). */
  status: CredentialStatus;
  /** Status at the time of the request: the stored status, or 'expired' (credential-status.ts). */
  effectiveStatus: EffectiveStatus;
  /** Public key ID the credential was signed with (null while pending). */
  issuerKid: string | null;
  issuedAt: string | null;
  expiresAt: string;
  statusUpdatedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  revokedBy: StaffRef | null;
  supersededAt: string | null;
  supersededBy: StaffRef | null;
  /** The credential this one was reissued from. */
  replacesCredentialId: string | null;
  /** The credential that replaced this one (set once it is superseded). */
  replacedByCredentialId: string | null;
  createdBy: StaffRef | null;
  createdAt: string;
}

/**
 * GET /credentials/:id: the metadata plus the credential's ACTIVE offer, if any (id and expiry
 * only, never the code). The portal uses it to say "this QR code can't be shown again" instead
 * of silently replacing an offer that is still usable (Decision 021).
 */
export interface CredentialDetail extends CredentialMetadata {
  activeOffer: { offerId: string; expiresAt: string } | null;
}

export interface CreateCredentialInput {
  holderId: string;
  credentialType?: CredentialTypeName | undefined;
  /** Optional earlier end (YYYY-MM-DD, 00:00 UTC): after today, no later than the capped expiry. */
  validUntil?: string | undefined;
}

/** Why the expiry is earlier than the schema's default validity. */
export type ExpiryCap = 'id_document_expiry' | '18th_birthday' | 'validUntil';

/**
 * What a credential would be if issued now (POST /credentials/preview). Computed by the SAME
 * code as POST /credentials, without writing anything (docs/api/credentials-api.md §7).
 */
export interface CredentialPreview {
  credentialType: CredentialTypeName;
  vct: string;
  schemaVersion: string;
  issuer: { id: string; name: string };
  holder: { id: string; externalRef: string; fullName: string };
  /**
   * The envelope claims the signer adds, always visible to verifiers. iat is PLANNED: the
   * real iat is the signing time (when the wallet accepts the offer). exp is final. jti, cnf
   * and status are null: the credential id is assigned on issue, the wallet key is bound at
   * acceptance, and the status URI contains the id.
   */
  alwaysVisible: Record<string, unknown>;
  /** Subject claims the holder chooses to share (x-univault.selectivelyDisclosable). */
  disclosable: { name: string; value: unknown }[];
  /** Claims calculated by the server (x-univault.derivedClaims), recalculated again at signing. */
  derived: { name: string; value: unknown }[];
  expiry: {
    expiresAt: string;
    /** Issuance time + the schema's defaultValidity (whole seconds). */
    defaultExpiresAt: string;
    cappedBy: ExpiryCap | null;
    /** The dates validUntil may take: from min to max (inclusive). */
    validUntilRange: { min: string; max: string };
  };
  /** Codes for the portal: 'holder_under_18' (age_over_18 false, ends on the 18th birthday). */
  warnings: string[];
}

/** A schema this issuer may issue, with the always-visible claims (GET /credential-schemas). */
export interface IssuableSchema extends SchemaDescription {
  /** Envelope claims the signer adds plus x-univault.alwaysVisible: never selectively disclosable. */
  alwaysVisible: string[];
}

export interface RevokeCredentialInput {
  reason: RevocationReason;
  /** Free text; required when reason is 'other'. Stored in the history only, never logged. */
  note?: string | undefined;
}

export interface ReissueCredentialInput {
  reason: ReissueReason;
  /** Free text; required when reason is 'other'. Stored in the history only, never logged. */
  note?: string | undefined;
  /** YYYY-MM-DD: an earlier expiry than the issuance rules give (00:00 UTC on that date). */
  validUntil?: string | undefined;
}

export interface RevokeResult {
  credential: CredentialMetadata;
  /** Offers invalidated by the revocation (for logging; not part of the response). */
  invalidatedOfferIds: string[];
}

export interface ReissueResult {
  /** The new pending replacement. */
  credential: CredentialMetadata;
  replaces: { id: string; status: 'superseded' };
  /** The old credential's offers invalidated by the reissue (for logging). */
  invalidatedOfferIds: string[];
}

/** One status change in a credential's history. */
export interface CredentialStatusEventView {
  id: string;
  fromStatus: CredentialStatus | null;
  toStatus: CredentialStatus;
  reason: string | null;
  note: string | null;
  /** Null for wallet-driven events (signing at redemption) and backfilled events. */
  staff: StaffRef | null;
  createdAt: string;
}

/** GET /credentials sort orders (ties broken by creation time, then id). */
export const LIST_SORTS = [
  'newest',
  'oldest',
  'expires',
  'expires_desc',
  'holder',
  'holder_desc',
] as const;
export type ListSort = (typeof LIST_SORTS)[number];

export interface ListCredentialsQuery {
  status?: CredentialStatus | undefined;
  /** Filter on the computed status, e.g. 'expired' (stored valid, expires_at <= now). */
  effectiveStatus?: EffectiveStatus | undefined;
  holderId?: string | undefined;
  /** Holder name or reference (contains, case-insensitive) or credential id (prefix). */
  q?: string | undefined;
  sort?: ListSort | undefined;
  limit: number;
  offset: number;
}

/** A list row: the metadata plus whether a usable wallet offer exists (never the code). */
export interface CredentialListItem extends CredentialMetadata {
  hasActiveOffer: boolean;
}

/**
 * Per effective status, the credentials matching the list's issuer, holderId and q filters
 * (not the status filter): the portal's tab counts. Same rule as the list filter
 * (effectiveStatusCondition), so a tab count always equals that tab's total.
 */
export type CredentialStatusCounts = Record<EffectiveStatus | 'all', number>;

export interface CredentialListResult {
  credentials: CredentialListItem[];
  total: number;
  limit: number;
  offset: number;
  counts: CredentialStatusCounts;
}

/**
 * POST /credentials/:id/reissue/preview: what a reissue would produce now, from the SAME code
 * as POST /credentials/:id/reissue up to the writes (no lock, nothing written).
 */
export interface ReissuePreview {
  credentialId: string;
  credentialType: CredentialTypeName;
  holder: { id: string; externalRef: string; fullName: string };
  current: { claims: Record<string, unknown>; expiresAt: string; effectiveStatus: EffectiveStatus };
  replacement: {
    claims: Record<string, unknown>;
    expiresAt: string;
    defaultExpiresAt: string;
    cappedBy: ExpiryCap | null;
    validUntilRange: { min: string; max: string };
  };
  /** Claim names whose value differs between the current credential and the replacement. */
  changedFields: string[];
  warnings: string[];
}

/** An EC P-256 public JWK, as placed in `cnf.jwk`. */
export interface HolderPublicJwk {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
}

export interface SignedCredential {
  /** Compact SD-JWT `<JWT>~<disclosure>~…~`. Hand to the wallet; never store or log. */
  sdJwt: string;
  credential: CredentialMetadata;
}

export interface CredentialsService {
  create(staff: StaffProfile, input: CreateCredentialInput): Promise<CredentialMetadata>;
  /** The same checks and values as create(), without writing anything. */
  preview(staff: StaffProfile, input: CreateCredentialInput): Promise<CredentialPreview>;
  /** The schemas the staff member's issuer may issue (one per issuer type today). */
  issuableSchemas(staff: StaffProfile): IssuableSchema[];
  list(staff: StaffProfile, query: ListCredentialsQuery): Promise<CredentialListResult>;
  get(staff: StaffProfile, credentialId: string): Promise<CredentialDetail>;
  /** Pending or valid → revoked (the route allows admins only). */
  revoke(
    staff: StaffProfile,
    credentialId: string,
    input: RevokeCredentialInput,
  ): Promise<RevokeResult>;
  /** Valid → superseded, plus a new pending replacement from the holder's current record. */
  reissue(
    staff: StaffProfile,
    credentialId: string,
    input: ReissueCredentialInput,
  ): Promise<ReissueResult>;
  /** What reissue() would produce now: the same checks and values, without writing anything. */
  reissuePreview(
    staff: StaffProfile,
    credentialId: string,
    input: ReissueCredentialInput,
  ): Promise<ReissuePreview>;
  /** The credential's status history, oldest first. */
  events(
    staff: StaffProfile,
    credentialId: string,
  ): Promise<{ credentialId: string; events: CredentialStatusEventView[] }>;
  /** Signs a pending credential, bound to the holder's wallet key. Sprint 2 redemption calls this. */
  signCredential(credentialId: string, holderPublicJwk: unknown): Promise<SignedCredential>;
  /**
   * DEVELOPMENT ONLY (TEMPORARY, remove in Sprint 2): moves a valid credential's expiry one
   * minute into the past and records a 'dev_simulated_expiry' event. Only the dev router calls it.
   */
  simulateExpiry(staff: StaffProfile, credentialId: string): Promise<CredentialMetadata>;
}

export interface CredentialsServiceOptions {
  /** The only owner of private keys (src/keys/key-store.ts). */
  keyStore: KeyStore;
  publicBaseUrl: string;
  now?: () => Date;
}

export const credentialNotFound = () =>
  new AppError(404, 'CREDENTIAL_NOT_FOUND', 'Credential not found');

// ---------------------------------------------------------------------------
// Expiry rules (credential-schemas.md §6, Decision 005)
// ---------------------------------------------------------------------------

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Midnight UTC at the start of an ISO YYYY-MM-DD date. */
function startOfDateUtc(date: string): Date | null {
  const m = DATE_ONLY.exec(date);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}

/**
 * Adds an ISO 8601 date duration (PnYnMnD, e.g. "P1Y") to a date, in UTC.
 * A day that does not exist in the target month is clamped (29 Feb + P1Y → 28 Feb).
 */
export function addIsoDuration(from: Date, duration: string): Date {
  const m = /^P(?=\d)(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?$/.exec(duration);
  if (!m) throw new Error(`Unsupported validity period "${duration}" (expected PnYnMnD)`);
  const [years, months, days] = [Number(m[1] ?? 0), Number(m[2] ?? 0), Number(m[3] ?? 0)];
  const totalMonths = from.getUTCMonth() + months + years * 12;
  const year = from.getUTCFullYear() + Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const result = new Date(from);
  result.setUTCFullYear(year, month, Math.min(from.getUTCDate(), lastDay));
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** The 18th birthday (midnight UTC), from an ISO YYYY-MM-DD date of birth. */
export function eighteenthBirthday(dateOfBirth: string): Date | null {
  const m = DATE_ONLY.exec(dateOfBirth);
  // Date.UTC rolls 29 Feb into 1 Mar in non-leap years – the same day ageOn() counts as the birthday
  return m ? new Date(Date.UTC(Number(m[1]) + 18, Number(m[2]) - 1, Number(m[3]))) : null;
}

/**
 * Credential expiry: now + the schema's default validity, capped at
 *  - the ID document's expiry (KYC: a credential never outlives its document), and
 *  - the 18th birthday when age_over_18 is false (it is then reissued with true).
 */
export function computeExpiry(
  now: Date,
  defaultValidity: string,
  claims: Record<string, unknown>,
): Date {
  return computeExpiryDetail(now, defaultValidity, claims).expiresAt;
}

/** computeExpiry with the default and the cap that won (null when the default applies). */
export function computeExpiryDetail(
  now: Date,
  defaultValidity: string,
  claims: Record<string, unknown>,
): { expiresAt: Date; defaultExpiresAt: Date; cappedBy: Exclude<ExpiryCap, 'validUntil'> | null } {
  const defaultExpiresAt = addIsoDuration(now, defaultValidity);
  let expiresAt = defaultExpiresAt;
  let cappedBy: Exclude<ExpiryCap, 'validUntil'> | null = null;
  const cap = (date: Date | null, reason: Exclude<ExpiryCap, 'validUntil'>) => {
    if (date && date.getTime() < expiresAt.getTime()) {
      expiresAt = date;
      cappedBy = reason;
    }
  };
  if (typeof claims.id_document_expiry === 'string') {
    cap(startOfDateUtc(claims.id_document_expiry), 'id_document_expiry');
  }
  if (claims.age_over_18 === false && typeof claims.date_of_birth === 'string') {
    cap(eighteenthBirthday(claims.date_of_birth), '18th_birthday');
  }
  return { expiresAt, defaultExpiresAt, cappedBy };
}

/** Copy of the claims with age_over_18 recalculated from date_of_birth on `on` (Decision 005). */
function withDerivedClaims(
  type: CredentialTypeName,
  claims: Record<string, unknown>,
  on: Date,
): Record<string, unknown> {
  const result = { ...claims };
  if (type === 'KYCCredential' && typeof result.date_of_birth === 'string') {
    const age = ageOn(result.date_of_birth, on);
    if (age !== null) result.age_over_18 = age >= 18;
  }
  return result;
}

/** YYYY-MM-DD of a date in UTC. */
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Whole seconds (the SD-JWT NumericDate). */
const wholeSeconds = (d: Date) => new Date(Math.floor(d.getTime() / 1000) * 1000);

interface EnvelopeInput {
  baseUrl: string;
  issuerId: string;
  issuerName: string;
  credentialType: CredentialTypeName;
  vct: string;
  schemaVersion: string;
  /** The credential id; null before it exists (preview). */
  jti: string | null;
  iat: Date;
  exp: Date;
  createdAt: Date;
  /** The wallet key; null before the wallet accepts (preview). */
  holderKey: HolderPublicJwk | null;
}

/**
 * The envelope claims the signer adds: always visible to verifiers, never disclosures
 * (credential-schemas.md §3). The ONE list: signCredential() signs it, the preview shows it,
 * and GET /credential-schemas names its keys.
 */
function envelopeClaims(input: EnvelopeInput) {
  return {
    iss: `${input.baseUrl}/api/v1/issuers/${input.issuerId}`,
    issuer_name: input.issuerName,
    vct: input.vct,
    schema_version: input.schemaVersion,
    jti: input.jti,
    iat: Math.floor(input.iat.getTime() / 1000),
    exp: Math.floor(input.exp.getTime() / 1000),
    cnf: input.holderKey ? { jwk: input.holderKey } : null,
    status: input.jti ? { status_uri: `${input.baseUrl}/api/v1/status/${input.jti}` } : null,
    ...(input.credentialType === 'KYCCredential'
      ? { kyc_verification_date: isoDate(input.createdAt) }
      : {}),
  };
}

/** The names of the envelope claims of a credential type (from envelopeClaims itself). */
export function envelopeClaimNames(type: CredentialTypeName): string[] {
  const epoch = new Date(0);
  return Object.keys(
    envelopeClaims({
      baseUrl: '',
      issuerId: '',
      issuerName: '',
      credentialType: type,
      vct: '',
      schemaVersion: '',
      jti: null,
      iat: epoch,
      exp: epoch,
      createdAt: epoch,
      holderKey: null,
    }),
  );
}

// ---------------------------------------------------------------------------
// Holder public key (cnf.jwk)
// ---------------------------------------------------------------------------

const B64URL_32_BYTES = /^[A-Za-z0-9_-]{43}$/; // a P-256 coordinate is 32 bytes

const holderPublicJwkSchema = z
  .object({
    kty: z.literal('EC', 'must be "EC"'),
    crv: z.literal('P-256', 'must be "P-256"'),
    x: z.string().regex(B64URL_32_BYTES, 'must be a 32-byte Base64URL coordinate'),
    y: z.string().regex(B64URL_32_BYTES, 'must be a 32-byte Base64URL coordinate'),
  })
  .loose()
  .refine((jwk) => !('d' in jwk), {
    path: ['d'],
    message: 'must not be present: send the PUBLIC key only',
  });

/**
 * Checks the wallet key is an EC P-256 public JWK on the curve, and returns only
 * the members needed for `cnf.jwk` (kty, crv, x, y): extra members are dropped.
 */
export function parseHolderPublicJwk(input: unknown): HolderPublicJwk {
  const parsed = holderPublicJwkSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(
      400,
      'INVALID_HOLDER_KEY',
      'The holder key must be an EC P-256 public JWK',
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  const jwk: HolderPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: parsed.data.x,
    y: parsed.data.y,
  };
  try {
    createPublicKey({ key: { ...jwk }, format: 'jwk' }); // rejects points that are not on the curve
  } catch {
    throw new AppError(400, 'INVALID_HOLDER_KEY', 'The holder key is not a valid P-256 point');
  }
  return jwk;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/** Statuses that block creating another credential of the same type for a holder. */
const ACTIVE_STATUSES: CredentialStatus[] = ['pending', 'valid'];

/** Query executor: the database or a transaction handle (inside a transaction always pass `tx`). */
type Executor = Pick<Db, 'select' | 'insert' | 'update'>;

/** Tie-break for events written at the same instant: creation, then signing, then the rest. */
export const EVENT_ORDER = sql`case ${credentialStatusEvents.toStatus} when 'pending' then 0 when 'valid' then 1 else 2 end`;

export function createCredentialsService(
  db: Db,
  schemas: CredentialSchemas,
  options: CredentialsServiceOptions,
): CredentialsService {
  const now = options.now ?? (() => new Date());
  const baseUrl = options.publicBaseUrl.replace(/\/+$/, '');

  const loadMetadata = async (where: SQL | undefined): Promise<CredentialMetadata | null> => {
    const row = await db.query.credentialRecords.findFirst({ where, with: METADATA_RELATIONS });
    return row ? toMetadata(row, now()) : null;
  };

  /** The issuer's active signing key. Pass `tx` inside a transaction (PGlite has one connection). */
  const activeKey = async (issuerId: string, executor: Pick<Db, 'select'> = db) =>
    (
      await executor
        .select({ kid: issuerKeys.kid })
        .from(issuerKeys)
        .where(and(eq(issuerKeys.issuerId, issuerId), eq(issuerKeys.status, 'active')))
    )[0] ?? null;

  const issuerKeyMissing = () =>
    new AppError(
      409,
      'ISSUER_KEY_MISSING',
      'This issuer has no active signing key yet. An administrator must create one first (run npm run keys:init).',
    );

  const recordEvent = (executor: Executor, event: NewCredentialStatusEvent) =>
    executor.insert(credentialStatusEvents).values(event);

  /**
   * The holder row (issuer-scoped). With `lock` (the default) it is locked FOR UPDATE, so
   * issuance for one holder is serialised; the preview reads it without a lock.
   */
  const lockHolder = async (tx: Executor, staff: StaffProfile, holderId: string, lock = true) => {
    const query = tx
      .select()
      .from(holders)
      .where(and(eq(holders.id, holderId), eq(holders.issuerId, staff.issuer.id)));
    const [holder] = lock ? await query.for('update') : await query;
    if (!holder) throw holderNotFound();
    return holder;
  };

  /**
   * A credential row (issuer-scoped), locked FOR UPDATE unless `lock` is false (the reissue
   * preview). Another issuer's credential is "not found".
   */
  const lockCredential = async (
    tx: Executor,
    staff: StaffProfile,
    credentialId: string,
    lock = true,
  ) => {
    const query = tx
      .select()
      .from(credentialRecords)
      .where(
        and(
          eq(credentialRecords.id, credentialId),
          eq(credentialRecords.issuerId, staff.issuer.id),
        ),
      );
    const [credential] = lock ? await query.for('update') : await query;
    if (!credential) throw credentialNotFound();
    return credential;
  };

  /**
   * The issuance rules shared by create() and reissue(): the holder's CURRENT record is
   * validated again, age_over_18 is recalculated, and the expiry gets the same caps
   * (schema default, ID document expiry, 18th birthday, and an optional earlier validUntil).
   * A holder record that fails validation is a 422 HOLDER_DATA_INVALID for both paths
   * (the request itself was valid; the stored data is not). 400 VALIDATION_ERROR is kept
   * for invalid request bodies.
   */
  const prepareClaims = (
    type: CredentialTypeName,
    holder: Holder,
    issuedOn: Date,
    rules: { validUntil?: string | undefined } = {},
  ) => {
    const schema = schemas.metadata(type);
    // The holder record may have been stored under an older schema: validate it again
    const claims = withDerivedClaims(type, holder.claims, issuedOn);
    const issues: HolderDataIssue[] = schemas
      .validate(type, claims)
      .map((i) => ({ path: `claims.${i.path}`, message: i.message }));
    const documentExpiry =
      typeof claims.id_document_expiry === 'string'
        ? startOfDateUtc(claims.id_document_expiry)
        : null;
    if (documentExpiry && documentExpiry <= issuedOn) {
      issues.push({ path: 'claims.id_document_expiry', message: 'the ID document has expired' });
    }
    if (issues.length > 0) {
      throw new AppError(
        422,
        'HOLDER_DATA_INVALID',
        `The holder record no longer matches the ${type} schema. Update the holder record first.`,
        issues,
      );
    }

    const detail = computeExpiryDetail(issuedOn, schema.defaultValidity, claims);
    let expiresAt = detail.expiresAt;
    let cappedBy: ExpiryCap | null = detail.cappedBy;
    // validUntil may be any date whose midnight is after now and not after the capped expiry
    const validUntilRange = {
      min: isoDate(new Date(startOfDateUtc(isoDate(issuedOn))!.getTime() + 86_400_000)),
      max: isoDate(expiresAt),
    };
    if (rules.validUntil !== undefined) {
      const requested = startOfDateUtc(rules.validUntil);
      if (!requested || requested <= issuedOn || requested > expiresAt) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Invalid validUntil', [
          {
            path: 'validUntil',
            message: `must be a date after today and no later than ${isoDate(expiresAt)}`,
          },
        ]);
      }
      if (requested.getTime() < expiresAt.getTime()) cappedBy = 'validUntil';
      expiresAt = requested;
    }
    // Whole seconds: the SD-JWT `exp` (seconds) then equals expires_at exactly, so the token
    // and the status endpoint agree on the expiry instant (the date caps are midnight already)
    expiresAt = wholeSeconds(expiresAt);
    const defaultExpiresAt = wholeSeconds(detail.defaultExpiresAt);
    return { schema, claims, expiresAt, defaultExpiresAt, cappedBy, validUntilRange };
  };

  /** 400 when the issuer may not issue this type (the type follows the issuer type). */
  const issuableType = (staff: StaffProfile, requested: CredentialTypeName | undefined) => {
    const expectedType = ISSUER_RECORD_TYPES[staff.issuer.type].credentialType;
    if (requested !== undefined && requested !== expectedType) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Wrong credential type for this issuer', [
        {
          path: 'credentialType',
          message: `must be ${expectedType} for a${staff.issuer.type === 'employer' ? 'n' : ''} ${staff.issuer.type}`,
        },
      ]);
    }
    return expectedType;
  };

  /**
   * Rejects a second pending or valid credential of the same type for one holder. `excludeId`:
   * the credential a reissue is about to supersede (it does not count against its replacement).
   */
  const assertNoActiveCredential = async (
    tx: Executor,
    holderId: string,
    type: CredentialTypeName,
    excludeId?: string,
  ) => {
    const [existing] = await tx
      .select({ id: credentialRecords.id })
      .from(credentialRecords)
      .where(
        and(
          eq(credentialRecords.holderId, holderId),
          eq(credentialRecords.credentialType, type),
          inArray(credentialRecords.status, ACTIVE_STATUSES),
          ...(excludeId ? [ne(credentialRecords.id, excludeId)] : []),
        ),
      )
      .limit(1);
    if (existing) {
      throw new AppError(
        409,
        'ACTIVE_CREDENTIAL_EXISTS',
        `This holder already has a pending or valid ${type}. Use reissue to change it.`,
        { credentialId: existing.id },
      );
    }
  };

  /** Inserts a pending credential and its creation event (null → pending). */
  const insertPending = async (
    tx: Executor,
    staff: StaffProfile,
    holder: Holder,
    type: CredentialTypeName,
    prepared: ReturnType<typeof prepareClaims>,
    issuedOn: Date,
    replacesCredentialId: string | null = null,
  ) => {
    const [row] = await tx
      .insert(credentialRecords)
      .values({
        issuerId: staff.issuer.id,
        holderId: holder.id,
        credentialType: type,
        vct: prepared.schema.vct,
        schemaVersion: prepared.schema.schemaVersion,
        status: 'pending',
        claimsSnapshot: prepared.claims,
        expiresAt: prepared.expiresAt,
        replacesCredentialId,
        createdByStaffId: staff.id,
        createdAt: issuedOn,
        statusUpdatedAt: issuedOn,
      })
      .returning({ id: credentialRecords.id });
    await recordEvent(tx, {
      credentialId: row!.id,
      issuerId: staff.issuer.id,
      fromStatus: null,
      toStatus: 'pending',
      staffId: staff.id,
      createdAt: issuedOn,
    });
    return row!.id;
  };

  /**
   * Invalidates every offer of a credential that is neither redeemed nor already invalidated,
   * recording why (migration 0008: the portal shows a message per reason).
   */
  const invalidateOpenOffers = async (
    tx: Executor,
    credentialId: string,
    at: Date,
    reason: 'credential_revoked' | 'credential_superseded',
  ) =>
    (
      await tx
        .update(credentialOffers)
        .set({ invalidatedAt: at, invalidationReason: reason })
        .where(
          and(
            eq(credentialOffers.credentialId, credentialId),
            isNull(credentialOffers.redeemedAt),
            isNull(credentialOffers.invalidatedAt),
          ),
        )
        .returning({ id: credentialOffers.id })
    ).map((o) => o.id);

  /** 409 for a credential that is already revoked or superseded (both are final). */
  const assertNotFinal = async (
    tx: Executor,
    credential: { id: string; status: CredentialStatus },
  ) => {
    if (credential.status === 'revoked') {
      throw new AppError(409, 'CREDENTIAL_ALREADY_REVOKED', 'This credential is already revoked');
    }
    if (credential.status === 'superseded') {
      const [replacement] = await tx
        .select({ id: credentialRecords.id })
        .from(credentialRecords)
        .where(eq(credentialRecords.replacesCredentialId, credential.id));
      throw new AppError(
        409,
        'CREDENTIAL_SUPERSEDED',
        'This credential has already been replaced by a reissued credential',
        { replacedBy: replacement?.id ?? null },
      );
    }
  };

  /**
   * The ONE issuance path, shared by create() and preview() (Decision 019). In order: the type
   * the issuer may issue (400), the holder of this issuer, locked (404), the holder record
   * against the schema with age_over_18 and the expiry caps (422 / 400 validUntil), one active
   * credential per holder and type (409, with the existing id), an active signing key (409).
   * Nothing is written here; inside a transaction pass its `tx`.
   *
   * `lock` (default true, issuance): the holder row is locked FOR UPDATE, so the "one active
   * credential" check cannot be raced before the insert. The preview passes `lock: false`: it
   * writes nothing, so it needs no lock and never blocks an issuance (the issuance repeats
   * every check under the lock anyway).
   */
  const prepareIssuance = async (
    executor: Executor,
    staff: StaffProfile,
    input: CreateCredentialInput,
    issuedOn: Date,
    { lock = true }: { lock?: boolean } = {},
  ) => {
    const type = issuableType(staff, input.credentialType);
    const holder = await lockHolder(executor, staff, input.holderId, lock);
    const prepared = prepareClaims(type, holder, issuedOn, { validUntil: input.validUntil });
    await assertNoActiveCredential(executor, holder.id, type);
    if (!(await activeKey(staff.issuer.id, executor))) throw issuerKeyMissing();
    return { holder, type, prepared };
  };

  /**
   * The ONE reissue path up to the writes, shared by reissue() and reissuePreview(). In order:
   * the old credential of this issuer (404), not pending (409 CREDENTIAL_NOT_REISSUABLE), not
   * revoked or superseded (409), the holder's CURRENT record through prepareClaims() (422 /
   * 400 validUntil), an active signing key (409), and no OTHER active credential of the type
   * (409). Nothing is written here.
   *
   * Stored 'valid' includes credentials whose expiry has passed (effective status 'expired'):
   * reissuing one is a renewal (Decision 012 follow-up), so expiry is deliberately not checked.
   *
   * `lock` (default true, reissue): the old credential and then the holder are locked FOR
   * UPDATE, so a second reissue of the same credential waits, then sees 'superseded' (409).
   * The preview passes `lock: false`.
   */
  const prepareReissue = async (
    executor: Executor,
    staff: StaffProfile,
    credentialId: string,
    input: ReissueCredentialInput,
    issuedOn: Date,
    { lock = true }: { lock?: boolean } = {},
  ) => {
    const old = await lockCredential(executor, staff, credentialId, lock);
    if (old.status === 'pending') {
      throw new AppError(
        409,
        'CREDENTIAL_NOT_REISSUABLE',
        'A pending credential has not been delivered yet, so it cannot be reissued. Revoke it and issue a new one.',
      );
    }
    await assertNotFinal(executor, old);
    const holder = await lockHolder(executor, staff, old.holderId, lock);
    const prepared = prepareClaims(old.credentialType, holder, issuedOn, {
      validUntil: input.validUntil,
    });
    if (!(await activeKey(staff.issuer.id, executor))) throw issuerKeyMissing();
    await assertNoActiveCredential(executor, holder.id, old.credentialType, old.id);
    return { old, holder, prepared };
  };

  return {
    async create(staff, input) {
      const issuedOn = now();
      const id = await db.transaction(async (tx) => {
        const { holder, type, prepared } = await prepareIssuance(tx, staff, input, issuedOn);
        return insertPending(tx, staff, holder, type, prepared, issuedOn);
      });
      return (await loadMetadata(eq(credentialRecords.id, id)))!;
    },

    async preview(staff, input) {
      const issuedOn = now();
      // Same checks as create(), without a lock and without a transaction: nothing is written
      const { holder, type, prepared } = await prepareIssuance(db, staff, input, issuedOn, {
        lock: false,
      });
      const meta = prepared.schema;
      const derivedNames = new Set(Object.keys(meta.derivedClaims ?? {}));
      const present = (name: string) => Object.hasOwn(prepared.claims, name);
      const envelope = envelopeClaims({
        baseUrl,
        issuerId: staff.issuer.id,
        issuerName: staff.issuer.name,
        credentialType: type,
        vct: meta.vct,
        schemaVersion: meta.schemaVersion,
        jti: null,
        iat: issuedOn,
        exp: prepared.expiresAt,
        createdAt: issuedOn,
        holderKey: null,
      });
      return {
        credentialType: type,
        vct: meta.vct,
        schemaVersion: meta.schemaVersion,
        issuer: { id: staff.issuer.id, name: staff.issuer.name },
        holder: { id: holder.id, externalRef: holder.externalRef, fullName: holder.fullName },
        alwaysVisible: {
          ...envelope,
          iat: wholeSeconds(issuedOn).toISOString(), // planned: the real iat is set at signing
          exp: prepared.expiresAt.toISOString(),
        },
        disclosable: meta.selectivelyDisclosable
          .filter((name) => present(name) && !derivedNames.has(name))
          .map((name) => ({ name, value: prepared.claims[name] })),
        derived: [...derivedNames]
          .filter(present)
          .map((name) => ({ name, value: prepared.claims[name] })),
        expiry: {
          expiresAt: prepared.expiresAt.toISOString(),
          defaultExpiresAt: prepared.defaultExpiresAt.toISOString(),
          cappedBy: prepared.cappedBy,
          validUntilRange: prepared.validUntilRange,
        },
        warnings: prepared.claims.age_over_18 === false ? ['holder_under_18'] : [],
      };
    },

    issuableSchemas(staff) {
      const type = ISSUER_RECORD_TYPES[staff.issuer.type].credentialType;
      const description = schemas.describe(type);
      return [
        {
          ...description,
          alwaysVisible: [...envelopeClaimNames(type), ...description.alwaysVisibleClaims],
        },
      ];
    },

    async list(staff, query) {
      const at = now();
      // Issuer scope, holder and search: shared by the page, its total and the tab counts
      const base: SQL[] = [eq(credentialRecords.issuerId, staff.issuer.id)];
      if (query.holderId) base.push(eq(credentialRecords.holderId, query.holderId));
      if (query.q) base.push(listSearchCondition(query.q));
      const filtered = [...base];
      if (query.status) filtered.push(eq(credentialRecords.status, query.status));
      if (query.effectiveStatus) filtered.push(effectiveStatusCondition(query.effectiveStatus, at));
      const where = and(...filtered);
      const joined = () =>
        db
          .select({ id: credentialRecords.id })
          .from(credentialRecords)
          .innerJoin(holders, eq(holders.id, credentialRecords.holderId));

      // A fixed number of queries per page, whatever its size (no N+1): the page's ids (sorted
      // with the holder name available), the total, the tab counts, the rows' metadata, and
      // which rows have a usable offer
      const countIf = (status: EffectiveStatus) =>
        sql<number>`count(*) filter (where ${effectiveStatusCondition(status, at)})`.mapWith(
          Number,
        );
      const [page, totals, countRows] = await Promise.all([
        joined()
          .where(where)
          .orderBy(...LIST_ORDER[query.sort ?? 'newest'])
          .limit(query.limit)
          .offset(query.offset),
        db
          .select({ n: count() })
          .from(credentialRecords)
          .innerJoin(holders, eq(holders.id, credentialRecords.holderId))
          .where(where),
        db
          .select({
            all: count(),
            pending: countIf('pending'),
            valid: countIf('valid'),
            expired: countIf('expired'),
            revoked: countIf('revoked'),
            superseded: countIf('superseded'),
          })
          .from(credentialRecords)
          .innerJoin(holders, eq(holders.id, credentialRecords.holderId))
          .where(and(...base)),
      ]);
      const ids = page.map((r) => r.id);
      const [rows, offers] =
        ids.length === 0
          ? [[], []]
          : await Promise.all([
              db.query.credentialRecords.findMany({
                where: inArray(credentialRecords.id, ids),
                with: METADATA_RELATIONS,
              }),
              // Same rule as offerStatus() 'active' and get()'s activeOffer
              db
                .selectDistinct({ credentialId: credentialOffers.credentialId })
                .from(credentialOffers)
                .where(
                  and(
                    inArray(credentialOffers.credentialId, ids),
                    isNull(credentialOffers.redeemedAt),
                    isNull(credentialOffers.invalidatedAt),
                    gt(credentialOffers.expiresAt, at),
                  ),
                ),
            ]);
      const byId = new Map(rows.map((row) => [row.id, row]));
      const withOffer = new Set(offers.map((o) => o.credentialId));
      const counts = countRows[0]!;
      return {
        credentials: ids.map((id) => {
          const metadata = toMetadata(byId.get(id)!, at);
          return {
            ...metadata,
            hasActiveOffer: metadata.status === 'pending' && withOffer.has(id),
          };
        }),
        total: totals[0]?.n ?? 0,
        limit: query.limit,
        offset: query.offset,
        counts: {
          all: counts.all,
          pending: counts.pending,
          valid: counts.valid,
          expired: counts.expired,
          revoked: counts.revoked,
          superseded: counts.superseded,
        },
      };
    },

    async get(staff, credentialId) {
      const found = await loadMetadata(
        and(
          eq(credentialRecords.id, credentialId),
          eq(credentialRecords.issuerId, staff.issuer.id),
        ),
      );
      if (!found) throw credentialNotFound();
      const at = now();
      // Same rule as offerStatus() 'active': not redeemed, not invalidated, not yet expired
      const [offer] =
        found.status === 'pending'
          ? await db
              .select({ offerId: credentialOffers.id, expiresAt: credentialOffers.expiresAt })
              .from(credentialOffers)
              .where(
                and(
                  eq(credentialOffers.credentialId, found.id),
                  isNull(credentialOffers.redeemedAt),
                  isNull(credentialOffers.invalidatedAt),
                  gt(credentialOffers.expiresAt, at),
                ),
              )
              .orderBy(desc(credentialOffers.createdAt))
              .limit(1)
          : [];
      return {
        ...found,
        activeOffer: offer
          ? { offerId: offer.offerId, expiresAt: offer.expiresAt.toISOString() }
          : null,
      };
    },

    async revoke(staff, credentialId, input) {
      const at = now();
      const result = await db.transaction(async (tx) => {
        const credential = await lockCredential(tx, staff, credentialId);
        await assertNotFinal(tx, credential);

        // Pending can be revoked too: otherwise an unredeemed credential blocks new issuance
        await tx
          .update(credentialRecords)
          .set({
            status: 'revoked',
            revokedAt: at,
            revokedByStaffId: staff.id,
            revocationReason: input.reason,
            statusUpdatedAt: at,
          })
          .where(
            and(
              eq(credentialRecords.id, credential.id),
              inArray(credentialRecords.status, ACTIVE_STATUSES),
            ),
          );
        const invalidatedOfferIds = await invalidateOpenOffers(
          tx,
          credential.id,
          at,
          'credential_revoked',
        );
        await recordEvent(tx, {
          credentialId: credential.id,
          issuerId: credential.issuerId,
          fromStatus: credential.status,
          toStatus: 'revoked',
          reason: input.reason,
          note: input.note ?? null,
          staffId: staff.id,
          createdAt: at,
        });
        return { id: credential.id, invalidatedOfferIds };
      });

      return {
        credential: (await loadMetadata(eq(credentialRecords.id, result.id)))!,
        invalidatedOfferIds: result.invalidatedOfferIds,
      };
    },

    async reissue(staff, credentialId, input) {
      const issuedOn = now();
      const result = await db.transaction(async (tx) => {
        // Old credential first, then the holder (both locked): every check, then the writes
        const { old, holder, prepared } = await prepareReissue(
          tx,
          staff,
          credentialId,
          input,
          issuedOn,
        );

        await tx
          .update(credentialRecords)
          .set({
            status: 'superseded',
            supersededAt: issuedOn,
            supersededByStaffId: staff.id,
            statusUpdatedAt: issuedOn,
          })
          .where(and(eq(credentialRecords.id, old.id), eq(credentialRecords.status, 'valid')));

        const newId = await insertPending(
          tx,
          staff,
          holder,
          old.credentialType,
          prepared,
          issuedOn,
          old.id,
        );
        const invalidatedOfferIds = await invalidateOpenOffers(
          tx,
          old.id,
          issuedOn,
          'credential_superseded',
        );
        await recordEvent(tx, {
          credentialId: old.id,
          issuerId: old.issuerId,
          fromStatus: 'valid',
          toStatus: 'superseded',
          reason: input.reason,
          note: input.note ?? null,
          staffId: staff.id,
          createdAt: issuedOn,
        });
        return { newId, oldId: old.id, invalidatedOfferIds };
      });

      return {
        credential: (await loadMetadata(eq(credentialRecords.id, result.newId)))!,
        replaces: { id: result.oldId, status: 'superseded' },
        invalidatedOfferIds: result.invalidatedOfferIds,
      };
    },

    async reissuePreview(staff, credentialId, input) {
      const issuedOn = now();
      // Same checks as reissue(), without a lock and without a transaction: nothing is written
      const { old, holder, prepared } = await prepareReissue(
        db,
        staff,
        credentialId,
        input,
        issuedOn,
        { lock: false },
      );
      const current = old.claimsSnapshot;
      return {
        credentialId: old.id,
        credentialType: old.credentialType,
        holder: { id: holder.id, externalRef: holder.externalRef, fullName: holder.fullName },
        current: {
          claims: current,
          expiresAt: old.expiresAt.toISOString(),
          effectiveStatus: effectiveStatus(old, issuedOn),
        },
        replacement: {
          claims: prepared.claims,
          expiresAt: prepared.expiresAt.toISOString(),
          defaultExpiresAt: prepared.defaultExpiresAt.toISOString(),
          cappedBy: prepared.cappedBy,
          validUntilRange: prepared.validUntilRange,
        },
        changedFields: changedClaimNames(current, prepared.claims),
        warnings: prepared.claims.age_over_18 === false ? ['holder_under_18'] : [],
      };
    },

    async events(staff, credentialId) {
      const [credential] = await db
        .select({ id: credentialRecords.id })
        .from(credentialRecords)
        .where(
          and(
            eq(credentialRecords.id, credentialId),
            eq(credentialRecords.issuerId, staff.issuer.id),
          ),
        );
      if (!credential) throw credentialNotFound();

      const rows = await db
        .select({
          id: credentialStatusEvents.id,
          fromStatus: credentialStatusEvents.fromStatus,
          toStatus: credentialStatusEvents.toStatus,
          reason: credentialStatusEvents.reason,
          note: credentialStatusEvents.note,
          staffId: issuerStaff.id,
          staffName: issuerStaff.displayName,
          createdAt: credentialStatusEvents.createdAt,
        })
        .from(credentialStatusEvents)
        .leftJoin(issuerStaff, eq(issuerStaff.id, credentialStatusEvents.staffId))
        .where(eq(credentialStatusEvents.credentialId, credential.id))
        .orderBy(asc(credentialStatusEvents.createdAt), asc(EVENT_ORDER));

      return {
        credentialId: credential.id,
        events: rows.map((r) => ({
          id: r.id,
          fromStatus: r.fromStatus,
          toStatus: r.toStatus,
          reason: r.reason,
          note: r.note,
          staff: r.staffId && r.staffName ? { id: r.staffId, displayName: r.staffName } : null,
          createdAt: r.createdAt.toISOString(),
        })),
      };
    },

    async signCredential(credentialId, holderPublicJwk) {
      const holderKey = parseHolderPublicJwk(holderPublicJwk); // never sign without a valid holder key
      const signedAt = now();

      const [record] = await db
        .select({
          id: credentialRecords.id,
          issuerId: credentialRecords.issuerId,
          credentialType: credentialRecords.credentialType,
          vct: credentialRecords.vct,
          schemaVersion: credentialRecords.schemaVersion,
          status: credentialRecords.status,
          claimsSnapshot: credentialRecords.claimsSnapshot,
          expiresAt: credentialRecords.expiresAt,
          createdAt: credentialRecords.createdAt,
          issuerName: issuers.name,
        })
        .from(credentialRecords)
        .innerJoin(issuers, eq(issuers.id, credentialRecords.issuerId))
        .where(eq(credentialRecords.id, credentialId));
      if (!record) throw credentialNotFound();
      if (record.status !== 'pending') {
        throw new AppError(
          409,
          'CREDENTIAL_NOT_PENDING',
          `Only a pending credential can be signed (this one is ${record.status})`,
        );
      }
      if (record.expiresAt <= signedAt) {
        throw new AppError(
          409,
          'CREDENTIAL_EXPIRED',
          'This credential expired before it was signed',
        );
      }

      if (!(await activeKey(record.issuerId))) throw issuerKeyMissing();
      // The key store decrypts each key once and checks it (Decision 014). Any key problem is a
      // KeyStoreError, answered as 503 ISSUER_KEY_UNAVAILABLE by the error handler
      const key = await options.keyStore.getSigningKey(record.issuerId);
      const privateKey = key.privateKey;

      // Subject claims: the snapshot, with age_over_18 recalculated on the issuance date
      const subject = withDerivedClaims(record.credentialType, record.claimsSnapshot, signedAt);
      const disclosable = schemas
        .metadata(record.credentialType)
        .selectivelyDisclosable.filter((name) => Object.hasOwn(subject, name));
      const envelope = envelopeClaims({
        baseUrl,
        issuerId: record.issuerId,
        issuerName: record.issuerName,
        credentialType: record.credentialType,
        vct: record.vct,
        schemaVersion: record.schemaVersion,
        jti: record.id,
        iat: signedAt,
        exp: record.expiresAt,
        createdAt: record.createdAt,
        holderKey,
      });
      // Envelope last, so a subject claim can never overwrite an envelope claim
      const sdJwt = await createSdJwt({ ...subject, ...envelope }, disclosable, {
        kid: key.kid,
        privateKey,
      });

      // "status = 'pending'" makes signing single-use even if two redemptions race, and means
      // a credential revoked or superseded meanwhile can never become valid
      const signed = await db.transaction(async (tx) => {
        const updated = await tx
          .update(credentialRecords)
          .set({
            status: 'valid',
            issuedAt: signedAt,
            issuerKid: key.kid,
            holderKeyThumbprint: computeEcJwkThumbprint(holderKey),
            statusUpdatedAt: signedAt,
          })
          .where(
            and(
              eq(credentialRecords.id, record.id),
              eq(credentialRecords.status, 'pending'),
              gt(credentialRecords.expiresAt, signedAt),
            ),
          )
          .returning({ id: credentialRecords.id });
        if (updated.length === 0) return false;
        // Wallet-driven event: no staff member
        await recordEvent(tx, {
          credentialId: record.id,
          issuerId: record.issuerId,
          fromStatus: 'pending',
          toStatus: 'valid',
          staffId: null,
          createdAt: signedAt,
        });
        return true;
      });
      if (!signed) {
        // The SD-JWT just created is discarded: it is never returned
        throw new AppError(
          409,
          'CREDENTIAL_NOT_PENDING',
          'This credential is no longer pending (it was signed, revoked or superseded meanwhile)',
        );
      }

      return { sdJwt, credential: (await loadMetadata(eq(credentialRecords.id, record.id)))! };
    },

    async simulateExpiry(staff, credentialId) {
      const at = now();
      // Whole seconds, like every other expiry (see prepareClaims)
      const expiresAt = new Date(Math.floor(at.getTime() / 1000) * 1000 - 60_000);
      await db.transaction(async (tx) => {
        const credential = await lockCredential(tx, staff, credentialId);
        const current = effectiveStatus(credential, at);
        if (current !== 'valid') {
          throw new AppError(
            409,
            'CREDENTIAL_NOT_VALID',
            `Only a valid credential can be expired (this one is ${current})`,
            { effectiveStatus: current },
          );
        }
        // CHECK expires_at > issued_at stays true: a credential signed in the last minute has
        // its issued_at moved to one second before the new expiry (development data only)
        const issuedAt =
          credential.issuedAt && credential.issuedAt < expiresAt
            ? credential.issuedAt
            : new Date(expiresAt.getTime() - 1000);
        await tx
          .update(credentialRecords)
          .set({ expiresAt, issuedAt })
          .where(eq(credentialRecords.id, credential.id));
        // valid → valid: the stored status does not change ('expired' is computed); migration
        // 0007 allows a same-status event only with this reason
        await recordEvent(tx, {
          credentialId: credential.id,
          issuerId: credential.issuerId,
          fromStatus: 'valid',
          toStatus: 'valid',
          reason: DEV_EVENT_REASONS[0],
          staffId: staff.id,
          createdAt: at,
        });
      });
      return (await loadMetadata(eq(credentialRecords.id, credentialId)))!;
    },
  };
}

/** ORDER BY per list sort; the holder name comes from the joined holders row. */
const LIST_ORDER: Record<ListSort, SQL[]> = {
  newest: [desc(credentialRecords.createdAt), desc(credentialRecords.id)],
  oldest: [asc(credentialRecords.createdAt), asc(credentialRecords.id)],
  expires: [asc(credentialRecords.expiresAt), asc(credentialRecords.id)],
  expires_desc: [desc(credentialRecords.expiresAt), desc(credentialRecords.id)],
  holder: [asc(holders.fullName), desc(credentialRecords.createdAt), asc(credentialRecords.id)],
  holder_desc: [
    desc(holders.fullName),
    desc(credentialRecords.createdAt),
    desc(credentialRecords.id),
  ],
};

/**
 * The list search: holder name or reference containing `q` (case-insensitive), or a credential
 * id starting with it. LIKE wildcards in `q` are escaped (backslash is PostgreSQL's default
 * LIKE escape), so "%" or "_" match themselves.
 */
function listSearchCondition(q: string): SQL {
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  return or(
    ilike(holders.fullName, `%${escaped}%`),
    ilike(holders.externalRef, `%${escaped}%`),
    sql`${credentialRecords.id}::text ilike ${`${escaped.toLowerCase()}%`}`,
  )!;
}

/** JSON with object keys sorted, so equal claims compare equal whatever their key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Claim names (top level, sorted) whose value differs, including added or removed claims. */
export function changedClaimNames(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): string[] {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((name) => stableJson(before[name]) !== stableJson(after[name]))
    .sort();
}

/** Related rows loaded with every credential's metadata. */
const STAFF_COLUMNS = { columns: { id: true, displayName: true } } as const;
const METADATA_RELATIONS = {
  holder: { columns: { id: true, externalRef: true, fullName: true } },
  createdBy: STAFF_COLUMNS,
  revokedBy: STAFF_COLUMNS,
  supersededBy: STAFF_COLUMNS,
  replacedBy: { columns: { id: true } },
} as const;

type RecordWithRelations = typeof credentialRecords.$inferSelect & {
  holder: { id: string; externalRef: string; fullName: string };
  createdBy: StaffRef | null;
  revokedBy: StaffRef | null;
  supersededBy: StaffRef | null;
  replacedBy: { id: string }[];
};

function toMetadata(row: RecordWithRelations, at: Date): CredentialMetadata {
  return {
    id: row.id,
    issuerId: row.issuerId,
    holder: row.holder,
    credentialType: row.credentialType,
    vct: row.vct,
    schemaVersion: row.schemaVersion,
    status: row.status,
    effectiveStatus: effectiveStatus(row, at),
    issuerKid: row.issuerKid,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
    statusUpdatedAt: row.statusUpdatedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocationReason: row.revocationReason,
    revokedBy: row.revokedBy ?? null,
    supersededAt: row.supersededAt?.toISOString() ?? null,
    supersededBy: row.supersededBy ?? null,
    replacesCredentialId: row.replacesCredentialId,
    replacedByCredentialId: row.replacedBy[0]?.id ?? null,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
