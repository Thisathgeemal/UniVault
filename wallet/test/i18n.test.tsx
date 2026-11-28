/**
 * NFR-02: English and Sinhala. The Settings switch changes the text (and the font), Sinhala has
 * exactly the English keys in Sinhala script, and every placeholder survives translation.
 */
import { screen, userEvent } from '@testing-library/react-native';
import { getLocales } from 'expo-localization';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import AboutScreen from '../app/(tabs)/settings/about';
import LanguageScreen from '../app/(tabs)/settings/language';
import { deviceLanguage, i18n, isLanguage, setupI18n } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { fontFamily } from '@univault/portal-ui/tokens';
import { renderWithProviders } from './render';

type Tree = { [key: string]: string | Tree };
const leaves = (tree: Tree, prefix = ''): string[] =>
  Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : leaves(value, `${prefix}${key}.`),
  );
const leaf = (tree: Tree, path: string): string =>
  path.split('.').reduce<Tree | string>((node, key) => (node as Tree)[key] as Tree, tree) as string;

describe('language switch', () => {
  it('changes the Language screen to Sinhala and back, with the Sinhala font', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<LanguageScreen />);
    expect(screen.getByText(en.settings.languageHint)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: en.language.en })).toBeChecked();

    await user.press(screen.getByTestId('language-si'));

    expect(await screen.findByText(si.settings.languageHint)).toBeOnTheScreen();
    expect(screen.queryByText(en.settings.languageHint)).toBeNull();
    expect(screen.getByRole('radio', { name: si.language.si })).toBeChecked();
    expect(i18n.language).toBe('si');
    expect(screen.getByText(si.settings.languageHint)).toHaveStyle({
      fontFamily: fontFamily.sinhala,
    });

    await user.press(screen.getByTestId('language-en'));
    expect(await screen.findByText(en.settings.languageHint)).toBeOnTheScreen();
  });

  it('About shows the app version, the SDK and the font licence notice', async () => {
    await renderWithProviders(<AboutScreen />);
    expect(screen.getByTestId('app-version').props.accessibilityLabel).toBe(
      `${en.about.appVersion}, 0.1.0`,
    );
    expect(screen.getByTestId('sdk-version').props.accessibilityLabel).toBe(
      `${en.about.sdkVersion}, 58.0.0`,
    );
    expect(screen.getByTestId('font-licence')).toHaveTextContent(/SIL Open Font License/);
  });
});

describe('translations', () => {
  it('Sinhala has exactly the English keys, every value in Sinhala script (except names)', async () => {
    const keys = leaves(en as unknown as Tree);
    expect(leaves(si as unknown as Tree)).toEqual(keys);
    const latinOnly = new Set([
      'app.name',
      'language.en',
      'diagnostics.sdkVersion',
      'about.sdkVersion',
      'history.entrySubtitle', // only placeholders and a separator
      'uiKit.disclosureVerifier', // an invented organisation name
    ]);
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
