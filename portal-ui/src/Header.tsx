import type { ComponentType, ReactNode } from 'react';
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

/**
 * The portal's role tag next to the UniVault name: the ONLY visual difference between the
 * issuer portal ("Issuer portal", certificate icon) and the verifier portal ("Verifier portal",
 * shield-check icon). Both passed in: this package holds no text and no icon library.
 */
export interface RoleTag {
  label: string;
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
}

export interface HeaderProps {
  /** "UniVault" */
  appName: string;
  roleTag: RoleTag;
  orgName: string;
  userName: string;
  roleLabel: string;
  logoutLabel: string;
  onLogout: () => void;
  logoutPending?: boolean;
  /** e.g. the portal's language switcher (must be styled for the navy bar) */
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

/**
 * The navy top bar: UniVault name + role tag (role-tag-bg pill, on-brand text, radius-pill),
 * organisation, user with their role, language switcher and logout (on-brand buttons). Focus
 * rings inside it use focus-ring-on-brand (azure on navy is below 3:1).
 */
export function Header({
  appName,
  roleTag,
  orgName,
  userName,
  roleLabel,
  logoutLabel,
  onLogout,
  logoutPending = false,
  languageSwitcher,
  menuButton,
}: HeaderProps) {
  const TagIcon = roleTag.icon;
  return (
    <header className="sticky top-0 z-40 flex h-header items-center gap-3 bg-brand px-4 text-on-brand">
      {menuButton ? (
        <Button
          id={menuButton.id}
          variant="onBrand"
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
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-h3 text-on-brand">{appName}</span>
        <span
          data-testid="role-tag"
          className="inline-flex items-center gap-1.5 rounded-pill bg-role-tag-bg px-3 py-1 text-caption font-semibold text-on-brand"
        >
          <TagIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
          {roleTag.label}
        </span>
        <span
          className="hidden truncate text-body-sm text-on-brand-muted sm:inline"
          data-testid="header-org"
        >
          {orgName}
        </span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        {languageSwitcher}
        <div className="hidden flex-col items-end sm:flex">
          <span className="text-label text-on-brand" data-testid="header-user">
            {userName}
          </span>
          <Badge variant="onBrand">{roleLabel}</Badge>
        </div>
        <Button variant="onBrand" size="sm" onClick={onLogout} disabled={logoutPending}>
          {logoutLabel}
        </Button>
      </div>
    </header>
  );
}
