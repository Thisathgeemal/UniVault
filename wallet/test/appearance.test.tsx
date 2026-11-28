/**
 * Settings → Appearance (theme): "Automatic" (default, stored as `system`), "Light", "Dark".
 * - exactly Automatic / Light / Dark, labels only (no helper text); a saved "system" still
 *   shows as Automatic;
 * - each choice applies at once, app-wide (screens, header, tab bar, dialogs), and is saved;
 * - the saved choice is applied before the first frame after a restart (no flash);
 * - "Automatic" follows a (simulated) live system change; Light and Dark ignore it;
 * - the status bar follows the effective theme, with light content on the navy header;
 * - native UI gets the same scheme (Appearance.setColorScheme).
 * Contrast in both themes: test/contrast.test.ts (unchanged rule, new onboarding pairs).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, screen, userEvent, waitFor, within } from '@testing-library/react-native';
import * as SystemUI from 'expo-system-ui';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { Appearance, StyleSheet } from 'react-native';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { PREFERENCE_KEYS, saveAppearancePreference } from '../src/lib/preferences';
import { ROUTES } from '../src/navigation/routes';
import { statusBarStyleFor } from '../src/navigation/status-bar';
import { applyNativeColorScheme, effectiveScheme, useAppearance } from '../src/theme/appearance';
import { darkColors, lightColors } from '../src/theme';
import * as appInfo from '../src/config/app-info';

/**
 * A phone whose system colour scheme the test can change while the app runs: a tiny external
 * store behind useColorScheme (the real hook subscribes to Appearance the same way).
 */
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import('react')>('react');
  let scheme: 'light' | 'dark' = 'light';
  const listeners = new Set<() => void>();
  const useColorScheme = () =>
    useSyncExternalStore(
      (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => scheme,
    );
  return {
    __esModule: true,
    default: useColorScheme,
    mockSetSystemScheme: (next: 'light' | 'dark') => {
      scheme = next;
      listeners.forEach((listener) => listener());
    },
  };
});

/** Every style the app's one <StatusBar> was rendered with, newest last. */
const mockStatusBarStyles: string[] = [];
jest.mock('expo-status-bar', () => ({
  ...jest.requireActual<object>('expo-status-bar'), // the router uses its other exports
  StatusBar: ({ style }: { style: string }) => {
    mockStatusBarStyles.push(style);
    return null;
  },
}));

/** The phone's root view colour behind the screens (expo-system-ui). */
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(() => Promise.resolve()) }));

const { mockSetSystemScheme } = jest.requireMock<{
  mockSetSystemScheme: (scheme: 'light' | 'dark') => void;
}>('react-native/Libraries/Utilities/useColorScheme');

const APP_DIR = join(__dirname, '..', 'app');
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;
const bgOf = (testID: string) => flat(screen.getByTestId(testID).props.style).backgroundColor;
const statusBar = () => mockStatusBarStyles.at(-1);
const setSystem = async (scheme: 'light' | 'dark') => {
  await act(async () => mockSetSystemScheme(scheme));
};

beforeEach(() => {
  mockSetSystemScheme('light');
  mockStatusBarStyles.length = 0;
});
afterEach(() => jest.restoreAllMocks());

describe('effective scheme', () => {
  it('is the choice, or the phone for "Automatic" (light when unknown)', () => {
    expect(effectiveScheme('light', 'dark')).toBe('light');
    expect(effectiveScheme('dark', 'light')).toBe('dark');
    expect(effectiveScheme('system', 'dark')).toBe('dark');
    expect(effectiveScheme('system', 'light')).toBe('light');
    expect(effectiveScheme('system', null)).toBe('light');
  });

  it('native UI gets the same scheme, and a missing native module never throws', () => {
    const spy = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => undefined);
    applyNativeColorScheme('dark');
    applyNativeColorScheme('system');
    expect(spy.mock.calls).toEqual([['dark'], ['unspecified']]);
    spy.mockImplementation(() => {
      throw new Error('no native module');
    });
    expect(() => applyNativeColorScheme('light')).not.toThrow();
  });
});

describe('outside the app (a component rendered on its own)', () => {
  it('follows the phone and refuses to change the preference', async () => {
    const { result } = await renderHook(() => useAppearance());
    expect(result.current.preference).toBe('system');
    await expect(result.current.setPreference('dark')).rejects.toThrow(/AppearanceProvider/);
  });
});

describe('root view colour', () => {
  const setBackground = SystemUI.setBackgroundColorAsync as jest.Mock;

  it('follows the effective theme; a failing or missing native module is ignored', async () => {
    setBackground.mockRejectedValueOnce(new Error('no module'));
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    expect(setBackground).toHaveBeenLastCalledWith(lightColors.bg);
    setBackground.mockImplementationOnce(() => {
      throw new Error('no module');
    });
    await setSystem('dark');
    expect(setBackground).toHaveBeenLastCalledWith(darkColors.bg);
    expect(bgOf('settings-screen')).toBe(darkColors.bg);
  });
});

describe('Settings → Appearance', () => {
  it('sits below Language and shows the current value ("Automatic" by default)', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    const rows = screen.getAllByRole('button').map((el) => el.props.testID as string | undefined);
    expect(rows.indexOf('settings-appearance')).toBe(rows.indexOf('settings-language') + 1);
    expect(screen.getByTestId('settings-appearance').props.accessibilityLabel).toBe(
      `${en.settings.appearance}, ${en.appearance.system}`,
    );
  });

  it('offers exactly Automatic, Light, Dark, in that order, with no helper text', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
    const root = await screen.findByTestId('appearance-screen');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual(['Automatic', 'Light', 'Dark']);
    for (const radio of radios) {
      // the option's only text is its label: no description line, no hint
      expect(
        within(radio)
          .getAllByText(/./)
          .map((el) => el.props.children),
      ).toEqual([radio.props.accessibilityLabel]);
      expect(radio.props.accessibilityHint).toBeUndefined();
    }
    // on the screen: the one hint above the options, nothing about the phone's mode
    expect(within(root).queryByText(/phone/i)).toBeNull();
    expect(Object.keys(en.appearance)).toEqual(['system', 'light', 'dark']);
  });

  it('a saved "system" value shows as Automatic (row and screen); the stored value is unchanged', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.appearance, 'system');
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    const row = await screen.findByTestId('settings-appearance');
    expect(row.props.accessibilityLabel).toBe(`${en.settings.appearance}, Automatic`);
    await user.press(row);
    expect(await screen.findByRole('radio', { name: 'Automatic' })).toBeChecked();
    expect(await AsyncStorage.getItem(PREFERENCE_KEYS.appearance)).toBe('system');
  });

  it('the Settings row shows the selected label: Light, Dark', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
    await user.press(await screen.findByTestId('appearance-light'));
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen.getByTestId('settings-appearance').props.accessibilityLabel).toBe(
      `${en.settings.appearance}, Light`,
    );
    await user.press(screen.getByTestId('settings-appearance'));
    await user.press(await screen.findByTestId('appearance-dark'));
    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen.getByTestId('settings-appearance').props.accessibilityLabel).toBe(
      `${en.settings.appearance}, Dark`,
    );
  });

  it('in Sinhala: ස්වයංක්‍රීය, ආලෝකමත්, අඳුරු, no helper text', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'si');
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    const row = await screen.findByTestId('settings-appearance');
    expect(row.props.accessibilityLabel).toBe(`${si.settings.appearance}, ස්වයංක්‍රීය`);
    await user.press(row);
    await screen.findByTestId('appearance-screen');
    const radios = screen.getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual(['ස්වයංක්‍රීය', 'ආලෝකමත්', 'අඳුරු']);
    for (const radio of radios) expect(within(radio).getAllByText(/./)).toHaveLength(1);
  });

  it.each([
    // [choice, saved before, system scheme, expected background]
    ['dark', 'system', 'light', darkColors.bg],
    ['light', 'system', 'dark', lightColors.bg],
    ['system', 'dark', 'light', lightColors.bg],
  ] as const)(
    'choosing "%s" applies at once, is saved and confirmed',
    async (choice, before, system, expectedBg) => {
      const native = jest.spyOn(Appearance, 'setColorScheme');
      await saveAppearancePreference(before);
      mockSetSystemScheme(system);
      const user = userEvent.setup();
      await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
      await screen.findByTestId('appearance-screen');
      expect(screen.getByRole('radio', { name: en.appearance[before] })).toBeChecked();

      await user.press(screen.getByTestId(`appearance-${choice}`));

      expect(await screen.findByText(en.settings.appearanceSaved)).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: en.appearance[choice] })).toBeChecked();
      expect(bgOf('appearance-screen')).toBe(expectedBg);
      expect(await AsyncStorage.getItem(PREFERENCE_KEYS.appearance)).toBe(choice);
      expect(native).toHaveBeenLastCalledWith(choice === 'system' ? 'unspecified' : choice);
    },
  );

  it('changes the whole app: header, tab bar, other screens, dialogs and the Settings value', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
    await screen.findByTestId('appearance-screen');
    await user.press(screen.getByTestId('appearance-dark'));
    await screen.findByText(en.settings.appearanceSaved);

    // the navy header (dark brand) on every screen inside a tab
    expect(screen.getAllByTestId('stack-header').at(-1)).toHaveStyle({
      backgroundColor: darkColors.brand,
    });
    const inactiveTab = screen
      .getAllByText(en.tabs.history)
      .find((el) => flat(el.props.style)?.color);
    expect(flat(inactiveTab?.props.style).color).toBe(darkColors.textMuted);

    await user.press(screen.getByTestId('stack-header-back'));
    expect(screen.getByTestId('settings-appearance').props.accessibilityLabel).toBe(
      `${en.settings.appearance}, ${en.appearance.dark}`,
    );
    expect(bgOf('settings-screen')).toBe(darkColors.bg);

    await user.press(screen.getByTestId('diagnostics-link'));
    await user.press(await screen.findByTestId('reset-onboarding-button'));
    expect(await screen.findByTestId('reset-onboarding-dialog')).toHaveStyle({
      backgroundColor: darkColors.surface,
    });
    await user.press(screen.getByTestId('reset-onboarding-dialog-cancel'));

    await user.press(screen.getByTestId('tab-credentials'));
    expect(await screen.findByTestId('credentials-screen')).toHaveStyle({
      backgroundColor: darkColors.bg,
    });
  });

  it('says so when the choice could not be saved (still applied this session)', async () => {
    setItem.mockRejectedValueOnce(new Error('disk full'));
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
    await user.press(await screen.findByTestId('appearance-dark'));
    expect(await screen.findByText(en.settings.appearanceNotSaved)).toBeOnTheScreen();
    expect(bgOf('appearance-screen')).toBe(darkColors.bg);
  });

  it('choosing the current value does nothing', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.appearance });
    await user.press(await screen.findByTestId('appearance-system'));
    expect(setItem).not.toHaveBeenCalled();
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});

describe('simulated restart', () => {
  it('opens in the saved theme, and the first frame is already dark', async () => {
    await saveAppearancePreference('dark');
    // hold the appearance read to look at the frames before it resolves
    const real = getItem.getMockImplementation() as (key: string) => Promise<string | null>;
    let release: () => void = () => undefined;
    getItem.mockImplementation((key: string) =>
      key === PREFERENCE_KEYS.appearance
        ? new Promise((resolve) => {
            release = () => void real(key).then(resolve);
          })
        : real(key),
    );
    try {
      await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
      expect(screen.queryByTestId('settings-screen')).toBeNull(); // splash still up
      await act(async () => release());
      await waitFor(() => expect(screen.getByTestId('settings-screen')).toBeOnTheScreen());
      expect(bgOf('settings-screen')).toBe(darkColors.bg);
      expect(mockStatusBarStyles).toEqual(mockStatusBarStyles.map(() => 'light')); // never 'dark'
    } finally {
      getItem.mockImplementation(real);
    }
  });
});

describe('live system changes', () => {
  it('"Automatic" follows the phone while the app runs', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    expect(bgOf('settings-screen')).toBe(lightColors.bg);
    await setSystem('dark');
    expect(bgOf('settings-screen')).toBe(darkColors.bg);
    expect(statusBar()).toBe('light');
    await setSystem('light');
    expect(bgOf('settings-screen')).toBe(lightColors.bg);
    expect(statusBar()).toBe('light'); // the navy header: light icons in both themes
  });

  it.each([
    ['light', 'dark', lightColors.bg],
    ['dark', 'light', darkColors.bg],
  ] as const)('"%s" ignores the phone switching to %s', async (choice, system, expected) => {
    await saveAppearancePreference(choice);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    expect(bgOf('settings-screen')).toBe(expected);
    await setSystem(system);
    expect(bgOf('settings-screen')).toBe(expected);
    await setSystem(choice === 'light' ? 'light' : 'dark');
    expect(bgOf('settings-screen')).toBe(expected);
  });
});

describe('status bar', () => {
  it('light content on navy or on dark, dark content on light', () => {
    expect(statusBarStyleFor('light', false)).toBe('dark');
    expect(statusBarStyleFor('dark', false)).toBe('light');
    expect(statusBarStyleFor('light', true)).toBe('light');
    expect(statusBarStyleFor('dark', true)).toBe('light');
  });

  it.each([
    ['light', 'dark'],
    ['dark', 'light'],
  ] as const)(
    'a %s-theme screen outside the tabs (surface header) has %s content',
    async (choice, expected) => {
      await saveAppearancePreference(choice);
      await renderRouter(APP_DIR, { initialUrl: '/no-such-screen' });
      await screen.findByTestId('not-found-screen');
      expect(statusBar()).toBe(expected);
    },
  );

  it.each(['light', 'dark'] as const)(
    '%s theme: white icons on every tab screen and every screen inside a tab',
    async (choice) => {
      await saveAppearancePreference(choice);
      const user = userEvent.setup();
      await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
      await screen.findByTestId('credentials-screen');
      await waitFor(() => expect(statusBar()).toBe('light'));
      for (const tab of ['tab-scan', 'tab-history', 'tab-settings'] as const) {
        await user.press(screen.getByTestId(tab));
        await waitFor(() => expect(statusBar()).toBe('light'));
      }
      // a screen inside the Settings tab (compact navy header), then back
      await user.press(screen.getByTestId('settings-language'));
      await screen.findByTestId('language-screen');
      expect(statusBar()).toBe('light');
      await user.press(screen.getByTestId('stack-header-back'));
      await screen.findByTestId('settings-screen');
      // never a flash of dark icons once a screen shows (the very first render, before any screen
      // is mounted, happens under the splash screen)
      const shown = mockStatusBarStyles.slice(mockStatusBarStyles.indexOf('light'));
      expect(shown).not.toContain('dark');
    },
  );

  it('a live theme change while a navy header shows keeps the icons light', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.history });
    await screen.findByTestId('history-screen');
    await setSystem('dark');
    expect(statusBar()).toBe('light');
    await setSystem('light');
    expect(statusBar()).toBe('light');
  });
});

describe('the lock screen: one navy surface in both themes', () => {
  /** Every host element inside `root` that paints a background. */
  const backgrounds = (rootID: string): Set<unknown> => {
    const found = new Set<unknown>();
    const walk = (node: ReturnType<typeof screen.getByTestId>) => {
      const bg = flat(node.props.style).backgroundColor;
      if (bg !== undefined) found.add(bg);
      for (const child of node.children) if (typeof child !== 'string') walk(child);
    };
    walk(screen.getByTestId(rootID));
    return found;
  };

  it.each([
    ['light', lightColors],
    ['dark', darkColors],
  ] as const)('%s: brand everywhere, inverse Unlock, light status-bar icons', async (choice, c) => {
    jest.spyOn(appInfo, 'lockOnAppStart').mockReturnValue(true);
    await saveAppearancePreference(choice);
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    // a surface screen behind it (dark icons in light mode): the light icons come from the lock
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await user.press(await screen.findByTestId('pin-prompt-cancel'));
    await waitFor(() => expect(screen.queryByTestId('pin-prompt')).toBeNull());
    expect(bgOf('lock-screen')).toBe(c.brand);
    // no split container: nothing inside paints anything but brand, except the inverse button
    expect([...backgrounds('lock-screen')].sort()).toEqual([c.brand, c.onBrand].sort());
    const actions = screen.getByTestId('lock-screen-actions');
    expect(flat(actions.props.style)).toMatchObject({ backgroundColor: c.brand });
    expect(flat(actions.props.style).borderTopWidth).toBeUndefined(); // no footer edge
    expect(flat(actions.props.style).paddingBottom).toBeGreaterThan(0); // the bottom inset
    // the mark and the text are one centred group
    expect(flat(screen.getByTestId('lock-screen-group').props.style)).toMatchObject({
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    });
    const title = screen.getByRole('header', { name: en.lock.title });
    expect(flat(title.props.style).color).toBe(c.onBrand);
    expect(flat(screen.getByText(en.lock.subtitle).props.style).color).toBe(c.onBrandMuted);
    // Unlock: inverse (on-brand fill, brand label)
    const unlock = screen.getByTestId('lock-unlock');
    expect(flat(unlock.props.style).backgroundColor).toBe(c.onBrand);
    expect(flat(within(unlock).getByText(en.lock.unlock).props.style).color).toBe(c.brand);
    // white status-bar icons while it shows, whatever the theme
    await waitFor(() => expect(statusBar()).toBe('light'));
  });
});
