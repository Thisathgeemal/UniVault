/**
 * The "Navy and azure" design system in the issuer portal (docs/design/design-system.md):
 * the status mapping table, the role tag in the navy top bar, the navy sidebar, page frames on
 * bg with surface cards, and AT MOST ONE primary (azure) action on every page.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import { ArrowLeftRight, Ban, CircleCheck, Clock, Hourglass } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import type { EffectiveStatus } from '../src/api/credentials.js';
import { CredentialStatusBadge } from '../src/credentials/CredentialStatusBadge.js';
import { STATUS_PRESENTATION } from '../src/credentials/status.js';
import { setupI18n } from '../src/i18n/index.js';
import { en } from '../src/i18n/locales/en.js';
import { si } from '../src/i18n/locales/si.js';
import { ADMIN, addPendingCredential, HOLDER_IDS } from './mock-backend.js';
import { renderApp } from './render-app.js';

describe('status mapping table', () => {
  it.each([
    ['valid', 'valid', CircleCheck, 'Valid', 'වලංගුයි'],
    ['pending', 'pending', Hourglass, 'Awaiting wallet', 'පසුම්බිය සඳහා රැඳී ඇති'],
    ['revoked', 'revoked', Ban, 'Revoked', 'අවලංගු කළ'],
    ['superseded', 'pending', ArrowLeftRight, 'Replaced', 'ප්‍රතිස්ථාපනය කළ'],
    ['expired', 'expired', Clock, 'Expired', 'කල් ඉකුත් වූ'],
  ] as const)('%s → %s colours, its own icon and word', (status, set, icon, word, sinhala) => {
    expect(STATUS_PRESENTATION[status]).toEqual({ set, icon });
    expect(en.credentials.statuses[status]).toBe(word);
    expect(si.credentials.statuses[status]).toBe(sinhala);
    // the holder page uses the same words
    expect(en.holders.statuses[status]).toBe(word);
    expect(si.holders.statuses[status]).toBe(sinhala);
  });

  it('every status has a distinct icon + word pair (never colour alone)', () => {
    const pairs = Object.entries(STATUS_PRESENTATION).map(
      ([status, p]) => `${p.icon.displayName ?? String(p.icon)}|${status}`,
    );
    expect(new Set(pairs).size).toBe(5);
    expect(new Set(Object.values(STATUS_PRESENTATION).map((p) => p.icon)).size).toBe(5);
  });

  it.each(Object.keys(STATUS_PRESENTATION) as EffectiveStatus[])(
    'CredentialStatusBadge "%s" shows the icon and the word in its status colour set',
    (status) => {
      setupI18n('en');
      render(<CredentialStatusBadge status={status} />);
      const badge = screen.getByText(en.credentials.statuses[status]);
      expect(badge).toHaveAttribute('data-status', STATUS_PRESENTATION[status].set);
      expect(badge.className).toContain(`bg-status-${STATUS_PRESENTATION[status].set}-bg`);
      expect(badge.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    },
  );
});

describe('portal frame', () => {
  it('navy top bar with the "Issuer portal" role tag (certificate icon) and navy sidebar', async () => {
    renderApp('/', { signedInAs: ADMIN });
    const tag = await screen.findByTestId('role-tag');
    expect(tag).toHaveTextContent('Issuer portal');
    expect(tag.querySelector('svg')).not.toBeNull();
    expect(tag.className).toContain('bg-role-tag-bg');
    expect(tag.className).toContain('rounded-pill');
    const banner = screen.getByRole('banner');
    expect(banner.className).toContain('bg-brand');
    expect(within(banner).getByText('UniVault')).toBeInTheDocument();
    expect(document.getElementById('app-sidebar')?.className).toContain('bg-brand');
    const active = screen.getByRole('link', { name: en.nav.dashboard });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.className).toContain('bg-brand-hover');
    // the page title is text on bg, not navy
    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.className).toContain('text-text');
  });

  it('tables have surface-sunken header rows', async () => {
    renderApp('/holders', { signedInAs: ADMIN });
    const table = await screen.findByRole('table');
    expect(table.querySelector('thead')?.className).toContain('bg-surface-sunken');
  });
});

describe('one primary (azure) action per page', () => {
  const primaries = () => document.querySelectorAll('button.bg-accent, a.bg-accent');

  it.each([
    ['/login', false],
    ['/', true],
    ['/holders', true],
    ['/holders?q=zzz', true],
    ['/holders/new', true],
    [`/holders/${HOLDER_IDS.lahiru}`, true],
    ['/credentials', true],
    [`/credentials/new?holderId=${HOLDER_IDS.lahiru}`, true],
  ] as const)('%s has at most one primary button', async (path, signedIn) => {
    renderApp(path, signedIn ? { signedInAs: ADMIN } : {});
    if (signedIn) await screen.findByRole('heading', { level: 1 });
    else await screen.findByRole('button', { name: en.login.submit });
    await waitFor(() => expect(screen.queryByRole('status', { name: /loading/i })).toBeNull());
    expect(primaries().length).toBeLessThanOrEqual(1);
  });

  it.each(['valid', 'pending', 'expired', 'revoked', 'superseded'] as const)(
    'a %s credential page has at most one primary button; Revoke is destructive',
    async (status) => {
      const id = addPendingCredential(HOLDER_IDS.lahiru, status);
      renderApp(`/credentials/${id}`, { signedInAs: ADMIN });
      await screen.findByRole('heading', { level: 1 });
      await screen.findAllByText(en.credentials.statuses[status]);
      expect(primaries().length).toBeLessThanOrEqual(1);
      const revoke = screen.queryByRole('button', { name: en.credentials.actions.revoke });
      if (revoke) expect(revoke).toHaveAttribute('data-variant', 'destructive');
    },
  );

  it('the reissue page has exactly one primary (the reissue itself)', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'valid');
    renderApp(`/credentials/${id}/reissue`, { signedInAs: ADMIN });
    await screen.findByRole('heading', { level: 1 });
    await waitFor(() => expect(primaries().length).toBe(1));
  });

  it('the offer page has at most one primary', async () => {
    const id = addPendingCredential(HOLDER_IDS.lahiru, 'pending');
    renderApp(`/credentials/${id}/offer`, { signedInAs: ADMIN });
    await screen.findByRole('heading', { level: 1 });
    await screen.findByRole('img', { name: /qr/i });
    expect(primaries().length).toBeLessThanOrEqual(1);
  });
});
