/**
 * Choose the holder to issue to, through the existing holder list API (GET /holders?search=):
 * summaries only, ID numbers masked. Each result links to /credentials/new?holderId=….
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Alert, SearchInput, Skeleton } from '@univault/portal-ui';
import { ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { fetchHolders, HOLDERS_QUERY_KEY } from '../api/holders.js';
import { useAuth } from '../auth/auth-context.js';
import { maskIdNumber } from '../holders/display.js';

export const PICKER_LIMIT = 10;

export function HolderPicker() {
  const { t } = useTranslation();
  const { api, user } = useAuth();
  const [q, setQ] = useState('');
  const query = useQuery({
    queryKey: [...HOLDERS_QUERY_KEY, 'picker', user?.issuer.id ?? null, q],
    queryFn: ({ signal }) =>
      fetchHolders(
        api,
        { search: q || undefined, limit: PICKER_LIMIT, offset: 0, sort: 'name' },
        signal,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        label={t('issuance.picker.searchLabel')}
        clearLabel={t('holders.list.clearSearch')}
        value={q}
        onSearch={setQ}
      />
      {query.isError ? (
        <Alert variant="destructive" role="alert">
          {t('issuance.picker.loadFailed')}
        </Alert>
      ) : !query.data ? (
        <Skeleton className="h-24" />
      ) : query.data.holders.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('issuance.picker.none', { query: q })}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {query.data.holders.map((h) => (
            <li key={h.id}>
              <Link
                to={`/credentials/new?holderId=${encodeURIComponent(h.id)}`}
                aria-label={t('issuance.picker.choose', { name: h.fullName })}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex flex-col">
                  <span className="font-medium">{h.fullName}</span>
                  <span className="text-sm text-muted-foreground">
                    <span className="font-mono">{h.externalRef}</span>
                    {h.idNumberLast4 ? (
                      <span aria-hidden="true" className="ml-2 font-mono">
                        {maskIdNumber(h.idNumberLast4)}
                      </span>
                    ) : null}
                  </span>
                </span>
                <ChevronRight aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
