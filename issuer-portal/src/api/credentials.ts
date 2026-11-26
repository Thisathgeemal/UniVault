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
