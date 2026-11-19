import { Router } from 'express';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';

export const createOfferBody = z.object({
  credentialId: z.uuid(),
});

/** /api/v1/credential-offers – pre-authorised offers shown as QR codes (FR-ISS-01). */
export function credentialOffersRouter(): Router {
  const router = Router();
  router.post('/', validate({ body: createOfferBody }), () => {
    throw notImplemented('Sprint 1 – credential offers');
  });
  // Wallet redeems the pre-authorised code and receives the credential
  router.post('/token', () => {
    throw notImplemented('Sprint 2 – wallet issuance');
  });
  router.post('/credential', () => {
    throw notImplemented('Sprint 2 – wallet issuance');
  });
  return router;
}
