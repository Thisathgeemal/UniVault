import { Router } from 'express';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { issuerIdParams } from './schemas.js';

/** /api/v1/issuers – issuer organisations and their public keys (FR-ISS-02). */
export function issuersRouter(): Router {
  const router = Router();
  router.get('/', () => {
    throw notImplemented('Sprint 1 – issuer key management');
  });
  // Public RS256 keys (JWKS) used by verifiers to check credential signatures
  router.get('/:issuerId/keys', validate({ params: issuerIdParams }), () => {
    throw notImplemented('Sprint 1 – issuer key management');
  });
  return router;
}
