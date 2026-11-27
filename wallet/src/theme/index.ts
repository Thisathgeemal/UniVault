/**
 * Wallet theme, built ONLY from the shared design tokens (@univault/portal-ui/tokens). No colour,
 * size or radius value is written here: change a token in portal-ui/src/tokens.ts and both the
 * portals and the wallet follow.
 *
 * - Lengths: tokens are in rem; React Native uses density-independent points (remToPx, 16/rem).
 * - Dark mode (userInterfaceStyle "automatic"): mapped onto the brand's dark tokens (the
 *   portal sidebar palette), which already meet WCAG AA against their foregrounds.
 * - Dynamic type: font sizes here are the base sizes; React Native's Text scales them with the
 *   user's OS text size (allowFontScaling stays on), so layouts use minHeight, never height.
 */
import {
  brandColors,
  radii as radiusTokens,
  remToPx,
  semanticColors,
  sinhalaLineHeight,
  spacingUnit,
  typeScale as typeTokens,
} from '@univault/portal-ui/tokens';

export interface ThemeColors {
  background: string;
  surface: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  primary: string;
  primaryForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  destructiveForeground: string;
  destructiveMuted: string;
  info: string;
  infoMuted: string;
  success: string;
  successMuted: string;
  ring: string;
}

export const lightColors: ThemeColors = {
  background: semanticColors.background,
  surface: semanticColors.surface,
  foreground: semanticColors.foreground,
  muted: semanticColors.muted,
  mutedForeground: semanticColors.mutedForeground,
  border: semanticColors.border,
  primary: semanticColors.primary,
  primaryForeground: semanticColors.primaryForeground,
  accent: semanticColors.accent,
  accentForeground: semanticColors.accentForeground,
  destructive: semanticColors.destructive,
  destructiveForeground: semanticColors.destructiveForeground,
  destructiveMuted: semanticColors.destructiveMuted,
  info: semanticColors.info,
  infoMuted: semanticColors.infoMuted,
  success: brandColors[700],
  successMuted: brandColors[50],
  ring: semanticColors.ring,
};

export const darkColors: ThemeColors = {
  background: semanticColors.sidebar,
  surface: brandColors[700],
  foreground: semanticColors.sidebarForeground,
  muted: brandColors[600],
  mutedForeground: semanticColors.sidebarMuted,
  border: brandColors[600],
  primary: brandColors[100],
  primaryForeground: brandColors[900],
  accent: semanticColors.accent,
  accentForeground: semanticColors.accentForeground,
  destructive: semanticColors.destructiveMuted,
  destructiveForeground: semanticColors.destructive,
  destructiveMuted: semanticColors.destructiveMuted,
  info: semanticColors.infoMuted,
  infoMuted: semanticColors.info,
  success: brandColors[100],
  successMuted: brandColors[900],
  ring: brandColors[100],
};

/** Spacing in points: space(4) = 4 × 0.25 rem = 16 pt (Tailwind's p-4). */
export const space = (steps: number): number => remToPx(spacingUnit * steps);

export const radii = {
  sm: remToPx(radiusTokens.sm),
  md: remToPx(radiusTokens.md),
  lg: remToPx(radiusTokens.lg),
  card: remToPx(radiusTokens.card),
  full: radiusTokens.full,
} as const;

export type TypeStep = keyof typeof typeTokens;

/** Font size and line height (points) for a type step. Sinhala gets the taller line height. */
export function typeStyle(
  step: TypeStep,
  script: 'latin' | 'sinhala' = 'latin',
): { fontSize: number; lineHeight: number } {
  const token = typeTokens[step];
  const fontSize = remToPx(token.size);
  const lineHeight =
    script === 'sinhala'
      ? Math.round(Math.max(remToPx(token.lineHeight), fontSize * sinhalaLineHeight))
      : remToPx(token.lineHeight);
  return { fontSize, lineHeight };
}

/** Minimum touch target (Apple HIG 44 pt; Android's 48 dp is met by padding where needed). */
export const MIN_TOUCH_TARGET = 44;

/**
 * Font family names registered by the root layout (expo-font). Latin text uses the system font
 * (undefined); Sinhala uses the bundled Noto Sans Sinhala, one family per weight.
 */
export const SINHALA_FONTS = {
  regular: 'NotoSansSinhala_400Regular',
  bold: 'NotoSansSinhala_700Bold',
} as const;

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  space: typeof space;
  radii: typeof radii;
}

export function getTheme(scheme: 'light' | 'dark' | null | undefined): Theme {
  const resolved = scheme === 'dark' ? 'dark' : 'light';
  return {
    scheme: resolved,
    colors: resolved === 'dark' ? darkColors : lightColors,
    space,
    radii,
  };
}
