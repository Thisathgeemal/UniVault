/**
 * Preferences (AsyncStorage, non-secret preferences only): the language choice is saved, survives
 * a simulated restart, and is applied BEFORE the first frame (no flash of English); the
 * appearance and onboarding flags load and save with safe fallbacks; storage failures fall back
 * quietly; nothing but the listed preference keys is ever written, each only with its allowed
 * values.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { chooseLanguage, i18n, restoreLanguage } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { restoreAppState } from '../src/lib/app-state';
import {
  clearSetupProgress,
  loadAppearancePreference,
  loadLanguagePreference,
  loadOnboardingProgress,
  parsePrivacyAcknowledgement,
  PREFERENCE_KEYS,
  saveAppearancePreference,
  saveLanguagePreference,
  saveOnboardingCompleted,
  SETUP_PROGRESS_KEYS,
} from '../src/lib/preferences';
import { ROUTES } from '../src/navigation/routes';
import * as SecureStore from 'expo-secure-store';
import { freshInstall } from './setup-state';

const APP_DIR = join(__dirname, '..', 'app');

/**
 * The official mock's functions are jest.fn()s with an in-memory implementation. Never spyOn +
 * restore them (restoring a jest.fn removes that implementation, leaving a dead store for the
 * tests after it): use one-shot implementations (mock…Once), and read calls from `.mock`
 * (clearMocks gives every test fresh call lists).
 */
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const multiSet = AsyncStorage.multiSet as jest.Mock;
const multiRemove = AsyncStorage.multiRemove as jest.Mock;
const ACK = { at: '2026-11-28T09:30:00.000Z', version: 'privacy-v1' };

describe('language preference storage', () => {
  it('saves and loads the language under univault.language', async () => {
    expect(await loadLanguagePreference()).toBeNull();
    expect(await saveLanguagePreference('si')).toBe(true);
    expect(await AsyncStorage.getItem('univault.language')).toBe('si');
    expect(await loadLanguagePreference()).toBe('si');
  });

  it('ignores an unknown stored value', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'fr');
    expect(await loadLanguagePreference()).toBeNull();
  });

  it('a failing storage read or write never throws', async () => {
    getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await loadLanguagePreference()).toBeNull();
    setItem.mockRejectedValueOnce(new Error('disk'));
    expect(await saveLanguagePreference('si')).toBe(false);
  });

  it('restoreLanguage: saved choice first, else the device language', async () => {
    expect(await restoreLanguage()).toBe('en'); // nothing saved, test device is English
    await saveLanguagePreference('si');
    expect(await restoreLanguage()).toBe('si');
    expect(i18n.language).toBe('si');
  });

  it('restoreLanguage falls back to a Sinhala phone when nothing is saved', async () => {
    const mocked = getLocales as jest.Mock;
    const original = mocked.getMockImplementation();
    mocked.mockReturnValue([{ languageCode: 'si' }]);
    try {
      expect(await restoreLanguage()).toBe('si');
    } finally {
      if (original) mocked.mockImplementation(original);
      else mocked.mockReset();
    }
  });
});

describe('appearance and onboarding preferences', () => {
  it('appearance: "system" by default; saved values come back; unknown or failing → "system"', async () => {
    expect(await loadAppearancePreference()).toBe('system');
    expect(await saveAppearancePreference('dark')).toBe(true);
    expect(await AsyncStorage.getItem('univault.appearance')).toBe('dark');
    expect(await loadAppearancePreference()).toBe('dark');
    await AsyncStorage.setItem(PREFERENCE_KEYS.appearance, 'sepia');
    expect(await loadAppearancePreference()).toBe('system');
    getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await loadAppearancePreference()).toBe('system');
    setItem.mockRejectedValueOnce(new Error('disk'));
    expect(await saveAppearancePreference('light')).toBe(false);
  });

  it('onboarding: the completed flag and the acknowledgement are saved in one write', async () => {
    await freshInstall();
    expect(await loadOnboardingProgress()).toEqual({
      onboardingCompleted: false,
      privacyAcknowledgement: null,
    });
    expect(await saveOnboardingCompleted(ACK)).toBe(true);
    expect(multiSet).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem('univault.onboardingCompleted')).toBe('true');
    const stored = await AsyncStorage.getItem('univault.privacyAcknowledgedAt');
    expect(JSON.parse(stored ?? 'null')).toEqual(ACK);
    expect(await loadOnboardingProgress()).toEqual({
      onboardingCompleted: true,
      privacyAcknowledgement: ACK,
    });
  });

  it('a malformed acknowledgement counts as none', () => {
    expect(parsePrivacyAcknowledgement(JSON.stringify(ACK))).toEqual(ACK);
    expect(parsePrivacyAcknowledgement(null)).toBeNull();
    expect(parsePrivacyAcknowledgement('2026-11-28T09:30:00Z')).toBeNull(); // not JSON
    expect(parsePrivacyAcknowledgement('null')).toBeNull();
    expect(parsePrivacyAcknowledgement('"text"')).toBeNull();
    for (const bad of [
      { ...ACK, at: 'yesterday' },
      { ...ACK, at: '2026-13-45T99:99:99Z' },
      { ...ACK, at: 5 },
      { ...ACK, version: 'v1' },
      { ...ACK, version: 1 },
      { at: ACK.at },
    ]) {
      expect(parsePrivacyAcknowledgement(JSON.stringify(bad))).toBeNull();
    }
  });

  it('reset removes only the onboarding keys; language and appearance stay', async () => {
    await saveOnboardingCompleted(ACK);
    await saveLanguagePreference('si');
    await saveAppearancePreference('dark');
    expect(await clearSetupProgress()).toBe(true);
    expect(multiRemove).toHaveBeenCalledWith([...SETUP_PROGRESS_KEYS]);
    expect(await loadOnboardingProgress()).toEqual({
      onboardingCompleted: false,
      privacyAcknowledgement: null,
    });
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.language)).toBe('si');
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.appearance)).toBe('dark');
  });

  it('storage failures never throw: reads count as "not done", writes report false', async () => {
    getItem.mockRejectedValueOnce(new Error('disk'));
    expect(await loadOnboardingProgress()).toEqual({
      onboardingCompleted: false,
      privacyAcknowledgement: null,
    });
    multiSet.mockRejectedValueOnce(new Error('disk'));
    expect(await saveOnboardingCompleted(ACK)).toBe(false);
    multiRemove.mockRejectedValueOnce(new Error('disk'));
    expect(await clearSetupProgress()).toBe(false);
  });

  it('restoreAppState reads everything together and never rejects', async () => {
    // four AsyncStorage reads (language, appearance, the two onboarding keys) and the PIN verifier
    for (let i = 0; i < 4; i++) getItem.mockRejectedValueOnce(new Error('disk'));
    (SecureStore.getItemAsync as jest.Mock).mockRejectedValueOnce(new Error('keystore'));
    expect(await restoreAppState()).toEqual({
      language: 'en',
      appearance: 'system',
      setup: {
        onboardingCompleted: false,
        privacyAcknowledgement: null,
        securitySetupComplete: false,
      },
    });
  });
});

/** Every preference key, with the only values it may ever hold. */
const ALLOWED_VALUES: Record<string, (value: string) => boolean> = {
  'univault.language': (v) => ['en', 'si'].includes(v),
  'univault.appearance': (v) => ['system', 'light', 'dark'].includes(v),
  'univault.onboardingCompleted': (v) => v === 'true',
  'univault.privacyAcknowledgedAt': (v) => parsePrivacyAcknowledgement(v) !== null,
};

describe('storage rule: preferences only', () => {
  it('only listed preference keys are ever written, each only with its allowed values', async () => {
    await chooseLanguage('si');
    await chooseLanguage('en');
    for (const value of ['dark', 'light', 'system'] as const) await saveAppearancePreference(value);
    await saveOnboardingCompleted({ at: new Date().toISOString(), version: 'privacy-v1' });

    const writes: [string, string][] = [
      ...(setItem.mock.calls as [string, string][]),
      ...(multiSet.mock.calls as [[string, string][]][]).flatMap(([pairs]) => pairs),
    ];
    // (the official mock's setItem goes through multiSet, so a write can appear in both lists)
    expect(new Set(writes.map(([key]) => key)).size).toBe(4);
    for (const [key, value] of writes) {
      expect([key, ALLOWED_VALUES[key]?.(value) ?? 'not a preference key']).toEqual([key, true]);
    }
    expect(Object.values(PREFERENCE_KEYS).sort()).toEqual(Object.keys(ALLOWED_VALUES).sort());
  });
});

describe('Language screen', () => {
  it('switches the app to Sinhala, saves it and confirms with a toast', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.language });
    await screen.findByTestId('language-screen');
    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();

    await user.press(screen.getByTestId('language-si'));

    expect(await screen.findByText(si.settings.languageSaved)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: si.language.si })).toBeChecked();
    expect(screen.getByText(si.settings.languageHint)).toBeOnTheScreen();
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.language)).toBe('si');
  });

  it('says so when the choice could not be saved (still applied this session)', async () => {
    setItem.mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.language });
    await user.press(await screen.findByTestId('language-si'));
    expect(await screen.findByText(si.settings.languageNotSaved)).toBeOnTheScreen();
    expect(i18n.language).toBe('si');
  });

  it('choosing the current language does nothing', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.language });
    await user.press(await screen.findByTestId('language-en'));
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('simulated restart', () => {
  it('opens in the saved language, and the first frame is already Sinhala', async () => {
    // Session 1: the holder chose Sinhala (what the Language screen calls)
    await chooseLanguage('si');
    // Restart: a fresh process starts in the device language (English) …
    await i18n.changeLanguage('en');

    // … and reading the preference is slow: hold it to look at the frames before it resolves
    // (the mock's getItem is itself a jest.fn, so read the saved value before overriding it)
    const saved = await AsyncStorage.getItem(PREFERENCE_KEYS.language);
    expect(saved).toBe('si');
    const pending: (() => void)[] = [];
    getItem.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          pending.push(() => resolve(saved));
        }),
    );
    const release = () => pending.splice(0).forEach((resolve) => resolve());

    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    // splash still up: nothing rendered, so no English frame can flash
    expect(screen.queryByTestId('credentials-screen')).toBeNull();
    expect(screen.queryByText(en.tabs.credentials)).toBeNull();

    await act(async () => release());
    await waitFor(() => expect(screen.getByTestId('credentials-screen')).toBeOnTheScreen());
    expect(screen.getByTestId('tab-credentials').props.accessibilityLabel).toBe(
      si.tabs.credentials,
    );
    expect(screen.getByRole('header', { name: si.credentials.title })).toBeOnTheScreen();
    expect(screen.queryByText(en.credentials.title)).toBeNull();
  });
});
