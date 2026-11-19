import { Router } from 'express';
import { credentialOffersRouter } from './credential-offers.routes.js';
import { credentialsRouter } from './credentials.routes.js';
import { healthRouter } from './health.routes.js';
import { holdersRouter } from './holders.routes.js';
import { issuersRouter } from './issuers.routes.js';
import { statusRouter } from './status.routes.js';
import { verificationsRouter } from './verifications.routes.js';

/** All API routes, mounted under /api/v1 by app.ts. */
export function apiRouter(info: { version: string; environment: string }): Router {
  const router = Router();
  router.use('/health', healthRouter(info));
  router.use('/issuers', issuersRouter());
  router.use('/holders', holdersRouter());
  router.use('/credentials', credentialsRouter());
  router.use('/credential-offers', credentialOffersRouter());
  router.use('/status', statusRouter());
  router.use('/verifications', verificationsRouter());
  return router;
}
