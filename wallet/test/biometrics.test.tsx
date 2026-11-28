/**
 * Biometric unlock with PIN fallback (Decision 026): capability mapping; the OS-enforced secret
 * (stored with requireAuthentication, this device only; unlock = the OS releasing it; a bare
 * authenticateAsync() boolean is never accepted); invalidation; authenticate() (biometric once,
 * then the PIN prompt; one "Use fingerprint" retry; PIN-only); attempt limits (schedule, restart
 * persistence, reset, countdown announcements); Settings → Security; the setup step; secrecy.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { renderRouter } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { join } from 'node:path';
import { useState } from 'react';
import { AccessibilityInfo, Platform, Pressable, Text } from 'react-native';
import * as appInfo from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import {
  useAuthenticate,
  type AuthenticateOptions,
  type AuthResult,
} from '../src/security/authenticate';
import {
  BIOMETRIC_ENABLED_KEY,
  biometricKindOf,
  classifyBiometricError,
  detectBiometrics,
  disableBiometricUnlock,
  enableBiometricUnlock,
  isBiometricEnabled,
  UNLOCK_SECRET_KEY,
  unlockSecretOptions,
  unavailableMessageKey,
  unlockWithBiometrics,
} from '../src/security/biometrics';
import { PIN_ATTEMPTS_KEY, PIN_VERIFIER_KEY, SECURE_STORE_OPTIONS } from '../src/security/pin';
import {
  checkPinWithLimits,
  currentPinLock,
  LOCKOUT_SCHEDULE_MS,
  lockoutAfter,
} from '../src/security/pin-attempts';
import { renderWithProviders } from './render';
import { osPrompt, secureStore, seedOnboardedWithoutSecurity, TEST_PIN } from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');
const LA = LocalAuthentication as jest.Mocked<typeof LocalAuthentication>;
const { AuthenticationType, SecurityLevel } = LocalAuthentication;
const setItem = SecureStore.setItemAsync as jest.Mock;
const getItem = SecureStore.getItemAsync as jest.Mock;
const WRONG = '582048';

/** The phone's biometrics, as expo-local-authentication reports them. */
function phone(
  kind: 'strong' | 'weak' | 'not-enrolled' | 'none',
  types: LocalAuthentication.AuthenticationType[] = [AuthenticationType.FINGERPRINT],
) {
  LA.hasHardwareAsync.mockResolvedValue(kind !== 'none');
  LA.isEnrolledAsync.mockResolvedValue(kind === 'strong' || kind === 'weak');
  LA.supportedAuthenticationTypesAsync.mockResolvedValue(types);
  LA.getEnrolledLevelAsync.mockResolvedValue(
    kind === 'strong'
      ? SecurityLevel.BIOMETRIC_STRONG
      : kind === 'weak'
        ? SecurityLevel.BIOMETRIC_WEAK
        : SecurityLevel.SECRET,
  );
}

const onPlatform = (os: 'ios' | 'android') => jest.replaceProperty(Platform, 'OS', os);

/** A button that runs authenticate() and shows the result as JSON. */
function AuthHarness({ options }: { options: AuthenticateOptions }) {
  const authenticate = useAuthenticate();
  const [result, setResult] = useState<AuthResult | null>(null);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        testID="go"
        onPress={() => void authenticate(options).then(setResult)}
      >
        <Text>Go</Text>
      </Pressable>
      {result ? <Text testID="result">{JSON.stringify(result)}</Text> : null}
    </>
  );
}

const result = () => JSON.parse(String(screen.getByTestId('result').props.children)) as AuthResult;

async function typePin(pin: string, u = userEvent.setup()) {
  for (const d of pin) await u.press(screen.getByTestId(`pin-pad-key-${d}`));
}

async function turnOn() {
  phone('strong');
  expect(await enableBiometricUnlock('Turn on')).toEqual({ ok: true });
  osPrompt.set('success');
}

afterEach(() => {
  jest.restoreAllMocks();
  phone('none');
});

describe('capability detection', () => {
  it.each([
    ['none', [AuthenticationType.FINGERPRINT], 'no-hardware'],
    ['not-enrolled', [AuthenticationType.FINGERPRINT], 'not-enrolled'],
    ['weak', [AuthenticationType.FACIAL_RECOGNITION], 'available-weak-only'],
    ['strong', [AuthenticationType.FINGERPRINT], 'available-strong'],
  ] as const)('%s → %s', async (kind, types, expected) => {
    phone(kind, [...types]);
    expect((await detectBiometrics()).kind).toBe(expected);
  });

  it('strong biometrics the secure store cannot bind a key to count as weak only', async () => {
    phone('strong');
    (SecureStore.canUseBiometricAuthentication as jest.Mock).mockReturnValueOnce(false);
    expect((await detectBiometrics()).kind).toBe('available-weak-only');
  });

  it('iOS in Expo Go: unsupported (Face ID needs the full app); Android in Expo Go works', async () => {
    phone('strong', [AuthenticationType.FACIAL_RECOGNITION]);
    jest.spyOn(appInfo, 'isExpoGo').mockReturnValue(true);
    onPlatform('ios');
    expect(await detectBiometrics()).toEqual({
      kind: 'unsupported-in-expo-go',
      biometric: 'face',
      fingerprintEnrolled: false,
    });
    onPlatform('android');
    expect((await detectBiometrics()).kind).toBe('available-strong');
  });

  it('fingerprintEnrolled: a fingerprint at the strong level only', async () => {
    phone('strong');
    expect((await detectBiometrics()).fingerprintEnrolled).toBe(true);
    phone('strong', [AuthenticationType.FACIAL_RECOGNITION]);
    expect((await detectBiometrics()).fingerprintEnrolled).toBe(false);
    phone('weak', [AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION]);
    expect((await detectBiometrics()).fingerprintEnrolled).toBe(false);
  });

  it('weak-only face unlock: the camera message, "fingerprint or PIN" only with a strong fingerprint', () => {
    expect(unavailableMessageKey('available-weak-only', 'face', false)).toBe(
      'biometrics.weakFace.pin',
    );
    expect(unavailableMessageKey('available-weak-only', 'fingerprintOrFace', true)).toBe(
      'biometrics.weakFace.fingerprint',
    );
    // a weak fingerprint (no face) keeps the general weak message; other kinds their own
    expect(unavailableMessageKey('available-weak-only', 'fingerprint', false)).toBe(
      'biometrics.unavailable.available-weak-only',
    );
    expect(unavailableMessageKey('no-hardware', 'face', false)).toBe(
      'biometrics.unavailable.no-hardware',
    );
    expect(en.biometrics.weakFace).toEqual({
      pin: 'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your PIN.',
      fingerprint:
        'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your fingerprint or your PIN.',
    });
  });

  it('a failing native module counts as no hardware', async () => {
    LA.hasHardwareAsync.mockRejectedValueOnce(new Error('no module'));
    expect((await detectBiometrics()).kind).toBe('no-hardware');
  });

  it('names the biometric in plain words', () => {
    expect(biometricKindOf([AuthenticationType.FINGERPRINT])).toBe('fingerprint');
    expect(biometricKindOf([AuthenticationType.FACIAL_RECOGNITION])).toBe('face');
    expect(biometricKindOf([AuthenticationType.IRIS])).toBe('face');
    expect(
      biometricKindOf([AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION]),
    ).toBe('fingerprintOrFace');
    expect(en.biometrics.kind).toEqual({
      fingerprint: 'fingerprint',
      face: 'face recognition',
      fingerprintOrFace: 'fingerprint or face',
    });
  });
});

describe('the OS-enforced unlock secret', () => {
  it('enable stores 32 random bytes with requireAuthentication, this device only, a prompt', async () => {
    phone('strong');
    expect(await enableBiometricUnlock('Turn on unlock')).toEqual({ ok: true });
    const call = setItem.mock.calls.find(([key]) => key === UNLOCK_SECRET_KEY)!;
    expect(call[1]).toMatch(/^[0-9a-f]{64}$/);
    expect(call[2]).toEqual({
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      requireAuthentication: true,
      authenticationPrompt: 'Turn on unlock',
    });
    expect(unlockSecretOptions('x').requireAuthentication).toBe(true);
    // the flag is a separate, non-authenticated item
    expect(setItem).toHaveBeenCalledWith(BIOMETRIC_ENABLED_KEY, 'true', SECURE_STORE_OPTIONS);
    expect(await isBiometricEnabled()).toBe(true);
    expect(osPrompt.shown).toEqual(['Turn on unlock']); // iOS: read back once (the prompt)
  });

  it('on Android the prompt appears while storing (no second read)', async () => {
    onPlatform('android');
    phone('strong');
    expect(await enableBiometricUnlock('Turn on')).toEqual({ ok: true });
    expect(osPrompt.shown).toEqual(['Turn on']);
  });

  it('a fresh secret each time; refused unless available-strong', async () => {
    phone('strong');
    await enableBiometricUnlock('a');
    const first = secureStore.get(UNLOCK_SECRET_KEY);
    await enableBiometricUnlock('b');
    expect(secureStore.get(UNLOCK_SECRET_KEY)).not.toBe(first);
    phone('weak');
    await disableBiometricUnlock();
    expect(await enableBiometricUnlock('c')).toEqual({ ok: false, reason: 'unavailable' });
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
  });

  it.each([
    ['cancel', 'cancelled'],
    ['lockout', 'locked-out'],
    ['error', 'failed'],
    ['unsupported', 'unavailable'],
  ] as const)('a %s at enable leaves it off with nothing stored', async (outcome, reason) => {
    phone('strong');
    osPrompt.set(outcome);
    expect(await enableBiometricUnlock('x')).toEqual({ ok: false, reason });
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
    expect(await isBiometricEnabled()).toBe(false);
  });

  it('Android: a prompt failure while storing also leaves nothing', async () => {
    onPlatform('android');
    phone('strong');
    osPrompt.set('cancel');
    expect(await enableBiometricUnlock('x')).toEqual({ ok: false, reason: 'cancelled' });
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
  });

  it('unlock succeeds only when the OS releases the secret', async () => {
    await turnOn();
    expect(await unlockWithBiometrics('Unlock')).toEqual({ ok: true });
    for (const [outcome, reason] of [
      ['cancel', 'cancelled'],
      ['lockout', 'locked-out'],
      ['error', 'failed'],
    ] as const) {
      osPrompt.set(outcome);
      expect(await unlockWithBiometrics('Unlock')).toEqual({ ok: false, reason });
    }
  });

  it('biometrics changed (the OS invalidated the key): turned off, the secret deleted', async () => {
    await turnOn();
    osPrompt.set('invalidated');
    expect(await unlockWithBiometrics('Unlock')).toEqual({ ok: false, reason: 'invalidated' });
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
    expect(await isBiometricEnabled()).toBe(false);
  });

  it('a released value that is not our secret is not accepted', async () => {
    await turnOn();
    secureStore.set(UNLOCK_SECRET_KEY, 'true');
    expect((await unlockWithBiometrics('Unlock')).ok).toBe(false);
  });

  it('classifies the platforms’ error texts', () => {
    expect(classifyBiometricError(new Error('User canceled the operation.'))).toBe('cancelled');
    expect(classifyBiometricError('Lockout permanent')).toBe('locked-out');
    expect(classifyBiometricError(new Error('Hardware unavailable'))).toBe('failed');
    expect(classifyBiometricError(new Error('No hardware available'))).toBe('unavailable');
  });

  it('a failing flag read counts as off; disable never throws', async () => {
    getItem.mockRejectedValueOnce(new Error('keystore'));
    expect(await isBiometricEnabled()).toBe(false);
    (SecureStore.deleteItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    setItem.mockRejectedValueOnce(new Error('keystore'));
    await expect(disableBiometricUnlock()).resolves.toBeUndefined();
  });
});

describe('attempt limits', () => {
  it('schedule: 4 free, then 30 s, 1 min, 5 min, 15 min, 1 h for each further wrong PIN', () => {
    expect([1, 2, 3, 4].map(lockoutAfter)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8, 9, 10, 20].map(lockoutAfter)).toEqual([
      30_000, 60_000, 300_000, 900_000, 3_600_000, 3_600_000, 3_600_000,
    ]);
    expect(LOCKOUT_SCHEDULE_MS).toEqual([30_000, 60_000, 300_000, 900_000, 3_600_000]);
  });

  it('5 wrong PINs lock for 30 s; while locked nothing is checked; then 1 min; a correct PIN resets', async () => {
    let now = Date.parse('2026-11-28T10:00:00Z');
    const clock = () => now;
    for (let i = 1; i <= 4; i++) {
      expect(await checkPinWithLimits(WRONG, clock)).toEqual({
        ok: false,
        lockedUntil: null,
        failedAttempts: i,
      });
    }
    expect(await checkPinWithLimits(WRONG, clock)).toEqual({
      ok: false,
      lockedUntil: now + 30_000,
      failedAttempts: 5,
    });
    // locked: even the right PIN is refused without being checked
    expect((await checkPinWithLimits(TEST_PIN, clock)).ok).toBe(false);
    // the lock is in the secure store: it survives a restart
    expect(JSON.parse(secureStore.get(PIN_ATTEMPTS_KEY)!)).toEqual({
      failedAttempts: 5,
      lockedUntil: new Date(now + 30_000).toISOString(),
    });
    expect(await currentPinLock(now)).toBe(now + 30_000);
    now += 30_001;
    expect(await currentPinLock(now)).toBeNull();
    expect(await checkPinWithLimits(WRONG, clock)).toMatchObject({ lockedUntil: now + 60_000 });
    now += 60_001;
    expect(await checkPinWithLimits(TEST_PIN, clock)).toEqual({ ok: true });
    expect(secureStore.has(PIN_ATTEMPTS_KEY)).toBe(false);
  });
});

describe('authenticate()', () => {
  it('no PIN set: no-pin, no prompt', async () => {
    await seedOnboardedWithoutSecurity();
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Test' }} />);
    await u.press(screen.getByTestId('go'));
    await waitFor(() => expect(result()).toEqual({ ok: false, reason: 'no-pin' }));
  });

  it('biometric on: ONE OS prompt releasing the secret → biometric; no boolean check', async () => {
    await turnOn();
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    await waitFor(() => expect(result()).toEqual({ ok: true, method: 'biometric' }));
    expect(osPrompt.shown.at(-1)).toBe('Share');
    expect(LA.authenticateAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('pin-prompt')).toBeNull();
  });

  it('a boolean "success" is never enough: the secret is not released → the PIN prompt', async () => {
    await turnOn();
    LA.authenticateAsync.mockResolvedValue({ success: true });
    osPrompt.set('error');
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    expect(await screen.findByTestId('pin-prompt')).toBeOnTheScreen();
    expect(screen.queryByTestId('result')).toBeNull();
  });

  it.each(['cancel', 'lockout', 'error'] as const)(
    'biometric %s → the PIN screen (no automatic repeat); the right PIN → pin',
    async (outcome) => {
      await turnOn();
      osPrompt.set(outcome);
      const u = userEvent.setup();
      await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
      await u.press(screen.getByTestId('go'));
      await screen.findByTestId('pin-prompt');
      expect(osPrompt.shown.filter((p) => p === 'Share')).toHaveLength(1);
      expect(screen.getByTestId('pin-prompt-reason')).toHaveTextContent('Share');
      await typePin(TEST_PIN, u);
      await waitFor(() => expect(result()).toEqual({ ok: true, method: 'pin' }), { timeout: 3000 });
      expect(screen.queryByTestId('pin-prompt')).toBeNull();
    },
  );

  it('"Use fingerprint" on the PIN screen retries ONCE', async () => {
    await turnOn();
    osPrompt.set('cancel');
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    const retry = await screen.findByRole('button', { name: 'Use fingerprint' });
    await u.press(retry); // still cancelled: the button goes, the PIN stays
    expect(screen.queryByTestId('pin-prompt-biometric')).toBeNull();
    expect(osPrompt.shown).toHaveLength(3); // enable read-back, first try, the one retry
  });

  it('"Use fingerprint" succeeding finishes with biometric', async () => {
    await turnOn();
    osPrompt.set('cancel');
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    await screen.findByTestId('pin-prompt-biometric');
    osPrompt.set('success');
    await u.press(screen.getByTestId('pin-prompt-biometric'));
    await waitFor(() => expect(result()).toEqual({ ok: true, method: 'biometric' }));
  });

  it('biometrics changed: turned off, the PIN prompt says what happened', async () => {
    await turnOn();
    osPrompt.set('invalidated');
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    expect(await screen.findByTestId('pin-prompt-notice')).toHaveTextContent(
      'Your fingerprint settings changed. Unlock with your PIN, then turn fingerprint unlock on again in Settings.',
    );
    expect(screen.queryByTestId('pin-prompt-biometric')).toBeNull();
    expect(await isBiometricEnabled()).toBe(false);
  });

  it('all strong biometrics removed from the phone: also turned off with the notice', async () => {
    await turnOn();
    phone('not-enrolled');
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    expect(await screen.findByTestId('pin-prompt-notice')).toBeOnTheScreen();
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
  });

  it('pinOnly never shows the biometric prompt; Cancel → cancelled', async () => {
    await turnOn();
    const prompts = osPrompt.shown.length;
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Turn off', pinOnly: true }} />);
    await u.press(screen.getByTestId('go'));
    await screen.findByTestId('pin-prompt');
    expect(osPrompt.shown).toHaveLength(prompts);
    expect(screen.queryByTestId('pin-prompt-biometric')).toBeNull();
    await u.press(screen.getByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(result()).toEqual({ ok: false, reason: 'cancelled' }));
  });

  it('a wrong PIN says so; the 5th locks with a live countdown; Cancel then → locked-out', async () => {
    const u = userEvent.setup();
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    await screen.findByTestId('pin-prompt');
    for (let i = 1; i <= 4; i++) {
      await typePin(WRONG, u);
      await screen.findByTestId('pin-prompt-wrong', {}, { timeout: 3000 });
      // wait until this check is over before typing the next PIN (the keypad is disabled meanwhile)
      await waitFor(() => expect(screen.queryByTestId('pin-prompt-check-checking')).toBeNull(), {
        timeout: 3000,
      });
    }
    await typePin(WRONG, u);
    // 30 s at the moment of locking (a second may already have passed when it is drawn)
    expect(await screen.findByTestId('pin-prompt-locked', {}, { timeout: 3000 })).toHaveTextContent(
      /^Too many attempts\. Try again in (30|29) seconds\.$/,
    );
    expect(screen.queryByTestId('pin-pad')).toBeNull();
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(
      expect.stringMatching(/^Too many attempts\. Try again in (30|29) seconds\.$/),
    );
    await u.press(screen.getByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(result()).toEqual({ ok: false, reason: 'locked-out' }));
  });
});

describe('lockout countdown (fake clock)', () => {
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-11-28T10:00:00Z') }));
  afterEach(() => jest.useRealTimers());

  it('a lock from before a restart applies at once; announced at most every 10 s; ends by itself', async () => {
    secureStore.set(
      PIN_ATTEMPTS_KEY,
      JSON.stringify({
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 25_000).toISOString(),
      }),
    );
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    const locked = await screen.findByTestId('pin-prompt-locked');
    expect(locked).toHaveTextContent('Too many attempts. Try again in 25 seconds.');
    const announce = AccessibilityInfo.announceForAccessibility as jest.Mock;
    const announced = () => announce.mock.calls.filter(([m]) => /Too many/.test(String(m))).length;
    expect(announced()).toBe(1);
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId('pin-prompt-locked')).toHaveTextContent(/in 20 seconds/);
    expect(announced()).toBe(1); // the text changed every second, the screen reader did not
    await act(async () => {
      jest.advanceTimersByTime(5_000);
    });
    expect(announced()).toBe(2);
    await act(async () => {
      jest.advanceTimersByTime(16_000);
    });
    expect(screen.queryByTestId('pin-prompt-locked')).toBeNull();
    expect(screen.getByTestId('pin-pad')).toBeOnTheScreen();
  });

  it('hours for the 1-hour lock; Sinhala wording', async () => {
    await AsyncStorage.setItem('univault.language', 'si');
    const { i18n } = jest.requireActual<typeof import('../src/i18n')>('../src/i18n');
    await i18n.changeLanguage('si');
    secureStore.set(
      PIN_ATTEMPTS_KEY,
      JSON.stringify({
        failedAttempts: 9,
        lockedUntil: new Date(Date.now() + 3_600_000).toISOString(),
      }),
    );
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    expect(await screen.findByTestId('pin-prompt-locked')).toHaveTextContent(
      'වැරදි උත්සාහ වැඩියි. පැය 1 කින් නැවත උත්සාහ කරන්න.',
    );
    await act(async () => {
      jest.advanceTimersByTime(61_000);
    });
    expect(screen.getByTestId('pin-prompt-locked')).toHaveTextContent(
      'වැරදි උත්සාහ වැඩියි. මිනිත්තු 59 කින් නැවත උත්සාහ කරන්න.',
    );
    await act(async () => {
      jest.advanceTimersByTime(3_600_000 - 61_000 - 20_000);
    });
    expect(screen.getByTestId('pin-prompt-locked')).toHaveTextContent(
      'වැරදි උත්සාහ වැඩියි. තත්පර 20 කින් නැවත උත්සාහ කරන්න.',
    );
  });

  it('minutes for longer locks', async () => {
    secureStore.set(
      PIN_ATTEMPTS_KEY,
      JSON.stringify({
        failedAttempts: 7,
        lockedUntil: new Date(Date.now() + 300_000).toISOString(),
      }),
    );
    const u = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await renderWithProviders(<AuthHarness options={{ reason: 'Share' }} />);
    await u.press(screen.getByTestId('go'));
    expect(await screen.findByTestId('pin-prompt-locked')).toHaveTextContent(
      'Too many attempts. Try again in 5 minutes.',
    );
  });
});

describe('Settings → Security', () => {
  const theSwitch = () => screen.getByTestId('biometric-switch');
  /** A tap on the switch (it is controlled: the value changes only once the screen accepts). */
  const toggle = async (on: boolean) => {
    expect(theSwitch().props.accessibilityState.checked).toBe(!on);
    await userEvent.setup().press(theSwitch());
  };
  async function openSecurity() {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
    return screen.findByTestId('security-screen');
  }

  it('without strong biometrics: the status says why and the switch is disabled', async () => {
    await openSecurity();
    expect(await screen.findByTestId('biometric-status')).toHaveTextContent(
      en.biometrics.unavailable['no-hardware'],
    );
    expect(screen.getByRole('switch', { name: 'Unlock with fingerprint' })).toBeOnTheScreen();
    expect(screen.getByTestId('biometric-switch')).toBeDisabled();
    expect(screen.getByTestId('change-pin').props.accessibilityLabel).toBe(
      'Change PIN, Coming soon',
    );
  });

  it('switch ON enrols the secret (OS prompt); OFF needs the PIN and deletes it', async () => {
    phone('strong');
    const u = userEvent.setup();
    await openSecurity();
    expect(
      await screen.findByText('This phone supports unlock with fingerprint.'),
    ).toBeOnTheScreen();
    await toggle(true);
    expect(await screen.findByText('Unlock with fingerprint is on')).toBeOnTheScreen();
    expect(theSwitch().props.accessibilityState.checked).toBe(true);
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(true);

    await toggle(false);
    await screen.findByTestId('pin-prompt');
    expect(screen.queryByTestId('pin-prompt-biometric')).toBeNull(); // PIN only
    await typePin(TEST_PIN, u);
    // queued behind the "is on" toast (4 s)
    expect(
      await screen.findByText('Unlock with fingerprint is off', {}, { timeout: 6000 }),
    ).toBeOnTheScreen();
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(false);
    expect(theSwitch().props.accessibilityState.checked).toBe(false);
  });

  it('a failed enrolment leaves it off and says so; a cancelled PIN keeps it on', async () => {
    phone('strong');
    osPrompt.set('cancel');
    const u = userEvent.setup();
    await openSecurity();
    await screen.findByTestId('biometric-status');
    await toggle(true);
    expect(
      await screen.findByText('Unlock with fingerprint is still off. Try again.'),
    ).toBeOnTheScreen();
    osPrompt.set('success');
    await toggle(true);
    await waitFor(() => expect(theSwitch().props.accessibilityState.checked).toBe(true));
    await toggle(false);
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(theSwitch().props.accessibilityState.checked).toBe(true));
    expect(secureStore.has(UNLOCK_SECRET_KEY)).toBe(true);
  });

  it('Test unlock: PIN when biometrics are off; the result says how; cancel says so', async () => {
    const u = userEvent.setup();
    await openSecurity();
    await u.press(screen.getByTestId('test-unlock'));
    await screen.findByTestId('pin-prompt');
    expect(screen.getByTestId('pin-prompt-reason')).toHaveTextContent('Test unlock');
    await typePin(TEST_PIN, u);
    expect(await screen.findByTestId('test-unlock-result')).toHaveTextContent(
      'Unlocked with your PIN.',
    );
    await u.press(screen.getByTestId('test-unlock'));
    await u.press(await screen.findByTestId('pin-prompt-cancel'));
    expect(await screen.findByText('Not unlocked: you cancelled.')).toBeOnTheScreen();
  });

  it('Test unlock with fingerprint on: "Unlocked with fingerprint."', async () => {
    await turnOn();
    const u = userEvent.setup();
    await openSecurity();
    await u.press(await screen.findByTestId('test-unlock'));
    expect(await screen.findByTestId('test-unlock-result')).toHaveTextContent(
      'Unlocked with fingerprint.',
    );
  });
});

describe('setup: the biometric step after "PIN set"', () => {
  const NEW_PIN = '903618';
  async function setPin() {
    await seedOnboardedWithoutSecurity();
    const u = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await u.press(await screen.findByTestId('setup-start'));
    await typePin(NEW_PIN, u);
    await typePin(NEW_PIN, u);
    await screen.findByText(en.setup.success.title, {}, { timeout: 3000 });
    return u;
  }

  it('strong biometrics: "Use fingerprint to unlock?" → Turn on → the OS prompt → the tabs', async () => {
    phone('strong');
    const u = await setPin();
    expect(screen.queryByTestId('setup-biometric-unavailable')).toBeNull();
    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByText('Use fingerprint to unlock?')).toBeOnTheScreen();
    expect(
      screen.getByText('Your fingerprint stays on this phone. UniVault never sees it.'),
    ).toBeOnTheScreen();
    expect(screen).toHavePathname(ROUTES.setupBiometrics);
    const actions = screen.getByTestId('setup-biometrics-actions');
    expect(
      within(within(actions).getByTestId('biometric-shared-notice')).getByText(
        'Anyone whose fingerprint is saved on this phone will be able to unlock UniVault. Only turn this on if every fingerprint on this phone is yours.',
      ),
    ).toBeOnTheScreen();
    // both buttons full width in the same column: Not now is as visible as Turn on
    const buttons = within(actions).getByTestId('setup-biometrics-actions-buttons');
    expect(
      within(buttons)
        .getAllByRole('button')
        .map((b) => b.props.accessibilityLabel),
    ).toEqual(['Turn on', 'Not now']);
    await u.press(screen.getByRole('button', { name: 'Turn on' }));
    expect(
      await screen.findByTestId('credentials-screen', {}, { timeout: 3000 }),
    ).toBeOnTheScreen();
    expect(await isBiometricEnabled()).toBe(true);
  });

  it('cancelled at the OS prompt: stays off with a message; Not now → the tabs', async () => {
    phone('strong', [AuthenticationType.FACIAL_RECOGNITION]);
    const u = await setPin();
    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByText('Use face recognition to unlock?')).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('biometric-shared-notice')).getByText(
        'Anyone whose face is saved on this phone will be able to unlock UniVault. Only turn this on if every face saved on this phone is yours.',
      ),
    ).toBeOnTheScreen();
    osPrompt.set('cancel');
    await u.press(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByTestId('setup-biometrics-failed')).toHaveTextContent(
      'Unlock with face recognition is off. You can turn it on later in Settings.',
    );
    await u.press(screen.getByRole('button', { name: 'Not now' }));
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(await isBiometricEnabled()).toBe(false);
  });

  it.each([
    ['none', false, en.biometrics.unavailable['no-hardware']],
    [
      'weak',
      false,
      'This phone’s fingerprint unlock isn’t secure enough for UniVault. Use your PIN.',
    ],
    ['strong', true, 'Unlock with fingerprint needs the full UniVault app, not Expo Go.'],
  ] as const)(
    'not available-strong (%s): skipped, one line on "PIN set"',
    async (kind, expoGoIos, line) => {
      phone(kind);
      if (expoGoIos) jest.spyOn(appInfo, 'isExpoGo').mockReturnValue(true);
      const u = await setPin();
      expect(screen.getByTestId('setup-biometric-unavailable')).toHaveTextContent(line);
      await u.press(screen.getByTestId('setup-continue'));
      expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    },
  );
});

describe('the shared-biometrics notice', () => {
  it('setup step in Sinhala', async () => {
    phone('strong');
    await seedOnboardedWithoutSecurity();
    await AsyncStorage.setItem('univault.language', 'si');
    const u = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await u.press(await screen.findByTestId('setup-start'));
    await typePin('903618', u);
    await typePin('903618', u);
    await u.press(await screen.findByTestId('setup-continue', {}, { timeout: 3000 }));
    expect(
      within(await screen.findByTestId('biometric-shared-notice')).getByText(
        'මෙම දුරකථනයේ ඇඟිලි සලකුණ සුරකින ලද ඕනෑම කෙනෙකුට UniVault අගුළු හැරිය හැක. මෙම දුරකථනයේ ඇති සියලු ඇඟිලි සලකුණු ඔබේ නම් පමණක් මෙය සක්‍රිය කරන්න.',
      ),
    ).toBeOnTheScreen();
  });

  it.each([
    [
      'en',
      'Anyone whose fingerprint is saved on this phone will be able to unlock UniVault. Only turn this on if every fingerprint on this phone is yours.',
      'You can always use your PIN only.',
    ],
    [
      'si',
      'මෙම දුරකථනයේ ඇඟිලි සලකුණ සුරකින ලද ඕනෑම කෙනෙකුට UniVault අගුළු හැරිය හැක. මෙම දුරකථනයේ ඇති සියලු ඇඟිලි සලකුණු ඔබේ නම් පමණක් මෙය සක්‍රිය කරන්න.',
      'ඔබට සැමවිටම PIN අංකය පමණක් භාවිත කළ හැක.',
    ],
  ] as const)(
    'Settings → Security (%s): the notice and "PIN only" under the switch',
    async (lang, notice, pinOnly) => {
      phone('strong');
      await AsyncStorage.setItem('univault.language', lang);
      await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
      expect(
        within(await screen.findByTestId('biometric-shared-notice')).getByText(notice),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('biometric-pin-only')).toHaveTextContent(pinOnly);
    },
  );

  it('not shown when the phone cannot use biometric unlock', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
    await screen.findByTestId('biometric-status');
    expect(screen.queryByTestId('biometric-shared-notice')).toBeNull();
  });
});

describe('weak (camera) face unlock', () => {
  it.each([
    [
      'en',
      'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your PIN.',
    ],
    [
      'si',
      'මෙම දුරකථනයේ මුහුණ මඟින් අගුළු හැරීම කැමරාව භාවිත කරන අතර UniVault සඳහා ප්‍රමාණවත් තරම් ආරක්ෂිත නැත. ඔබට ඔබේ PIN අංකය භාවිත කළ හැක.',
    ],
  ] as const)('Settings → Security (%s) explains it and offers the PIN', async (lang, text) => {
    phone('weak', [AuthenticationType.FACIAL_RECOGNITION]);
    await AsyncStorage.setItem('univault.language', lang);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
    expect(await screen.findByTestId('biometric-status')).toHaveTextContent(text);
    expect(screen.getByTestId('biometric-switch')).toBeDisabled();
  });

  it('"PIN set" shows the same line and setup skips the biometric step', async () => {
    phone('weak', [AuthenticationType.FACIAL_RECOGNITION]);
    await seedOnboardedWithoutSecurity();
    const u = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    await u.press(await screen.findByTestId('setup-start'));
    await typePin('903618', u);
    await typePin('903618', u);
    expect(
      await screen.findByTestId('setup-biometric-unavailable', {}, { timeout: 3000 }),
    ).toHaveTextContent(
      'This phone’s face unlock uses the camera and isn’t secure enough for UniVault. You can use your PIN.',
    );
    await u.press(screen.getByTestId('setup-continue'));
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
  });
});

describe('nothing secret leaks', () => {
  it('the unlock secret and the PIN never reach logs, results, AsyncStorage or route state', async () => {
    const logged: string[] = [];
    for (const level of ['log', 'info', 'debug'] as const) {
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
    await turnOn();
    const secret = secureStore.get(UNLOCK_SECRET_KEY)!;
    const results = [await unlockWithBiometrics('x'), await enableBiometricUnlock('y')];
    const u = userEvent.setup();
    const app = await renderRouter(APP_DIR, { initialUrl: ROUTES.security });
    await u.press(await screen.findByTestId('test-unlock'));
    const shown = await screen.findByTestId('test-unlock-result');
    const routes = JSON.stringify([app.getPathnameWithParams(), app.getRouterState() ?? null]);
    const asyncValues = JSON.stringify(
      await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()),
    );
    const newSecret = secureStore.get(UNLOCK_SECRET_KEY)!;
    for (const value of [secret, newSecret, TEST_PIN]) {
      for (const [where, hay] of Object.entries({
        logged: JSON.stringify(logged),
        results: JSON.stringify(results),
        routes,
        asyncValues,
        screen: JSON.stringify(shown.props.children),
      })) {
        expect([where, hay.includes(value)]).toEqual([where, false]);
      }
    }
    // the secret lives only under its own authenticated key
    const holders = [...secureStore.entries()].filter(([, v]) => v === newSecret).map(([k]) => k);
    expect(holders).toEqual([UNLOCK_SECRET_KEY]);
    expect(secureStore.get(PIN_VERIFIER_KEY)).not.toContain(newSecret);
    expect(within(screen.getByTestId('security-screen')).queryByText(newSecret)).toBeNull();
  });
});
