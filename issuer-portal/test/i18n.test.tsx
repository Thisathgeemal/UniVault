/**
 * NFR-02: English and Sinhala. Switching changes the text and <html lang> and is remembered
 * (localStorage, preference only). Both resource files have the same keys.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { i18n, LANGUAGE_STORAGE_KEY, setupI18n, storedLanguage } from '../src/i18n/index.js';
import { en } from '../src/i18n/locales/en.js';
import { si } from '../src/i18n/locales/si.js';
import { ADMIN } from './mock-backend.js';
import { renderApp } from './render-app.js';

const SINHALA = /[඀-෿]/;

function keys(value: unknown, prefix = ''): string[] {
  if (typeof value === 'string') return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    keys(v, prefix ? `${prefix}.${k}` : k),
  );
}
const leaf = (obj: unknown, key: string) =>
  key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], obj) as string;

describe('language switch', () => {
  it('switches the login page to Sinhala, sets <html lang> and remembers the choice', async () => {
    const { user } = renderApp('/login');
    expect(document.documentElement.lang).toBe('en');
    await user.selectOptions(await screen.findByLabelText('Language'), 'si');
    expect(await screen.findByRole('button', { name: si.login.submit })).toBeInTheDocument();
    expect(screen.getByLabelText(si.login.email)).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('si');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('si');
    expect(storedLanguage()).toBe('si');
  });

  it('switches the header and navigation, and back to English', async () => {
    const { user } = renderApp('/', { signedInAs: ADMIN });
    await screen.findByRole('navigation', { name: 'Main navigation' });
    await user.selectOptions(screen.getByLabelText('Language'), 'si');
    const nav = await screen.findByRole('navigation', { name: si.nav.label });
    expect(within(nav).getByRole('link', { name: si.nav.holders })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: si.header.signOut })).toBeInTheDocument();
    expect(screen.getAllByText(si.roles.admin)).toHaveLength(1); // header badge

    await user.selectOptions(screen.getByLabelText(si.language.label), 'en');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
  });

  it('starts in the stored language; ignores an unknown stored value', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'si');
    expect(storedLanguage()).toBe('si');
    setupI18n(storedLanguage());
    expect(i18n.language).toBe('si');
    expect(document.documentElement.lang).toBe('si');
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr');
    expect(storedLanguage()).toBe('en');
  });
});

describe('resource files', () => {
  it('Sinhala has exactly the English keys, every value in Sinhala script (except names)', () => {
    expect(keys(si).sort()).toEqual(keys(en).sort());
    // language.en is a name; breakdown.value is only numbers and punctuation: "{{count}} ({{percent}})"
    const latinAllowed = new Set(['language.en', 'dashboard.breakdown.value', 'app.brand']);
    for (const key of keys(si)) {
      if (latinAllowed.has(key)) continue;
      expect(leaf(si, key), key).toMatch(SINHALA);
    }
  });

  it('keeps every interpolation placeholder in both languages', () => {
    const placeholders = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort();
    for (const key of keys(en)) {
      expect(placeholders(leaf(si, key)), key).toEqual(placeholders(leaf(en, key)));
    }
  });
});

describe('one wording per status', () => {
  // Dashboard card, holder and offer screens, credentials table badge and tab, credential page
  const AWAITING = [
    'dashboard.cards.awaitingWallet.label',
    'holders.statuses.pending',
    'credentials.statuses.pending',
    'credentials.list.tabs.pending',
  ];
  it.each([
    ['en', en],
    ['si', si],
  ])('"Awaiting wallet" is the same everywhere (%s)', (_name, resources) => {
    expect(new Set(AWAITING.map((key) => leaf(resources, key))).size).toBe(1);
  });

  it('Sinhala sentences about pending credentials use the same phrase', () => {
    const label = leaf(si, 'credentials.statuses.pending');
    for (const key of [
      'credentials.detail.events.pending',
      'credentials.list.empty.pending.title',
      'credentials.conflicts.notReissuable',
      'offer.states.notPending.title',
    ]) {
      expect(leaf(si, key)).toContain(label);
    }
  });

  it('"Renew" is අලුත් කරන්න in every renew label', () => {
    expect(leaf(si, 'credentials.actions.renew')).toBe('අලුත් කරන්න');
    for (const key of ['credentials.reissue.renewTitle', 'credentials.reissue.submitRenew']) {
      expect(leaf(si, key)).toContain('අලුත් කරන්න');
    }
  });
});
