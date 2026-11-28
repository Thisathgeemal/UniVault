import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../src/components';
import type { AppearancePreference } from '../src/lib/preferences';
import { SetupProvider } from '../src/onboarding/SetupProvider';
import { LockProvider } from '../src/security/app-lock';
import { AuthenticationProvider } from '../src/security/authenticate';
import type { SetupState } from '../src/onboarding/gate';
import { AppearanceProvider } from '../src/theme/appearance';
import { COMPLETED_SETUP } from './setup-state';

/** Fixed safe-area metrics so SafeAreaView renders in Jest (no native measurement). */
export const TEST_SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

export interface ProviderOptions {
  appearance?: AppearancePreference;
  setup?: SetupState;
}

/**
 * The providers app/_layout.tsx puts around every screen (safe areas, appearance, setup state,
 * toasts). Default: "Automatic" (system) and a holder who finished setup.
 */
export function Providers({
  children,
  appearance = 'system',
  setup = COMPLETED_SETUP,
}: ProviderOptions & { children: ReactNode }) {
  return (
    <GestureHandlerRootView>
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
        <AppearanceProvider initial={appearance}>
          <SetupProvider initial={setup}>
            <ToastProvider>
              <AuthenticationProvider>
                <LockProvider>{children}</LockProvider>
              </AuthenticationProvider>
            </ToastProvider>
          </SetupProvider>
        </AppearanceProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export async function renderWithProviders(ui: ReactElement, options: ProviderOptions = {}) {
  return await render(<Providers {...options}>{ui}</Providers>);
}
