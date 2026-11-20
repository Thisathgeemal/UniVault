import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';

// No issuerId: the issuer always comes from the logged-in staff member's token
export const createHolderBody = z.object({
  recordType: z.enum(['employee', 'customer']),
  claims: z.record(z.string(), z.unknown()),
});

export const listHoldersQuery = z.object({
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** /api/v1/holders – holder records managed by issuer staff (issuer portal). Requires login. */
export function holdersRouter(auth: AuthMiddleware): Router {
  const router = Router();
  router.use(auth.requireAuth);
  router.get('/', validate({ query: listHoldersQuery }), () => {
    throw notImplemented('Sprint 1 – holder records');
  });
  router.post('/', validate({ body: createHolderBody }), () => {
    throw notImplemented('Sprint 1 – holder records');
  });
  return router;
}
