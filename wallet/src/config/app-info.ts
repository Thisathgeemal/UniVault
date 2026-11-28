import Constants from 'expo-constants';
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
 * PLACEHOLDER until the PIN task: the "Continue" button on /setup/security that marks security
 * setup as done (src/onboarding/security-setup.ts). Development builds only, so a release build
 * can never reach the wallet without real security setup.
 */
export const securitySetupPlaceholderEnabled = (): boolean => __DEV__;

/** Diagnostics → "Reset onboarding" (development builds only). */
export const onboardingResetEnabled = (): boolean => __DEV__;
