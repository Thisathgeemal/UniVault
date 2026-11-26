/**
 * Credential offers (backend /credential-offers, docs/api/credential-offers-api.md,
 * Decision 021).
 *
 * SECRET HANDLING: the create response is the ONLY place the one-time pre-authorised code
 * appears. createOffer() is called directly (never through TanStack Query: no query or
 * mutation cache ever holds it), and the caller keeps the result in component state only:
 * never in the URL, sessionStorage, localStorage or the console. The polled status
 * (fetchOffer) and cancelOffer() never contain the code, so they may be cached briefly.
 */
import { z } from 'zod';
import type { ApiClient } from './client.js';

const credentialType = z.enum(['EmploymentCredential', 'KYCCredential']);
const holder = z.object({ id: z.string(), fullName: z.string(), externalRef: z.string() });

export const OFFER_STATUSES = ['active', 'redeemed', 'expired', 'invalidated'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];
export const OFFER_INVALIDATION_REASONS = [
  'replaced',
  'cancelled',
  'credential_revoked',
  'credential_superseded',
] as const;
export type OfferInvalidationReason = (typeof OFFER_INVALIDATION_REASONS)[number];

const createdOfferSchema = z.object({
  offerId: z.string(),
  credentialId: z.string(),
  credentialType,
  holder,
  status: z.literal('active'),
  expiresAt: z.string(),
  expiresInSeconds: z.number(),
  serverTime: z.string(),
  /** The OpenID4VCI credential offer (contains the code). */
  credentialOffer: z.record(z.string(), z.unknown()),
  /** openid-credential-offer://?credential_offer=… – exactly what the QR code encodes. */
  qrContent: z.string(),
});
export type CreatedOffer = z.infer<typeof createdOfferSchema>;

export const offerDetailSchema = z.object({
  offerId: z.string(),
  credentialId: z.string(),
  credentialType,
  credentialStatus: z.enum(['pending', 'valid', 'revoked', 'superseded']),
  holder,
  status: z.enum(OFFER_STATUSES),
  createdAt: z.string(),
  expiresAt: z.string(),
  redeemedAt: z.string().nullable(),
  invalidatedAt: z.string().nullable(),
  invalidationReason: z.enum(OFFER_INVALIDATION_REASONS).nullable(),
  serverTime: z.string(),
});
export type OfferDetail = z.infer<typeof offerDetailSchema>;

/**
 * The difference between the server's clock and this browser's (ms; add it to Date.now()).
 * The server time is compared with the middle of the request, so network delay counts half.
 */
export function measureClockOffset(serverTime: string, sentAt: number, receivedAt: number): number {
  return Date.parse(serverTime) - (sentAt + receivedAt) / 2;
}

/** A value from the server and the clock offset measured with it. */
export interface Timed<T> {
  value: T;
  offsetMs: number;
}

async function timed<T>(call: () => Promise<T & { serverTime: string }>): Promise<Timed<T>> {
  const sentAt = Date.now();
  const value = await call();
  return { value, offsetMs: measureClockOffset(value.serverTime, sentAt, Date.now()) };
}

/** POST /credential-offers. Holds the one-time code: keep the result in memory only. */
export function createOffer(api: ApiClient, credentialId: string): Promise<Timed<CreatedOffer>> {
  return timed(async () =>
    createdOfferSchema.parse(
      await api.request<unknown>('/credential-offers', {
        method: 'POST',
        body: { credentialId },
      }),
    ),
  );
}

/** Every offer query starts with this key, so leaving the page can remove them all. */
export const OFFER_QUERY_ROOT = ['credential-offers'] as const;
export const offerQueryKey = (offerId: string) => [...OFFER_QUERY_ROOT, offerId] as const;

/** GET /credential-offers/:offerId – the status the portal polls (never the code). */
export function fetchOffer(
  api: ApiClient,
  offerId: string,
  signal?: AbortSignal,
): Promise<Timed<OfferDetail>> {
  return timed(async () =>
    offerDetailSchema.parse(
      await api.request<unknown>(
        `/credential-offers/${encodeURIComponent(offerId)}`,
        signal ? { signal } : {},
      ),
    ),
  );
}

/** POST /credential-offers/:offerId/cancel (409 OFFER_NOT_ACTIVE if it already ended). */
export function cancelOffer(api: ApiClient, offerId: string): Promise<Timed<OfferDetail>> {
  return timed(async () =>
    offerDetailSchema.parse(
      await api.request<unknown>(`/credential-offers/${encodeURIComponent(offerId)}/cancel`, {
        method: 'POST',
      }),
    ),
  );
}

/**
 * What the offer screen shows, from the server's status (authoritative) and the local
 * countdown: 'expired' as soon as either says so, unless the server reports a final state.
 */
export type OfferView = 'active' | 'redeemed' | 'replaced' | 'cancelled' | 'withdrawn' | 'expired';

export function offerView(
  status: OfferStatus,
  reason: OfferInvalidationReason | null,
  secondsLeft: number,
): OfferView {
  if (status === 'redeemed') return 'redeemed';
  if (status === 'invalidated') {
    if (reason === 'cancelled') return 'cancelled';
    if (reason === 'credential_revoked' || reason === 'credential_superseded') return 'withdrawn';
    return 'replaced';
  }
  if (status === 'expired' || secondsLeft <= 0) return 'expired';
  return 'active';
}

/** Server states after which nothing can change: polling stops. */
export const isFinalStatus = (status: OfferStatus) => status !== 'active';
