/**
 * The wallet theme IS the shared tokens (@univault/portal-ui/tokens): the same names as the
 * design system in light and dark, the design type scale and fonts, no copied values.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fontFamily, radius as radiusTokens, typeScale } from '@univault/portal-ui/tokens';
import {
  buttonColors,
  darkColors,
  FONT_NAMES,
  fontFor,
  getTheme,
  lightColors,
  MIN_TOUCH_TARGET,
  radius,
  space,
  toneColors,
  typeStyle,
} from '../src/theme';

describe('theme from @univault/portal-ui/tokens', () => {
  it('uses the design-system colour names in both themes', () => {
    expect(lightColors.brand).toBe('#0B2545');
    expect(darkColors.brand).toBe('#16335C');
    expect(lightColors.accent).toBe('#2563EB');
    expect(darkColors.accent).toBe('#60A5FA');
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  it('follows the OS colour scheme', () => {
    expect(getTheme('dark').colors).toBe(darkColors);
    expect(getTheme('light').colors).toBe(lightColors);
    expect(getTheme(null).scheme).toBe('light');
  });

  it('spacing on a 4 pt base, radii and the 44 pt touch target from the tokens', () => {
    expect(space(4)).toBe(16);
    expect(radius).toBe(radiusTokens);
    expect(radius.lg).toBe(16);
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it('type scale: same sizes in both scripts, Noto Sans or Noto Sans Sinhala by weight', () => {
    expect(typeStyle('body')).toEqual({
      fontSize: 16,
      lineHeight: 26,
      fontFamily: fontFamily.sans,
    });
    expect(typeStyle('body', 'sinhala')).toEqual({
      fontSize: 16,
      lineHeight: 26,
      fontFamily: fontFamily.sinhala,
    });
    expect(typeStyle('h1').fontSize).toBe(typeScale.h1.fontSize);
    expect(fontFor('500', 'latin')).toBe(fontFamily.sansMedium);
    expect(fontFor('600', 'latin')).toBe(fontFamily.sansSemiBold);
    expect(fontFor('500', 'sinhala')).toBe(fontFamily.sinhalaSemiBold);
    expect(FONT_NAMES).toHaveLength(5);
  });

  it('badge tones are the status sets plus neutral; buttons follow the design table', () => {
    expect(toneColors(lightColors, 'valid')).toEqual({
      fg: lightColors.statusValidText,
      bg: lightColors.statusValidBg,
    });
    expect(toneColors(lightColors, 'neutral')).toEqual({
      fg: lightColors.textMuted,
      bg: lightColors.surfaceSunken,
    });
    expect(buttonColors(lightColors, 'primary')).toEqual({
      fg: lightColors.onAccent,
      bg: lightColors.accent,
      border: lightColors.accent,
    });
    expect(buttonColors(lightColors, 'secondary').border).toBe(lightColors.borderStrong);
    expect(buttonColors(lightColors, 'destructive').bg).toBe(lightColors.statusRevoked);
    expect(buttonColors(lightColors, 'onBrand')).toMatchObject({
      fg: lightColors.onBrand,
      bg: lightColors.roleTagBg,
      on: 'brand',
    });
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
