/**
 * Design tokens ("Navy and azure"): src/tokens.ts is the single source. theme.css (the portals)
 * is generated from it and must match the committed file; every token reaches the CSS under its
 * design-system name; the module stays plain data so the React Native wallet can bundle it; and
 * no component anywhere writes a hex colour.
 */
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { declaration, kebab, renderThemeCss } from '../src/theme-css.js';
import * as tokens from '../src/tokens.js';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
// vitest runs in portal-ui/ (npm test); the repository root is one level up
const REPO = join(process.cwd(), '..');

describe('theme.css is generated from tokens.ts', () => {
  it('theme.css is exactly what renderThemeCss() generates', () => {
    // If this fails: run `npm run build` in portal-ui (it regenerates theme.css). Never edit
    // theme.css by hand. This replaces the old "issuer portal CSS byte-identical" check: the
    // portal CSS changes whenever a token does, and that is intended.
    expect(read('../theme.css')).toBe(renderThemeCss());
  });

  it('every light colour is a :root variable with its design-system name and a utility', () => {
    const css = renderThemeCss();
    const root = css.slice(css.indexOf(':root {'), css.indexOf('@theme inline'));
    for (const [name, value] of Object.entries(tokens.lightColors)) {
      const expected = value.startsWith('#') ? value.toLowerCase() : value.replace(/,\s*/g, ', ');
      expect(root).toContain(`--${kebab(name)}: ${expected};`);
      expect(css).toContain(`--color-${kebab(name)}: var(--${kebab(name)});`);
    }
    expect(root).toContain('--brand: #0b2545;');
    expect(root).toContain('--surface-sunken: #eef2f7;');
    expect(root).toContain('--role-tag-bg: rgba(255, 255, 255, 0.12);');
    // the portals are light-only: no dark values in theme.css
    expect(css).not.toContain(tokens.darkColors.bg.toLowerCase());
  });

  it('emits the fonts, type scale with line heights and weights, radii and layout', () => {
    const css = renderThemeCss();
    expect(css).toContain("--font-sans: 'Noto Sans', 'Noto Sans Sinhala', system-ui, sans-serif;");
    expect(css).toContain("--font-mono: 'JetBrains Mono', ui-monospace, monospace;");
    expect(css).toContain('--text-body: 1rem;');
    expect(css).toContain('--text-body--line-height: 1.625rem;'); // 26 px for 16 px body
    expect(css).toContain('--text-body-sm: 0.875rem;');
    expect(css).toContain('--text-display: 2rem;');
    expect(css).toContain('--text-label--font-weight: 500;');
    expect(css).toContain('--radius-sm: 0.375rem;');
    expect(css).toContain('--radius-md: 0.625rem;');
    expect(css).toContain('--radius-lg: 1rem;');
    expect(css).toContain('--radius-pill: 999px;');
    expect(css).toContain('--spacing-sidebar: 15rem;'); // 240 px
    expect(css).toContain('--spacing-header: 4rem;');
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
});

describe('token values', () => {
  it('light and dark have the same names', () => {
    expect(Object.keys(tokens.darkColors).sort()).toEqual(Object.keys(tokens.lightColors).sort());
  });

  it('usage tokens are defined as other tokens (27 Nov 2026 contrast fixes)', () => {
    for (const c of [tokens.lightColors, tokens.darkColors]) {
      expect(c.focusRingOnBrand).toBe(c.onBrand);
      expect(c.accentTextOnSoft).toBe(c.accentHover);
    }
    expect(tokens.lightColors.accentTextOnSoft).toBe('#1D4ED8');
    expect(tokens.lightColors.textSubtle).toBe('#5B6B80'); // was #64748B
    expect(tokens.darkColors.textSubtle).toBe('#7D8DA6'); // dark unchanged
  });

  it('four status sets, each with icon, badge background and badge text tokens', () => {
    expect(tokens.STATUS_SETS).toEqual(['valid', 'expired', 'revoked', 'pending']);
    for (const set of tokens.STATUS_SETS) {
      const t = tokens.statusTokens[set];
      const cap = set[0]!.toUpperCase() + set.slice(1);
      expect(t).toEqual({ icon: `status${cap}`, bg: `status${cap}Bg`, text: `status${cap}Text` });
    }
  });

  it('component token sets name existing colour tokens', () => {
    for (const set of Object.values(tokens.componentTokens)) {
      for (const name of Object.values(set)) expect(tokens.lightColors).toHaveProperty(name);
    }
  });

  it('spacing, radius and type scale follow the design system', () => {
    expect(tokens.spacing).toEqual({ 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32 });
    expect(tokens.radius).toEqual({ sm: 6, md: 10, lg: 16, pill: 999 });
    expect(tokens.typeScale.body).toEqual({ fontSize: 16, lineHeight: 26, fontWeight: '400' });
    expect(tokens.layout.sidebar).toBe(240);
    expect(tokens.minButtonHeight).toEqual({ wallet: 44, portal: 40 });
    expect(tokens.pxToRem(24)).toBe(1.5);
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

describe('no hex colour outside tokens.ts and the generated theme.css', () => {
  /** Source folders of every app (tests, fixtures and generated code excluded). */
  const ROOTS = [
    'portal-ui/src',
    'issuer-portal/src',
    'verifier-portal/src',
    'wallet/src',
    'wallet/app',
  ];
  const ALLOWED = new Set(['portal-ui/src/tokens.ts']);
  const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;

  const files = (dir: string): string[] => {
    let entries: string[];
    try {
      entries = readdirSync(join(REPO, dir));
    } catch {
      return []; // e.g. verifier-portal/src before Sprint 3
    }
    return entries.flatMap((entry) => {
      const rel = `${dir}/${entry}`;
      if (statSync(join(REPO, rel)).isDirectory()) return entry === 'fixtures' ? [] : files(rel);
      return /\.(tsx?|css)$/.test(entry) ? [rel] : [];
    });
  };

  it('scans the apps (and finds their files)', () => {
    const all = ROOTS.flatMap(files);
    expect(all.length).toBeGreaterThan(100);
    expect(all).toContain('issuer-portal/src/index.css');
  });

  it.each(ROOTS)('%s has no hex colour literal', (root) => {
    const offenders = files(root)
      .filter((file) => !ALLOWED.has(file))
      .filter((file) => HEX.test(readFileSync(join(REPO, file), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
