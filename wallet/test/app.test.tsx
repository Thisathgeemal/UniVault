/**
 * Root layout (providers, font and language loading, splash) and the app config (identifiers, permission
 * texts, colours from the tokens, no secrets).
 */
import { act, screen } from '@testing-library/react-native';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { darkColors, lightColors } from '@univault/portal-ui/tokens';
import { useFonts } from 'expo-font';
import { renderRouter } from 'expo-router/testing-library';
import * as SplashScreen from 'expo-splash-screen';
import appConfig, { APP_ID, CAMERA_PERMISSION_TEXT, FACE_ID_PERMISSION_TEXT } from '../app.config';

// the font weights, expo-font's useFonts and expo-splash-screen are mocked in test/setup.ts

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

  it('renders the app once the font and the language are ready, then hides the splash', async () => {
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  it('keeps the splash screen (renders nothing) while the font loads', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, null]);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    // let the language restore finish: still nothing, because the font is not ready
    await act(async () => undefined);
    expect(screen.queryByTestId('credentials-screen')).toBeNull();
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
  });

  it('still starts, with the system font, if the font fails to load', async () => {
    (useFonts as jest.Mock).mockReturnValue([false, new Error('font missing')]);
    await renderRouter(APP_DIR, { initialUrl: '/' });
    expect(await screen.findByTestId('credentials-screen')).toBeOnTheScreen();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });
});

describe('bundled fonts', () => {
  it('imports only the five design weights, never a font package index (which pulls every weight)', () => {
    const source = readFileSync(join(APP_DIR, '_layout.tsx'), 'utf8');
    expect(source).not.toMatch(/from '@expo-google-fonts\/noto-sans(-sinhala)?'/);
    const weights = [...source.matchAll(/from '@expo-google-fonts\/([\w-]+\/\w+)'/g)].map(
      (m) => m[1],
    );
    expect(weights).toEqual([
      'noto-sans/400Regular',
      'noto-sans/500Medium',
      'noto-sans/600SemiBold',
      'noto-sans-sinhala/400Regular',
      'noto-sans-sinhala/600SemiBold',
    ]);
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
    expect(config.android?.adaptiveIcon?.backgroundColor).toBe(lightColors.brand);
    expect(JSON.stringify(config.plugins)).toContain(lightColors.bg);
    expect(JSON.stringify(config.plugins)).toContain(darkColors.bg);
  });

  it('holds no secrets and no extra runtime values', () => {
    expect(config.extra).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/secret|password|token|PRIVATE KEY/i);
  });
});
