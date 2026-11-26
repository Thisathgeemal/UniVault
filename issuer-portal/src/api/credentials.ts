/** Credential metadata (backend GET /api/v1/credentials, docs/api/credentials-api.md). */
import { z } from 'zod';
import type { ApiClient } from './client.js';

export const EFFECTIVE_STATUSES = ['pending', 'valid', 'revoked', 'superseded', 'expired'] as const;
export type EffectiveStatus = (typeof EFFECTIVE_STATUSES)[number];

const credentialSchema = z.object({
  id: z.string(),
  credentialType: z.enum(['EmploymentCredential', 'KYCCredential']),
  effectiveStatus: z.enum(EFFECTIVE_STATUSES),
  issuedAt: z.string().nullable(),
  expiresAt: z.string(),
});
export type CredentialItem = z.infer<typeof credentialSchema>;

const credentialListSchema = z.object({
  credentials: z.array(credentialSchema),
  total: z.number().int().min(0),
});

/** The backend's page size limit: a holder has far fewer credentials than this. */
export const HOLDER_CREDENTIALS_LIMIT = 100;

export async function fetchHolderCredentials(
  api: ApiClient,
  holderId: string,
  signal?: AbortSignal,
): Promise<{ credentials: CredentialItem[]; total: number }> {
  const params = new URLSearchParams({ holderId, limit: String(HOLDER_CREDENTIALS_LIMIT) });
  const body = await api.request<unknown>(`/credentials?${params}`, signal ? { signal } : {});
  return credentialListSchema.parse(body);
}

// ---------------------------------------------------------------------------
// Issuance (docs/api/credentials-api.md §7, docs/api/credential-schemas-api.md, Decision 019).
// The portal never assembles or edits claims: the preview and the issuance both run the
// backend's one issuance path on the holder record.

const credentialType = z.enum(['EmploymentCredential', 'KYCCredential']);
export type CredentialType = z.infer<typeof credentialType>;

export const issuableSchemaSchema = z.object({
  credentialType,
  vct: z.string(),
  title: z.string(),
  schemaVersion: z.string(),
  defaultValidity: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      required: z.boolean(),
      selectivelyDisclosable: z.boolean(),
      derived: z.boolean(),
    }),
  ),
  alwaysVisible: z.array(z.string()),
  alwaysVisibleClaims: z.array(z.string()),
});
export type IssuableSchema = z.infer<typeof issuableSchemaSchema>;

export const CREDENTIAL_SCHEMAS_QUERY_KEY = ['credential-schemas'] as const;

export async function fetchCredentialSchemas(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<IssuableSchema[]> {
  const body = await api.request<unknown>('/credential-schemas', signal ? { signal } : {});
  return z.object({ schemas: z.array(issuableSchemaSchema) }).parse(body).schemas;
}

const claimValue = z.object({ name: z.string(), value: z.unknown() });
export const CAPPED_BY = ['id_document_expiry', '18th_birthday', 'validUntil'] as const;

export const credentialPreviewSchema = z.object({
  credentialType,
  vct: z.string(),
  schemaVersion: z.string(),
  issuer: z.object({ id: z.string(), name: z.string() }),
  holder: z.object({ id: z.string(), externalRef: z.string(), fullName: z.string() }),
  /** Envelope claims; iat is planned (set at signing), jti / cnf / status are null until issue. */
  alwaysVisible: z.record(z.string(), z.unknown()),
  disclosable: z.array(claimValue),
  derived: z.array(claimValue),
  expiry: z.object({
    expiresAt: z.string(),
    defaultExpiresAt: z.string(),
    cappedBy: z.enum(CAPPED_BY).nullable(),
    validUntilRange: z.object({ min: z.string(), max: z.string() }),
  }),
  warnings: z.array(z.string()),
});
export type CredentialPreview = z.infer<typeof credentialPreviewSchema>;

export interface IssueInput {
  holderId: string;
  credentialType: CredentialType;
  /** YYYY-MM-DD; omitted = the default (capped) expiry. */
  validUntil?: string;
}

const issueBody = (input: IssueInput) => ({
  holderId: input.holderId,
  credentialType: input.credentialType,
  ...(input.validUntil ? { validUntil: input.validUntil } : {}),
});

export async function previewCredential(
  api: ApiClient,
  input: IssueInput,
  signal?: AbortSignal,
): Promise<CredentialPreview> {
  const body = await api.request<unknown>('/credentials/preview', {
    method: 'POST',
    body: issueBody(input),
    ...(signal ? { signal } : {}),
  });
  return credentialPreviewSchema.parse(body);
}

export const credentialMetadataSchema = z.object({
  id: z.string(),
  holder: z.object({ id: z.string(), externalRef: z.string(), fullName: z.string() }),
  credentialType,
  status: z.enum(['pending', 'valid', 'revoked', 'superseded']),
  effectiveStatus: z.enum(EFFECTIVE_STATUSES),
  issuedAt: z.string().nullable(),
  expiresAt: z.string(),
  createdAt: z.string(),
  /**
   * GET /credentials/:id only: the credential's active offer (id and expiry, never the code),
   * or null. The offer screen uses it to refuse to re-show a QR code (Decision 021).
   */
  activeOffer: z.object({ offerId: z.string(), expiresAt: z.string() }).nullable().optional(),
});
export type CredentialMetadata = z.infer<typeof credentialMetadataSchema>;

export async function issueCredential(
  api: ApiClient,
  input: IssueInput,
): Promise<CredentialMetadata> {
  const body = await api.request<unknown>('/credentials', {
    method: 'POST',
    body: issueBody(input),
  });
  return credentialMetadataSchema.parse(body);
}

export const credentialQueryKey = (id: string) => ['credentials', 'detail', id] as const;

export async function fetchCredential(
  api: ApiClient,
  credentialId: string,
  signal?: AbortSignal,
): Promise<CredentialMetadata> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}`,
    signal ? { signal } : {},
  );
  return credentialMetadataSchema.parse(body);
}
