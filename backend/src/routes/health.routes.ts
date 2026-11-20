import { Router } from 'express';
import type { Database } from '../db/client.js';

const startedAt = Date.now();

/**
 * GET /api/v1/health – liveness and database check, used by the portals,
 * the wallet and deployment. Returns 503 if the database is unreachable.
 */
export function healthRouter(info: {
  version: string;
  environment: string;
  database?: Database;
}): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const database = info.database
      ? (await info.database.ping())
        ? 'up'
        : 'down'
      : 'not_configured';
    res.status(database === 'down' ? 503 : 200).json({
      status: database === 'down' ? 'degraded' : 'ok',
      service: 'univault-backend',
      version: info.version,
      environment: info.environment,
      database,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
