import { Router } from 'express';
import type { Database } from '../db/client.js';
import type { KeyStore } from '../keys/key-store.js';

const startedAt = Date.now();

/**
 * GET /api/v1/health – liveness, database and issuer-key check, used by the portals, the
 * wallet and deployment. Returns 503 'degraded' if the database is unreachable or an active
 * issuer key could not be loaded. When the database is down or not configured the keys block
 * is { status: 'unknown' } (the active keys are listed in the database).
 *
 * The keys block holds counts only: no issuer ids, kids, paths or error codes (those are in
 * the server log).
 */
export function healthRouter(info: {
  version: string;
  environment: string;
  database?: Database;
  keyStore?: KeyStore;
}): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const database = info.database
      ? (await info.database.ping())
        ? 'up'
        : 'down'
      : 'not_configured';
    // Without a reachable database the active keys can't be counted: 'unknown', no counts
    let keys:
      { status: 'ok' | 'degraded'; activeKeys: number; loaded: number } | { status: 'unknown' } = {
      status: 'unknown',
    };
    if (info.keyStore && database === 'up') {
      try {
        const { status, activeKeys, loaded } = await info.keyStore.status();
        keys = { status, activeKeys, loaded };
      } catch {
        keys = { status: 'degraded', activeKeys: 0, loaded: 0 };
      }
    }
    const degraded = database === 'down' || keys.status === 'degraded';
    res.status(degraded ? 503 : 200).json({
      status: degraded ? 'degraded' : 'ok',
      service: 'univault-backend',
      version: info.version,
      environment: info.environment,
      database,
      keys,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    });
  });
  return router;
}
