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
