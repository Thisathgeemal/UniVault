/**
 * PinPad and the PIN setup flow (app/setup/security.tsx) on the REAL app/ tree:
 * - keypad: entry, delete, the dots' spoken count (never the digits), key labels and sizes,
 *   shake on error unless reduce motion;
 * - flow: intro → create (weak PIN refused) → confirm (mismatch message, retry, back to create
 *   after 3) → a verifier is stored → "PIN set" → the tabs; Android back inside the flow;
 * - gate: no verifier → setup, verifier → tabs, no tab flash while the secure store answers;
 * - screen capture blocked only when !__DEV__;
 * - the PIN never appears in logs, route params / state, AsyncStorage, the secure store or errors.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { renderRouter } from 'expo-router/testing-library';
import { useState } from 'react';
import { join } from 'node:path';
import { AccessibilityInfo, Animated, BackHandler, StyleSheet } from 'react-native';
import { PIN_KEY_MIN_SIZE, PinPad } from '../src/components';
import * as appInfo from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import { PIN_VERIFIER_KEY, PinStoreError, savePin, verifyPin } from '../src/security/pin';
import { PIN_SCREEN_CAPTURE_KEY } from '../src/security/screen-capture';
import * as setupFlow from '../src/security/setup-flow';
import { lightColors } from '../src/theme';
import { Providers, renderWithProviders } from './render';
import { secureStore, seedOnboardedWithoutSecurity, TEST_PIN } from './setup-state';

jest.mock('expo-screen-capture', () => ({
  preventScreenCaptureAsync: jest.fn(async () => undefined),
  allowScreenCaptureAsync: jest.fn(async () => undefined),
}));

const APP_DIR = join(__dirname, '..', 'app');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const NEW_PIN = '903618';
const OTHER_PIN = '461705';

afterEach(() => jest.restoreAllMocks());

/** A PinPad with its own state, like a screen; reports completed PINs. */
function Harness({
  onComplete,
  errorCount = 0,
}: {
  onComplete: (pin: string) => void;
  errorCount?: number;
}) {
  const [value, setValue] = useState('');
  return (
    <PinPad
      value={value}
      onChange={setValue}
      onComplete={(pin) => {
        setValue('');
        onComplete(pin);
      }}
      errorCount={errorCount}
    />
  );
}

const user = () => userEvent.setup();
async function typePin(pin: string, u = user()) {
  for (const digit of pin) await u.press(screen.getByTestId(`pin-pad-key-${digit}`));
}
const dotsLabel = () => screen.getByTestId('pin-pad-dots').props.accessibilityLabel as string;

describe('PinPad', () => {
  it('ten digit keys in the phone layout and Delete, each with a spoken label, ≥ 56 pt', async () => {
    await renderWithProviders(<Harness onComplete={() => undefined} />);
    const keys = screen.getAllByRole('button');
    expect(keys.map((k) => k.props.accessibilityLabel)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
      en.pin.delete,
    ]);
    for (const key of keys) {
      const style = flat(key.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(56);
      expect(style.minWidth).toBeGreaterThanOrEqual(56);
    }
    expect(PIN_KEY_MIN_SIZE).toBe(56);
  });

  it('dots announce how many digits are entered, never which', async () => {
    const u = user();
    await renderWithProviders(<Harness onComplete={() => undefined} />);
    expect(dotsLabel()).toBe('0 of 6 digits entered');
    expect(screen.getByTestId('pin-pad-dots').props.accessibilityLiveRegion).toBe('polite');
    await typePin('274', u);
    expect(dotsLabel()).toBe('3 of 6 digits entered');
    expect(dotsLabel()).not.toMatch(/[2-7]{2}/);
    expect(
      screen.getAllByTestId('pin-pad-dot-filled', { includeHiddenElements: true }),
    ).toHaveLength(3);
    expect(screen.queryByText('274')).toBeNull();
  });

  it('Delete removes the last digit and is disabled when empty', async () => {
    const u = user();
    await renderWithProviders(<Harness onComplete={() => undefined} />);
    expect(screen.getByRole('button', { name: en.pin.delete })).toBeDisabled();
    await typePin('58', u);
    await u.press(screen.getByRole('button', { name: en.pin.delete }));
    expect(dotsLabel()).toBe('1 of 6 digits entered');
  });

  it('reports the six digits once, then starts empty', async () => {
    const done = jest.fn();
    const u = user();
    await renderWithProviders(<Harness onComplete={done} />);
    await typePin(NEW_PIN, u);
    expect(done).toHaveBeenCalledWith(NEW_PIN);
    expect(done).toHaveBeenCalledTimes(1);
    expect(dotsLabel()).toBe('0 of 6 digits entered');
  });

  it('ignores digits past six and presses while disabled', async () => {
    const onChange = jest.fn();
    const u = user();
    const { rerender } = await renderWithProviders(
      <PinPad value="123456" onChange={onChange} onComplete={() => undefined} />,
    );
    await u.press(screen.getByTestId('pin-pad-key-7'));
    expect(onChange).not.toHaveBeenCalled();
    await rerender(
      <Providers>
        <PinPad value="12" onChange={onChange} onComplete={() => undefined} disabled />
      </Providers>,
    );
    expect(screen.getByTestId('pin-pad-key-7')).toBeDisabled();
  });

  it('shakes on an error, but not with reduce motion on', async () => {
    const sequence = jest.spyOn(Animated, 'sequence');
    const { rerender } = await renderWithProviders(<Harness onComplete={() => undefined} />);
    expect(sequence).not.toHaveBeenCalled();
    await rerender(
      <Providers>
        <Harness onComplete={() => undefined} errorCount={1} />
      </Providers>,
    );
    expect(sequence).toHaveBeenCalledTimes(1);
  });

  it('no shake when the phone asks for reduced motion', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValueOnce(true);
    const sequence = jest.spyOn(Animated, 'sequence');
    const { rerender } = await renderWithProviders(<Harness onComplete={() => undefined} />);
    await act(async () => undefined); // the setting has been read
    await rerender(
      <Providers>
        <Harness onComplete={() => undefined} errorCount={1} />
      </Providers>,
    );
    expect(sequence).not.toHaveBeenCalled();
  });
});

describe('PIN setup flow', () => {
  beforeEach(async () => {
    await seedOnboardedWithoutSecurity();
  });

  async function openSetup() {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await screen.findByTestId('setup-security-screen');
  }
  const title = () => screen.getByTestId('setup-title');
  const message = () => screen.queryByTestId('setup-message');

  it('intro explains the PIN; create → confirm → stored → "PIN set" → the tabs', async () => {
    const u = user();
    await openSetup();
    expect(title()).toHaveTextContent(en.setup.intro.title);
    expect(screen.getByText(en.setup.intro.body)).toBeOnTheScreen();
    await u.press(screen.getByTestId('setup-start'));
    expect(title()).toHaveTextContent(en.setup.create.title);

    await typePin(NEW_PIN, u);
    expect(title()).toHaveTextContent(en.setup.confirm.title);
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(false); // not before confirmation
    await typePin(NEW_PIN, u);

    expect(await screen.findByText(en.setup.success.title)).toBeOnTheScreen();
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(true);
    expect(await verifyPin(NEW_PIN)).toBe(true);
    expect(screen).toHavePathname(ROUTES.setupSecurity); // stays for "PIN set"

    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.credentials);
  });

  it('a weak PIN is refused with the plain message and the entry cleared', async () => {
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin('112233', u);
    expect(message()).toHaveTextContent(en.setup.weak);
    expect(message()?.props.accessibilityRole).toBe('alert');
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(dotsLabel()).toBe('0 of 6 digits entered');
    await typePin(NEW_PIN, u);
    expect(title()).toHaveTextContent(en.setup.confirm.title);
    expect(message()).toBeNull();
  });

  it('a mismatch says so and clears; a retry can still match', async () => {
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(OTHER_PIN, u);
    expect(message()).toHaveTextContent(en.setup.mismatch);
    expect(title()).toHaveTextContent(en.setup.confirm.title);
    expect(dotsLabel()).toBe('0 of 6 digits entered');
    await typePin(NEW_PIN, u);
    expect(await screen.findByText(en.setup.success.title)).toBeOnTheScreen();
  });

  it('after 3 mismatches it goes back to create: "Let\'s start again"', async () => {
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(OTHER_PIN, u);
    await typePin(OTHER_PIN, u);
    expect(title()).toHaveTextContent(en.setup.confirm.title);
    await typePin(OTHER_PIN, u);
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(message()).toHaveTextContent(en.setup.restart);
    // the first PIN is forgotten: a new one is needed and confirmed from scratch
    await typePin(OTHER_PIN, u);
    await typePin(OTHER_PIN, u);
    expect(await screen.findByText(en.setup.success.title)).toBeOnTheScreen();
    expect(await verifyPin(OTHER_PIN)).toBe(true);
    expect(await verifyPin(NEW_PIN)).toBe(false);
  });

  it('"Start again" on the confirm step forgets the first PIN', async () => {
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await u.press(screen.getByTestId('setup-start-again'));
    expect(title()).toHaveTextContent(en.setup.create.title);
  });

  it('a failed save sends the holder back to create with a message', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await waitFor(() => expect(message()).toHaveTextContent(en.setup.saveFailed));
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(false);
  });

  it('the biometric hook: a further step after "PIN set" is opened instead of the tabs', async () => {
    jest
      .spyOn(setupFlow, 'stepAfterPinCreated')
      .mockReturnValue({ kind: 'route', href: '/no-such-screen' });
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await screen.findByText(en.setup.success.title);
    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByTestId('not-found-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname('/no-such-screen');
  });

  it('if the verifier vanished before Continue, setup is not completed', async () => {
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await screen.findByText(en.setup.success.title);
    secureStore.clear();
    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByText(en.setup.notCompleted)).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.setupSecurity);
  });

  it('Android back: confirm → create → intro → out of the app', async () => {
    const listeners: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'hardwareBackPress') listeners.push(listener);
      return { remove: () => listeners.splice(listeners.indexOf(listener), 1) && undefined };
    });
    const pressBack = async () => {
      let handled = false;
      await act(async () => {
        handled = [...listeners].reverse().some((l) => l({} as never) === true);
      });
      return handled;
    };
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    expect(await pressBack()).toBe(true);
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(await pressBack()).toBe(true);
    expect(title()).toHaveTextContent(en.setup.intro.title);
    expect(await pressBack()).toBe(false);
  });

  it('one primary button on the intro and success steps, full width at the bottom', async () => {
    const u = user();
    await openSetup();
    const start = screen.getByTestId('setup-start');
    expect(flat(start.props.style).backgroundColor).toBe(lightColors.accent);
    const primaries = screen
      .getAllByRole('button')
      .filter((b) => flat(b.props.style).backgroundColor === lightColors.accent);
    expect(primaries).toHaveLength(1);
    // inside the bottom actions: a column of full-width buttons
    expect(start.parent?.props.testID).toBe('setup-actions-buttons');
    expect(flat(start.parent?.props.style).flexDirection).toBeUndefined();
    await u.press(start);
    expect(screen.queryByTestId('setup-actions')).toBeNull(); // the keypad step has no footer
  });
});

describe('gate with the PIN', () => {
  it('no verifier → setup; a verifier → the tabs', async () => {
    await seedOnboardedWithoutSecurity();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
  });

  it('a verifier opens the tabs', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.home }); // seeded with a TEST_PIN verifier
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
  });

  it('a malformed verifier counts as no PIN', async () => {
    secureStore.set(PIN_VERIFIER_KEY, '{"v":1,"alg":"scrypt"}');
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    expect(await screen.findByTestId('setup-security-screen')).toBeOnTheScreen();
  });

  it('nothing (no tabs) is drawn while the secure store answers', async () => {
    let release: () => void = () => undefined;
    const real = (SecureStore.getItemAsync as jest.Mock).getMockImplementation() as (
      k: string,
    ) => Promise<string | null>;
    (SecureStore.getItemAsync as jest.Mock).mockImplementationOnce(
      (key: string) =>
        new Promise((resolve) => {
          release = () => void real(key).then(resolve);
        }),
    );
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    await act(async () => undefined);
    expect(screen.queryByTestId('credentials-screen')).toBeNull();
    expect(screen.queryByTestId('tab-credentials')).toBeNull();
    await act(async () => release());
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
  });
});

describe('screen capture', () => {
  it('is allowed in development builds (the evidence screenshots)', async () => {
    await seedOnboardedWithoutSecurity();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await screen.findByTestId('setup-security-screen');
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled();
    expect(appInfo.screenCaptureBlockingEnabled()).toBe(!__DEV__);
  });

  it('is blocked on the PIN screens in release builds, and released when they close', async () => {
    jest.spyOn(appInfo, 'screenCaptureBlockingEnabled').mockReturnValue(true);
    const prevent = ScreenCapture.preventScreenCaptureAsync as jest.Mock;
    const allow = ScreenCapture.allowScreenCaptureAsync as jest.Mock;
    prevent.mockRejectedValueOnce(new Error('no module')); // a failure never breaks the screen
    allow.mockRejectedValueOnce(new Error('no module'));
    await seedOnboardedWithoutSecurity();
    const { unmount } = await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await screen.findByTestId('setup-security-screen');
    await waitFor(() => expect(prevent).toHaveBeenCalledWith(PIN_SCREEN_CAPTURE_KEY));
    await act(async () => unmount());
    await waitFor(() => expect(allow).toHaveBeenCalledWith(PIN_SCREEN_CAPTURE_KEY));
  });
});

describe('the PIN never leaks', () => {
  it('not in logs, route params or state, AsyncStorage, the secure store or errors', async () => {
    const SECRET = '845210';
    const logged: string[] = [];
    for (const level of ['log', 'info', 'debug', 'warn', 'error'] as const) {
      const original = console[level];
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
        if (level === 'warn' || level === 'error') original(...args); // keeps the guard working
      });
    }
    await seedOnboardedWithoutSecurity();
    const u = user();
    const app = await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await u.press(await screen.findByTestId('setup-start'));
    const routes: string[] = [];
    const snapshot = () =>
      routes.push(
        app.getPathnameWithParams(),
        JSON.stringify(app.getSearchParams()),
        JSON.stringify(app.getRouterState() ?? null),
      );
    await typePin(SECRET, u);
    snapshot();
    await typePin(SECRET, u);
    await screen.findByText(en.setup.success.title);
    snapshot();
    await u.press(screen.getByTestId('setup-continue'));
    await screen.findByTestId('credentials-screen');
    snapshot();

    // errors from the PIN code paths
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error(`boom ${SECRET}`));
    const saveError = await savePin(SECRET).catch((e: unknown) => e);
    expect(saveError).toBeInstanceOf(PinStoreError);
    const thrown = [String(saveError), JSON.stringify(saveError), (saveError as Error).stack ?? ''];
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error(`boom ${SECRET}`));
    expect(await verifyPin(SECRET)).toBe(false); // swallowed, not rethrown

    const keys = await AsyncStorage.getAllKeys();
    const asyncValues = JSON.stringify(await AsyncStorage.multiGet(keys));
    const secureValues = JSON.stringify([...secureStore.entries()]);
    const haystacks = { logged, routes, asyncValues, secureValues, thrown };
    for (const [where, value] of Object.entries(haystacks)) {
      expect([where, JSON.stringify(value).includes(SECRET)]).toEqual([where, false]);
    }
    expect(JSON.stringify(TEST_PIN)).not.toContain(SECRET);
  });
});
