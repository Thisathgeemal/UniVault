import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Facts about this build and device for Settings and Diagnostics (no personal data). */
export interface AppInfo {
  appVersion: string;
  sdkVersion: string;
  platform: string;
  hermes: boolean;
}

export function getAppInfo(): AppInfo {
  const config = Constants.expoConfig;
  return {
    appVersion: config?.version ?? '0.0.0',
    sdkVersion: config?.sdkVersion ?? 'unknown',
    platform: `${Platform.OS} ${String(Platform.Version)}`,
    hermes: typeof (globalThis as { HermesInternal?: unknown }).HermesInternal === 'object',
  };
}

/**
 * Diagnostics exist in development builds only. `__DEV__` is false in release builds, and
 * Metro removes the code behind it there.
 */
export const diagnosticsEnabled = (): boolean => __DEV__;

/** The UI Kit screen (every component and state) exists in development builds only. */
export const uiKitEnabled = (): boolean => __DEV__;

/**
 * Synthetic sample credentials and history entries (src/fixtures/sample-data.ts) are shown in
 * development builds only, until the vault holds real ones. A release build never shows
 * invented credentials.
 */
export const sampleDataEnabled = (): boolean => __DEV__;

/**
 * Screenshots and screen recording are blocked on the PIN screens in RELEASE builds only
 * (src/security/screen-capture.ts), so development screenshots for the evidence still work.
 */
export const screenCaptureBlockingEnabled = (): boolean => !__DEV__;

/** Diagnostics → "Reset onboarding" (development builds only). */
export const onboardingResetEnabled = (): boolean => __DEV__;

/**
 * True inside Expo Go (the store client). iOS Expo Go cannot use secure-store items that need
 * biometric authentication (its Info.plist has no NSFaceIDUsageDescription), so biometric unlock
 * is reported unsupported there (src/security/biometrics.ts).
 */
export const isExpoGo = (): boolean =>
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * The app lock starts locked on every app start once setup is complete (src/security/app-lock.tsx).
 * Always true in the app; test/setup.ts turns it off for the tests of other features (the app
 * lock tests turn it back on).
 */
export const lockOnAppStart = (): boolean => true;
