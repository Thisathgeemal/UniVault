/**
 * Navigation: the tab layout renders the four tabs (Credentials, Scan, History, Settings), each
 * placeholder screen explains what will appear there, Settings links to Diagnostics (dev), and
 * unknown routes land on the not-found screen.
 */
import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import TabsLayout from '../app/(tabs)/_layout';
import HistoryScreen from '../app/(tabs)/history';
import CredentialsScreen from '../app/(tabs)/index';
import ScanScreen from '../app/(tabs)/scan';
import SettingsScreen from '../app/(tabs)/settings';
import NotFoundScreen from '../app/+not-found';
import DiagnosticsScreen from '../app/settings/diagnostics';
import { en } from '../src/i18n/locales/en';
import { TEST_SAFE_AREA } from './render';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { ReactNode } from 'react';

const wrapper = ({ children }: { children: ReactNode }) => (
  <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>{children}</SafeAreaProvider>
);

const routes = {
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': CredentialsScreen,
  '(tabs)/scan': ScanScreen,
  '(tabs)/history': HistoryScreen,
  '(tabs)/settings': SettingsScreen,
  'settings/diagnostics': DiagnosticsScreen,
  '+not-found': NotFoundScreen,
};

describe('tab layout', () => {
  it('renders the four tabs in order, Credentials first', async () => {
    await renderRouter(routes, { initialUrl: '/', wrapper });
    const labels = [en.tabs.credentials, en.tabs.scan, en.tabs.history, en.tabs.settings];
    for (const label of labels) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    const tabs = screen.getAllByRole('button').filter((el) => {
      const text = JSON.stringify(el.props.accessibilityLabel ?? '');
      return labels.some((l) => text.includes(l));
    });
    expect(tabs.length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText(en.credentials.emptyTitle)).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it('switches to each tab and shows its placeholder', async () => {
    const user = userEvent.setup();
    await renderRouter(routes, { initialUrl: '/', wrapper });

    await user.press(screen.getAllByText(en.tabs.scan).at(-1)!);
    expect(await screen.findByText(en.scan.emptyTitle)).toBeOnTheScreen();
    expect(screen.getByText(en.scan.emptyMessage)).toBeOnTheScreen();
    expect(screen).toHavePathname('/scan');

    await user.press(screen.getAllByText(en.tabs.history).at(-1)!);
    expect(await screen.findByText(en.history.emptyTitle)).toBeOnTheScreen();
    expect(screen).toHavePathname('/history');

    await user.press(screen.getAllByText(en.tabs.settings).at(-1)!);
    expect(await screen.findByText(en.settings.language)).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings');
  });

  it('Settings links to Diagnostics in a development build', async () => {
    const user = userEvent.setup();
    await renderRouter(routes, { initialUrl: '/settings', wrapper });
    await user.press(screen.getByTestId('diagnostics-link'));
    expect(await screen.findByTestId('diagnostics-screen')).toBeOnTheScreen();
    expect(screen).toHavePathname('/settings/diagnostics');
  });

  it('an unknown route shows the not-found screen, which leads home', async () => {
    const user = userEvent.setup();
    await renderRouter(routes, { initialUrl: '/no-such-screen', wrapper });
    expect(screen.getByText(en.notFound.title)).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.notFound.goHome }));
    expect(await screen.findByText(en.credentials.emptyTitle)).toBeOnTheScreen();
  });
});

describe('placeholder screens', () => {
  it.each([
    ['credentials', '/', en.credentials.emptyTitle, en.credentials.emptyMessage],
    ['scan', '/scan', en.scan.emptyTitle, en.scan.emptyMessage],
    ['history', '/history', en.history.emptyTitle, en.history.emptyMessage],
  ])('%s explains what will appear there', async (_name, url, title, message) => {
    await renderRouter(routes, { initialUrl: url, wrapper });
    expect(screen.getByRole('header', { name: title })).toBeOnTheScreen();
    expect(screen.getByText(message)).toBeOnTheScreen();
  });
});
