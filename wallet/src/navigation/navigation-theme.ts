import { DarkTheme, DefaultTheme } from 'expo-router';
import { useMemo } from 'react';
import { useTheme } from '../theme/use-theme';

/**
 * React Navigation's theme from the design tokens and the effective scheme, so whatever the
 * navigators draw themselves (scene background behind transitions, any default header or tab
 * bar colour) follows Settings → Appearance like the rest of the app.
 */
export function useNavigationTheme(): typeof DefaultTheme {
  const { scheme, colors } = useTheme();
  return useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: scheme === 'dark',
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
    };
  }, [scheme, colors]);
}
