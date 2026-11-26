/** Issuer dashboard summary (backend GET /api/v1/dashboard/summary, docs/api/dashboard-api.md). */
import { z } from 'zod';
import type { ApiClient } from './client.js';

const STORED_STATUSES = ['pending', 'valid', 'revoked', 'superseded'] as const;
const count = z.number().int().min(0);

export const dashboardSummarySchema = z.object({
  issuer: z.object({ id: z.string(), name: z.string() }),
  counts: z.object({
    issued: count,
    active: count,
    revoked: count,
    superseded: count,
    expired: count,
    awaitingWallet: count,
    expiringSoon: count,
    holders: count,
  }),
  expiringSoonDays: z.number().int().positive(),
  recentActivity: z.array(
    z.object({
      credentialId: z.string(),
      credentialType: z.string(),
      fromStatus: z.enum(STORED_STATUSES).nullable(),
      toStatus: z.enum(STORED_STATUSES),
      reason: z.string().nullable(),
      staffName: z.string().nullable(),
      at: z.string(),
    }),
  ),
  generatedAt: z.string(),
});
export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
export type DashboardActivity = DashboardSummary['recentActivity'][number];

export const DASHBOARD_SUMMARY_QUERY_KEY = ['dashboard', 'summary'] as const;

export async function fetchDashboardSummary(
  api: ApiClient,
  signal?: AbortSignal,
): Promise<DashboardSummary> {
  const body = await api.request<unknown>('/dashboard/summary', signal ? { signal } : {});
  return dashboardSummarySchema.parse(body);
}
