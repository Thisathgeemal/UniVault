/**
 * The wallet offer screen (/credentials/:credentialId/offer, Decision 021,
 * docs/frontend/issuer-portal.md §11).
 *
 * Opening it creates a one-time OpenID4VCI offer for a PENDING credential and shows it as a QR
 * code with a countdown; the status is polled every 5 s (and on window focus) until it ends:
 * redeemed, replaced, cancelled, withdrawn (credential revoked/reissued) or expired.
 *
 * SECRET RULES (the QR text holds the pre-authorised code):
 *   - the create response lives in this component's state only: never in the URL, storage,
 *     the TanStack Query caches or the console; leaving the page drops it;
 *   - it is never fetched again: opened without it while an offer is still active (reload,
 *     back button, second tab), the page says so and offers "Generate new QR code";
 *   - the developer panel (decoded credential_offer) exists in non-production builds only.
 *
 * Time: the countdown uses the server's clock (serverTime in every response, offset measured
 * per request), so a wrong PC clock cannot show a usable QR code that the server has already
 * expired. The server's status always wins over the countdown.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  buttonVariants,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Countdown,
  ErrorFallback,
  FullscreenOverlay,
  PageHeader,
  QrCode,
  Skeleton,
} from '@univault/portal-ui';
import { CircleCheck, Maximize2, QrCode as QrIcon, RefreshCw, XCircle } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { fetchCredential, type CredentialMetadata } from '../../api/credentials.js';
import { ApiError } from '../../api/errors.js';
import {
  cancelOffer,
  createOffer,
  fetchOffer,
  isFinalStatus,
  OFFER_QUERY_ROOT,
  offerQueryKey,
  offerView,
  type CreatedOffer,
  type OfferView,
  type Timed,
} from '../../api/offers.js';
import { useAuth } from '../../auth/auth-context.js';
import { apiErrorMessage } from '../../lib/api-errors.js';
import { formatColomboTime } from '../../lib/format.js';
import { LAST_MINUTE_SECONDS, OFFER_POLL_INTERVAL_MS } from '../../offers/offer-config.js';
import { useNow } from '../../offers/use-now.js';

type Session =
  | { kind: 'none' }
  | { kind: 'creating' }
  | { kind: 'shown'; offer: Timed<CreatedOffer> }
  | { kind: 'failed'; error: unknown };

/** The credential as this screen needs it: fresh on every visit, dropped on leaving. */
const contextQueryKey = (credentialId: string) =>
  ['credentials', 'offer-context', credentialId] as const;

export function CredentialOfferPage() {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { credentialId = '' } = useParams();
  const { api } = useAuth();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session>({ kind: 'none' });
  const [confirming, setConfirming] = useState<'regenerate' | 'cancel' | null>(null);
  const [fullScreen, setFullScreen] = useState(false);
  const [cancelError, setCancelError] = useState<unknown>(null);
  const autoStarted = useRef(false);
  const now = useNow(1000);

  const credentialQuery = useQuery({
    queryKey: contextQueryKey(credentialId),
    queryFn: ({ signal }) => fetchCredential(api, credentialId, signal),
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const credential = credentialQuery.data;

  const offer = session.kind === 'shown' ? session.offer : null;
  const offerId = offer?.value.offerId;
  const statusQuery = useQuery({
    queryKey: offerQueryKey(offerId ?? 'none'),
    queryFn: ({ signal }) => fetchOffer(api, offerId!, signal),
    enabled: (query) =>
      offerId !== undefined && !isFinalStatus(query.state.data?.value.status ?? 'active'),
    refetchInterval: OFFER_POLL_INTERVAL_MS,
    refetchOnWindowFocus: 'always',
    gcTime: 0,
  });
  const polled = offerId !== undefined ? statusQuery.data : undefined;

  // Leaving the page drops every offer query (they hold no code, but nothing should linger)
  useEffect(
    () => () => {
      queryClient.removeQueries({ queryKey: OFFER_QUERY_ROOT });
    },
    [queryClient],
  );

  /** Creates an offer; state changes only after the response (safe to call from an effect). */
  const requestOffer = async () => {
    try {
      const created = await createOffer(api, credentialId);
      setSession({ kind: 'shown', offer: created });
    } catch (error) {
      setSession({ kind: 'failed', error });
      if (error instanceof ApiError && error.code === 'CREDENTIAL_NOT_PENDING') {
        void credentialQuery.refetch();
      }
    }
  };

  const generate = () => {
    setConfirming(null);
    setFullScreen(false);
    setCancelError(null);
    setSession({ kind: 'creating' });
    void requestOffer();
  };

  // First visit: a pending credential with no active offer gets one at once. With an active
  // offer the code cannot be shown again (it is never re-fetched): the page says so instead.
  const autoCreate =
    credential !== undefined &&
    credential.status === 'pending' &&
    !credential.activeOffer &&
    session.kind === 'none';
  useEffect(() => {
    if (!autoCreate || autoStarted.current) return;
    autoStarted.current = true; // once, also under StrictMode's double effects
    void requestOffer();
  });

  // Countdown on the server's clock: the newest measured offset wins. Rounded DOWN, so the
  // screen never shows more time than the server allows (the clock is re-read each second)
  const offsetMs = polled?.offsetMs ?? offer?.offsetMs ?? 0;
  const expiresAt = polled?.value.expiresAt ?? offer?.value.expiresAt;
  const secondsLeft = expiresAt ? Math.floor((Date.parse(expiresAt) - (now + offsetMs)) / 1000) : 0;
  const serverStatus = polled?.value.status ?? 'active';
  const view: OfferView | null = offer
    ? offerView(serverStatus, polled?.value.invalidationReason ?? null, secondsLeft)
    : null;

  // The countdown reached zero while the server last said "active": ask the server now
  // (its answer is authoritative; polling continues until it confirms a final state)
  const expiredLocally = view === 'expired' && serverStatus === 'active';
  useEffect(() => {
    if (expiredLocally && offerId) {
      void queryClient.refetchQueries({ queryKey: offerQueryKey(offerId) });
    }
  }, [expiredLocally, offerId, queryClient]);

  // A redeemed offer changed the credential: let other pages reload it
  useEffect(() => {
    if (view === 'redeemed') void queryClient.invalidateQueries({ queryKey: ['credentials'] });
  }, [view, queryClient]);

  const cancel = async () => {
    setConfirming(null);
    if (!offerId) return;
    try {
      const result = await cancelOffer(api, offerId);
      queryClient.setQueryData(offerQueryKey(offerId), result);
    } catch (error) {
      setCancelError(error);
      void statusQuery.refetch(); // e.g. 409 OFFER_NOT_ACTIVE: show what really happened
    }
  };

  const backLink = (
    <Link to={`/credentials/${credentialId}`} className={buttonVariants({ variant: 'outline' })}>
      {t('offer.actions.backToCredential')}
    </Link>
  );

  if (credentialQuery.isError) {
    const error = credentialQuery.error;
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
    return (
      <Alert variant="destructive" role="alert" className="flex flex-col items-start gap-2">
        <p className="font-medium">{t('issuance.result.loadFailed')}</p>
        <p>{apiErrorMessage(error, t).message}</p>
        <Button variant="outline" size="sm" onClick={() => void credentialQuery.refetch()}>
          {t('common.tryAgain')}
        </Button>
      </Alert>
    );
  }
  if (!credential) {
    return (
      <>
        <PageHeader title={t('offer.title')} />
        <p className="sr-only" role="status">
          {t('offer.loading')}
        </p>
        <Skeleton className="h-80 max-w-4xl" />
      </>
    );
  }

  const generateButton = (variant: 'default' | 'outline' = 'default') => (
    <Button
      variant={variant}
      onClick={() => (view === 'active' ? setConfirming('regenerate') : generate())}
      disabled={session.kind === 'creating'}
    >
      <RefreshCw aria-hidden="true" className="h-4 w-4" />
      {t('offer.actions.regenerate')}
    </Button>
  );

  // Not (or no longer) pending, before any offer was shown
  if (credential.status !== 'pending' && !offer) {
    return (
      <>
        <PageHeader title={t('offer.title')} />
        <StatePanel
          title={t('offer.states.notPending.title')}
          message={t('offer.states.notPending.message', {
            status: t(`holders.statuses.${credential.effectiveStatus}`),
          })}
          tone="neutral"
        />
        <div className="mt-6">{backLink}</div>
      </>
    );
  }

  const announcement =
    view === 'active'
      ? Math.ceil(secondsLeft / 60) <= 1
        ? t('offer.announceLastMinute')
        : t('offer.announceMinutes', { minutes: Math.ceil(secondsLeft / 60) })
      : undefined;
  const lastMinute = view === 'active' && secondsLeft <= LAST_MINUTE_SECONDS;
  const expiresTime = expiresAt ? formatColomboTime(expiresAt, language) : null;

  return (
    <>
      <PageHeader title={t('offer.title')} description={t('offer.description')} />
      <div className="grid max-w-5xl items-start gap-6 lg:grid-cols-[auto_1fr]">
        <Card>
          <CardContent className="flex min-h-80 min-w-80 items-center justify-center p-6">
            {offer && view === 'active' ? (
              <QrCode value={offer.value.qrContent} label={t('offer.qrAlt')} size={288} />
            ) : (
              <QrPlaceholder
                session={session}
                view={view}
                hasActiveOffer={Boolean(credential.activeOffer)}
                credentialId={credentialId}
                autoCreate={autoCreate}
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('offer.details')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <OfferFacts credential={credential} />
            {offer && view === 'active' ? (
              <>
                {expiresTime ? (
                  <p className="text-sm">
                    <time dateTime={expiresAt}>{t('offer.expiresAt', { time: expiresTime })}</time>
                  </p>
                ) : null}
                <Countdown
                  seconds={secondsLeft}
                  label={t('offer.timeLeft')}
                  warning={lastMinute}
                  {...(!fullScreen && announcement ? { announcement } : {})}
                />
                {lastMinute ? (
                  <p className="text-sm text-accent-foreground">{t('offer.lastMinute')}</p>
                ) : null}
              </>
            ) : null}
            {session.kind === 'failed' ? <CreateError error={session.error} /> : null}
            {cancelError ? (
              <Alert variant="destructive" role="alert">
                {t('offer.errors.cancelFailed')} {apiErrorMessage(cancelError, t).message}
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-3">
              {view === 'active' ? (
                <Button variant="default" onClick={() => setFullScreen(true)}>
                  <Maximize2 aria-hidden="true" className="h-4 w-4" />
                  {t('offer.actions.fullScreen')}
                </Button>
              ) : null}
              {view !== 'redeemed' && view !== 'withdrawn' && credential.status === 'pending'
                ? generateButton(view === 'active' ? 'outline' : 'default')
                : null}
              {view === 'active' ? (
                <Button variant="destructive" onClick={() => setConfirming('cancel')}>
                  <XCircle aria-hidden="true" className="h-4 w-4" />
                  {t('offer.actions.cancel')}
                </Button>
              ) : null}
              {backLink}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Read inline: the production build turns this into false and drops the panel's code */}
      {!import.meta.env.PROD && offer && view === 'active' ? (
        <DeveloperDetails credentialOffer={offer.value.credentialOffer} />
      ) : null}

      <FullscreenOverlay
        open={fullScreen && view === 'active' && offer !== null}
        title={t('offer.fullScreenTitle')}
        closeLabel={t('offer.actions.closeFullScreen')}
        onClose={() => setFullScreen(false)}
      >
        {offer ? (
          <>
            <QrCode
              value={offer.value.qrContent}
              label={t('offer.qrAlt')}
              size={560}
              className="max-h-[70vh] w-auto"
            />
            <Countdown
              seconds={secondsLeft}
              label={t('offer.timeLeft')}
              warning={lastMinute}
              size="large"
              {...(announcement ? { announcement } : {})}
            />
          </>
        ) : null}
      </FullscreenOverlay>

      <ConfirmDialog
        open={confirming === 'regenerate'}
        title={t('offer.confirmRegenerate.title')}
        message={t('offer.confirmRegenerate.message')}
        confirmLabel={t('offer.confirmRegenerate.confirm')}
        cancelLabel={t('offer.confirmRegenerate.cancel')}
        onConfirm={generate}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming === 'cancel'}
        title={t('offer.confirmCancel.title')}
        message={t('offer.confirmCancel.message')}
        confirmLabel={t('offer.confirmCancel.confirm')}
        cancelLabel={t('offer.confirmCancel.cancel')}
        onConfirm={() => void cancel()}
        onCancel={() => setConfirming(null)}
        tone="destructive"
      />
    </>
  );
}

function OfferFacts({ credential }: { credential: CredentialMetadata }) {
  const { t } = useTranslation();
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      <div>
        <dt className="text-sm text-muted-foreground">{t('offer.holder')}</dt>
        <dd className="font-medium">{credential.holder.fullName}</dd>
      </div>
      <div>
        <dt className="text-sm text-muted-foreground">{t('offer.credentialType')}</dt>
        <dd className="font-medium">{t(`credentialTypes.${credential.credentialType}`)}</dd>
      </div>
    </dl>
  );
}

/** What takes the QR code's place when there is none to show. */
function QrPlaceholder({
  session,
  view,
  hasActiveOffer,
  credentialId,
  autoCreate,
}: {
  session: Session;
  view: OfferView | null;
  hasActiveOffer: boolean;
  credentialId: string;
  autoCreate: boolean;
}) {
  const { t } = useTranslation();
  if (session.kind === 'creating' || autoCreate) {
    return (
      <div className="flex flex-col items-center gap-3" role="status">
        <QrIcon aria-hidden="true" className="h-10 w-10 animate-pulse text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('offer.creating')}</p>
      </div>
    );
  }
  if (view === 'redeemed') {
    return (
      <StatePanel
        title={t('offer.states.redeemed.title')}
        message={t('offer.states.redeemed.message')}
        tone="success"
        action={
          <Link
            to={`/credentials/${credentialId}`}
            className="text-primary underline-offset-2 hover:underline"
          >
            {t('offer.states.redeemed.link')}
          </Link>
        }
      />
    );
  }
  if (view) {
    return (
      <StatePanel
        title={t(`offer.states.${view === 'active' ? 'expired' : view}.title`)}
        message={t(`offer.states.${view === 'active' ? 'expired' : view}.message`)}
        tone={view === 'expired' ? 'warning' : 'neutral'}
      />
    );
  }
  if (session.kind === 'none' && hasActiveOffer) {
    return (
      <StatePanel
        title={t('offer.states.reload.title')}
        message={t('offer.states.reload.message')}
        tone="neutral"
      />
    );
  }
  return <QrIcon aria-hidden="true" className="h-10 w-10 text-muted-foreground" />;
}

function StatePanel({
  title,
  message,
  tone,
  action,
}: {
  title: string;
  message: string;
  tone: 'success' | 'warning' | 'neutral';
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={
        tone === 'warning'
          ? 'flex max-w-72 flex-col items-center gap-2 rounded-md bg-accent p-4 text-center text-accent-foreground'
          : 'flex max-w-72 flex-col items-center gap-2 p-4 text-center'
      }
    >
      {tone === 'success' ? (
        <CircleCheck aria-hidden="true" className="h-10 w-10 text-primary" />
      ) : (
        <QrIcon aria-hidden="true" className="h-10 w-10 text-muted-foreground" />
      )}
      <p className="font-semibold">{title}</p>
      <p className="text-sm">{message}</p>
      {action}
    </div>
  );
}

function CreateError({ error }: { error: unknown }) {
  const { t } = useTranslation();
  const code = error instanceof ApiError ? error.code : undefined;
  if (code === 'CREDENTIAL_NOT_PENDING') return null; // the page shows the credential's state
  const message =
    code === 'CREDENTIAL_EXPIRED'
      ? t('offer.errors.credentialExpired')
      : apiErrorMessage(error, t).message;
  return (
    <Alert variant="destructive" role="alert">
      <p className="font-medium">{t('offer.errors.createFailed')}</p>
      <p>{message}</p>
    </Alert>
  );
}

/** Non-production builds only: the decoded credential_offer, for wallet development. */
function DeveloperDetails({ credentialOffer }: { credentialOffer: Record<string, unknown> }) {
  const { t } = useTranslation();
  return (
    <details className="mt-6 max-w-5xl rounded-md border border-dashed border-border p-4">
      <summary className="cursor-pointer font-medium">{t('offer.dev.summary')}</summary>
      <p className="mt-3 rounded-md bg-accent p-3 text-sm text-accent-foreground">
        {t('offer.dev.warning')}
      </p>
      <p className="mt-3 text-sm text-muted-foreground">{t('offer.dev.label')}</p>
      <pre className="mt-1 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
        {JSON.stringify(credentialOffer, null, 2)}
      </pre>
    </details>
  );
}
