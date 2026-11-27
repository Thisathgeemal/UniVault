/**
 * Design tokens: src/tokens.ts is the single source. theme.css (the portals) is generated from
 * it and must match the committed file; the module itself must stay plain data so the React
 * Native wallet can bundle it.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaration, kebab, renderThemeCss } from '../src/theme-css.js';
import * as tokens from '../src/tokens.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('design tokens', () => {
  it('theme.css is exactly what renderThemeCss() generates from tokens.ts', () => {
    // If this fails: run `npm run build` in portal-ui (it regenerates theme.css). Never edit
    // theme.css by hand.
    expect(read('../theme.css')).toBe(renderThemeCss());
  });

  it('emits every brand colour, semantic colour, font, text style, spacing and card radius', () => {
    const css = renderThemeCss();
    for (const [step, value] of Object.entries(tokens.brandColors)) {
      expect(css).toContain(`--color-brand-${step}: ${value};`);
    }
    for (const [name, value] of Object.entries(tokens.semanticColors)) {
      expect(css).toContain(`--color-${kebab(name)}: ${value};`);
    }
    expect(css).toContain('--color-muted-foreground: #4b5563;');
    expect(css).toContain('--text-page-title: 1.5rem;');
    expect(css).toContain('--text-page-title--line-height: 2rem;');
    expect(css).toContain('--spacing-sidebar: 16rem;');
    expect(css).toContain('--radius-card: 0.75rem;');
    expect(css).toContain('--font-mono: ui-monospace, ');
    expect(css).toContain(`line-height: ${tokens.sinhalaLineHeight};`);
    // Tailwind's own scales are listed for the wallet but not re-declared for the portals
    expect(css).not.toContain('--text-base');
    expect(css).not.toContain('--radius-md');
  });

  it('wraps a long list value the way Prettier does and keeps short ones on one line', () => {
    expect(declaration('x', 'red')).toBe('  --x: red;');
    const long = Array.from({ length: 12 }, (_, i) => `'Font Number ${i}'`);
    const lines = declaration('font-long', long).split('\n');
    expect(lines[0]).toBe('  --font-long:');
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(100);
    for (const line of lines.slice(1)) expect(line.startsWith('    ')).toBe(true);
    expect(lines.at(-1)?.endsWith(`'Font Number 11';`)).toBe(true);
  });

  it('converts rem to React Native points at 16 px per rem', () => {
    expect(tokens.remToPx(1)).toBe(16);
    expect(tokens.remToPx(tokens.radii.card)).toBe(12);
    expect(tokens.tokens.typeScale.base).toEqual({ size: 1, lineHeight: 1.5 });
  });

  it('tokens.ts is plain data: no imports, no DOM access, no CSS (safe for React Native)', () => {
    const source = read('../src/tokens.ts');
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toMatch(/\brequire\(|\b(document|window)\.|\.css['"]/);
  });

  it('is published as @univault/portal-ui/tokens', () => {
    const pkg = JSON.parse(read('../package.json')) as { exports: Record<string, unknown> };
    expect(pkg.exports['./tokens']).toEqual({
      types: './dist/tokens.d.ts',
      default: './dist/tokens.js',
    });
  });
});
