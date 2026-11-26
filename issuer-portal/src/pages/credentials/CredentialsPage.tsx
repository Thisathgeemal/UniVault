/**
 * Credentials (/credentials): every credential of the staff member's issuer (GET /credentials),
 * with status tabs and counts, search, sorting and paging done by the backend, all in the URL
 * (the dashboard's cards link to a tab). Each row: short id with a copy button, holder link,
 * type, effective status, issued, expires (with an "expiring soon" hint) and the actions menu
 * from credentialActions(). Rows carry the holder's name and reference only (no ID numbers).
 * "Issue credential" opens the holder picker (/credentials/new).
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ActionMenu,
  Alert,
  Button,
  buttonVariants,
  CopyButton,
  DataTable,
  EmptyState,
  FilterTabs,
  PageHeader,
  Pagination,
  SearchInput,
  type DataTableColumn,
} from '@univault/portal-ui';
import { FileBadge, FilePlus2, MoreHorizontal, SearchX } from 'lucide-react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  CREDENTIALS_QUERY_KEY,
  listCredentials,
  type CredentialListItem,
} from '../../api/credentials.js';
import { useAuth } from '../../auth/auth-context.js';
import { credentialActionItems } from '../../credentials/action-items.js';
import { CredentialStatusBadge } from '../../credentials/CredentialStatusBadge.js';
import {
  daysUntil,
  EXPIRING_SOON_DAYS,
  PAGE_SIZES,
  readCredentialListParams,
  shortId,
  SORT_OF,
  tableSortOf,
  writeCredentialListParams,
  type CredentialListState,
} from '../../credentials/list-params.js';
import { RevokeDialog, type RevokeTarget } from '../../credentials/RevokeDialog.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatColomboDate, formatNumber } from '../../lib/format.js';

const TAB_ORDER: readonly CredentialListState['status'][] = [
  'all',
  'valid',
  'pending',
  'expired',
  'revoked',
  'superseded',
];

export function CredentialsPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { user, api } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const list = readCredentialListParams(searchParams);
  const [revoking, setRevoking] = useState<RevokeTarget | null>(null);
  const [now] = useState(() => Date.now());

  const update = useCallback(
    (changes: Partial<CredentialListState>) =>
      setSearchParams((current) =>
        writeCredentialListParams({ ...readCredentialListParams(current), ...changes }),
      ),
    [setSearchParams],
  );
  const onSearch = useCallback((q: string) => update({ q, page: 1 }), [update]);

  const query = useQuery({
    queryKey: [...CREDENTIALS_QUERY_KEY, 'list', user?.issuer.id ?? null, list],
    queryFn: ({ signal }) =>
      listCredentials(
        api,
        {
          effectiveStatus: list.status === 'all' ? undefined : list.status,
          q: list.q || undefined,
          sort: list.sort,
          limit: list.size,
          offset: (list.page - 1) * list.size,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled: user !== null,
  });
  if (!user) return null;

  const issueLink = (
    <Link to="/credentials/new" className={buttonVariants({ variant: 'default' })}>
      <FilePlus2 aria-hidden="true" className="h-4 w-4" />
      {t('credentials.issueAction')}
    </Link>
  );

  const columns: DataTableColumn<CredentialListItem>[] = [
    {
      id: 'id',
      header: t('credentials.list.columns.id'),
      cell: (c) => (
        <span className="inline-flex items-center gap-1">
          <Link
            to={`/credentials/${c.id}`}
            className="font-mono text-primary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {shortId(c.id)}
          </Link>
          <CopyButton
            value={c.id}
            label={t('credentials.list.copyId', { id: shortId(c.id) })}
            copiedLabel={t('credentials.list.copied')}
          />
        </span>
      ),
    },
    {
      id: 'holder',
      header: t('credentials.list.columns.holder'),
      sortable: true,
      cell: (c) => (
        <span className="flex flex-col">
          <Link
            to={`/holders/${c.holder.id}`}
            className="font-medium text-primary underline-offset-2 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.holder.fullName}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">{c.holder.externalRef}</span>
        </span>
      ),
    },
    {
      id: 'type',
      header: t('credentials.list.columns.type'),
      cell: (c) => t(`credentialTypes.${c.credentialType}`),
    },
    {
      id: 'status',
      header: t('credentials.list.columns.status'),
      cell: (c) => <CredentialStatusBadge status={c.effectiveStatus} />,
    },
    {
      id: 'issued',
      header: t('credentials.list.columns.issued'),
      sortable: true,
      cell: (c) =>
        c.issuedAt ? (
          <time dateTime={c.issuedAt}>{formatColomboDate(c.issuedAt, language) ?? c.issuedAt}</time>
        ) : (
          <span className="text-muted-foreground">{t('credentials.list.notIssued')}</span>
        ),
    },
    {
      id: 'expires',
      header: t('credentials.list.columns.expires'),
      sortable: true,
      cell: (c) => {
        const days = c.effectiveStatus === 'valid' ? daysUntil(c.expiresAt, now) : null;
        return (
          <span className="flex flex-col">
            <time dateTime={c.expiresAt}>
              {formatColomboDate(c.expiresAt, language) ?? c.expiresAt}
            </time>
            {days !== null && days <= EXPIRING_SOON_DAYS ? (
              <span className="text-xs font-medium text-accent-foreground">
                {days === 0
                  ? t('credentials.list.expiringToday')
                  : t('credentials.list.expiringSoon', { days })}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: t('credentials.list.columns.actions'),
      className: 'text-right',
      cell: (c) => (
        <ActionMenu
          label={t('credentials.list.actionsFor', { name: c.holder.fullName })}
          trigger={
            <>
              <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">{t('credentials.list.actionsButton')}</span>
            </>
          }
          items={credentialActionItems(
            t,
            c,
            user.role,
            { onRevoke: () => setRevoking(c), navigate: (path) => void navigate(path) },
            { includeView: true },
          )}
        />
      ),
    },
  ];

  const data = query.data;
  const error = query.isError ? apiErrorMessage(query.error, t) : null;
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (list.page - 1) * list.size + 1;
  const to = Math.min(list.page * list.size, total);

  let content;
  if (error && !data) {
    content = (
      <Alert
        variant="destructive"
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t('credentials.list.loadFailed')}</p>
          <p>{error.message}</p>
          {error.reference ? <p className="font-mono text-xs">{error.reference}</p> : null}
        </div>
        <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  } else if (data && total === 0 && list.q) {
    content = (
      <EmptyState
        title={t('credentials.list.noMatch.title', { query: list.q })}
        description={t('credentials.list.noMatch.description')}
        icon={<SearchX className="h-10 w-10" />}
        action={
          <Button variant="outline" onClick={() => onSearch('')}>
            {t('credentials.list.clearSearch')}
          </Button>
        }
      />
    );
  } else if (data && total === 0) {
    content = (
      <EmptyState
        title={t(`credentials.list.empty.${list.status}.title`)}
        description={t(`credentials.list.empty.${list.status}.description`)}
        icon={<FileBadge className="h-10 w-10" />}
        {...(list.status === 'all' ? { action: issueLink } : {})}
      />
    );
  } else {
    content = (
      <>
        {query.isPending ? (
          <p role="status" className="sr-only">
            {t('credentials.list.loading')}
          </p>
        ) : null}
        <DataTable
          caption={t('credentials.list.tableCaption')}
          columns={columns}
          rows={data?.credentials ?? []}
          getRowId={(c) => c.id}
          sort={tableSortOf(list.sort)}
          onSortChange={(sort) => update({ sort: SORT_OF[sort.column]![sort.direction], page: 1 })}
          loading={query.isPending}
        />
        {data ? (
          <Pagination
            page={list.page}
            pageSize={list.size}
            total={total}
            onPageChange={(page) => update({ page })}
            pageSizeOptions={PAGE_SIZES}
            onPageSizeChange={(size) => update({ size, page: 1 })}
            labels={{
              navigation: t('credentials.list.pagination.label'),
              previous: t('credentials.list.pagination.previous'),
              next: t('credentials.list.pagination.next'),
              pageSize: t('credentials.list.pagination.pageSize'),
              summary: t('credentials.list.pagination.summary', {
                from: formatNumber(from, language),
                to: formatNumber(to, language),
                total: formatNumber(total, language),
              }),
            }}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t('credentials.title')}
        description={t('credentials.description')}
        actions={issueLink}
      />
      <FilterTabs
        label={t('credentials.list.tabsLabel')}
        className="mb-4"
        selected={list.status}
        onSelect={(id) => update({ status: id as CredentialListState['status'], page: 1 })}
        tabs={TAB_ORDER.map((id) => ({
          id,
          label: t(`credentials.list.tabs.${id}`),
          ...(data ? { count: formatNumber(data.counts[id], language) } : {}),
        }))}
      />
      <div className="mb-4">
        <SearchInput
          label={t('credentials.list.searchLabel')}
          placeholder={t('credentials.list.searchPlaceholder')}
          clearLabel={t('credentials.list.clearSearch')}
          value={list.q}
          onSearch={onSearch}
        />
      </div>
      {content}
      <RevokeDialog credential={revoking} onClose={() => setRevoking(null)} />
    </>
  );
}
