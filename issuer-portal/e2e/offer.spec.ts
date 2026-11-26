/**
 * The wallet offer screen against the real backend (e2e/start-backend.mjs runs it with
 * CREDENTIAL_OFFER_TTL_SECONDS=15, so expiry can be watched):
 *   - employer admin issues an Employment credential, creates the wallet offer; the QR code
 *     ON SCREEN (a screenshot, decoded with jsQR) is a valid openid-credential-offer:// URI
 *     (OpenID4VCI fields, no tx_code); "Generate new QR code" makes a new one and the backend
 *     reports the first offer as invalidated with reason "replaced";
 *   - with the 15-second TTL the screen shows the expired state, and the backend agrees.
 */
import { expect, test, type Page } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const PASSWORD = process.env.UNIVAULT_E2E_PASSWORD ?? '';
const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:4100/api/v1';
const QR_ALT = 'QR code to add this credential to a UniVault wallet';
const OFFER_PREFIX = 'openid-credential-offer://?credential_offer=';
const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code';
/** Serendib Trading employees the demo data leaves without a credential (not used elsewhere). */
const ISSUE_REF = 'STC-00049';
const EXPIRY_REF = 'STC-00047';

async function signInTo(page: Page, path: string, email: string) {
  await page.goto(path);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

async function api<T>(page: Page, path: string, init: { method?: string; data?: unknown } = {}) {
  const token = await page.evaluate(() => sessionStorage.getItem('univault.issuer-portal.token'));
  const res = await page.request.fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}` },
    ...(init.data === undefined ? {} : { data: init.data }),
  });
  expect(res.ok(), `${init.method ?? 'GET'} ${path}`).toBe(true);
  return (await res.json()) as T;
}

/** Screenshot of the QR code as drawn on screen, decoded with jsQR. */
async function scanQr(page: Page): Promise<string> {
  const png = PNG.sync.read(await page.getByRole('img', { name: QR_ALT }).screenshot());
  const result = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  expect(result, 'the QR code on screen decodes').not.toBeNull();
  return result!.data;
}

function checkOfferUri(uri: string) {
  expect(uri.startsWith(OFFER_PREFIX)).toBe(true);
  const url = new URL(uri);
  expect([...url.searchParams.keys()]).toEqual(['credential_offer']);
  const offer = JSON.parse(url.searchParams.get('credential_offer')!) as {
    credential_issuer: string;
    credential_configuration_ids: string[];
    grants: Record<string, Record<string, unknown>>;
  };
  expect(Object.keys(offer).sort()).toEqual([
    'credential_configuration_ids',
    'credential_issuer',
    'grants',
  ]);
  expect(offer.credential_issuer).toBe(`${API}/issuers/employer-a`);
  expect(offer.credential_configuration_ids).toEqual(['EmploymentCredential']);
  const grant = offer.grants[PRE_AUTH_GRANT]!;
  expect(grant['pre-authorized_code']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(grant).not.toHaveProperty('tx_code');
}

test('employer admin issues a credential and shows the wallet offer; a new QR code replaces the first', async ({
  page,
}) => {
  expect(PASSWORD, 'playwright.config.ts sets UNIVAULT_E2E_PASSWORD').not.toBe('');
  await signInTo(page, '/credentials/new', 'admin@serendib-trading.example');
  await page
    .getByRole('searchbox', { name: 'Search holders by name or reference' })
    .fill(ISSUE_REF);
  const choice = page.getByRole('link', { name: /^Issue to / });
  await expect(choice).toHaveCount(1); // the search is debounced
  await choice.click();
  await expect(page.getByRole('heading', { name: 'Credential details' })).toHaveCount(0);
  for (let step = 1; step < 4; step += 1) await page.getByRole('button', { name: 'Next' }).click();
  await page
    .getByRole('checkbox', {
      name: 'I confirm these details were checked against the original documents',
    })
    .check();
  await page.getByRole('button', { name: 'Issue credential' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Credential created' })).toBeVisible();

  await page.getByRole('link', { name: 'Create wallet offer' }).click();
  await expect(page).toHaveURL(/\/credentials\/[0-9a-f-]{36}\/offer$/);
  await expect(page.getByRole('img', { name: QR_ALT })).toBeVisible();
  const first = await scanQr(page);
  checkOfferUri(first);
  expect(page.url()).not.toContain('pre-authorized');

  const credentialId = /\/credentials\/([0-9a-f-]{36})\/offer$/.exec(page.url())![1]!;
  const before = await api<{ activeOffer: { offerId: string } | null }>(
    page,
    `/credentials/${credentialId}`,
  );
  const firstOfferId = before.activeOffer!.offerId;

  await page.getByRole('button', { name: 'Generate new QR code' }).click();
  const confirm = page.getByRole('alertdialog', { name: 'Generate a new QR code?' });
  await confirm.getByRole('button', { name: 'Generate new QR code' }).click();
  await expect
    .poll(
      async () =>
        (
          await api<{ activeOffer: { offerId: string } | null }>(
            page,
            `/credentials/${credentialId}`,
          )
        ).activeOffer?.offerId,
    )
    .not.toBe(firstOfferId);
  await expect(page.getByRole('img', { name: QR_ALT })).toBeVisible();
  const second = await scanQr(page);
  checkOfferUri(second);
  expect(second).not.toBe(first);

  const old = await api<{ status: string; invalidationReason: string | null }>(
    page,
    `/credential-offers/${firstOfferId}`,
  );
  expect(old).toMatchObject({ status: 'invalidated', invalidationReason: 'replaced' });
});

test('with a 15-second offer TTL the screen shows the expired state', async ({ page }) => {
  await signInTo(page, '/credentials', 'admin@serendib-trading.example');
  await expect(page.getByRole('heading', { level: 1, name: 'Credentials' })).toBeVisible();
  const found = await api<{ holders: { id: string; externalRef: string }[] }>(
    page,
    `/holders?search=${EXPIRY_REF}`,
  );
  const holder = found.holders.find((h) => h.externalRef === EXPIRY_REF)!;
  const credential = await api<{ id: string }>(page, '/credentials', {
    method: 'POST',
    data: { holderId: holder.id },
  });

  await page.goto(`/credentials/${credential.id}`);
  await page.getByRole('link', { name: 'Create wallet offer' }).click();
  await expect(page.getByRole('img', { name: QR_ALT })).toBeVisible();
  await expect(page.getByRole('timer')).toHaveText(/^00:1[0-5]$/);

  await expect(page.getByText('This QR code has expired')).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole('img', { name: QR_ALT })).toHaveCount(0);
  const detail = await api<{ activeOffer: { offerId: string } | null }>(
    page,
    `/credentials/${credential.id}`,
  );
  expect(detail.activeOffer).toBeNull(); // the backend agrees: nothing is active any more
});
