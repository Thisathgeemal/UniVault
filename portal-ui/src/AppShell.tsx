import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Header, type HeaderProps } from './Header.js';
import { Sidebar, type SidebarProps } from './Sidebar.js';

export const APP_SIDEBAR_ID = 'app-sidebar';
export const APP_MENU_BUTTON_ID = 'app-menu-button';
export const MAIN_CONTENT_ID = 'main-content';

export interface AppShellProps<R extends string = string> {
  header: Omit<HeaderProps, 'menuButton'>;
  sidebar: Omit<SidebarProps<R>, 'id' | 'onNavigate'>;
  /** Accessible labels (already translated). */
  labels: { skipToContent: string; openMenu: string; closeMenu: string };
  children: ReactNode;
}

/**
 * Page frame ("Navy and azure"): the navy top bar with the role tag, the navy sidebar (240 px)
 * on the left and the content on bg. Header on top, sidebar on the left (a toggled drawer below the md breakpoint)
 * and the main content. Keyboard: a skip link to the content; the menu button is a real
 * <button> (Enter/Space) with aria-expanded and aria-controls; Escape closes the open menu and
 * returns focus to the button; choosing a link closes it.
 */
export function AppShell<R extends string = string>({
  header,
  sidebar,
  labels,
  children,
}: AppShellProps<R>) {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      document.getElementById(APP_MENU_BUTTON_ID)?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-bg text-body text-text">
      <a
        href={`#${MAIN_CONTENT_ID}`}
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-4 focus:py-2 focus:shadow focus:outline-none focus:ring-2 focus:ring-focus-ring"
      >
        {labels.skipToContent}
      </a>
      <Header
        {...header}
        menuButton={{
          id: APP_MENU_BUTTON_ID,
          expanded: menuOpen,
          controls: APP_SIDEBAR_ID,
          onToggle: () => setMenuOpen((open) => !open),
          label: menuOpen ? labels.closeMenu : labels.openMenu,
        }}
      />
      <div className="flex">
        {menuOpen ? (
          <div
            aria-hidden="true"
            data-testid="app-menu-backdrop"
            className="fixed inset-0 top-header z-20 bg-text/40 md:hidden"
            onClick={closeMenu}
          />
        ) : null}
        <aside
          id={APP_SIDEBAR_ID}
          data-state={menuOpen ? 'open' : 'closed'}
          className={cn(
            'w-sidebar shrink-0 bg-brand',
            'fixed bottom-0 left-0 top-header z-30 overflow-y-auto md:sticky md:block md:h-[calc(100vh-var(--spacing-header))]',
            menuOpen ? 'block' : 'hidden',
          )}
        >
          <Sidebar {...sidebar} onNavigate={closeMenu} />
        </aside>
        <main
          id={MAIN_CONTENT_ID}
          tabIndex={-1}
          className="min-w-0 flex-1 p-page focus:outline-none"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
