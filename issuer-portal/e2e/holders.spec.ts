/**
 * Holder management against the real backend (throwaway database with the synthetic seed
 * data, see e2e/start-backend.mjs):
 *   - employer admin registers an employee: a validation error first, then fixed; finds the
 *     new employee by search and opens the detail page;
 *   - bank admin registers a customer with a passport (the expiry date appears);
 *   - registering an existing reference shows the 409 message with a link to the holder.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.UNIVAULT_E2E_PASSWORD ?? '';
const EMPLOYER_ADMIN = 'admin@serendib-trading.example';
const BANK_ADMIN = 'admin@bank-a.example';

async function signInTo(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const field = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });

test('employer admin registers an employee, finds them by search and opens the record', async ({
  page,
}) => {
  expect(PASSWORD, 'playwright.config.ts sets UNIVAULT_E2E_PASSWORD').not.toBe('');
  await signInTo(page, '/holders', EMPLOYER_ADMIN);
  await expect(page.getByRole('heading', { level: 1, name: 'Holders' })).toBeVisible();
  await page.getByRole('link', { name: 'Register holder' }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Register employee' })).toBeVisible();

  await field(page, 'Full name').fill('Ruwani Wickramasinghe');
  await field(page, 'Employee ID').fill('STC-E2E01');
  await field(page, 'Designation').fill('A'); // too short: the schema needs 2 characters
  await field(page, 'Department').fill('Finance');
  await page.getByRole('combobox', { name: 'Employment type' }).selectOption('permanent');
  await page.getByLabel(/^Date of joining/).fill('2024-02-01');
  await page.getByRole('button', { name: 'Register holder' }).click();

  // The browser's check (same schema as the server): summary with focus, field marked
  const summary = page.getByRole('alert', { name: 'There is a problem' });
  await expect(summary).toBeFocused();
  await expect(summary).toContainText('Designation: Enter at least 2 characters.');
  await expect(field(page, 'Designation')).toHaveAttribute('aria-invalid', 'true');

  await field(page, 'Designation').fill('Accountant');
  await page.getByRole('button', { name: 'Register holder' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ruwani Wickramasinghe' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/holders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Ruwani Wickramasinghe was registered.')).toBeVisible();
  await expect(page.getByText('Reference: STC-E2E01')).toBeVisible();

  // Find them again through the backend search
  await page.getByRole('link', { name: 'All holders' }).click();
  await page.getByRole('searchbox', { name: 'Search by name or reference' }).fill('stc-e2e');
  await expect(page).toHaveURL(/\/holders\?q=stc-e2e$/);
  const rows = page.getByRole('table', { name: 'Holder records' }).getByRole('row');
  await expect(rows).toHaveCount(2); // header + 1
  await rows.nth(1).getByRole('link', { name: 'Ruwani Wickramasinghe' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Ruwani Wickramasinghe' }),
  ).toBeVisible();
  await expect(page.getByText('No credentials have been issued to this holder yet.')).toBeVisible();
});

test('bank admin registers a customer with a passport', async ({ page }) => {
  await signInTo(page, '/holders/new', BANK_ADMIN);
  await expect(page.getByRole('heading', { level: 1, name: 'Register customer' })).toBeVisible();

  await field(page, 'Customer number').fill('CUS-E2E001');
  await field(page, 'Full name').fill('Tharindu Gunawardena');
  await page.getByLabel(/^Date of birth/).fill('1991-08-17');
  await expect(page.getByLabel(/^ID document expiry date/)).toHaveCount(0); // NIC: not asked
  await page.getByRole('combobox', { name: 'ID document type' }).selectOption('passport');
  await field(page, 'ID document number').fill('N7654321');
  await page.getByLabel(/^ID document expiry date/).fill('2031-03-31');
  await field(page, 'Mobile number').fill('+94771239876');
  const address = page.getByRole('group', { name: 'Permanent address' });
  await address
    .getByRole('textbox', { name: 'Address line 1', exact: true })
    .fill('No. 21, Hill Street');
  await address.getByRole('textbox', { name: 'City or town' }).fill('Nuwara Eliya');
  await address.getByRole('combobox', { name: 'District' }).selectOption('Nuwara Eliya');
  await address.getByRole('textbox', { name: 'Postal code' }).fill('22200');
  await page.getByRole('button', { name: 'Register holder' }).click();

  await expect(page.getByRole('heading', { level: 1, name: 'Tharindu Gunawardena' })).toBeVisible();
  await expect(page.getByText('Reference: CUS-E2E001')).toBeVisible();
  await expect(page.getByText('Passport', { exact: true })).toBeVisible();
  await expect(page.getByText('N7654321')).toBeVisible(); // full number on the detail page only
  await expect(page.getByText('Calculated by the server from the date of birth.')).toBeVisible();
});

test('registering an existing reference shows the 409 message with a link', async ({ page }) => {
  await signInTo(page, '/holders/new', EMPLOYER_ADMIN);
  await expect(page.getByRole('heading', { level: 1, name: 'Register employee' })).toBeVisible();
  await field(page, 'Full name').fill('Someone Else');
  await field(page, 'Employee ID').fill('STC-00001'); // a seeded employee
  await field(page, 'Designation').fill('Clerk');
  await field(page, 'Department').fill('Operations');
  await page.getByRole('combobox', { name: 'Employment type' }).selectOption('contract');
  await page.getByLabel(/^Date of joining/).fill('2020-01-01');
  await page.getByRole('button', { name: 'Register holder' }).click();

  const alert = page.getByRole('alert').filter({ hasText: 'already registered' });
  await expect(alert).toHaveText(/A holder with this reference is already registered\./);
  await alert.getByRole('link', { name: 'Open the existing record' }).click();
  // The form still holds the typed details: leaving asks first
  await page
    .getByRole('alertdialog', { name: 'Leave without saving?' })
    .getByRole('button', { name: 'Leave page' })
    .click();
  await expect(page).toHaveURL(/\/holders\/[0-9a-f-]{36}$/);
  await expect(page.getByText('Reference: STC-00001')).toBeVisible();
});
