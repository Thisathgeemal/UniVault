/**
 * @univault/portal-ui – app-agnostic building blocks shared by the UniVault web portals
 * (issuer portal now; verifier portal in Sprint 3). No routes, API calls or text strings:
 * every label is passed in already translated.
 */
export { cn } from './cn.js';
export {
  AppShell,
  APP_MENU_BUTTON_ID,
  APP_SIDEBAR_ID,
  MAIN_CONTENT_ID,
  type AppShellProps,
} from './AppShell.js';
export { Header, type HeaderMenuButton, type HeaderProps } from './Header.js';
export {
  isSidebarItemActive,
  Sidebar,
  visibleSidebarItems,
  type SidebarItem,
  type SidebarLinkProps,
  type SidebarProps,
} from './Sidebar.js';
export { PageHeader, type PageHeaderProps } from './PageHeader.js';
export {
  ComingSoon,
  EmptyState,
  type ComingSoonProps,
  type EmptyStateProps,
} from './EmptyState.js';
export {
  ErrorBoundary,
  ErrorFallback,
  type ErrorBoundaryProps,
  type ErrorFallbackProps,
} from './ErrorFallback.js';
export { FullPageSpinner, type FullPageSpinnerProps } from './FullPageSpinner.js';
export { Alert, alertVariants, type AlertProps } from './ui/alert.js';
export { Badge, badgeVariants, type BadgeProps } from './ui/badge.js';
export { Button, buttonVariants, type ButtonProps } from './ui/button.js';
export { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
export { Input } from './ui/input.js';
export { Label } from './ui/label.js';
