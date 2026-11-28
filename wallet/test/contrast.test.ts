/**
 * WCAG AA contrast in light AND dark mode for every pairing the design system uses
 * (DESIGN_PAIRS: also what the portals draw, light) and every pair the wallet's components add:
 * 4.5:1 for normal text; 3:1 for large text, icons, input borders and the focus ring.
 * Also: no status colour ever sits straight on navy.
 */
import { lightColors as tokenLight } from '@univault/portal-ui/tokens';
import { darkColors, lightColors } from '../src/theme';
import {
  colorPairs,
  contrastRatio,
  DESIGN_PAIRS,
  luminance,
  minimumRatio,
  parseColour,
  statusOnNavy,
} from '../src/theme/contrast';

describe('contrast maths (WCAG definition)', () => {
  it('black on white is 21:1, a colour on itself 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 5);
    expect(contrastRatio('#2563EB', '#2563EB')).toBe(1);
  });

  it('matches a known value (#777777 on white ≈ 4.48)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('composites a translucent colour over its background', () => {
    // 12 % white over navy: the role tag fill
    const [r] = parseColour('rgba(255,255,255,0.12)', '#0B2545');
    expect(r).toBeCloseTo((11 / 255) * 0.88 + 0.12, 5);
    expect(parseColour('rgba(0, 0, 0, 1)')).toEqual([0, 0, 0]);
    expect(() => parseColour('rgba(255,255,255,0.12)')).toThrow('needs a background');
    expect(() => luminance('red')).toThrow('Not a #rrggbb');
  });

  it('thresholds: 4.5 for text, 3 for large text, icons, borders and focus', () => {
    expect(minimumRatio('text')).toBe(4.5);
    for (const kind of ['large', 'icon', 'border', 'focus'] as const) {
      expect(minimumRatio(kind)).toBe(3);
    }
  });
});

describe('design rules', () => {
  it('no status colour is placed directly on navy (status icons stay in their badge pill)', () => {
    expect(DESIGN_PAIRS.filter(statusOnNavy)).toEqual([]);
    expect(statusOnNavy({ use: 'x', fg: 'statusRevoked', bg: 'brand', kind: 'icon' })).toBe(true);
  });

  it('text-subtle (#5B6B80) is still visibly lighter than text-muted', () => {
    expect(luminance(tokenLight.textSubtle)).toBeGreaterThan(luminance(tokenLight.textMuted));
    // contrast against bg: muted 7.06, subtle 5.07 (was 4.43 before the fix)
    expect(contrastRatio(tokenLight.textMuted, tokenLight.bg)).toBeCloseTo(7.06, 1);
    expect(contrastRatio(tokenLight.textSubtle, tokenLight.bg)).toBeCloseTo(5.07, 1);
  });

  it('the one light-only pair: dark text-subtle on brand-soft is 4.04:1, text-muted is 5.77:1', () => {
    expect(DESIGN_PAIRS.filter((p) => p.lightOnly).map((p) => [p.fg, p.bg])).toEqual([
      ['textSubtle', 'brandSoft'],
    ]);
    expect(contrastRatio(darkColors.textSubtle, darkColors.brandSoft)).toBeCloseTo(4.04, 1);
    expect(contrastRatio(darkColors.textMuted, darkColors.brandSoft)).toBeCloseTo(5.77, 1);
  });

  it('records the 27 Nov 2026 fixes: before (source palette) failed, after passes', () => {
    const before = { textSubtle: '#64748B', focusRing: '#2563EB', accentText: '#2563EB' };
    expect(contrastRatio(before.textSubtle, tokenLight.bg)).toBeLessThan(4.5); // 4.43
    expect(contrastRatio(before.textSubtle, tokenLight.surfaceSunken)).toBeLessThan(4.5); // 4.23
    expect(contrastRatio(before.textSubtle, tokenLight.brandSoft)).toBeLessThan(4.5); // 4.01
    expect(contrastRatio(before.focusRing, tokenLight.brand)).toBeLessThan(3); // 2.98
    expect(contrastRatio(before.focusRing, tokenLight.brandHover)).toBeLessThan(3); // 2.23
    expect(contrastRatio(before.accentText, tokenLight.brandSoft)).toBeLessThan(4.5); // 4.35
    expect(contrastRatio(tokenLight.focusRingOnBrand, tokenLight.brandHover)).toBeGreaterThan(11);
    expect(contrastRatio(tokenLight.accentTextOnSoft, tokenLight.brandSoft)).toBeGreaterThan(5.6);
  });
});

describe.each([
  ['light', lightColors],
  ['dark', darkColors],
] as const)('%s theme', (mode, colors) => {
  const pairs = colorPairs(colors, mode);

  it('checks every design pairing and component pair', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(DESIGN_PAIRS.length + 10);
  });

  it('the navy button kinds are checked: inverse label + fill edge, text on brand, focus rings', () => {
    const uses = pairs.map((p) => p.use);
    for (const use of [
      'brand on on-brand (inverse button label)',
      'on-brand fill (inverse button) on brand',
      'inverse button',
      'inverse button fill on brand',
      'inverse button focus ring on brand',
      'textOnBrand button on brand',
      'textOnBrand button focus ring on brand',
    ]) {
      expect(uses).toContain(use);
    }
    // recorded 28 Nov 2026 (docs/design/design-system.md, Buttons)
    const inverse = contrastRatio(colors.brand, colors.onBrand);
    expect(Number(inverse.toFixed(2))).toBe(mode === 'light' ? 15.39 : 10.83);
  });

  it.each(pairs.map((p) => [p.use, p] as const))('%s meets AA', (_use, pair) => {
    const ratio = contrastRatio(pair.fg, pair.bg, pair.under);
    expect({
      use: pair.use,
      ratio: Number(ratio.toFixed(2)),
      ok: ratio >= minimumRatio(pair.kind),
    }).toEqual({ use: pair.use, ratio: Number(ratio.toFixed(2)), ok: true });
  });
});
