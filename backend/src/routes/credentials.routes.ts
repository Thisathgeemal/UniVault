import { Router } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';
import { EFFECTIVE_STATUSES } from '../services/credential-status.js';
import {
  REISSUE_REASONS,
  REVOCATION_REASONS,
  type CredentialsService,
} from '../services/credentials.service.js';
import { credentialIdParams, credentialTypeSchema } from './schemas.js';

// No issuerId: the issuer always comes from the logged-in staff member's token.
// credentialType is optional – it is derived from the issuer type and, if sent, must match.
export const issueCredentialBody = z.object({
  holderId: z.uuid('must be a UUID'),
  credentialType: credentialTypeSchema.optional(),
});

export const listCredentialsQuery = z.object({
  status: z.enum(['pending', 'valid', 'revoked', 'superseded']).optional(),
  // Computed status (credential-status.ts), e.g. ?effectiveStatus=expired
  effectiveStatus: z.enum(EFFECTIVE_STATUSES).optional(),
  holderId: z.uuid('must be a UUID').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** Optional free-text note: trimmed, at most 500 characters, an empty note counts as none. */
const noteSchema = z
  .string()
  .trim()
  .max(500, 'must be at most 500 characters')
  .optional()
  .transform((note) => (note ? note : undefined));

/** A note is required when the reason is 'other'. */
const requireNoteForOther = <T extends { reason: string; note?: string | undefined }>(
  body: T,
  ctx: z.RefinementCtx,
) => {
  if (body.reason === 'other' && !body.note) {
    ctx.addIssue({ code: 'custom', path: ['note'], message: "is required when reason is 'other'" });
  }
};

export const revokeCredentialBody = z
  .object({ reason: z.enum(REVOCATION_REASONS), note: noteSchema })

  .superRefine(requireNoteForOther);

export const reissueCredentialBody = z
  .object({
    reason: z.enum(REISSUE_REASONS),
    note: noteSchema,
    // Checked against the issuance expiry rules by the service (after today, not later than the cap)
    validUntil: z.iso.date('must be a date (YYYY-MM-DD)').optional(),
  })

  .superRefine(requireNoteForOther);

/**
 * /api/v1/credentials – issue, list, revoke and reissue (FR-ISS-01, FR-ISS-03). Requires login.
 *   POST /                         officer/admin – create a PENDING credential from a holder record
 *   GET  /                         list (status, effectiveStatus, holderId, paging) – metadata only
 *   GET  /:credentialId            one credential's metadata
 *   POST /:credentialId/revoke     admin – pending or valid → revoked; open offers invalidated
 *   POST /:credentialId/reissue    officer/admin – valid → superseded + new pending replacement
 *   GET  /:credentialId/events     status history, oldest first
 * Credentials are signed later, when the wallet redeems the offer (Sprint 2).
 * Every route is issuer-scoped: another issuer's credential is 404 CREDENTIAL_NOT_FOUND.
 * (requireOwnIssuer is not used: these paths have no :issuerId; the service scopes by req.auth.)
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
          action: 'create',
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

  router.get(
    '/:credentialId/events',
    auth.requireRole('officer', 'admin'),
    validate({ params: credentialIdParams }),
    async (req, res) => {
      res.json(await service().events(req.auth!, String(req.params.credentialId)));
    },
  );

  router.post(
    '/:credentialId/revoke',
    auth.requireRole('admin'),
    validate({ params: credentialIdParams, body: revokeCredentialBody }),
    async (req, res) => {
      const { params, body } = getValidated<{
        params: z.infer<typeof credentialIdParams>;
        body: z.infer<typeof revokeCredentialBody>;
      }>(res);
      const { credential, invalidatedOfferIds } = await service().revoke(
        req.auth!,
        params.credentialId,
        body,
      );
      // IDs, action and reason only – never claims or the note
      req.log?.info(
        {
          credentialId: credential.id,
          issuerId: credential.issuerId,
          staffId: req.auth?.id,
          action: 'revoke',
          reason: body.reason,
          invalidatedOfferIds,
        },
        'Credential revoked',
      );
      res.json(credential);
    },
  );

  router.post(
    '/:credentialId/reissue',
    auth.requireRole('officer', 'admin'),
    validate({ params: credentialIdParams, body: reissueCredentialBody }),
    async (req, res) => {
      const { params, body } = getValidated<{
        params: z.infer<typeof credentialIdParams>;
        body: z.infer<typeof reissueCredentialBody>;
      }>(res);
      const { credential, replaces, invalidatedOfferIds } = await service().reissue(
        req.auth!,
        params.credentialId,
        body,
      );
      req.log?.info(
        {
          credentialId: credential.id,
          replacesCredentialId: replaces.id,
          issuerId: credential.issuerId,
          staffId: req.auth?.id,
          action: 'reissue',
          reason: body.reason,
          invalidatedOfferIds,
        },
        'Credential reissued (old credential superseded)',
      );
      res.status(201).location(`${req.baseUrl}/${credential.id}`).json({ credential, replaces });
    },
  );

  return router;
}
