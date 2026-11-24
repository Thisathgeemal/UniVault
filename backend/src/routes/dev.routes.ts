import { generateKeyPairSync } from 'node:crypto';
import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { validate } from '../middleware/validate.js';
import type { CredentialsService } from '../services/credentials.service.js';
import { credentialIdParams } from './schemas.js';

/**
 * /api/v1/dev – DEVELOPMENT-ONLY helpers (TEMPORARY: remove in Sprint 2 when wallet
 * redemption ships). Mounted only when DEV_SIMULATE_REDEMPTION=true and NODE_ENV is not
 * production (loadConfig refuses the flag in production). Admin only, own issuer, metadata only.
 *
 *   POST /credentials/:credentialId/simulate-redemption
 *     Stands in for wallet redemption, so a credential can become 'valid' for testing and
 *     evidence (scripts/evidence/s1-revocation.ps1, s1-status.ps1). It calls the ONE signing
 *     path, signCredential(), with a throwaway P-256 wallet key generated here. The signed
 *     SD-JWT is discarded: only metadata is returned.
 *
 *   POST /credentials/:credentialId/simulate-expiry
 *     Moves a VALID credential's expires_at one minute into the past and records a
 *     'dev_simulated_expiry' status event, so the 'expired' status can be shown without
 *     waiting a year (scripts/evidence/s1-status.ps1).
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

  router.post(
    '/credentials/:credentialId/simulate-expiry',
    validate({ params: credentialIdParams }),
    async (req, res) => {
      const credentialId = String(req.params.credentialId);
      // Issuer-scoped inside the service: another issuer's credential → 404
      const credential = await credentials.simulateExpiry(req.auth!, credentialId);
      req.log?.warn(
        {
          credentialId,
          issuerId: credential.issuerId,
          staffId: req.auth?.id,
          action: 'simulate-expiry',
        },
        'DEVELOPMENT: credential expiry moved into the past (simulated expiry)',
      );
      res.json({ simulated: true, credential });
    },
  );
  return router;
}
