import { Router } from 'express';
import type { AuthService } from '../auth/auth-service.js';
import type { AuthMiddleware } from '../auth/middleware.js';
import type { Database } from '../db/client.js';
import type { KeyStore } from '../keys/key-store.js';
import type { CredentialOffersService } from '../services/credential-offers.service.js';
import type { CredentialStatusService } from '../services/credential-status.js';
import type { CredentialsService } from '../services/credentials.service.js';
import type { DashboardService } from '../services/dashboard.service.js';
import type { HoldersService } from '../services/holders.service.js';
import type { IssuerKeysService } from '../services/issuer-keys.service.js';
import { authRouter } from './auth.routes.js';
import { credentialOffersRouter } from './credential-offers.routes.js';
import { credentialSchemasRouter } from './credential-schemas.routes.js';
import { credentialsRouter } from './credentials.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { devRouter } from './dev.routes.js';
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
  keyStore?: KeyStore;
  authService?: AuthService;
  issuerKeys?: IssuerKeysService;
  holders?: HoldersService;
  credentials?: CredentialsService;
  credentialOffers?: CredentialOffersService;
  credentialStatus?: CredentialStatusService;
  dashboard?: DashboardService;
  auth: AuthMiddleware;
  loginRateLimit: { max: number; windowMinutes: number };
  statusRateLimit: { max: number; windowMinutes: number };
  /** Mount the development-only /dev routes (never true in production; see loadConfig). */
  devSimulateRedemption?: boolean;
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
  router.use('/credential-schemas', credentialSchemasRouter(deps.auth, deps.credentials));
  router.use('/dashboard', dashboardRouter(deps.auth, deps.dashboard));
  router.use('/credential-offers', credentialOffersRouter(deps.auth, deps.credentialOffers));
  if (deps.devSimulateRedemption && deps.credentials) {
    router.use('/dev', devRouter(deps.auth, deps.credentials));
  }
  router.use(
    '/status',
    statusRouter({
      rateLimit: deps.statusRateLimit,
      ...(deps.credentialStatus ? { status: deps.credentialStatus } : {}),
    }),
  );
  router.use('/verifications', verificationsRouter());
  return router;
}
