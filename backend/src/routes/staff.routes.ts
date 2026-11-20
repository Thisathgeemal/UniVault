import { asc, eq } from 'drizzle-orm';
import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { issuerStaff } from '../db/schema.js';
import { AppError } from '../lib/errors.js';

/** /api/v1/staff – staff of the logged-in admin's own issuer (admin only). */
export function staffRouter(deps: { auth: AuthMiddleware; db?: Db }): Router {
  const router = Router();
  router.get('/', deps.auth.requireAuth, deps.auth.requireRole('admin'), async (req, res) => {
    if (!deps.db || !req.auth)
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Database not available');
    const staff = await deps.db
      .select({
        id: issuerStaff.id,
        email: issuerStaff.email,
        displayName: issuerStaff.displayName,
        role: issuerStaff.role,
        isActive: issuerStaff.isActive,
        lastLoginAt: issuerStaff.lastLoginAt,
      })
      .from(issuerStaff)
      .where(eq(issuerStaff.issuerId, req.auth.issuer.id)) // never other issuers' staff
      .orderBy(asc(issuerStaff.email));
    res.json({ staff });
  });
  return router;
}
