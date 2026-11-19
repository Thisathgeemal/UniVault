import { Router } from 'express';

const startedAt = Date.now();

/** GET /api/v1/health – liveness check used by the portals, the wallet and deployment. */
export function healthRouter(info: { version: string; environment: string }): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'univault-backend',
      version: info.version,
      environment: info.environment,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
