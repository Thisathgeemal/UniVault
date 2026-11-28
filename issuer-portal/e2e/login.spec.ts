/**
 * Staff sign-in against the real backend (throwaway database with the synthetic seed data and
 * the dashboard demo data): protected-route redirect, wrong password, admin sign-in back to the
 * requested page, admin menu, dashboard numbers equal to the backend summary, sign-out, officer
 * sign-in without admin items.
 */
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = process.env.UNIVAULT_E2E_PASSWORD ?? '';
const ADMIN = 'admin@serendib-trading.example';
const OFFICER = 'officer@serendib-trading.example';
const ADMIN_ITEMS = ['Issuer keys', 'Staff'];
const SHARED_ITEMS = ['Dashboard', 'Holders', 'Credentials', 'Credential offers'];
/** The e2e backend (playwright.config.ts starts it on port 4100). */
const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:4100/api/v1';
const ORG = 'Serendib Trading Company (Demo)';

async function signIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main navigation' });

test('staff sign-in, role-based menu, dashboard numbers and sign-out', async ({ page }) => {
  expect(PASSWORD, 'playwright.config.ts sets UNIVAULT_E2E_PASSWORD').not.toBe('');

  // A protected page sends a signed-out visitor to the login page, remembering the page
  await page.goto('/holders');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fholders$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  // Wrong password: one generic message
  await signIn(page, ADMIN, 'not-the-password-123');
  await expect(page.getByRole('alert')).toHaveText('The email address or password is not correct.');

  // Admin: lands on the page asked for, with the admin menu items
  await signIn(page, ADMIN, PASSWORD);
  await expect(page).toHaveURL(/\/holders$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Holders' })).toBeVisible();
  await expect(page.getByTestId('header-org')).toHaveText('Serendib Trading Company (Demo)');
  for (const name of [...SHARED_ITEMS, ...ADMIN_ITEMS]) {
    await expect(nav(page).getByRole('link', { name })).toBeVisible();
  }

  // Dashboard: every card shows the number the backend's summary gives for this session
  await nav(page).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: ORG })).toBeVisible();
  const token = await page.evaluate(() => sessionStorage.getItem('univault.issuer-portal.token'));
  const response = await page.request.get(`${API}/dashboard/summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status()).toBe(200);
  const summary = (await response.json()) as {
    counts: Record<string, number>;
    expiringSoonDays: number;
  };
  expect(summary.counts.issued, 'db:seed:demo ran').toBeGreaterThan(0);
  const format = (n: number) => new Intl.NumberFormat('en-LK').format(n);
  const cards: [string, string][] = [
    ['Issued', 'issued'],
    ['Valid', 'active'],
    ['Revoked', 'revoked'],
    ['Awaiting wallet', 'awaitingWallet'],
    ['Replaced', 'superseded'],
    ['Expired', 'expired'],
    [`Expiring in ${summary.expiringSoonDays} days`, 'expiringSoon'],
    ['Holders', 'holders'],
  ];
  for (const [label, key] of cards) {
    await expect(
      page.getByRole('link', { name: `${label} ${format(summary.counts[key]!)}`, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole('figure', { name: 'Status of issued credentials' })).toBeVisible();
  await expect(page.getByTestId('recent-activity').getByRole('listitem')).toHaveCount(10);

  // The token is in sessionStorage only, never in localStorage
  const storage = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: JSON.stringify(localStorage),
  }));
  expect(storage.session).toContain('univault.issuer-portal.token');
  expect(storage.local).not.toMatch(/eyJ/); // no JWT anywhere in localStorage

  // Sign out: back to the login page, session gone
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  // Officer: the shared items only
  await signIn(page, OFFICER, PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: ORG })).toBeVisible();
  for (const name of SHARED_ITEMS) {
    await expect(nav(page).getByRole('link', { name })).toBeVisible();
  }
  for (const name of ADMIN_ITEMS) {
    await expect(nav(page).getByRole('link', { name })).toHaveCount(0);
  }
});
