/**
 * Expo app configuration for the UniVault wallet.
 *
 * - No secrets here: everything in the app config is readable from the app bundle. Runtime
 *   settings come from EXPO_PUBLIC_* variables (also public; see .env.example).
 * - Colours come from the shared design tokens, never copied. Imported by relative path: Expo
 *   loads this file itself, without the @univault/portal-ui/tokens mapping that Metro,
 *   TypeScript and Jest use (see metro.config.js). It is the source file: no build needed.
 * - Permission texts: iOS shows these strings in its permission dialogs. Android's dialogs use
 *   the system's own wording; the app explains each permission on screen before asking
 *   (from Sprint 2, when the camera and biometric unlock are used).
 */
import { darkColors, lightColors } from '../portal-ui/src/tokens.ts';
import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Reverse-DNS application id for Android and iOS (`lk` = Sri Lanka). */
export const APP_ID = 'lk.univault.wallet';

export const CAMERA_PERMISSION_TEXT =
  'UniVault uses the camera to scan QR codes: credential offers from an issuer, and ' +
  'verification requests from an organisation checking your credential.';
export const FACE_ID_PERMISSION_TEXT =
  'UniVault uses Face ID to unlock your wallet and to confirm before you share a credential.';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'UniVault',
  slug: 'univault-wallet',
  version: '0.1.0',
  scheme: 'univault',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/images/icon.png',
  ios: {
    bundleIdentifier: APP_ID,
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: CAMERA_PERMISSION_TEXT,
      NSFaceIDUsageDescription: FACE_ID_PERMISSION_TEXT,
    },
  },
  android: {
    package: APP_ID,
    adaptiveIcon: {
      foregroundImage: './assets/images/adaptive-icon.png',
      backgroundColor: lightColors.brand,
    },
    permissions: ['android.permission.CAMERA', 'android.permission.USE_BIOMETRIC'],
  },
  plugins: [
    'expo-router',
    'expo-localization',
    'expo-font',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: lightColors.bg,
        dark: {
          image: './assets/images/splash-icon-dark.png',
          backgroundColor: darkColors.bg,
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
});
