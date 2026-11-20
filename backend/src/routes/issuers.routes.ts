import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import { validate } from '../middleware/validate.js';
import type { IssuerKeysService } from '../services/issuer-keys.service.js';
import { issuerIdParams } from './schemas.js';

/** How long verifiers may cache an issuer's key set. Short, so key rotation spreads quickly. */
export const JWKS_CACHE_SECONDS = 300;

/**
 * /api/v1/issuers – issuer organisations and their public keys (FR-ISS-02, FR-VER-02).
 *   GET  /                  public  – list of issuers with their key-set URLs
 *   GET  /:issuerId/keys    public  – the issuer's public keys as a JWK Set (RFC 7517)
 *   POST /:issuerId/keys    admin of that issuer – generate a new key (rotates the old one)
 */
export function issuersRouter(auth: AuthMiddleware, keys?: IssuerKeysService): Router {
  const router = Router();
  const service = () => {
    if (!keys)
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Issuer key service is not available');
    return keys;
  };

  router.get('/', async (_req, res) => {
    res.json({ issuers: await service().listIssuers() });
  });

  router.get('/:issuerId/keys', validate({ params: issuerIdParams }), async (req, res) => {
    const jwks = await service().getPublicJwks(String(req.params.issuerId));
    res
      .type('application/jwk-set+json')
      .set('Cache-Control', `public, max-age=${JWKS_CACHE_SECONDS}`)
      .send(JSON.stringify(jwks));
  });

  router.post(
    '/:issuerId/keys',
    auth.requireAuth,
    auth.requireRole('admin'),
    validate({ params: issuerIdParams }),
    auth.requireOwnIssuer,
    async (req, res) => {
      const result = await service().generateKey(String(req.params.issuerId));
      req.log?.info(
        {
          issuerId: result.issuerId,
          kid: result.kid,
          retiredKid: result.retiredKid,
          staffId: req.auth?.id,
        },
        'Issuer signing key generated',
      );
      res.status(201).json(result);
    },
  );

  return router;
}
