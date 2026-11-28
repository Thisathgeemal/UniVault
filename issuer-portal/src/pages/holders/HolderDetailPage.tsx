/**
 * One holder (/holders/:holderId): every registered field grouped like the form, the full ID
 * number (only here), the server-computed "over 18", who added the record and when, and the
 * holder's credentials by status. Another issuer's holder is a 404 from the backend → not found.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  ErrorFallback,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@univault/portal-ui';
import { ArrowLeft, FilePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  EFFECTIVE_STATUSES,
  fetchHolderCredentials,
  type CredentialItem,
} from '../../api/credentials.js';
import { ApiError } from '../../api/errors.js';
import { fetchHolder, HOLDERS_QUERY_KEY, type HolderDetail } from '../../api/holders.js';
import { useAuth } from '../../auth/auth-context.js';
import { CredentialStatusBadge } from '../../credentials/CredentialStatusBadge.js';
import { STATUS_PRESENTATION } from '../../credentials/status.js';
import { optionLabel } from '../../holders/display.js';
import { EXTERNAL_REF, FORM_UI, inputKind } from '../../holders/form-model.js';
import { fieldLabel, tKey } from '../../holders/validation.js';
import { shortId } from '../../lib/activity.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatCalendarDate, formatColomboDate, formatColomboDateTime } from '../../lib/format.js';

const valueAt = (claims: Record<string, unknown>, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      claims,
    );

export function HolderDetailPage() {
  const { t } = useTranslation();
  const { holderId = '' } = useParams();
  const { api } = useAuth();
  const holder = useQuery({
    queryKey: [...HOLDERS_QUERY_KEY, 'detail', holderId],
    queryFn: ({ signal }) => fetchHolder(api, holderId, signal),
  });

  if (holder.isError) {
    const notFound =
      holder.error instanceof ApiError &&
      (holder.error.status === 404 || holder.error.code === 'VALIDATION_ERROR');
    if (notFound) {
      return (
        <ErrorFallback
          title={t('holders.detail.notFound.title')}
          message={t('holders.detail.notFound.message')}
          action={
            <Link to="/holders" className={buttonVariants({ variant: 'secondary' })}>
              {t('holders.detail.notFound.back')}
            </Link>
          }
        />
      );
    }
    const error = apiErrorMessage(holder.error, t);
    return (
      <Alert
        variant="destructive"
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-col gap-1">
          <p className="font-medium">{t('holders.detail.loadFailed')}</p>
          <p>{error.message}</p>
          {error.reference ? <p className="font-mono text-caption">{error.reference}</p> : null}
        </div>
        <Button variant="secondary" onClick={() => void holder.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  }
  if (!holder.data) {
    return (
      <div aria-busy="true" className="flex flex-col gap-4">
        <p role="status" className="sr-only">
          {t('holders.detail.loading')}
        </p>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  return <HolderDetailView holder={holder.data} />;
}

function HolderDetailView({ holder }: { holder: HolderDetail }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const exists = (key: string) => i18n.exists(key);
  const type = holder.credentialType;

  const display = (path: string): string | null => {
    if (path === EXTERNAL_REF) return holder.externalRef;
    const value = valueAt(holder.claims, path);
    if (value === undefined || value === null || value === '') return null;
    const text = String(value);
    const kind = inputKind(type, { path });
    if (kind === 'select') return optionLabel(t, path, text, exists);
    if (kind === 'date') return formatCalendarDate(text, language);
    return text;
  };

  const notProvided = <span className="text-text-muted">{t('holders.detail.notProvided')}</span>;

  return (
    <>
      <Link
        to="/holders"
        className="mb-3 inline-flex items-center gap-1 text-body-sm font-medium text-accent-text hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        {t('holders.detail.backToList')}
      </Link>
      <PageHeader
        title={holder.fullName}
        description={t('holders.detail.reference', { ref: holder.externalRef })}
        actions={
          <Link
            to={`/credentials/new?holderId=${encodeURIComponent(holder.id)}`}
            className={buttonVariants({ variant: 'primary' })}
          >
            <FilePlus aria-hidden="true" className="h-4 w-4" />
            {t('holders.detail.issueCredential')}
          </Link>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {FORM_UI[type].map((group) => {
            if (
              group.optionalObject &&
              valueAt(holder.claims, group.optionalObject) === undefined
            ) {
              return null;
            }
            const fields = group.fields.filter((f) => !f.conditional || display(f.path) !== null);
            return (
              <Card key={group.id}>
                <CardHeader>
                  <CardTitle>{tKey(t, `holders.register.groups.${group.id}`)}</CardTitle>
                </CardHeader>
                <CardContent>
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {fields.map((field) => (
                      <div key={field.path} className="flex flex-col gap-0.5">
                        <dt className="text-body-sm text-text-muted">
                          {fieldLabel(t, field.path)}
                        </dt>
                        <dd className="font-medium break-words">
                          {display(field.path) ?? notProvided}
                        </dd>
                      </div>
                    ))}
                    {group.id === 'personal' && typeof holder.claims.age_over_18 === 'boolean' ? (
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-body-sm text-text-muted">
                          {t('holders.detail.over18')}
                        </dt>
                        <dd className="font-medium">
                          {holder.claims.age_over_18
                            ? t('holders.detail.yes')
                            : t('holders.detail.no')}
                          <span className="block text-caption font-normal text-text-muted">
                            {t('holders.detail.over18Hint')}
                          </span>
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('holders.detail.record')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3">
                <div className="flex flex-col gap-0.5">
                  <dt className="text-body-sm text-text-muted">{t('holders.detail.createdAt')}</dt>
                  <dd className="font-medium">
                    <time dateTime={holder.createdAt}>
                      {formatColomboDateTime(holder.createdAt, language) ?? holder.createdAt}
                    </time>
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5">
                  <dt className="text-body-sm text-text-muted">{t('holders.detail.createdBy')}</dt>
                  <dd className="font-medium">
                    {holder.createdBy?.displayName ?? t('holders.detail.unknownStaff')}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="mt-6">
        <HolderCredentials holderId={holder.id} />
      </div>
    </>
  );
}

function HolderCredentials({ holderId }: { holderId: string }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { api } = useAuth();
  const query = useQuery({
    queryKey: ['credentials', 'holder', holderId],
    queryFn: ({ signal }) => fetchHolderCredentials(api, holderId, signal),
  });

  let body;
  if (query.isError) {
    body = (
      <Alert variant="destructive" role="alert" className="flex flex-col items-start gap-2">
        <p>{t('holders.detail.credentials.loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  } else if (!query.data) {
    body = <Skeleton className="h-24" />;
  } else if (query.data.credentials.length === 0) {
    body = <p className="text-body-sm text-text-muted">{t('holders.detail.credentials.none')}</p>;
  } else {
    const credentials = query.data.credentials;
    const counts = EFFECTIVE_STATUSES.map(
      (status) => [status, credentials.filter((c) => c.effectiveStatus === status).length] as const,
    ).filter(([, n]) => n > 0);
    body = (
      <div className="flex flex-col gap-4">
        <ul
          aria-label={t('holders.detail.credentials.summaryLabel')}
          className="flex flex-wrap gap-2"
        >
          {counts.map(([status, n]) => (
            <li key={status}>
              <StatusBadge
                status={STATUS_PRESENTATION[status].set}
                icon={STATUS_PRESENTATION[status].icon}
              >
                {`${t(`holders.statuses.${status}`)}: ${n}`}
              </StatusBadge>
            </li>
          ))}
        </ul>
        <DataTable<CredentialItem>
          caption={t('holders.detail.credentials.tableCaption')}
          rows={credentials}
          getRowId={(c) => c.id}
          columns={[
            {
              id: 'id',
              header: t('holders.detail.credentials.columns.id'),
              cell: (c) => (
                <span className="font-mono" title={c.id}>
                  {shortId(c.id)}
                </span>
              ),
            },
            {
              id: 'type',
              header: t('holders.detail.credentials.columns.type'),
              cell: (c) => t(`credentialTypes.${c.credentialType}`),
            },
            {
              id: 'status',
              header: t('holders.detail.credentials.columns.status'),
              cell: (c) => <CredentialStatusBadge status={c.effectiveStatus} />,
            },
            {
              id: 'issuedAt',
              header: t('holders.detail.credentials.columns.issuedAt'),
              cell: (c) =>
                c.issuedAt
                  ? formatColomboDate(c.issuedAt, language)
                  : t('holders.detail.credentials.notIssued'),
            },
            {
              id: 'expiresAt',
              header: t('holders.detail.credentials.columns.expiresAt'),
              cell: (c) => formatColomboDate(c.expiresAt, language),
            },
          ]}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('holders.detail.credentials.title')}</CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
