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

/** The schema file's x-univault block (docs/schemas/credential-schemas.md). */
export interface SchemaMetadata {
  vct: string;
  schemaVersion: string;
  selectivelyDisclosable: string[];
  /** Subject claims that are never selectively disclosable (empty in both v1 schemas). */
  alwaysVisible: string[];
  defaultValidity: string;
  /** Claims the server calculates (e.g. age_over_18), with how. */
  derivedClaims?: Record<string, string>;
}

/** One subject claim of a schema, as the issuer portal shows it. */
export interface SchemaField {
  name: string;
  /** In the schema's top-level "required" list (conditional rules stay in its allOf). */
  required: boolean;
  /** In x-univault.selectivelyDisclosable: a salted disclosure the holder may withhold. */
  selectivelyDisclosable: boolean;
  /** In x-univault.derivedClaims: calculated by the server, never entered by staff. */
  derived: boolean;
}

/** A schema as GET /credential-schemas describes it: all of it read from the schema file. */
export interface SchemaDescription {
  credentialType: CredentialTypeName;
  vct: string;
  title: string;
  schemaVersion: string;
  defaultValidity: string;
  fields: SchemaField[];
  /** x-univault.alwaysVisible: subject claims that are always visible (none in v1). */
  alwaysVisibleClaims: string[];
}

export interface CredentialSchemas {
  /** Issues with path (inside the claims), stable code and English message; [] = valid. */
  validate(type: CredentialTypeName, claims: unknown): ClaimIssue[];
  metadata(type: CredentialTypeName): SchemaMetadata;
  describe(type: CredentialTypeName): SchemaDescription;
}

/** Builds the description from the file: properties, required, and the x-univault block. */
function describeSchema(
  type: CredentialTypeName,
  file: Record<string, unknown>,
  meta: SchemaMetadata,
): SchemaDescription {
  const required = new Set((file.required as string[] | undefined) ?? []);
  const disclosable = new Set(meta.selectivelyDisclosable);
  const derived = new Set(Object.keys(meta.derivedClaims ?? {}));
  return {
    credentialType: type,
    vct: meta.vct,
    title: String(file.title),
    schemaVersion: meta.schemaVersion,
    defaultValidity: meta.defaultValidity,
    fields: Object.keys((file.properties as Record<string, unknown> | undefined) ?? {}).map(
      (name) => ({
        name,
        required: required.has(name),
        selectivelyDisclosable: disclosable.has(name),
        derived: derived.has(name),
      }),
    ),
    alwaysVisibleClaims: meta.alwaysVisible,
  };
}

export function loadCredentialSchemas(dir: string = DEFAULT_SCHEMAS_DIR): CredentialSchemas {
  const ajv = createClaimsAjv();
  const files = readCredentialSchemas(dir);
  const validators = {} as Record<CredentialTypeName, ValidateFunction>;
  const meta = {} as Record<CredentialTypeName, SchemaMetadata>;
  const descriptions = {} as Record<CredentialTypeName, SchemaDescription>;
  for (const type of CREDENTIAL_TYPES) {
    validators[type] = ajv.compile(files[type]);
    meta[type] = files[type]['x-univault'] as SchemaMetadata;
    descriptions[type] = describeSchema(type, files[type], meta[type]);
  }

  return {
    validate(type, claims) {
      const validate = validators[type];
      return validate(claims) ? [] : toClaimIssues(validate.errors);
    },
    metadata: (type) => meta[type],
    describe: (type) => descriptions[type],
  };
}
