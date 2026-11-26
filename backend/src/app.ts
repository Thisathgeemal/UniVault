/**
 * Express application factory. Building the app in a function (instead of at
 * import time) lets tests create it with any configuration and no open port.
 *
 * Middleware order:
 *   request ID + logging → security headers → CORS (open for GET /status, allow-list for
 *   everything else) → JSON body parsing → /api/v1 routes → 404 → central error handler
 */
import { randomUUID } from 'node:crypto';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { createAuthService } from './auth/auth-service.js';
import { createAuthMiddleware } from './auth/middleware.js';
import { createTokenService } from './auth/tokens.js';
import type { AppConfig } from './config/env.js';
import type { Database } from './db/client.js';
import { keyStoreFromConfig, type KeyStore } from './keys/key-store.js';
import { AppError } from './lib/errors.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';
import { STATUS_ROUTE_TEMPLATE } from './routes/status.routes.js';
import { loadCredentialSchemas } from './services/credential-schemas.js';
import { createCredentialOffersService } from './services/credential-offers.service.js';
import { createCredentialStatusService } from './services/credential-status.js';
import { createCredentialsService } from './services/credentials.service.js';
import { createDashboardService } from './services/dashboard.service.js';
import { createHoldersService } from './services/holders.service.js';
import { createIssuerKeysService } from './services/issuer-keys.service.js';

export const API_PREFIX = '/api/v1';
export const APP_VERSION = '0.1.0';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export interface AppDependencies {
  database?: Database;
  /** Clock for credential expiry and status (tests set the time); defaults to the real time. */
  now?: () => Date;
  /**
   * The issuer key store (the only owner of private keys). server.ts passes the one it checked
   * at start-up; tests may inject one. Default: built from the configuration.
   */
  keyStore?: KeyStore;
}

/** Paths of the public status route, which has its own CORS policy. */
const STATUS_PATH = `${API_PREFIX}/status`;
const isStatusPath = (path: string) => path === STATUS_PATH || path.startsWith(`${STATUS_PATH}/`);

export function createApp(config: AppConfig, logger: Logger, deps: AppDependencies = {}): Express {
  const app = express();
  app.disable('x-powered-by');

  // 1. Request ID + request logging. A safe incoming X-Request-ID is reused
  //    (so a portal and the backend share one ID), otherwise a new one is made.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id =
          typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
            ? incoming
            : randomUUID();
        res.setHeader('X-Request-ID', id);
        return id;
      },
      // The public status route logs at debug (CORS preflights included), so credential IDs
      // in its URL are never written at info level; a 429 there is still a warning
      customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        const path = ((req as { originalUrl?: string }).originalUrl ?? req.url ?? '').split(
          '?',
        )[0]!;
        if (isStatusPath(path) && res.statusCode !== 429) return 'debug';
        return res.statusCode >= 400 ? 'warn' : 'info';
      },
      // Keep request logs short: method, URL and status are enough. A status request logs the
      // route template, not its URL, so no credential id is written by the request logger or
      // by any req.log line bound to the request (the 429 warning included)
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: isStatusPath((req.url ?? '').split('?')[0]!) ? STATUS_ROUTE_TEMPLATE : req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // 2. Security headers (X-Content-Type-Options, frame protection, etc.)
  app.use(helmet());

  // 3. CORS
  //    a) GET /api/v1/status/* is public: any origin may read it (no cookies or credentials;
  //       Access-Control-Allow-Origin: *). Verifier web apps call it from their own origin.
  app.use(
    STATUS_PATH,
    cors({
      origin: '*',
      methods: ['GET'],
      allowedHeaders: ['X-Request-ID'],
      exposedHeaders: ['X-Request-ID'],
      credentials: false,
      maxAge: 600,
    }),
  );
  //    b) Everything else: only the issuer and verifier portals listed in CORS_ORIGINS may call
  //       the API from a browser. Requests without an Origin header (the mobile wallet, curl)
  //       are allowed.
  const corsOptions: CorsOptions = {
    origin: (origin, callback) => {
      if (!origin || config.CORS_ORIGINS.includes(origin)) callback(null, true);
      else
        callback(new AppError(403, 'CORS_ORIGIN_NOT_ALLOWED', `Origin ${origin} is not allowed`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 600,
  };
  const allowListCors = cors(corsOptions);
  app.use((req, res, next) => {
    if (isStatusPath(req.path)) next();
    else allowListCors(req, res, next);
  });

  // 4. JSON body parsing with a size limit
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));

  // 5. Routes
  const tokens = createTokenService(config.JWT_SECRET, config.JWT_EXPIRES_IN_SECONDS);
  const authService = deps.database
    ? createAuthService(deps.database.db, tokens, {
        maxFailedAttempts: config.LOGIN_MAX_FAILED_ATTEMPTS,
        lockoutMinutes: config.LOGIN_LOCKOUT_MINUTES,
      })
    : undefined;
  const auth = createAuthMiddleware({ tokens, ...(authService ? { authService } : {}) });
  const keyStore =
    deps.keyStore ?? (deps.database ? keyStoreFromConfig(deps.database.db, config) : undefined);
  const issuerKeys =
    deps.database && keyStore
      ? createIssuerKeysService(deps.database.db, {
          keyStore,
          publicBaseUrl: config.PUBLIC_BASE_URL,
        })
      : undefined;
  // Credential schemas are loaded at start-up: a missing or broken schema stops the server early
  const schemas = loadCredentialSchemas(config.CREDENTIAL_SCHEMAS_DIR);
  const holders = deps.database ? createHoldersService(deps.database.db, schemas) : undefined;
  const now = deps.now ?? (() => new Date());
  const credentials =
    deps.database && keyStore
      ? createCredentialsService(deps.database.db, schemas, {
          keyStore,
          publicBaseUrl: config.PUBLIC_BASE_URL,
          now,
        })
      : undefined;
  const credentialStatus = deps.database
    ? createCredentialStatusService(deps.database.db, { now })
    : undefined;
  const dashboard = deps.database ? createDashboardService(deps.database.db, { now }) : undefined;
  const credentialOffers = deps.database
    ? createCredentialOffersService(deps.database.db, {
        ttlSeconds: config.CREDENTIAL_OFFER_TTL_SECONDS,
        publicBaseUrl: config.PUBLIC_BASE_URL,
        now,
      })
    : undefined;
  // DEV ONLY (remove in Sprint 2 with wallet redemption): one warning when the app is built,
  // so an enabled simulated-redemption route is never silent
  const devSimulateRedemption =
    config.NODE_ENV !== 'production' && config.DEV_SIMULATE_REDEMPTION && credentials !== undefined;
  if (devSimulateRedemption) {
    logger.warn(
      {
        routes: [
          `${API_PREFIX}/dev/credentials/:credentialId/simulate-redemption`,
          `${API_PREFIX}/dev/credentials/:credentialId/simulate-expiry`,
        ],
      },
      'DEV_SIMULATE_REDEMPTION=true – development-only simulated redemption and expiry routes are enabled (remove in Sprint 2)',
    );
  }
  app.use(
    API_PREFIX,
    apiRouter({
      version: APP_VERSION,
      environment: config.NODE_ENV,
      auth,
      loginRateLimit: {
        max: config.LOGIN_RATE_LIMIT_MAX,
        windowMinutes: config.LOGIN_RATE_LIMIT_WINDOW_MINUTES,
      },
      ...(deps.database ? { database: deps.database } : {}),
      ...(keyStore ? { keyStore } : {}),
      ...(authService ? { authService } : {}),
      ...(issuerKeys ? { issuerKeys } : {}),
      ...(holders ? { holders } : {}),
      ...(credentials ? { credentials } : {}),
      ...(credentialOffers ? { credentialOffers } : {}),
      ...(credentialStatus ? { credentialStatus } : {}),
      ...(dashboard ? { dashboard } : {}),
      statusRateLimit: {
        max: config.STATUS_RATE_LIMIT_MAX,
        windowMinutes: config.STATUS_RATE_LIMIT_WINDOW_MINUTES,
      },
      devSimulateRedemption,
    }),
  );

  // 6. Unknown routes and all errors
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternalErrors: config.NODE_ENV === 'development' }));

  return app;
}
