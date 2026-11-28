/**
 * One credential (/credentials/:credentialId): summary (holder, type, statuses, dates, id),
 * the wallet offer card while pending (active offer expiry only, link to the offer screen),
 * "Replaces" / "Replaced by" links, the status timeline (GET /credentials/:id/events) and the
 * same actions as the table (credentialActions()). After issuing (?issued=1) it is also the
 * success page. Another issuer's or an unknown credential → "Credential not found".
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
  CopyButton,
  ErrorFallback,
  PageHeader,
  Skeleton,
} from '@univault/portal-ui';
import { CircleCheck, QrCode } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  credentialEventsQueryKey,
  credentialQueryKey,
  fetchCredentialDetail,
  fetchCredentialEvents,
  type CredentialDetail,
  type CredentialStatusEvent,
} from '../../api/credentials.js';
import { ApiError } from '../../api/errors.js';
import { useAuth } from '../../auth/auth-context.js';
import { credentialActionItems } from '../../credentials/action-items.js';
import { CredentialStatusBadge } from '../../credentials/CredentialStatusBadge.js';
import { RevokeDialog } from '../../credentials/RevokeDialog.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatColomboDate, formatColomboDateTime, formatColomboTime } from '../../lib/format.js';

export function CredentialPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { credentialId = '' } = useParams();
  const [params] = useSearchParams();
  const issued = params.get('issued') === '1';
  const { api, user } = useAuth();
  const navigate = useNavigate();
  const [revoking, setRevoking] = useState(false);
  const reasonLabel = useReasonLabel();
  const query = useQuery({
    queryKey: credentialQueryKey(credentialId),
    queryFn: ({ signal }) => fetchCredentialDetail(api, credentialId, signal),
  });

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && (error.status === 404 || error.code === 'VALIDATION_ERROR')) {
      return (
        <ErrorFallback
          title={t('issuance.result.notFound.title')}
          message={t('issuance.result.notFound.message')}
          action={
            <Link to="/credentials" className={buttonVariants({ variant: 'secondary' })}>
              {t('issuance.credentialsPage.title')}
            </Link>
          }
        />
      );
    }
    const message = apiErrorMessage(error, t);
    return (
      <Alert variant="destructive" role="alert" className="flex flex-col items-start gap-2">
        <p className="font-medium">{t('issuance.result.loadFailed')}</p>
        <p>{message.message}</p>
        <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  }
  const credential = query.data;
  if (!credential) return <Skeleton className="h-48" />;

  const reasonText = reasonLabel;
  const date = (iso: string | null) => (iso ? (formatColomboDate(iso, language) ?? iso) : null);
  const items = credentialActionItems(
    t,
    { ...credential, hasActiveOffer: Boolean(credential.activeOffer) },
    user?.role,
    { onRevoke: () => setRevoking(true), navigate: (path) => void navigate(path) },
  );
  const actions =
    items.length > 0 ? (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item.id} className="flex flex-col">
            <Button
              variant={item.tone === 'destructive' ? 'destructive' : 'secondary'}
              onClick={item.disabled ? undefined : item.onSelect}
              aria-disabled={item.disabled ? true : undefined}
              aria-describedby={item.disabled ? `action-${item.id}-reason` : undefined}
              className={item.disabled ? 'cursor-not-allowed opacity-60' : undefined}
            >
              {item.label}
            </Button>
            {item.disabled && item.disabledReason ? (
              <span id={`action-${item.id}-reason`} className="mt-1 text-caption text-text-muted">
                {item.disabledReason}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    ) : undefined;

  return (
    <>
      <PageHeader
        title={issued ? t('issuance.result.issued') : t('issuance.result.title')}
        {...(issued ? { description: t('issuance.result.issuedDescription') } : {})}
        {...(actions ? { actions } : {})}
      />
      {issued ? (
        <Alert role="status" className="mb-6 flex items-center gap-2">
          <CircleCheck aria-hidden="true" className="h-5 w-5" />
          {t('issuance.result.issuedDescription')}
        </Alert>
      ) : null}
      <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t(`credentialTypes.${credential.credentialType}`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <Fact label={t('issuance.result.status')}>
                <CredentialStatusBadge status={credential.effectiveStatus} />
                {credential.status !== credential.effectiveStatus ? (
                  <span className="ml-2 text-body-sm text-text-muted">
                    {t('credentials.detail.storedStatus')}:{' '}
                    {t(`credentials.statuses.${credential.status}`)}
                  </span>
                ) : null}
              </Fact>
              <Fact label={t('issuance.result.id')}>
                <span className="inline-flex items-center gap-1">
                  <span className="font-mono text-body-sm break-all">{credential.id}</span>
                  <CopyButton
                    value={credential.id}
                    label={t('credentials.list.copyId', { id: credential.id.slice(0, 8) })}
                    copiedLabel={t('credentials.list.copied')}
                  />
                </span>
              </Fact>
              <Fact label={t('issuance.result.type')}>
                {t(`credentialTypes.${credential.credentialType}`)}
              </Fact>
              <Fact label={t('issuance.result.holder')}>
                <Link
                  to={`/holders/${credential.holder.id}`}
                  className="text-accent-text underline-offset-2 hover:underline"
                >
                  {credential.holder.fullName}
                </Link>{' '}
                <span className="font-mono text-body-sm text-text-muted">
                  {credential.holder.externalRef}
                </span>
              </Fact>
              <Fact label={t('credentials.detail.created')}>
                <time dateTime={credential.createdAt}>{date(credential.createdAt)}</time>
                {credential.createdBy ? (
                  <span className="text-body-sm text-text-muted">
                    {' '}
                    {t('credentials.detail.by', { name: credential.createdBy.displayName })}
                  </span>
                ) : null}
              </Fact>
              <Fact label={t('credentials.detail.issued')}>
                {credential.issuedAt ? (
                  <time dateTime={credential.issuedAt}>{date(credential.issuedAt)}</time>
                ) : (
                  <span className="text-text-muted">{t('credentials.detail.notIssued')}</span>
                )}
              </Fact>
              <Fact label={t('issuance.result.expiresAt')}>
                <time dateTime={credential.expiresAt}>{date(credential.expiresAt)}</time>
              </Fact>
              {credential.revokedAt ? (
                <Fact label={t('credentials.detail.revoked')}>
                  {t('credentials.detail.revokedDetail', {
                    date: date(credential.revokedAt),
                    name: credential.revokedBy?.displayName ?? '—',
                    reason: credential.revocationReason
                      ? reasonText(credential.revocationReason)
                      : '—',
                  })}
                </Fact>
              ) : null}
              {credential.replacesCredentialId ? (
                <Fact label={t('credentials.detail.replaces')}>
                  <CredentialLink id={credential.replacesCredentialId} />
                </Fact>
              ) : null}
              {credential.replacedByCredentialId ? (
                <Fact label={t('credentials.detail.replacedBy')}>
                  <CredentialLink id={credential.replacedByCredentialId} />
                </Fact>
              ) : null}
            </dl>
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          {credential.effectiveStatus === 'pending' ? (
            <OfferCard credential={credential} language={language} />
          ) : null}
          <Timeline credentialId={credential.id} />
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to={`/holders/${credential.holder.id}`}
          className={buttonVariants({ variant: 'secondary' })}
        >
          {t('issuance.result.backToHolder')}
        </Link>
        <Link to="/credentials/new" className={buttonVariants({ variant: 'secondary' })}>
          {t('issuance.result.issueAnother')}
        </Link>
      </div>
      <RevokeDialog credential={revoking ? credential : null} onClose={() => setRevoking(false)} />
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-body-sm text-text-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function CredentialLink({ id }: { id: string }) {
  return (
    <Link
      to={`/credentials/${id}`}
      className="font-mono text-body-sm text-accent-text underline-offset-2 hover:underline"
    >
      {id}
    </Link>
  );
}

/** A stored reason code in plain words (an unknown code is shown as it is). */
function useReasonLabel() {
  const { t, i18n } = useTranslation();
  return (reason: string) =>
    i18n.exists(`credentials.reasons.${reason}`)
      ? t(`credentials.reasons.${reason}` as never)
      : reason;
}

function OfferCard({ credential, language }: { credential: CredentialDetail; language: string }) {
  const { t } = useTranslation();
  const offer = credential.activeOffer;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode aria-hidden="true" className="h-5 w-5" />
          {t('issuance.result.walletOffer')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        <p className="text-body-sm text-text-muted">
          {t('issuance.result.walletOfferDescription')}
        </p>
        {offer ? (
          <p className="text-body-sm font-medium">
            {t('credentials.detail.activeOfferUntil', {
              time: formatColomboTime(offer.expiresAt, language),
            })}
          </p>
        ) : null}
        <Link
          to={`/credentials/${credential.id}/offer`}
          className={buttonVariants({ variant: 'primary' })}
        >
          {offer ? t('credentials.detail.openOffer') : t('issuance.result.createOffer')}
        </Link>
      </CardContent>
    </Card>
  );
}

function Timeline({ credentialId }: { credentialId: string }) {
  const { t, i18n } = useTranslation();
  const { api } = useAuth();
  const query = useQuery({
    queryKey: credentialEventsQueryKey(credentialId),
    queryFn: ({ signal }) => fetchCredentialEvents(api, credentialId, signal),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('credentials.detail.timeline')}</CardTitle>
      </CardHeader>
      <CardContent>
        {query.isError ? (
          <Alert variant="destructive" role="alert" className="flex flex-col items-start gap-2">
            <p>{t('credentials.detail.timelineFailed')}</p>
            <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
              {t('common.tryAgain')}
            </Button>
          </Alert>
        ) : !query.data ? (
          <Skeleton className="h-24" />
        ) : query.data.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t('credentials.detail.timelineEmpty')}</p>
        ) : (
          <ol className="flex flex-col gap-4 border-l border-border pl-4">
            {query.data.map((event) => (
              <TimelineItem key={event.id} event={event} language={i18n.language} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TimelineItem({ event, language }: { event: CredentialStatusEvent; language: string }) {
  const { t } = useTranslation();
  const reasonLabel = useReasonLabel();
  const label =
    event.fromStatus === event.toStatus
      ? t('credentials.detail.events.same')
      : t(`credentials.detail.events.${event.toStatus}`);
  const who = event.staff
    ? t('credentials.detail.by', { name: event.staff.displayName })
    : event.toStatus === 'valid'
      ? t('credentials.detail.byWallet')
      : null;
  return (
    <li className="flex flex-col gap-0.5">
      <span className="font-medium">{label}</span>
      <span className="text-body-sm text-text-muted">
        <time dateTime={event.createdAt}>
          {formatColomboDateTime(event.createdAt, language) ?? event.createdAt}
        </time>
        {who ? ` · ${who}` : null}
      </span>
      {event.reason ? (
        <span className="text-body-sm">
          {t('credentials.detail.reason', { reason: reasonLabel(event.reason) })}
        </span>
      ) : null}
    </li>
  );
}
