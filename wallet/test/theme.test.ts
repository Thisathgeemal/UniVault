/**
 * The wallet theme reads the shared portal-ui tokens: no value is copied into the wallet.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  brandColors,
  radii as radiusTokens,
  remToPx,
  semanticColors,
  typeScale,
} from '@univault/portal-ui/tokens';
import {
  darkColors,
  getTheme,
  lightColors,
  MIN_TOUCH_TARGET,
  radii,
  space,
  typeStyle,
} from '../src/theme';

describe('theme from @univault/portal-ui/tokens', () => {
  it('light colours are the portal semantic tokens', () => {
    expect(lightColors.primary).toBe(semanticColors.primary);
    expect(lightColors.background).toBe(semanticColors.background);
    expect(lightColors.foreground).toBe(semanticColors.foreground);
    expect(lightColors.destructive).toBe(semanticColors.destructive);
    expect(lightColors.success).toBe(brandColors[700]);
  });

  it('every light and dark colour is a token value', () => {
    const tokenValues = new Set<string>([
      ...Object.values(semanticColors),
      ...Object.values(brandColors),
    ]);
    for (const value of [...Object.values(lightColors), ...Object.values(darkColors)]) {
      expect(tokenValues.has(value)).toBe(true);
    }
  });

  it('converts rem tokens to points', () => {
    expect(space(4)).toBe(16);
    expect(radii.card).toBe(remToPx(radiusTokens.card));
    expect(typeStyle('base')).toEqual({
      fontSize: remToPx(typeScale.base.size),
      lineHeight: remToPx(typeScale.base.lineHeight),
    });
    // Sinhala: at least 1.7 × the font size
    expect(typeStyle('base', 'sinhala')).toEqual({ fontSize: 16, lineHeight: 27 });
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(44);
  });

  it('follows the OS colour scheme', () => {
    expect(getTheme('dark').colors).toBe(darkColors);
    expect(getTheme('light').colors).toBe(lightColors);
    expect(getTheme(null).scheme).toBe('light');
  });

  it('no hex colour is written anywhere in the wallet source (tokens only)', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    walk(join(__dirname, '..', 'src'));
    walk(join(__dirname, '..', 'app'));
    for (const file of files) {
      expect([file, /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(file, 'utf8'))]).toEqual([file, false]);
    }
  });
});
