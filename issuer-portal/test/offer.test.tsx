/**
 * The wallet offer screen (/credentials/:id/offer, Decision 021): the QR code decodes to
 * exactly the backend's URI; the countdown runs on the server's clock (a skewed PC clock does
 * not matter); the last-minute warning and once-a-minute announcements; expiry by countdown
 * or status; every polled status; polling stops in final states; regenerate and cancel with
 * confirmation; the reload message; the code never reaches the URL, storage, the query caches
 * or the console; the developer panel only outside production; entry points; Sinhala.
 */
import { focusManager } from '@tanstack/react-query';
import { act, screen, waitFor, within } from '@testing-library/react';
import jsQR from 'jsqr';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../src/i18n/index.js';
import { formatColomboTime } from '../src/lib/format.js';
import { formatCountdown } from '@univault/portal-ui';
import { si } from '../src/i18n/locales/si.js';
import {
  addPendingCredential,
  ADMIN,
  API,
  BANK_ADMIN,
  errorBody,
  HOLDER_IDS,
  MOCK_NOW,
  mockCreateOffer,
  mockInvalidateOffer,
  mockRedeemOffer,
  mockServerClock,
  OFFER_TTL_SECONDS,
  offerStore,
  OFFICER,
  requests,
  server,
} from './mock-backend.js';
import { renderApp } from './render-app.js';

const QR_ALT = 'QR code to add this credential to a UniVault wallet';

// Everything below follows the offer lifetime (the mock's OFFER_TTL_SECONDS), not a fixed 10:00
const TTL = OFFER_TTL_SECONDS;
/** mm:ss at `secondsLeft`, allowing the one second real time may add (shouldAdvanceTime). */
const shows = (secondsLeft: number) =>
  new RegExp(`^(${formatCountdown(secondsLeft)}|${formatCountdown(secondsLeft - 1)})$`);
const minutesLeft = (secondsLeft: number) =>
  `${Math.ceil(secondsLeft / 60)} minutes left to scan the QR code`;
const EXPIRES_AT = new Date(Date.parse(MOCK_NOW) + TTL * 1000).toISOString();

/** Rasterises the rendered QR SVG (viewBox + path) to pixels and reads it with jsQR. */
function decodeQr(svg: Element, pixelsPerModule = 4): string | null {
  const side = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
  const dark = new Set<string>();
  for (const [, x, y] of svg
    .querySelector('path')!
    .getAttribute('d')!
    .matchAll(/M(\d+) (\d+)h1v1h-1z/g)) {
    dark.add(`${x},${y}`);
  }
  const width = side * pixelsPerModule;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const on = dark.has(
        `${Math.floor(px / pixelsPerModule)},${Math.floor(py / pixelsPerModule)}`,
      );
      const i = (py * width + px) * 4;
      data[i] = data[i + 1] = data[i + 2] = on ? 0 : 255;
      data[i + 3] = 255;
    }
  }
  return jsQR(data, width, width)?.data ?? null;
}

const createRequests = () =>
  requests.filter((r) => r.method === 'POST' && r.path === '/credential-offers');
const pollRequests = (offerId: string) =>
  requests.filter((r) => r.method === 'GET' && r.path === `/credential-offers/${offerId}`);
const offers = () => [...offerStore.values()];
const latestOffer = () => offers().at(-1)!;
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));
const timer = () => screen.getByRole('timer');
const qr = () => screen.queryByRole('img', { name: QR_ALT });

async function openOffer(credentialId: string, as = ADMIN) {
  const view = renderApp(`/credentials/${credentialId}/offer`, { signedInAs: as });
  await screen.findByRole('heading', { level: 1, name: 'Wallet offer' });
  return view;
}
async function openWithQr(credentialId = addPendingCredential(), as = ADMIN) {
  const view = await openOffer(credentialId, as);
  await screen.findByRole('img', { name: QR_ALT });
  return { ...view, credentialId, offer: latestOffer() };
}

beforeEach(() => {
  vi.useFakeTimers({
    shouldAdvanceTime: true,
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date(MOCK_NOW));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('opening the screen', () => {
  it('creates one offer; the QR code decodes to exactly the backend URI; the details beside it', async () => {
    const { offer } = await openWithQr();
    expect(createRequests()).toHaveLength(1);
    const svg = screen.getByRole('img', { name: QR_ALT });
    expect(decodeQr(svg)).toBe(offer.qrContent);
    expect(offer.qrContent.startsWith('openid-credential-offer://?credential_offer=')).toBe(true);
    // At least ~280 px on desktop, a whole number of pixels per module
    const width = Number(svg.getAttribute('width'));
    const modules = Number(svg.getAttribute('viewBox')!.split(' ')[2]);
    expect(width).toBeGreaterThanOrEqual(288);
    expect(width % modules).toBe(0);
    const details = screen
      .getByRole('heading', { name: 'Offer details' })
      .closest('div')!.parentElement!;
    expect(within(details).getByText('Nimesha Perera')).toBeInTheDocument();
    expect(within(details).getByText('Employment credential')).toBeInTheDocument();
    // 04:30Z + the TTL, shown in Sri Lanka time (UTC+05:30); 5 minutes → 10:05
    expect(
      screen.getByText(`Expires at ${formatColomboTime(EXPIRES_AT, 'en')} (Asia/Colombo)`),
    ).toBeInTheDocument();
    const time = screen.getByRole('timer', { name: /^Time left / });
    expect(time.textContent).toMatch(shows(TTL));
    expect(time).toHaveAccessibleName(`Time left ${time.textContent}`);
  });

  it('the alt text describes the purpose and never contains the URI', async () => {
    const { offer } = await openWithQr();
    const svg = screen.getByRole('img', { name: QR_ALT });
    expect(svg.getAttribute('aria-label')).not.toContain('openid');
    expect(svg.outerHTML).not.toContain(offer.code);
  });

  it('shows the countdown on the SERVER clock: a PC clock 3 hours fast still counts the full TTL', async () => {
    mockServerClock.offsetMs = -3 * 60 * 60 * 1000; // the server is 3 h behind this PC
    await openWithQr();
    expect(timer().textContent).toMatch(shows(TTL));
    await advance(60_000);
    expect(timer().textContent).toMatch(shows(TTL - 60));
    expect(qr()).toBeInTheDocument(); // without the offset it would show "expired" at once
  });

  it('...and a PC clock 2 minutes slow does not show more time than the server allows', async () => {
    mockServerClock.offsetMs = 2 * 60 * 1000;
    await openWithQr();
    expect(timer().textContent).toMatch(shows(TTL));
  });
});

describe('countdown', () => {
  it('turns amber in the last minute; announces once a minute and at 1 minute left', async () => {
    await openWithQr();
    const live = () => timer().parentElement!.querySelector('[aria-live="polite"]')!.textContent;
    // Checkpoints stay clear of the minute boundaries: real time also moves the fake clock.
    // Needs a TTL of at least 3 minutes (5 today: 5:00 → 4:30 → 3:59 → 1:30 → 0:50 → 0:30).
    expect(TTL).toBeGreaterThanOrEqual(180);
    expect(live()).toBe(minutesLeft(TTL));
    expect(timer().closest('[data-warning]')).toBeNull();
    await advance(30_000); // TTL − 30 s: same minute, nothing new to announce
    expect(live()).toBe(minutesLeft(TTL));
    await advance(31_000); // TTL − 61 s: one minute fewer
    expect(live()).toBe(minutesLeft(TTL - 61));
    await advance((TTL - 61 - 90) * 1000); // 1:30
    expect(live()).toBe('2 minutes left to scan the QR code');
    expect(timer().closest('[data-warning]')).toBeNull();
    expect(screen.queryByText(/^Less than a minute left/)).not.toBeInTheDocument();
    await advance(40_000); // 0:50
    expect(live()).toBe('1 minute left – the QR code expires soon');
    expect(timer().closest('[data-warning]')).toHaveAttribute('data-warning', 'true');
    expect(screen.getByText(/^Less than a minute left/)).toBeInTheDocument();
    await advance(20_000); // 0:30: still the same announcement
    expect(live()).toBe('1 minute left – the QR code expires soon');
    expect(timer().textContent).toMatch(/^00:(30|29)$/);
  });

  it('expired by the countdown: QR removed, "This QR code has expired"; the server confirms and polling stops', async () => {
    const { offer } = await openWithQr();
    await advance(TTL * 1000);
    expect(qr()).not.toBeInTheDocument();
    expect(await screen.findByText('This QR code has expired')).toBeInTheDocument();
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    await waitFor(() => expect(pollRequests(offer.offerId).length).toBeGreaterThan(0));
    await advance(1_000);
    const polls = pollRequests(offer.offerId).length;
    await advance(30_000);
    expect(pollRequests(offer.offerId)).toHaveLength(polls);
    // No confirmation needed for a QR code that no longer works
    await act(async () => {
      screen.getByRole('button', { name: 'Generate new QR code' }).click();
    });
    expect(await screen.findByRole('img', { name: QR_ALT })).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(createRequests()).toHaveLength(2);
  });
});

describe('status polling', () => {
  it('polls every 5 s and on window focus while active', async () => {
    const { offer } = await openWithQr();
    await waitFor(() => expect(pollRequests(offer.offerId)).toHaveLength(1)); // first read
    await advance(5_000);
    expect(pollRequests(offer.offerId)).toHaveLength(2);
    await advance(5_000);
    expect(pollRequests(offer.offerId)).toHaveLength(3);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(pollRequests(offer.offerId)).toHaveLength(4));
    focusManager.setFocused(undefined);
  });

  it('redeemed → "Accepted by the holder\'s wallet", QR removed, link to the credential; polling stops', async () => {
    const { offer, credentialId } = await openWithQr();
    mockRedeemOffer(offer.offerId);
    await advance(5_000);
    expect(await screen.findByText("Accepted by the holder's wallet")).toBeInTheDocument();
    // a confirmation, not a status: the accent check in a brand-soft circle (no status green)
    const check = screen.getByTestId('offer-success-check');
    expect(check).toHaveClass('bg-brand-soft');
    expect(check.querySelector('svg')).toHaveClass('text-accent');
    expect(check.parentElement!.innerHTML).not.toMatch(/status-valid/);
    expect(qr()).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View credential' })).toHaveAttribute(
      'href',
      `/credentials/${credentialId}`,
    );
    expect(screen.queryByRole('button', { name: 'Generate new QR code' })).not.toBeInTheDocument();
    const polls = pollRequests(offer.offerId).length;
    await advance(30_000);
    expect(pollRequests(offer.offerId)).toHaveLength(polls);
  });

  it('replaced (a newer QR code made elsewhere) → "A newer QR code was generated…"; polling stops', async () => {
    const { offer, credentialId } = await openWithQr();
    mockCreateOffer(credentialId); // e.g. another tab
    await advance(5_000);
    expect(
      await screen.findByText('A newer QR code was generated for this credential'),
    ).toBeInTheDocument();
    expect(qr()).not.toBeInTheDocument();
    const polls = pollRequests(offer.offerId).length;
    await advance(20_000);
    expect(pollRequests(offer.offerId)).toHaveLength(polls);
  });

  it('cancelled elsewhere → "Offer cancelled"; credential revoked → "can no longer be offered"', async () => {
    const first = await openWithQr();
    mockInvalidateOffer(first.offer.offerId, 'cancelled');
    await advance(5_000);
    expect(await screen.findByText('Offer cancelled')).toBeInTheDocument();
    first.unmount();

    const second = await openWithQr(addPendingCredential(HOLDER_IDS.lahiru));
    mockInvalidateOffer(second.offer.offerId, 'credential_revoked');
    await advance(5_000);
    expect(await screen.findByText('This credential can no longer be offered')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate new QR code' })).not.toBeInTheDocument();
  });

  it('the server status wins: expired early on the server → expired at once', async () => {
    const { offer } = await openWithQr();
    offer.expiresAt = Date.now() - 1; // the server says it ended already
    await advance(5_000);
    expect(await screen.findByText('This QR code has expired')).toBeInTheDocument();
  });

  it('the server status wins: countdown at zero but the server still says active → QR stays', async () => {
    const { offer } = await openWithQr();
    await advance((TTL - 6) * 1000);
    // The server's clock turns out to be a minute behind what the first response suggested
    mockServerClock.offsetMs = -60_000;
    await advance(7_000); // the countdown alone would be at zero now
    await waitFor(() => expect(qr()).toBeInTheDocument());
    expect(timer().textContent).toMatch(/^00:(5\d|60)|01:00$/);
    expect(pollRequests(offer.offerId).length).toBeGreaterThan(TTL / 5 / 2); // still polling
  });
});

describe('actions', () => {
  it('Generate new QR code asks first while the current one works, then replaces it', async () => {
    const { offer, user } = await openWithQr();
    await user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Generate a new QR code?' });
    expect(dialog).toHaveTextContent('The current QR code stops working immediately.');
    await user.click(within(dialog).getByRole('button', { name: 'Keep current QR code' }));
    expect(createRequests()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Generate new QR code',
      }),
    );
    await waitFor(() => expect(createRequests()).toHaveLength(2));
    const second = latestOffer();
    expect(second.offerId).not.toBe(offer.offerId);
    await waitFor(() =>
      expect(decodeQr(screen.getByRole('img', { name: QR_ALT }))).toBe(second.qrContent),
    );
    expect(offerStore.get(offer.offerId)).toMatchObject({ reason: 'replaced' });
  });

  it('Cancel offer asks first, then shows "Offer cancelled" and stops polling', async () => {
    const { offer, user } = await openWithQr();
    await user.click(screen.getByRole('button', { name: 'Cancel offer' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Cancel this offer?' });
    await user.click(within(dialog).getByRole('button', { name: 'Keep offer' }));
    expect(requests.some((r) => r.path.endsWith('/cancel'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Cancel offer' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel offer' }),
    );
    expect(await screen.findByText('Offer cancelled')).toBeInTheDocument();
    expect(qr()).not.toBeInTheDocument();
    expect(offerStore.get(offer.offerId)).toMatchObject({ reason: 'cancelled' });
    const polls = pollRequests(offer.offerId).length;
    await advance(20_000);
    expect(pollRequests(offer.offerId)).toHaveLength(polls);
  });

  it('a cancel that fails (already redeemed) explains and shows what really happened', async () => {
    const { offer, user } = await openWithQr();
    await waitFor(() => expect(pollRequests(offer.offerId)).toHaveLength(1));
    mockRedeemOffer(offer.offerId); // after the last poll: the screen still shows it active
    await user.click(screen.getByRole('button', { name: 'Cancel offer' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel offer' }),
    );
    expect(await screen.findByText(/^The offer could not be cancelled\./)).toBeInTheDocument();
    expect(await screen.findByText("Accepted by the holder's wallet")).toBeInTheDocument();
  });

  it('Show full screen: a large QR code and countdown in a dialog; Esc closes', async () => {
    const { offer, user } = await openWithQr();
    await user.click(screen.getByRole('button', { name: 'Show full screen' }));
    const dialog = screen.getByRole('dialog', { name: 'Scan with the UniVault wallet' });
    const big = within(dialog).getByRole('img', { name: QR_ALT });
    expect(Number(big.getAttribute('width'))).toBeGreaterThanOrEqual(560);
    expect(decodeQr(big)).toBe(offer.qrContent);
    expect(within(dialog).getByRole('timer')).toHaveClass('text-display');
    // Only the visible countdown (the full-screen one) announces
    const liveOf = (timerElement: Element) =>
      timerElement.parentElement!.querySelector('[aria-live]');
    const [mainTimer, bigTimer] = screen.getAllByRole('timer');
    expect(liveOf(mainTimer!)).toBeNull();
    expect(liveOf(bigTimer!)).toHaveTextContent(minutesLeft(TTL));
    expect(within(dialog).getByRole('button', { name: 'Close full screen' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('reload and return: the QR code is never shown again', () => {
  it('opened while an offer is active: explains, fetches no code, and Generate continues', async () => {
    const credentialId = addPendingCredential();
    const existing = mockCreateOffer(credentialId); // shown earlier, then the page was reloaded
    const view = await openOffer(credentialId);
    expect(
      await screen.findByText("For security, this QR code can't be shown again."),
    ).toBeInTheDocument();
    expect(screen.getByText('Generate a new one to continue.')).toBeInTheDocument();
    expect(qr()).not.toBeInTheDocument();
    expect(createRequests()).toHaveLength(0);
    expect(pollRequests(existing.offerId)).toHaveLength(0);
    expect(document.body.innerHTML).not.toContain(existing.code);

    await view.user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    expect(await screen.findByRole('img', { name: QR_ALT })).toBeInTheDocument();
    expect(createRequests()).toHaveLength(1);
    expect(offerStore.get(existing.offerId)).toMatchObject({ reason: 'replaced' });
  });

  it('leaving and coming back shows the message; the offer queries are removed on leaving', async () => {
    const view = await openWithQr();
    await act(() => view.router.navigate(`/credentials/${view.credentialId}`));
    await screen.findByRole('heading', { level: 1, name: 'Credential' });
    expect(view.queryClient.getQueryCache().findAll({ queryKey: ['credential-offers'] })).toEqual(
      [],
    );
    await act(() => view.router.navigate(`/credentials/${view.credentialId}/offer`));
    expect(
      await screen.findByText("For security, this QR code can't be shown again."),
    ).toBeInTheDocument();
    expect(createRequests()).toHaveLength(1);
  });
});

describe('the one-time code stays in memory', () => {
  it('never reaches the URL, sessionStorage, localStorage, the query caches or the console', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method),
    );
    const view = await openWithQr();
    // Generate a second one too
    await view.user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    await view.user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Generate new QR code',
      }),
    );
    await waitFor(() => expect(createRequests()).toHaveLength(2));
    await advance(10_000);

    const codes = offers().map((o) => o.code);
    expect(codes).toHaveLength(2);
    const caches = JSON.stringify([
      view.queryClient
        .getQueryCache()
        .getAll()
        .map((q) => [q.queryKey, q.state.data]),
      view.queryClient
        .getMutationCache()
        .getAll()
        .map((m) => m.state.data),
    ]);
    const stored = JSON.stringify({ ...window.sessionStorage, ...window.localStorage });
    const written = JSON.stringify(setItem.mock.calls);
    const logged = JSON.stringify(consoles.map((spy) => spy.mock.calls));
    for (const code of codes) {
      expect(view.location()).not.toContain(code);
      expect(window.location.href).not.toContain(code);
      expect(caches).not.toContain(code);
      expect(stored).not.toContain(code);
      expect(written).not.toContain(code);
      expect(logged).not.toContain(code);
    }
    expect(view.location()).toBe(`/credentials/${view.credentialId}/offer`);
  });
});

describe('developer details', () => {
  it('outside production: a collapsible panel with the decoded credential_offer and a warning', async () => {
    const { offer } = await openWithQr();
    const summary = screen.getByText('Developer details');
    expect(summary.tagName).toBe('SUMMARY');
    const panel = summary.closest('details')!;
    expect(panel).not.toHaveAttribute('open');
    expect(panel).toHaveTextContent(/contains the one-time pre-authorised code/);
    expect(JSON.parse(within(panel).getByText(/credential_issuer/).textContent!)).toEqual(
      JSON.parse(decodeURIComponent(offer.qrContent.split('credential_offer=')[1]!)),
    );
  });

  it('is never rendered in a production build', async () => {
    vi.stubEnv('PROD', true);
    vi.stubEnv('DEV', false);
    const { offer } = await openWithQr();
    expect(screen.queryByText('Developer details')).not.toBeInTheDocument();
    expect(document.querySelector('details')).toBeNull();
    expect(document.body.innerHTML).not.toContain(offer.code);
  });
});

describe('entry points and other credentials', () => {
  it('the success page and the credential page link to the offer for a pending credential only', async () => {
    const pending = addPendingCredential();
    const first = renderApp(`/credentials/${pending}?issued=1`, { signedInAs: OFFICER });
    expect(await screen.findByRole('link', { name: 'Create wallet offer' })).toHaveAttribute(
      'href',
      `/credentials/${pending}/offer`,
    );
    first.unmount();

    const plain = renderApp(`/credentials/${pending}`, { signedInAs: OFFICER });
    await plain.user.click(await screen.findByRole('link', { name: 'Create wallet offer' }));
    expect(await screen.findByRole('img', { name: QR_ALT })).toBeInTheDocument();
    plain.unmount();

    const valid = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    renderApp(`/credentials/${valid}`, { signedInAs: OFFICER });
    await screen.findByRole('heading', { level: 1, name: 'Credential' });
    expect(screen.queryByRole('link', { name: 'Create wallet offer' })).not.toBeInTheDocument();
  });

  it('a credential that is not pending: explains, creates nothing', async () => {
    const valid = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    await openOffer(valid);
    expect(
      await screen.findByText('Only a credential awaiting the wallet can be offered'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^This credential is Valid:/)).toBeInTheDocument();
    expect(createRequests()).toHaveLength(0);
    expect(screen.getByRole('link', { name: 'Back to credential' })).toBeInTheDocument();
  });

  it('CREDENTIAL_NOT_PENDING from the server (changed meanwhile) shows the credential state', async () => {
    const credentialId = addPendingCredential();
    const detail = (status: 'pending' | 'revoked') => ({
      id: credentialId,
      holder: { id: HOLDER_IDS.nimesha, externalRef: 'STC-00002', fullName: 'Nimesha Perera' },
      credentialType: 'EmploymentCredential',
      status,
      effectiveStatus: status,
      issuedAt: null,
      expiresAt: '2027-11-26T04:30:00.000Z',
      createdAt: MOCK_NOW,
      activeOffer: null,
    });
    let reads = 0;
    server.use(
      // Pending when the page opens, revoked by an admin before the offer request arrives
      http.get(`${API}/credentials/:credentialId`, () => {
        reads += 1;
        return HttpResponse.json(detail(reads === 1 ? 'pending' : 'revoked'));
      }),
      http.post(`${API}/credential-offers`, () =>
        HttpResponse.json(errorBody('CREDENTIAL_NOT_PENDING', 'Only a pending credential'), {
          status: 409,
        }),
      ),
    );
    await openOffer(credentialId);
    expect(
      await screen.findByText('Only a credential awaiting the wallet can be offered'),
    ).toBeInTheDocument();
    expect(screen.getByText(/^This credential is Revoked:/)).toBeInTheDocument();
    expect(reads).toBe(2);
  });

  it('create errors: an expired credential, then a network failure; Generate tries again', async () => {
    const credentialId = addPendingCredential();
    server.use(
      http.post(
        `${API}/credential-offers`,
        () =>
          HttpResponse.json(errorBody('CREDENTIAL_EXPIRED', 'This credential has expired'), {
            status: 409,
          }),
        { once: true },
      ),
      http.post(`${API}/credential-offers`, () => HttpResponse.error(), { once: true }),
    );
    const view = await openOffer(credentialId);
    expect(
      await screen.findByText('This credential has expired, so it cannot be offered.'),
    ).toBeInTheDocument();
    expect(screen.getByText('The QR code could not be created.')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    expect(
      await screen.findByText(
        'Cannot reach the UniVault server. Check your connection and try again.',
      ),
    ).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Generate new QR code' }));
    expect(await screen.findByRole('img', { name: QR_ALT })).toBeInTheDocument();
  });

  it("another issuer's or an unknown credential is not found; a failed load can be retried", async () => {
    const credentialId = addPendingCredential();
    const bank = await openOffer(credentialId, BANK_ADMIN);
    expect(
      await screen.findByRole('heading', { name: 'Credential not found' }),
    ).toBeInTheDocument();
    bank.unmount();

    server.use(
      http.get(
        `${API}/credentials/:credentialId`,
        () => HttpResponse.json(errorBody('INTERNAL_ERROR', 'boom'), { status: 500 }),
        { once: true },
      ),
    );
    const view = renderApp(`/credentials/${credentialId}/offer`, { signedInAs: ADMIN });
    expect(await screen.findByText('The credential could not be loaded.')).toBeInTheDocument();
    await view.user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('img', { name: QR_ALT })).toBeInTheDocument();
  });
});

describe('Sinhala', () => {
  it('renders the screen, the alt text and the actions in Sinhala', async () => {
    await i18n.changeLanguage('si');
    const credentialId = addPendingCredential();
    renderApp(`/credentials/${credentialId}/offer`, { signedInAs: ADMIN });
    expect(
      await screen.findByRole('heading', { level: 1, name: si.offer.title }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: si.offer.qrAlt })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: si.offer.actions.fullScreen })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: si.offer.actions.cancel })).toBeInTheDocument();
    expect(
      screen.getByRole('timer', {
        name: new RegExp(`^${si.offer.timeLeft} ${shows(TTL).source.slice(1)}`),
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        si.offer.expiresAt.replace('{{time}}', formatColomboTime(EXPIRES_AT, 'si')!),
      ),
    ).toBeInTheDocument();
  });
});
