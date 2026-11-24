import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { z } from 'zod';
import { AppError } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';
import type { CredentialStatusService } from '../services/credential-status.js';
import { credentialIdParams } from './schemas.js';

/** Client errors of the status route are logged at this level by the error handler. */
export const QUIET_LOG_LEVEL = 'debug';

/** What logs show instead of the full URL of a status request (no credential id). */
export const STATUS_ROUTE_TEMPLATE = '/api/v1/status/:credentialId';

/**
 * /api/v1/status – PUBLIC credential status for verifiers and wallets (FR-BAK-01, Decision 013).
 *
 *   GET /:credentialId  →  { credentialId, status, expiresAt, checkedAt }
 *
 * - No login. CORS allows any origin for GET on this route only (app.ts).
 * - Only SIGNED credentials (issued_at set) have a public status. Unknown ids and credentials
 *   that were never signed (pending, or revoked while pending) give the same
 *   404 CREDENTIAL_STATUS_NOT_FOUND.
 * - Logs show the route template /api/v1/status/:credentialId, never the full URL (app.ts).
 * - Rate limited per client IP (STATUS_RATE_LIMIT_MAX per STATUS_RATE_LIMIT_WINDOW_MINUTES).
 * - Cache-Control: no-store on every response (a revocation must be seen at once).
 * - Lookups are logged at DEBUG level only (credential id and result, never the IP) and are
 *   never stored.
 */
export function statusRouter(deps: {
  status?: CredentialStatusService;
  rateLimit: { max: number; windowMinutes: number };
}): Router {
  const router = Router();

  const noStore: RequestHandler = (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    // Readable by any origin (the CORS headers say so too); helmet's default is same-origin
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  };

  const limiter = rateLimit({
    windowMs: deps.rateLimit.windowMinutes * 60_000,
    limit: deps.rateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many status requests from this address. Try again later.',
        ),
      ),
  });

  // After the limiter, so a 429 is still logged as a warning (without the IP)
  const quietLogs: RequestHandler = (_req, res, next) => {
    res.locals.logLevel = QUIET_LOG_LEVEL;
    next();
  };

  router.get(
    '/:credentialId',
    noStore,
    limiter,
    quietLogs,
    validate({ params: credentialIdParams }),
    async (req, res) => {
      if (!deps.status) {
        throw new AppError(503, 'STATUS_UNAVAILABLE', 'The status service is not available');
      }
      const { params } = getValidated<{ params: z.infer<typeof credentialIdParams> }>(res);
      try {
        const result = await deps.status.lookup(params.credentialId);
        req.log?.debug(
          { credentialId: params.credentialId, result: result.status },
          'Credential status lookup',
        );
        res.json(result);
      } catch (err) {
        if (err instanceof AppError && err.status === 404) {
          req.log?.debug(
            { credentialId: params.credentialId, result: 'not_found' },
            'Credential status lookup',
          );
        }
        throw err;
      }
    },
  );

  // Any other method or path under /status: a 404 whose message has no credential id in it
  router.use(noStore, quietLogs, (req, _res, next) => {
    next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${STATUS_ROUTE_TEMPLATE} not found`));
  });
  return router;
}
