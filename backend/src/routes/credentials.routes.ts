import { Router } from 'express';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { credentialIdParams, credentialTypeSchema } from './schemas.js';

export const issueCredentialBody = z.object({
  issuerId: z.string().min(3),
  holderId: z.string().min(1),
  credentialType: credentialTypeSchema,
});

export const revokeCredentialBody = z.object({
  reason: z.string().min(3).max(200),
});

/** /api/v1/credentials – issue, revoke and reissue (FR-ISS-01, FR-ISS-03). */
export function credentialsRouter(): Router {
  const router = Router();
  router.post('/', validate({ body: issueCredentialBody }), () => {
    throw notImplemented('Sprint 1 – credential issuance');
  });
  router.post(
    '/:credentialId/revoke',
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
