import * as ScreenCapture from 'expo-screen-capture';
import { useEffect } from 'react';
import { screenCaptureBlockingEnabled } from '../config/app-info';

/** Key for expo-screen-capture's reference counting: the PIN screens' own block. */
export const PIN_SCREEN_CAPTURE_KEY = 'univault-pin';

/**
 * While the calling screen is mounted, screen capture is blocked through expo-screen-capture
 * (Android: FLAG_SECURE, so screenshots and recordings are refused and the app switcher shows a
 * blank card; iOS: what expo-screen-capture supports on the OS version, at least a blank screen
 * in recordings; see docs/security/wallet-pin.md §7). RELEASE BUILDS ONLY
 * (`screenCaptureBlockingEnabled()` = !__DEV__), so development screenshots still work. A
 * failure (module missing) never breaks the screen.
 */
export function useBlockScreenCapture(key: string = PIN_SCREEN_CAPTURE_KEY): void {
  useEffect(() => {
    if (!screenCaptureBlockingEnabled()) return undefined;
    void Promise.resolve()
      .then(() => ScreenCapture.preventScreenCaptureAsync(key))
      .catch(() => undefined);
    return () => {
      void Promise.resolve()
        .then(() => ScreenCapture.allowScreenCaptureAsync(key))
        .catch(() => undefined);
    };
  }, [key]);
}
