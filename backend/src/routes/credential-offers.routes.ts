import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';

export const createOfferBody = z.object({
  credentialId: z.uuid(),
});

/** /api/v1/credential-offers – pre-authorised offers shown as QR codes (FR-ISS-01). */
export function credentialOffersRouter(auth: AuthMiddleware): Router {
  const router = Router();
  // Staff create offers (login required); the wallet endpoints below use the pre-authorised code instead
  router.post('/', auth.requireAuth, validate({ body: createOfferBody }), () => {
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
