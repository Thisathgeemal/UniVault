/**
 * Credential issuance against the real backend (throwaway database with the seed data and the
 * dashboard demo data, e2e/start-backend.mjs):
 *   - employer admin issues an Employment credential to a seed employee end to end; the
 *     dashboard's "Awaiting wallet" count rises by 1; issuing again for the same holder shows
 *     ACTIVE_CREDENTIAL_EXISTS with a link to the existing credential;
 *   - bank admin previews a KYC credential: "Over 18" calculated by UniVault and the
 *     selectively disclosable badges.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.UNIVAULT_E2E_PASSWORD ?? '';
const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:4100/api/v1';
/** A Serendib Trading employee the demo data leaves without a credential. */
const EMPLOYEE_REF = 'STC-00045';
/** An adult bank customer with an NIC (seed data). */
const CUSTOMER_REF = 'KYC-REC-0001';

async function signInTo(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function awaitingWallet(page: Page): Promise<number> {
  const token = await page.evaluate(() => sessionStorage.getItem('univault.issuer-portal.token'));
  const res = await page.request.get(`${API}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { counts: { awaitingWallet: number } }).counts.awaitingWallet;
}

async function pickHolder(page: Page, reference: string) {
  await page
    .getByRole('searchbox', { name: 'Search holders by name or reference' })
    .fill(reference);
  const choice = page.getByRole('link', { name: /^Issue to / });
  await expect(choice).toHaveCount(1);
  await choice.click();
  await expect(page).toHaveURL(/\/credentials\/new\?holderId=[0-9a-f-]{36}$/);
}

const next = (page: Page) => page.getByRole('button', { name: 'Next' });

test('employer admin issues an Employment credential; Awaiting wallet +1; a second one is refused', async ({
  page,
}) => {
  expect(PASSWORD, 'playwright.config.ts sets UNIVAULT_E2E_PASSWORD').not.toBe('');
  await signInTo(page, '/credentials', 'admin@serendib-trading.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
  const before = await awaitingWallet(page);

  await pickHolder(page, EMPLOYEE_REF);
  // Step 1: the only schema for an employer, pre-selected
  await expect(page.getByRole('radio', { name: 'Employment credential' })).toBeChecked();
  await expect(page.getByText('Your organisation issues Employment credentials.')).toBeVisible();
  await next(page).click();
  // Step 2: read-only details from the server's preview
  await expect(page.getByRole('heading', { name: 'Credential details' })).toBeVisible();
  await expect(page.getByText(EMPLOYEE_REF, { exact: true })).toBeVisible(); // Employee ID claim
  await expect(page.getByText(/^Expires on /)).toBeVisible();
  await next(page).click();
  // Step 3: the wallet card
  const card = page.getByRole('article', { name: 'Employment credential' });
  await expect(card.getByRole('region', { name: 'Always shown to verifiers' })).toBeVisible();
  await expect(card.getByText('Assigned on issue')).toBeVisible();
  await next(page).click();
  // Step 4: confirm and issue
  await page
    .getByRole('checkbox', {
      name: 'I confirm these details were checked against the original documents',
    })
    .check();
  await page.getByRole('button', { name: 'Issue credential' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Credential created' })).toBeVisible();
  await expect(page.getByText('Awaiting wallet', { exact: true })).toBeVisible();
  await expect(page.getByText('Wallet offer (QR code) – next step')).toBeVisible();
  const credentialUrl = page.url();

  // The dashboard counts it
  expect(await awaitingWallet(page)).toBe(before + 1);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Dashboard' })
    .click();
  await expect(
    page.getByRole('link', {
      name: `Awaiting wallet ${new Intl.NumberFormat('en-LK').format(before + 1)}`,
      exact: true,
    }),
  ).toBeVisible();

  // Issuing again for the same holder: refused, with the way to the existing credential
  await page.goto(credentialUrl);
  await page.getByRole('link', { name: 'Back to holder' }).click();
  await page.getByRole('link', { name: 'Issue credential' }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'already has an active or pending' });
  await expect(alert).toContainText('Revoke or reissue it first.');
  await expect(next(page)).toBeDisabled();
  await alert.getByRole('link', { name: 'Open the existing credential' }).click();
  await expect(page).toHaveURL(credentialUrl.replace('?issued=1', ''));
  await expect(page.getByRole('heading', { level: 1, name: 'Credential' })).toBeVisible();
});

test('bank admin previews a KYC credential: Over 18 and selectively disclosable badges', async ({
  page,
}) => {
  await signInTo(page, '/credentials', 'admin@bank-a.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
  await pickHolder(page, CUSTOMER_REF);
  await expect(page.getByRole('radio', { name: 'KYC credential' })).toBeChecked();
  await next(page).click();
  await expect(page.getByRole('heading', { name: 'Credential details' })).toBeVisible();
  await next(page).click();

  const card = page.getByRole('article', { name: 'KYC credential' });
  const chooses = card.getByRole('region', { name: 'Holder chooses what to share' });
  await expect(chooses).toBeVisible();
  const over18 = chooses.getByRole('definition').filter({ hasText: 'Calculated by UniVault' });
  await expect(over18).toHaveCount(1);
  await expect(over18).toContainText('Yes');
  expect(
    await chooses.getByText('Selectively disclosable', { exact: true }).count(),
  ).toBeGreaterThan(5);
  await expect(
    card
      .getByRole('region', { name: 'Always shown to verifiers' })
      .getByText('Selectively disclosable'),
  ).toHaveCount(0);
  await expect(card.getByText("Bound to the holder's wallet when they accept it.")).toBeVisible();
});
