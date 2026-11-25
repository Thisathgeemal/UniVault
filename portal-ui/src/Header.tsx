import type { ReactNode } from 'react';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';

export interface HeaderMenuButton {
  id: string;
  expanded: boolean;
  /** id of the element the button shows and hides */
  controls: string;
  onToggle: () => void;
  label: string;
}

export interface HeaderProps {
  appName: string;
  orgName: string;
  userName: string;
  roleLabel: string;
  logoutLabel: string;
  onLogout: () => void;
  logoutPending?: boolean;
  /** e.g. the portal's language switcher */
  languageSwitcher?: ReactNode;
  /** Mobile menu toggle (AppShell passes it) */
  menuButton?: HeaderMenuButton;
}

function MenuIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function Header({
  appName,
  orgName,
  userName,
  roleLabel,
  logoutLabel,
  onLogout,
  logoutPending = false,
  languageSwitcher,
  menuButton,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 flex h-header items-center gap-3 border-b border-border bg-surface px-4">
      {menuButton ? (
        <Button
          id={menuButton.id}
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-expanded={menuButton.expanded}
          aria-controls={menuButton.controls}
          aria-label={menuButton.label}
          onClick={menuButton.onToggle}
        >
          <MenuIcon />
        </Button>
      ) : null}
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {appName}
        </span>
        <span className="truncate font-semibold" data-testid="header-org">
          {orgName}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {languageSwitcher}
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-sm font-medium" data-testid="header-user">
            {userName}
          </span>
          <Badge variant="accent">{roleLabel}</Badge>
        </div>
        <Button variant="outline" size="sm" onClick={onLogout} disabled={logoutPending}>
          {logoutLabel}
        </Button>
      </div>
    </header>
  );
}
