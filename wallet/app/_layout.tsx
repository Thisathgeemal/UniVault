/**
 * Root layout: providers for every screen.
 * - i18n: initialised synchronously at import (device language), then the SAVED state is
 *   applied before anything renders (restoreAppState: language, appearance, setup state), so
 *   there is no flash of the wrong language, the wrong theme or the wrong first screen
 * - safe areas, the appearance (theme: Settings → Appearance or the phone), the setup state for
 *   the gate (src/onboarding/gate.ts), the status bar (follows the theme and the navy header),
 *   Noto Sans and Noto Sans Sinhala (bundled, expo-font), the navigation theme
 * - toasts (ToastProvider) and an ErrorBoundary around the navigator
 * The splash screen stays up until the fonts (or their failure: system font) AND the saved state
 * are ready.
 *
 * The gate lives in the layouts it protects (index, (tabs), onboarding, setup): each one
 * redirects a holder who may not be there, so a typed URL or deep link is handled the same way
 * as the app start.
 */
// One import per weight: the packages' index files require EVERY weight and italic, which would
// put about 20 unused font files (over 10 MB) into the app bundle
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_500Medium } from '@expo-google-fonts/noto-sans/500Medium';
import { NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans/600SemiBold';
import { NotoSansSinhala_400Regular } from '@expo-google-fonts/noto-sans-sinhala/400Regular';
import { NotoSansSinhala_600SemiBold } from '@expo-google-fonts/noto-sans-sinhala/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, ToastProvider } from '../src/components';
import { setupI18n } from '../src/i18n';
import { restoreAppState, type RestoredAppState } from '../src/lib/app-state';
import { useNavigationTheme } from '../src/navigation/navigation-theme';
import { useStackScreenOptions } from '../src/navigation/stack-options';
import { StatusBarProvider } from '../src/navigation/status-bar';
import { SetupProvider } from '../src/onboarding/SetupProvider';
import { AppearanceProvider } from '../src/theme/appearance';

setupI18n();
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { t } = useTranslation();
  const screenOptions = useStackScreenOptions();
  const navigationTheme = useNavigationTheme();
  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="setup" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: t('notFound.title') }} />
      </Stack>
    </ThemeProvider>
  );
}

/** The saved language (applied), appearance and setup state; null until they are read. */
function useRestoredAppState(): RestoredAppState | null {
  const [restored, setRestored] = useState<RestoredAppState | null>(null);
  useEffect(() => {
    let active = true;
    void restoreAppState().then((state) => {
      if (active) setRestored(state);
    });
    return () => {
      active = false;
    };
  }, []);
  return restored;
}

export default function RootLayout() {
  // The design system's families and weights (names in portal-ui/src/tokens.ts fontFamily)
  const [fontsLoaded, fontError] = useFonts({
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
    NotoSansSinhala_400Regular,
    NotoSansSinhala_600SemiBold,
  });
  const restored = useRestoredAppState();
  const ready = (fontsLoaded || fontError !== null) && restored !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <AppearanceProvider initial={restored.appearance}>
        <SetupProvider initial={restored.setup}>
          <StatusBarProvider>
            <ToastProvider>
              <ErrorBoundary>
                <RootNavigator />
              </ErrorBoundary>
            </ToastProvider>
          </StatusBarProvider>
        </SetupProvider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
