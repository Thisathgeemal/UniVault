import { Router } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError, notImplemented } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';
import type { CredentialsService } from '../services/credentials.service.js';
import { credentialIdParams, credentialTypeSchema } from './schemas.js';

// No issuerId: the issuer always comes from the logged-in staff member's token.
// credentialType is optional – it is derived from the issuer type and, if sent, must match.
export const issueCredentialBody = z.object({
  holderId: z.uuid('must be a UUID'),
  credentialType: credentialTypeSchema.optional(),
});

export const listCredentialsQuery = z.object({
  status: z.enum(['pending', 'valid', 'revoked', 'superseded']).optional(),
  holderId: z.uuid('must be a UUID').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

export const revokeCredentialBody = z.object({
  reason: z.string().min(3).max(200),
});

/**
 * /api/v1/credentials – issue, list, revoke and reissue (FR-ISS-01, FR-ISS-03). Requires login.
 *   POST /                       officer/admin – create a PENDING credential from a holder record
 *   GET  /                       list (status, holderId, paging) – metadata only
 *   GET  /:credentialId          one credential's metadata
 * Credentials are signed later, when the wallet redeems the offer (Sprint 2).
 * Officers and admins can issue and reissue; only admins can revoke.
 */
export function credentialsRouter(auth: AuthMiddleware, credentials?: CredentialsService): Router {
  const router = Router();
  router.use(auth.requireAuth);
  const service = () => {
    if (!credentials)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Credential service is not available');
    return credentials;
  };

  router.post(
    '/',
    auth.requireRole('officer', 'admin'),
    validate({ body: issueCredentialBody }),
    async (req, res) => {
      const { body } = getValidated<{ body: z.infer<typeof issueCredentialBody> }>(res);
      const credential = await service().create(req.auth!, body);
      // Log identifiers only – never claims
      req.log?.info(
        {
          credentialId: credential.id,
          holderId: credential.holder.id,
          issuerId: credential.issuerId,
          staffId: req.auth?.id,
        },
        'Pending credential created',
      );
      res.status(201).location(`${req.baseUrl}/${credential.id}`).json(credential);
    },
  );

  router.get('/', validate({ query: listCredentialsQuery }), async (req, res) => {
    const { query } = getValidated<{ query: z.infer<typeof listCredentialsQuery> }>(res);
    res.json(await service().list(req.auth!, query));
  });

  router.get('/:credentialId', validate({ params: credentialIdParams }), async (req, res) => {
    res.json(await service().get(req.auth!, String(req.params.credentialId)));
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
