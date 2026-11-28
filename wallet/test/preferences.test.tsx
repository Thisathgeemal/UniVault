/**
 * Preferences (AsyncStorage, UI preferences only): the language choice is saved, survives a
 * simulated restart, and is applied BEFORE the first frame (no flash of English); storage
 * failures fall back quietly; nothing but the listed preference keys is ever written.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { chooseLanguage, i18n, restoreLanguage } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import {
  loadLanguagePreference,
  PREFERENCE_KEYS,
  saveLanguagePreference,
} from '../src/lib/preferences';
import { ROUTES } from '../src/navigation/routes';

const APP_DIR = join(__dirname, '..', 'app');

/**
 * The official mock's functions are jest.fn()s with an in-memory implementation. Never spyOn +
 * restore them (restoring a jest.fn removes that implementation, leaving a dead store for the
 * tests after it): use one-shot implementations (mock…Once), and read calls from `.mock`
 * (clearMocks gives every test fresh call lists).
 */
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

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

describe('storage rule: preferences only', () => {
  it('only listed preference keys are ever written, and only "en" / "si" as values', async () => {
    await chooseLanguage('si');
    await chooseLanguage('en');
    const allowed = new Set<string>(Object.values(PREFERENCE_KEYS));
    expect(setItem.mock.calls.length).toBe(2);
    for (const [key, value] of setItem.mock.calls) {
      expect(allowed.has(key)).toBe(true);
      expect(['en', 'si']).toContain(value);
    }
    expect(Object.values(PREFERENCE_KEYS)).toEqual(['univault.language']);
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
