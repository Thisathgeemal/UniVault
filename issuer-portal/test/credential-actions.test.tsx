/**
 * Credential actions: the ONE rule (credentialActions) for every status x role; officer sees
 * Revoke disabled with the reason; the revoke dialog (reason, note for "Other", warnings,
 * button text, no double submit, success updates the badge); the reissue page (server preview
 * with changed fields highlighted, "No details changed", expiry difference, confirmation,
 * success → the replacement's wallet offer); the credential page (summary, timeline in plain
 * words, Replaces / Replaced by, active offer, not found); each 409 explained and refreshed.
 */
import { screen, waitFor, within } from '@testing-library/react';
import type { TFunction } from 'i18next';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import type { Role } from '../src/api/auth.js';
import type { EffectiveStatus } from '../src/api/credentials.js';
import { ApiError } from '../src/api/errors.js';
import { credentialActionItems } from '../src/credentials/action-items.js';
import { credentialActions } from '../src/credentials/actions.js';
import { actionErrorMessage, isConflict } from '../src/credentials/conflicts.js';
import { i18n } from '../src/i18n/index.js';
import { si } from '../src/i18n/locales/si.js';
import { formatColomboDateTime } from '../src/lib/format.js';
import {
  addPendingCredential,
  ADMIN,
  API,
  BANK_ADMIN,
  errorBody,
  HOLDER_IDS,
  holderStore,
  issuedStore,
  mockCreateOffer,
  OFFICER,
  requests,
  server,
} from './mock-backend.js';
import { renderApp } from './render-app.js';

const STATUSES: EffectiveStatus[] = ['valid', 'pending', 'expired', 'revoked', 'superseded'];
const ROLES: (Role | undefined)[] = ['admin', 'officer', undefined];
const t = i18n.t.bind(i18n) as TFunction;

// ---------------------------------------------------------------------------
describe('credentialActions – every status x role', () => {
  // [status][role] -> [revoke, reissue, offer] as 'on' | 'disabled' | '-'
  const EXPECTED: Record<EffectiveStatus, Record<string, [string, string, string]>> = {
    valid: { admin: ['on', 'on', '-'], officer: ['disabled', 'on', '-'], none: ['-', '-', '-'] },
    pending: { admin: ['on', '-', 'on'], officer: ['disabled', '-', 'on'], none: ['-', '-', '-'] },
    expired: { admin: ['on', 'on', '-'], officer: ['disabled', 'on', '-'], none: ['-', '-', '-'] },
    revoked: { admin: ['-', '-', '-'], officer: ['-', '-', '-'], none: ['-', '-', '-'] },
    superseded: { admin: ['-', '-', '-'], officer: ['-', '-', '-'], none: ['-', '-', '-'] },
  };
  const state = (a: { visible: boolean; enabled: boolean }) =>
    !a.visible ? '-' : a.enabled ? 'on' : 'disabled';

  for (const status of STATUSES) {
    for (const role of ROLES) {
      it(`${status} as ${role ?? 'no role'}`, () => {
        const actions = credentialActions({ effectiveStatus: status }, role);
        expect([state(actions.revoke), state(actions.reissue), state(actions.offer)]).toEqual(
          EXPECTED[status][role ?? 'none'],
        );
        if (actions.revoke.visible && !actions.revoke.enabled) {
          expect(actions.revoke.disabledReason).toBe('adminOnly');
        }
      });
    }
  }

  it('an expired credential is renewed; a pending one shows or creates its offer', () => {
    expect(credentialActions({ effectiveStatus: 'expired' }, 'officer').reissue.kind).toBe('renew');
    expect(credentialActions({ effectiveStatus: 'valid' }, 'officer').reissue.kind).toBe('reissue');
    expect(
      credentialActions({ effectiveStatus: 'pending', hasActiveOffer: true }, 'officer').offer.kind,
    ).toBe('show');
    expect(credentialActions({ effectiveStatus: 'pending' }, 'officer').offer.kind).toBe('create');
  });

  it('labels the items the same way for the table and the page', () => {
    const labels = (status: EffectiveStatus, role: Role, hasActiveOffer = false) =>
      credentialActionItems(
        t,
        { id: 'c1', effectiveStatus: status, hasActiveOffer },
        role,
        { onRevoke: () => {}, navigate: () => {} },
        { includeView: true },
      ).map((i) => `${i.label}${i.disabled ? ` (${i.disabledReason})` : ''}`);
    expect(labels('valid', 'admin')).toEqual(['View details', 'Reissue', 'Revoke']);
    expect(labels('valid', 'officer')).toEqual([
      'View details',
      'Reissue',
      'Revoke (Only administrators can revoke credentials)',
    ]);
    expect(labels('pending', 'admin', true)).toEqual([
      'View details',
      'Show wallet offer',
      'Revoke',
    ]);
    expect(labels('pending', 'officer')).toEqual([
      'View details',
      'Create wallet offer',
      'Revoke (Only administrators can revoke credentials)',
    ]);
    expect(labels('expired', 'officer')).toEqual([
      'View details',
      'Renew',
      'Revoke (Only administrators can revoke credentials)',
    ]);
    expect(labels('revoked', 'admin')).toEqual(['View details']);
    expect(labels('superseded', 'officer')).toEqual(['View details']);
  });
});

// ---------------------------------------------------------------------------
const AMAL = 'aaaaaaaa-0000-4000-8000-000000000003';

async function openTable(as = ADMIN, path = '/credentials') {
  const view = renderApp(path, { signedInAs: as });
  await screen.findByRole('table', { name: 'Credentials' });
  await waitFor(() => expect(screen.queryAllByTestId('data-table-loading-row')).toHaveLength(0));
  return view;
}
async function openMenu(user: ReturnType<typeof renderApp>['user'], name: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${name}'s credential` }));
}
const revokeRequests = () => requests.filter((r) => r.path.endsWith('/revoke'));
const listCount = () => requests.filter((r) => /^\/credentials\?/.test(r.path)).length;

describe('the table menu', () => {
  it('officer: Revoke is shown disabled with the reason and does nothing', async () => {
    addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user } = await openTable(OFFICER);
    await openMenu(user, 'Lahiru Silva');
    const revoke = screen.getByRole('button', { name: /^Revoke(?!d)/ });
    expect(revoke).toHaveAttribute('aria-disabled', 'true');
    expect(revoke).toHaveAccessibleDescription('Only administrators can revoke credentials');
    await user.click(revoke);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reissue' })).toBeInTheDocument();
  });

  it('revoked and replaced credentials are view only', async () => {
    addPendingCredential(HOLDER_IDS.lahiru, 'revoked');
    addPendingCredential(HOLDER_IDS.nimesha, 'superseded');
    const { user } = await openTable(ADMIN);
    for (const name of ['Lahiru Silva', 'Nimesha Perera']) {
      await openMenu(user, name);
      const trigger = screen.getByRole('button', { name: `Actions for ${name}'s credential` });
      const list = document.getElementById(trigger.getAttribute('aria-controls')!)!;
      expect(
        within(list)
          .getAllByRole('button')
          .map((b) => b.textContent),
      ).toEqual(['View details']);
      await user.keyboard('{Escape}');
    }
  });

  it('menu items navigate: view, reissue, renew, wallet offer', async () => {
    const valid = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user, location } = await openTable(OFFICER);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(location()).toBe(`/credentials/${valid}`);
  });

  it.each([
    ['valid', 'Reissue', 'reissue'],
    ['expired', 'Renew', 'reissue'],
    ['pending', 'Create wallet offer', 'offer'],
  ] as const)('%s: "%s" opens /%s', async (status, label, page) => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, status);
    const { user, location } = await openTable(OFFICER);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: label }));
    expect(location()).toBe(`/credentials/${id}/${page}`);
  });
});

// ---------------------------------------------------------------------------
describe('revoke dialog', () => {
  it('needs a reason, a note for "Other"; success revokes, toasts and updates the badge', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user } = await openTable(ADMIN);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog', { name: 'Revoke credential' });
    expect(dialog).toHaveAccessibleDescription('Employment credential for Lahiru Silva');
    expect(
      within(dialog).getByText(
        "This cannot be undone. The holder's wallet and verifiers will see this credential as revoked.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).queryByText('The wallet offer will stop working.'),
    ).not.toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', {
      name: "Revoke Lahiru Silva's credential",
    });
    expect(confirm).toBeDisabled();

    // Reason options: the backend's enum in plain words
    const reason = within(dialog).getByRole('combobox', { name: /Reason/ });
    expect(
      within(reason)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Choose a reason',
      "The holder's details changed",
      'Employment ended',
      'The customer relationship ended',
      "The holder's wallet was lost or compromised",
      'Issued in error',
      'Other (explain in the note)',
    ]);
    await user.selectOptions(reason, 'other');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(
      within(dialog).getByText('Enter a note when the reason is "Other".'),
    ).toBeInTheDocument();
    expect(revokeRequests()).toHaveLength(0);
    expect(within(dialog).getByRole('textbox', { name: /Note/ })).toHaveAttribute(
      'maxlength',
      '500',
    );

    await user.type(within(dialog).getByRole('textbox', { name: /Note/ }), '  Left the company  ');
    await user.click(confirm);
    expect(await screen.findByText("Lahiru Silva's credential was revoked.")).toBeInTheDocument();
    expect(revokeRequests()).toHaveLength(1);
    expect(revokeRequests()[0]!.body).toEqual({ reason: 'other', note: 'Left the company' });
    expect(issuedStore.get(id)!.status).toBe('revoked');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const table = screen.getByRole('table', { name: 'Credentials' });
    expect(await within(table).findByText('Revoked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoked 1' })).toBeInTheDocument();
  });

  it('pending: also warns that the wallet offer stops working', async () => {
    addPendingCredential(HOLDER_IDS.nimesha, 'pending');
    const { user } = await openTable(ADMIN);
    await openMenu(user, 'Nimesha Perera');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(
      within(screen.getByRole('dialog')).getByText('The wallet offer will stop working.'),
    ).toBeInTheDocument();
  });

  it('sends once however often it is clicked, and Cancel closes it', async () => {
    addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    server.use(
      http.post(`${API}/credentials/:id/revoke`, async () => {
        await delay(200);
        return undefined;
      }),
    );
    const { user } = await openTable(ADMIN);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = screen.getByRole('dialog');
    await user.selectOptions(within(dialog).getByRole('combobox'), 'employment_ended');
    const confirm = within(dialog).getByRole('button', {
      name: "Revoke Lahiru Silva's credential",
    });
    await user.click(confirm);
    expect(within(dialog).getByRole('button', { name: 'Revoking…' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Revoking…' }));
    expect(await screen.findByText("Lahiru Silva's credential was revoked.")).toBeInTheDocument();
    expect(revokeRequests()).toHaveLength(1);

    await openMenu(user, 'Lahiru Silva'); // now view only
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('Cancel closes without a request', async () => {
    addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user } = await openTable(ADMIN);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(revokeRequests()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('409 conflicts: plain words, then a refresh', () => {
  it.each([
    [
      'CREDENTIAL_ALREADY_REVOKED',
      'Another staff member already revoked this credential. The page has been refreshed.',
    ],
    [
      'CREDENTIAL_SUPERSEDED',
      'This credential was already replaced by a reissued one. The page has been refreshed.',
    ],
  ])('revoke refused with %s', async (code, message) => {
    addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    server.use(
      http.post(`${API}/credentials/:id/revoke`, () =>
        HttpResponse.json(errorBody(code, 'x'), { status: 409 }),
      ),
    );
    const { user } = await openTable(ADMIN);
    await openMenu(user, 'Lahiru Silva');
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'issued_in_error');
    const before = listCount();
    await user.click(screen.getByRole('button', { name: "Revoke Lahiru Silva's credential" }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(listCount()).toBeGreaterThan(before));
  });

  it.each([
    [
      'CREDENTIAL_NOT_REISSUABLE',
      'A credential that is still awaiting the wallet cannot be reissued. Revoke it and issue a new one.',
    ],
    [
      'ACTIVE_CREDENTIAL_EXISTS',
      'The holder already has another active or pending credential of this type. The page has been refreshed.',
    ],
    [
      'CREDENTIAL_SUPERSEDED',
      'This credential was already replaced by a reissued one. The page has been refreshed.',
    ],
    [
      'CREDENTIAL_ALREADY_REVOKED',
      'Another staff member already revoked this credential. The page has been refreshed.',
    ],
  ])('reissue refused with %s', async (code, message) => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    server.use(
      http.post(`${API}/credentials/:id/reissue`, () =>
        HttpResponse.json(errorBody(code, 'x'), { status: 409 }),
      ),
    );
    const { user } = await openReissue(id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'details_changed');
    await user.click(await screen.findByRole('checkbox'));
    const detailLoads = () => requests.filter((r) => r.path === `/credentials/${id}`).length;
    const before = detailLoads();
    await user.click(screen.getByRole('button', { name: 'Reissue credential' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(detailLoads()).toBeGreaterThan(before));
  });

  it('maps the other refusals and keeps generic errors', () => {
    const err = (status: number, code: string) => new ApiError({ status, code, message: 'x' });
    expect(actionErrorMessage(t, err(422, 'HOLDER_DATA_INVALID')).message).toBe(
      'The holder record no longer meets the credential rules. Update the holder record first.',
    );
    expect(actionErrorMessage(t, err(403, 'FORBIDDEN')).message).toBe(
      'Your role does not allow this action.',
    );
    expect(actionErrorMessage(t, err(404, 'CREDENTIAL_NOT_FOUND')).message).toMatch(/no longer/);
    expect(actionErrorMessage(t, err(503, 'ISSUER_KEY_UNAVAILABLE')).message).toMatch(
      /administrator/,
    );
    expect(isConflict(err(409, 'X'))).toBe(true);
    expect(isConflict(err(404, 'X'))).toBe(true);
    expect(isConflict(err(500, 'X'))).toBe(false);
    expect(isConflict(new Error('x'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
async function openReissue(id: string, as = OFFICER) {
  const view = renderApp(`/credentials/${id}/reissue`, { signedInAs: as });
  await screen.findByRole('combobox', { name: /Reason/ });
  return view;
}
const previewRequests = () => requests.filter((r) => r.path.endsWith('/reissue/preview'));

describe('reissue page', () => {
  it('previews from the server: changed fields highlighted, expiry, then success → the new offer', async () => {
    const id = addPendingCredential(HOLDER_IDS.nimesha, 'valid');
    // The holder record changed after the credential was created
    holderStore.find((h) => h.id === HOLDER_IDS.nimesha)!.claims.designation = 'Senior Coordinator';
    const { user, location } = await openReissue(id);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Reissue credential' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Choose a reason to see the replacement.')).toBeInTheDocument();
    expect(previewRequests()).toHaveLength(0);

    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'details_changed');
    const table = await screen.findByRole('table', {
      name: 'Current credential and its replacement, field by field',
    });
    expect(previewRequests()[0]!.body).toEqual({ reason: 'details_changed' });
    expect(screen.getByText('1 changed')).toBeInTheDocument();
    const changed = table.querySelectorAll('tr[data-changed="true"]');
    expect(changed).toHaveLength(1);
    // a highlight, not a status: brand-soft (never the expired status colours)
    expect(changed[0]).toHaveClass('bg-brand-soft', 'text-text');
    expect(changed[0]!.className).not.toMatch(/status-/);
    expect(changed[0]).toHaveTextContent('Logistics Coordinator');
    expect(changed[0]).toHaveTextContent('Senior Coordinator');
    expect(changed[0]).toHaveTextContent('Changed');
    expect(
      screen.getByText(/^Expiry moves from .+ to .+\.$|^The expiry stays/),
    ).toBeInTheDocument();

    // The confirmation checkbox of issuance is required
    await user.click(screen.getByRole('button', { name: 'Reissue credential' }));
    expect(
      screen.getByText(/confirm/i, { selector: '#reissue-confirm-error' }),
    ).toBeInTheDocument();
    expect(requests.filter((r) => r.path === `/credentials/${id}/reissue`)).toHaveLength(0);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Reissue credential' }));

    await waitFor(() => expect(location()).toMatch(/^\/credentials\/e0+[0-9a-f-]+\/offer$/));
    const newId = location().split('/')[2]!;
    expect(newId).not.toBe(id);
    expect(issuedStore.get(id)!.status).toBe('superseded');
    expect(issuedStore.get(newId)!.replacesCredentialId).toBe(id);
    expect(
      await screen.findByText('Replacement created. Show the holder the new wallet offer.'),
    ).toBeInTheDocument();
  });

  it('"No details changed" for a lost wallet; still allowed', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user, location } = await openReissue(id);
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Reason/ }),
      'wallet_lost_or_compromised',
    );
    expect(
      await screen.findByText(
        'No details changed. You can still reissue, for example after a lost wallet or to extend the validity.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelectorAll('tr[data-changed="true"]')).toHaveLength(0);
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Reissue credential' }));
    await waitFor(() => expect(location()).toMatch(/\/offer$/));
  });

  it('"Other" needs a note before the preview; "Valid until" asks for a new preview', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user } = await openReissue(id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'other');
    expect(screen.getByText('Enter a note when the reason is "Other".')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reissue credential' })).toBeDisabled();
    expect(previewRequests()).toHaveLength(0);
    await user.type(screen.getByRole('textbox', { name: /Note/ }), 'Audit');
    await screen.findByRole('table', { name: /field by field/ });
    // The note's text does not change the preview: it runs once a note exists
    expect(previewRequests().at(-1)!.body).toEqual({ reason: 'other', note: expect.any(String) });

    const until = screen.getByLabelText(/Valid until/);
    await user.type(until, '2027-03-01');
    await waitFor(() =>
      expect(previewRequests().at(-1)!.body).toEqual({
        reason: 'other',
        note: expect.any(String),
        validUntil: '2027-03-01',
      }),
    );
    expect(await screen.findByText(/Expiry moves from/)).toBeInTheDocument();
  });

  it('renews an expired credential (same backend reissue)', async () => {
    const id = addPendingCredential(AMAL, 'expired');
    const { user, location } = await openReissue(id);
    expect(screen.getByRole('heading', { level: 1, name: 'Renew credential' })).toBeInTheDocument();
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Reason/ }),
      'validity_extension',
    );
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Renew credential' }));
    await waitFor(() => expect(location()).toMatch(/\/offer$/));
  });

  it('is not offered for revoked, replaced or pending credentials, nor unknown ones', async () => {
    for (const status of ['revoked', 'superseded', 'pending'] as const) {
      const id = addPendingCredential(HOLDER_IDS.lahiru, status);
      const view = renderApp(`/credentials/${id}/reissue`, { signedInAs: OFFICER });
      expect(await screen.findByText('This credential cannot be reissued.')).toBeInTheDocument();
      view.unmount();
    }
    renderApp('/credentials/e0000000-0000-4000-8000-000000000999/reissue', { signedInAs: OFFICER });
    expect(
      await screen.findByRole('heading', { name: 'Credential not found' }),
    ).toBeInTheDocument();
  });

  it('shows a refused preview (holder record no longer valid)', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    server.use(
      http.post(`${API}/credentials/:id/reissue/preview`, () =>
        HttpResponse.json(errorBody('HOLDER_DATA_INVALID', 'x', []), { status: 422 }),
      ),
    );
    const { user } = await openReissue(id);
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'details_changed');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The holder record no longer meets the credential rules.',
    );
    expect(screen.getByRole('button', { name: 'Reissue credential' })).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
describe('credential page', () => {
  it('summary, timeline in plain words (Asia/Colombo), Replaced by / Replaces links', async () => {
    const old = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    // Reissue through the mock so both sides are linked
    const { user, location } = await openReissue(old);
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'details_changed');
    await user.click(await screen.findByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Reissue credential' }));
    await waitFor(() => expect(location()).toMatch(/\/offer$/));
    const newId = location().split('/')[2]!;

    await user.click(screen.getAllByRole('link', { name: 'Credentials' })[0]!);
    // (the mock's ids share their first 8 characters, so pick the link by its target)
    await screen.findByRole('table', { name: 'Credentials' });
    const oldLink = (await screen.findAllByRole('link', { name: old.slice(0, 8) })).find(
      (a) => a.getAttribute('href') === `/credentials/${old}`,
    )!;
    await user.click(oldLink);
    expect(location()).toBe(`/credentials/${old}`);
    expect(await screen.findByText('Replaced', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(old)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lahiru Silva' })).toHaveAttribute(
      'href',
      `/holders/${HOLDER_IDS.lahiru}`,
    );
    expect(screen.getByRole('link', { name: newId })).toHaveAttribute(
      'href',
      `/credentials/${newId}`,
    );
    // Timeline: plain words, staff name, reason, Colombo time
    const timeline = (await screen.findByRole('heading', { name: 'Status history' })).closest(
      'div.rounded-md, section, div',
    )!.parentElement!;
    const items = await within(timeline).findAllByRole('listitem');
    expect(items.map((li) => li.querySelector('span')!.textContent)).toEqual([
      'Created – awaiting the wallet',
      "Accepted by the holder's wallet",
      'Replaced by a reissued credential',
    ]);
    expect(items[0]).toHaveTextContent(`by ${OFFICER.displayName}`);
    expect(items[1]).toHaveTextContent("by the holder's wallet");
    expect(items[2]).toHaveTextContent("Reason: The holder's details changed");
    expect(items[0]).toHaveTextContent(formatColomboDateTime('2026-11-21T04:30:00.000Z', 'en')!);
    // Replaced: view only
    expect(screen.queryByRole('button', { name: /Revoke|Reissue|Renew/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: newId }));
    expect(await screen.findByRole('link', { name: old })).toHaveAttribute(
      'href',
      `/credentials/${old}`,
    );
    expect(screen.getByText('Replaces')).toBeInTheDocument();
  });

  it('pending with an active offer: its expiry and a link to the offer screen; same actions', async () => {
    const id = addPendingCredential(HOLDER_IDS.nimesha, 'pending');
    mockCreateOffer(id);
    const { user, location } = renderApp(`/credentials/${id}`, { signedInAs: OFFICER });
    expect(
      await screen.findByText(/A QR code is active until .+ \(Asia\/Colombo\)\./),
    ).toBeTruthy();
    const revoke = screen.getByRole('button', { name: 'Revoke' });
    expect(revoke).toHaveAttribute('aria-disabled', 'true');
    expect(revoke).toHaveAccessibleDescription('Only administrators can revoke credentials');
    await user.click(revoke);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show wallet offer' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open the wallet offer screen' }));
    expect(location()).toBe(`/credentials/${id}/offer`);
  });

  it('admin revokes from the page; the badge and timeline update', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    const { user } = renderApp(`/credentials/${id}`, { signedInAs: ADMIN });
    await user.click(await screen.findByRole('button', { name: 'Revoke' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /Reason/ }), 'employment_ended');
    await user.click(screen.getByRole('button', { name: "Revoke Lahiru Silva's credential" }));
    expect(await screen.findByText(/^.+ by .+ – Employment ended$/)).toBeInTheDocument();
    expect(await screen.findByText('Reason: Employment ended')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('an expired credential shows the stored status and offers Renew', async () => {
    const id = addPendingCredential(AMAL, 'expired');
    const { user, location } = renderApp(`/credentials/${id}`, { signedInAs: OFFICER });
    expect(await screen.findByText(/Stored status: Valid/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Renew' }));
    expect(location()).toBe(`/credentials/${id}/reissue`);
  });

  it('unknown or another organisation’s credential → not found', async () => {
    const view = renderApp('/credentials/e0000000-0000-4000-8000-000000000999', {
      signedInAs: ADMIN,
    });
    expect(
      await screen.findByRole('heading', { name: 'Credential not found' }),
    ).toBeInTheDocument();
    view.unmount();
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    renderApp(`/credentials/${id}`, { signedInAs: BANK_ADMIN });
    expect(
      await screen.findByRole('heading', { name: 'Credential not found' }),
    ).toBeInTheDocument();
  });

  it('timeline error offers a retry', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    let fail = true;
    server.use(
      http.get(`${API}/credentials/:id/events`, () =>
        fail ? HttpResponse.json(errorBody('INTERNAL_ERROR', 'x'), { status: 500 }) : undefined,
      ),
    );
    const { user } = renderApp(`/credentials/${id}`, { signedInAs: ADMIN });
    expect(await screen.findByText('The history could not be loaded.')).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Created – awaiting the wallet')).toBeInTheDocument();
  });

  it('renders in Sinhala', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    await i18n.changeLanguage('si');
    renderApp(`/credentials/${id}`, { signedInAs: ADMIN });
    expect(await screen.findByText(si.credentials.detail.timeline)).toBeInTheDocument();
    expect(await screen.findByText(si.credentials.detail.events.pending)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: si.credentials.actions.revoke })).toBeInTheDocument();
  });
});
