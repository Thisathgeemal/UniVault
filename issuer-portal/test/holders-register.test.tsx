/**
 * Holder registration (/holders/new): the form for the issuer type, required and pattern
 * errors (on blur and on submit, with the error summary), the KYC conditional rules, server
 * errors mapped onto fields, the 409 link, no double submit, the unsaved-changes prompt,
 * success → detail page with a toast, and Sinhala labels.
 */
import { act, screen, waitFor, within } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { si } from '../src/i18n/locales/si.js';
import {
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

/** Filling a whole form with userEvent takes 2–5 s under coverage and parallel load (Issue 36). */
const FORM_TEST_TIMEOUT = 15_000;

type User = ReturnType<typeof renderApp>['user'];
const textbox = (name: string | RegExp) => screen.getByRole('textbox', { name });
const combobox = (name: string | RegExp) => screen.getByRole('combobox', { name });
const dateInput = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: 'Register holder' });
const postRequests = () => requests.filter((r) => r.method === 'POST' && r.path === '/holders');

async function openForm(as = ADMIN) {
  const view = renderApp('/holders/new', { signedInAs: as });
  await screen.findByRole('heading', {
    level: 1,
    name: as.issuer.type === 'bank' ? 'Register customer' : 'Register employee',
  });
  return view;
}

async function fillEmployee(user: User, employeeId = 'STC-90001') {
  await user.type(textbox('Full name'), 'Nimesha Perera');
  await user.type(textbox('Employee ID'), employeeId);
  await user.type(textbox('Designation'), 'Sales Executive');
  await user.type(textbox('Department'), 'Sales');
  await user.selectOptions(combobox('Employment type'), 'permanent');
  await user.type(dateInput(/^Date of joining/), '2022-03-01');
}

async function fillCustomer(user: User) {
  await user.type(textbox('Customer number'), 'CUS-000500');
  await user.type(textbox('Full name'), 'Dilani Jayasuriya');
  await user.type(dateInput(/^Date of birth/), '1992-04-12');
  await user.type(textbox('ID document number'), '199212345678');
  await user.type(textbox('Mobile number'), '+94771234567');
  const permanent = within(screen.getByRole('group', { name: 'Permanent address' }));
  await user.type(permanent.getByRole('textbox', { name: 'Address line 1' }), 'No. 5, Lake Road');
  await user.type(permanent.getByRole('textbox', { name: 'City or town' }), 'Kandy');
  await user.selectOptions(permanent.getByRole('combobox', { name: 'District' }), 'Kandy');
  await user.type(permanent.getByRole('textbox', { name: 'Postal code' }), '20000');
}

describe('form for the issuer type', () => {
  it('employer: the employee form with the Employment fields, grouped, with required markers', async () => {
    await openForm(OFFICER); // officers may register holders too
    for (const group of ['Personal details', 'Employment details', 'Contact details']) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument();
    }
    expect(textbox('Employee ID')).toHaveAttribute('aria-required', 'true');
    expect(textbox('Employee ID')).toHaveAccessibleDescription(/also the holder's reference/);
    expect(textbox('NIC number')).not.toHaveAttribute('aria-required');
    expect(screen.getByRole('textbox', { name: 'Work phone' })).toHaveAttribute('type', 'tel');
    expect(screen.getByLabelText(/^Work email/)).toHaveAttribute('type', 'email');
    expect(textbox('Designation')).toHaveAttribute('maxLength', '80'); // from the schema
    expect(screen.queryByRole('textbox', { name: 'Customer number' })).not.toBeInTheDocument();
    expect(
      within(combobox('Employment type'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Choose…', 'Permanent', 'Contract', 'Probationary']);
  });

  it('bank: the customer form with the KYC fields; no age field (the server calculates it)', async () => {
    await openForm(BANK_ADMIN);
    for (const group of [
      'Account details',
      'Personal details',
      'Identity document',
      'Contact details',
      'Permanent address',
      'Residential address',
    ]) {
      expect(screen.getByRole('group', { name: group })).toBeInTheDocument();
    }
    expect(textbox('Customer number')).toHaveAttribute('aria-required', 'true');
    expect(textbox('Customer number')).toHaveAccessibleDescription(/3–30 capital letters/);
    expect(screen.queryByRole('textbox', { name: 'Employee ID' })).not.toBeInTheDocument();
    expect(screen.queryByText('Over 18')).not.toBeInTheDocument();
    expect(combobox('ID document type')).toHaveValue('nic');
    expect(textbox('Nationality')).toHaveValue('LK');
  });
});

describe('validation', () => {
  it('on submit: an error for each required field, a summary that takes focus and links to fields', async () => {
    const { user } = await openForm();
    await user.click(submit());
    const summary = await screen.findByRole('alert', { name: 'There is a problem' });
    expect(summary).toHaveFocus();
    const required = ['Full name', 'Employee ID', 'Designation', 'Department'];
    for (const name of required) {
      expect(textbox(name)).toHaveAttribute('aria-invalid', 'true');
      expect(textbox(name)).toHaveAccessibleDescription(/This field is required\./);
      expect(
        within(summary).getByRole('link', { name: `${name}: This field is required.` }),
      ).toBeInTheDocument();
    }
    expect(combobox('Employment type')).toHaveAttribute('aria-invalid', 'true');
    expect(dateInput(/^Date of joining/)).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('NIC number')).not.toHaveAttribute('aria-invalid');
    expect(postRequests()).toHaveLength(0); // nothing sent

    await user.click(
      within(summary).getByRole('link', { name: 'Designation: This field is required.' }),
    );
    expect(textbox('Designation')).toHaveFocus();
  });

  it('on blur: a pattern error with the field’s own explanation; it clears when fixed', async () => {
    const { user } = await openForm();
    await user.type(textbox('NIC number'), '12345');
    expect(textbox('NIC number')).not.toHaveAttribute('aria-invalid'); // not before blur
    await user.tab();
    expect(textbox('NIC number')).toHaveAttribute('aria-invalid', 'true');
    expect(textbox('NIC number')).toHaveAccessibleDescription(
      /Enter 9 digits followed by V or X, or 12 digits\./,
    );
    await user.clear(textbox('NIC number'));
    await user.type(textbox('NIC number'), '851234567V');
    expect(textbox('NIC number')).not.toHaveAttribute('aria-invalid');
    // Only the touched field shows an error
    expect(textbox('Full name')).not.toHaveAttribute('aria-invalid');
  });

  it('employee ID: the schema pattern (capital letters, digits, hyphens)', async () => {
    const { user } = await openForm();
    await user.type(textbox('Employee ID'), 'stc 1');
    await user.tab();
    expect(textbox('Employee ID')).toHaveAccessibleDescription(
      /Use 3–20 capital letters, digits or hyphens/,
    );
  });

  it('customer number (externalRef): required and the backend pattern', async () => {
    const { user } = await openForm(BANK_ADMIN);
    await user.click(textbox('Customer number'));
    await user.tab();
    expect(textbox('Customer number')).toHaveAccessibleDescription(/Enter the customer number\./);
    await user.type(textbox('Customer number'), 'cus 1');
    await user.tab();
    expect(textbox('Customer number')).toHaveAccessibleDescription(
      /Use 3–30 capital letters, digits or hyphens/,
    );
  });

  it('NIC vs passport: the expiry date appears and becomes required; the number format changes', async () => {
    const { user } = await openForm(BANK_ADMIN);
    expect(screen.queryByLabelText(/^ID document expiry date/)).not.toBeInTheDocument();
    expect(textbox('ID document number')).toHaveAccessibleDescription(/12 digits/);

    await user.selectOptions(combobox('ID document type'), 'passport');
    const expiry = dateInput(/^ID document expiry date/);
    expect(expiry).toHaveAttribute('aria-required', 'true');
    expect(textbox('ID document number')).toHaveAccessibleDescription(
      'One capital letter and 7 digits (e.g. N1234567).',
    );
    await user.type(textbox('ID document number'), '199212345678'); // an NIC number
    await user.tab();
    expect(textbox('ID document number')).toHaveAccessibleDescription(
      /Enter one capital letter followed by 7 digits\./,
    );
    await user.click(submit());
    expect(dateInput(/^ID document expiry date/)).toHaveAccessibleDescription(
      /This field is required\./,
    );

    // Back to NIC: the expiry field goes away and the NIC number is fine
    await user.selectOptions(combobox('ID document type'), 'nic');
    expect(screen.queryByLabelText(/^ID document expiry date/)).not.toBeInTheDocument();
    expect(textbox('ID document number')).not.toHaveAttribute('aria-invalid');
  });

  it('a different residential address needs its fields and a proof of residence', async () => {
    const { user } = await openForm(BANK_ADMIN);
    const group = screen.getByRole('group', { name: 'Residential address' });
    expect(within(group).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(
      within(group).getByRole('checkbox', {
        name: 'The residential address is different from the permanent address',
      }),
    );
    await user.click(submit());
    expect(within(group).getByRole('textbox', { name: 'Address line 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(
      within(group).getByRole('combobox', { name: 'Proof of residential address' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('P.O. Box addresses are refused with the schema rule’s message', async () => {
    const { user } = await openForm(BANK_ADMIN);
    const permanent = within(screen.getByRole('group', { name: 'Permanent address' }));
    const line1 = permanent.getByRole('textbox', { name: 'Address line 1' });
    await user.type(line1, 'P.O. Box 45');
    await user.tab();
    expect(line1).toHaveAccessibleDescription(
      /Enter a street address\. P\.O\. Box addresses are not accepted\./,
    );
  });
});

describe('submitting', () => {
  it(
    'success: sends the claims, goes to the new holder’s page and shows a toast',
    async () => {
      const { user, location } = await openForm();
      await fillEmployee(user);
      await user.click(submit());
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Nimesha Perera' }),
      ).toBeInTheDocument();
      expect(location()).toMatch(/^\/holders\/aaaaaaaa-/);
      expect(screen.getByText('Nimesha Perera was registered.')).toBeInTheDocument();
      expect(postRequests()).toHaveLength(1);
      expect(postRequests()[0]!.body).toEqual({
        claims: {
          full_name: 'Nimesha Perera',
          employee_id: 'STC-90001',
          designation: 'Sales Executive',
          department: 'Sales',
          employment_type: 'permanent',
          date_of_joining: '2022-03-01',
        },
      });
    },
    FORM_TEST_TIMEOUT,
  );

  it(
    'bank customer: sends externalRef and the address with country LK',
    async () => {
      const { user } = await openForm(BANK_ADMIN);
      await fillCustomer(user);
      await user.click(submit());
      expect(
        await screen.findByRole('heading', { level: 1, name: 'Dilani Jayasuriya' }),
      ).toBeInTheDocument();
      expect(postRequests()[0]!.body).toMatchObject({
        externalRef: 'CUS-000500',
        claims: {
          id_document_type: 'nic',
          nationality: 'LK',
          permanent_address: { line1: 'No. 5, Lake Road', district: 'Kandy', country: 'LK' },
        },
      });
      expect((postRequests()[0]!.body as { claims: object }).claims).not.toHaveProperty(
        'age_over_18',
      );
    },
    FORM_TEST_TIMEOUT,
  );

  it('server field errors land on their fields; unknown paths go to the summary', async () => {
    server.use(
      http.post(`${API}/holders`, () =>
        HttpResponse.json(
          errorBody('VALIDATION_ERROR', 'Holder data does not match the schema', [
            { path: 'claims.designation', code: 'minLength', message: 'x', params: { limit: 2 } },
            { path: 'claims.shoe_size', code: 'notAllowed', message: 'is not allowed' },
          ]),
          { status: 400 },
        ),
      ),
    );
    const { user } = await openForm();
    await fillEmployee(user);
    await user.click(submit());
    const summary = await screen.findByRole('alert', { name: 'There is a problem' });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(textbox('Designation')).toHaveAttribute('aria-invalid', 'true');
    expect(within(summary).getByRole('link', { name: /^Designation:/ })).toBeInTheDocument();
    // Not a form field: listed without a link
    expect(
      within(summary).getByText('shoe_size: This detail is not part of the credential.'),
    ).toBeInTheDocument();
    // Editing the field clears the server's error for it
    await user.type(textbox('Designation'), 's');
    expect(textbox('Designation')).not.toHaveAttribute('aria-invalid');
  });

  it('409: says the reference exists and links to the existing holder', async () => {
    const { user, location } = await openForm();
    await fillEmployee(user, 'STC-00002'); // Nimesha Perera's reference
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('A holder with this reference is already registered.');
    await user.click(within(alert).getByRole('link', { name: 'Open the existing record' }));
    // The form was changed, so leaving asks first
    await user.click(await screen.findByRole('button', { name: 'Leave page' }));
    await waitFor(() => expect(location()).toBe(`/holders/${HOLDER_IDS.nimesha}`));
  });

  it('other failures: a plain message with the request reference', async () => {
    server.use(
      http.post(`${API}/holders`, () =>
        HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
      ),
    );
    const { user } = await openForm();
    await fillEmployee(user);
    await user.click(submit());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The holder could not be registered.');
    expect(alert).toHaveTextContent('Reference: req-test-0001');
  });

  it('cannot be submitted twice while the first request is running', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let calls = 0;
    server.use(
      http.post(`${API}/holders`, async () => {
        calls += 1;
        await gate;
        await delay(1);
        return HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 });
      }),
    );
    const { user } = await openForm();
    await fillEmployee(user);
    await user.click(submit());
    const pending = await screen.findByRole('button', { name: 'Registering…' });
    expect(pending).toBeDisabled();
    await user.click(pending);
    await act(async () => {
      pending.closest('form')!.requestSubmit();
    });
    release();
    expect(await screen.findByRole('button', { name: 'Register holder' })).toBeEnabled();
    expect(calls).toBe(1);
  });
});

describe('unsaved changes', () => {
  it('asks before leaving a changed form; Stay keeps the input, Leave goes', async () => {
    const { user, location } = await openForm();
    await user.type(textbox('Full name'), 'Half typed');
    const nav = screen.getByRole('navigation', { name: 'Main navigation' });
    await user.click(within(nav).getByRole('link', { name: 'Dashboard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' });
    expect(within(dialog).getByRole('button', { name: 'Stay on this page' })).toHaveFocus();
    await user.click(within(dialog).getByRole('button', { name: 'Stay on this page' }));
    expect(location()).toBe('/holders/new');
    expect(textbox('Full name')).toHaveValue('Half typed');

    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'Leave page' }));
    await waitFor(() => expect(location()).toBe('/holders'));
  });

  it('an untouched form leaves without asking', async () => {
    const { user, location } = await openForm();
    await user.click(screen.getByRole('link', { name: 'Cancel' }));
    await waitFor(() => expect(location()).toBe('/holders'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('Sinhala', () => {
  it('renders the labels, groups and buttons in Sinhala', async () => {
    const { user } = await openForm(BANK_ADMIN);
    await user.selectOptions(screen.getByLabelText('Language'), 'si');
    expect(
      await screen.findByRole('heading', { level: 1, name: si.holders.register.titleCustomer }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: si.holders.register.groups.identity }),
    ).toBeInTheDocument();
    expect(textbox(si.holders.fields.externalRef.label)).toBeInTheDocument();
    expect(combobox(si.holders.fields.id_document_type.label)).toHaveDisplayValue(
      si.holders.options.id_document_type.nic,
    );
    expect(screen.getByRole('button', { name: si.holders.register.submit })).toBeInTheDocument();
  });
});
