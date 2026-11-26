import type { QueryClient } from '@tanstack/react-query';
import { CREDENTIALS_QUERY_KEY } from '../api/credentials.js';
import { DASHBOARD_SUMMARY_QUERY_KEY } from '../api/dashboard.js';
import { HOLDERS_QUERY_KEY } from '../api/holders.js';

/**
 * After a revoke or reissue (or a refused one: the data was out of date): every credential
 * query (list, detail, events, a holder's credentials), the dashboard summary and the holder
 * queries (credential counts) are refetched.
 */
export function invalidateAfterCredentialChange(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: CREDENTIALS_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: DASHBOARD_SUMMARY_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: HOLDERS_QUERY_KEY }),
  ]).then(() => undefined);
}
