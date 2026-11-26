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

// ---------------------------------------------------------------------------
// The credentials table, revoke and reissue (docs/api/credentials-api.md §2 and §6,
// Decision 012). Rows carry the holder's name and reference only: never claims or ID numbers.

const staffRef = z.object({ id: z.string(), displayName: z.string() }).nullable();

export const credentialListItemSchema = credentialMetadataSchema.extend({
  vct: z.string().optional(),
  replacesCredentialId: z.string().nullable().default(null),
  replacedByCredentialId: z.string().nullable().default(null),
  hasActiveOffer: z.boolean().default(false),
});
export type CredentialListItem = z.infer<typeof credentialListItemSchema>;

export const LIST_SORTS = [
  'newest',
  'oldest',
  'expires',
  'expires_desc',
  'holder',
  'holder_desc',
] as const;
export type CredentialListSort = (typeof LIST_SORTS)[number];

const statusCounts = z.object({
  all: z.number(),
  pending: z.number(),
  valid: z.number(),
  expired: z.number(),
  revoked: z.number(),
  superseded: z.number(),
});
export type CredentialStatusCounts = z.infer<typeof statusCounts>;

const credentialListSchemaFull = z.object({
  credentials: z.array(credentialListItemSchema),
  total: z.number().int().min(0),
  counts: statusCounts,
});
export type CredentialList = z.infer<typeof credentialListSchemaFull>;

export interface CredentialListParams {
  effectiveStatus?: EffectiveStatus | undefined;
  q?: string | undefined;
  sort: CredentialListSort;
  limit: number;
  offset: number;
}

/** Every credential query starts with this key: invalidating it refreshes list, detail, events. */
export const CREDENTIALS_QUERY_KEY = ['credentials'] as const;

export async function listCredentials(
  api: ApiClient,
  params: CredentialListParams,
  signal?: AbortSignal,
): Promise<CredentialList> {
  const search = new URLSearchParams({
    sort: params.sort,
    limit: String(params.limit),
    offset: String(params.offset),
  });
  if (params.effectiveStatus) search.set('effectiveStatus', params.effectiveStatus);
  if (params.q) search.set('q', params.q);
  const body = await api.request<unknown>(`/credentials?${search}`, signal ? { signal } : {});
  return credentialListSchemaFull.parse(body);
}

/** GET /credentials/:id with everything the detail page shows. */
export const credentialDetailSchema = credentialMetadataSchema.extend({
  revokedAt: z.string().nullable().default(null),
  revocationReason: z.string().nullable().default(null),
  revokedBy: staffRef.default(null),
  supersededAt: z.string().nullable().default(null),
  supersededBy: staffRef.default(null),
  replacesCredentialId: z.string().nullable().default(null),
  replacedByCredentialId: z.string().nullable().default(null),
  createdBy: staffRef.default(null),
});
export type CredentialDetail = z.infer<typeof credentialDetailSchema>;

export async function fetchCredentialDetail(
  api: ApiClient,
  credentialId: string,
  signal?: AbortSignal,
): Promise<CredentialDetail> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}`,
    signal ? { signal } : {},
  );
  return credentialDetailSchema.parse(body);
}

const statusEventSchema = z.object({
  id: z.string(),
  fromStatus: z.enum(['pending', 'valid', 'revoked', 'superseded']).nullable(),
  toStatus: z.enum(['pending', 'valid', 'revoked', 'superseded']),
  reason: z.string().nullable(),
  staff: staffRef,
  createdAt: z.string(),
});
export type CredentialStatusEvent = z.infer<typeof statusEventSchema>;

export const credentialEventsQueryKey = (id: string) =>
  [...CREDENTIALS_QUERY_KEY, 'events', id] as const;

/** GET /credentials/:id/events (oldest first). Notes are not used by the portal. */
export async function fetchCredentialEvents(
  api: ApiClient,
  credentialId: string,
  signal?: AbortSignal,
): Promise<CredentialStatusEvent[]> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}/events`,
    signal ? { signal } : {},
  );
  return z.object({ events: z.array(statusEventSchema) }).parse(body).events;
}

/** The backend's enums (credentials.service.ts REVOCATION_REASONS / REISSUE_REASONS). */
export const REVOCATION_REASONS = [
  'details_changed',
  'employment_ended',
  'relationship_ended',
  'wallet_lost_or_compromised',
  'issued_in_error',
  'other',
] as const;
export type RevocationReason = (typeof REVOCATION_REASONS)[number];
export const REISSUE_REASONS = [
  'details_changed',
  'wallet_lost_or_compromised',
  'validity_extension',
  'other',
] as const;
export type ReissueReason = (typeof REISSUE_REASONS)[number];
/** The backend's note limit (credentials.routes.ts noteSchema). */
export const NOTE_MAX_LENGTH = 500;

export async function revokeCredential(
  api: ApiClient,
  credentialId: string,
  input: { reason: RevocationReason; note?: string },
): Promise<CredentialMetadata> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}/revoke`,
    { method: 'POST', body: { reason: input.reason, ...(input.note ? { note: input.note } : {}) } },
  );
  return credentialMetadataSchema.parse(body);
}

export interface ReissueInput {
  reason: ReissueReason;
  note?: string;
  validUntil?: string;
}
const reissueBody = (input: ReissueInput) => ({
  reason: input.reason,
  ...(input.note ? { note: input.note } : {}),
  ...(input.validUntil ? { validUntil: input.validUntil } : {}),
});

export const reissuePreviewSchema = z.object({
  credentialId: z.string(),
  credentialType,
  holder: z.object({ id: z.string(), externalRef: z.string(), fullName: z.string() }),
  current: z.object({
    claims: z.record(z.string(), z.unknown()),
    expiresAt: z.string(),
    effectiveStatus: z.enum(EFFECTIVE_STATUSES),
  }),
  replacement: z.object({
    claims: z.record(z.string(), z.unknown()),
    expiresAt: z.string(),
    defaultExpiresAt: z.string(),
    cappedBy: z.enum(CAPPED_BY).nullable(),
    validUntilRange: z.object({ min: z.string(), max: z.string() }),
  }),
  changedFields: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type ReissuePreview = z.infer<typeof reissuePreviewSchema>;

/** POST /credentials/:id/reissue/preview – the same path as reissue, nothing written. */
export async function previewReissue(
  api: ApiClient,
  credentialId: string,
  input: ReissueInput,
  signal?: AbortSignal,
): Promise<ReissuePreview> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}/reissue/preview`,
    { method: 'POST', body: reissueBody(input), ...(signal ? { signal } : {}) },
  );
  return reissuePreviewSchema.parse(body);
}

export async function reissueCredential(
  api: ApiClient,
  credentialId: string,
  input: ReissueInput,
): Promise<{ credential: CredentialMetadata; replaces: { id: string } }> {
  const body = await api.request<unknown>(
    `/credentials/${encodeURIComponent(credentialId)}/reissue`,
    { method: 'POST', body: reissueBody(input) },
  );
  return z
    .object({ credential: credentialMetadataSchema, replaces: z.object({ id: z.string() }) })
    .parse(body);
}
