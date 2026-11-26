/** Holder records (backend /api/v1/holders, docs/api/holders-api.md). */
import { z } from 'zod';
import type { ApiClient } from './client.js';

/** Sort orders the backend accepts (GET /holders?sort=). */
export const HOLDER_SORTS = ['newest', 'oldest', 'name', 'name_desc', 'ref', 'ref_desc'] as const;
export type HolderSort = (typeof HOLDER_SORTS)[number];

const recordType = z.enum(['employee', 'customer']);

export const holderSummarySchema = z.object({
  id: z.string(),
  externalRef: z.string(),
  fullName: z.string(),
  recordType,
  /** Last 4 characters of the ID number, or null (the list never has the full number). */
  idNumberLast4: z.string().nullable(),
  credentialCount: z.number().int().min(0),
  createdAt: z.string(),
});
export type HolderSummary = z.infer<typeof holderSummarySchema>;

const holderListSchema = z.object({
  holders: z.array(holderSummarySchema),
  total: z.number().int().min(0),
  limit: z.number().int(),
  offset: z.number().int(),
});
export type HolderList = z.infer<typeof holderListSchema>;

export const holderDetailSchema = z.object({
  id: z.string(),
  issuerId: z.string(),
  recordType,
  credentialType: z.enum(['EmploymentCredential', 'KYCCredential']),
  externalRef: z.string(),
  fullName: z.string(),
  claims: z.record(z.string(), z.unknown()),
  createdBy: z.object({ id: z.string(), displayName: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type HolderDetail = z.infer<typeof holderDetailSchema>;

export interface HolderListQuery {
  search?: string | undefined;
  limit: number;
  offset: number;
  sort: HolderSort;
}

export const HOLDERS_QUERY_KEY = ['holders'] as const;

export async function fetchHolders(
  api: ApiClient,
  query: HolderListQuery,
  signal?: AbortSignal,
): Promise<HolderList> {
  const params = new URLSearchParams({
    limit: String(query.limit),
    offset: String(query.offset),
    sort: query.sort,
  });
  if (query.search) params.set('search', query.search);
  const body = await api.request<unknown>(`/holders?${params}`, signal ? { signal } : {});
  return holderListSchema.parse(body);
}

export async function fetchHolder(
  api: ApiClient,
  holderId: string,
  signal?: AbortSignal,
): Promise<HolderDetail> {
  const body = await api.request<unknown>(
    `/holders/${encodeURIComponent(holderId)}`,
    signal ? { signal } : {},
  );
  return holderDetailSchema.parse(body);
}

export interface CreateHolderInput {
  /** Bank customers only (the customer number); employees use claims.employee_id. */
  externalRef?: string;
  claims: Record<string, unknown>;
}

export async function createHolder(
  api: ApiClient,
  input: CreateHolderInput,
): Promise<HolderDetail> {
  const body = await api.request<unknown>('/holders', { method: 'POST', body: input });
  return holderDetailSchema.parse(body);
}
