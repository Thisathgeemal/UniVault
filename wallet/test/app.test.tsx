/**
 * Root layout (providers, font loading, splash) and the app config (identifiers, permission
 * texts, colours from the tokens, no secrets).
 */
import { screen } from '@testing-library/react-native';
import { join } from 'node:path';
import { brandColors, semanticColors } from '@univault/portal-ui/tokens';
import { useFonts } from '@expo-google-fonts/noto-sans-sinhala';
import { renderRouter } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import appConfig, { APP_ID, CAMERA_PERMISSION_TEXT, FACE_ID_PERMISSION_TEXT } from '../app.config';
import { en } from '../src/i18n/locales/en';

jest.mock('@expo-google-fonts/noto-sans-sinhala', () => ({
  NotoSansSinhala_400Regular: 1,
  NotoSansSinhala_700Bold: 2,
  useFonts: jest.fn(() => [true, null]),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

/**
 * The REAL route tree: renderRouter reads the files in wallet/app, so the Stack and Tabs screen
 * declarations are checked against the actual routes. A declared screen without a file (or a
 * file the layout does not expect) makes expo-router warn, and test/setup.ts fails the test on
 * any unexpected console.warn / console.error.
 */
const APP_DIR = join(__dirname, '..', 'app');

describe('root layout (real app/ routes)', () => {
  afterEach(() => {
    (useFonts as jest.Mock).mockReturnValue([true, null]);
  });

  it('renders the app once the Sinhala font is loaded, then hides the splash screen', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(screen.getByText(en.credentials.emptyTitle)).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it.each([
    ['/scan', en.scan.emptyTitle],
    ['/history', en.history.emptyTitle],
    ['/settings', en.settings.language],
    ['/settings/diagnostics', en.diagnostics.cryptoTitle],
    ['/no-such-screen', en.notFound.title],
  ])('every declared screen exists: %s', async (url, text) => {
    await renderRouter(APP_DIR, { initialUrl: url });
    expect(screen).toHavePathname(url);
    expect(screen.getAllByText(text).length).toBeGreaterThan(0);
  });

  it('keeps the splash screen (renders nothing) while the font loads', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(screen.queryByText(en.credentials.emptyTitle)).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('still starts, with the system font, if the font fails to load', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('font missing')]);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByText(en.credentials.emptyTitle)).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });
});

describe('app config', () => {
  const config = appConfig({ config: {} } as never);

  it('names the app UniVault 0.1.0 with the univault:// scheme', () => {
    expect(config).toMatchObject({
      name: 'UniVault',
      slug: 'univault-wallet',
      version: '0.1.0',
      scheme: 'univault',
      orientation: 'portrait',
      userInterfaceStyle: 'automatic',
    });
  });

  it('uses lk.univault.wallet on both platforms', () => {
    expect(APP_ID).toBe('lk.univault.wallet');
    expect(config.android?.package).toBe(APP_ID);
    expect(config.ios?.bundleIdentifier).toBe(APP_ID);
  });

  it('explains the camera and Face ID permissions in plain English', () => {
    expect(config.ios?.infoPlist).toEqual({
      NSCameraUsageDescription: CAMERA_PERMISSION_TEXT,
      NSFaceIDUsageDescription: FACE_ID_PERMISSION_TEXT,
    });
    expect(CAMERA_PERMISSION_TEXT).toMatch(/QR codes/);
    expect(FACE_ID_PERMISSION_TEXT).toMatch(/unlock your wallet/);
    expect(config.android?.permissions).toEqual([
      'android.permission.CAMERA',
      'android.permission.USE_BIOMETRIC',
    ]);
  });

  it('takes its colours from the shared tokens', () => {
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe(semanticColors.primary);
    expect(JSON.stringify(config.plugins)).toContain(brandColors[900]);
  });

  it('holds no secrets and no extra runtime values', () => {
    expect(config.extra).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/secret|password|token|PRIVATE KEY/i);
  });
});
