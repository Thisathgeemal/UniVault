/**
 * App lock (src/security/app-lock.tsx) on the REAL app/ tree: starts locked after setup only;
 * unlock only through authenticate(); the background / inactive rule and the delay (incl. the
 * clock going backwards); our own prompts never re-lock; the privacy cover; one automatic prompt,
 * no loops; Unlock and Use PIN; the PIN lockout countdown; content hidden and untouchable; Android
 * back; deep links; onLock; Lock now; the delay preference; a long absence during one of our
 * prompts (locked, prompt dismissed, no attempt counted); whole-wallet screen-capture blocking.
 * renderRouter runs on Jest's fake timers: time moves with jest.setSystemTime / advanceTimersByTime.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { useEffect, useState } from 'react';
import {
  AppState,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  type AppStateStatus,
} from 'react-native';
import * as appInfo from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { restoreAppState } from '../src/lib/app-state';
import { PREFERENCE_KEYS } from '../src/lib/preferences';
import { ROUTES } from '../src/navigation/routes';
import * as SecureStore from 'expo-secure-store';
import * as ScreenCapture from 'expo-screen-capture';
import {
  AUTH_EXEMPTION_MAX_MS,
  authExemptionMs,
  shouldLockOnReturn,
  useLock,
  type LockReason,
} from '../src/security/app-lock';
import { beginAuthActivity, isAuthActive } from '../src/security/auth-activity';
import { enableBiometricUnlock, UNLOCK_SECRET_KEY } from '../src/security/biometrics';
import { APP_SCREEN_CAPTURE_KEY } from '../src/security/screen-capture';
import { PIN_ATTEMPTS_KEY } from '../src/security/pin';
import { lightColors } from '../src/theme';
import { renderWithProviders } from './render';
import {
  freshInstall,
  osPrompt,
  secureStore,
  seedOnboardedWithoutSecurity,
  TEST_PIN,
} from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

const startLocked = () => jest.spyOn(appInfo, 'lockOnAppStart').mockReturnValue(true);

/** Sends an AppState change to every listener the app registered. */
async function appState(next: AppStateStatus) {
  const listeners = (AppState.addEventListener as jest.Mock).mock.calls
    .filter(([event]) => event === 'change')
    .map(([, listener]) => listener as (s: AppStateStatus) => void);
  await act(async () => {
    for (const listener of listeners) listener(next);
  });
}

/** Moves the (fake) clock without running timers: time spent away from the app. */
const away = (ms: number) => jest.setSystemTime(Date.now() + ms);

async function typePin(pin: string, u = userEvent.setup()) {
  for (const d of pin) await u.press(screen.getByTestId(`pin-pad-key-${d}`));
}

async function enterPinAndUnlock(u = userEvent.setup()) {
  await screen.findByTestId('pin-prompt');
  await typePin(TEST_PIN, u);
  await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull(), { timeout: 3000 });
}

async function openApp(url: string) {
  return renderRouter(APP_DIR, { initialUrl: url });
}

function phoneWithFingerprint() {
  LA.hasHardwareAsync.mockResolvedValue(true);
  LA.isEnrolledAsync.mockResolvedValue(true);
  LA.supportedAuthenticationTypesAsync.mockResolvedValue([
    LocalAuthentication.AuthenticationType.FINGERPRINT,
  ]);
  LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
}

afterEach(() => {
  jest.restoreAllMocks();
  LA.hasHardwareAsync.mockResolvedValue(false);
});

describe('the return rule', () => {
  it('locks when away ≥ the delay, when the clock went backwards, or the time is unknown', () => {
    expect(shouldLockOnReturn(1000, 1000, 0)).toBe(true); // Immediately
    expect(shouldLockOnReturn(0, 10_000, 30_000)).toBe(false);
    expect(shouldLockOnReturn(0, 31_000, 30_000)).toBe(true);
    expect(shouldLockOnReturn(0, 30_000, 30_000)).toBe(true);
    expect(shouldLockOnReturn(50_000, 10_000, 300_000)).toBe(true); // clock backwards
    expect(shouldLockOnReturn(null, 10_000, 300_000)).toBe(true);
    expect(shouldLockOnReturn(Number.NaN, 10_000, 300_000)).toBe(true);
  });

  it('our prompts are exempt for min(delay, 30 s); for Immediately the 30 s cap', () => {
    expect(AUTH_EXEMPTION_MAX_MS).toBe(30_000);
    expect(authExemptionMs(0)).toBe(30_000);
    expect(authExemptionMs(10_000)).toBe(10_000);
    expect(authExemptionMs(30_000)).toBe(30_000);
    expect(authExemptionMs(60_000)).toBe(30_000);
    expect(authExemptionMs(300_000)).toBe(30_000);
  });
});

describe('app start', () => {
  it('starts locked once setup is complete, with ONE automatic prompt; content hidden behind', async () => {
    startLocked();
    await openApp(ROUTES.credentials);
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: en.lock.title })).toBeOnTheScreen();
    expect(screen.getByText(en.lock.subtitle)).toBeOnTheScreen();
    expect(await screen.findByTestId('pin-prompt')).toBeOnTheScreen(); // the automatic prompt
    // the navigator is mounted but hidden from screen readers and touches
    expect(screen.queryByTestId('credentials-screen')).toBeNull();
    expect(screen.getByTestId('credentials-screen', { includeHiddenElements: true })).toBeTruthy();
    const content = screen.getByTestId('lock-content', { includeHiddenElements: true });
    expect(content.props.pointerEvents).toBe('none');
    expect(content.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(content.props.accessibilityElementsHidden).toBe(true);
  });

  it('never during onboarding or security setup', async () => {
    startLocked();
    await freshInstall();
    await openApp(ROUTES.home);
    await screen.findByTestId('onboarding-language');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('never on /setup/security', async () => {
    startLocked();
    await seedOnboardedWithoutSecurity();
    await openApp(ROUTES.setupSecurity);
    await screen.findByTestId('setup-security-screen');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('cancel leaves it locked with no second prompt; Unlock tries again; the right PIN unlocks', async () => {
    startLocked();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('pin-prompt')).toBeNull());
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.queryByTestId('pin-prompt')).toBeNull(); // no loop
    expect(screen.getByTestId('lock-screen')).toBeOnTheScreen();
    expect(screen.queryByTestId('lock-use-pin')).toBeNull(); // biometrics off: Unlock = PIN
    await u.press(screen.getByTestId('lock-unlock'));
    await enterPinAndUnlock(u);
    expect(screen.getByTestId('credentials-screen')).toBeOnTheScreen();
  });

  it('a wrong PIN keeps it locked', async () => {
    startLocked();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await screen.findByTestId('pin-prompt');
    await typePin('582048', u);
    expect(await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 })).toBeOnTheScreen();
    expect(screen.getByTestId('lock-screen')).toBeOnTheScreen();
  });

  it('a deep link while locked: the lock screen on top, the requested route after unlock', async () => {
    startLocked();
    const app = await openApp(ROUTES.about);
    await screen.findByTestId('lock-screen');
    expect(screen.queryByTestId('about-screen')).toBeNull();
    await enterPinAndUnlock();
    expect(screen.getByTestId('about-screen')).toBeOnTheScreen();
    expect(app.getPathname()).toBe(ROUTES.about);
  });

  it('Android back on the lock screen leaves the app, never reveals content', async () => {
    const listeners: Parameters<typeof BackHandler.addEventListener>[1][] = [];
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'hardwareBackPress') listeners.push(listener);
      return { remove: () => listeners.splice(listeners.indexOf(listener), 1) && undefined };
    });
    const exitApp = jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
    startLocked();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    let handled = false;
    await act(async () => {
      handled = [...listeners].reverse().some((l) => l({} as never) === true);
    });
    expect(handled).toBe(true);
    expect(exitApp).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('lock-screen')).toBeOnTheScreen();
  });

  it('the PIN lockout countdown shows on the lock screen', async () => {
    startLocked();
    secureStore.set(
      PIN_ATTEMPTS_KEY,
      JSON.stringify({
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 600_000).toISOString(),
      }),
    );
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    expect(await screen.findByTestId('lock-screen-countdown')).toHaveTextContent(
      /^Too many attempts\. Try again in \d+ minutes\.$/,
    );
    expect(flat(screen.getByTestId('lock-screen-countdown').props.style).color).toBe(
      lightColors.onBrand,
    );
  });
});

describe('leaving the app', () => {
  async function unlockedApp(url: string = ROUTES.credentials) {
    await openApp(url); // test/setup.ts starts unlocked
    await screen.findByTestId('credentials-screen');
  }

  it('Immediately (default): background → active locks, with one automatic prompt', async () => {
    await unlockedApp();
    await appState('inactive');
    await appState('background');
    await appState('active');
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    expect(await screen.findByTestId('pin-prompt')).toBeOnTheScreen();
    await enterPinAndUnlock();
  });

  it("'inactive' alone (notification shade, a call) never locks", async () => {
    await unlockedApp();
    await appState('inactive');
    await appState('active');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it('30 s delay: back after 10 s → not locked; after 31 s → locked', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.lockDelay, '30s');
    await unlockedApp();
    await appState('background');
    away(10_000);
    await appState('active');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
    await appState('background');
    away(31_000);
    await appState('active');
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
  });

  it('the clock moved backwards: locked even with a 5 min delay', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.lockDelay, '5m');
    await unlockedApp();
    await appState('background');
    away(-60_000);
    await appState('active');
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
  });

  it('the privacy cover appears on inactive and background, and goes on active', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.lockDelay, '5m');
    await unlockedApp();
    await appState('inactive');
    expect(screen.getByTestId('privacy-cover')).toBeOnTheScreen();
    expect(screen.getByTestId('privacy-cover').props.accessibilityLabel).toBe('UniVault');
    await appState('background');
    expect(screen.getByTestId('privacy-cover')).toBeOnTheScreen();
    await appState('active');
    expect(screen.queryByTestId('privacy-cover')).toBeNull();
    expect(screen.queryByTestId('lock-screen')).toBeNull(); // within the delay
  });

  it('our own authentication (its OS sheet) never re-locks or covers', async () => {
    await openApp(ROUTES.security);
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await u.press(await screen.findByTestId('test-unlock'));
    await screen.findByTestId('pin-prompt'); // an authentication of ours is running
    await appState('inactive');
    await appState('background');
    expect(screen.queryByTestId('privacy-cover')).toBeNull();
    await appState('active');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
    await typePin(TEST_PIN, u);
    expect(
      await screen.findByTestId('test-unlock-result', {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
  });

  it('with fingerprint on: the auto prompt is the fingerprint; cancel → Use PIN unlocks', async () => {
    phoneWithFingerprint();
    await enableBiometricUnlock('Turn on');
    await unlockedApp();
    osPrompt.set('cancel');
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await appState('background');
    await appState('active');
    // the fingerprint was cancelled → authenticate() shows the PIN prompt; cancel that too
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('pin-prompt')).toBeNull());
    // Use PIN: a text button in on-brand, straight on the navy screen
    const usePin = screen.getByTestId('lock-use-pin');
    expect(flat(usePin.props.style).backgroundColor).toBe('transparent');
    expect(flat(within(usePin).getByText(en.lock.usePin).props.style).color).toBe(
      lightColors.onBrand,
    );
    // keyboard / switch-access focus: the ring in focus-ring-on-brand, outside the edge
    await act(async () => {
      usePin.props.onFocus?.();
    });
    expect(flat(screen.getByTestId('lock-use-pin').props.style)).toMatchObject({
      outlineColor: lightColors.focusRingOnBrand,
      outlineWidth: 2,
      outlineOffset: 2,
    });
    await act(async () => {
      screen.getByTestId('lock-use-pin').props.onBlur?.();
    });
    expect(flat(screen.getByTestId('lock-use-pin').props.style).outlineColor).toBeUndefined();
    await u.press(screen.getByTestId('lock-use-pin'));
    await screen.findByTestId('pin-prompt');
    expect(screen.queryByTestId('pin-prompt-biometric')).toBeNull(); // PIN only
    await enterPinAndUnlock(u);
  });

  it('with fingerprint on: a released secret unlocks straight away', async () => {
    phoneWithFingerprint();
    await enableBiometricUnlock('Turn on');
    await unlockedApp();
    await appState('background');
    await appState('active');
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull(), { timeout: 3000 });
    expect(screen.queryByTestId('pin-prompt')).toBeNull();
  });
});

describe('away while one of our prompts is open', () => {
  async function testUnlockPromptOpen(u: ReturnType<typeof userEvent.setup>) {
    await openApp(ROUTES.security);
    await u.press(await screen.findByTestId('test-unlock'));
    expect(await screen.findByTestId('pin-prompt-reason')).toHaveTextContent(
      en.security.testReason,
    );
  }

  it('back within the window (5 s): still unlocked, the prompt still works', async () => {
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await testUnlockPromptOpen(u);
    await appState('background');
    away(5_000);
    await appState('active');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
    await typePin(TEST_PIN, u);
    expect(
      await screen.findByTestId('test-unlock-result', {}, { timeout: 3000 }),
    ).toHaveTextContent(en.security.testOkPin);
  });

  it('away 2 min (even with a 5 min delay): locked, the prompt dismissed, no failed attempt', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.lockDelay, '5m');
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await testUnlockPromptOpen(u);
    await typePin('58', u); // half a PIN in the prompt: never checked, never counted
    await appState('background');
    away(120_000);
    await appState('active');
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    // the Test unlock prompt resolved as cancelled; the lock screen's own prompt replaces it
    expect(
      await screen.findByText(en.security.testFailed.cancelled, { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(await screen.findByTestId('pin-prompt-reason')).toHaveTextContent(en.lock.reason);
    expect(secureStore.has(PIN_ATTEMPTS_KEY)).toBe(false);
    await enterPinAndUnlock(u);
  });

  it('a cancel while still away, after the window: the lock screen, never the wallet', async () => {
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await testUnlockPromptOpen(u);
    await appState('background');
    away(120_000);
    await u.press(screen.getByTestId('pin-prompt-cancel')); // resolves before 'active'
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    await appState('active'); // already locked: no second lock, one automatic prompt
    expect(await screen.findAllByTestId('pin-prompt')).toHaveLength(1);
    expect(secureStore.has(PIN_ATTEMPTS_KEY)).toBe(false);
  });

  it('a cancel while still away, within the window: no lock', async () => {
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await testUnlockPromptOpen(u);
    await appState('background');
    away(5_000);
    await u.press(screen.getByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('pin-prompt')).toBeNull());
    await appState('active');
    expect(screen.queryByTestId('lock-screen')).toBeNull();
  });

  it("the lock screen's own prompt is left alone (already locked)", async () => {
    startLocked();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await screen.findByTestId('pin-prompt');
    await typePin(TEST_PIN.slice(0, 2), u);
    await appState('background');
    away(120_000);
    await appState('active');
    // the same prompt, the digits typed so far still there
    expect(screen.getByTestId('pin-prompt-reason')).toHaveTextContent(en.lock.reason);
    expect(
      screen.getAllByTestId('pin-pad-dot-filled', { includeHiddenElements: true }),
    ).toHaveLength(2);
    await typePin(TEST_PIN.slice(2), u);
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull(), { timeout: 3000 });
  });

  it('a fingerprint that succeeds after the dismissal does not count', async () => {
    phoneWithFingerprint();
    await enableBiometricUnlock('Turn on');
    const getItem = SecureStore.getItemAsync as jest.Mock;
    const real = getItem.getMockImplementation() as (key: string, o?: unknown) => Promise<string>;
    let release: () => void = () => undefined;
    getItem.mockImplementation(async (key: string, options?: unknown) => {
      if (key !== UNLOCK_SECRET_KEY) return real(key, options);
      getItem.mockImplementation(real); // only the Test unlock sheet is held open
      osPrompt.set('cancel'); // the lock screen's fingerprint is cancelled → its PIN prompt
      return new Promise<string>((resolve) => {
        release = () => void real(key).then(resolve);
      });
    });
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.security);
    await u.press(await screen.findByTestId('test-unlock'));
    await waitFor(() => expect(isAuthActive()).toBe(true));
    await appState('background');
    away(120_000);
    await appState('active');
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    osPrompt.set('success');
    await act(async () => release()); // the OS sheet releases the secret, too late
    expect(
      await screen.findByText(en.security.testFailed.cancelled, { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(screen.getByTestId('lock-screen')).toBeOnTheScreen();
  });
});

describe('screen capture of the whole wallet', () => {
  const prevent = () => ScreenCapture.preventScreenCaptureAsync as jest.Mock;
  const allow = () => ScreenCapture.allowScreenCaptureAsync as jest.Mock;

  it('release builds: blocked for the whole app, on every screen', async () => {
    jest.spyOn(appInfo, 'screenCaptureBlockingEnabled').mockReturnValue(true);
    await openApp(ROUTES.credentials);
    await screen.findByTestId('credentials-screen');
    await waitFor(() => expect(prevent()).toHaveBeenCalledWith(APP_SCREEN_CAPTURE_KEY));
  });

  it('development builds: allowed by default; the Diagnostics switch turns it on and off', async () => {
    await openApp(ROUTES.diagnostics);
    const toggle = await screen.findByTestId('capture-block-switch');
    expect(prevent()).not.toHaveBeenCalledWith(APP_SCREEN_CAPTURE_KEY);
    expect(toggle).toHaveProp('accessibilityState', expect.objectContaining({ checked: false }));
    expect(screen.getByText(en.diagnostics.captureSwitch)).toBeOnTheScreen();
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await u.press(toggle);
    await waitFor(() => expect(prevent()).toHaveBeenCalledWith(APP_SCREEN_CAPTURE_KEY));
    expect(screen.getByTestId('capture-block-switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: true }),
    );
    await u.press(screen.getByTestId('capture-block-switch'));
    await waitFor(() => expect(allow()).toHaveBeenCalledWith(APP_SCREEN_CAPTURE_KEY));
  });

  it('the switch is never saved: a new test (app start) begins with it off', async () => {
    await openApp(ROUTES.diagnostics);
    expect(await screen.findByTestId('capture-block-switch')).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ checked: false }),
    );
    expect(await AsyncStorage.getAllKeys()).not.toContainEqual(expect.stringMatching(/capture/i));
  });
});

describe('Settings → Security', () => {
  it('Lock now locks at once, without an automatic prompt; Diagnostics says why', async () => {
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.security);
    await u.press(await screen.findByTestId('lock-now'));
    expect(await screen.findByTestId('lock-screen')).toBeOnTheScreen();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('pin-prompt')).toBeNull();
    await u.press(screen.getByTestId('lock-unlock'));
    await enterPinAndUnlock(u);
    await u.press(screen.getByTestId('stack-header-back'));
    await u.press(await screen.findByTestId('diagnostics-link'));
    expect(await screen.findByTestId('diag-last-lock')).toHaveTextContent('Lock now');
  });

  it('"Lock after leaving the app": a choice screen, the value shown, saved and restored', async () => {
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.security);
    const row = await screen.findByTestId('settings-lock-delay');
    expect(row.props.accessibilityLabel).toBe('Lock after leaving the app, Immediately');
    await u.press(row);
    await screen.findByTestId('lock-delay-screen');
    expect(screen.getAllByRole('radio').map((r) => r.props.accessibilityLabel)).toEqual([
      'Immediately',
      '30 seconds',
      '1 minute',
      '5 minutes',
    ]);
    await u.press(screen.getByTestId('lock-delay-1m'));
    expect(await screen.findByText(en.lockDelay.saved)).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.lockDelay)).toBe('1m');
    await u.press(screen.getByTestId('lock-delay-1m')); // the same again: nothing
    await u.press(screen.getByTestId('stack-header-back'));
    expect(screen.getByTestId('settings-lock-delay').props.accessibilityLabel).toBe(
      'Lock after leaving the app, 1 minute',
    );
    expect((await restoreAppState()).lockDelay).toBe('1m'); // a restart reads it back
  });

  it('a failed save says so', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.lockDelay);
    await u.press(await screen.findByTestId('lock-delay-5m'));
    expect(await screen.findByText(en.lockDelay.notSaved)).toBeOnTheScreen();
  });
});

describe('edges', () => {
  it('the lock-screen countdown ticks and ends by itself', async () => {
    startLocked();
    secureStore.set(
      PIN_ATTEMPTS_KEY,
      JSON.stringify({
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 20_000).toISOString(),
      }),
    );
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await openApp(ROUTES.credentials);
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    expect(await screen.findByTestId('lock-screen-countdown')).toHaveTextContent(/seconds/);
    await act(async () => {
      jest.advanceTimersByTime(25_000);
    });
    expect(screen.queryByTestId('lock-screen-countdown')).toBeNull();
  });

  it('useLock() needs a LockProvider; an activity ends once only', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined); // expected
    await expect(renderHook(() => useLock())).rejects.toThrow(/LockProvider/);
    error.mockRestore();
    const end = beginAuthActivity();
    expect(isAuthActive()).toBe(true);
    end();
    end();
    expect(isAuthActive()).toBe(false);
  });
});

describe('onLock', () => {
  function Listener({ seen }: { seen: LockReason[] }) {
    const { onLock, lock, locked } = useLock();
    const [count, setCount] = useState(0);
    useEffect(
      () =>
        onLock((reason) => {
          seen.push(reason);
          setCount((n) => n + 1);
        }),
      [onLock, seen],
    );
    return (
      <Pressable accessibilityRole="button" testID="lock" onPress={() => lock('manual')}>
        <Text>{`${count} ${String(locked)}`}</Text>
      </Pressable>
    );
  }

  it('every lock calls the listeners (for the vault to clear decrypted data)', async () => {
    const seen: LockReason[] = [];
    const u = userEvent.setup();
    await renderWithProviders(<Listener seen={seen} />);
    await u.press(screen.getByTestId('lock'));
    await appState('background');
    await appState('active');
    expect(seen).toEqual(['manual', 'background']);
  });
});
