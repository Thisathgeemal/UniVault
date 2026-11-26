/**
 * Holder list (/holders): table and masked ID numbers, debounced search through the backend,
 * paging and sorting in the URL and the request, both empty states, loading, error + retry,
 * row click to the detail page, and the bank's column label.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { formatColomboDate } from '../src/lib/format.js';
import { readListParams, tableSortOf } from '../src/holders/list-params.js';
import {
  ADMIN,
  API,
  BANK_ADMIN,
  errorBody,
  HOLDER_IDS,
  holderStore,
  requests,
  server,
} from './mock-backend.js';
import { renderApp } from './render-app.js';

const listRequests = () =>
  requests.filter((r) => r.method === 'GET' && r.path.startsWith('/holders?')).map((r) => r.path);
const lastQuery = () => new URLSearchParams(listRequests().at(-1)!.split('?')[1]);
const rows = () =>
  within(screen.getByRole('table', { name: 'Holder records' }))
    .getAllByRole('row')
    .slice(1);

async function openList(path = '/holders', as = ADMIN, waitFor = 'Lahiru Silva') {
  const view = renderApp(path, { signedInAs: as });
  // 5 s: the file's first render is a cold start, slow under coverage with parallel files (Issue 36)
  await screen.findByRole('link', { name: waitFor }, { timeout: 5000 });
  return view;
}

describe('table', () => {
  it('shows name, reference, masked ID number, date added and credential count', async () => {
    await openList();
    expect(screen.getByRole('heading', { level: 1, name: 'Holders' })).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(headers).toEqual(['Name', 'Employee ID', 'ID number', 'Date added', 'Credentials']);
    // Newest first by default
    expect(rows().map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
      'Amal Fernando',
      'Nimesha Perera',
      'Lahiru Silva',
    ]);
    const lahiru = rows()[2]!;
    expect(lahiru).toHaveTextContent('STC-00001');
    expect(lahiru).toHaveTextContent('•••• 0063');
    expect(lahiru).toHaveTextContent('ID number ending in 0063');
    expect(lahiru).not.toHaveTextContent('199935300063'); // never the full number
    // Day/month order depends on the runtime's ICU data: compare with the portal's formatter
    expect(lahiru).toHaveTextContent(formatColomboDate('2026-11-11T04:30:00.000Z', 'en')!);
    expect(within(lahiru).getAllByRole('cell')[4]).toHaveTextContent('3');
    // No NIC recorded
    expect(rows()[1]).toHaveTextContent('None recorded');
  });

  it('bank: the reference column is the customer number', async () => {
    renderApp('/holders', { signedInAs: BANK_ADMIN });
    await screen.findByRole('link', { name: 'Kasun Bandara' });
    expect(screen.getByRole('columnheader', { name: 'Customer number' })).toBeInTheDocument();
    expect(rows()[0]).toHaveTextContent('•••• 4567');
  });

  it('a row click or the name link opens the holder', async () => {
    const { user, location } = await openList();
    await user.click(within(rows()[1]!).getByText('STC-00002'));
    await waitFor(() => expect(location()).toBe(`/holders/${HOLDER_IDS.nimesha}`));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Nimesha Perera' }),
    ).toBeInTheDocument();
  });

  it('"Register holder" in the page header opens the form', async () => {
    const { user, location } = await openList();
    await user.click(screen.getByRole('link', { name: 'Register holder' }));
    expect(location()).toBe('/holders/new');
  });
});

describe('search, paging and sorting', () => {
  it('search is debounced (~300 ms) and calls the backend with search=; q goes into the URL', async () => {
    const { user, location } = await openList();
    const before = listRequests().length;
    await user.type(screen.getByRole('searchbox', { name: 'Search by name or reference' }), 'lah');
    // Typing quickly sends nothing until the pause
    expect(listRequests()).toHaveLength(before);
    await waitFor(() => expect(location()).toBe('/holders?q=lah'));
    await waitFor(() => expect(lastQuery().get('search')).toBe('lah'));
    expect(listRequests()).toHaveLength(before + 1); // one request for the whole word
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0]).toHaveTextContent('Lahiru Silva');
  });

  it('the search box is filled from the URL, and Enter searches at once', async () => {
    const { user, location } = await openList('/holders?q=amal', ADMIN, 'Amal Fernando');
    expect(screen.getByRole('searchbox')).toHaveValue('amal');
    expect(lastQuery().get('search')).toBe('amal');
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'STC{Enter}');
    expect(location()).toBe('/holders?q=STC');
  });

  it('sorting a column updates the URL and the request, and toggles the direction', async () => {
    const { user, location } = await openList();
    const name = () => screen.getByRole('columnheader', { name: /^Name/ });
    expect(screen.getByRole('columnheader', { name: /^Date added/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    );
    await user.click(within(name()).getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(location()).toBe('/holders?sort=name'));
    expect(lastQuery().get('sort')).toBe('name');
    expect(name()).toHaveAttribute('aria-sort', 'ascending');
    await waitFor(() =>
      expect(rows().map((r) => within(r).getAllByRole('cell')[0]!.textContent)).toEqual([
        'Amal Fernando',
        'Lahiru Silva',
        'Nimesha Perera',
      ]),
    );
    await user.click(within(name()).getByRole('button', { name: 'Name' }));
    await waitFor(() => expect(location()).toBe('/holders?sort=name_desc'));
    expect(lastQuery().get('sort')).toBe('name_desc');

    await user.click(screen.getByRole('button', { name: 'Employee ID' }));
    await waitFor(() => expect(location()).toBe('/holders?sort=ref'));
  });

  it('paging: page and size go into the URL and the request (offset, limit)', async () => {
    for (let n = 0; n < 22; n += 1) {
      holderStore.push({
        ...holderStore[0]!,
        id: `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`,
        externalRef: `STC-1${String(n).padStart(4, '0')}`,
        fullName: `Extra Holder ${n}`,
        createdAt: `2026-10-01T00:00:${String(n).padStart(2, '0')}.000Z`,
      });
    }
    const { user, location } = await openList();
    const pages = screen.getByRole('navigation', { name: 'Pages' });
    expect(within(pages).getByText('1–20 of 25')).toBeInTheDocument();
    expect(within(pages).getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(within(pages).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(location()).toBe('/holders?page=2'));
    expect(lastQuery().get('offset')).toBe('20');
    expect(await within(pages).findByText('21–25 of 25')).toBeInTheDocument();
    expect(within(pages).getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.selectOptions(within(pages).getByRole('combobox', { name: 'Rows per page' }), '10');
    await waitFor(() => expect(location()).toBe('/holders?size=10'));
    expect(lastQuery().get('limit')).toBe('10');
    expect(lastQuery().get('offset')).toBe('0');
  });

  it('Back keeps the previous list state (the URL holds it)', async () => {
    const { user, router, location } = await openList('/holders?sort=name');
    await user.click(screen.getByRole('link', { name: 'Lahiru Silva' }));
    await screen.findByRole('heading', { level: 1, name: 'Lahiru Silva' });
    await router.navigate(-1);
    await waitFor(() => expect(location()).toBe('/holders?sort=name'));
    expect(await screen.findByRole('columnheader', { name: /^Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });

  it('reads invalid URL values as the defaults', () => {
    expect(readListParams(new URLSearchParams('page=-2&size=7&sort=random&q=%20x%20'))).toEqual({
      q: 'x',
      page: 1,
      size: 20,
      sort: 'newest',
    });
    expect(tableSortOf('oldest')).toEqual({ column: 'createdAt', direction: 'asc' });
    expect(tableSortOf('ref_desc')).toEqual({ column: 'reference', direction: 'desc' });
  });
});

describe('empty, loading and error states', () => {
  it('no holders yet: a message and a "Register holder" button', async () => {
    holderStore.splice(0, holderStore.length);
    const { user, location } = renderApp('/holders', { signedInAs: ADMIN });
    expect(await screen.findByRole('heading', { name: 'No holders yet' })).toBeInTheDocument();
    const buttons = screen.getAllByRole('link', { name: 'Register holder' });
    expect(buttons).toHaveLength(2); // page header + empty state
    await user.click(buttons[1]!);
    expect(location()).toBe('/holders/new');
  });

  it('no match: names the search and offers to clear it', async () => {
    const { user, location } = renderApp('/holders?q=zzz', { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { name: 'No holders match “zzz”' }),
    ).toBeInTheDocument();
    // The empty state's button (the search box's own clear button is an icon with the same name)
    await user.click(screen.getByText('Clear search', { selector: 'button' }));
    await waitFor(() => expect(location()).toBe('/holders'));
    expect(await screen.findByRole('link', { name: 'Lahiru Silva' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('shows a loading skeleton, then the rows', async () => {
    renderApp('/holders', { signedInAs: ADMIN });
    expect(await screen.findByText('Loading holders…')).toBeInTheDocument();
    expect(screen.getAllByTestId('data-table-loading-row').length).toBeGreaterThan(0);
    expect(await screen.findByRole('link', { name: 'Lahiru Silva' })).toBeInTheDocument();
  });

  it('error: a message with Try again, which reloads the list', async () => {
    server.use(
      http.get(
        `${API}/holders`,
        () => HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
        { once: true },
      ),
    );
    const { user } = renderApp('/holders', { signedInAs: ADMIN });
    // 5xx is retried twice by the query client defaults in the app; tests turn retries off
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The holder list could not be loaded.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Lahiru Silva' })).toBeInTheDocument();
  });
});
