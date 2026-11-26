/**
 * Issuing a credential (/credentials/new): the schema follows the issuer type; every claim shown
 * comes from the preview response (nothing is assembled in the browser, and the issue request
 * carries no claims); read-only details; the validity range and cap explanations; the wallet
 * card sections and badges follow GET /credential-schemas; derived claims; the confirmation;
 * no double submit; the result page; every error; entry from the picker; Back / forward and the
 * leave prompt; Sinhala.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { si } from '../src/i18n/locales/si.js';
import {
  ADMIN,
  API,
  BANK_ADMIN,
  errorBody,
  HOLDER_IDS,
  holderStore,
  mockPreview,
  mockSchemaResponse,
  OFFICER,
  requests,
  server,
} from './mock-backend.js';
import { renderApp } from './render-app.js';

type View = ReturnType<typeof renderApp>;
const previewRequests = () => requests.filter((r) => r.path === '/credentials/preview');
const issueRequests = () =>
  requests.filter((r) => r.method === 'POST' && r.path === '/credentials');
const next = () => screen.getByRole('button', { name: 'Next' });

async function openWizard(holderId: string = HOLDER_IDS.nimesha, as = ADMIN) {
  const view = renderApp(`/credentials/new?holderId=${holderId}`, { signedInAs: as });
  await screen.findByRole('heading', { level: 1, name: 'Issue a credential' });
  return view;
}
/** Wait for the preview, then go on until `step` (2–4). */
async function goTo(view: View, step: number) {
  await waitFor(() => expect(previewRequests().length).toBeGreaterThan(0));
  for (let current = 1; current < step; current += 1) {
    await waitFor(() => expect(next()).toBeEnabled());
    await view.user.click(next());
  }
  await waitFor(() => expect(view.location()).toContain(`step=${step}`));
}

const definition = (scope: HTMLElement, term: string) =>
  within(scope).getByText(term, { selector: 'dt' }).nextElementSibling as HTMLElement;

describe('step 1 – holder and schema', () => {
  it('employer: the holder summary and only the Employment schema, pre-selected', async () => {
    await openWizard(HOLDER_IDS.nimesha, OFFICER); // officers may issue too
    const steps = screen.getByRole('navigation', { name: 'Issuing steps' });
    expect(within(steps).getByText('Holder and type').closest('li')).toHaveAttribute(
      'aria-current',
      'step',
    );
    expect(await screen.findByText('Nimesha Perera')).toBeInTheDocument();
    expect(screen.getByText('STC-00002')).toBeInTheDocument();
    const group = screen.getByRole('group', { name: 'Credential type' });
    const radios = await within(group).findAllByRole('radio');
    expect(radios).toHaveLength(1);
    expect(within(group).getByRole('radio', { name: 'Employment credential' })).toBeChecked();
    expect(
      within(group).getByText('Your organisation issues Employment credentials.'),
    ).toBeInTheDocument();
  });

  it('bank: only KYC; the holder ID number is masked', async () => {
    await openWizard(HOLDER_IDS.kasun, BANK_ADMIN);
    const group = screen.getByRole('group', { name: 'Credential type' });
    expect(await within(group).findByRole('radio', { name: 'KYC credential' })).toBeChecked();
    expect(
      within(group).queryByRole('radio', { name: 'Employment credential' }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText('•••• 4567')).toBeInTheDocument();
    expect(screen.queryByText('N1234567')).not.toBeInTheDocument();
  });

  it('without a holder: the picker; choosing one starts the flow', async () => {
    const { user, location } = renderApp('/credentials/new', { signedInAs: ADMIN });
    await user.click(await screen.findByRole('link', { name: 'Issue to Nimesha Perera' }));
    expect(location()).toBe(`/credentials/new?holderId=${HOLDER_IDS.nimesha}`);
    expect(await screen.findByRole('radio', { name: 'Employment credential' })).toBeInTheDocument();
  });

  it('from the Credentials page: search, pick, start', async () => {
    const { user, location } = renderApp('/credentials', { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Credentials' }),
    ).toBeInTheDocument();
    await user.type(
      screen.getByRole('searchbox', { name: 'Search holders by name or reference' }),
      'amal',
    );
    await waitFor(() =>
      expect(
        requests.some((r) => r.path.includes('/holders?') && r.path.includes('search=amal')),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Issue to Lahiru Silva' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Issue to Amal Fernando' }));
    expect(location()).toMatch(/^\/credentials\/new\?holderId=aaaaaaaa-/);
  });
});

describe('step 2 – details from the preview, read-only', () => {
  it('shows the values of the PREVIEW response, not the holder record, and nothing editable', async () => {
    server.use(
      http.post(`${API}/credentials/preview`, async ({ request }) => {
        requests.push({
          method: 'POST',
          path: '/credentials/preview',
          authorization: null,
          body: await request.json(),
        });
        const holder = holderStore.find((h) => h.id === HOLDER_IDS.nimesha)!;
        const preview = mockPreview(holder, ADMIN)!;
        preview.disclosable = preview.disclosable.map((c) =>
          c.name === 'designation' ? { ...c, value: 'Value from the server' } : c,
        );
        return HttpResponse.json(preview);
      }),
    );
    const view = await openWizard();
    await goTo(view, 2);
    const card = await screen.findByRole('heading', { name: 'Credential details' });
    const scope = card.closest('div[class*="rounded-card"]') as HTMLElement;
    expect(definition(scope, 'Designation')).toHaveTextContent('Value from the server');
    expect(within(scope).queryByText('Logistics Coordinator')).not.toBeInTheDocument();
    expect(definition(scope, 'Employment type')).toHaveTextContent('Contract'); // option label
    expect(within(scope).queryAllByRole('textbox')).toHaveLength(0);
    expect(
      within(scope).getByRole('link', { name: 'Wrong details? Update the holder record' }),
    ).toHaveAttribute('href', `/holders/${HOLDER_IDS.nimesha}`);
    // The preview request sends the holder and the type only: never claims
    expect(previewRequests()[0]!.body).toEqual({
      holderId: HOLDER_IDS.nimesha,
      credentialType: 'EmploymentCredential',
    });
  });

  it('validity: default, the allowed range, out-of-range input, and a debounced new preview', async () => {
    const view = await openWizard();
    await goTo(view, 2);
    const validity = await screen.findByRole('group', { name: 'Validity' });
    expect(within(validity).getByText(/^Expires on /)).toBeInTheDocument();
    expect(within(validity).getByText(/^Default expiry: /)).toBeInTheDocument();
    const input = within(validity).getByLabelText(/^Valid until/) as HTMLInputElement;
    expect(input).toHaveAttribute('min', '2026-11-27');
    expect(input).toHaveAttribute('max', '2027-11-26');
    const before = previewRequests().length;

    await view.user.type(input, '2030-01-01');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(/Choose a date from/);
    await new Promise((r) => setTimeout(r, 600));
    expect(previewRequests()).toHaveLength(before); // out of range: no request

    await view.user.clear(input);
    await view.user.type(input, '2027-03-31');
    await waitFor(() => expect(view.location()).toContain('validUntil=2027-03-31'));
    await waitFor(() =>
      expect(previewRequests().at(-1)!.body).toMatchObject({ validUntil: '2027-03-31' }),
    );
    expect(await within(validity).findByText('Ends on the date you chose.')).toBeInTheDocument();

    await view.user.click(within(validity).getByRole('button', { name: 'Use the default expiry' }));
    await waitFor(() => expect(view.location()).not.toContain('validUntil'));
  });

  it.each([
    ['id_document_expiry', 'passport', "Limited to the passport's expiry date."],
    ['id_document_expiry', 'driving_licence', "Limited to the driving licence's expiry date."],
    [
      '18th_birthday',
      'nic',
      "Limited to the holder's 18th birthday. It can then be reissued with “Over 18: Yes”.",
    ],
  ])('explains a cap: %s (%s)', async (cappedBy, documentType, message) => {
    server.use(
      http.post(`${API}/credentials/preview`, () => {
        const holder = holderStore.find((h) => h.id === HOLDER_IDS.kasun)!;
        const preview = mockPreview(holder, BANK_ADMIN)!;
        preview.expiry.cappedBy = cappedBy;
        preview.disclosable = preview.disclosable.map((c) =>
          c.name === 'id_document_type' ? { ...c, value: documentType } : c,
        );
        requests.push({
          method: 'POST',
          path: '/credentials/preview',
          authorization: null,
          body: null,
        });
        return HttpResponse.json(preview);
      }),
    );
    const view = await openWizard(HOLDER_IDS.kasun, BANK_ADMIN);
    await goTo(view, 2);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe('step 3 – the wallet card', () => {
  it('two sections; badges follow the schemas response; derived age; wallet binding note', async () => {
    const schema = mockSchemaResponse('KYCCredential');
    // Make one field NOT selectively disclosable in the schemas response: its badge must go
    schema.fields = schema.fields.map((f) =>
      f.name === 'nationality' ? { ...f, selectivelyDisclosable: false } : f,
    );
    server.use(
      http.get(`${API}/credential-schemas`, () => HttpResponse.json({ schemas: [schema] })),
    );
    const view = await openWizard(HOLDER_IDS.kasun, BANK_ADMIN);
    await goTo(view, 3);
    const card = await screen.findByRole('article', { name: 'KYC credential' });
    const always = within(card).getByRole('region', { name: 'Always shown to verifiers' });
    for (const term of ['Issuer', 'Credential type', 'Issued on', 'Expires on', 'Credential ID']) {
      expect(within(always).getByText(term, { selector: 'dt' })).toBeInTheDocument();
    }
    expect(definition(always, 'Issuer')).toHaveTextContent('UniVault Demo Bank');
    expect(definition(always, 'Credential ID')).toHaveTextContent('Assigned on issue');
    expect(definition(always, 'Issued on')).toHaveTextContent('Set when the holder accepts it');
    expect(within(always).queryByText('Selectively disclosable')).not.toBeInTheDocument();

    const chooses = within(card).getByRole('region', { name: 'Holder chooses what to share' });
    const terms = within(chooses).getAllByRole('term');
    const preview = mockPreview(
      holderStore.find((h) => h.id === HOLDER_IDS.kasun)!,
      BANK_ADMIN,
    )!;
    expect(terms).toHaveLength(preview.disclosable.length + preview.derived.length);
    const disclosable = new Set(
      schema.fields.filter((f) => f.selectivelyDisclosable).map((f) => f.name),
    );
    const expectedBadges = [...preview.disclosable, ...preview.derived].filter((c) =>
      disclosable.has(c.name),
    ).length;
    expect(within(chooses).getAllByText('Selectively disclosable')).toHaveLength(expectedBadges);
    expect(
      within(definition(chooses, 'Nationality').previousElementSibling as HTMLElement).queryByText(
        'Selectively disclosable',
      ),
    ).not.toBeInTheDocument();

    const over18 = definition(chooses, 'Over 18');
    expect(over18).toHaveTextContent('Yes');
    expect(over18).toHaveTextContent('Calculated by UniVault');
    const info = within(chooses).getAllByRole('button', {
      name: 'What does “selectively disclosable” mean?',
    })[0]!;
    expect(info).toHaveAccessibleDescription(
      /A verifier sees only what the holder chooses to show\./,
    );
    expect(
      within(card).getByText("Bound to the holder's wallet when they accept it."),
    ).toBeInTheDocument();
  });
});

describe('step 4 – confirm and issue', () => {
  it('the confirmation is required; then issuing shows the result page', async () => {
    const view = await openWizard();
    await goTo(view, 4);
    expect(
      screen.getByText(/^Employment credential for Nimesha Perera, expires on /),
    ).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Issue credential' }));
    expect(
      screen.getByText('Tick the box to confirm that the details were checked.'),
    ).toBeInTheDocument();
    expect(issueRequests()).toHaveLength(0);

    await view.user.click(
      screen.getByRole('checkbox', {
        name: 'I confirm these details were checked against the original documents',
      }),
    );
    await view.user.click(screen.getByRole('button', { name: 'Issue credential' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Credential created' }),
    ).toBeInTheDocument();
    expect(view.location()).toMatch(
      /^\/credentials\/d0000000-0000-4000-8000-000000000001\?issued=1$/,
    );
    expect(issueRequests()[0]!.body).toEqual({
      holderId: HOLDER_IDS.nimesha,
      credentialType: 'EmploymentCredential',
    });
    expect(screen.getByText('Awaiting wallet')).toBeInTheDocument();
    expect(screen.getByText('d0000000-0000-4000-8000-000000000001')).toBeInTheDocument();
    expect(screen.getByText('Wallet offer (QR code) – next step')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nimesha Perera' })).toHaveAttribute(
      'href',
      `/holders/${HOLDER_IDS.nimesha}`,
    );
    expect(screen.getByRole('link', { name: 'Back to holder' })).toHaveAttribute(
      'href',
      `/holders/${HOLDER_IDS.nimesha}`,
    );
    await view.user.click(screen.getByRole('link', { name: 'Issue another' }));
    expect(view.location()).toBe('/credentials/new'); // no leave prompt after issuing
  });

  it('sends the chosen validUntil with the issue request', async () => {
    const view = renderApp(
      `/credentials/new?holderId=${HOLDER_IDS.nimesha}&step=4&validUntil=2027-05-01`,
      {
        signedInAs: ADMIN,
      },
    );
    await view.user.click(await screen.findByRole('checkbox'));
    const issue = await screen.findByRole('button', { name: 'Issue credential' });
    await waitFor(() => expect(issue).toBeEnabled());
    await view.user.click(issue);
    await screen.findByRole('heading', { level: 1, name: 'Credential created' });
    expect(issueRequests()[0]!.body).toEqual({
      holderId: HOLDER_IDS.nimesha,
      credentialType: 'EmploymentCredential',
      validUntil: '2027-05-01',
    });
  });

  it('cannot be issued twice while the request runs', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    server.use(
      http.post(`${API}/credentials`, async () => {
        calls += 1;
        await gate;
        await delay(1);
        return HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 });
      }),
    );
    const view = await openWizard();
    await goTo(view, 4);
    await view.user.click(screen.getByRole('checkbox'));
    await view.user.click(screen.getByRole('button', { name: 'Issue credential' }));
    const pending = await screen.findByRole('button', { name: 'Issuing…' });
    expect(pending).toBeDisabled();
    await view.user.click(pending);
    release();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The credential could not be prepared.',
    );
    expect(calls).toBe(1);
  });
});

describe('errors', () => {
  it('ACTIVE_CREDENTIAL_EXISTS: explains, links to the existing credential, stops the flow', async () => {
    await openWizard(HOLDER_IDS.lahiru);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'This holder already has an active or pending credential of this type.',
    );
    expect(alert).toHaveTextContent('Revoke or reissue it first.');
    expect(
      within(alert).getByRole('link', { name: 'Open the existing credential' }),
    ).toHaveAttribute('href', '/credentials/c0000000-0000-4000-8000-000000000001');
    expect(next()).toBeDisabled();
  });

  it.each([
    [
      'HOLDER_DATA_INVALID',
      422,
      'The holder record no longer meets the credential rules',
      'Open the holder record',
    ],
    ['ISSUER_KEY_MISSING', 409, 'Issuing is unavailable – contact your administrator.', null],
    ['ISSUER_KEY_UNAVAILABLE', 503, 'Issuing is unavailable – contact your administrator.', null],
    ['HOLDER_NOT_FOUND', 404, 'This holder was not found.', null],
  ] as const)('%s → a plain message', async (code, status, text, link) => {
    server.use(
      http.post(`${API}/credentials/preview`, () =>
        HttpResponse.json(errorBody(code, 'x'), { status }),
      ),
    );
    await openWizard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(text);
    if (link) {
      expect(within(alert).getByRole('link', { name: link })).toHaveAttribute(
        'href',
        `/holders/${HOLDER_IDS.nimesha}`,
      );
    }
    expect(next()).toBeDisabled();
  });

  it('a network failure offers Try again, which fetches the preview again', async () => {
    server.use(http.post(`${API}/credentials/preview`, () => HttpResponse.error(), { once: true }));
    const view = await openWizard();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Cannot reach the UniVault server.');
    await view.user.click(within(alert).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    await waitFor(() => expect(next()).toBeEnabled());
  });

  it('a validUntil the server refuses is shown on the date field', async () => {
    server.use(
      http.post(`${API}/credentials/preview`, async ({ request }) => {
        const body = (await request.json()) as { validUntil?: string };
        if (body.validUntil) {
          return HttpResponse.json(
            errorBody('VALIDATION_ERROR', 'Invalid validUntil', [
              { path: 'validUntil', message: 'x' },
            ]),
            { status: 400 },
          );
        }
        return HttpResponse.json(
          mockPreview(
            holderStore.find((h) => h.id === HOLDER_IDS.nimesha)!,
            ADMIN,
          ),
        );
      }),
    );
    const { location } = renderApp(
      `/credentials/new?holderId=${HOLDER_IDS.nimesha}&step=2&validUntil=2027-01-10`,
      { signedInAs: ADMIN },
    );
    // Back to the default preview, with the refusal shown on the field
    const input = await screen.findByLabelText(/^Valid until/);
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveValue('');
    expect(location()).not.toContain('validUntil=');
  });

  it('the credential page: another issuer’s or unknown credential is "not found"', async () => {
    renderApp('/credentials/d0000000-0000-4000-8000-000000000099', { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { name: 'Credential not found' }),
    ).toBeInTheDocument();
  });
});

describe('navigation', () => {
  it('Back and forward move between steps (the step is in the URL)', async () => {
    const view = await openWizard();
    await goTo(view, 3);
    await view.router.navigate(-1);
    await waitFor(() => expect(view.location()).toContain('step=2'));
    expect(await screen.findByRole('heading', { name: 'Credential details' })).toBeInTheDocument();
    await view.router.navigate(1);
    await waitFor(() => expect(view.location()).toContain('step=3'));
    expect(
      await screen.findByRole('article', { name: 'Employment credential' }),
    ).toBeInTheDocument();
    // A completed step can be chosen in the stepper
    await view.user.click(screen.getByRole('button', { name: /^Holder and type/ }));
    await waitFor(() => expect(view.location()).toContain('step=1'));
  });

  it('leaving after step 1 asks first', async () => {
    const view = await openWizard();
    await goTo(view, 2);
    await view.user.click(
      within(screen.getByRole('navigation', { name: 'Main navigation' })).getByRole('link', {
        name: 'Dashboard',
      }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without issuing?' });
    await view.user.click(within(dialog).getByRole('button', { name: 'Stay on this page' }));
    expect(view.location()).toContain('/credentials/new');
    await view.user.click(screen.getByRole('link', { name: 'Cancel' }));
    await view.user.click(await screen.findByRole('button', { name: 'Leave page' }));
    await waitFor(() => expect(view.location()).toBe(`/holders/${HOLDER_IDS.nimesha}`));
  });
});

describe('Sinhala', () => {
  it('renders the steps, the card sections and the badges in Sinhala', async () => {
    const view = await openWizard(HOLDER_IDS.kasun, BANK_ADMIN);
    await goTo(view, 3);
    await view.user.selectOptions(screen.getByLabelText('Language'), 'si');
    expect(
      await screen.findByRole('navigation', { name: si.issuance.steps.label }),
    ).toBeInTheDocument();
    const card = screen.getByRole('article', { name: si.credentialTypes.KYCCredential });
    expect(
      within(card).getByRole('region', { name: si.issuance.preview.alwaysShown }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole('region', { name: si.issuance.preview.holderChooses }),
    ).toBeInTheDocument();
    expect(within(card).getAllByText(si.issuance.preview.disclosable).length).toBeGreaterThan(0);
    expect(within(card).getByText(si.issuance.preview.derived)).toBeInTheDocument();
  });
});
