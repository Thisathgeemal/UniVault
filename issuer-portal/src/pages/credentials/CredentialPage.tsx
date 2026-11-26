/**
 * One credential (/credentials/:credentialId): status, id, type, expiry and holder from
 * GET /credentials/:id. After issuing (?issued=1) it is the success page with "Issue another".
 * A PENDING credential (on both views) shows "Create wallet offer", which opens the QR code
 * screen (/credentials/:id/offer, CredentialOfferPage); other statuses have nothing to offer.
 * Another issuer's credential is a 404 from the backend → "Credential not found".
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
  ErrorFallback,
  PageHeader,
  Skeleton,
  StatusBadge,
} from '@univault/portal-ui';
import { CircleCheck, QrCode } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router';
import { credentialQueryKey, fetchCredential } from '../../api/credentials.js';
import { ApiError } from '../../api/errors.js';
import { useAuth } from '../../auth/auth-context.js';
import { STATUS_TONES } from '../../holders/display.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatColomboDate } from '../../lib/format.js';

export function CredentialPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { credentialId = '' } = useParams();
  const [params] = useSearchParams();
  const issued = params.get('issued') === '1';
  const { api } = useAuth();
  const query = useQuery({
    queryKey: credentialQueryKey(credentialId),
    queryFn: ({ signal }) => fetchCredential(api, credentialId, signal),
  });

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && (error.status === 404 || error.code === 'VALIDATION_ERROR')) {
      return (
        <ErrorFallback
          title={t('issuance.result.notFound.title')}
          message={t('issuance.result.notFound.message')}
          action={
            <Link to="/credentials" className={buttonVariants({ variant: 'outline' })}>
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
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  }
  const credential = query.data;
  if (!credential) return <Skeleton className="h-48" />;

  return (
    <>
      <PageHeader
        title={issued ? t('issuance.result.issued') : t('issuance.result.title')}
        {...(issued ? { description: t('issuance.result.issuedDescription') } : {})}
      />
      {issued ? (
        <Alert role="status" className="mb-6 flex items-center gap-2">
          <CircleCheck aria-hidden="true" className="h-5 w-5" />
          {t('issuance.result.issuedDescription')}
        </Alert>
      ) : null}
      <div className="grid max-w-4xl items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t(`credentialTypes.${credential.credentialType}`)}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t('issuance.result.status')}</dt>
                <dd>
                  <StatusBadge tone={STATUS_TONES[credential.effectiveStatus]}>
                    {t(`holders.statuses.${credential.effectiveStatus}`)}
                  </StatusBadge>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('issuance.result.id')}</dt>
                <dd className="font-mono text-sm break-all">{credential.id}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('issuance.result.type')}</dt>
                <dd className="font-medium">{t(`credentialTypes.${credential.credentialType}`)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('issuance.result.expiresAt')}</dt>
                <dd className="font-medium">
                  <time dateTime={credential.expiresAt}>
                    {formatColomboDate(credential.expiresAt, language) ?? credential.expiresAt}
                  </time>
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">{t('issuance.result.holder')}</dt>
                <dd className="font-medium">
                  <Link
                    to={`/holders/${credential.holder.id}`}
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    {credential.holder.fullName}
                  </Link>{' '}
                  <span className="font-mono text-sm text-muted-foreground">
                    {credential.holder.externalRef}
                  </span>
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        {credential.effectiveStatus === 'pending' ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode aria-hidden="true" className="h-5 w-5" />
                {t('issuance.result.walletOffer')}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-start gap-4">
              <p className="text-sm text-muted-foreground">
                {t('issuance.result.walletOfferDescription')}
              </p>
              <Link
                to={`/credentials/${credential.id}/offer`}
                className={buttonVariants({ variant: 'default' })}
              >
                {t('issuance.result.createOffer')}
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
      {!issued ? (
        <p className="mt-4 text-sm text-muted-foreground">{t('issuance.result.moreActions')}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to={`/holders/${credential.holder.id}`}
          className={buttonVariants({ variant: 'outline' })}
        >
          {t('issuance.result.backToHolder')}
        </Link>
        <Link to="/credentials/new" className={buttonVariants({ variant: 'outline' })}>
          {t('issuance.result.issueAnother')}
        </Link>
      </div>
    </>
  );
}
