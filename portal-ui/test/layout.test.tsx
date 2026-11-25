/**
 * Render tests for the shared layout: active item, role filtering, the keyboard-accessible
 * mobile menu toggle and ARIA attributes. Labels are test strings: the package holds no text.
 */
import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  ComingSoon,
  ErrorBoundary,
  ErrorFallback,
  FullPageSpinner,
  isSidebarItemActive,
  PageHeader,
  Sidebar,
  visibleSidebarItems,
  type SidebarItem,
  type SidebarLinkProps,
} from '../src/index.js';

type Role = 'admin' | 'officer';
function Icon(props: { className?: string }) {
  return <svg data-testid="icon" {...props} />;
}
const ITEMS: SidebarItem<Role>[] = [
  { id: 'home', href: '/', label: 'Home', icon: Icon },
  { id: 'people', href: '/people', label: 'People', roles: ['admin', 'officer'] },
  { id: 'keys', href: '/keys', label: 'Keys', roles: ['admin'] },
];

function shell(role: Role = 'admin', activePath = '/people', onLogout = vi.fn()) {
  return render(
    <AppShell
      header={{
        appName: 'App',
        orgName: 'Org One',
        userName: 'Ada Admin',
        roleLabel: 'Administrator',
        logoutLabel: 'Sign out',
        onLogout,
        languageSwitcher: <span data-testid="lang-slot">EN</span>,
      }}
      sidebar={{ items: ITEMS, currentRole: role, activePath, label: 'Main navigation' }}
      labels={{ skipToContent: 'Skip to content', openMenu: 'Open menu', closeMenu: 'Close menu' }}
    >
      <p>Page body</p>
    </AppShell>,
  );
}

describe('Sidebar', () => {
  it('marks only the active item with aria-current="page"', () => {
    render(<Sidebar items={ITEMS} currentRole="admin" activePath="/people/42" label="Nav" />);
    const nav = screen.getByRole('navigation', { name: 'Nav' });
    expect(within(nav).getByRole('link', { name: 'People' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current');
    expect(within(nav).getByRole('link', { name: 'Keys' })).not.toHaveAttribute('aria-current');
  });

  it('filters items by role: an officer does not see admin items', () => {
    render(<Sidebar items={ITEMS} currentRole="officer" activePath="/" label="Nav" />);
    expect(screen.getByRole('link', { name: 'People' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Keys' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
  });

  it('shows only unrestricted items without a role', () => {
    expect(visibleSidebarItems(ITEMS, undefined).map((i) => i.id)).toEqual(['home']);
    expect(visibleSidebarItems(ITEMS, 'admin').map((i) => i.id)).toEqual([
      'home',
      'people',
      'keys',
    ]);
  });

  it('treats "/" as active only on "/" and other items on their sub-paths', () => {
    expect(isSidebarItemActive('/', '/')).toBe(true);
    expect(isSidebarItemActive('/', '/people')).toBe(false);
    expect(isSidebarItemActive('/people', '/people/1')).toBe(true);
    expect(isSidebarItemActive('/people', '/peoplex')).toBe(false);
  });

  it('uses the given link component and hides icons from assistive technology', async () => {
    const onNavigate = vi.fn();
    function TestLink({ href, children, ...props }: SidebarLinkProps) {
      return (
        <a
          data-router-link={href}
          href={href}
          {...props}
          onClick={(e) => (e.preventDefault(), props.onClick?.())}
        >
          {children}
        </a>
      );
    }
    render(
      <Sidebar
        items={ITEMS}
        currentRole="admin"
        activePath="/"
        label="Nav"
        linkComponent={TestLink}
        onNavigate={onNavigate}
      />,
    );
    const home = screen.getByRole('link', { name: 'Home' });
    expect(home).toHaveAttribute('data-router-link', '/');
    expect(screen.getByTestId('icon')).toHaveAttribute('aria-hidden', 'true');
    await userEvent.click(home);
    expect(onNavigate).toHaveBeenCalledOnce();
  });
});

describe('AppShell', () => {
  it('renders the header (org, user, role badge, language slot) and the content landmark', () => {
    shell();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByTestId('header-org')).toHaveTextContent('Org One');
    expect(screen.getByTestId('header-user')).toHaveTextContent('Ada Admin');
    expect(screen.getByText('Administrator')).toBeInTheDocument();
    expect(screen.getByTestId('lang-slot')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Page body');
    expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument();
  });

  it('has a skip link to the main content', () => {
    shell();
    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', `#${screen.getByRole('main').id}`);
  });

  it('calls onLogout from the logout button', async () => {
    const onLogout = vi.fn();
    shell('admin', '/', onLogout);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it('toggles the mobile menu with the keyboard, with aria-expanded and aria-controls', async () => {
    const user = userEvent.setup();
    shell();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    const sidebar = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(sidebar).not.toBeNull();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(sidebar).toHaveAttribute('data-state', 'closed');

    // Reach it by keyboard: skip link first, then the menu button
    await user.tab();
    await user.tab();
    expect(toggle).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName('Close menu');
    expect(sidebar).toHaveAttribute('data-state', 'open');

    // Escape closes it and returns focus to the toggle
    await user.tab();
    await user.keyboard('{Escape}');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveFocus();

    await user.keyboard(' ');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes the mobile menu when a link is chosen or the backdrop is clicked', async () => {
    const user = userEvent.setup();
    shell();
    const toggle = screen.getByRole('button', { name: 'Open menu' });
    await user.click(toggle);
    await user.click(screen.getByTestId('app-menu-backdrop'));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);
    const link = screen.getByRole('link', { name: 'Home' });
    link.addEventListener('click', (e) => e.preventDefault());
    await user.click(link);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('page building blocks', () => {
  it('PageHeader renders one h1, the description and actions', () => {
    render(<PageHeader title="Holders" description="All holders" actions={<button>New</button>} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Holders' })).toBeInTheDocument();
    expect(screen.getByText('All holders')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
  });

  it('ComingSoon shows the title, badge and description', () => {
    render(<ComingSoon title="Staff" description="Arrives in Sprint 4" badge="Coming soon" />);
    expect(screen.getByRole('heading', { name: 'Staff' })).toBeInTheDocument();
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByText('Arrives in Sprint 4')).toBeInTheDocument();
  });

  it('FullPageSpinner is a polite status with its label', () => {
    render(<FullPageSpinner label="Loading…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('ErrorFallback is an alert with an optional reference and retry', async () => {
    const onRetry = vi.fn();
    render(
      <ErrorFallback
        title="Oops"
        message="Try again"
        reference="Ref: abc"
        retryLabel="Retry"
        onRetry={onRetry}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Ref: abc');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('ErrorBoundary shows the fallback for a render error and can reset', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onError = vi.fn();
    function Bomb({ explode }: { explode: boolean }): ReactNode {
      if (explode) throw new Error('boom');
      return <p>Recovered</p>;
    }
    function Harness() {
      const [explode, setExplode] = useState(true);
      return (
        <ErrorBoundary
          onError={onError}
          fallback={(_error, reset) => (
            <button
              onClick={() => {
                setExplode(false);
                reset();
              }}
            >
              Reset
            </button>
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      );
    }
    render(<Harness />);
    expect(onError).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
