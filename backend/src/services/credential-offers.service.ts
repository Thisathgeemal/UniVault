/**
 * Pre-authorised credential offers (FR-ISS-01).
 *
 * Issuer staff turn a PENDING credential into a one-time offer, shown as a QR
 * code in the issuer portal. The QR carries an OpenID4VCI credential offer with
 * a pre-authorised code; in Sprint 2 the wallet redeems that code
 * (POST /credential-offers/token + /credential), and redemption calls
 * signCredential() with the wallet's key.
 *
 * Security rules:
 * - The code is 256 random bits (base64url, 43 characters). Only its SHA-256
 *   hash is stored; the plain code is returned once, in the create response,
 *   and is never stored, logged or returned again.
 * - Offers expire after CREDENTIAL_OFFER_TTL_SECONDS (and never outlive the credential).
 * - Only ONE usable offer per credential: creating a new offer invalidates any
 *   earlier offer that is still usable.
 * - Codes are looked up by their hash (findOfferByCode), never compared in plain text.
 */
import { randomBytes } from 'node:crypto';
import { sha256Hasher } from '@univault/crypto-core';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { StaffProfile } from '../auth/auth-service.js';
import type { Db } from '../db/client.js';
import { credentialOffers, credentialRecords, holders, issuerStaff } from '../db/schema.js';
import { AppError } from '../lib/errors.js';
import type { CredentialTypeName } from './credential-schemas.js';
import { credentialNotFound, type CredentialStatus } from './credentials.service.js';

/** OpenID4VCI grant type for pre-authorised codes. */
export const PRE_AUTHORIZED_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';
/** URI scheme a wallet registers for OpenID4VCI credential offers. */
export const CREDENTIAL_OFFER_URI_PREFIX = 'openid-credential-offer://?credential_offer=';

const CODE_BYTES = 32; // 256 bits
const CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type OfferStatus = 'active' | 'redeemed' | 'expired' | 'invalidated';

/**
 * Why an invalidated offer stopped working (migration 0008, Decision 021). Set exactly when
 * invalidatedAt is: 'replaced' = a newer offer for the same credential, 'cancelled' = staff
 * cancelled it, 'credential_revoked' / 'credential_superseded' = its credential was revoked /
 * reissued.
 */
export const OFFER_INVALIDATION_REASONS = [
  'replaced',
  'cancelled',
  'credential_revoked',
  'credential_superseded',
] as const;
export type OfferInvalidationReason = (typeof OFFER_INVALIDATION_REASONS)[number];

/** OpenID4VCI credential offer object (pre-authorised code flow). */
export interface CredentialOfferPayload {
  credential_issuer: string;
  credential_configuration_ids: CredentialTypeName[];
  grants: {
    [PRE_AUTHORIZED_CODE_GRANT]: { 'pre-authorized_code': string };
  };
}

export interface OfferHolder {
  id: string;
  fullName: string;
  externalRef: string;
}

/** The create response. The ONLY place the plain code ever appears. */
export interface CreatedOffer {
  offerId: string;
  credentialId: string;
  credentialType: CredentialTypeName;
  holder: OfferHolder;
  status: 'active';
  expiresAt: string;
  expiresInSeconds: number;
  /** The server's clock when the offer was created (ISO), so the portal can correct for skew. */
  serverTime: string;
  credentialOffer: CredentialOfferPayload;
  qrContent: string;
  /** Earlier offers this one replaced (for logging; not part of the response). */
  invalidatedOfferIds: string[];
}

/** Offer metadata for the portal (polled). Never contains the code or its hash. */
export interface OfferDetail {
  offerId: string;
  credentialId: string;
  credentialType: CredentialTypeName;
  credentialStatus: CredentialStatus;
  holder: OfferHolder;
  status: OfferStatus;
  createdAt: string;
  expiresAt: string;
  redeemedAt: string | null;
  invalidatedAt: string | null;
  /** Set exactly when status is 'invalidated'. */
  invalidationReason: OfferInvalidationReason | null;
  createdBy: { id: string; displayName: string } | null;
  /** The server's clock when this answer was made (ISO), for the portal's skew correction. */
  serverTime: string;
}

/** What redemption (Sprint 2) needs to know about an offer found by its code. No hash. */
export interface OfferForRedemption {
  offerId: string;
  credentialId: string;
  issuerId: string;
  /**
   * 'active' only if the offer is usable AND its credential is still pending. Revoking or
   * reissuing invalidates open offers; this check is the second line of defence.
   */
  status: OfferStatus;
  credentialStatus: CredentialStatus;
  expiresAt: Date;
  redeemedAt: Date | null;
  invalidatedAt: Date | null;
  failedAttempts: number;
}

export interface CredentialOffersService {
  createOffer(staff: StaffProfile, credentialId: string): Promise<CreatedOffer>;
  getOffer(staff: StaffProfile, offerId: string): Promise<OfferDetail>;
  /**
   * Cancels an ACTIVE offer of the staff member's issuer (404 otherwise; 409 OFFER_NOT_ACTIVE
   * if it is redeemed, expired or already invalidated). Its code stops working at once.
   */
  cancelOffer(staff: StaffProfile, offerId: string): Promise<OfferDetail>;
  /** Hashes the code and looks the offer up by hash. Null for an unknown or malformed code. */
  findOfferByCode(code: unknown): Promise<OfferForRedemption | null>;
}

export interface CredentialOffersServiceOptions {
  ttlSeconds: number;
  publicBaseUrl: string;
  now?: () => Date;
}

export const offerNotFound = () =>
  new AppError(404, 'OFFER_NOT_FOUND', 'Credential offer not found');

type Executor = Pick<Db, 'select' | 'update'>;

/** Base64url SHA-256 of a pre-authorised code – the only form that is stored. */
export function hashPreAuthorizedCode(code: string): string {
  return Buffer.from(sha256Hasher(code)).toString('base64url');
}

/** Status of an offer at a given time. Redeemed wins over everything; then invalidated; then expired. */
export function offerStatus(
  offer: { redeemedAt: Date | null; invalidatedAt: Date | null; expiresAt: Date },
  at: Date,
): OfferStatus {
  if (offer.redeemedAt) return 'redeemed';
  if (offer.invalidatedAt) return 'invalidated';
  if (offer.expiresAt <= at) return 'expired';
  return 'active';
}

export function createCredentialOffersService(
  db: Db,
  options: CredentialOffersServiceOptions,
): CredentialOffersService {
  const now = options.now ?? (() => new Date());
  const baseUrl = options.publicBaseUrl.replace(/\/+$/, '');

  /** One offer of the staff member's issuer as the portal sees it (404 for any other). */
  const readOffer = async (
    executor: Executor,
    staff: StaffProfile,
    offerId: string,
    at: Date = now(),
  ): Promise<OfferDetail> => {
    const [row] = await executor
      .select({
        offerId: credentialOffers.id,
        createdAt: credentialOffers.createdAt,
        expiresAt: credentialOffers.expiresAt,
        redeemedAt: credentialOffers.redeemedAt,
        invalidatedAt: credentialOffers.invalidatedAt,
        invalidationReason: credentialOffers.invalidationReason,
        createdById: issuerStaff.id,
        createdByName: issuerStaff.displayName,
        credentialId: credentialRecords.id,
        credentialType: credentialRecords.credentialType,
        credentialStatus: credentialRecords.status,
        holderId: holders.id,
        holderName: holders.fullName,
        holderRef: holders.externalRef,
      })
      .from(credentialOffers)
      .innerJoin(credentialRecords, eq(credentialRecords.id, credentialOffers.credentialId))
      .innerJoin(holders, eq(holders.id, credentialRecords.holderId))
      .leftJoin(issuerStaff, eq(issuerStaff.id, credentialOffers.createdByStaffId))
      .where(
        and(eq(credentialOffers.id, offerId), eq(credentialRecords.issuerId, staff.issuer.id)),
      );
    if (!row) throw offerNotFound();

    const status = offerStatus(row, at);
    return {
      offerId: row.offerId,
      credentialId: row.credentialId,
      credentialType: row.credentialType,
      credentialStatus: row.credentialStatus,
      holder: { id: row.holderId, fullName: row.holderName, externalRef: row.holderRef },
      status,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      redeemedAt: row.redeemedAt?.toISOString() ?? null,
      invalidatedAt: row.invalidatedAt?.toISOString() ?? null,
      // The 0008 CHECK guarantees a reason for every invalidated row
      invalidationReason:
        status === 'invalidated' ? (row.invalidationReason as OfferInvalidationReason) : null,
      createdBy:
        row.createdById && row.createdByName
          ? { id: row.createdById, displayName: row.createdByName }
          : null,
      serverTime: at.toISOString(),
    };
  };

  return {
    async createOffer(staff, credentialId) {
      const createdAt = now();
      const code = randomBytes(CODE_BYTES).toString('base64url');

      const result = await db.transaction(async (tx) => {
        // Lock the credential row: simultaneous offers for one credential are serialised,
        // so "one usable offer per credential" holds
        const [credential] = await tx
          .select()
          .from(credentialRecords)
          .where(
            and(
              eq(credentialRecords.id, credentialId),
              eq(credentialRecords.issuerId, staff.issuer.id), // issuer scope
            ),
          )
          .for('update');
        if (!credential) throw credentialNotFound();
        if (credential.status !== 'pending') {
          throw new AppError(
            409,
            'CREDENTIAL_NOT_PENDING',
            `Only a pending credential can be offered (this one is ${credential.status})`,
          );
        }
        if (credential.expiresAt <= createdAt) {
          throw new AppError(409, 'CREDENTIAL_EXPIRED', 'This credential has expired');
        }

        const [holder] = await tx
          .select({ id: holders.id, fullName: holders.fullName, externalRef: holders.externalRef })
          .from(holders)
          .where(eq(holders.id, credential.holderId));

        // An offer never outlives the credential it is for
        const ttlExpiry = new Date(createdAt.getTime() + options.ttlSeconds * 1000);
        const expiresAt = credential.expiresAt < ttlExpiry ? credential.expiresAt : ttlExpiry;

        // Only one usable offer per credential: invalidate earlier ones that could still be redeemed
        const invalidated = await tx
          .update(credentialOffers)
          .set({ invalidatedAt: createdAt, invalidationReason: 'replaced' })
          .where(
            and(
              eq(credentialOffers.credentialId, credential.id),
              isNull(credentialOffers.redeemedAt),
              isNull(credentialOffers.invalidatedAt),
              gt(credentialOffers.expiresAt, createdAt),
            ),
          )
          .returning({ id: credentialOffers.id });

        const [offer] = await tx
          .insert(credentialOffers)
          .values({
            credentialId: credential.id,
            preAuthorizedCodeHash: hashPreAuthorizedCode(code),
            expiresAt,
            createdByStaffId: staff.id,
            createdAt,
          })
          .returning({ id: credentialOffers.id });

        return {
          offerId: offer!.id,
          credential,
          holder: holder!,
          expiresAt,
          invalidatedOfferIds: invalidated.map((o) => o.id),
        };
      });

      const credentialOffer: CredentialOfferPayload = {
        credential_issuer: `${baseUrl}/api/v1/issuers/${result.credential.issuerId}`,
        credential_configuration_ids: [result.credential.credentialType],
        grants: { [PRE_AUTHORIZED_CODE_GRANT]: { 'pre-authorized_code': code } },
      };
      return {
        offerId: result.offerId,
        credentialId: result.credential.id,
        credentialType: result.credential.credentialType,
        holder: result.holder,
        status: 'active',
        expiresAt: result.expiresAt.toISOString(),
        expiresInSeconds: Math.round((result.expiresAt.getTime() - createdAt.getTime()) / 1000),
        serverTime: createdAt.toISOString(),
        credentialOffer,
        qrContent:
          CREDENTIAL_OFFER_URI_PREFIX + encodeURIComponent(JSON.stringify(credentialOffer)),
        invalidatedOfferIds: result.invalidatedOfferIds,
      };
    },

    getOffer: (staff, offerId) => readOffer(db, staff, offerId),

    async cancelOffer(staff, offerId) {
      return db.transaction(async (tx) => {
        // Lock the offer and its credential (as createOffer does), so a cancel and a new
        // offer for the same credential are serialised
        const [row] = await tx
          .select({
            id: credentialOffers.id,
            expiresAt: credentialOffers.expiresAt,
            redeemedAt: credentialOffers.redeemedAt,
            invalidatedAt: credentialOffers.invalidatedAt,
          })
          .from(credentialOffers)
          .innerJoin(credentialRecords, eq(credentialRecords.id, credentialOffers.credentialId))
          .where(
            and(eq(credentialOffers.id, offerId), eq(credentialRecords.issuerId, staff.issuer.id)),
          )
          .for('update');
        if (!row) throw offerNotFound();
        const at = now();
        const status = offerStatus(row, at);
        if (status !== 'active') {
          throw new AppError(
            409,
            'OFFER_NOT_ACTIVE',
            `Only an active offer can be cancelled (this one is ${status})`,
            { status },
          );
        }
        await tx
          .update(credentialOffers)
          .set({ invalidatedAt: at, invalidationReason: 'cancelled' })
          .where(eq(credentialOffers.id, row.id));
        return readOffer(tx, staff, offerId, at);
      });
    },

    async findOfferByCode(code) {
      if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
      // Look up by hash: the plain code is never stored, so it is never compared
      const [row] = await db
        .select({
          offerId: credentialOffers.id,
          credentialId: credentialOffers.credentialId,
          issuerId: credentialRecords.issuerId,
          credentialStatus: credentialRecords.status,
          expiresAt: credentialOffers.expiresAt,
          redeemedAt: credentialOffers.redeemedAt,
          invalidatedAt: credentialOffers.invalidatedAt,
          failedAttempts: credentialOffers.failedAttempts,
        })
        .from(credentialOffers)
        .innerJoin(credentialRecords, eq(credentialRecords.id, credentialOffers.credentialId))
        .where(eq(credentialOffers.preAuthorizedCodeHash, hashPreAuthorizedCode(code)));
      if (!row) return null;
      const status = offerStatus(row, now());
      // An offer for a credential that is no longer pending can never be redeemed
      return {
        ...row,
        status: status === 'active' && row.credentialStatus !== 'pending' ? 'invalidated' : status,
      };
    },
  };
}
