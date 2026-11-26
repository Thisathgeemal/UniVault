import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import type { DashboardService } from '../services/dashboard.service.js';

/**
 * /api/v1/dashboard – issuer dashboard (docs/api/dashboard-api.md). Requires login.
 *   GET /summary   officer/admin – counts and recent activity for the staff member's OWN issuer
 * No issuer id in the path or query: the issuer always comes from the token (req.auth).
 * Cache-Control: no-store (live counts; never cached by a browser or proxy).
 */
export function dashboardRouter(auth: AuthMiddleware, dashboard?: DashboardService): Router {
  const router = Router();
  router.use(auth.requireAuth);

  router.get('/summary', auth.requireRole('officer', 'admin'), async (req, res) => {
    if (!dashboard)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Dashboard service is not available');
    const summary = await dashboard.summary(req.auth!);
    res.setHeader('Cache-Control', 'no-store');
    res.json(summary);
  });

  return router;
}
