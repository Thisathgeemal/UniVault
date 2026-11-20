/**
 * Credential schema validation.
 *
 * Loads the JSON Schemas in docs/schemas (the single source of truth, also
 * used by the synthetic data generator) and validates holder claims against
 * them. Loaded once at start-up: the server will not start if a schema file is
 * missing or invalid.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';

/** <repo>/docs/schemas – same path from backend/src/services and backend/dist/services. */
export const DEFAULT_SCHEMAS_DIR = fileURLToPath(
  new URL('../../../docs/schemas/', import.meta.url),
);

export type CredentialTypeName = 'EmploymentCredential' | 'KYCCredential';

const SCHEMA_FILES: Record<CredentialTypeName, string> = {
  EmploymentCredential: 'employment-credential.v1.schema.json',
  KYCCredential: 'kyc-credential.v1.schema.json',
};

export interface SchemaMetadata {
  vct: string;
  schemaVersion: string;
  selectivelyDisclosable: string[];
  defaultValidity: string;
}

export interface ClaimIssue {
  path: string;
  message: string;
}

export interface CredentialSchemas {
  validate(type: CredentialTypeName, claims: unknown): ClaimIssue[];
  metadata(type: CredentialTypeName): SchemaMetadata;
}

// ajv-formats is published as CommonJS; take the callable from either export style
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;

function toIssue(error: ErrorObject): ClaimIssue {
  const base = error.instancePath.replace(/^\//, '').replace(/\//g, '.');
  if (error.keyword === 'required') {
    const missing = (error.params as { missingProperty: string }).missingProperty;
    return { path: base ? `${base}.${missing}` : missing, message: 'is required' };
  }
  if (error.keyword === 'additionalProperties') {
    const extra = (error.params as { additionalProperty: string }).additionalProperty;
    return {
      path: base ? `${base}.${extra}` : extra,
      message: 'is not allowed by the credential schema',
    };
  }
  if (error.keyword === 'not' && base.endsWith('line1')) {
    return {
      path: base,
      message: 'must be a street address (P.O. Box addresses are not accepted)',
    };
  }
  if (error.keyword === 'not')
    return { path: base || '(claims)', message: 'is not an accepted value' };
  return { path: base || '(claims)', message: error.message ?? 'is invalid' };
}

export function loadCredentialSchemas(dir: string = DEFAULT_SCHEMAS_DIR): CredentialSchemas {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
  addFormats(ajv);
  ajv.addKeyword({ keyword: 'x-univault' });

  const validators = {} as Record<CredentialTypeName, ValidateFunction>;
  const meta = {} as Record<CredentialTypeName, SchemaMetadata>;
  for (const [type, file] of Object.entries(SCHEMA_FILES) as [CredentialTypeName, string][]) {
    const schema = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Record<string, unknown> & {
      'x-univault': SchemaMetadata;
    };
    validators[type] = ajv.compile(schema);
    meta[type] = schema['x-univault'];
  }

  return {
    validate(type, claims) {
      const validate = validators[type];
      if (validate(claims)) return [];
      // ajv can report the same problem twice (e.g. via allOf); keep each path+message once
      const seen = new Set<string>();
      return (validate.errors ?? []).map(toIssue).filter((i) => {
        const key = `${i.path}|${i.message}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return !i.message.startsWith('must match "then" schema'); // summary line from if/then
      });
    },
    metadata: (type) => meta[type],
  };
}
