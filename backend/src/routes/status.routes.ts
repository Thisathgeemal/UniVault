import { Router } from 'express';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { credentialIdParams } from './schemas.js';

/** /api/v1/status – credential status (valid / revoked / superseded) for FR-BAK-01. */
export function statusRouter(): Router {
  const router = Router();
  router.get('/:credentialId', validate({ params: credentialIdParams }), () => {
    throw notImplemented('Sprint 1 – revocation status');
  });
  return router;
}
