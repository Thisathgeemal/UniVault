/**
 * UI kit (development builds only): every component, variant and status is on the screen,
 * Toast and ConfirmDialog can be triggered, and a release build neither links to nor shows it.
 */
import { screen, userEvent, within } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as appInfo from '../src/config/app-info';
import { WALLET_STATUSES } from '../src/credentials/status';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import { BUTTON_VARIANTS, lightColors, TONES } from '../src/theme';

const APP_DIR = join(__dirname, '..', 'app');

afterEach(() => jest.restoreAllMocks());

async function openKit() {
  await renderRouter(APP_DIR, { initialUrl: ROUTES.uiKit });
  return await screen.findByTestId('ui-kit-screen');
}

describe('UI kit (development build)', () => {
  it('shows every button variant normal, disabled and loading', async () => {
    await openKit();
    const buttons = within(screen.getByTestId('kit-buttons'));
    for (const variant of BUTTON_VARIANTS) {
      const name = en.uiKit.variants[variant];
      expect(buttons.getByTestId(`kit-${variant}`)).toBeEnabled();
      expect(buttons.getByRole('button', { name: `${name} (disabled)` })).toBeDisabled();
      expect(buttons.getByRole('button', { name: `${name} (loading)` })).toBeBusy();
    }
  });

  it('shows every credential status badge and a credential card per status', async () => {
    await openKit();
    for (const status of WALLET_STATUSES) {
      expect(screen.getByTestId(`kit-status-${status}`).props.accessibilityLabel).toBe(
        en.status[status],
      );
      expect(screen.getByTestId(`kit-card-${status}`).props.accessibilityLabel).toContain(
        `status ${en.status[status]}`,
      );
    }
  });

  it('shows every badge tone, list items, headers and the three states', async () => {
    await openKit();
    for (const tone of TONES) expect(screen.getByText(en.uiKit.tones[tone])).toBeOnTheScreen();
    expect(within(screen.getByTestId('kit-list')).getAllByText(en.uiKit.listTitle)).toHaveLength(4);
    const header = within(screen.getByTestId('kit-header'));
    // navy root, navy compact (with Back and actions), surface (outside the tabs, with Back)
    expect(header.getAllByRole('header', { name: en.uiKit.headerTitle })).toHaveLength(3);
    expect(header.getAllByRole('button', { name: en.common.back })).toHaveLength(2);
    expect(header.getByRole('button', { name: en.uiKit.headerAction2 })).toBeOnTheScreen();
    const states = within(screen.getByTestId('kit-states'));
    expect(states.getByRole('progressbar', { name: en.uiKit.loadingMessage })).toBeOnTheScreen();
    expect(states.getByRole('header', { name: en.uiKit.emptyTitle })).toBeOnTheScreen();
    expect(states.getByRole('alert')).toHaveTextContent(new RegExp(en.uiKit.errorMessage));
  });

  it('shows on-brand buttons on navy, the offline notice and the disclosure panel tokens', async () => {
    await openKit();
    expect(screen.getByTestId('kit-on-brand-panel')).toHaveStyle({
      backgroundColor: lightColors.brand,
    });
    // the navy kinds: inverse (primary on navy) and text on brand, each on its own navy panel
    for (const panel of ['kit-inverse-panel', 'kit-textOnBrand-panel']) {
      expect(screen.getByTestId(panel)).toHaveStyle({ backgroundColor: lightColors.brand });
    }
    expect(screen.getByText(en.uiKit.inverseSample)).toBeOnTheScreen();
    expect(screen.getByTestId('kit-inverse')).toHaveStyle({ backgroundColor: lightColors.onBrand });
    expect(screen.getByText(en.uiKit.swipeHint)).toBeOnTheScreen();
    // headers: navy as in the tabs (root and compact with Back), surface as outside them
    expect(screen.getByTestId('kit-header-root')).toHaveStyle({
      backgroundColor: lightColors.brand,
    });
    expect(screen.getByTestId('kit-header-detail')).toHaveStyle({
      backgroundColor: lightColors.brand,
    });
    expect(screen.getByTestId('kit-header-surface')).toHaveStyle({
      backgroundColor: lightColors.surface,
    });
    expect(screen.getByText(en.uiKit.headerInTabs)).toBeOnTheScreen();
    expect(screen.getByTestId('kit-offline')).toHaveStyle({
      backgroundColor: lightColors.statusExpiredBg,
    });
    expect(screen.getByTestId('kit-disclosure-panel')).toHaveStyle({
      backgroundColor: lightColors.brandSoft,
    });
    expect(screen.getByText(en.uiKit.disclosureLink)).toHaveStyle({
      color: lightColors.accentTextOnSoft,
    });
  });

  it('triggers a toast, and queues several one at a time', async () => {
    const user = userEvent.setup();
    await openKit();
    await user.press(screen.getByTestId('kit-toast'));
    expect(await screen.findByText('Example toast 1')).toBeOnTheScreen();
    await user.press(screen.getByTestId('toast-dismiss'));
    expect(screen.queryByTestId('toast')).toBeNull();

    await user.press(screen.getByTestId('kit-toasts'));
    expect(screen.getByText('Example toast 1')).toBeOnTheScreen();
    expect(screen.queryByText('Example toast 2')).toBeNull();
    await user.press(screen.getByTestId('toast-dismiss'));
    expect(screen.getByText('Example toast 2')).toBeOnTheScreen();
  });

  it('opens the confirmation; Cancel and Confirm close it', async () => {
    const user = userEvent.setup();
    await openKit();
    await user.press(screen.getByTestId('kit-confirm'));
    expect(screen.getByRole('header', { name: en.uiKit.confirmTitle })).toBeOnTheScreen();
    await user.press(screen.getByTestId('kit-dialog-cancel'));
    expect(screen.queryByRole('header', { name: en.uiKit.confirmTitle })).toBeNull();
    expect(screen.getByText(en.uiKit.cancelled)).toBeOnTheScreen();

    await user.press(screen.getByTestId('toast-dismiss'));
    await user.press(screen.getByTestId('kit-confirm-destructive'));
    expect(screen.getByRole('header', { name: en.uiKit.destructiveTitle })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.uiKit.destructiveAction }));
    expect(screen.getByText(en.uiKit.confirmed)).toBeOnTheScreen();
  });

  it('buttons in the kit respond (example toast)', async () => {
    const user = userEvent.setup();
    await openKit();
    await user.press(screen.getByTestId('kit-primary'));
    expect(screen.getByText(en.uiKit.pressed)).toBeOnTheScreen();
  });
});

describe('UI kit in a release build', () => {
  it('the screen shows only "not available"', async () => {
    jest.spyOn(appInfo, 'uiKitEnabled').mockReturnValue(false);
    await openKit();
    expect(screen.getByText(en.uiKit.unavailable)).toBeOnTheScreen();
    expect(screen.queryByTestId('kit-buttons')).toBeNull();
  });

  it('Settings has no UI kit or Diagnostics link and no developer section', async () => {
    jest.spyOn(appInfo, 'uiKitEnabled').mockReturnValue(false);
    jest.spyOn(appInfo, 'diagnosticsEnabled').mockReturnValue(false);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.settings });
    await screen.findByTestId('settings-screen');
    expect(screen.queryByTestId('ui-kit-link')).toBeNull();
    expect(screen.queryByTestId('diagnostics-link')).toBeNull();
    expect(screen.queryByText(en.settings.sections.developer)).toBeNull();
  });

  it('the screen gates on an INLINE __DEV__, so the release bundle drops the kit itself', () => {
    // Metro folds `!__DEV__` to true in a release build and removes the unreachable kit; a
    // function call like uiKitEnabled() alone cannot be folded (checked with expo export).
    const source = readFileSync(join(APP_DIR, '(tabs)', 'settings', 'ui-kit.tsx'), 'utf8');
    expect(source).toContain('if (!__DEV__ || !uiKitEnabled())');
  });

  it('the gates are __DEV__ (true under Jest, false in release bundles)', () => {
    expect(appInfo.uiKitEnabled()).toBe(true);
    expect(appInfo.sampleDataEnabled()).toBe(true);
  });
});

describe('sample data in a release build', () => {
  it('Credentials and History show their empty states; details say "not found"', async () => {
    jest.spyOn(appInfo, 'sampleDataEnabled').mockReturnValue(false);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credentials });
    expect(await screen.findByText(en.credentials.emptyTitle)).toBeOnTheScreen();
    expect(screen.queryByTestId('sample-notice')).toBeNull();
  });

  it('History shows its empty state', async () => {
    jest.spyOn(appInfo, 'sampleDataEnabled').mockReturnValue(false);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.history });
    expect(await screen.findByText(en.history.emptyTitle)).toBeOnTheScreen();
  });

  it('a sample credential id is not found', async () => {
    jest.spyOn(appInfo, 'sampleDataEnabled').mockReturnValue(false);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.credential('sample-employment-active') });
    expect(await screen.findByText(en.credentials.notFoundTitle)).toBeOnTheScreen();
  });

  it('a sample history id is not found', async () => {
    jest.spyOn(appInfo, 'sampleDataEnabled').mockReturnValue(false);
    await renderRouter(APP_DIR, { initialUrl: ROUTES.historyEntry('sample-history-1') });
    expect(await screen.findByText(en.history.notFoundTitle)).toBeOnTheScreen();
  });
});
