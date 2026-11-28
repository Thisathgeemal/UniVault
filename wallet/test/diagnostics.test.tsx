/**
 * Diagnostics (dev builds only): build facts, the API URL (with problems explained), the
 * crypto-core check on the bundled fixture, and API reachability via GET /health.
 */
import { screen, userEvent, waitFor } from '@testing-library/react-native';
import DiagnosticsScreen from '../app/(tabs)/settings/diagnostics';
import * as appInfo from '../src/config/app-info';
import * as check from '../src/lib/crypto-check';
import * as pin from '../src/security/pin';
import { en } from '../src/i18n/locales/en';
import { renderWithProviders } from './render';

const ORIGINAL_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const ORIGINAL_FETCH = global.fetch;

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL;
  else process.env.EXPO_PUBLIC_API_BASE_URL = ORIGINAL_URL;
  global.fetch = ORIGINAL_FETCH;
  jest.restoreAllMocks();
});

describe('Diagnostics screen', () => {
  it('shows the app, SDK, platform, Hermes and API URL', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.20:4000/api/v1';
    await renderWithProviders(<DiagnosticsScreen />);
    expect(screen.getByText(en.diagnostics.environment)).toBeOnTheScreen();
    expect(screen.getByText('0.1.0')).toBeOnTheScreen();
    expect(screen.getByTestId('diag-hermes')).toHaveTextContent(en.diagnostics.off); // Jest = Node
    expect(screen.getByTestId('diag-api-url')).toHaveTextContent('http://192.168.1.20:4000/api/v1');
    expect(screen.queryByTestId('diag-loopback')).toBeNull();
    expect(screen.getByTestId('crypto-result').props.accessibilityLabel).toBe(
      en.diagnostics.notRun,
    );
  });

  it('runs the crypto-core check: 5 of 5 disclosures, pass', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<DiagnosticsScreen />);
    await user.press(screen.getByRole('button', { name: 'Run the crypto-core check' }));
    await waitFor(() =>
      expect(screen.getByTestId('crypto-result').props.accessibilityLabel).toBe(
        en.diagnostics.pass,
      ),
    );
    expect(screen.getByTestId('crypto-disclosures')).toHaveTextContent(
      '5 of 5 disclosures decoded',
    );
  });

  it('shows a failed crypto check with its reason', async () => {
    const user = userEvent.setup();
    jest.spyOn(check, 'runCryptoCoreCheck').mockResolvedValue({
      pass: false,
      disclosures: 4,
      expectedDisclosures: 5,
      durationMs: 3,
      failure: 'DISCLOSURE_NOT_IN_SD',
    });
    await renderWithProviders(<DiagnosticsScreen />);
    await user.press(screen.getByRole('button', { name: 'Run the crypto-core check' }));
    expect(await screen.findByText('Reason: DISCLOSURE_NOT_IN_SD')).toBeOnTheScreen();
    expect(screen.getByTestId('crypto-result').props.accessibilityLabel).toBe(en.diagnostics.fail);
  });

  it('calls GET /health on the configured URL and shows the server status', async () => {
    const user = userEvent.setup();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://192.168.1.20:4000/api/v1';
    const fetchMock = jest.fn(async () => ({ status: 200, json: async () => ({ status: 'ok' }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await renderWithProviders(<DiagnosticsScreen />);
    await user.press(screen.getByRole('button', { name: 'Run the API reachability' }));
    await waitFor(() =>
      expect(screen.getByTestId('api-result').props.accessibilityLabel).toBe(en.diagnostics.pass),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://192.168.1.20:4000/api/v1/health',
      expect.anything(),
    );
    expect(screen.getByTestId('api-detail')).toHaveTextContent(
      'Reachable: server status “ok” (HTTP 200)',
    );
  });

  it('reports an unreachable backend', async () => {
    const user = userEvent.setup();
    process.env.EXPO_PUBLIC_API_BASE_URL = 'http://localhost:4000/api/v1';
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await renderWithProviders(<DiagnosticsScreen />);
    expect(screen.getByTestId('diag-loopback')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Run the API reachability' }));
    expect(await screen.findByText('Not reachable (NETWORK_ERROR)')).toBeOnTheScreen();
  });

  it('explains a missing URL and disables the API check', async () => {
    process.env.EXPO_PUBLIC_API_BASE_URL = '';
    await renderWithProviders(<DiagnosticsScreen />);
    expect(screen.getByTestId('diag-api-url')).toHaveTextContent(en.diagnostics.apiProblem.missing);
    expect(screen.getByText(en.diagnostics.notConfigured)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Run the API reachability' })).toBeDisabled();
  });

  it('measures the PIN hashing time with the default parameters (never a PIN)', async () => {
    const user = userEvent.setup();
    const measure = jest
      .spyOn(pin, 'measurePinHashing')
      .mockResolvedValue({ ms: 312, params: pin.DEFAULT_KDF_PARAMS });
    await renderWithProviders(<DiagnosticsScreen />);
    expect(screen.getByTestId('pin-hashing-params')).toHaveTextContent(
      'scrypt N = 4096, r = 8, p = 1 (4 MiB)',
    );
    expect(screen.queryByTestId('pin-hashing-result')).toBeNull();
    await user.press(screen.getByRole('button', { name: 'Run the PIN hashing time' }));
    expect(await screen.findByTestId('pin-hashing-result')).toHaveTextContent('312 ms');
    expect(measure).toHaveBeenCalledWith();
  });

  it('shows only "not available" in a release build', async () => {
    jest.spyOn(appInfo, 'diagnosticsEnabled').mockReturnValue(false);
    await renderWithProviders(<DiagnosticsScreen />);
    expect(screen.getByText(en.diagnostics.unavailable)).toBeOnTheScreen();
    expect(screen.queryByText(en.diagnostics.cryptoTitle)).toBeNull();
  });
});
