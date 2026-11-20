import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { credentialIdParams, credentialTypeSchema } from './schemas.js';

// No issuerId: the issuer always comes from the logged-in staff member's token
export const issueCredentialBody = z.object({
  holderId: z.string().min(1),
  credentialType: credentialTypeSchema,
});

export const revokeCredentialBody = z.object({
  reason: z.string().min(3).max(200),
});

/**
 * /api/v1/credentials – issue, revoke and reissue (FR-ISS-01, FR-ISS-03). Requires login.
 * Officers and admins can issue and reissue; only admins can revoke.
 */
export function credentialsRouter(auth: AuthMiddleware): Router {
  const router = Router();
  router.use(auth.requireAuth);
  router.post('/', validate({ body: issueCredentialBody }), () => {
    throw notImplemented('Sprint 1 – credential issuance');
  });
  router.post(
    '/:credentialId/revoke',
    auth.requireRole('admin'),
    validate({ params: credentialIdParams, body: revokeCredentialBody }),
    () => {
      throw notImplemented('Sprint 1 – revoke and reissue');
    },
  );
  router.post('/:credentialId/reissue', validate({ params: credentialIdParams }), () => {
    throw notImplemented('Sprint 1 – revoke and reissue');
  });
  return router;
}
