import { Router } from 'express';
import { z } from 'zod';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';

export const createHolderBody = z.object({
  issuerId: z.string().min(3),
  recordType: z.enum(['employee', 'customer']),
  claims: z.record(z.string(), z.unknown()),
});

export const listHoldersQuery = z.object({
  search: z.string().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** /api/v1/holders – holder records managed by issuer staff (issuer portal). */
export function holdersRouter(): Router {
  const router = Router();
  router.get('/', validate({ query: listHoldersQuery }), () => {
    throw notImplemented('Sprint 1 – holder records');
  });
  router.post('/', validate({ body: createHolderBody }), () => {
    throw notImplemented('Sprint 1 – holder records');
  });
  return router;
}
