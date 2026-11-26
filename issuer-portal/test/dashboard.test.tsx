/**
 * Dashboard page (GET /dashboard/summary): counts and number formatting, card links and
 * accessible names, the status bar, recent activity wording, loading / error + retry / empty
 * states, refresh and query settings, Sinhala, and officer + admin access.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { DashboardSummary } from '../src/api/dashboard.js';
import { si } from '../src/i18n/locales/si.js';
import { i18n } from '../src/i18n/index.js';
import { activityAction, credentialTypeLabel, reasonLabel, shortId } from '../src/lib/activity.js';
import { apiErrorMessage } from '../src/lib/api-errors.js';
import { ApiError } from '../src/api/errors.js';
import { formatNumber, formatPercent, formatRelativeTime } from '../src/lib/format.js';
import { ADMIN, API, DEMO_SUMMARY, errorBody, OFFICER, requests, server } from './mock-backend.js';
import { renderApp } from './render-app.js';

const summaryRequests = () => requests.filter((r) => r.path === '/dashboard/summary');
const respondWith = (summary: DashboardSummary) =>
  server.use(http.get(`${API}/dashboard/summary`, () => HttpResponse.json(summary)));
const withCounts = (counts: Partial<DashboardSummary['counts']>): DashboardSummary => ({
  ...DEMO_SUMMARY,
  counts: { ...DEMO_SUMMARY.counts, ...counts },
});
const t = i18n.t.bind(i18n);

async function openDashboard(as = ADMIN) {
  const view = renderApp('/', { signedInAs: as });
  // First render of the file: allow for a slow, busy machine (the suite runs in parallel)
  await screen.findByRole('link', { name: 'Issued 12,345' }, { timeout: 5000 });
  return view;
}

describe('dashboard – counts and cards', () => {
  it('shows every count, formatted with Intl.NumberFormat, with plain-language descriptions', async () => {
    await openDashboard();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Serendib Trading Company (Demo)' }),
    ).toBeInTheDocument();
    const expected: [string, string][] = [
      ['Issued 12,345', "Credentials signed into holders' wallets so far"],
      ['Active 11,000', "Credentials currently valid in holders' wallets"],
      ['Revoked 845', 'Credentials withdrawn after they were issued'],
      ['Awaiting wallet 3', 'Created, waiting for the holder to scan the QR code'],
      ['Superseded 300', 'Replaced by a newer credential'],
      ['Expired 200', 'Past their expiry date'],
      ['Expiring in 30 days 4', 'Active credentials that expire soon'],
      ['Holders 25', 'Holder records in your organisation'],
    ];
    for (const [name, description] of expected) {
      expect(screen.getByRole('link', { name })).toHaveAccessibleDescription(description);
    }
  });

  it('groups three primary and five secondary cards', async () => {
    await openDashboard();
    const primary = screen.getByRole('list', { name: 'Credential totals' });
    const secondary = screen.getByRole('list', { name: 'More figures' });
    expect(within(primary).getAllByRole('link')).toHaveLength(3);
    expect(within(secondary).getAllByRole('link')).toHaveLength(5);
  });

  it('links each card to the credential list with the matching effectiveStatus filter', async () => {
    const { user, location } = await openDashboard();
    const hrefs: [string, string][] = [
      ['Issued 12,345', '/credentials'],
      ['Active 11,000', '/credentials?effectiveStatus=valid'],
      ['Revoked 845', '/credentials?effectiveStatus=revoked'],
      ['Awaiting wallet 3', '/credentials?effectiveStatus=pending'],
      ['Superseded 300', '/credentials?effectiveStatus=superseded'],
      ['Expired 200', '/credentials?effectiveStatus=expired'],
      ['Expiring in 30 days 4', '/credentials?effectiveStatus=valid&sort=expires'],
      ['Holders 25', '/holders'],
    ];
    for (const [name, href] of hrefs) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', href);
    }
    await user.click(screen.getByRole('link', { name: 'Revoked 845' }));
    expect(location()).toBe('/credentials?effectiveStatus=revoked');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Credentials' }),
    ).toBeInTheDocument();
  });

  it('shows "Last updated" from generatedAt in Asia/Colombo time', async () => {
    await openDashboard();
    // 06:00 UTC = 11:30 in Sri Lanka, whatever the test machine's time zone
    expect(screen.getByText(/^Last updated .*11:30.*\(Sri Lanka time\)$/)).toBeInTheDocument();
  });

  it('is shown to officers too, with the officer token', async () => {
    renderApp('/', { signedInAs: OFFICER });
    expect(await screen.findByRole('link', { name: 'Active 11,000' })).toBeInTheDocument();
    expect(summaryRequests()[0]?.authorization).toMatch(/^Bearer /);
  });
});

describe('dashboard – status breakdown', () => {
  it('is a named figure with a legend of every status, number and share (not colour only)', async () => {
    await openDashboard();
    const figure = screen.getByRole('figure', { name: 'Status of issued credentials' });
    expect(
      within(figure)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Active11,000 (89%)', 'Revoked845 (7%)', 'Superseded300 (2%)', 'Expired200 (2%)']);
    expect(figure.querySelectorAll('rect')).toHaveLength(4);
  });

  it('says nothing has been signed yet when only pending credentials exist', async () => {
    respondWith(withCounts({ issued: 0, active: 0, revoked: 0, superseded: 0, expired: 0 }));
    renderApp('/', { signedInAs: ADMIN });
    expect(
      await screen.findByText('No credential has been signed into a wallet yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.queryByText('No credentials issued yet')).not.toBeInTheDocument();
  });
});

describe('dashboard – recent activity', () => {
  it('describes each event in plain words with type, short id, staff and both times', async () => {
    await openDashboard();
    const list = screen.getByTestId('recent-activity');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveTextContent('Revoked – employment ended');
    expect(items[0]).toHaveTextContent(
      'Employment credential · Credential 3f2a9c1b… · Serendib Trading Company (Demo) Admin',
    );
    // generatedAt 06:00Z; event 03:30Z = 9:00 in Colombo, two and a half hours earlier
    expect(within(items[0]!).getByText(/^2 hours ago · .*9:00/)).toHaveAttribute(
      'datetime',
      '2026-11-25T03:30:00.000Z',
    );
    expect(within(items[0]!).getByText('Credential 3f2a9c1b…')).toHaveAttribute(
      'title',
      '3f2a9c1b-0000-4000-8000-000000000001',
    );
    expect(items[1]).toHaveTextContent('Signed into wallet');
    expect(items[1]).toHaveTextContent("Holder's wallet"); // no staff member for wallet events
    expect(items[2]).toHaveTextContent('Replaced by a new credential');
    expect(items[2]).toHaveTextContent('KYC credential');
    expect(within(items[2]!).getByText(/^yesterday · /)).toBeInTheDocument();
    expect(items[3]).toHaveTextContent('Created – waiting for the wallet');
    expect(within(items[3]!).getByText(/^5 days ago · /)).toBeInTheDocument();
  });

  it('words every event type and reason', () => {
    const wording: [Parameters<typeof activityAction>[0], string][] = [
      [{ fromStatus: null, toStatus: 'pending', reason: null }, 'Created – waiting for the wallet'],
      [{ fromStatus: 'pending', toStatus: 'valid', reason: null }, 'Signed into wallet'],
      [
        { fromStatus: 'valid', toStatus: 'superseded', reason: 'details_changed' },
        'Replaced by a new credential',
      ],
      [
        { fromStatus: 'valid', toStatus: 'revoked', reason: 'employment_ended' },
        'Revoked – employment ended',
      ],
      [
        { fromStatus: 'pending', toStatus: 'revoked', reason: 'issued_in_error' },
        'Revoked – issued in error',
      ],
      [
        { fromStatus: 'valid', toStatus: 'revoked', reason: 'wallet_lost_or_compromised' },
        'Revoked – wallet lost or compromised',
      ],
      [
        { fromStatus: 'valid', toStatus: 'revoked', reason: 'relationship_ended' },
        'Revoked – relationship ended',
      ],
      [
        { fromStatus: 'valid', toStatus: 'revoked', reason: 'details_changed' },
        'Revoked – details changed',
      ],
      [{ fromStatus: 'valid', toStatus: 'revoked', reason: 'other' }, 'Revoked – other reason'],
      [{ fromStatus: 'valid', toStatus: 'revoked', reason: null }, 'Revoked – no reason given'],
      [
        { fromStatus: 'valid', toStatus: 'revoked', reason: 'some_new_code' },
        'Revoked – no reason given',
      ],
      [
        { fromStatus: 'valid', toStatus: 'valid', reason: 'dev_simulated_expiry' },
        'Expiry simulated (development)',
      ],
      [{ fromStatus: 'valid', toStatus: 'valid', reason: null }, 'Status changed'],
    ];
    for (const [event, text] of wording) expect(activityAction(event, t)).toBe(text);
    expect(reasonLabel('validity_extension', t)).toBe('validity extended');
    expect(credentialTypeLabel('SomeFutureCredential', t)).toBe('SomeFutureCredential');
    expect(shortId('short')).toBe('short');
  });

  it('says so when there is no activity yet', async () => {
    respondWith({ ...DEMO_SUMMARY, recentActivity: [] });
    renderApp('/', { signedInAs: ADMIN });
    expect(await screen.findByText('No activity yet.')).toBeInTheDocument();
  });
});

describe('dashboard – states', () => {
  it('shows skeletons and a loading status until the summary arrives', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    server.use(
      http.get(`${API}/dashboard/summary`, async () => {
        await gate;
        return HttpResponse.json(DEMO_SUMMARY);
      }),
    );
    renderApp('/', { signedInAs: ADMIN });
    // (the session-restore spinner is a status too, so look for the dashboard's own text)
    expect(await screen.findByText('Loading the dashboard…')).toHaveAttribute('role', 'status');
    expect(screen.getAllByTestId('stat-skeleton')).toHaveLength(8);
    expect(screen.getByTestId('dashboard-skeleton')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Issued' })).toBeInTheDocument(); // label only
    // The header is there at once (organisation from the session)
    expect(screen.getByRole('heading', { level: 1, name: ADMIN.issuer.name })).toBeInTheDocument();
    release();
    expect(await screen.findByRole('link', { name: 'Issued 12,345' })).toBeInTheDocument();
    expect(screen.queryAllByTestId('stat-skeleton')).toHaveLength(0);
    expect(screen.queryByText('Loading the dashboard…')).not.toBeInTheDocument();
  });

  it('shows the error with its reference and recovers with Try again', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/dashboard/summary`, () =>
        fail
          ? HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 })
          : HttpResponse.json(DEMO_SUMMARY),
      ),
    );
    const { user } = renderApp('/', { signedInAs: ADMIN });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The dashboard could not be loaded.');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).toHaveTextContent('Reference: req-test-0001');
    expect(screen.queryByRole('link', { name: /^Issued/ })).not.toBeInTheDocument();
    expect(alert).not.toHaveTextContent('boom'); // never the server's internal message
    fail = false;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Issued 12,345' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the network message when the server cannot be reached', async () => {
    server.use(http.get(`${API}/dashboard/summary`, () => HttpResponse.error()));
    renderApp('/', { signedInAs: ADMIN });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cannot reach the UniVault server. Check your connection and try again.',
    );
  });

  it('keeps the last numbers and shows the error when a refresh fails', async () => {
    const { user } = await openDashboard();
    server.use(
      http.get(`${API}/dashboard/summary`, () =>
        HttpResponse.json(errorBody('RATE_LIMITED', 'Too many'), { status: 429 }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many requests. Wait a minute, then try again.',
    );
    expect(screen.getByRole('link', { name: 'Issued 12,345' })).toBeInTheDocument();
  });

  it('empty organisation: zeros in the cards, a friendly message and a link to Holders', async () => {
    respondWith({
      ...withCounts({
        issued: 0,
        active: 0,
        revoked: 0,
        superseded: 0,
        expired: 0,
        awaitingWallet: 0,
        expiringSoon: 0,
        holders: 0,
      }),
      recentActivity: [],
    });
    const { user, location } = renderApp('/', { signedInAs: OFFICER });
    expect(
      await screen.findByRole('heading', { level: 2, name: 'No credentials issued yet' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Start by adding a holder record/)).toBeInTheDocument();
    for (const name of ['Issued 0', 'Active 0', 'Revoked 0', 'Holders 0']) {
      expect(screen.getByRole('link', { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole('figure')).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-activity')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Go to Holders' }));
    expect(location()).toBe('/holders');
  });

  it('empty state still lists activity when there is some (e.g. revoked before signing)', async () => {
    respondWith({
      ...withCounts({
        issued: 0,
        active: 0,
        revoked: 0,
        superseded: 0,
        expired: 0,
        awaitingWallet: 0,
      }),
      recentActivity: [
        {
          credentialId: 'b0b0b0b0-0000-4000-8000-000000000009',
          credentialType: 'EmploymentCredential',
          fromStatus: 'pending',
          toStatus: 'revoked',
          reason: 'issued_in_error',
          staffName: 'Serendib Trading Company (Demo) Admin',
          at: '2026-11-25T05:00:00.000Z',
        },
      ],
    });
    renderApp('/', { signedInAs: ADMIN });
    expect(await screen.findByText('No credentials issued yet')).toBeInTheDocument();
    expect(screen.getByText('Revoked – issued in error')).toBeInTheDocument();
  });
});

describe('dashboard – refresh and query settings', () => {
  it('Refresh fetches the summary again', async () => {
    const { user } = await openDashboard();
    expect(summaryRequests()).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(summaryRequests()).toHaveLength(2));
    expect(await screen.findByRole('button', { name: 'Refresh' })).toBeEnabled();
  });

  it('keeps the summary fresh for 30 s and refetches on window focus', async () => {
    const { queryClient } = await openDashboard();
    const [query] = queryClient.getQueryCache().findAll({ queryKey: ['dashboard', 'summary'] });
    expect(query?.options).toMatchObject({ staleTime: 30_000, refetchOnWindowFocus: true });
    expect(query?.queryKey).toEqual(['dashboard', 'summary', 'employer-a']);
  });
});

describe('dashboard – Sinhala', () => {
  it('renders the cards, breakdown and activity in Sinhala', async () => {
    const { user } = await openDashboard();
    await user.selectOptions(screen.getByLabelText('Language'), 'si');
    expect(
      await screen.findByRole('link', { name: `${si.dashboard.cards.active.label} 11,000` }),
    ).toHaveAccessibleDescription(si.dashboard.cards.active.description);
    expect(
      screen.getByRole('link', {
        name: `${si.dashboard.cards.expiringSoon.label.replace('{{days}}', '30')} 4`,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('figure', { name: si.dashboard.breakdown.title })).toBeInTheDocument();
    expect(screen.getByText(si.dashboard.activity.actions.signed)).toBeInTheDocument();
    expect(screen.getByText(si.dashboard.activity.byWallet, { exact: false })).toBeInTheDocument();
    expect(
      screen.getByText(
        si.dashboard.activity.actions.revoked.replace(
          '{{reason}}',
          si.dashboard.activity.reasons.employment_ended,
        ),
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: si.dashboard.refresh })).toBeInTheDocument();
  });
});

describe('format and error helpers', () => {
  it('formats numbers, percentages and relative times per language', () => {
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
    expect(formatNumber(1234567, 'si')).toMatch(/^1.?234.?567$/);
    expect(formatPercent(0.734, 'en')).toBe('73%');
    const ref = '2026-11-25T06:00:00.000Z';
    expect(formatRelativeTime('2026-11-25T05:59:40.000Z', ref, 'en')).toBe('this minute');
    expect(formatRelativeTime('2026-11-25T05:30:00.000Z', ref, 'en')).toBe('30 minutes ago');
    expect(formatRelativeTime('2025-10-01T06:00:00.000Z', ref, 'en')).toBe('last year');
    expect(formatRelativeTime('not-a-date', ref, 'en')).toBeNull();
    expect(formatRelativeTime(ref, 'not-a-date', 'en')).toBeNull();
  });

  it('maps any error to a safe message (non-ApiError, network, 429, other with reference)', () => {
    expect(apiErrorMessage(new Error('x'), t)).toEqual({
      message: 'Something went wrong. Please try again.',
    });
    expect(
      apiErrorMessage(new ApiError({ status: 503, code: 'X', message: 'internal detail' }), t),
    ).toEqual({ message: 'Something went wrong. Please try again.' });
  });
});
