/**
 * Vite plugin: `import { validators, schemas } from 'virtual:claims-validators'`.
 *
 * At build (and dev / test) time it reads the credential JSON Schemas from docs/schemas – the
 * files the backend validates with – and compiles them with the shared Ajv configuration of
 * @univault/claims-validation into STANDALONE validator code (Decision 018). The browser then
 * needs no Ajv compiler, so the production CSP (script-src 'self', no eval) holds.
 *
 * Never copy a schema rule into the portal: change the schema file and both sides follow.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_FILES, CREDENTIAL_TYPES } from '@univault/claims-validation';
import {
  readCredentialSchemas,
  standaloneValidatorsModule,
} from '@univault/claims-validation/node';
import type { Plugin } from 'vite';

export const VIRTUAL_ID = 'virtual:claims-validators';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
export const SCHEMAS_DIR = fileURLToPath(new URL('../docs/schemas/', import.meta.url));

export function claimsValidators(schemasDir: string = SCHEMAS_DIR): Plugin {
  return {
    name: 'univault-claims-validators',
    resolveId: (id) => (id === VIRTUAL_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null;
      // Rebuild when a schema file changes (dev server and watch mode)
      for (const type of CREDENTIAL_TYPES) {
        this.addWatchFile(join(schemasDir, SCHEMA_FILES[type]));
      }
      return standaloneValidatorsModule(readCredentialSchemas(schemasDir));
    },
  };
}
