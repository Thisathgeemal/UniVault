import { Router } from 'express';
import { z } from 'zod';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';
import { HOLDER_SORTS, type HoldersService } from '../services/holders.service.js';

// No issuerId or recordType: both come from the logged-in staff member's issuer.
// Claims are checked in detail against the credential schema by the service.
export const createHolderBody = z.object({
  externalRef: z.string().trim().min(1).max(30).optional(),
  claims: z.record(z.string(), z.unknown()),
});

export const listHoldersQuery = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  sort: z.enum(HOLDER_SORTS).default('newest'),
});

export const holderIdParams = z.object({ holderId: z.uuid('must be a UUID') });

/**
 * /api/v1/holders – the issuer's employee / customer records (issuer portal). Requires login.
 *   POST /             create a holder record (claims validated against the credential schema)
 *   GET  /             list (search, paging) – summaries only, no personal claims
 *   GET  /:holderId    one record with its full claims
 */
export function holdersRouter(auth: AuthMiddleware, holders?: HoldersService): Router {
  const router = Router();
  router.use(auth.requireAuth);
  const service = () => {
    if (!holders) throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Holder service is not available');
    return holders;
  };

  router.get('/', validate({ query: listHoldersQuery }), async (req, res) => {
    const { query } = getValidated<{ query: z.infer<typeof listHoldersQuery> }>(res);
    res.json(await service().list(req.auth!, query));
  });

  router.post('/', validate({ body: createHolderBody }), async (req, res) => {
    const { body } = getValidated<{ body: z.infer<typeof createHolderBody> }>(res);
    const holder = await service().create(req.auth!, body);
    // Log identifiers only – never the holder's personal claims
    req.log?.info(
      { holderId: holder.id, issuerId: holder.issuerId, staffId: req.auth?.id },
      'Holder record created',
    );
    res.status(201).location(`${req.baseUrl}/${holder.id}`).json(holder);
  });

  router.get('/:holderId', validate({ params: holderIdParams }), async (req, res) => {
    res.json(await service().get(req.auth!, String(req.params.holderId)));
  });

  return router;
}
