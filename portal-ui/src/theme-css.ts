/**
 * Renders `theme.css` (the portals' Tailwind v4 theme variables) from `tokens.ts`.
 *
 * `npm run build` writes the result to `portal-ui/theme.css` (scripts/generate-theme-css.mjs)
 * and `test/tokens.test.ts` checks the committed file equals `renderThemeCss()`, so the CSS
 * can never drift from the tokens. The output is already in Prettier's format (100 columns),
 * so `npm run format:check` passes without rewriting it.
 */
import {
  BRAND_RADII,
  brandColors,
  brandTextStyles,
  fontFamilies,
  layoutSpacing,
  radii,
  semanticColors,
  sinhalaLineHeight,
} from './tokens.js';

const PRINT_WIDTH = 100;

/** camelCase → kebab-case (`mutedForeground` → `muted-foreground`). */
export const kebab = (name: string): string => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

const rem = (value: number): string => `${value}rem`;

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

const HEADER = `/*
 * UniVault portal design tokens (Tailwind CSS v4 theme variables).
 *
 * GENERATED from src/tokens.ts by \`npm run build\` (scripts/generate-theme-css.mjs): do not edit
 * this file by hand; change the tokens and rebuild. test/tokens.test.ts checks the two match.
 *
 * Import AFTER Tailwind in the portal's stylesheet, and let Tailwind scan this package:
 *
 *   @import 'tailwindcss';
 *   @import '@univault/portal-ui/theme.css';
 *   @source '../../portal-ui/src';
 *   @source not '../../portal-ui/src/tokens.ts';
 *   @source not '../../portal-ui/src/theme-css.ts';
 *
 * Every token becomes a CSS variable (e.g. --color-primary) and a utility (bg-primary,
 * text-muted-foreground, w-sidebar, h-header). Components in this package use the semantic
 * names only, so a portal can re-brand by overriding the variables.
 *
 * Fonts: no font is downloaded from a CDN (the portals' Content-Security-Policy allows
 * font-src 'self' only). Latin text uses the system UI font; Sinhala glyphs fall through to
 * "Noto Sans Sinhala" (self-hosted by the portal, e.g. @fontsource/noto-sans-sinhala) and then
 * to the Sinhala fonts that ship with Windows (Nirmala UI, Iskoola Pota) and Android/macOS.
 */`;

/** The full text of theme.css. */
export function renderThemeCss(): string {
  const body: string[] = [];

  body.push('  /* Brand: deep teal (trust) with an amber accent */');
  for (const [step, value] of Object.entries(brandColors)) {
    body.push(declaration(`color-brand-${step}`, value));
  }

  body.push('', '  /* Semantic colours (WCAG AA contrast against their foregrounds) */');
  for (const [name, value] of Object.entries(semanticColors)) {
    body.push(declaration(`color-${kebab(name)}`, value));
  }

  body.push('', '  /* Typography */');
  for (const [name, stack] of Object.entries(fontFamilies)) {
    body.push(declaration(`font-${kebab(name)}`, stack));
  }
  for (const [name, style] of Object.entries(brandTextStyles)) {
    body.push(declaration(`text-${kebab(name)}`, rem(style.size)));
    body.push(declaration(`text-${kebab(name)}--line-height`, rem(style.lineHeight)));
  }

  body.push('', '  /* Layout spacing */');
  for (const [name, value] of Object.entries(layoutSpacing)) {
    body.push(declaration(`spacing-${kebab(name)}`, rem(value)));
  }

  body.push('');
  for (const name of BRAND_RADII) {
    body.push(declaration(`radius-${kebab(name)}`, rem(radii[name])));
  }

  return [
    HEADER,
    '@theme {',
    ...body,
    '}',
    '',
    '/* Sinhala script needs more line height than Latin to keep vowel signs readable */',
    ':lang(si) {',
    `  line-height: ${sinhalaLineHeight};`,
    '}',
    '',
  ].join('\n');
}
