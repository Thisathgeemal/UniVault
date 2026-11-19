import { Router } from 'express';
import { notImplemented } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import { verificationIdParams } from './schemas.js';

/** /api/v1/verifications – verification sessions (FR-VER-01 to FR-VER-04). */
export function verificationsRouter(): Router {
  const router = Router();
  const planned = () => {
    throw notImplemented('Sprint 3 – verification');
  };
  router.post('/', planned);
  router.get('/:verificationId/request', validate({ params: verificationIdParams }), planned);
  router.post('/:verificationId/response', validate({ params: verificationIdParams }), planned);
  router.get('/:verificationId/result', validate({ params: verificationIdParams }), planned);
  return router;
}
