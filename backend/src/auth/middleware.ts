/**
 * Route protection.
 *
 *   router.get('/holders', auth.requireAuth, handler)                     – any logged-in staff
 *   router.post('/:id/revoke', auth.requireAuth, auth.requireRole('admin'), handler)
 *   router.post('/issuers/:issuerId/keys', auth.requireAuth, auth.requireOwnIssuer, handler)
 *
 * requireAuth verifies the Bearer token AND reloads the staff member from the
 * database, so a disabled account or a changed role takes effect immediately.
 * The authenticated user is available as req.auth in handlers.
 */
import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors.js';
import type { AuthService, StaffProfile } from './auth-service.js';
import { TokenError, type TokenService } from './tokens.js';

export type AuthContext = StaffProfile;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. */
      auth?: AuthContext;
    }
  }
}

export interface AuthMiddleware {
  requireAuth: RequestHandler;
  requireRole: (...roles: StaffProfile['role'][]) => RequestHandler;
  /** Route param :issuerId must be the logged-in staff member's own issuer. */
  requireOwnIssuer: RequestHandler;
}

const unauthenticated = (message: string, code = 'UNAUTHENTICATED') =>
  new AppError(401, code, message);

export function createAuthMiddleware(deps: {
  tokens: TokenService;
  authService?: AuthService;
}): AuthMiddleware {
  const requireAuth: RequestHandler = async (req, res) => {
    const header = req.headers.authorization;
    const match =
      typeof header === 'string' ? /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(header) : null;
    if (!match?.[1]) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="univault-issuer-portal"');
      throw unauthenticated('Authentication required: send "Authorization: Bearer <token>"');
    }

    let claims;
    try {
      claims = await deps.tokens.verify(match[1]);
    } catch (err) {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"');
      if (err instanceof TokenError && err.reason === 'expired') {
        throw unauthenticated('Your session has expired. Please log in again.', 'TOKEN_EXPIRED');
      }
      throw unauthenticated('Invalid authentication token', 'INVALID_TOKEN');
    }

    if (!deps.authService) {
      throw new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service is not available');
    }
    const staff = await deps.authService.findActiveStaff(claims.staffId);
    if (!staff || staff.issuer.id !== claims.issuerId) {
      throw unauthenticated('This account is no longer active', 'INVALID_TOKEN');
    }
    req.auth = staff; // role and status come from the database, not the token
    return 'next';
  };

  const requireRole =
    (...roles: StaffProfile['role'][]): RequestHandler =>
    (req) => {
      if (!req.auth) throw unauthenticated('Authentication required');
      if (!roles.includes(req.auth.role)) {
        throw new AppError(403, 'FORBIDDEN', `This action requires the ${roles.join(' or ')} role`);
      }
      return 'next';
    };

  const requireOwnIssuer: RequestHandler = (req) => {
    if (!req.auth) throw unauthenticated('Authentication required');
    if (req.params.issuerId !== req.auth.issuer.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only access your own organisation');
    }
    return 'next';
  };

  return {
    requireAuth: wrap(requireAuth),
    requireRole: (...r) => wrap(requireRole(...r)),
    requireOwnIssuer: wrap(requireOwnIssuer),
  };
}

/**
 * Lets the guards above `throw` on failure and return 'next' on success.
 * Express 5 forwards rejected promises to the error handler.
 */
function wrap(handler: RequestHandler): RequestHandler {
  return async (req, res, next) => {
    try {
      const result = (await handler(req, res, next)) as unknown;
      if (result === 'next') next();
    } catch (err) {
      next(err);
    }
  };
}
