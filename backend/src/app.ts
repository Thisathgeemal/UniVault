/**
 * Express application factory. Building the app in a function (instead of at
 * import time) lets tests create it with any configuration and no open port.
 *
 * Middleware order:
 *   request ID + logging → security headers → CORS → JSON body parsing →
 *   /api/v1 routes → 404 → central error handler
 */
import { randomUUID } from 'node:crypto';
import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import type { AppConfig } from './config/env.js';
import type { Database } from './db/client.js';
import { AppError } from './lib/errors.js';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler.js';
import { apiRouter } from './routes/index.js';

export const API_PREFIX = '/api/v1';
export const APP_VERSION = '0.1.0';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

export interface AppDependencies {
  database?: Database;
}

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
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      // Keep request logs short: method, URL and status are enough
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  // 2. Security headers (X-Content-Type-Options, frame protection, etc.)
  app.use(helmet());

  // 3. CORS: only the issuer and verifier portals listed in CORS_ORIGINS may call the API
  //    from a browser. Requests without an Origin header (the mobile wallet, curl) are allowed.
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
  app.use(cors(corsOptions));

  // 4. JSON body parsing with a size limit
  app.use(express.json({ limit: config.REQUEST_BODY_LIMIT }));

  // 5. Routes
  app.use(
    API_PREFIX,
    apiRouter({
      version: APP_VERSION,
      environment: config.NODE_ENV,
      ...(deps.database ? { database: deps.database } : {}),
    }),
  );

  // 6. Unknown routes and all errors
  app.use(notFoundHandler);
  app.use(createErrorHandler({ exposeInternalErrors: config.NODE_ENV === 'development' }));

  return app;
}
