/**
 * Node-only part of @univault/claims-validation: reads the schema files, builds the shared Ajv
 * instance (backend, at runtime) and generates standalone validator code (portal, at build
 * time). Never imported by browser code.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { _, Ajv2020 } from 'ajv/dist/2020.js';
import standaloneCodeModule from 'ajv/dist/standalone/index.js';
import addFormatsModule from 'ajv-formats';
import {
  AJV_OPTIONS,
  CREDENTIAL_TYPES,
  CUSTOM_KEYWORDS,
  SCHEMA_FILES,
  type CredentialTypeName,
} from './index.js';

/** A credential JSON Schema as read from docs/schemas. */
export type CredentialJsonSchema = Record<string, unknown>;

// ajv-formats and ajv's standalone module are CommonJS; take the callable from either style
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: Ajv2020) => Ajv2020;
const standaloneCode = ((standaloneCodeModule as unknown as { default?: unknown }).default ??
  standaloneCodeModule) as (ajv: Ajv2020, refsOrFuncs: Record<string, string>) => string;

/** Name the generated code uses for the format implementations (see runtime.ts). */
const FORMATS_VAR = '__univaultFormats';
const UCS2LENGTH_VAR = '__univaultUcs2length';

/**
 * The shared Ajv: Draft 2020-12, AJV_OPTIONS, ajv-formats (date, email, …) and the custom
 * keyword. `standalone: true` makes it keep the generated source (for the portal build).
 */
export function createClaimsAjv(options: { standalone?: boolean } = {}): Ajv2020 {
  const ajv = new Ajv2020({
    ...AJV_OPTIONS,
    ...(options.standalone
      ? { code: { source: true, esm: true, formats: _`__univaultFormats` } } // = FORMATS_VAR
      : {}),
  });
  addFormats(ajv);
  for (const keyword of CUSTOM_KEYWORDS) ajv.addKeyword({ keyword });
  return ajv;
}

/** Reads both schema files from `dir` (docs/schemas). Throws if one is missing or invalid JSON. */
export function readCredentialSchemas(
  dir: string,
): Record<CredentialTypeName, CredentialJsonSchema> {
  const schemas = {} as Record<CredentialTypeName, CredentialJsonSchema>;
  for (const type of CREDENTIAL_TYPES) {
    schemas[type] = JSON.parse(
      readFileSync(join(dir, SCHEMA_FILES[type]), 'utf8'),
    ) as CredentialJsonSchema;
  }
  return schemas;
}

/**
 * An ES module (source text) exporting a precompiled validator per credential type
 * (`validators.EmploymentCredential(claims)` → boolean, errors in `.errors`, exactly like
 * Ajv's compiled functions) and the schemas themselves (`schemas`, for building forms).
 * The only imports are the runtime helpers from '@univault/claims-validation/runtime'.
 */
export function standaloneValidatorsModule(
  schemas: Record<CredentialTypeName, CredentialJsonSchema>,
): string {
  const ajv = createClaimsAjv({ standalone: true });
  const refs: Record<string, string> = {};
  for (const type of CREDENTIAL_TYPES) {
    ajv.addSchema(schemas[type], type);
    refs[type] = type;
  }
  // esm: true still emits require() for ajv's runtime helpers: swap in the imported one
  const code = standaloneCode(ajv, refs).replace(
    /require\("ajv\/dist\/runtime\/ucs2length"\)\.default/g,
    UCS2LENGTH_VAR,
  );
  if (/\brequire\(/.test(code)) {
    throw new Error('Unexpected require() in the generated claims validators: extend runtime.ts');
  }
  return [
    `import { formats as ${FORMATS_VAR}, ucs2length as ${UCS2LENGTH_VAR} } from '@univault/claims-validation/runtime';`,
    code,
    `export const validators = { ${CREDENTIAL_TYPES.join(', ')} };`,
    `export const schemas = ${JSON.stringify(schemas)};`,
    '',
  ].join('\n');
}
