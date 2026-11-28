/**
 * Wallet theme ("Navy and azure", docs/design/design-system.md), built ONLY from the shared
 * design tokens (@univault/portal-ui/tokens). No colour, size or radius value is written here:
 * change a token in portal-ui/src/tokens.ts and the portals and the wallet follow.
 *
 * - Colours: the token sets themselves, same names as the design system (camelCase): light
 *   and dark follow the phone (userInterfaceStyle "automatic"). Every pair in contrast.ts meets
 *   WCAG AA in both modes (test/contrast.test.ts).
 * - Lengths are points (the tokens are px); text keeps scaling with the OS text size, so
 *   layouts use minHeight, never height.
 * - Type: the design scale (26 for 16 body) with Noto Sans / Noto Sans Sinhala per weight.
 */
import {
  darkColors,
  fontFamily,
  lightColors,
  minButtonHeight,
  radius as radiusTokens,
  statusTokens,
  typeScale,
  type StatusSet,
  type ThemeColors,
  type TypeStep,
} from '@univault/portal-ui/tokens';

export { darkColors, lightColors, type StatusSet, type ThemeColors, type TypeStep };

/** Spacing on the 4 pt base: space(4) = 16 (the design's space-1 … space-8). */
export const space = (steps: number): number => 4 * steps;

export const radius = radiusTokens;

/**
 * Wallet layout (design-system.md, "Wallet typography and layout"):
 * - SCREEN_PADDING: space-4 left and right on phones (and at the top of a screen);
 * - SECTION_GAP: space-6 between the sections of a screen;
 * - CARD_GAP: space-2 between the lines inside a card (space-3 between groups in a card);
 * - LIST_ROW_MIN_HEIGHT: 56 pt rows;
 * - MAX_READABLE_WIDTH: text and forms stop at 560 pt and centre on tablets.
 */
export const SCREEN_PADDING = space(4);
export const SECTION_GAP = space(6);
export const CARD_GAP = space(2);
export const LIST_ROW_MIN_HEIGHT = space(14);
export const MAX_READABLE_WIDTH = space(140);

/** No fill (empty PIN dots, the keypad's Delete key): a keyword, not a colour value. */
export const TRANSPARENT = 'transparent';

/** Minimum touch target and button height in the wallet (design system: 44). */
export const MIN_TOUCH_TARGET = minButtonHeight.wallet;

/** Badge tones: the four status sets, plus neutral for labels that are not a status. */
export type Tone = StatusSet | 'neutral';
export const TONES: readonly Tone[] = ['valid', 'expired', 'revoked', 'pending', 'neutral'];

/** Text/icon colour and background of a tone (status sets: their badge colours). */
export function toneColors(colors: ThemeColors, tone: Tone): { fg: string; bg: string } {
  if (tone === 'neutral') return { fg: colors.textMuted, bg: colors.surfaceSunken };
  const names = statusTokens[tone];
  return { fg: colors[names.text], bg: colors[names.bg] };
}

export type ButtonVariant =
  'primary' | 'secondary' | 'text' | 'destructive' | 'onBrand' | 'inverse' | 'textOnBrand';
export const BUTTON_VARIANTS: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'text',
  'destructive',
  'onBrand',
  'inverse',
  'textOnBrand',
];

/** Kinds that only ever sit on navy (a header, a credential card, the full-navy lock screen). */
export const NAVY_BUTTON_VARIANTS: readonly ButtonVariant[] = ['onBrand', 'inverse', 'textOnBrand'];
export const isNavyVariant = (variant: ButtonVariant): boolean =>
  NAVY_BUTTON_VARIANTS.includes(variant);

/**
 * Button colours per kind (design system, Buttons). `bg` is what the label sits on: a text
 * button is transparent on bg or surface (`on: 'screen'`); the navy kinds sit on brand
 * (`on: 'brand'`): on-brand is the translucent role-tag-bg (composited for the contrast test),
 * inverse is an on-brand fill with a brand label (the primary action on a full-navy screen),
 * text-on-brand is a transparent text button in on-brand. `focus` is the keyboard focus ring:
 * focus-ring, or focus-ring-on-brand for the navy kinds.
 */
export function buttonColors(
  colors: ThemeColors,
  variant: ButtonVariant,
): { fg: string; bg: string; border: string; focus: string; on?: 'screen' | 'brand' } {
  const focus = isNavyVariant(variant) ? colors.focusRingOnBrand : colors.focusRing;
  return { ...kindColors(colors, variant), focus };
}

function kindColors(
  colors: ThemeColors,
  variant: ButtonVariant,
): { fg: string; bg: string; border: string; on?: 'screen' | 'brand' } {
  switch (variant) {
    case 'primary':
      return { fg: colors.onAccent, bg: colors.accent, border: colors.accent };
    case 'secondary':
      return { fg: colors.text, bg: colors.surface, border: colors.borderStrong };
    case 'text':
      return { fg: colors.accentText, bg: 'transparent', border: 'transparent', on: 'screen' };
    case 'destructive':
      return { fg: colors.onStatusRevoked, bg: colors.statusRevoked, border: colors.statusRevoked };
    case 'onBrand':
      return { fg: colors.onBrand, bg: colors.roleTagBg, border: 'transparent', on: 'brand' };
    case 'inverse':
      return { fg: colors.brand, bg: colors.onBrand, border: colors.onBrand, on: 'brand' };
    case 'textOnBrand':
      return { fg: colors.onBrand, bg: 'transparent', border: 'transparent', on: 'brand' };
  }
}

/** Font weights the wallet uses (the design scale uses 400, 500 and 600). */
export type Weight = '400' | '500' | '600';

/**
 * Registered font family for a weight and script (expo-font, app/_layout.tsx). Noto Sans has
 * 400 / 500 / 600; Noto Sans Sinhala is loaded at 400 and 600 (the design's per-weight names),
 * so a 500 label uses Sinhala 600.
 */
export function fontFor(weight: Weight, script: 'latin' | 'sinhala'): string {
  if (script === 'sinhala')
    return weight === '400' ? fontFamily.sinhala : fontFamily.sinhalaSemiBold;
  if (weight === '500') return fontFamily.sansMedium;
  if (weight === '600') return fontFamily.sansSemiBold;
  return fontFamily.sans;
}

/** Every font the root layout must load (the names above). */
export const FONT_NAMES = [
  fontFamily.sans,
  fontFamily.sansMedium,
  fontFamily.sansSemiBold,
  fontFamily.sinhala,
  fontFamily.sinhalaSemiBold,
] as const;

/** Font size, line height and family of a type step. Same sizes in both scripts. */
export function typeStyle(
  step: TypeStep,
  script: 'latin' | 'sinhala' = 'latin',
): { fontSize: number; lineHeight: number; fontFamily: string } {
  const token = typeScale[step];
  return {
    fontSize: token.fontSize,
    lineHeight: token.lineHeight,
    fontFamily: fontFor(token.fontWeight, script),
  };
}

export interface Theme {
  scheme: 'light' | 'dark';
  colors: ThemeColors;
  space: typeof space;
  radius: typeof radius;
}

export function getTheme(scheme: 'light' | 'dark' | null | undefined): Theme {
  const resolved = scheme === 'dark' ? 'dark' : 'light';
  return {
    scheme: resolved,
    colors: resolved === 'dark' ? darkColors : lightColors,
    space,
    radius,
  };
}
