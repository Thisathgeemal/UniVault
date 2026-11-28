/**
 * The shared PIN checking flow (src/security/PinCheck.tsx) and every PIN entry point that uses it:
 * the full-screen "Checking your PIN…" (keypad gone, nothing else on screen, at least 400 ms,
 * announced), correct → straight on (no success screen), wrong → back to the keypad with the
 * digits cleared, a shake (none with reduce motion) and "That PIN isn't right. Try again." (+ the
 * attempts left at 2 and 1), the limit → straight to the lockout countdown, no Cancel and Back
 * ignored while checking; the lock screen's PIN path, Test unlock and turning biometric unlock off
 * all show this flow; no other code verifies a PIN.
 */
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { renderRouter } from 'expo-router/testing-library';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, Text } from 'react-native';
import * as appInfo from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import { useAuthenticate, type AuthResult } from '../src/security/authenticate';
import { enableBiometricUnlock } from '../src/security/biometrics';
import { PIN_ATTEMPTS_KEY } from '../src/security/pin';
import * as pinAttempts from '../src/security/pin-attempts';
import {
  ATTEMPTS_LEFT_WARNING,
  attemptsBeforeLockout,
  PIN_CHECK_MIN_MS,
  PinCheck,
} from '../src/security/PinCheck';
import { renderWithProviders } from './render';
import { secureStore, TEST_PIN } from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');
const WRONG = '582048';
const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;

async function typePin(pin: string, u = userEvent.setup()) {
  for (const d of pin) await u.press(screen.getByTestId(`pin-pad-key-${d}`));
}

const seedAttempts = (failedAttempts: number, lockedUntil: string | null = null) =>
  secureStore.set(PIN_ATTEMPTS_KEY, JSON.stringify({ failedAttempts, lockedUntil }));

/** authenticate() from a button, its result shown as text (the PinPrompt is the real one). */
function Asker() {
  const authenticate = useAuthenticate();
  const [result, setResult] = useState<AuthResult | null>(null);
  return (
    <>
      <Pressable
        testID="ask"
        onPress={() => void authenticate({ reason: 'Approve the test' }).then(setResult)}
      >
        <Text>ask</Text>
      </Pressable>
      {result ? <Text testID="result">{JSON.stringify(result)}</Text> : null}
    </>
  );
}

async function openPrompt(u = userEvent.setup()) {
  await renderWithProviders(<Asker />);
  await u.press(screen.getByTestId('ask'));
  await screen.findByTestId('pin-prompt');
  return u;
}

/** Holds checkPinWithLimits until `release(result)`. */
function holdCheck() {
  let release: (r: pinAttempts.PinCheckResult) => void = () => undefined;
  jest.spyOn(pinAttempts, 'checkPinWithLimits').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  // the progress state is drawn first (yieldToUi), then the check starts: wait for it
  return async (r: pinAttempts.PinCheckResult) => {
    await waitFor(() => expect(pinAttempts.checkPinWithLimits).toHaveBeenCalled());
    await act(async () => release(r));
  };
}

const reduceMotion = () => AccessibilityInfo.isReduceMotionEnabled as jest.Mock;

afterEach(() => {
  reduceMotion().mockResolvedValue(false);
  jest.restoreAllMocks();
  LA.hasHardwareAsync.mockResolvedValue(false);
});

describe('the rule for "attempts left"', () => {
  it('counts the wrong PINs still possible before the next one locks', () => {
    expect(attemptsBeforeLockout(0)).toBe(5);
    expect(attemptsBeforeLockout(3)).toBe(2);
    expect(attemptsBeforeLockout(4)).toBe(1);
    expect(attemptsBeforeLockout(5)).toBe(0);
    expect(attemptsBeforeLockout(9)).toBe(0);
    expect(ATTEMPTS_LEFT_WARNING).toBe(2);
    expect(PIN_CHECK_MIN_MS).toBe(400);
  });
});

describe('checking (the PIN prompt of authenticate())', () => {
  it('replaces everything with a full-screen "Checking your PIN…": no keypad, no text, no Cancel', async () => {
    const release = holdCheck();
    const u = await openPrompt();
    await typePin(TEST_PIN, u);
    const checking = await screen.findByTestId('pin-prompt-checking');
    expect(checking.props.accessibilityLabel).toBe(en.pin.checking);
    expect(checking.props.accessibilityRole).toBe('progressbar');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(en.pin.checking);
    // the keypad and dots can be neither seen nor used
    expect(screen.queryByTestId('pin-pad')).toBeNull();
    expect(screen.queryByTestId('pin-pad-key-1')).toBeNull();
    expect(screen.queryByTestId('pin-pad-dots')).toBeNull();
    // no status text, title, reason or Cancel while checking: the progress state is alone
    const flow = screen.getByTestId('pin-prompt-flow');
    expect(
      within(flow)
        .getAllByText(/.+/)
        .map((n) => n.props.children),
    ).toEqual([en.pin.checking]);
    expect(screen.queryByTestId('pin-prompt-cancel')).toBeNull();
    expect(screen.queryByTestId('pin-prompt-wrong')).toBeNull();
    await release({ ok: true });
    expect(await screen.findByTestId('result')).toHaveTextContent('{"ok":true,"method":"pin"}');
  });

  it('stays at least 400 ms, even when the check is instant', async () => {
    jest.spyOn(pinAttempts, 'checkPinWithLimits').mockResolvedValue({ ok: true });
    const u = await openPrompt();
    await typePin(TEST_PIN.slice(0, 5), u);
    const start = Date.now();
    await u.press(screen.getByTestId(`pin-pad-key-${TEST_PIN.slice(5)}`));
    await screen.findByTestId('result', {}, { timeout: 3000 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(PIN_CHECK_MIN_MS);
  });

  it('Android back is ignored while checking; afterwards it cancels', async () => {
    const release = holdCheck();
    const u = await openPrompt();
    await typePin(TEST_PIN, u);
    await screen.findByTestId('pin-prompt-checking');
    const modal = screen.getByTestId('pin-prompt-modal');
    await act(async () => modal.props.onRequestClose());
    expect(screen.getByTestId('pin-prompt-checking')).toBeOnTheScreen();
    expect(screen.queryByTestId('result')).toBeNull();
    await release({ ok: false, lockedUntil: null, failedAttempts: 1 });
    await screen.findByTestId('pin-prompt-wrong');
    await act(async () => screen.getByTestId('pin-prompt-modal').props.onRequestClose());
    expect(await screen.findByTestId('result')).toHaveTextContent(
      '{"ok":false,"reason":"cancelled"}',
    );
  });

  it('a correct PIN continues straight away (announced), with no success screen', async () => {
    const u = await openPrompt();
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('result', {}, { timeout: 3000 })).toHaveTextContent(
      '{"ok":true,"method":"pin"}',
    );
    expect(screen.queryByTestId('pin-prompt')).toBeNull();
    expect(screen.queryByText(en.setup.success.title)).toBeNull();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(en.auth.correct);
  });
});

describe('a wrong PIN', () => {
  it('back to the keypad: digits cleared, a shake, the message above the keypad (announced)', async () => {
    const sequence = jest.spyOn(Animated, 'sequence');
    const u = await openPrompt();
    await typePin(WRONG, u);
    const wrong = await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 });
    expect(wrong).toHaveTextContent(en.auth.wrong);
    expect(en.auth.wrong).toBe('That PIN isn’t right. Try again.');
    expect(wrong.props.accessibilityRole).toBe('alert');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(en.auth.wrong);
    // above the keypad, the dots empty again
    const flowText = within(screen.getByTestId('pin-prompt-flow'));
    expect(flowText.getByTestId('pin-pad')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-pad-dots').props.accessibilityLabel).toBe(
      '0 of 6 digits entered',
    );
    expect(screen.queryAllByTestId('pin-pad-dot-filled')).toHaveLength(0);
    expect(sequence).toHaveBeenCalled(); // the shake
    // only one wrong so far: no "attempts left" yet
    expect(wrong).not.toHaveTextContent(/attempt/);
    // and the right PIN still works
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('result', {}, { timeout: 3000 })).toHaveTextContent(
      /"ok":true/,
    );
  });

  it.each([
    [2, '2 attempts left before a short wait.'],
    [3, '1 attempt left before a short wait.'],
  ])('after %i earlier failures: "%s"', async (before, line) => {
    seedAttempts(before);
    const u = await openPrompt();
    await typePin(WRONG, u);
    const wrong = await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 });
    expect(wrong).toHaveTextContent(`${en.auth.wrong} ${line}`);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      `${en.auth.wrong} ${line}`,
    );
  });

  it('with reduce motion: no shake', async () => {
    reduceMotion().mockResolvedValue(true);
    const sequence = jest.spyOn(Animated, 'sequence');
    const u = await openPrompt();
    await act(async () => undefined); // the reduce-motion answer arrives
    await typePin(WRONG, u);
    await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 });
    expect(sequence).not.toHaveBeenCalled();
  });

  it('reaching the limit goes straight from checking to the countdown (no keypad)', async () => {
    seedAttempts(4);
    const u = await openPrompt();
    await typePin(WRONG, u);
    const locked = await screen.findByTestId('pin-prompt-locked', {}, { timeout: 3000 });
    expect(locked).toHaveTextContent(/^Too many attempts\. Try again in 30 seconds\.$/);
    expect(screen.queryByTestId('pin-pad')).toBeNull();
    expect(screen.queryByTestId('pin-prompt-wrong')).toBeNull();
    // Cancel now reports the lock
    await u.press(screen.getByTestId('pin-prompt-cancel'));
    expect(await screen.findByTestId('result')).toHaveTextContent(/"reason":"locked-out"/);
  });

  it('a check that throws counts as wrong (never as correct)', async () => {
    jest.spyOn(pinAttempts, 'checkPinWithLimits').mockRejectedValue(new Error('store'));
    const u = await openPrompt();
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 })).toHaveTextContent(
      en.auth.wrong,
    );
    expect(screen.queryByTestId('result')).toBeNull();
  });
});

describe('the lockout countdown', () => {
  it('a lock from before opens on the countdown, then the keypad comes back by itself', async () => {
    jest.useFakeTimers();
    try {
      seedAttempts(5, new Date(Date.now() + 2_000).toISOString());
      const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      await openPrompt(u);
      expect(await screen.findByTestId('pin-prompt-locked')).toHaveTextContent(
        /Try again in 2 seconds/,
      );
      expect(screen.queryByTestId('pin-pad')).toBeNull();
      await act(async () => {
        jest.advanceTimersByTime(3_000);
      });
      expect(screen.queryByTestId('pin-prompt-locked')).toBeNull();
      expect(screen.getByTestId('pin-pad')).toBeOnTheScreen();
      expect(screen.queryByTestId('pin-prompt-wrong')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('PinCheck on its own', () => {
  it('the default check is the stored verifier under the limits', async () => {
    const onSuccess = jest.fn();
    const onCancel = jest.fn();
    const u = userEvent.setup();
    await renderWithProviders(
      <PinCheck title="Enter your PIN" reason="Why" onSuccess={onSuccess} onCancel={onCancel} />,
    );
    await u.press(screen.getByTestId('pin-check-cancel'));
    expect(onCancel).toHaveBeenCalledWith(false);
    await typePin(TEST_PIN, u);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1), { timeout: 3000 });
    // after success the flow never shows the keypad again (the caller moves on)
    expect(screen.queryByTestId('pin-pad')).toBeNull();
  });
});

describe('every PIN entry point uses the shared flow', () => {
  it('the lock screen PIN path', async () => {
    jest.spyOn(appInfo, 'lockOnAppStart').mockReturnValue(true);
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    await screen.findByTestId('pin-prompt-flow');
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('pin-prompt-checking')).toBeOnTheScreen();
    // straight back to where the holder was: no success screen in between
    await waitFor(() => expect(screen.queryByTestId('lock-screen')).toBeNull(), { timeout: 3000 });
    expect(screen.getByTestId('credentials-screen')).toBeOnTheScreen();
  });

  it('Test unlock and turning biometric unlock off', async () => {
    LA.hasHardwareAsync.mockResolvedValue(true);
    LA.isEnrolledAsync.mockResolvedValue(true);
    LA.supportedAuthenticationTypesAsync.mockResolvedValue([
      LocalAuthentication.AuthenticationType.FINGERPRINT,
    ]);
    LA.getEnrolledLevelAsync.mockResolvedValue(LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG);
    await enableBiometricUnlock('Turn on');
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
    // turning it off asks for the PIN only: the shared flow
    await u.press(await screen.findByTestId('biometric-switch'));
    expect(await screen.findByTestId('pin-prompt-flow')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-prompt-reason')).toHaveTextContent(/Turn off/);
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('pin-prompt-checking')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('pin-prompt')).toBeNull(), { timeout: 3000 });
    // Test unlock (biometrics now off): the same flow
    await u.press(screen.getByTestId('test-unlock'));
    expect(await screen.findByTestId('pin-prompt-flow')).toBeOnTheScreen();
    expect(screen.getByTestId('pin-prompt-reason')).toHaveTextContent(en.security.testReason);
  });

  it('no other code verifies a PIN or draws a keypad for one', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(join(__dirname, '..', 'src'));
    walk(APP_DIR);
    const root = join(__dirname, '..');
    const using = (pattern: RegExp) =>
      files
        .filter((f) => pattern.test(readFileSync(f, 'utf8')))
        .map((f) => relative(root, f).replace(/\\/g, '/'))
        .sort();
    // verifyPin: the verifier module, the limits on top of it; the limits: the shared flow
    expect(using(/\bverifyPin\(/)).toEqual(['src/security/pin-attempts.ts', 'src/security/pin.ts']);
    expect(using(/\bcheckPinWithLimits\b/)).toEqual([
      'src/security/PinCheck.tsx',
      'src/security/pin-attempts.ts',
    ]);
    // the keypad: the shared check flow, and PIN creation (its own "Securing your PIN…" step)
    expect(using(/<PinPad\b/)).toEqual(['app/setup/security.tsx', 'src/security/PinCheck.tsx']);
    expect(using(/<PinCheck\b/)).toEqual(['src/security/authenticate.tsx']);
  });
});
