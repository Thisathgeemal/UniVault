/**
 * Holder detail (/holders/:holderId): fields grouped like the form, the full ID number, option
 * labels, "Over 18" from the server, who added the record, the credential summary, the
 * disabled "Issue credential" action, 404 (unknown or another issuer's holder), errors, and
 * that nothing about the holder reaches the browser console.
 */
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { si } from '../src/i18n/locales/si.js';
import { ADMIN, API, BANK_ADMIN, errorBody, HOLDER_IDS, server } from './mock-backend.js';
import { renderApp } from './render-app.js';

const definition = (group: string, term: string) => {
  const card = screen.getByRole('heading', { name: group }).closest('[class*="rounded-md"]')!;
  const dt = within(card as HTMLElement).getByText(term, { selector: 'dt' });
  return dt.nextElementSibling as HTMLElement;
};

describe('holder detail', () => {
  it('employee: every registered field, grouped, with the full NIC number and option labels', async () => {
    renderApp(`/holders/${HOLDER_IDS.lahiru}`, { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lahiru Silva' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Reference: STC-00001')).toBeInTheDocument();
    expect(definition('Personal details', 'NIC number')).toHaveTextContent('199935300063');
    expect(definition('Employment details', 'Employment type')).toHaveTextContent('Contract');
    expect(definition('Employment details', 'Work location')).toHaveTextContent('Galle Branch');
    expect(definition('Contact details', 'Work email')).toHaveTextContent('Not provided');
    expect(definition('Record', 'Added by')).toHaveTextContent(
      'Serendib Trading Company (Demo) Officer',
    );
    expect(screen.queryByText('Over 18')).not.toBeInTheDocument(); // KYC only
  });

  it('customer: identity document with expiry, address, and "Over 18" calculated by the server', async () => {
    renderApp(`/holders/${HOLDER_IDS.kasun}`, { signedInAs: BANK_ADMIN });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Kasun Bandara' }),
    ).toBeInTheDocument();
    expect(definition('Identity document', 'ID document type')).toHaveTextContent('Passport');
    expect(definition('Identity document', 'ID document number')).toHaveTextContent('N1234567');
    expect(definition('Identity document', 'ID document expiry date')).toHaveTextContent(/2030/);
    expect(definition('Permanent address', 'District')).toHaveTextContent('Kandy');
    expect(definition('Personal details', 'Over 18')).toHaveTextContent('Yes');
    expect(definition('Personal details', 'Over 18')).toHaveTextContent(
      'Calculated by the server from the date of birth.',
    );
    expect(definition('Account details', 'Customer number')).toHaveTextContent('CUS-000123');
    // No residential address recorded: no section for it
    expect(screen.queryByRole('heading', { name: 'Residential address' })).not.toBeInTheDocument();
    expect(definition('Record', 'Added by')).toHaveTextContent('Not recorded');
  });

  it('credentials: counts by status and a list with status badges', async () => {
    renderApp(`/holders/${HOLDER_IDS.lahiru}`, { signedInAs: ADMIN });
    const summary = await screen.findByRole('list', { name: 'Credentials by status' });
    expect(
      within(summary)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['Awaiting wallet: 1', 'Valid: 1', 'Replaced: 1']);
    const table = screen.getByRole('table', { name: 'Credentials of this holder' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Employment credential');
    expect(rows[0]).toHaveTextContent('Valid');
    expect(rows[2]).toHaveTextContent('Not signed yet');
  });

  it('no credentials yet', async () => {
    renderApp(`/holders/${HOLDER_IDS.nimesha}`, { signedInAs: ADMIN });
    expect(
      await screen.findByText('No credentials have been issued to this holder yet.'),
    ).toBeInTheDocument();
  });

  it('"Issue credential" starts the issuing flow for this holder', async () => {
    const { user, location } = renderApp(`/holders/${HOLDER_IDS.nimesha}`, { signedInAs: ADMIN });
    await user.click(await screen.findByRole('link', { name: 'Issue credential' }));
    expect(location()).toBe(`/credentials/new?holderId=${HOLDER_IDS.nimesha}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Issue a credential' }),
    ).toBeInTheDocument();
  });

  it('another issuer’s holder (backend 404) shows the not-found page', async () => {
    const { user, location } = renderApp(`/holders/${HOLDER_IDS.kasun}`, { signedInAs: ADMIN });
    expect(await screen.findByRole('heading', { name: 'Holder not found' })).toBeInTheDocument();
    expect(screen.queryByText('Kasun Bandara')).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Back to holders' }));
    expect(location()).toBe('/holders');
  });

  it('a load failure shows Try again; a credentials failure only affects its card', async () => {
    server.use(
      http.get(
        `${API}/holders/:holderId`,
        () => HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
        { once: true },
      ),
      http.get(
        `${API}/credentials`,
        () => HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
        { once: true },
      ),
    );
    const { user } = renderApp(`/holders/${HOLDER_IDS.lahiru}`, { signedInAs: ADMIN });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The holder record could not be loaded.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lahiru Silva' }),
    ).toBeInTheDocument();
    const credentialsAlert = await screen.findByRole('alert');
    expect(credentialsAlert).toHaveTextContent('The credentials could not be loaded.');
    await user.click(within(credentialsAlert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Credentials by status' })).toBeInTheDocument();
  });

  it('logs nothing about the holder to the browser console', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m),
    );
    renderApp(`/holders/${HOLDER_IDS.lahiru}`, { signedInAs: ADMIN });
    await screen.findByRole('list', { name: 'Credentials by status' });
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    for (const secret of ['Lahiru', '199935300063', 'STC-00001'])
      expect(logged).not.toContain(secret);
    for (const s of spies) s.mockRestore();
  });

  it('Sinhala: labels and the over-18 flag', async () => {
    const { user } = renderApp(`/holders/${HOLDER_IDS.kasun}`, { signedInAs: BANK_ADMIN });
    await screen.findByRole('heading', { level: 1, name: 'Kasun Bandara' });
    await user.selectOptions(screen.getByLabelText('Language'), 'si');
    expect(
      await screen.findByRole('heading', { name: si.holders.register.groups.identity }),
    ).toBeInTheDocument();
    expect(
      definition(si.holders.register.groups.personal, si.holders.detail.over18),
    ).toHaveTextContent(si.holders.detail.yes);
    expect(
      definition(si.holders.register.groups.identity, si.holders.fields.id_document_type.label),
    ).toHaveTextContent(si.holders.options.id_document_type.passport);
  });
});
