import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import type { AuthService } from '../auth/auth-service.js';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import { getValidated, validate } from '../middleware/validate.js';

export const loginBody = z.object({
  email: z.string().trim().pipe(z.email().max(254)), // tolerate pasted spaces
  password: z.string().min(1).max(200),
});

/**
 * /api/v1/auth – issuer staff login.
 *   POST /login   { email, password } → { accessToken, tokenType, expiresIn, staff }
 *   GET  /me      current staff member (requires token)
 *   POST /logout  204 – the portal discards its token (tokens are short-lived)
 */
export function authRouter(deps: {
  authService?: AuthService;
  auth: AuthMiddleware;
  rateLimit: { max: number; windowMinutes: number };
}): Router {
  const router = Router();

  // Limit login attempts per client IP, on top of the per-account lockout
  const loginLimiter = rateLimit({
    windowMs: deps.rateLimit.windowMinutes * 60_000,
    limit: deps.rateLimit.max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many login attempts from this address. Try again later.',
        ),
      ),
  });

  router.post('/login', loginLimiter, validate({ body: loginBody }), async (req, res) => {
    if (!deps.authService)
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service is not available');
    const { body } = getValidated<{ body: z.infer<typeof loginBody> }>(res);
    try {
      const result = await deps.authService.login(body.email, body.password);
      req.log?.info(
        { staffId: result.staff.id, issuerId: result.staff.issuer.id, role: result.staff.role },
        'Staff login succeeded',
      );
      res.json(result);
    } catch (err) {
      if (err instanceof AppError)
        req.log?.warn({ email: body.email, code: err.code }, 'Staff login failed');
      throw err;
    }
  });

  router.get('/me', deps.auth.requireAuth, (req, res) => {
    res.json({ staff: req.auth });
  });

  router.post('/logout', deps.auth.requireAuth, (req, res) => {
    req.log?.info({ staffId: req.auth?.id }, 'Staff logout');
    res.status(204).end();
  });

  return router;
}
