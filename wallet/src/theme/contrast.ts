/**
 * WCAG 2.2 contrast (success criteria 1.4.3 and 1.4.11) for every colour pair the design system
 * and the wallet's components use.
 *
 * - `DESIGN_PAIRS`: every pairing docs/design/design-system.md uses, by token name. They apply to
 *   the portals (light) and the wallet (light and dark), so test/contrast.test.ts checks them in
 *   BOTH themes.
 * - `colorPairs(colors)` adds the wallet components' own pairs, built from the same functions the
 *   components call (toneColors, buttonColors), so a new tone or button kind is checked
 *   automatically.
 * Thresholds: 4.5:1 normal text; 3:1 large text, icons, input borders and the focus ring.
 * Translucent colours (role-tag-bg) are composited over what they sit on (brand).
 * Rule (design system): a status icon never sits directly on navy; it is always in its badge pill.
 */
import {
  componentTokens,
  STATUS_SETS,
  statusTokens,
  type ColorToken,
} from '@univault/portal-ui/tokens';
import { BUTTON_VARIANTS, buttonColors, toneColors, TONES, type ThemeColors } from './index';

type Rgb = [number, number, number];

/** Parses #rrggbb or rgba(r, g, b, a); a translucent colour is composited over `under`. */
export function parseColour(value: string, under?: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex?.[1]) {
    const v = hex[1];
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const rgba = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/i.exec(value);
  if (rgba) {
    const [r, g, b, a] = rgba.slice(1).map(Number) as [number, number, number, number];
    if (a < 1 && !under) throw new Error(`Translucent colour needs a background: ${value}`);
    const base = under ? parseColour(under) : ([0, 0, 0] as Rgb);
    return [r, g, b].map((c, i) => (c / 255) * a + base[i]! * (1 - a)) as Rgb;
  }
  throw new Error(`Not a #rrggbb or rgba() colour: ${value}`);
}

/** Relative luminance (WCAG definition). */
export function luminance(value: string, under?: string): number {
  const [r, g, b] = parseColour(value, under).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio (1 to 21); `under` composites a translucent background. */
export function contrastRatio(fg: string, bg: string, under?: string): number {
  const [light, dark] = [luminance(fg), luminance(bg, under)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** text = normal text (4.5); large = large text; icon / border / focus = 3. */
export type PairKind = 'text' | 'large' | 'icon' | 'border' | 'focus';
export const minimumRatio = (kind: PairKind): number => (kind === 'text' ? 4.5 : 3);

/** A pairing by token name. `under` = what a translucent `bg` sits on. */
export interface TokenPair {
  use: string;
  fg: ColorToken;
  bg: ColorToken;
  under?: ColorToken;
  kind: PairKind;
  /**
   * Only for pairs used in the light theme alone (the portals). Dark fails one source pair:
   * text-subtle on brand-soft is 4.04:1, so in the wallet, text on brand-soft is text-muted
   * (5.77:1; see docs/design/design-system.md, Accessibility).
   */
  lightOnly?: true;
}

const SURFACES = ['bg', 'surface', 'surfaceSunken'] as const;

/** Every pairing the design system uses (both themes). */
export const DESIGN_PAIRS: readonly TokenPair[] = [
  // Neutral ground: body, supporting and subtle text (incl. placeholders in input fills)
  ...SURFACES.flatMap((bg): TokenPair[] => [
    { use: `text on ${bg}`, fg: 'text', bg, kind: 'text' },
    { use: `text-muted on ${bg}`, fg: 'textMuted', bg, kind: 'text' },
    { use: `text-subtle on ${bg}`, fg: 'textSubtle', bg, kind: 'text' },
    { use: `accent-text (links) on ${bg}`, fg: 'accentText', bg, kind: 'text' },
    { use: `focus-ring on ${bg}`, fg: 'focusRing', bg, kind: 'focus' },
    { use: `border-strong (inputs) on ${bg}`, fg: 'borderStrong', bg, kind: 'border' },
  ]),
  // brand-soft: selected rows, filter chips, info banners, the disclosure panel
  { use: 'text on brand-soft', fg: 'text', bg: 'brandSoft', kind: 'text' },
  { use: 'text-muted on brand-soft', fg: 'textMuted', bg: 'brandSoft', kind: 'text' },
  {
    use: 'text-subtle on brand-soft (portal selected rows; light only)',
    fg: 'textSubtle',
    bg: 'brandSoft',
    kind: 'text',
    lightOnly: true,
  },
  {
    use: 'accent-text-on-soft on brand-soft',
    fg: 'accentTextOnSoft',
    bg: 'brandSoft',
    kind: 'text',
  },
  { use: 'focus-ring on brand-soft', fg: 'focusRing', bg: 'brandSoft', kind: 'focus' },
  // The navy frame: sidebar, top bar, wallet header, credential cards
  { use: 'on-brand on brand', fg: 'onBrand', bg: 'brand', kind: 'text' },
  { use: 'on-brand on brand-hover (active nav)', fg: 'onBrand', bg: 'brandHover', kind: 'text' },
  { use: 'on-brand-muted on brand', fg: 'onBrandMuted', bg: 'brand', kind: 'text' },
  { use: 'on-brand-muted on brand-hover', fg: 'onBrandMuted', bg: 'brandHover', kind: 'text' },
  {
    use: 'on-brand on role-tag-bg (role tag, on-brand buttons)',
    fg: 'onBrand',
    bg: 'roleTagBg',
    under: 'brand',
    kind: 'text',
  },
  { use: 'focus-ring-on-brand on brand', fg: 'focusRingOnBrand', bg: 'brand', kind: 'focus' },
  {
    use: 'focus-ring-on-brand on brand-hover',
    fg: 'focusRingOnBrand',
    bg: 'brandHover',
    kind: 'focus',
  },
  // Accent: the primary button, the selected tab
  { use: 'on-accent on accent', fg: 'onAccent', bg: 'accent', kind: 'text' },
  { use: 'on-accent on accent-hover', fg: 'onAccent', bg: 'accentHover', kind: 'text' },
  { use: 'accent (selected tab label) on surface', fg: 'accent', bg: 'surface', kind: 'text' },
  // Destructive button
  {
    use: 'on-status-revoked on status-revoked',
    fg: 'onStatusRevoked',
    bg: 'statusRevoked',
    kind: 'text',
  },
  // Status: badge text on its pill, icon on its pill, icon on bg / surface (lists, panels),
  // revoked text on surface (form errors)
  ...STATUS_SETS.flatMap((set): TokenPair[] => {
    const t = statusTokens[set];
    return [
      { use: `${set} badge text`, fg: t.text, bg: t.bg, kind: 'text' },
      { use: `${set} icon in its pill`, fg: t.icon, bg: t.bg, kind: 'icon' },
      { use: `${set} icon on surface`, fg: t.icon, bg: 'surface', kind: 'icon' },
      { use: `${set} icon on bg`, fg: t.icon, bg: 'bg', kind: 'icon' },
    ];
  }),
  {
    use: 'status-revoked text (errors) on surface',
    fg: 'statusRevoked',
    bg: 'surface',
    kind: 'text',
  },
  { use: 'status-revoked text (errors) on bg', fg: 'statusRevoked', bg: 'bg', kind: 'text' },
  // Component token sets
  {
    use: 'offline notice text',
    fg: componentTokens.offlineNotice.text,
    bg: componentTokens.offlineNotice.bg,
    kind: 'text',
  },
  {
    use: 'offline notice icon',
    fg: componentTokens.offlineNotice.icon,
    bg: componentTokens.offlineNotice.bg,
    kind: 'icon',
  },
  {
    use: 'disclosure panel title',
    fg: componentTokens.disclosurePanel.title,
    bg: componentTokens.disclosurePanel.bg,
    kind: 'text',
  },
  {
    use: 'disclosure panel body',
    fg: componentTokens.disclosurePanel.body,
    bg: componentTokens.disclosurePanel.bg,
    kind: 'text',
  },
  {
    use: 'disclosure panel link',
    fg: componentTokens.disclosurePanel.link,
    bg: componentTokens.disclosurePanel.bg,
    kind: 'text',
  },
];

export interface ColorPair {
  /** Where it is used, for the test report. */
  use: string;
  fg: string;
  bg: string;
  under?: string;
  kind: PairKind;
}

const resolve = (c: ThemeColors, p: TokenPair): ColorPair => ({
  use: p.use,
  fg: c[p.fg],
  bg: c[p.bg],
  ...(p.under ? { under: c[p.under] } : {}),
  kind: p.kind,
});

/** Design pairs + the wallet components' pairs, for one colour scheme. */
export function colorPairs(c: ThemeColors, scheme: 'light' | 'dark'): ColorPair[] {
  const pairs: ColorPair[] = DESIGN_PAIRS.filter((p) => scheme === 'light' || !p.lightOnly).map(
    (p) => resolve(c, p),
  );

  // Badges (status sets and neutral) and their icons
  for (const tone of TONES) {
    const { fg, bg } = toneColors(c, tone);
    pairs.push({ use: `badge ${tone}`, fg, bg, kind: 'text' });
  }

  // Buttons: label (and spinner) on the button; text buttons sit on bg or surface
  for (const variant of BUTTON_VARIANTS) {
    const b = buttonColors(c, variant);
    if (b.on === 'screen') {
      for (const name of ['bg', 'surface'] as const) {
        pairs.push({ use: `${variant} button on ${name}`, fg: b.fg, bg: c[name], kind: 'text' });
      }
    } else if (b.on === 'brand') {
      pairs.push({ use: `${variant} button`, fg: b.fg, bg: b.bg, under: c.brand, kind: 'text' });
    } else {
      pairs.push({ use: `${variant} button`, fg: b.fg, bg: b.bg, kind: 'text' });
    }
  }

  pairs.push(
    // Tab bar: active tab icon and label in accent, inactive text-muted, on surface
    { use: 'inactive tab on surface', fg: c.textMuted, bg: c.surface, kind: 'text' },
    // Decorative state and list icons in text-muted (navy would vanish on dark surfaces)
    { use: 'state icon on surface-sunken', fg: c.textMuted, bg: c.surfaceSunken, kind: 'icon' },
    { use: 'list icon on surface', fg: c.textMuted, bg: c.surface, kind: 'icon' },
    { use: 'error state icon', fg: c.statusRevoked, bg: c.statusRevokedBg, kind: 'icon' },
    // CredentialCard: issuer avatar initial on role-tag-bg over brand
    { use: 'avatar initial', fg: c.onBrand, bg: c.roleTagBg, under: c.brand, kind: 'text' },
    // Toast: inverted (text colour as the background)
    { use: 'toast', fg: c.bg, bg: c.text, kind: 'text' },
    // Onboarding (src/onboarding): illustration lines on the navy panel and on its fills, role
    // labels under the drawing, progress dots on the footer, the "I understand" checkbox
    { use: 'illustration line on brand', fg: c.onBrand, bg: c.brand, kind: 'icon' },
    { use: 'illustration detail on brand', fg: c.onBrandMuted, bg: c.brand, kind: 'icon' },
    { use: 'illustration line on brand-hover fill', fg: c.onBrand, bg: c.brandHover, kind: 'icon' },
    {
      use: 'illustration line on role-tag-bg fill',
      fg: c.onBrand,
      bg: c.roleTagBg,
      under: c.brand,
      kind: 'icon',
    },
    { use: 'illustration label on brand', fg: c.onBrand, bg: c.brand, kind: 'text' },
    { use: 'progress dot (done) on surface', fg: c.accent, bg: c.surface, kind: 'icon' },
    { use: 'progress dot (to do) on surface', fg: c.borderStrong, bg: c.surface, kind: 'border' },
    { use: 'checkbox on bg', fg: c.accentText, bg: c.bg, kind: 'icon' },
    { use: 'point icon on bg', fg: c.textMuted, bg: c.bg, kind: 'icon' },
  );
  return pairs;
}

/** True if a pair puts a status colour straight on navy (forbidden: badges use their pill). */
export const statusOnNavy = (p: TokenPair): boolean =>
  /^status/.test(p.fg) && (p.bg === 'brand' || p.bg === 'brandHover' || p.under === 'brand');
