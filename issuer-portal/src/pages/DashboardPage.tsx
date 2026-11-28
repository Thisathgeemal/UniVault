/**
 * Issuer dashboard (landing page after sign-in): credential totals, a status breakdown and the
 * organisation's recent activity, from GET /dashboard/summary (docs/frontend/issuer-portal.md,
 * "Dashboard"). The backend scopes everything to the signed-in staff member's issuer.
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
  cn,
  EmptyState,
  PageHeader,
  Skeleton,
  StackedBar,
  StatCard,
  type StackedBarSegment,
} from '@univault/portal-ui';
import {
  CalendarClock,
  CalendarX,
  FileBadge,
  Hourglass,
  Inbox,
  RefreshCw,
  Replace,
  ShieldCheck,
  ShieldX,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  DASHBOARD_SUMMARY_QUERY_KEY,
  fetchDashboardSummary,
  type DashboardSummary,
} from '../api/dashboard.js';
import { useAuth } from '../auth/auth-context.js';
import { RouterLink } from '../components/RouterLink.js';
import { activityAction, credentialTypeLabel, shortId } from '../lib/activity.js';
import { apiErrorMessage } from '../lib/api-errors.js';
import {
  formatColomboDateTime,
  formatNumber,
  formatPercent,
  formatRelativeTime,
} from '../lib/format.js';
import { STATUS_PRESENTATION } from '../credentials/status.js';

/** Counts are live: refetched after 30 s and whenever the window regains focus. */
export const DASHBOARD_STALE_TIME_MS = 30_000;

type CountKey = keyof DashboardSummary['counts'];
interface CardSpec {
  key: CountKey;
  href: string;
  icon: LucideIcon;
}

const credentialsWith = (effectiveStatus: string) =>
  `/credentials?effectiveStatus=${effectiveStatus}`;

// Each card opens the credential list with the matching effectiveStatus filter. "Issued" has
// no single status (it is active + revoked + superseded + expired) and "expiring soon" no
// filter of its own, so they open the unfiltered list and the Active tab sorted by expiry.
const PRIMARY_CARDS: readonly CardSpec[] = [
  { key: 'issued', href: '/credentials', icon: FileBadge },
  { key: 'active', href: credentialsWith('valid'), icon: ShieldCheck },
  { key: 'revoked', href: credentialsWith('revoked'), icon: ShieldX },
];
const SECONDARY_CARDS: readonly CardSpec[] = [
  { key: 'awaitingWallet', href: credentialsWith('pending'), icon: Hourglass },
  { key: 'superseded', href: credentialsWith('superseded'), icon: Replace },
  { key: 'expired', href: credentialsWith('expired'), icon: CalendarX },
  { key: 'expiringSoon', href: `${credentialsWith('valid')}&sort=expires`, icon: CalendarClock },
  { key: 'holders', href: '/holders', icon: Users },
];

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { user, api } = useAuth();
  const language = i18n.language;
  const query = useQuery({
    queryKey: [...DASHBOARD_SUMMARY_QUERY_KEY, user?.issuer.id ?? null],
    queryFn: ({ signal }) => fetchDashboardSummary(api, signal),
    staleTime: DASHBOARD_STALE_TIME_MS,
    refetchOnWindowFocus: true,
    enabled: user !== null,
  });
  if (!user) return null; // the protected layout only renders pages for a signed-in user

  const summary = query.data;
  const loading = query.isPending;
  const retry = () => void query.refetch();
  const lastUpdated = summary ? formatColomboDateTime(summary.generatedAt, language) : null;

  const renderCards = (specs: readonly CardSpec[], size: 'lg' | 'md') =>
    specs.map(({ key, href, icon: Icon }) => (
      <li key={key}>
        <StatCard
          label={t(`dashboard.cards.${key}.label`, { days: summary?.expiringSoonDays ?? 30 })}
          value={summary ? formatNumber(summary.counts[key], language) : ''}
          description={t(`dashboard.cards.${key}.description`)}
          href={href}
          linkComponent={RouterLink}
          icon={<Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} />}
          size={size}
          loading={loading}
        />
      </li>
    ));

  const error = query.isError ? apiErrorMessage(query.error, t) : null;
  const errorAlert = error ? (
    <Alert
      variant="destructive"
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3"
    >
      <div className="flex flex-col gap-1">
        <p className="font-medium">{t('dashboard.loadFailed')}</p>
        <p>{error.message}</p>
        {error.reference ? <p className="font-mono text-caption">{error.reference}</p> : null}
      </div>
      <Button variant="secondary" onClick={retry} disabled={query.isFetching}>
        {t('common.tryAgain')}
      </Button>
    </Alert>
  ) : null;

  const refreshing = query.isFetching && !loading;
  return (
    <>
      <PageHeader
        title={summary?.issuer.name ?? user.issuer.name}
        {...(lastUpdated ? { description: t('dashboard.lastUpdated', { time: lastUpdated }) } : {})}
        actions={
          <Button variant="secondary" onClick={retry} disabled={query.isFetching}>
            <RefreshCw aria-hidden="true" className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            {refreshing ? t('dashboard.refreshing') : t('dashboard.refresh')}
          </Button>
        }
      />

      {errorAlert}

      {/* Without data and with an error, the alert above is the whole page */}
      {error && !summary ? null : (
        <div className="flex flex-col gap-6" aria-busy={loading}>
          {loading ? (
            <p role="status" className="sr-only">
              {t('dashboard.loading')}
            </p>
          ) : null}

          <ul aria-label={t('dashboard.primaryLabel')} className="grid gap-4 sm:grid-cols-3">
            {renderCards(PRIMARY_CARDS, 'lg')}
          </ul>
          <ul
            aria-label={t('dashboard.secondaryLabel')}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
          >
            {renderCards(SECONDARY_CARDS, 'md')}
          </ul>

          {loading ? (
            <div className="grid gap-6 lg:grid-cols-2" data-testid="dashboard-skeleton">
              <Skeleton className="h-40" />
              <Skeleton className="h-40" />
            </div>
          ) : summary ? (
            <DashboardDetails summary={summary} />
          ) : null}
        </div>
      )}
    </>
  );
}

/** Breakdown and activity (or the empty state) once the summary has loaded. */
function DashboardDetails({ summary }: { summary: DashboardSummary }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { counts } = summary;
  const empty = counts.issued === 0 && counts.awaitingWallet === 0;

  const segments: StackedBarSegment[] = (
    [
      ['active', STATUS_PRESENTATION.valid.set],
      ['revoked', STATUS_PRESENTATION.revoked.set],
      ['superseded', STATUS_PRESENTATION.superseded.set],
      ['expired', STATUS_PRESENTATION.expired.set],
    ] as const
  ).map(([key, tone]) => ({
    id: key,
    label: t(`dashboard.cards.${key}.label`),
    value: counts[key],
    valueText: t('dashboard.breakdown.value', {
      count: formatNumber(counts[key], language),
      percent: formatPercent(counts.issued > 0 ? counts[key] / counts.issued : 0, language),
    }),
    tone,
  }));

  const activity =
    summary.recentActivity.length > 0 ? (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.activity.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y divide-border" data-testid="recent-activity">
            {summary.recentActivity.map((event, index) => {
              const absolute = formatColomboDateTime(event.at, language) ?? event.at;
              const relative = formatRelativeTime(event.at, summary.generatedAt, language);
              return (
                <li
                  key={`${event.credentialId}-${event.at}-${event.toStatus}-${index}`}
                  className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
                >
                  <p className="font-medium">{activityAction(event, t)}</p>
                  <p className="text-body-sm text-text-muted">
                    {credentialTypeLabel(event.credentialType, t)}
                    {' · '}
                    <span title={event.credentialId}>
                      {t('dashboard.activity.credential', { id: shortId(event.credentialId) })}
                    </span>
                    {' · '}
                    {event.staffName ?? t('dashboard.activity.byWallet')}
                  </p>
                  <p className="text-body-sm text-text-muted">
                    <time dateTime={event.at}>
                      {relative ? `${relative} · ${absolute}` : absolute}
                    </time>
                  </p>
                </li>
              );
            })}
          </ol>
        </CardContent>
      </Card>
    ) : (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.activity.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-body-sm text-text-muted">{t('dashboard.activity.empty')}</p>
        </CardContent>
      </Card>
    );

  if (empty) {
    return (
      <>
        <EmptyState
          title={t('dashboard.empty.title')}
          description={t('dashboard.empty.description')}
          icon={<Inbox className="h-10 w-10" />}
          action={
            <Link to="/holders" className={buttonVariants({ variant: 'primary' })}>
              {t('dashboard.empty.action')}
            </Link>
          }
        />
        {/* e.g. a credential revoked before it was ever signed */}
        {summary.recentActivity.length > 0 ? activity : null}
      </>
    );
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.breakdown.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {counts.issued > 0 ? (
            <StackedBar label={t('dashboard.breakdown.title')} segments={segments} />
          ) : (
            <p className="text-body-sm text-text-muted">{t('dashboard.breakdown.noneIssued')}</p>
          )}
        </CardContent>
      </Card>
      {activity}
    </div>
  );
}
