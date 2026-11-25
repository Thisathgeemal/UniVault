import type { ComponentType, ReactNode } from 'react';
import { cn } from './cn.js';

/** One navigation entry. Labels are passed in already translated; this package holds no text. */
export interface SidebarItem<R extends string = string> {
  id: string;
  href: string;
  label: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' }>;
  /** Roles that may see the item. Omitted = everyone signed in. */
  roles?: readonly R[];
}

/** Props given to the link component, so a portal can plug in its router's <Link>. */
export interface SidebarLinkProps {
  href: string;
  className: string;
  'aria-current'?: 'page';
  onClick?: () => void;
  children: ReactNode;
}

export interface SidebarProps<R extends string = string> {
  items: readonly SidebarItem<R>[];
  /** Current user's role: items whose `roles` exclude it are not shown. */
  currentRole?: R | undefined;
  /** Current path, for the active item. */
  activePath: string;
  /** Accessible name of the navigation landmark (e.g. "Main navigation"). */
  label: string;
  linkComponent?: ComponentType<SidebarLinkProps>;
  /** Called after a link is chosen (AppShell closes the mobile menu with it). */
  onNavigate?: () => void;
  id?: string;
  className?: string;
}

/** Items the role may see: the same rule a portal's route guards should use. */
export function visibleSidebarItems<R extends string>(
  items: readonly SidebarItem<R>[],
  role: R | undefined,
): SidebarItem<R>[] {
  return items.filter((item) => !item.roles || (role !== undefined && item.roles.includes(role)));
}

/** "/" is active only on "/"; any other item is active on its path and paths below it. */
export function isSidebarItemActive(href: string, activePath: string): boolean {
  if (href === '/') return activePath === '/';
  return activePath === href || activePath.startsWith(`${href}/`);
}

function PlainLink({ href, children, ...props }: SidebarLinkProps) {
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}

export function Sidebar<R extends string = string>({
  items,
  currentRole,
  activePath,
  label,
  linkComponent: Link = PlainLink,
  onNavigate,
  id,
  className,
}: SidebarProps<R>) {
  return (
    <nav aria-label={label} id={id} className={cn('flex flex-col gap-1 p-3', className)}>
      <ul className="flex flex-col gap-1">
        {visibleSidebarItems(items, currentRole).map((item) => {
          const active = isSidebarItemActive(item.href, activePath);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                {...(active ? { 'aria-current': 'page' as const } : {})}
                {...(onNavigate ? { onClick: onNavigate } : {})}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-muted',
                  active
                    ? 'bg-sidebar-active text-white'
                    : 'text-sidebar-foreground hover:bg-white/10',
                )}
              >
                {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
