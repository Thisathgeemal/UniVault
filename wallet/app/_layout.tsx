/**
 * Root layout: providers for every screen.
 * - i18n: initialised synchronously at import (device language), then the SAVED language is
 *   applied (restoreLanguage) before anything renders, so there is no flash of the wrong
 *   language
 * - safe areas, OS colour scheme (status bar), Noto Sans and Noto Sans Sinhala (bundled, expo-font)
 * - toasts (ToastProvider) and an ErrorBoundary around the navigator
 * The splash screen stays up until the fonts (or their failure: system font) AND the language are
 * ready.
 */
// One import per weight: the packages' index files require EVERY weight and italic, which would
// put about 20 unused font files (over 10 MB) into the app bundle
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSans_500Medium } from '@expo-google-fonts/noto-sans/500Medium';
import { NotoSans_600SemiBold } from '@expo-google-fonts/noto-sans/600SemiBold';
import { NotoSansSinhala_400Regular } from '@expo-google-fonts/noto-sans-sinhala/400Regular';
import { NotoSansSinhala_600SemiBold } from '@expo-google-fonts/noto-sans-sinhala/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary, ToastProvider } from '../src/components';
import { restoreLanguage, setupI18n } from '../src/i18n';
import { useStackScreenOptions } from '../src/navigation/stack-options';
import { useTheme } from '../src/theme/use-theme';

setupI18n();
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { t } = useTranslation();
  const theme = useTheme();
  const screenOptions = useStackScreenOptions();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: t('notFound.title') }} />
      </Stack>
    </>
  );
}

/** True once the saved language (or the device language) is applied. */
function useLanguageReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    void restoreLanguage().then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  return ready;
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
  const languageReady = useLanguageReady();
  const ready = (fontsLoaded || fontError !== null) && languageReady;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ToastProvider>
        <ErrorBoundary>
          <RootNavigator />
        </ErrorBoundary>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
