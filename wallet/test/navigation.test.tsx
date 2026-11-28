/**
 * Navigation on the REAL app/ tree: `/` opens Credentials, the four tabs switch, every stack is
 * entered and left again with the header's back button, Android's hardware back button follows
 * the platform norm (pop the stack → first tab → leave the app only from the Credentials root),
 * a deep link to a detail keeps its list underneath, and unknown routes show not-found.
 */
import { act, screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { BackHandler } from 'react-native';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';

const APP_DIR = join(__dirname, '..', 'app');

/**
 * Simulated Android back button: records the hardwareBackPress listeners (the navigation
 * container registers one) and calls them newest first, like React Native's BackHandler.
 * Returns true if one handled the press; false means Android would close the app.
 */
type BackListener = Parameters<typeof BackHandler.addEventListener>[1];

function installBackHandler() {
  const listeners: BackListener[] = [];
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, listener) => {
    if (event === 'hardwareBackPress') listeners.push(listener);
    return {
      remove: () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
  });
  return async (): Promise<boolean> => {
    let handled = false;
    await act(async () => {
      handled = [...listeners]
        .reverse()
        .some((listener) => listener({} as Parameters<BackListener>[0]) === true);
    });
    return handled;
  };
}

afterEach(() => jest.restoreAllMocks());

async function openApp(url: string) {
  await renderRouter(APP_DIR, { initialUrl: url });
}

describe('tabs', () => {
  it('opens on the Credentials tab at / with four labelled tabs', async () => {
    await openApp(ROUTES.home);
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credentials);
    for (const [name, label] of [
      ['credentials', en.tabs.credentials],
      ['scan', en.tabs.scan],
      ['history', en.tabs.history],
      ['settings', en.tabs.settings],
    ] as const) {
      expect(screen.getByTestId(`tab-${name}`).props.accessibilityLabel).toBe(label);
    }
    // a tab's root has no back button
    expect(screen.queryByTestId('stack-header-back')).toBeNull();
    expect(screen.getByRole('header', { name: en.credentials.title })).toBeOnTheScreen();
  });

  it('switches between the tabs', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.credentials);
    await screen.findByTestId('credentials-screen');

    await user.press(screen.getByTestId('tab-scan'));
    expect(await screen.findByText(en.scan.emptyTitle)).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.scan);

    await user.press(screen.getByTestId('tab-history'));
    expect(await screen.findByTestId('history-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.history);

    await user.press(screen.getByTestId('tab-settings'));
    expect(await screen.findByTestId('settings-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.settings);

    await user.press(screen.getByTestId('tab-credentials'));
    expect(screen).toHavePathname(ROUTES.credentials);
  });
});

describe('stacks: in and back out with the header back button', () => {
  it('Credentials → credential detail → back', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.credentials);
    await user.press(await screen.findByTestId('credential-sample-employment-active'));
    expect(await screen.findByTestId('credential-detail-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credential('sample-employment-active'));
    expect(screen.getByRole('header', { name: en.credentials.detailTitle })).toBeOnTheScreen();

    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('History → entry → back', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.history);
    await user.press(await screen.findByTestId('history-sample-history-1'));
    expect(await screen.findByTestId('history-detail-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.historyEntry('sample-history-1'));
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen).toHavePathname(ROUTES.history);
  });

  it.each([
    ['settings-language', ROUTES.language, 'language-screen'],
    ['settings-security', ROUTES.security, 'security-screen'],
    ['settings-about', ROUTES.about, 'about-screen'],
    ['diagnostics-link', ROUTES.diagnostics, 'diagnostics-screen'],
    ['ui-kit-link', ROUTES.uiKit, 'ui-kit-screen'],
  ])('Settings → %s → back', async (link, path, screenId) => {
    const user = userEvent.setup();
    await openApp(ROUTES.settings);
    await user.press(await screen.findByTestId(link));
    expect(await screen.findByTestId(screenId)).toBeOnTheScreen();
    expect(screen).toHavePathname(path);
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen).toHavePathname(ROUTES.settings);
  });

  it('a deep link to a detail keeps the list underneath (Back goes to the list)', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.credential('sample-kyc-expired'));
    expect(await screen.findByTestId('credential-detail-screen')).toBeOnTheScreen();
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('History detail links to its credential in the Credentials tab', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.historyEntry('sample-history-1'));
    await screen.findByTestId('history-detail-screen');
    await user.press(screen.getByRole('button', { name: /Credential, Employment credential/ }));
    expect(await screen.findByTestId('credential-detail-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credential('sample-employment-active'));
  });
});

describe('Android hardware back button', () => {
  it('pops a stack, then leaves the app only from the Credentials root', async () => {
    const pressBack = installBackHandler();
    const user = userEvent.setup();
    await openApp(ROUTES.credentials);
    await user.press(await screen.findByTestId('credential-sample-kyc-active'));
    expect(screen).toHavePathname(ROUTES.credential('sample-kyc-active'));

    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.credentials);

    // Credentials root: not handled, so Android closes the app (the platform norm)
    expect(await pressBack()).toBe(false);
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('from another tab goes back through its stack, then to Credentials, never out', async () => {
    const pressBack = installBackHandler();
    const user = userEvent.setup();
    await openApp(ROUTES.credentials);
    await screen.findByTestId('credentials-screen');
    await user.press(screen.getByTestId('tab-settings'));
    await user.press(await screen.findByTestId('settings-language'));
    expect(screen).toHavePathname(ROUTES.language);

    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.settings);

    expect(await pressBack()).toBe(true); // tab root → first tab, not out of the app
    expect(screen).toHavePathname(ROUTES.credentials);

    expect(await pressBack()).toBe(false);
  });

  it('a tab opened directly still goes back to Credentials before leaving', async () => {
    const pressBack = installBackHandler();
    await openApp(ROUTES.scan);
    await screen.findByTestId('scan-screen');
    expect(await pressBack()).toBe(true);
    expect(screen).toHavePathname(ROUTES.credentials);
  });
});

describe('unknown routes', () => {
  it('show the not-found screen, which leads to Credentials', async () => {
    const user = userEvent.setup();
    await openApp('/no-such-screen');
    expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
    expect(screen.getAllByText(en.notFound.title).length).toBeGreaterThan(0);
    await user.press(screen.getByRole('button', { name: en.notFound.goHome }));
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('an unknown credential id shows "not found" with a way back to the list', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.credential('no-such-credential'));
    expect(await screen.findByText(en.credentials.notFoundTitle)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.credentials.backToList }));
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('an unknown history id shows "not found" with a way back to history', async () => {
    const user = userEvent.setup();
    await openApp(ROUTES.historyEntry('nope'));
    expect(await screen.findByText(en.history.notFoundTitle)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.history.backToList }));
    expect(screen).toHavePathname(ROUTES.history);
  });
});
