/** Offer screen settings (CredentialOfferPage). */

/** How often the status is polled while the offer is active. */
export const OFFER_POLL_INTERVAL_MS = 5000;
/** The countdown turns amber (and a hint appears) in the last minute. */
export const LAST_MINUTE_SECONDS = 60;

/*
 * The developer panel (decoded credential_offer, with the one-time code) is for development
 * builds only. CredentialOfferPage tests import.meta.env.PROD INLINE at the render site: Vite
 * replaces it with true in production builds, so the minifier removes the panel and its
 * component from the bundle (scripts/check-production-bundle.mjs checks this).
 */
