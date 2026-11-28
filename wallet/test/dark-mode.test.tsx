/**
 * Dark mode: with the phone in dark mode (useColorScheme → 'dark'), screens and components
 * render with the DARK token colours (no manual switch: the system setting decides).
 */
import { screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { join } from 'node:path';
import { StyleSheet } from 'react-native';
import { Button, CredentialCard, StatusBadge } from '../src/components';
import { en } from '../src/i18n/locales/en';
import { ROUTES } from '../src/navigation/routes';
import { darkColors, lightColors } from '../src/theme';
import { renderWithProviders } from './render';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'dark'),
}));

const flat = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, unknown>;

describe('dark mode (system setting)', () => {
  it('the app renders its screens on the dark background', async () => {
    await renderRouter(join(__dirname, '..', 'app'), { initialUrl: ROUTES.settings });
    const root = await screen.findByTestId('settings-screen');
    expect(flat(root.props.style).backgroundColor).toBe(darkColors.bg);
    expect(darkColors.bg).not.toBe(lightColors.bg);
  });

  it('the UI kit says it is showing dark mode', async () => {
    await renderRouter(join(__dirname, '..', 'app'), { initialUrl: ROUTES.uiKit });
    expect(await screen.findByText(/dark mode/)).toBeOnTheScreen();
  });

  it('components take the dark colours', async () => {
    await renderWithProviders(
      <>
        <Button label="Go" onPress={() => undefined} />
        <StatusBadge status="valid" />
        <CredentialCard
          issuerName="Issuer"
          typeLabel="Type"
          holderName="Holder"
          expiresAt="2027-01-01T00:00:00Z"
          status="revoked"
          testID="card"
        />
      </>,
    );
    // same token names, dark values: the lighter azure with a deep navy label
    expect(screen.getByRole('button', { name: 'Go' })).toHaveStyle({
      backgroundColor: darkColors.accent,
    });
    expect(screen.getByText('Go')).toHaveStyle({ color: darkColors.onAccent });
    expect(screen.getByTestId('status-valid')).toHaveStyle({
      backgroundColor: darkColors.statusValidBg,
    });
    expect(screen.getByText(en.status.valid)).toHaveStyle({ color: darkColors.statusValidText });
    // dark brand is lighter than dark bg, so the card still stands out
    expect(screen.getByTestId('card')).toHaveStyle({ backgroundColor: darkColors.brand });
  });
});
