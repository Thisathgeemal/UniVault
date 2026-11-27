/**
 * Root layout: providers for every screen.
 * - i18n (set up once, before the first render)
 * - safe areas, OS colour scheme (status bar), the Sinhala font (bundled, loaded with expo-font)
 * - an ErrorBoundary around the navigator
 * The splash screen stays up until the font is ready (or failed: then the system font is used).
 */
import {
  NotoSansSinhala_400Regular,
  NotoSansSinhala_700Bold,
  useFonts,
} from '@expo-google-fonts/noto-sans-sinhala';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorBoundary } from '../src/components';
import { setupI18n } from '../src/i18n';
import { useTheme } from '../src/theme/use-theme';

setupI18n();
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

function RootNavigator() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.primary,
          headerTitleStyle: { color: theme.colors.foreground },
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="settings/diagnostics" options={{ title: t('diagnostics.title') }} />
        <Stack.Screen name="+not-found" options={{ title: t('notFound.title') }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    NotoSansSinhala_400Regular,
    NotoSansSinhala_700Bold,
  });
  const ready = fontsLoaded || fontError !== null;

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  if (!ready) return null;
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <RootNavigator />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
