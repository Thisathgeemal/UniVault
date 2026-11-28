import { useFocusEffect } from 'expo-router';
import type { NativeStackHeaderProps, NativeStackNavigationOptions } from 'expo-router';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback } from 'react';
import { Header } from '../components/Header';
import { useTheme } from '../theme/use-theme';

/**
 * Renders the shared Header for a stack screen: title from the options, back when possible;
 * `tone="brand"` for the Credentials home screen (design system: brand header on home).
 */
export function StackHeader({
  options,
  back,
  navigation,
  route,
  tone = 'surface',
}: NativeStackHeaderProps & { tone?: 'surface' | 'brand' }) {
  const title = typeof options.title === 'string' ? options.title : route.name;
  return (
    <Header
      testID="stack-header"
      title={title}
      tone={tone}
      {...(back ? { onBack: () => navigation.goBack() } : {})}
    />
  );
}

/**
 * Light status-bar content while a screen with the navy header is focused (dark icons would
 * vanish on navy); back to the scheme's default when it loses focus.
 */
export function useBrandStatusBar(): void {
  const { scheme } = useTheme();
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(scheme === 'dark' ? 'light' : 'dark');
    }, [scheme]),
  );
}

/**
 * Screen options for every Stack (root and the four tab stacks): the shared Header (back button
 * only when there is a screen to go back to, so a tab's root never shows one) and the themed
 * background. Android's hardware back button is handled by the navigator: it pops the stack,
 * then the tab navigator goes to the first tab (backBehavior "firstRoute"), and only from the
 * Credentials root does it leave the app (the Android norm).
 */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  return {
    header: (props) => <StackHeader {...props} />,
    contentStyle: { backgroundColor: theme.colors.bg },
  };
}
