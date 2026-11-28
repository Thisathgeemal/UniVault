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
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import * as ScreenCapture from 'expo-screen-capture';
import * as SecureStore from 'expo-secure-store';
import { renderRouter } from 'expo-router/testing-library';
import { useState } from 'react';
import { join } from 'node:path';
import { AccessibilityInfo, Animated, BackHandler, StyleSheet } from 'react-native';
import { PIN_KEY_MIN_SIZE, PinPad, SUCCESS_ANIMATION_MS } from '../src/components';
import * as appInfo from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import * as pinModule from '../src/security/pin';
import { PIN_VERIFIER_KEY, PinStoreError, savePin, verifyPin } from '../src/security/pin';
import { PROCESSING_MIN_MS } from '../src/lib/timing';
import { PIN_SCREEN_CAPTURE_KEY } from '../src/security/screen-capture';
import * as setupFlow from '../src/security/setup-flow';
import { lightColors } from '../src/theme';
import { Providers, renderWithProviders } from './render';
import { secureStore, seedOnboardedWithoutSecurity, TEST_PIN } from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const NEW_PIN = '903618';
const OTHER_PIN = '461705';

// clean-ups registered by a test, run after it even when it fails
const cleanups: (() => void)[] = [];
const afterThisTest = (fn: () => void) => cleanups.push(fn);
afterEach(() => {
  for (const fn of cleanups.splice(0)) fn();
  jest.restoreAllMocks();
});

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

  it('the empty position left of 0 is invisible: no border or fill, not focusable or announced', async () => {
    await renderWithProviders(<Harness onComplete={() => undefined} />);
    expect(screen.queryByTestId('pin-pad-spacer')).toBeNull(); // hidden from screen readers
    const spacer = screen.getByTestId('pin-pad-spacer', { includeHiddenElements: true });
    const style = flat(spacer.props.style);
    expect(style.borderWidth).toBeUndefined();
    expect(style.borderColor).toBeUndefined();
    expect(style.backgroundColor).toBeUndefined();
    expect(spacer.props.accessible).toBe(false);
    expect(spacer.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(spacer.props.accessibilityElementsHidden).toBe(true);
    expect(spacer.props.pointerEvents).toBe('none');
    expect(spacer.props.accessibilityRole).toBeUndefined();
    // it keeps the layout: the same size as a key, so 0 stays under 8
    expect(style.minWidth).toBe(56);
    expect(style.minHeight).toBe(56);
    expect(style.flex).toBe(1);
    expect(screen.getAllByRole('button')).toHaveLength(11);
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

  it('a match: the keypad goes at once, a full-screen "Securing your PIN…" (announced); "PIN set" only after the save', async () => {
    const setItem = SecureStore.setItemAsync as jest.Mock;
    const real = setItem.getMockImplementation() as (k: string, v: string) => Promise<void>;
    let release: () => void = () => undefined;
    setItem.mockImplementationOnce(
      (k: string, v: string) =>
        new Promise<void>((resolve) => {
          release = () => void real(k, v).then(resolve);
        }),
    );
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    const saving = await screen.findByTestId('setup-saving');
    expect(saving.props.accessibilityLabel).toBe(en.setup.saving);
    expect(en.setup.saving).toBe('Securing your PIN…');
    expect(en.setup.saving).not.toMatch(/key|hash/i); // no technical words
    expect(saving.props.accessibilityRole).toBe('progressbar');
    expect(saving.props.accessibilityState).toEqual({ busy: true });
    expect(saving.props.accessibilityLiveRegion).toBe('polite');
    expect(flat(saving.props.style)).toMatchObject({ flex: 1, justifyContent: 'center' }); // full screen
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(en.setup.saving);
    // nothing more can be typed: the keypad, the title and the footer are gone
    expect(screen.queryByTestId('pin-pad')).toBeNull();
    expect(screen.queryByTestId('pin-pad-key-5')).toBeNull();
    expect(screen.queryByTestId('setup-title')).toBeNull();
    expect(screen.queryByTestId('setup-actions')).toBeNull();
    // the old "saving the key" text under the keypad is gone too
    expect(screen.queryByText(/saving/i)).toBeNull();
    // the hash has run and is waiting on the store: no success yet, however long it takes
    await waitFor(() => expect(setItem).toHaveBeenCalled());
    // renderRouter runs on Jest's fake timers: move the clock past the minimum display time
    await act(async () => {
      jest.advanceTimersByTime(PROCESSING_MIN_MS + 100);
    });
    expect(screen.queryByText(en.setup.success.title)).toBeNull();

    release(); // findByText waits (inside act) for the save to finish
    expect(
      await screen.findByText(en.setup.success.title, {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('setup-saving')).toBeNull();
  });

  it('the progress state is shown for at least 600 ms, even when saving is instant', async () => {
    jest.spyOn(pinModule, 'savePin').mockResolvedValue(undefined);
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN.slice(0, 5), u);
    const start = Date.now();
    await u.press(screen.getByTestId(`pin-pad-key-${NEW_PIN.slice(5)}`));
    await screen.findByTestId('setup-saving');
    await screen.findByText(en.setup.success.title, {}, { timeout: 3000 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(PROCESSING_MIN_MS);
    expect(PROCESSING_MIN_MS).toBe(600);
  });

  it('"PIN set": a large check mark, the heading announced, one line and Continue', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    expect(
      await screen.findByText(en.setup.success.title, {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
    expect(title()).toHaveTextContent(en.setup.success.title);
    expect(title().props.accessibilityRole).toBe('header');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(en.setup.success.title);
    expect(screen.getByText(en.setup.success.body)).toBeOnTheScreen();
    expect(en.setup.success.body).toBe(
      'You’ll use this PIN to open UniVault and approve every share.',
    );
    // a confirmation, not a status: the accent circle-check in a brand-soft circle (decorative)
    const check = screen.getByTestId('setup-success-check', { includeHiddenElements: true });
    expect(flat(check.props.style)).toMatchObject({ backgroundColor: lightColors.brandSoft });
    const icon = within(check).getByText(/./, { includeHiddenElements: true });
    expect(flat(icon.props.style).color).toBe(lightColors.accent);
    const statusColours = Object.entries(lightColors)
      .filter(([name]) => /^(on)?[sS]tatus/.test(name))
      .map(([, value]) => value);
    expect(statusColours).not.toContain(flat(check.props.style).backgroundColor);
    expect(statusColours).not.toContain(flat(icon.props.style).color);
    expect(flat(title().props.style).color).toBe(lightColors.text);
    expect(check.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByTestId('setup-continue')).toBeOnTheScreen();
    // a short scale-in (reduce motion off)
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, duration: SUCCESS_ANIMATION_MS }),
    );
  });

  it('reduce motion: the check mark is simply there, no scale-in', async () => {
    const reduce = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
    reduce.mockResolvedValue(true);
    afterThisTest(() => reduce.mockResolvedValue(false));
    const timing = jest.spyOn(Animated, 'timing');
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await screen.findByText(en.setup.success.title, {}, { timeout: 3000 });
    expect(timing).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ duration: SUCCESS_ANIMATION_MS }),
    );
    const check = screen.getByTestId('setup-success-check', { includeHiddenElements: true });
    expect(flat(check.props.style).transform).toEqual([{ scale: expect.anything() }]);
  });

  it('a failed save goes back to Create PIN with a plain message (nothing stored)', async () => {
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await waitFor(() => expect(message()).toHaveTextContent(en.setup.saveFailed), {
      timeout: 3000,
    });
    expect(en.setup.saveFailed).toBe('Something went wrong. Please create your PIN again.');
    expect(message()?.props.accessibilityRole).toBe('alert');
    expect(screen.queryByText(/keystore/)).toBeNull(); // no technical detail
    expect(screen.queryByText(en.setup.success.title)).toBeNull();
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(screen.getByTestId('pin-pad')).toBeOnTheScreen();
    expect(secureStore.has(PIN_VERIFIER_KEY)).toBe(false);
    // and a new PIN can be created
    await typePin(NEW_PIN, u);
    expect(title()).toHaveTextContent(en.setup.confirm.title);
    await typePin(NEW_PIN, u);
    expect(
      await screen.findByText(en.setup.success.title, {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
    expect(await verifyPin(NEW_PIN)).toBe(true);
  });

  it('the biometric hook: a further step after "PIN set" is opened instead of the tabs', async () => {
    jest
      .spyOn(setupFlow, 'stepAfterPinCreated')
      .mockResolvedValue({ kind: 'route', href: '/no-such-screen' });
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

  it('Android back cannot interrupt a save; a failed save is back at create', async () => {
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
    (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    const u = user();
    await openSetup();
    await u.press(screen.getByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await screen.findByTestId('setup-saving');
    expect(await pressBack()).toBe(true); // swallowed: still saving
    expect(screen.getByTestId('setup-saving')).toBeOnTheScreen();
    await waitFor(() => expect(message()).toHaveTextContent(en.setup.saveFailed), {
      timeout: 3000,
    });
    expect(title()).toHaveTextContent(en.setup.create.title);
    expect(await pressBack()).toBe(true);
    expect(title()).toHaveTextContent(en.setup.intro.title);
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
