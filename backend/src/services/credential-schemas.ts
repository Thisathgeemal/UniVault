/**
 * Credential schema validation.
 *
 * Loads the JSON Schemas in docs/schemas (the single source of truth, also used by the
 * synthetic data generator and – precompiled at build time – by the issuer portal's forms) and
 * validates holder claims against them. Loaded once at start-up: the server will not start if
 * a schema file is missing or invalid.
 *
 * The Ajv configuration and the error messages come from @univault/claims-validation, the same
 * code the issuer portal uses, so the browser and the server report the same problems
 * (Decision 018). Never duplicate a schema rule here or in the portal.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CREDENTIAL_TYPES,
  toClaimIssues,
  type ClaimIssue,
  type CredentialTypeName,
} from '@univault/claims-validation';
import { createClaimsAjv, readCredentialSchemas } from '@univault/claims-validation/node';
import type { ValidateFunction } from 'ajv';

/**
 * <repo>/docs/schemas – same path from backend/src/services and backend/dist/services. Built
 * with path.join (not `new URL(rel, import.meta.url)`, which Vite rewrites into an asset URL
 * when the issuer portal's agreement test imports this file).
 */
export const DEFAULT_SCHEMAS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'docs',
  'schemas',
);

export type { ClaimIssue, CredentialTypeName };

export interface SchemaMetadata {
  vct: string;
  schemaVersion: string;
  selectivelyDisclosable: string[];
  defaultValidity: string;
}

export interface CredentialSchemas {
  /** Issues with path (inside the claims), stable code and English message; [] = valid. */
  validate(type: CredentialTypeName, claims: unknown): ClaimIssue[];
  metadata(type: CredentialTypeName): SchemaMetadata;
}

export function loadCredentialSchemas(dir: string = DEFAULT_SCHEMAS_DIR): CredentialSchemas {
  const ajv = createClaimsAjv();
  const files = readCredentialSchemas(dir);
  const validators = {} as Record<CredentialTypeName, ValidateFunction>;
  const meta = {} as Record<CredentialTypeName, SchemaMetadata>;
  for (const type of CREDENTIAL_TYPES) {
    validators[type] = ajv.compile(files[type]);
    meta[type] = files[type]['x-univault'] as SchemaMetadata;
  }

  return {
    validate(type, claims) {
      const validate = validators[type];
      return validate(claims) ? [] : toClaimIssues(validate.errors);
    },
    metadata: (type) => meta[type],
  };
}
