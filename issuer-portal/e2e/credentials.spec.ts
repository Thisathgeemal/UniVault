/**
 * The credentials table, revoke and reissue against the real backend (throwaway database with
 * the seed and dashboard demo data; e2e/start-backend.mjs changed STC-00003's designation
 * after its demo credential was signed):
 *   - admin revokes an active credential: badge → Revoked, dashboard Revoked +1, Active −1;
 *   - officer sees Revoke disabled ("Only administrators can revoke credentials");
 *   - officer reissues STC-00003's credential: the preview shows the changed designation, the
 *     reissue lands on the replacement's wallet offer, the old one shows Replaced with a link.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.UNIVAULT_E2E_PASSWORD ?? '';
const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:4100/api/v1';
/** Demo active credentials (db:seed:demo gives the first free holders one each). */
const REVOKE_REF = 'STC-00005';
const REISSUE_REF = 'STC-00003';

async function signInTo(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function counts(page: Page): Promise<Record<string, number>> {
  const token = await page.evaluate(() => sessionStorage.getItem('univault.issuer-portal.token'));
  const res = await page.request.get(`${API}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(200);
  return ((await res.json()) as { counts: Record<string, number> }).counts;
}

/** The Active tab searched for one holder reference: exactly one row. */
async function activeRowOf(page: Page, reference: string) {
  await page.goto(`/credentials?effectiveStatus=valid&q=${reference}`);
  const table = page.getByRole('table', { name: 'Credentials' });
  const row = table.getByRole('row').filter({ hasText: reference });
  await expect(row).toHaveCount(1);
  return row;
}

test('admin revokes an active credential: badge Revoked, dashboard Revoked +1 and Active −1', async ({
  page,
}) => {
  expect(PASSWORD, 'playwright.config.ts sets UNIVAULT_E2E_PASSWORD').not.toBe('');
  await signInTo(page, '/', 'admin@serendib-trading.example');
  await expect(
    page.getByRole('heading', { level: 2, name: 'Status of issued credentials' }),
  ).toBeVisible();
  const before = await counts(page);

  const row = await activeRowOf(page, REVOKE_REF);
  await expect(row.getByText('Active', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: /^Actions for / }).click();
  await page.getByRole('button', { name: 'Revoke', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revoke credential' });
  await expect(
    dialog.getByText(
      "This cannot be undone. The holder's wallet and verifiers will see this credential as revoked.",
    ),
  ).toBeVisible();
  const confirm = dialog.getByRole('button', { name: /^Revoke .+'s credential$/ });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('combobox', { name: /Reason/ }).selectOption('employment_ended');
  await confirm.click();
  await expect(dialog).toHaveCount(0);

  // The Active tab no longer lists it; the Revoked tab does, with the plain badge
  await page.goto(`/credentials?effectiveStatus=revoked&q=${REVOKE_REF}`);
  const revoked = page
    .getByRole('table', { name: 'Credentials' })
    .getByRole('row')
    .filter({ hasText: REVOKE_REF });
  await expect(revoked).toHaveCount(1);
  await expect(revoked.getByText('Revoked', { exact: true })).toBeVisible();

  const after = await counts(page);
  expect(after.revoked).toBe(before.revoked! + 1);
  expect(after.active).toBe(before.active! - 1);
  // And the dashboard cards show the backend's numbers
  await page.goto('/');
  await expect(
    page.getByRole('link', { name: new RegExp(`^Revoked ${after.revoked}$`) }),
  ).toBeVisible();
});

test('officer sees Revoke disabled, reissues after the holder record changed and lands on the new offer', async ({
  page,
}) => {
  await signInTo(page, '/credentials', 'officer@serendib-trading.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();

  const row = await activeRowOf(page, REISSUE_REF);
  const oldId = (await row.getByRole('link').first().getAttribute('href'))!.split('/').pop()!;
  await row.getByRole('button', { name: /^Actions for / }).click();
  const revoke = page
    .getByRole('button', { name: /^Revoke/ })
    .filter({ hasText: 'Only administrators' });
  await expect(revoke).toHaveAttribute('aria-disabled', 'true');
  await expect(revoke).toContainText('Only administrators can revoke credentials');

  await page.getByRole('button', { name: 'Reissue', exact: true }).click();
  await expect(page).toHaveURL(`/credentials/${oldId}/reissue`);
  await page.getByRole('combobox', { name: /Reason/ }).selectOption('details_changed');
  const compare = page.getByRole('table', {
    name: 'Current credential and its replacement, field by field',
  });
  await expect(compare).toBeVisible();
  const changed = compare.locator('tr[data-changed="true"]');
  await expect(changed).toHaveCount(1);
  await expect(changed).toContainText('HR Executive');
  await expect(changed).toContainText('Senior HR Executive');
  await expect(page.getByText('1 changed')).toBeVisible();

  await page
    .getByRole('checkbox', {
      name: 'I confirm these details were checked against the original documents',
    })
    .check();
  await page.getByRole('button', { name: 'Reissue credential' }).click();
  await expect(page).toHaveURL(/\/credentials\/[0-9a-f-]{36}\/offer$/);
  const newId = /\/credentials\/([0-9a-f-]{36})\/offer$/.exec(page.url())![1]!;
  expect(newId).not.toBe(oldId);
  await expect(page.getByRole('heading', { level: 1, name: 'Wallet offer' })).toBeVisible();

  // The old credential: Replaced, with a link to its replacement
  await page.goto(`/credentials/${oldId}`);
  await expect(page.getByText('Replaced', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: newId })).toHaveAttribute(
    'href',
    `/credentials/${newId}`,
  );
  await expect(page.getByText('Replaced by a reissued credential')).toBeVisible();
});
