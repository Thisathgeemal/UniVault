import { generateKeyPairSync } from 'node:crypto';
import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { validate } from '../middleware/validate.js';
import type { CredentialsService } from '../services/credentials.service.js';
import { credentialIdParams } from './schemas.js';

/**
 * /api/v1/dev – DEVELOPMENT-ONLY helpers. Mounted only when DEV_SIMULATE_REDEMPTION=true
 * and NODE_ENV is not production (loadConfig refuses the flag in production).
 *
 *   POST /credentials/:credentialId/simulate-redemption   admin, own issuer
 *
 * Stands in for wallet redemption until Sprint 2 builds it, so a credential can become
 * 'valid' for testing and evidence (e.g. scripts/evidence/s1-revocation.ps1). It calls the
 * ONE signing path, signCredential(), with a throwaway P-256 wallet key generated here.
 * The signed SD-JWT is discarded: only metadata is returned. Remove when redemption exists.
 */
export function devRouter(auth: AuthMiddleware, credentials: CredentialsService): Router {
  const router = Router();
  router.use(auth.requireAuth, auth.requireRole('admin'));

  router.post(
    '/credentials/:credentialId/simulate-redemption',
    validate({ params: credentialIdParams }),
    async (req, res) => {
      const credentialId = String(req.params.credentialId);
      await credentials.get(req.auth!, credentialId); // issuer scope: another issuer's → 404
      const walletKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({
        format: 'jwk',
      });
      const { credential } = await credentials.signCredential(credentialId, walletKey);
      req.log?.warn(
        {
          credentialId,
          issuerId: credential.issuerId,
          staffId: req.auth?.id,
          action: 'simulate-redemption',
        },
        'DEVELOPMENT: credential signed with a throwaway wallet key (simulated redemption)',
      );
      res.json({ simulated: true, credential });
    },
  );
  return router;
}
