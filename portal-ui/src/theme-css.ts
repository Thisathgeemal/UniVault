/**
 * Renders `theme.css` (the portals' design tokens) from `tokens.ts`.
 *
 * `npm run build` writes the result to `portal-ui/theme.css` (scripts/generate-theme-css.mjs)
 * and `test/tokens.test.ts` checks the committed file equals `renderThemeCss()`, so the CSS can
 * never drift from the tokens. The output is already in Prettier's format (100 columns), so
 * `npm run format:check` passes without rewriting it.
 *
 * Two layers:
 * - `:root` holds every colour under its design-system name (`--brand`, `--text-muted`,
 *   `--status-valid-bg`): what docs/design/design-system.md calls `var(--brand)`.
 * - `@theme inline` maps them to Tailwind v4's colour namespace, so the utilities carry the
 *   same names (`bg-brand`, `text-text-muted`, `bg-status-valid-bg`, `ring-focus-ring`).
 * - `@theme` defines the fonts (`--font-sans`), type scale (`text-body`, `text-h1`…), radii
 *   (`--radius-md`, `rounded-pill`) and layout lengths (`w-sidebar`, `h-header`, `p-page`).
 * The portals are light-only, so only the light colours are emitted.
 */
import { fontFamily, layout, lightColors, pxToRem, radius, typeScale } from './tokens.js';

const PRINT_WIDTH = 100;

/** camelCase → kebab-case (`surfaceSunken` → `surface-sunken`, `bodySm` → `body-sm`). */
export const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const rem = (px: number): string => `${pxToRem(px)}rem`;

/** One declaration; a long list value wraps the way Prettier does (fill, 4-space indent). */
export function declaration(name: string, value: string | readonly string[]): string {
  const items = typeof value === 'string' ? [value] : value;
  const oneLine = `  --${name}: ${items.join(', ')};`;
  if (oneLine.length <= PRINT_WIDTH) return oneLine;

  const lines: string[] = [];
  let line = '';
  items.forEach((item, index) => {
    const piece = `${item}${index === items.length - 1 ? ';' : ','}`;
    if (line === '') line = `    ${piece}`;
    else if (`${line} ${piece}`.length <= PRINT_WIDTH) line = `${line} ${piece}`;
    else {
      lines.push(line);
      line = `    ${piece}`;
    }
  });
  lines.push(line);
  return [`  --${name}:`, ...lines].join('\n');
}

/** A font stack written the way Prettier formats CSS (single quotes). */
const stack = (value: string): string[] => value.split(/,\s*/).map((f) => f.replace(/"/g, "'"));

/** Colour values as Prettier writes them in CSS (lower-case hex; rgba spaced). */
const cssColour = (value: string): string =>
  value.startsWith('#') ? value.toLowerCase() : value.replace(/,\s*/g, ', ');

const HEADER = `/*
 * UniVault design tokens for the portals ("Navy and azure", light theme).
 *
 * GENERATED from src/tokens.ts by \`npm run build\` (scripts/generate-theme-css.mjs): do not edit
 * this file by hand; change the tokens and rebuild. test/tokens.test.ts checks the two match.
 * Rules: docs/design/design-system.md.
 *
 * Import AFTER Tailwind in the portal's stylesheet, and let Tailwind scan this package:
 *
 *   @import 'tailwindcss';
 *   @import '@univault/portal-ui/theme.css';
 *   @source '../../portal-ui/src';
 *   @source not '../../portal-ui/src/tokens.ts';
 *   @source not '../../portal-ui/src/theme-css.ts';
 *
 * Every colour is a CSS variable with its design-system name (var(--brand)) and a Tailwind
 * utility with the same name (bg-brand, text-text-muted, border-border-strong,
 * ring-focus-ring). Never write a colour value in a component.
 *
 * Fonts: Noto Sans, Noto Sans Sinhala and JetBrains Mono are self-hosted by the portal
 * (@fontsource packages): the Content-Security-Policy allows font-src 'self' only, no CDN.
 */`;

/** The full text of theme.css. */
export function renderThemeCss(): string {
  const root: string[] = ['  /* Colours (design-system names) */'];
  for (const [name, value] of Object.entries(lightColors)) {
    root.push(declaration(kebab(name), cssColour(value)));
  }

  const theme: string[] = [
    '  /* Tailwind utilities with the same names: bg-brand, text-text-muted … */',
  ];
  for (const name of Object.keys(lightColors)) {
    theme.push(declaration(`color-${kebab(name)}`, `var(--${kebab(name)})`));
  }

  const scale: string[] = ['  /* Fonts */'];
  scale.push(declaration('font-sans', stack(fontFamily.webStack)));
  scale.push(declaration('font-mono', stack(fontFamily.webMono)));

  scale.push('', '  /* Type scale: text-display, text-h1 … text-caption, text-mono */');
  for (const [name, style] of Object.entries(typeScale)) {
    scale.push(declaration(`text-${kebab(name)}`, rem(style.fontSize)));
    scale.push(declaration(`text-${kebab(name)}--line-height`, rem(style.lineHeight)));
    scale.push(declaration(`text-${kebab(name)}--font-weight`, style.fontWeight));
  }

  scale.push(
    '',
    '  /* Radius: rounded-sm (inputs, badges), -md (buttons, cards), -lg, -pill (tags) */',
  );
  for (const [name, px] of Object.entries(radius)) {
    scale.push(declaration(`radius-${name}`, name === 'pill' ? `${px}px` : rem(px)));
  }

  scale.push('', '  /* Layout: w-sidebar, h-header, p-page */');
  for (const [name, px] of Object.entries(layout)) {
    scale.push(declaration(`spacing-${name}`, rem(px)));
  }

  return [
    HEADER,
    ':root {',
    ...root,
    '}',
    '',
    '@theme inline {',
    ...theme,
    '}',
    '',
    '@theme {',
    ...scale,
    '}',
    '',
  ].join('\n');
}
