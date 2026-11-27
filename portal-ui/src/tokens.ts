/**
 * UniVault design tokens: the ONE source of the brand values used by the web portals and the
 * mobile wallet.
 *
 * - The portals get them as Tailwind v4 theme variables: `theme.css` is GENERATED from this
 *   module (`renderThemeCss()` in `theme-css.ts`, written by `npm run build`; a test checks
 *   the committed file matches). Never edit `theme.css` by hand.
 * - The wallet (React Native) imports this module directly through
 *   `@univault/portal-ui/tokens`. It is plain data: no DOM, React, Tailwind or CSS import, so
 *   it is safe to bundle with Metro.
 *
 * Lengths are in rem (the CSS unit the portals use). React Native has no rem: convert with
 * `remToPx()` (1 rem = 16 px, the browser default; React Native then scales by the user's
 * font size where text uses `allowFontScaling`).
 */

/** Pixels per rem: the browser default root font size. */
export const ROOT_FONT_SIZE_PX = 16;

/** rem → density-independent pixels (React Native points). */
export const remToPx = (rem: number): number => rem * ROOT_FONT_SIZE_PX;

/** Brand scale: deep teal (trust). CSS: `--color-brand-<step>`. */
export const brandColors = {
  50: '#effaf8',
  100: '#d6f1ec',
  500: '#14857a',
  600: '#0f6e65',
  700: '#0d5952',
  900: '#0a3a36',
} as const;

/**
 * Semantic colours (WCAG AA contrast against their foregrounds). CSS: `--color-<kebab-name>`,
 * e.g. `mutedForeground` → `--color-muted-foreground`.
 */
export const semanticColors = {
  background: '#f7f8fa',
  foreground: '#111827',
  surface: '#ffffff',
  muted: '#eef0f3',
  mutedForeground: '#4b5563',
  border: '#d9dde3',
  ring: '#14857a',
  primary: '#0f6e65',
  primaryForeground: '#ffffff',
  accent: '#fdf3e1',
  accentForeground: '#7a4b05',
  destructive: '#b42318',
  destructiveForeground: '#ffffff',
  destructiveMuted: '#fdecea',
  info: '#1d4f91',
  infoMuted: '#e8f0fb',
  sidebar: '#0a3a36',
  sidebarForeground: '#e6f4f1',
  sidebarMuted: '#9cc9c1',
  sidebarActive: '#14857a',
} as const;

/** Font stacks (web). No CDN font: Sinhala falls through to self-hosted / system fonts. */
export const fontFamilies = {
  sans: [
    'system-ui',
    "'Segoe UI'",
    'Roboto',
    "'Helvetica Neue'",
    'Arial',
    "'Noto Sans Sinhala'",
    "'Nirmala UI'",
    "'Iskoola Pota'",
    "'Sinhala Sangam MN'",
    'sans-serif',
  ],
  mono: ['ui-monospace', "'Cascadia Code'", 'Consolas', 'monospace'],
} as const;

/** A font size with its line height, both in rem. */
export interface TextStyleToken {
  readonly size: number;
  readonly lineHeight: number;
}

/** Text styles UniVault defines itself (emitted to theme.css as `--text-<kebab-name>`). */
export const brandTextStyles = {
  pageTitle: { size: 1.5, lineHeight: 2 },
} as const satisfies Record<string, TextStyleToken>;

/**
 * The general type scale. The portals use Tailwind's default scale (`text-xs` … `text-2xl`),
 * which Tailwind already provides, so these are NOT emitted to theme.css; they are listed here
 * so the wallet uses the same steps. Values are Tailwind v4's defaults.
 */
export const typeScale = {
  xs: { size: 0.75, lineHeight: 1 },
  sm: { size: 0.875, lineHeight: 1.25 },
  base: { size: 1, lineHeight: 1.5 },
  lg: { size: 1.125, lineHeight: 1.75 },
  xl: { size: 1.25, lineHeight: 1.75 },
  '2xl': { size: 1.5, lineHeight: 2 },
} as const satisfies Record<string, TextStyleToken>;

/**
 * Sinhala script needs more line height than Latin to keep vowel signs readable
 * (a multiplier of the font size; theme.css applies it to `:lang(si)`).
 */
export const sinhalaLineHeight = 1.7;

/** Layout spacing in rem (emitted as `--spacing-<kebab-name>`). */
export const layoutSpacing = {
  sidebar: 16,
  header: 4,
  page: 1.5,
} as const;

/**
 * The spacing unit (rem). Tailwind's default `--spacing` (`p-1` = 0.25rem, `p-4` = 1rem);
 * not emitted, Tailwind provides it.
 */
export const spacingUnit = 0.25;

/** Radii in rem. `card` is emitted as `--radius-card`; the others are Tailwind's defaults. */
export const radii = {
  sm: 0.25,
  md: 0.375,
  lg: 0.5,
  card: 0.75,
  full: 9999,
} as const;

/** Radii that UniVault defines itself (emitted to theme.css). */
export const BRAND_RADII = ['card'] as const satisfies readonly (keyof typeof radii)[];

/** Everything above in one object (what the wallet's theme reads). */
export const tokens = {
  brandColors,
  semanticColors,
  fontFamilies,
  brandTextStyles,
  typeScale,
  sinhalaLineHeight,
  layoutSpacing,
  spacingUnit,
  radii,
} as const;

export type Tokens = typeof tokens;
