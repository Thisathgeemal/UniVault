import { Router } from 'express';
import type { AuthService } from '../auth/auth-service.js';
import type { AuthMiddleware } from '../auth/middleware.js';
import type { Database } from '../db/client.js';
import type { CredentialOffersService } from '../services/credential-offers.service.js';
import type { CredentialsService } from '../services/credentials.service.js';
import type { HoldersService } from '../services/holders.service.js';
import type { IssuerKeysService } from '../services/issuer-keys.service.js';
import { authRouter } from './auth.routes.js';
import { credentialOffersRouter } from './credential-offers.routes.js';
import { credentialsRouter } from './credentials.routes.js';
import { healthRouter } from './health.routes.js';
import { holdersRouter } from './holders.routes.js';
import { issuersRouter } from './issuers.routes.js';
import { staffRouter } from './staff.routes.js';
import { statusRouter } from './status.routes.js';
import { verificationsRouter } from './verifications.routes.js';

export interface ApiRouterDeps {
  version: string;
  environment: string;
  database?: Database;
  authService?: AuthService;
  issuerKeys?: IssuerKeysService;
  holders?: HoldersService;
  credentials?: CredentialsService;
  credentialOffers?: CredentialOffersService;
  auth: AuthMiddleware;
  loginRateLimit: { max: number; windowMinutes: number };
}

/** All API routes, mounted under /api/v1 by app.ts. */
export function apiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  router.use('/health', healthRouter(deps));
  router.use(
    '/auth',
    authRouter({
      auth: deps.auth,
      rateLimit: deps.loginRateLimit,
      ...(deps.authService ? { authService: deps.authService } : {}),
    }),
  );
  router.use(
    '/staff',
    staffRouter({ auth: deps.auth, ...(deps.database ? { db: deps.database.db } : {}) }),
  );
  router.use('/issuers', issuersRouter(deps.auth, deps.issuerKeys));
  router.use('/holders', holdersRouter(deps.auth, deps.holders));
  router.use('/credentials', credentialsRouter(deps.auth, deps.credentials));
  router.use('/credential-offers', credentialOffersRouter(deps.auth, deps.credentialOffers));
  router.use('/status', statusRouter());
  router.use('/verifications', verificationsRouter());
  return router;
}
