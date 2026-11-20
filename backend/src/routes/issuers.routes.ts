import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { issuerIdParams } from './schemas.js';

/**
 * /api/v1/issuers – issuer organisations and their public keys (FR-ISS-02).
 * Reading public keys is open to everyone (verifiers need them); changing keys is admin-only.
 */
export function issuersRouter(auth: AuthMiddleware): Router {
  const router = Router();
  router.get('/', () => {
    throw notImplemented('Sprint 1 – issuer key management');
  });
  // Public RS256 keys (JWKS) used by verifiers to check credential signatures
  router.get('/:issuerId/keys', validate({ params: issuerIdParams }), () => {
    throw notImplemented('Sprint 1 – issuer key management');
  });
  // Generate / rotate the issuer's signing key – admins of that issuer only
  router.post(
    '/:issuerId/keys',
    auth.requireAuth,
    auth.requireRole('admin'),
    validate({ params: issuerIdParams }),
    auth.requireOwnIssuer,
    () => {
      throw notImplemented('Sprint 1 – issuer key management');
    },
  );
  return router;
}
