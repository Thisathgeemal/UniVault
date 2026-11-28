/**
 * The credentials table (/credentials): columns and plain status badges, the short id with a
 * copy button, the "expiring soon" hint, tabs with counts, search / sort / paging in the URL
 * (and sent to the backend), dashboard cards landing on the right tab, empty states per tab,
 * loading and error + retry, no ID numbers anywhere, and Sinhala.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { i18n } from '../src/i18n/index.js';
import { si } from '../src/i18n/locales/si.js';
import {
  addPendingCredential,
  ADMIN,
  API,
  BANK_ADMIN,
  errorBody,
  HOLDER_IDS,
  OFFICER,
  requests,
  server,
} from './mock-backend.js';
import { renderApp } from './render-app.js';

const AMAL = 'aaaaaaaa-0000-4000-8000-000000000003';
const listRequests = () =>
  requests.filter((r) => r.method === 'GET' && /^\/credentials\?/.test(r.path)).map((r) => r.path);
const lastList = () => new URLSearchParams(listRequests().at(-1)!.split('?')[1]);

/** One credential of every effective status (employer-a), newest last. */
function seedAll() {
  return {
    valid: addPendingCredential(HOLDER_IDS.lahiru, 'valid'),
    pending: addPendingCredential(HOLDER_IDS.nimesha, 'pending'),
    expired: addPendingCredential(AMAL, 'expired'),
    revoked: addPendingCredential(HOLDER_IDS.nimesha, 'revoked'),
    superseded: addPendingCredential(HOLDER_IDS.lahiru, 'superseded'),
  };
}

async function openTable(path = '/credentials', as = ADMIN) {
  const view = renderApp(path, { signedInAs: as });
  await screen.findByRole('table', { name: 'Credentials' });
  await waitFor(() => expect(screen.queryAllByTestId('data-table-loading-row')).toHaveLength(0));
  return view;
}
const rowOf = (holderName: string, index = 0) =>
  screen.getAllByRole('row').filter((r) => within(r).queryByText(holderName))[index]!;

describe('columns and badges', () => {
  it('shows short id + copy, holder link and reference, type, plain status, issued, expires, actions', async () => {
    const ids = seedAll();
    await openTable();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['ID', 'Holder', 'Type', 'Status', 'Issued', 'Expires', 'Actions']);

    const row = rowOf('Amal Fernando');
    expect(within(row).getByRole('link', { name: ids.expired.slice(0, 8) })).toHaveAttribute(
      'href',
      `/credentials/${ids.expired}`,
    );
    expect(
      within(row).getByRole('button', { name: `Copy credential ID ${ids.expired.slice(0, 8)}` }),
    ).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Amal Fernando' })).toHaveAttribute(
      'href',
      `/holders/${AMAL}`,
    );
    expect(within(row).getByText('STC-00003')).toBeInTheDocument();
    expect(within(row).getByText('Employment credential')).toBeInTheDocument();
    expect(within(row).getByText('Expired')).toBeInTheDocument();
    expect(within(row).getAllByRole('time')).toHaveLength(2);

    // Every effective status in plain words
    const table = screen.getByRole('table', { name: 'Credentials' });
    for (const label of ['Valid', 'Awaiting wallet', 'Expired', 'Revoked', 'Replaced']) {
      expect(within(table).getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(within(table).queryByText('valid')).not.toBeInTheDocument();
    expect(within(table).queryByText('superseded')).not.toBeInTheDocument();
    // A pending credential has not been accepted yet
    const pendingRow = screen
      .getAllByRole('row')
      .find((r) => within(r).queryByText('Awaiting wallet'))!;
    expect(within(pendingRow).getByText('Not yet accepted')).toBeInTheDocument();
  });

  it('hints "expiring soon" for active credentials within 30 days only', async () => {
    const soon = new Date(Date.now() + 10 * 86_400_000 + 3_600_000).toISOString();
    const later = new Date(Date.now() + 45 * 86_400_000).toISOString();
    const today = new Date(Date.now() + 3_600_000).toISOString();
    addPendingCredential(HOLDER_IDS.lahiru, 'valid', { expiresAt: soon });
    addPendingCredential(HOLDER_IDS.nimesha, 'valid', { expiresAt: later });
    addPendingCredential(AMAL, 'valid', { expiresAt: today });
    await openTable();
    expect(within(rowOf('Lahiru Silva')).getByText('Expires in 10 days')).toBeInTheDocument();
    expect(within(rowOf('Nimesha Perera')).queryByText(/Expires in/)).not.toBeInTheDocument();
    expect(within(rowOf('Amal Fernando')).getByText('Expires today')).toBeInTheDocument();
  });

  it('never shows ID numbers or other claims (rows carry name and reference only)', async () => {
    seedAll();
    await openTable();
    const text = document.body.textContent!;
    for (const secret of ['199935300063', '0063', '851234567V', '4567', 'Logistics Coordinator']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('tabs, search, sort and paging – all in the URL', () => {
  it('shows counts on every tab and filters by effective status', async () => {
    seedAll();
    const { user, location } = await openTable();
    const tabs = screen.getByRole('group', { name: 'Filter by status' });
    expect(within(tabs).getByRole('button', { name: 'All 5' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    for (const name of ['Valid 1', 'Awaiting wallet 1', 'Expired 1', 'Revoked 1', 'Replaced 1']) {
      expect(within(tabs).getByRole('button', { name })).toBeInTheDocument();
    }
    await user.click(within(tabs).getByRole('button', { name: 'Expired 1' }));
    expect(location()).toBe('/credentials?effectiveStatus=expired');
    await waitFor(() => expect(lastList().get('effectiveStatus')).toBe('expired'));
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2)); // header + 1
    expect(screen.getByText('Amal Fernando')).toBeInTheDocument();
  });

  it('searches after a pause (q in the URL and the request), resets the page', async () => {
    seedAll();
    const { user, location } = await openTable('/credentials?page=1&size=10');
    await user.type(screen.getByRole('searchbox', { name: 'Search credentials' }), 'amal');
    await waitFor(() => expect(location()).toBe('/credentials?q=amal&size=10'));
    await waitFor(() => expect(lastList().get('q')).toBe('amal'));
    await waitFor(() => expect(screen.queryByText('Lahiru Silva')).not.toBeInTheDocument());
    expect(screen.getByText('Amal Fernando')).toBeInTheDocument();
  });

  it('sorts by holder, issued and expires (both ways) through the column headers', async () => {
    seedAll();
    const { user, location } = await openTable();
    expect(lastList().get('sort')).toBe('newest');
    const header = (name: string) => screen.getByRole('button', { name });
    await user.click(header('Holder'));
    await waitFor(() => expect(location()).toBe('/credentials?sort=holder'));
    await waitFor(() => expect(lastList().get('sort')).toBe('holder'));
    await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Amal Fernando'));
    await user.click(header('Holder'));
    await waitFor(() => expect(location()).toBe('/credentials?sort=holder_desc'));
    await user.click(header('Expires'));
    await waitFor(() => expect(location()).toBe('/credentials?sort=expires'));
    await waitFor(() => expect(screen.getAllByRole('row')[1]).toHaveTextContent('Amal Fernando'));
    await user.click(header('Issued'));
    await waitFor(() => expect(lastList().get('sort')).toMatch(/^(oldest|newest)$/));
  });

  it('pages with the page and size in the URL (offset sent to the backend)', async () => {
    for (let i = 0; i < 12; i += 1) addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user, location } = await openTable('/credentials?size=10');
    expect(screen.getByText('1–10 of 12')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(location()).toBe('/credentials?page=2&size=10'));
    await waitFor(() => expect(lastList().get('offset')).toBe('10'));
    expect(await screen.findByText('11–12 of 12')).toBeInTheDocument();
  });

  it('reads the whole state back from the URL (refresh, Back)', async () => {
    seedAll();
    await openTable('/credentials?effectiveStatus=revoked&q=nim&sort=holder_desc&size=50');
    const params = lastList();
    expect(params.get('effectiveStatus')).toBe('revoked');
    expect(params.get('q')).toBe('nim');
    expect(params.get('sort')).toBe('holder_desc');
    expect(params.get('limit')).toBe('50');
    expect(screen.getByRole('searchbox', { name: 'Search credentials' })).toHaveValue('nim');
    expect(screen.getByRole('button', { name: /^Revoked/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ignores unknown values in the URL', async () => {
    seedAll();
    await openTable('/credentials?effectiveStatus=bogus&sort=x&page=-3&size=7');
    const params = lastList();
    expect(params.get('effectiveStatus')).toBeNull();
    expect(params.get('sort')).toBe('newest');
    expect(params.get('offset')).toBe('0');
    expect(params.get('limit')).toBe('20');
  });

  it('dashboard cards land on the matching tab', async () => {
    seedAll();
    const { user, location } = renderApp('/', { signedInAs: ADMIN });
    await user.click(await screen.findByRole('link', { name: /^Expired/ }));
    expect(location()).toBe('/credentials?effectiveStatus=expired');
    expect(
      await screen.findByRole('button', { name: 'Expired 1', pressed: true }),
    ).toBeInTheDocument();
    await waitFor(() => expect(lastList().get('effectiveStatus')).toBe('expired'));
  });
});

describe('empty, loading and error states', () => {
  it('has an empty state per tab; "All" offers issuing', async () => {
    const { user } = await openTableEmpty();
    expect(screen.getByRole('heading', { name: 'No credentials yet' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Issue credential' })).toHaveLength(2);
    const expectations: [RegExp, string][] = [
      [/^Valid/, 'No valid credentials'],
      [/^Awaiting wallet/, 'Nothing is awaiting a wallet'],
      [/^Expired/, 'No expired credentials'],
      [/^Revoked/, 'No revoked credentials'],
      [/^Replaced/, 'No replaced credentials'],
    ];
    for (const [tab, title] of expectations) {
      await user.click(screen.getByRole('button', { name: tab }));
      expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    }
  });

  it('a search without results offers to clear it', async () => {
    seedAll();
    const { user, location } = await openTableEmpty('/credentials?q=zzz');
    expect(screen.getByRole('heading', { name: 'No credentials match "zzz"' })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Clear search' }).at(-1)!);
    await waitFor(() => expect(location()).toBe('/credentials'));
    expect(await screen.findByText('Amal Fernando')).toBeInTheDocument();
  });

  it('shows skeleton rows while loading, then an error with retry that recovers', async () => {
    seedAll();
    let fail = true;
    server.use(
      http.get(`${API}/credentials`, ({ request }) => {
        if (new URL(request.url).searchParams.get('holderId')) return undefined;
        if (fail) {
          return HttpResponse.json(errorBody('INTERNAL_ERROR', 'x'), { status: 500 });
        }
        return undefined; // fall through to the mock backend
      }),
    );
    const { user } = renderApp('/credentials', { signedInAs: ADMIN });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The credentials could not be loaded.',
    );
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Amal Fernando')).toBeInTheDocument();
  });

  it('keeps "Issue credential" in the header; it opens the holder picker', async () => {
    seedAll();
    const { user, location } = await openTable('/credentials', OFFICER);
    await user.click(screen.getAllByRole('link', { name: 'Issue credential' })[0]!);
    expect(location()).toBe('/credentials/new');
    expect(
      await screen.findByRole('searchbox', { name: 'Search holders by name or reference' }),
    ).toBeInTheDocument();
  });

  it("shows only the staff member's own organisation", async () => {
    seedAll();
    await openTableEmpty('/credentials', BANK_ADMIN);
    expect(screen.getByRole('heading', { name: 'No credentials yet' })).toBeInTheDocument();
  });
});

async function openTableEmpty(path = '/credentials', as = ADMIN) {
  const view = renderApp(path, { signedInAs: as });
  await screen.findByRole('heading', { level: 1, name: 'Credentials' });
  await screen.findByRole('heading', { level: 2 });
  return view;
}

describe('Sinhala', () => {
  it('renders the table, tabs and badges in Sinhala', async () => {
    seedAll();
    await i18n.changeLanguage('si');
    renderApp('/credentials', { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { level: 1, name: si.credentials.title }),
    ).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: si.credentials.list.tableCaption });
    expect(await within(table).findAllByText(si.credentials.statuses.expired)).not.toHaveLength(0);
    expect(
      screen.getByRole('button', { name: new RegExp(`^${si.credentials.list.tabs.valid}`) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: si.credentials.list.columns.holder }),
    ).toBeTruthy();
  });
});
