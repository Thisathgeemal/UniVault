import { Router } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError, notImplemented } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';
import type { CredentialOffersService } from '../services/credential-offers.service.js';

export const createOfferBody = z.object({
  credentialId: z.uuid('must be a UUID'),
});

export const offerIdParams = z.object({ offerId: z.uuid('must be a UUID') });

/**
 * /api/v1/credential-offers – pre-authorised offers shown as QR codes (FR-ISS-01).
 *   POST /             officer/admin – create a one-time offer for a pending credential
 *   GET  /:offerId     offer status for the portal to poll (never the code)
 *   POST /token, /credential   wallet redemption with the pre-authorised code (Sprint 2)
 */
export function credentialOffersRouter(
  auth: AuthMiddleware,
  offers?: CredentialOffersService,
): Router {
  const router = Router();
  const service = () => {
    if (!offers)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Credential offer service is not available');
    return offers;
  };

  router.post(
    '/',
    auth.requireAuth,
    auth.requireRole('officer', 'admin'),
    validate({ body: createOfferBody }),
    async (req, res) => {
      const { body } = getValidated<{ body: z.infer<typeof createOfferBody> }>(res);
      const { invalidatedOfferIds, ...offer } = await service().createOffer(
        req.auth!,
        body.credentialId,
      );
      // Log identifiers only – never the pre-authorised code
      req.log?.info(
        {
          offerId: offer.offerId,
          credentialId: offer.credentialId,
          issuerId: req.auth?.issuer.id,
          staffId: req.auth?.id,
          invalidatedOfferIds,
        },
        'Credential offer created',
      );
      // The response carries a one-time secret: no browser or proxy may keep a copy
      res
        .status(201)
        .location(`${req.baseUrl}/${offer.offerId}`)
        .set('Cache-Control', 'no-store')
        .json(offer);
    },
  );

  router.get(
    '/:offerId',
    auth.requireAuth,
    validate({ params: offerIdParams }),
    async (req, res) => {
      const offer = await service().getOffer(req.auth!, String(req.params.offerId));
      res.set('Cache-Control', 'no-store').json(offer); // polled: always fresh
    },
  );

  // Wallet redeems the pre-authorised code and receives the credential (Sprint 2).
  // Redemption will use findOfferByCode() and signCredential().
  router.post('/token', () => {
    throw notImplemented('Sprint 2 – wallet issuance');
  });
  router.post('/credential', () => {
    throw notImplemented('Sprint 2 – wallet issuance');
  });
  return router;
}
