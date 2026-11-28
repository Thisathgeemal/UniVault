/**
 * Shared components: variants, states and accessibility props (roles, labels, states, 44 pt
 * targets, decorative icons hidden, text that wraps). ErrorBoundary fallback and retry.
 */
import { act, fireEvent, render, screen, userEvent, waitFor } from '@testing-library/react-native';
import Constants from 'expo-constants';
import { useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AppText,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CredentialCard,
  EmptyState,
  ErrorBoundary,
  ErrorState,
  Header,
  Icon,
  issuerInitial,
  ListItem,
  LoadingState,
  OfflineNotice,
  Screen,
  SectionHeader,
  TOAST_QUEUE_LIMIT,
  ToastProvider,
  useToast,
} from '../src/components';
import { diagnosticsEnabled, getAppInfo } from '../src/config/app-info';
import { en } from '../src/i18n/locales/en';
import { formatDate } from '../src/lib/format';
import {
  buttonColors,
  lightColors,
  LIST_ROW_MIN_HEIGHT,
  MIN_TOUCH_TARGET,
  radius,
  toneColors,
} from '../src/theme';
import { renderWithProviders, TEST_SAFE_AREA } from './render';

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

  it.each(['primary', 'secondary', 'text', 'destructive', 'onBrand'] as const)(
    '%s kind uses its design-system colours, radius-md and 44 pt',
    async (variant) => {
      await renderWithProviders(<Button label={variant} variant={variant} onPress={jest.fn()} />);
      const colors = buttonColors(lightColors, variant);
      const button = screen.getByRole('button', { name: variant });
      expect(button).toHaveStyle({
        backgroundColor: colors.bg,
        borderColor: colors.border,
        borderRadius: radius.md,
        minHeight: MIN_TOUCH_TARGET,
      });
      expect(screen.getByText(variant)).toHaveStyle({ color: colors.fg });
    },
  );

  it('announces disabled and loading, and ignores presses then', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(
      <>
        <Button label="Off" disabled onPress={onPress} variant="secondary" />
        <Button label="Working" loading onPress={onPress} testID="w" />
        <Button label="With icon" icon="add" onPress={onPress} accessibilityLabel="Add one" />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Off' })).toBeDisabled();
    const working = screen.getByRole('button', { name: 'Working' });
    expect(working).toBeBusy();
    expect(working).toBeDisabled();
    expect(screen.getByTestId('w-spinner')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Off' }));
    await user.press(working);
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Add one' })).toBeOnTheScreen();
  });
});

describe('Icon', () => {
  it('is hidden from screen readers unless it has a label', async () => {
    await renderWithProviders(
      <>
        <Icon name="star" testID="decorative" />
        <Icon name="star" label="Favourite" testID="labelled" />
      </>,
    );
    // hidden elements are left out of queries by default: proof it is hidden
    expect(screen.queryByTestId('decorative')).toBeNull();
    const decorative = screen.getByTestId('decorative', { includeHiddenElements: true });
    expect(decorative.props.accessibilityElementsHidden).toBe(true);
    expect(decorative.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(screen.getByRole('image', { name: 'Favourite' })).toBeOnTheScreen();
  });
});

describe('Badge', () => {
  it.each(['valid', 'expired', 'revoked', 'pending', 'neutral'] as const)(
    '%s tone: label as text, its badge colours, radius-sm',
    async (tone) => {
      await renderWithProviders(<Badge label={tone} tone={tone} icon="star" testID="badge" />);
      const { fg, bg } = toneColors(lightColors, tone);
      expect(screen.getByLabelText(tone)).toBeOnTheScreen();
      expect(screen.getByTestId('badge')).toHaveStyle({
        backgroundColor: bg,
        borderRadius: radius.sm,
      });
      expect(screen.getByText(tone)).toHaveStyle({ color: fg });
    },
  );
});

describe('Header tones and OfflineNotice', () => {
  it('brand tone: navy header with an on-brand title and icons (every screen in a tab)', async () => {
    await renderWithProviders(<Header testID="h" title="Home" tone="brand" onBack={jest.fn()} />);
    expect(screen.getByTestId('h')).toHaveStyle({ backgroundColor: lightColors.brand });
    expect(screen.getByRole('header', { name: 'Home' })).toHaveStyle({
      color: lightColors.onBrand,
    });
  });

  it.each([
    ['brand', lightColors.focusRingOnBrand],
    ['surface', lightColors.focusRing],
  ] as const)(
    '%s header: keyboard focus draws the ring in its focus colour',
    async (tone, ring) => {
      await renderWithProviders(
        <Header
          testID="h"
          title="Details"
          tone={tone}
          onBack={jest.fn()}
          actions={[{ icon: 'share-outline', label: 'Share', onPress: jest.fn(), testID: 'share' }]}
        />,
      );
      for (const id of ['h-back', 'share']) {
        await act(async () => screen.getByTestId(id).props.onFocus?.());
        expect(StyleSheet.flatten(screen.getByTestId(id).props.style)).toMatchObject({
          outlineColor: ring,
          outlineWidth: 2,
        });
        await act(async () => screen.getByTestId(id).props.onBlur?.());
        expect(StyleSheet.flatten(screen.getByTestId(id).props.style).outlineColor).toBeUndefined();
      }
    },
  );

  it('surface tone by default', async () => {
    await renderWithProviders(<Header testID="h" title="Settings" />);
    expect(screen.getByTestId('h')).toHaveStyle({ backgroundColor: lightColors.surface });
    expect(screen.getByRole('header', { name: 'Settings' })).toHaveStyle({
      color: lightColors.text,
    });
  });

  it('OfflineNotice: expired colours, offline icon, "Status last checked …" announced', async () => {
    await renderWithProviders(<OfflineNotice lastChecked="2 hours ago" testID="o" />);
    const notice = screen.getByRole('alert', { name: 'Status last checked 2 hours ago' });
    expect(notice).toHaveStyle({ backgroundColor: lightColors.statusExpiredBg });
    expect(
      screen.getByText('Status last checked 2 hours ago', { includeHiddenElements: true }),
    ).toHaveStyle({
      color: lightColors.statusExpiredText,
    });
  });
});

describe('Header', () => {
  it('title is a header; back and up to two actions are labelled 44 pt buttons', async () => {
    const user = userEvent.setup();
    const onBack = jest.fn();
    const share = jest.fn();
    await renderWithProviders(
      <Header
        testID="h"
        title="Title"
        onBack={onBack}
        actions={[
          { icon: 'share-outline', label: 'Share', onPress: share, testID: 'share' },
          { icon: 'trash-outline', label: 'Delete', onPress: jest.fn() },
        ]}
      />,
    );
    expect(screen.getByRole('header', { name: 'Title' })).toBeOnTheScreen();
    const back = screen.getByRole('button', { name: en.common.back });
    expect(back).toHaveStyle({ minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET });
    await user.press(back);
    await user.press(screen.getByTestId('share'));
    expect(onBack).toHaveBeenCalled();
    expect(share).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeOnTheScreen();
    // safe-area aware: padded below the status bar / notch
    // a header with Back is a detail header: space-2 above and below the title, h3 16
    expect(screen.getByTestId('h')).toHaveStyle({
      paddingTop: TEST_SAFE_AREA.insets.top + 8,
      paddingBottom: 8,
    });
    expect(screen.getByRole('header')).toHaveStyle({ fontSize: 16 });
  });

  it('has no back button without onBack', async () => {
    await renderWithProviders(<Header title="Root" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('ListItem and SectionHeader', () => {
  it('a pressable row is one labelled 56 pt button with a chevron', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(
      <ListItem
        title="Language"
        value="English"
        subtitle="Whole app"
        icon="language-outline"
        accessibilityHint="Opens"
        onPress={onPress}
      />,
    );
    const row = screen.getByRole('button', { name: 'Language, English, Whole app' });
    expect(row).toHaveStyle({ minHeight: LIST_ROW_MIN_HEIGHT });
    expect(LIST_ROW_MIN_HEIGHT).toBe(56);
    expect(row.props.accessibilityHint).toBe('Opens');
    await user.press(row);
    expect(onPress).toHaveBeenCalled();
  });

  it('a static row is one accessible element, not a button', async () => {
    await renderWithProviders(
      <>
        <SectionHeader title="Section" />
        <ListItem title="Version" value="0.1.0" testID="row">
          <AppText>extra</AppText>
        </ListItem>
      </>,
    );
    expect(screen.getByRole('header', { name: 'Section' })).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe('Version, 0.1.0');
    expect(screen.getByText('extra')).toBeOnTheScreen();
  });
});

describe('Loading, empty and error states', () => {
  it('LoadingState is a busy progressbar with a visible message (default "Loading…")', async () => {
    await renderWithProviders(
      <>
        <LoadingState testID="l1" />
        <LoadingState message="Fetching" />
      </>,
    );
    expect(screen.getByRole('progressbar', { name: en.common.loading })).toBeBusy();
    expect(screen.getByText('Fetching')).toBeOnTheScreen();
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

  it('ErrorState announces the message as an alert and retries', async () => {
    const user = userEvent.setup();
    const onRetry = jest.fn();
    await renderWithProviders(
      <>
        <ErrorState message="Could not load" onRetry={onRetry} />
        <ErrorState title="Custom" message="No retry" retryLabel="unused" />
      </>,
    );
    const [first, second] = screen.getAllByRole('alert');
    expect(first).toHaveTextContent(new RegExp(`${en.errors.title}.*Could not load`));
    expect(second).toHaveTextContent(/Custom/);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    await user.press(screen.getByRole('button', { name: en.common.tryAgain }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('Toast', () => {
  function Trigger({ count = 1 }: { count?: number }) {
    const toast = useToast();
    return (
      <Button
        label="toast"
        onPress={() => {
          for (let n = 1; n <= count; n += 1) toast.show({ message: `m${n}`, tone: 'success' });
        }}
      />
    );
  }

  it('shows, announces and auto-dismisses one message at a time', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const user = userEvent.setup();
    await renderWithProviders(
      <ToastProvider durationMs={60}>
        <Trigger count={2} />
      </ToastProvider>,
    );
    await user.press(screen.getByRole('button', { name: 'toast' }));
    expect(screen.getByText('m1')).toBeOnTheScreen();
    expect(screen.queryByText('m2')).toBeNull();
    expect(announce).toHaveBeenCalledWith('m1');
    expect(screen.getByRole('alert')).toHaveTextContent('m1');

    expect(await screen.findByText('m2')).toBeOnTheScreen();
    await waitFor(() => expect(screen.queryByTestId('toast')).toBeNull());
    announce.mockRestore();
  });

  it(`keeps at most ${TOAST_QUEUE_LIMIT} waiting (oldest dropped)`, async () => {
    const user = userEvent.setup();
    await renderWithProviders(<Trigger count={5} />);
    await user.press(screen.getByRole('button', { name: 'toast' }));
    expect(screen.getByText('m3')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.toast.dismiss }));
    await user.press(screen.getByRole('button', { name: en.toast.dismiss }));
    expect(screen.getByText('m5')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: en.toast.dismiss }));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('useToast outside a ToastProvider is a programming error', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    function Orphan() {
      useToast();
      return null;
    }
    // no ToastProvider here (renderWithProviders would add one)
    await render(
      <SafeAreaProvider initialMetrics={TEST_SAFE_AREA}>
        <ErrorBoundaryProbe>
          <Orphan />
        </ErrorBoundaryProbe>
      </SafeAreaProvider>,
    );
    expect(await screen.findByText('caught: Error')).toBeOnTheScreen();
    consoleError.mockRestore();
  });
});

/** Shows which error a child threw (to test useToast's guard without a whole fallback). */
function ErrorBoundaryProbe({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null);
  return name ? (
    <Text>caught: {name}</Text>
  ) : (
    <ErrorBoundary onError={setName}>{children}</ErrorBoundary>
  );
}

describe('ConfirmDialog', () => {
  it('asks with title and message; Confirm and Cancel call back; Android back cancels', async () => {
    const user = userEvent.setup();
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await renderWithProviders(
      <ConfirmDialog
        visible
        testID="d"
        title="Remove?"
        message="Cannot be undone"
        confirmLabel="Remove"
        destructive
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByRole('header', { name: 'Remove?' })).toBeOnTheScreen();
    expect(screen.getByTestId('d').props.accessibilityViewIsModal).toBe(true);
    const confirm = screen.getByRole('button', { name: 'Remove' });
    expect(confirm).toHaveStyle({ backgroundColor: lightColors.statusRevoked });
    await user.press(confirm);
    await user.press(screen.getByRole('button', { name: en.common.cancel }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Android back (Modal onRequestClose) and a tap on the backdrop cancel too
    fireEvent(screen.getByTestId('d-modal'), 'requestClose');
    // the backdrop is hidden from screen readers (they use Cancel), so include hidden elements
    await user.press(screen.getByTestId('d-backdrop', { includeHiddenElements: true }));
    expect(onCancel).toHaveBeenCalledTimes(3);
  });

  it('non-destructive uses primary; loading blocks both buttons; hidden when not visible', async () => {
    await renderWithProviders(
      <>
        <ConfirmDialog
          visible
          title="Go?"
          message="m"
          confirmLabel="Go"
          cancelLabel="Stay"
          loading
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
        <ConfirmDialog
          visible={false}
          title="Hidden"
          message="m"
          confirmLabel="x"
          onConfirm={jest.fn()}
          onCancel={jest.fn()}
        />
      </>,
    );
    const go = screen.getByRole('button', { name: 'Go' });
    expect(go).toHaveStyle({ backgroundColor: lightColors.accent });
    expect(go).toBeBusy();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeDisabled();
    expect(screen.queryByText('Hidden')).toBeNull();
  });
});

describe('CredentialCard', () => {
  const props = {
    issuerName: 'Serendib Trading Company (Demo)',
    typeLabel: 'Employment credential',
    holderName: 'Sample Holder',
    expiresAt: '2027-11-27T00:00:00Z',
  };

  it('is one pressable element whose label reads everything, status included', async () => {
    const user = userEvent.setup();
    const onPress = jest.fn();
    await renderWithProviders(<CredentialCard {...props} status="valid" onPress={onPress} />);
    const card = screen.getByRole('button', {
      name: 'Employment credential, issued by Serendib Trading Company (Demo), holder Sample Holder, Expires 27 Nov 2027, status Valid',
    });
    // brand navy, radius-lg; title on-brand, issuer and expiry on-brand-muted
    expect(card).toHaveStyle({ backgroundColor: lightColors.brand, borderRadius: radius.lg });
    expect(screen.getByText(props.typeLabel)).toHaveStyle({ color: lightColors.onBrand });
    expect(screen.getByText(props.issuerName)).toHaveStyle({ color: lightColors.onBrandMuted });
    expect(screen.getByText('Expires 27 Nov 2027')).toHaveStyle({
      color: lightColors.onBrandMuted,
    });
    // the status badge sits in its own status-valid-bg pill: never a status colour on navy
    expect(screen.getByTestId('status-valid')).toHaveStyle({
      backgroundColor: lightColors.statusValidBg,
    });
    expect(card.props.accessibilityHint).toBe(en.credentialCard.openHint);
    expect(card).toHaveStyle({ minHeight: MIN_TOUCH_TARGET });
    // avatar initial: drawn, but decorative (the label already names the issuer)
    expect(screen.queryByText('S')).toBeNull();
    expect(screen.getByText('S', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(screen.getByText(en.status.valid)).toBeOnTheScreen();
    await user.press(card);
    expect(onPress).toHaveBeenCalled();
  });

  it('says "Expired on" for an expired credential; not pressable without onPress', async () => {
    await renderWithProviders(<CredentialCard {...props} status="expired" testID="c" />);
    expect(screen.getByText('Expired on 27 Nov 2027')).toBeOnTheScreen();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByTestId('c').props.accessibilityLabel).toContain('status Expired');
  });

  it('issuer initial: first letter, upper case, "?" when empty; Sinhala works', () => {
    expect(issuerInitial('  bank')).toBe('B');
    expect(issuerInitial('')).toBe('?');
    expect(issuerInitial('ලංකා බැංකුව')).toBe('ල');
  });
});

describe('formatDate', () => {
  it('formats in Asia/Colombo in the UI language, and falls back safely', () => {
    // 20:00 UTC is already the next day in Sri Lanka (UTC+5:30)
    expect(formatDate('2027-01-31T20:00:00Z', 'en')).toBe('1 Feb 2027');
    expect(formatDate('2027-01-31T20:00:00Z', 'si')).toMatch(/2027/);
    expect(formatDate('not a date', 'en')).toBe('not a date');
    const spy = jest.spyOn(Intl, 'DateTimeFormat').mockImplementation(() => {
      throw new RangeError('no locale data');
    });
    expect(formatDate('2027-01-31T10:00:00Z', 'en')).toBe('2027-01-31');
    spy.mockRestore();
  });
});

describe('Card, AppText, Screen and app info', () => {
  it('Card title is a header; AppText tones; text scaling stays on (capped at 2×)', async () => {
    await renderWithProviders(
      <Card title="Checks">
        <AppText tone="accent">p</AppText>
        <AppText tone="error" variant="caption">
          d
        </AppText>
        <AppText tone="muted" variant="label">
          m
        </AppText>
        <AppText tone="subtle" variant="mono">
          x
        </AppText>
      </Card>,
    );
    expect(screen.getByRole('header', { name: 'Checks' })).toBeOnTheScreen();
    const text = screen.getByText('p');
    expect(text.props.maxFontSizeMultiplier).toBe(2);
    expect(text.props.allowFontScaling).not.toBe(false);
    // design type scale and fonts: label 14/20 Noto Sans Medium; body 16/26
    expect(screen.getByText('m')).toHaveStyle({
      fontSize: 14,
      lineHeight: 20,
      fontFamily: 'NotoSans_500Medium',
      color: lightColors.textMuted,
    });
    expect(text).toHaveStyle({ fontSize: 16, lineHeight: 26, color: lightColors.accentText });
    expect(screen.getByText('d')).toHaveStyle({ color: lightColors.statusRevoked });
    // mono: the system monospace (Diagnostics only), not a bundled font
    expect(screen.getByText('x')).toHaveStyle({ fontSize: 13, color: lightColors.textSubtle });
    expect(screen.getByText('x').props.style).not.toContainEqual({
      fontFamily: 'NotoSans_400Regular',
    });
  });

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
