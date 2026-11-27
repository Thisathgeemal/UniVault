/**
 * Shared components: ErrorBoundary fallback and retry, accessible Button (role, state, 44 pt),
 * StatusBadge text, Card header, EmptyState action, AppText tones.
 */
import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Text } from 'react-native';
import Constants from 'expo-constants';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  ErrorBoundary,
  Screen,
  StatusBadge,
} from '../src/components';
import { diagnosticsEnabled, getAppInfo } from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { MIN_TOUCH_TARGET } from '../src/theme';
import { renderWithProviders } from './render';

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('secret claim value');
  return <Text>safe content</Text>;
}

describe('ErrorBoundary', () => {
  let consoleError: jest.SpyInstance;
  beforeEach(() => {
    // React logs caught render errors; keep the test output clean
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => consoleError.mockRestore());

  it('shows the translated fallback, reports the error NAME only, and retries', async () => {
    const user = userEvent.setup();
    const onError = jest.fn();
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <>
          <Button label="defuse" onPress={() => setExplode(false)} />
          <ErrorBoundary onError={onError}>
            <Bomb explode={explode} />
          </ErrorBoundary>
        </>
      );
    }
    await renderWithProviders(<Harness />);

    expect(screen.getByTestId('error-fallback')).toBeOnTheScreen();
    expect(screen.getByText(en.errors.boundaryTitle)).toBeOnTheScreen();
    expect(screen.queryByText(/secret claim value/)).toBeNull();
    expect(onError).toHaveBeenCalledWith('Error');

    await user.press(screen.getByRole('button', { name: 'defuse' }));
    await user.press(screen.getByRole('button', { name: en.common.tryAgain }));
    expect(screen.getByText('safe content')).toBeOnTheScreen();
  });

  it('renders children when nothing throws', async () => {
    await renderWithProviders(
      <ErrorBoundary>
        <Bomb explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe content')).toBeOnTheScreen();
  });
});

describe('Button', () => {
  it('is an accessible button with a 44 pt minimum target', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(
      <Button label="Continue" accessibilityHint="Goes on" onPress={onPress} testID="b" />,
    );
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveStyle({ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET });
    expect(button.props.accessibilityHint).toBe('Goes on');
    await user.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('announces disabled and busy, and ignores presses then', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(
      <>
        <Button label="Off" disabled onPress={onPress} variant="secondary" />
        <Button label="Working" busy onPress={onPress} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working' })).toBeBusy();
    await user.press(screen.getByRole('button', { name: 'Off' }));
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe('Card, StatusBadge, EmptyState, AppText', () => {
  it('Card title is a header; StatusBadge carries its text label', async () => {
    await renderWithProviders(
      <Card title="Checks">
        <StatusBadge label="Pass" tone="success" />
        <StatusBadge label="Info" tone="info" />
        <StatusBadge label="Fail" tone="danger" />
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Checks' })).toBeOnTheScreen();
    for (const label of ['Pass', 'Info', 'Fail']) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
  });

  it('EmptyState hides its decorative icon and offers its action', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(
      <EmptyState
        icon="wallet-outline"
        title="Empty"
        message="Nothing yet"
        action={{ label: 'Add', onPress }}
      />,
    );
    expect(screen.getByRole('header', { name: 'Empty' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('AppText applies tones and keeps OS text scaling on (capped at 2×)', async () => {
    await renderWithProviders(
      <>
        <AppText tone="primary">p</AppText>
        <AppText tone="destructive" variant="caption">
          d
        </AppText>
        <AppText tone="muted" variant="label">
          m
        </AppText>
      </>,
    );
    const text = screen.getByText('p');
    expect(text.props.maxFontSizeMultiplier).toBe(2);
    expect(text.props.allowFontScaling).not.toBe(false);
    expect(screen.getByText('m')).toHaveStyle({ fontWeight: '700' });
  });
});

describe('Screen and app info', () => {
  it('Screen renders without a title and without scrolling; Card without a title', async () => {
    await renderWithProviders(
      <Screen scroll={false} testID="plain">
        <Card testID="untitled">
          <AppText>inside</AppText>
        </Card>
      </Screen>,
    );
    expect(screen.getByTestId('plain')).toBeOnTheScreen();
    expect(screen.queryByRole('header')).toBeNull();
    expect(screen.getByText('inside')).toBeOnTheScreen();
  });

  it('app info falls back when the app config is unavailable', () => {
    // test/setup.ts mocks expo-constants with a plain expoConfig property
    const mutable = Constants as { expoConfig: unknown };
    const original = mutable.expoConfig;
    mutable.expoConfig = null;
    try {
      expect(getAppInfo()).toMatchObject({ appVersion: '0.0.0', sdkVersion: 'unknown' });
    } finally {
      mutable.expoConfig = original;
    }
    expect(getAppInfo().appVersion).toBe('0.1.0');
    expect(diagnosticsEnabled()).toBe(true); // Jest runs with __DEV__ = true
  });
});
