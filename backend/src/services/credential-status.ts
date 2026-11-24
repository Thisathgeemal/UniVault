/**
 * Credential status (FR-BAK-01, Decision 013).
 *
 * effectiveStatus() is the ONE place that decides what a credential's status means at a
 * given moment. It is used by the public status endpoint (GET /api/v1/status/:id) and by
 * the issuer portal's credential metadata (GET /credentials, GET /credentials/:id), so the
 * two can never disagree.
 *
 * 'expired' is computed, never stored: the database keeps the stored status ('valid') and
 * expires_at, and nothing writes 'expired'.
 */
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { credentialRecords } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

/** Statuses stored in credential_records.status. */
export type CredentialStatus = 'pending' | 'valid' | 'revoked' | 'superseded';

/** The stored status, or 'expired' for a valid credential whose expiry has passed. */
export type EffectiveStatus = CredentialStatus | 'expired';

export const EFFECTIVE_STATUSES = ['pending', 'valid', 'revoked', 'superseded', 'expired'] as const;

/**
 * Pure: the status of a credential at `now`.
 *
 * Precedence: revoked > superseded > expired > valid. A credential is expired when
 * now >= expiresAt (the expiry instant itself is already expired, matching the JWT `exp`
 * rule). 'pending' stays 'pending': it was never issued to a wallet, so it has no public
 * status (the status endpoint answers 404 for it).
 */
export function effectiveStatus(
  record: { status: CredentialStatus; expiresAt: Date },
  now: Date,
): EffectiveStatus {
  if (record.status === 'revoked' || record.status === 'superseded') return record.status;
  if (record.status === 'pending') return 'pending';
  return now.getTime() >= record.expiresAt.getTime() ? 'expired' : 'valid';
}

/** The public status response. Exactly these four keys; nothing else is ever returned. */
export interface PublicCredentialStatus {
  credentialId: string;
  status: Exclude<EffectiveStatus, 'pending'>;
  expiresAt: string;
  checkedAt: string;
}

export interface CredentialStatusService {
  /**
   * Public status of a SIGNED credential (issued_at set). Unknown ids and credentials that were
   * never signed – pending, or revoked while pending – get the same 404.
   */
  lookup(credentialId: string): Promise<PublicCredentialStatus>;
}

/** One error object shape for "unknown" and "never signed", so they cannot be told apart. */
export const credentialStatusNotFound = () =>
  new AppError(404, 'CREDENTIAL_STATUS_NOT_FOUND', 'No status is available for this credential');

export function createCredentialStatusService(
  db: Pick<Db, 'select'>,
  options: { now?: () => Date } = {},
): CredentialStatusService {
  const now = options.now ?? (() => new Date());
  return {
    async lookup(credentialId) {
      // One indexed primary-key query for every request, whatever the outcome: unknown and
      // never-signed credentials follow the same path and throw the same error
      const [row] = await db
        .select({
          status: credentialRecords.status,
          expiresAt: credentialRecords.expiresAt,
          issuedAt: credentialRecords.issuedAt,
        })
        .from(credentialRecords)
        .where(eq(credentialRecords.id, credentialId));
      const checkedAt = now();
      // Visibility rule: only a credential that was signed (issued_at, set by signCredential at
      // redemption) ever reached a wallet, so only it has a public status. A credential revoked
      // while pending is 'revoked' for the issuer (effectiveStatus is unchanged) but hidden here.
      const visible = row !== undefined && row.issuedAt !== null;
      const status = visible ? effectiveStatus(row, checkedAt) : 'pending';
      if (!visible || status === 'pending') throw credentialStatusNotFound();
      return {
        credentialId,
        status,
        expiresAt: row.expiresAt.toISOString(),
        checkedAt: checkedAt.toISOString(),
      };
    },
  };
}
