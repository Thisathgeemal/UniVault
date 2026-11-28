/**
 * The "Navy and azure" design system in the wallet (docs/design/design-system.md): at most one
 * primary (azure) action per screen, the surface tab bar with a border top edge and the active
 * tab in accent, and the brand header on the Credentials home screen only.
 */
import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { ROUTES } from '../src/navigation/routes';
import { lightColors } from '../src/theme';

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
