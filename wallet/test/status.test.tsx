/**
 * Credential status: the ONE backend → wallet mapping, a distinct icon + label per state, and
 * label parity with the issuer portal. The wallet COPIES the portal's badge words (it cannot
 * import the portal's locale files at runtime); this test reads the portal's en.ts / si.ts and
 * fails if the shared states' words differ in either language.
 */
import { screen } from '@testing-library/react-native';
import { en as portalEn } from '../../issuer-portal/src/i18n/locales/en';
import { si as portalSi } from '../../issuer-portal/src/i18n/locales/si';
import { StatusBadge } from '../src/components';
import {
  BACKEND_STATUSES,
  STATUS_PRESENTATION,
  WALLET_STATUSES,
  walletStatusFromBackend,
} from '../src/credentials/status';
import { i18n } from '../src/i18n';
import { en } from '../src/i18n/locales/en';
import { si } from '../src/i18n/locales/si';
import { renderWithProviders } from './render';

/** The portal's StatusBadge reads credentials.statuses.<backend status> (CredentialStatusBadge). */
const PORTAL_KEY_FOR = {
  valid: 'valid',
  revoked: 'revoked',
  replaced: 'superseded',
  expired: 'expired',
} as const;

describe('walletStatusFromBackend', () => {
  it('maps every backend effective status', () => {
    expect(BACKEND_STATUSES.map(walletStatusFromBackend)).toEqual([
      'valid',
      'revoked',
      'replaced',
      'expired',
    ]);
  });

  it('shows anything else as "not checked" instead of guessing', () => {
    for (const value of ['pending', 'VALID', '', null, undefined, 42, {}]) {
      expect(walletStatusFromBackend(value)).toBe('notChecked');
    }
  });

  it('every wallet state is either mapped from the backend or wallet-only', () => {
    const mapped = new Set(BACKEND_STATUSES.map(walletStatusFromBackend));
    const walletOnly = WALLET_STATUSES.filter((s) => !mapped.has(s));
    expect(walletOnly).toEqual(['notChecked', 'checking']);
  });
});

describe('presentation: never colour alone', () => {
  it('each state has its own icon and its own label in both languages', () => {
    const icons = WALLET_STATUSES.map((s) => STATUS_PRESENTATION[s].icon);
    expect(new Set(icons).size).toBe(WALLET_STATUSES.length);
    for (const messages of [en, si]) {
      const labels = WALLET_STATUSES.map((s) => messages.status[s]);
      expect(new Set(labels).size).toBe(WALLET_STATUSES.length);
    }
  });

  it.each([
    // state, colour set, icon, English, Sinhala (the status mapping table)
    ['valid', 'valid', 'checkmark-circle', 'Valid', 'වලංගුයි'],
    ['expired', 'expired', 'time', 'Expired', 'කල් ඉකුත් වූ'],
    ['revoked', 'revoked', 'ban', 'Revoked', 'අවලංගු කළ'],
    ['replaced', 'pending', 'swap-horizontal', 'Replaced', 'ප්‍රතිස්ථාපනය කළ'],
    // design rule: stale or offline status uses the expired colours
    ['notChecked', 'expired', 'cloud-offline', 'Not checked yet', 'තවම පරීක්ෂා කර නැත'],
    ['checking', 'pending', 'sync', 'Checking…', 'පරීක්ෂා කරමින්…'],
  ] as const)('%s → %s colours, icon %s, "%s"', (state, set, icon, english, sinhala) => {
    expect(STATUS_PRESENTATION[state]).toEqual({ set, icon });
    expect(en.status[state]).toBe(english);
    expect(si.status[state]).toBe(sinhala);
  });

  it.each(WALLET_STATUSES)(
    'StatusBadge "%s" is one text element with icon and label',
    async (status) => {
      await renderWithProviders(<StatusBadge status={status} />);
      const badge = screen.getByTestId(`status-${status}`);
      expect(badge.props.accessibilityLabel).toBe(en.status[status]);
      expect(badge.props.accessibilityRole).toBe('text');
      expect(screen.getByText(en.status[status])).toBeOnTheScreen();
    },
  );

  it('StatusBadge follows the language', async () => {
    await i18n.changeLanguage('si');
    await renderWithProviders(<StatusBadge status="replaced" />);
    expect(screen.getByText(si.status.replaced)).toBeOnTheScreen();
  });
});

describe('label parity with the issuer portal', () => {
  it.each(Object.entries(PORTAL_KEY_FOR))(
    'English "%s" = portal credentials.statuses.%s',
    (state, key) => {
      expect(en.status[state as keyof typeof PORTAL_KEY_FOR]).toBe(
        portalEn.credentials.statuses[key],
      );
    },
  );

  it.each(Object.entries(PORTAL_KEY_FOR))(
    'Sinhala "%s" = portal credentials.statuses.%s',
    (state, key) => {
      expect(si.status[state as keyof typeof PORTAL_KEY_FOR]).toBe(
        portalSi.credentials.statuses[key],
      );
    },
  );

  it('credential type names match the portal in both languages', () => {
    expect(en.credentialTypes).toEqual(portalEn.credentialTypes);
    expect(si.credentialTypes).toEqual(portalSi.credentialTypes);
  });
});
