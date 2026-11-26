/**
 * Holder list (/holders): search, paging and sorting done by the backend (GET /holders), with
 * q, page, size and sort in the URL so Back and refresh keep them. Shows summaries only; the
 * ID number is masked to its last 4 characters (docs/frontend/issuer-portal.md, "Holders").
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  buttonVariants,
  DataTable,
  EmptyState,
  PageHeader,
  Pagination,
  SearchInput,
  type DataTableColumn,
} from '@univault/portal-ui';
import { SearchX, UserPlus, Users } from 'lucide-react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { fetchHolders, HOLDERS_QUERY_KEY, type HolderSummary } from '../../api/holders.js';
import { useAuth } from '../../auth/auth-context.js';
import { maskIdNumber } from '../../holders/display.js';
import {
  PAGE_SIZES,
  readListParams,
  SORT_OF,
  tableSortOf,
  writeListParams,
  type ListParams,
} from '../../holders/list-params.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatColomboDate, formatNumber } from '../../lib/format.js';

export function HoldersListPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { user, api } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const list = readListParams(searchParams);

  const update = useCallback(
    (changes: Partial<ListParams>) =>
      setSearchParams((current) => writeListParams({ ...readListParams(current), ...changes })),
    [setSearchParams],
  );
  const onSearch = useCallback((q: string) => update({ q, page: 1 }), [update]);

  const query = useQuery({
    queryKey: [...HOLDERS_QUERY_KEY, 'list', user?.issuer.id ?? null, list],
    queryFn: ({ signal }) =>
      fetchHolders(
        api,
        {
          search: list.q || undefined,
          limit: list.size,
          offset: (list.page - 1) * list.size,
          sort: list.sort,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
    enabled: user !== null,
  });
  if (!user) return null;

  const isCustomer = user.issuer.type === 'bank';
  const registerLink = (
    <Link to="/holders/new" className={buttonVariants({ variant: 'default' })}>
      <UserPlus aria-hidden="true" className="h-4 w-4" />
      {t('holders.registerAction')}
    </Link>
  );

  const columns: DataTableColumn<HolderSummary>[] = [
    {
      id: 'name',
      header: t('holders.list.columns.name'),
      sortable: true,
      cell: (h) => (
        <Link
          to={`/holders/${h.id}`}
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {h.fullName}
        </Link>
      ),
    },
    {
      id: 'reference',
      header: isCustomer
        ? t('holders.list.columns.referenceCustomer')
        : t('holders.list.columns.referenceEmployee'),
      sortable: true,
      cell: (h) => <span className="font-mono">{h.externalRef}</span>,
    },
    {
      id: 'idNumber',
      header: t('holders.list.columns.idNumber'),
      cell: (h) =>
        h.idNumberLast4 ? (
          <>
            <span aria-hidden="true" className="font-mono">
              {maskIdNumber(h.idNumberLast4)}
            </span>
            <span className="sr-only">
              {t('holders.list.idEnding', { last4: h.idNumberLast4 })}
            </span>
          </>
        ) : (
          <span className="text-muted-foreground">
            <span aria-hidden="true">—</span>
            <span className="sr-only">{t('holders.list.noIdNumber')}</span>
          </span>
        ),
    },
    {
      id: 'createdAt',
      header: t('holders.list.columns.createdAt'),
      sortable: true,
      cell: (h) => (
        <time dateTime={h.createdAt}>
          {formatColomboDate(h.createdAt, language) ?? h.createdAt}
        </time>
      ),
    },
    {
      id: 'credentials',
      header: t('holders.list.columns.credentials'),
      className: 'text-right',
      cell: (h) => formatNumber(h.credentialCount, language),
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
          <p className="font-medium">{t('holders.list.loadFailed')}</p>
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
        title={t('holders.list.noMatch.title', { query: list.q })}
        description={t('holders.list.noMatch.description')}
        icon={<SearchX className="h-10 w-10" />}
        action={
          <Button variant="outline" onClick={() => onSearch('')}>
            {t('holders.list.clearSearch')}
          </Button>
        }
      />
    );
  } else if (data && total === 0) {
    content = (
      <EmptyState
        title={t('holders.list.empty.title')}
        description={t('holders.list.empty.description')}
        icon={<Users className="h-10 w-10" />}
        action={registerLink}
      />
    );
  } else {
    content = (
      <>
        {query.isPending ? (
          <p role="status" className="sr-only">
            {t('holders.list.loading')}
          </p>
        ) : null}
        <DataTable
          caption={t('holders.list.tableCaption')}
          columns={columns}
          rows={data?.holders ?? []}
          getRowId={(h) => h.id}
          onRowClick={(h) => void navigate(`/holders/${h.id}`)}
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
              navigation: t('holders.list.pagination.label'),
              previous: t('holders.list.pagination.previous'),
              next: t('holders.list.pagination.next'),
              pageSize: t('holders.list.pagination.pageSize'),
              summary: t('holders.list.pagination.summary', {
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
        title={t('holders.title')}
        description={t('holders.description')}
        actions={registerLink}
      />
      <div className="mb-4">
        <SearchInput
          label={t('holders.list.searchLabel')}
          placeholder={t('holders.list.searchPlaceholder')}
          clearLabel={t('holders.list.clearSearch')}
          value={list.q}
          onSearch={onSearch}
        />
      </div>
      {content}
    </>
  );
}
