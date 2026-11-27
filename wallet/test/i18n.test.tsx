/**
 * NFR-02: English and Sinhala. The Settings switch changes the text (and the font), Sinhala has
 * exactly the English keys in Sinhala script, and every placeholder survives translation.
 */
import { screen, userEvent } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import SettingsScreen from '../app/(tabs)/settings';
import { deviceLanguage, i18n, isLanguage, setupI18n } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { SINHALA_FONTS } from '../src/theme';
import { renderWithProviders } from './render';

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

type Tree = { [key: string]: string | Tree };
const leaves = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
  );
const leaf = (tree: Tree, path: string): string =>
  path.split('.').reduce<Tree | string>((node, key) => (node as Tree)[key] as Tree, tree) as string;

describe('language switch', () => {
  it('changes the Settings screen to Sinhala and back, with the Sinhala font', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByText(en.settings.language)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();

    await user.press(screen.getByTestId('language-si'));

    expect(await screen.findByText(si.settings.language)).toBeOnTheScreen();
    expect(screen.queryByText(en.settings.language)).toBeNull();
    expect(screen.getByRole('radio', { name: si.language.si })).toBeChecked();
    expect(i18n.language).toBe('si');
    expect(screen.getByText(si.settings.languageHint)).toHaveStyle({
      fontFamily: SINHALA_FONTS.regular,
    });

    await user.press(screen.getByTestId('language-en'));
    expect(await screen.findByText(en.settings.language)).toBeOnTheScreen();
  });

  it('shows the app version from the app config', async () => {
    await renderWithProviders(<SettingsScreen />);
    expect(screen.getByTestId('app-version')).toHaveTextContent('0.1.0');
  });
});

describe('translations', () => {
  it('Sinhala has exactly the English keys, every value in Sinhala script (except names)', async () => {
    const keys = leaves(en as unknown as Tree);
    expect(leaves(si as unknown as Tree)).toEqual(keys);
    const latinOnly = new Set(['app.name', 'language.en', 'diagnostics.sdkVersion']);
    for (const key of keys) {
      if (latinOnly.has(key)) continue;
      expect([key, /[඀-෿]/.test(leaf(si as unknown as Tree, key))]).toEqual([key, true]);
    }
  });

  it('keeps every interpolation placeholder in both languages', async () => {
    const placeholders = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();
    for (const key of leaves(en as unknown as Tree)) {
      expect([key, placeholders(leaf(si as unknown as Tree, key))]).toEqual([
        key,
        placeholders(leaf(en as unknown as Tree, key)),
      ]);
    }
  });

  it('si.ts is marked for native-speaker review', async () => {
    const source = readFileSync(join(__dirname, '..', 'src', 'i18n', 'locales', 'si.ts'), 'utf8');
    expect(source.split('\n')[0]).toBe('// needs native-speaker review');
  });

  it('starts in Sinhala only when the phone prefers Sinhala', async () => {
    const mocked = getLocales as jest.Mock;
    const original = mocked.getMockImplementation();
    try {
      mocked.mockReturnValue([{ languageCode: 'si' }]);
      expect(deviceLanguage()).toBe('si');
      mocked.mockReturnValue([{ languageCode: 'ta' }]);
      expect(deviceLanguage()).toBe('en');
      mocked.mockReturnValue([]);
      expect(deviceLanguage()).toBe('en');
      mocked.mockImplementation(() => {
        throw new Error('no locale module');
      });
      expect(deviceLanguage()).toBe('en');
    } finally {
      if (original) mocked.mockImplementation(original);
      else mocked.mockReset();
    }
    expect(isLanguage('si')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
  });

  it('setupI18n switches an already initialised instance', async () => {
    setupI18n('si');
    expect(i18n.language).toBe('si');
    setupI18n('si');
    expect(i18n.language).toBe('si');
  });
});
