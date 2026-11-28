import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useSyncExternalStore } from 'react';
import { screenCaptureBlockingEnabled } from '../config/app-info';

/** Keys for expo-screen-capture's reference counting: the PIN screens' own block, the app's. */
export const PIN_SCREEN_CAPTURE_KEY = 'univault-pin';
export const APP_SCREEN_CAPTURE_KEY = 'univault-app';

/** Blocks capture while mounted and `enabled`; a failing module never breaks the screen. */
function useCaptureBlock(key: string, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return undefined;
    void Promise.resolve()
      .then(() => ScreenCapture.preventScreenCaptureAsync(key))
      .catch(() => undefined);
    return () => {
      void Promise.resolve()
        .then(() => ScreenCapture.allowScreenCaptureAsync(key))
        .catch(() => undefined);
    };
  }, [key, enabled]);
}

/**
 * While the calling screen is mounted, screen capture is blocked through expo-screen-capture
 * (Android: FLAG_SECURE, so screenshots and recordings are refused and the app switcher shows a
 * blank card; iOS: what expo-screen-capture supports on the OS version, at least a blank screen
 * in recordings; see docs/security/wallet-pin.md §7). RELEASE BUILDS ONLY
 * (`screenCaptureBlockingEnabled()` = !__DEV__), so development screenshots still work.
 */
export function useBlockScreenCapture(key: string = PIN_SCREEN_CAPTURE_KEY): void {
  useCaptureBlock(key, screenCaptureBlockingEnabled());
}

// Diagnostics (development builds only): "Block screenshots and recents preview", off by default,
// in memory (never saved), so the release behaviour can be tried in Expo Go on demand.
let devBlock = false;
const devListeners = new Set<() => void>();

export function setDevScreenCaptureBlock(on: boolean): void {
  devBlock = on;
  for (const listener of [...devListeners]) listener();
}

/** Tests only (test/setup.ts). */
export function resetDevScreenCaptureBlock(): void {
  devBlock = false;
}

export function useDevScreenCaptureBlock(): boolean {
  return useSyncExternalStore(
    (listener) => {
      devListeners.add(listener);
      return () => {
        devListeners.delete(listener);
      };
    },
    () => devBlock,
  );
}

/**
 * The WHOLE wallet (app/_layout.tsx via LockProvider): blocked in release builds, so Android's
 * recents thumbnail is blank even when it is taken before the AppState 'background' event
 * (FLAG_SECURE applies to the window itself); in development builds only while the Diagnostics
 * switch is on. iOS takes its snapshot on 'inactive', where the navy privacy cover is already up.
 */
export function useAppScreenCaptureBlock(): void {
  const dev = useDevScreenCaptureBlock();
  useCaptureBlock(APP_SCREEN_CAPTURE_KEY, screenCaptureBlockingEnabled() || (__DEV__ && dev));
}
