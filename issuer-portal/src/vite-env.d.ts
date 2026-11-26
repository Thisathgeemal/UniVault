/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API base URL including /api/v1 (public, bundled into the app) */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Precompiled claim validators and the schemas (claims-validators-plugin.ts, Decision 018). */
declare module 'virtual:claims-validators' {
  import type { CredentialTypeName, ErrorObject } from '@univault/claims-validation';

  interface ClaimsValidator {
    (claims: unknown): boolean;
    errors?: ErrorObject[] | null;
  }
  export const validators: Record<CredentialTypeName, ClaimsValidator>;
  /** The JSON Schemas from docs/schemas, as read at build time. */
  export const schemas: Record<CredentialTypeName, Record<string, unknown>>;
}
