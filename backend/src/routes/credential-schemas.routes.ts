import { Router } from 'express';
import type { AuthMiddleware } from '../auth/middleware.js';
import { AppError } from '../lib/errors.js';
import type { CredentialsService } from '../services/credentials.service.js';

/**
 * /api/v1/credential-schemas – the credential schemas the logged-in staff member's issuer may
 * issue (docs/api/credential-schemas-api.md). Officer or admin.
 *   GET /    [{ credentialType, vct, title, schemaVersion, defaultValidity, fields[],
 *              alwaysVisible[], alwaysVisibleClaims[] }]
 * Everything comes from the schema files (properties, required, x-univault) and the signer's
 * envelope builder: no list is kept here. The issuer type decides the schema (Decision 019).
 */
export function credentialSchemasRouter(
  auth: AuthMiddleware,
  credentials?: CredentialsService,
): Router {
  const router = Router();
  router.use(auth.requireAuth, auth.requireRole('officer', 'admin'));
  router.get('/', (req, res) => {
    if (!credentials) {
      throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Credential service is not available');
    }
    res.json({ schemas: credentials.issuableSchemas(req.auth!) });
  });
  return router;
}
