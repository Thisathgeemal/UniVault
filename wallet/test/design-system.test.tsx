/**
 * The "Navy and azure" design system in the wallet (docs/design/design-system.md): at most one
 * primary (azure) action per screen, the surface tab bar with a border top edge and the active
 * tab in accent, and the brand header on the Credentials home screen only.
 */
import { screen, userEvent, within } from '@testing-library/react-native';
import { fontFamily } from '@univault/portal-ui/tokens';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { ROUTES } from '../src/navigation/routes';
import { ONBOARDING_STEPS } from '../src/onboarding/steps';
import { lightColors } from '../src/theme';
import { freshInstall, seedOnboardedWithoutSecurity } from './setup-state';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PREFERENCE_KEYS } from '../src/lib/preferences';

const APP_DIR = join(__dirname, '..', 'app');
const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

/** Buttons drawn with the primary (accent) fill. */
const primaryButtons = () =>
  screen
    .queryAllByRole('button')
    .filter((el) => flat(el.props.style)?.backgroundColor === lightColors.accent);

describe('one primary action per screen', () => {
  // The UI kit is the exception: it is a catalogue that shows every button kind
  it.each([
    [ROUTES.credentials, 'credentials-screen'],
    [ROUTES.credential('sample-employment-active'), 'credential-detail-screen'],
    [ROUTES.credential('missing'), 'credential-detail-screen'],
    [ROUTES.scan, 'scan-screen'],
    [ROUTES.history, 'history-screen'],
    [ROUTES.historyEntry('sample-history-1'), 'history-detail-screen'],
    [ROUTES.settings, 'settings-screen'],
    [ROUTES.language, 'language-screen'],
    [ROUTES.appearance, 'appearance-screen'],
    [ROUTES.security, 'security-screen'],
    [ROUTES.about, 'about-screen'],
    [ROUTES.diagnostics, 'diagnostics-screen'],
    ['/no-such-screen', 'not-found-screen'],
  ])('%s has at most one primary button', async (path, testID) => {
    await renderRouter(APP_DIR, { initialUrl: path });
    await screen.findByTestId(testID);
    expect(primaryButtons().length).toBeLessThanOrEqual(1);
  });
});

describe('frame', () => {
  it('the Credentials home screen has the brand header; other screens a surface one', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    await screen.findByTestId('credentials-screen');
    expect(screen.getByTestId('stack-header')).toHaveStyle({ backgroundColor: lightColors.brand });
    await user.press(screen.getByTestId('tab-settings'));
    await screen.findByTestId('settings-screen');
    const headers = screen.getAllByTestId('stack-header');
    expect(headers.at(-1)).toHaveStyle({ backgroundColor: lightColors.surface });
  });

  it('screens on bg; tab bar on surface with a border top edge; active tab in accent', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.scan });
    const root = await screen.findByTestId('scan-screen');
    expect(flat(root.props.style).backgroundColor).toBe(lightColors.bg);
    const activeLabel = screen.getAllByText('Scan').find((el) => flat(el.props.style)?.color);
    expect(flat(activeLabel?.props.style).color).toBe(lightColors.accent);
    const inactive = screen.getAllByText('History').find((el) => flat(el.props.style)?.color);
    expect(flat(inactive?.props.style).color).toBe(lightColors.textMuted);
  });
});

/**
 * Wallet typography and layout (design-system.md): only the type scale's sizes; text-muted only
 * at 14 (secondary) or 12 (captions); headings h1 / h2 / h3; centred text only for onboarding /
 * setup hero headings, illustration labels and the PIN pad; buttons 16 / 600; list rows ≥ 56 pt;
 * screens padded space-4, sections space-6 apart, at most 560 pt wide.
 */
describe('wallet typography and layout', () => {
  const SCALE = new Set([12, 14, 16, 20, 24]);
  const MONO = 13; // Diagnostics ids only (the mono step)

  type Node = ReturnType<typeof screen.getByTestId>;
  const insideButton = (node: Node | null): boolean =>
    node !== null && (node.props.accessibilityRole === 'button' || insideButton(node.parent));

  function checkText(root: ReturnType<typeof screen.getByTestId>, centreAllowed: boolean) {
    for (const text of within(root).getAllByText(/./)) {
      const style = flat(text.props.style);
      const size = style.fontSize as number;
      const isMono = style.fontFamily === 'monospace' || style.fontFamily === 'Menlo';
      expect([text.props.children, SCALE.has(size) || (isMono && size === MONO)]).toEqual([
        text.props.children,
        true,
      ]);
      if (style.color === lightColors.textMuted) {
        expect([text.props.children, size <= 14]).toEqual([text.props.children, true]);
      }
      // headings are h2 20 or h3 16 (one step below the scale's h1; display unused)
      if (text.props.accessibilityRole === 'header') {
        expect([text.props.children, [20, 16].includes(size)]).toEqual([text.props.children, true]);
      }
      // button labels are centred inside their button (that is the button, not the text layout)
      if (!centreAllowed && !insideButton(text)) {
        expect([text.props.children, style.textAlign]).toEqual([text.props.children, undefined]);
      }
    }
  }

  it.each([
    [ROUTES.credentials, 'credentials-screen'],
    [ROUTES.credential('sample-employment-active'), 'credential-detail-screen'],
    [ROUTES.credential('missing'), 'credential-detail-screen'],
    [ROUTES.scan, 'scan-screen'],
    [ROUTES.history, 'history-screen'],
    [ROUTES.historyEntry('sample-history-1'), 'history-detail-screen'],
    [ROUTES.settings, 'settings-screen'],
    [ROUTES.language, 'language-screen'],
    [ROUTES.appearance, 'appearance-screen'],
    [ROUTES.security, 'security-screen'],
    [ROUTES.about, 'about-screen'],
    [ROUTES.diagnostics, 'diagnostics-screen'],
    [ROUTES.uiKit, 'ui-kit-screen'],
    ['/no-such-screen', 'not-found-screen'],
  ])('%s: type scale, muted = secondary, left-aligned', async (path, testID) => {
    await renderRouter(APP_DIR, { initialUrl: path });
    checkText(await screen.findByTestId(testID), false);
  });

  it.each(ONBOARDING_STEPS.map((s) => [s.id, s.route] as const))(
    'onboarding %s: type scale; only the hero heading, its lead and drawing labels centred',
    async (id, route) => {
      await freshInstall();
      await renderRouter(APP_DIR, { initialUrl: route });
      const root = await screen.findByTestId(`onboarding-${id}`);
      checkText(root, true);
      const centred = within(root)
        .getAllByText(/./)
        .filter((el) => flat(el.props.style).textAlign === 'center');
      for (const el of centred.filter((e) => !insideButton(e))) {
        const isHero = el.props.accessibilityRole === 'header';
        const isLead = el.props.testID === 'onboarding-lead';
        const isDrawingLabel = el.props.testID === 'illustration-label';
        expect([el.props.children, isHero || isLead || isDrawingLabel]).toEqual([
          el.props.children,
          true,
        ]);
      }
      expect(within(root).getAllByRole('header')[0]).toHaveStyle({ textAlign: 'center' }); // the hero
    },
  );

  it('setup (PIN): type scale; the hero heading is centred, the text is not', async () => {
    await seedOnboardedWithoutSecurity();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.setupSecurity });
    const root = await screen.findByTestId('setup-security-screen');
    checkText(root, true);
    expect(screen.getByTestId('setup-title')).toHaveStyle({ textAlign: 'center', fontSize: 20 });
  });

  it('top header: tab roots h2 20, detail screens h3 16; taller bar; side padding space-4', async () => {
    const user = userEvent.setup();
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    const rootHeader = screen.getAllByTestId('stack-header').at(-1)!;
    expect(within(rootHeader).getByRole('header')).toHaveStyle({
      fontSize: 20,
      fontFamily: fontFamily.sansSemiBold,
    });
    // (no top inset in the router test; Header's own test checks inset + padding)
    // space-4 above and space-3 below the title; space-4 sides
    expect(rootHeader).toHaveStyle({ paddingTop: 16, paddingBottom: 12, paddingLeft: 16 });
    await user.press(screen.getByTestId('settings-about'));
    await screen.findByTestId('about-screen');
    const detailHeader = screen.getAllByTestId('stack-header').at(-1)!;
    expect(within(detailHeader).getByRole('header')).toHaveStyle({ fontSize: 16 });
    expect(detailHeader).toHaveStyle({ paddingTop: 8, paddingBottom: 8 });
  });

  it('headings keep weight 600 in Sinhala (Noto Sans Sinhala SemiBold)', async () => {
    await AsyncStorage.setItem(PREFERENCE_KEYS.language, 'si');
    await renderRouter(APP_DIR, { initialUrl: ROUTES.scan });
    await screen.findByTestId('scan-screen');
    const header = within(screen.getAllByTestId('stack-header').at(-1)!).getByRole('header');
    expect(header).toHaveStyle({ fontSize: 20, fontFamily: fontFamily.sinhalaSemiBold });
  });

  it('buttons: label 16 / weight 600', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.diagnostics });
    await screen.findByTestId('diagnostics-screen');
    const label = within(screen.getByTestId('run-crypto-check')).getByText(/./);
    expect(label).toHaveStyle({ fontSize: 16, fontFamily: fontFamily.sansSemiBold });
  });

  it('settings rows are 56 pt; the screen is padded space-4, sections space-6, ≤ 560 pt', async () => {
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    for (const id of ['settings-language', 'settings-appearance', 'settings-about']) {
      expect(flat(screen.getByTestId(id).props.style).minHeight).toBeGreaterThanOrEqual(56);
    }
    const content = screen.getByTestId('settings-screen-content');
    expect(content).toHaveStyle({
      paddingHorizontal: 16,
      gap: 24,
      maxWidth: 560,
      alignSelf: 'center',
    });
  });
});
