/**
 * UniVault design tokens ("Navy and azure"): the ONE place where UniVault's colours, fonts, type
 * scale, spacing and radii are written down. The rules for using them are in
 * docs/design/design-system.md; this file holds the values.
 *
 * - The portals get them as CSS variables named like the design system (`var(--brand)`,
 *   `var(--text-muted)`) plus Tailwind v4 utilities (`bg-brand`, `text-text-muted`): `theme.css`
 *   is GENERATED from this module (`renderThemeCss()` in `theme-css.ts`, written by
 *   `npm run build`; a test checks the committed file matches). Never edit `theme.css` by hand.
 * - The wallet (React Native) imports this module directly through
 *   `@univault/portal-ui/tokens` and uses the same names as theme keys (camelCase), with a
 *   light and a dark set. It is plain data: no DOM, React, Tailwind or CSS import, so it is safe
 *   to bundle with Metro and to load with Node's type stripping.
 *
 * Lengths are in px (density-independent points in React Native); theme.css converts font
 * sizes and layout lengths to rem so the portals respect the browser's text size.
 *
 * This is the only file (with the generated theme.css) allowed to contain a hex colour.
 */

/** Pixels per rem: the browser default root font size. */
export const ROOT_FONT_SIZE_PX = 16;

/** px → rem (the CSS unit the portals use for text and layout). */
export const pxToRem = (px: number): number => px / ROOT_FONT_SIZE_PX;

/** Colours of the light theme (portals always; wallet when the phone is in light mode). */
const lightBase = {
  bg: '#F5F7FA', // Page and screen background in all three apps
  surface: '#FFFFFF', // Cards, tables, forms, modals and the wallet's bottom tab bar, on bg
  surfaceSunken: '#EEF2F7', // Input fills, table header rows, empty states, read-only fields
  border: '#E2E8F0', // Hairline dividers between rows and around cards
  borderStrong: '#7C8BA1', // Input and checkbox borders; secondary button edge
  brand: '#0B2545', // Portal sidebar and top bar, wallet header, credential cards
  brandHover: '#133A66', // Hover / pressed / active state of items on brand
  brandSoft: '#E6ECF5', // Selected table row, active filter chip, info banners, disclosure panel
  onBrand: '#FFFFFF', // Text and icons on brand
  onBrandMuted: '#B9C7DC', // Secondary text on brand (issuer and expiry on a card, section labels)
  roleTagBg: 'rgba(255,255,255,0.12)', // Role tag and on-brand buttons, on brand only
  accent: '#2563EB', // Fill of the one primary button per screen; selected tab
  accentHover: '#1D4ED8', // Hover and pressed fill of a primary button
  onAccent: '#FFFFFF', // Label on an accent button
  accentText: '#2563EB', // Links and text buttons on bg or surface
  focusRing: '#2563EB', // 2px focus ring with a 2px gap, outside navy areas
  text: '#0F172A', // Body text and headings on bg, surface and surface-sunken
  textMuted: '#475569', // Supporting text, table metadata, helper text under fields
  // Placeholders, timestamps and captions only. Was #64748B in the source palette (4.43:1 on bg,
  // 4.23:1 on surface-sunken, 4.01:1 on brand-soft: below AA); darkened on 27 Nov 2026.
  textSubtle: '#5B6B80',
  statusValid: '#15803D', // Credential valid, verification passed
  statusValidBg: '#DCFCE7', // Valid badge and success banner background
  statusValidText: '#14532D', // Text on status-valid-bg
  statusExpired: '#B45309', // Credential expired, stale status warning, offline notice
  statusExpiredBg: '#FEF3C7', // Expired badge, warning and offline banner background
  statusExpiredText: '#78350F', // Text on status-expired-bg
  statusRevoked: '#B91C1C', // Revoked, verification failed, anomaly; destructive button fill
  statusRevokedBg: '#FEE2E2', // Revoked badge and error banner background
  statusRevokedText: '#7F1D1D', // Text on status-revoked-bg
  onStatusRevoked: '#FFFFFF', // Label on a solid status-revoked (destructive) button
  statusPending: '#475569', // Pending (offer not yet redeemed), replaced, checking
  statusPendingBg: '#E2E8F0', // Pending badge background
  statusPendingText: '#1E293B', // Text on status-pending-bg
} as const;

/** Colours of the dark theme (wallet only: the portals are light-only). Same names. */
const darkBase = {
  bg: '#0A1628',
  surface: '#111F36',
  surfaceSunken: '#0D1A2E',
  border: '#24344F',
  borderStrong: '#5A6F93',
  brand: '#16335C',
  brandHover: '#1D4070',
  brandSoft: '#1A2E4D',
  onBrand: '#E8EEF7',
  onBrandMuted: '#A9BAD3',
  roleTagBg: 'rgba(255,255,255,0.12)',
  accent: '#60A5FA',
  accentHover: '#93C5FD',
  onAccent: '#0A1628',
  accentText: '#7DB3FF',
  focusRing: '#7DB3FF',
  text: '#E8EEF7',
  textMuted: '#9AAAC2',
  textSubtle: '#7D8DA6',
  statusValid: '#4ADE80',
  statusValidBg: '#0F2E1F',
  statusValidText: '#86EFAC',
  statusExpired: '#FBBF24',
  statusExpiredBg: '#33260A',
  statusExpiredText: '#FCD34D',
  statusRevoked: '#F87171',
  statusRevokedBg: '#3A1418',
  statusRevokedText: '#FCA5A5',
  onStatusRevoked: '#0A1628',
  statusPending: '#94A3B8',
  statusPendingBg: '#1E293B',
  statusPendingText: '#CBD5E1',
} as const satisfies Record<keyof typeof lightBase, string>;

/**
 * Usage tokens: a named colour for one situation, defined as another token, so components never
 * pick these ad hoc (27 Nov 2026 contrast fixes; docs/design/design-system.md, Accessibility).
 */
const usage = <C extends typeof lightBase | typeof darkBase>(c: C) => ({
  /** Focus ring inside navy areas (sidebar, top bar, credential cards, brand / brand-hover). */
  focusRingOnBrand: c.onBrand,
  /** Links and text buttons on brand-soft (selected table rows, brand-soft panels). */
  accentTextOnSoft: c.accentHover,
});

export const lightColors = { ...lightBase, ...usage(lightBase) };
export const darkColors = { ...darkBase, ...usage(darkBase) };

/** A colour token name (camelCase; kebab-case in CSS: `surfaceSunken` → `--surface-sunken`). */
export type ColorToken = keyof typeof lightColors;
export type ThemeColors = Record<ColorToken, string>;

export const themes = { light: lightColors, dark: darkColors } as const;

/** The four status colour sets. They mean these statuses and nothing else. */
export const STATUS_SETS = ['valid', 'expired', 'revoked', 'pending'] as const;
export type StatusSet = (typeof STATUS_SETS)[number];

/** Token names of each status set: icon colour, badge background, badge text. */
export const statusTokens: Record<
  StatusSet,
  { icon: ColorToken; bg: ColorToken; text: ColorToken }
> = {
  valid: { icon: 'statusValid', bg: 'statusValidBg', text: 'statusValidText' },
  expired: { icon: 'statusExpired', bg: 'statusExpiredBg', text: 'statusExpiredText' },
  revoked: { icon: 'statusRevoked', bg: 'statusRevokedBg', text: 'statusRevokedText' },
  pending: { icon: 'statusPending', bg: 'statusPendingBg', text: 'statusPendingText' },
};

/**
 * Component token sets (token names, not values), so a component and the contrast test read the
 * same pairs.
 */
export const componentTokens = {
  /** Offline / stale-status notice (wallet): the expired colours (design rule: stale = expired). */
  offlineNotice: { bg: 'statusExpiredBg', text: 'statusExpiredText', icon: 'statusExpired' },
  /** Disclosure screen's verifier panel (wallet, later task): brand-soft panel. */
  disclosurePanel: {
    bg: 'brandSoft',
    title: 'text',
    body: 'textMuted',
    link: 'accentTextOnSoft',
    border: 'border',
  },
} as const satisfies Record<string, Record<string, ColorToken>>;

/** Spacing on a 4 px base: `space-1` 4 … `space-8` 32. */
export const spacing = { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 } as const;

/** Radii: sm inputs and badges, md buttons and portal cards, lg wallet credential cards. */
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/** Portal layout lengths (px): sidebar width, top bar height, page padding. */
export const layout = { sidebar: 240, header: 64, page: 24 } as const;

/** Font families. Web stacks for the portals; registered font names for the wallet (Expo). */
export const fontFamily = {
  sans: 'NotoSans_400Regular',
  sansMedium: 'NotoSans_500Medium',
  sansSemiBold: 'NotoSans_600SemiBold',
  sinhala: 'NotoSansSinhala_400Regular',
  sinhalaSemiBold: 'NotoSansSinhala_600SemiBold',
  webStack: '"Noto Sans", "Noto Sans Sinhala", system-ui, sans-serif',
  webMono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** One step of the type scale (px; weight as a CSS / React Native weight string). */
export interface TypeStyleToken {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly fontWeight: '400' | '500' | '600';
}

/**
 * Type scale. Line heights are generous on purpose (26 for 16 body): Sinhala vowel signs above
 * and below the line need the room, and both scripts use the same sizes.
 */
export const typeScale = {
  display: { fontSize: 32, lineHeight: 40, fontWeight: '600' },
  h1: { fontSize: 24, lineHeight: 32, fontWeight: '600' },
  h2: { fontSize: 20, lineHeight: 28, fontWeight: '600' },
  h3: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 26, fontWeight: '400' },
  bodySm: { fontSize: 14, lineHeight: 22, fontWeight: '400' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 18, fontWeight: '400' },
  mono: { fontSize: 13, lineHeight: 20, fontWeight: '400' },
} as const satisfies Record<string, TypeStyleToken>;

export type TypeStep = keyof typeof typeScale;

/** Minimum button heights (px): touch targets in the wallet, pointer targets in the portals. */
export const minButtonHeight = { wallet: 44, portal: 40 } as const;

/** Everything above in one object. */
export const tokens = {
  lightColors,
  darkColors,
  statusTokens,
  componentTokens,
  spacing,
  radius,
  layout,
  fontFamily,
  typeScale,
  minButtonHeight,
} as const;

export type Tokens = typeof tokens;
