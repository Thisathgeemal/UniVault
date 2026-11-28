import { render } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../src/components';

/** Fixed safe-area metrics so SafeAreaView renders in Jest (no native measurement). */
export const TEST_SAFE_AREA = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** The providers app/_layout.tsx puts around every screen (safe areas, toasts). */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
      <ToastProvider>{children}</ToastProvider>
    </SafeAreaProvider>
  );
}

export async function renderWithProviders(ui: ReactElement) {
  return await render(<Providers>{ui}</Providers>);
}
