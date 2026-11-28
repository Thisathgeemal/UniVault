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
export { Header, type HeaderMenuButton, type HeaderProps, type RoleTag } from './Header.js';
export {
  isSidebarItemActive,
  Sidebar,
  visibleSidebarItems,
  type SidebarItem,
  type SidebarLinkProps,
  type SidebarProps,
} from './Sidebar.js';
export { PageHeader, type PageHeaderProps } from './PageHeader.js';
export { StatCard, type StatCardLinkProps, type StatCardProps } from './StatCard.js';
export {
  StackedBar,
  type StackedBarProps,
  type StackedBarSegment,
  type StackedBarTone,
} from './StackedBar.js';
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
export { Skeleton } from './ui/skeleton.js';
export {
  DataTable,
  type DataTableColumn,
  type DataTableProps,
  type DataTableSort,
  type SortDirection,
} from './DataTable.js';
export { Pagination, type PaginationLabels, type PaginationProps } from './Pagination.js';
export { SearchInput, type SearchInputProps } from './SearchInput.js';
export {
  fieldErrorId,
  fieldHintId,
  FormField,
  type FormControlProps,
  type FormFieldProps,
} from './FormField.js';
export { ErrorSummary, type ErrorSummaryItem, type ErrorSummaryProps } from './ErrorSummary.js';
export {
  STATUS_SET_CLASSES,
  StatusBadge,
  type StatusBadgeProps,
  type StatusSet,
} from './StatusBadge.js';
export {
  ToastProvider,
  useToast,
  type ToastApi,
  type ToastOptions,
  type ToastProviderProps,
  type ToastTone,
} from './Toast.js';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog.js';
export { Tooltip, type TooltipProps } from './Tooltip.js';
export { Select } from './ui/select.js';
export { Stepper, type StepperProps, type StepperStep } from './Stepper.js';
export {
  CredentialCardPreview,
  type CredentialCardItem,
  type CredentialCardPreviewProps,
  type CredentialCardSection,
} from './CredentialCardPreview.js';
export {
  QR_ERROR_CORRECTION,
  QR_QUIET_ZONE,
  QrCode,
  qrMatrix,
  qrPath,
  type QrCodeProps,
  type QrMatrix,
} from './QrCode.js';
export { Countdown, formatCountdown, type CountdownProps } from './Countdown.js';
export { FullscreenOverlay, type FullscreenOverlayProps } from './FullscreenOverlay.js';
export { Dialog, type DialogProps } from './Dialog.js';
export { ActionMenu, type ActionMenuItem, type ActionMenuProps } from './ActionMenu.js';
export { FilterTabs, type FilterTab, type FilterTabsProps } from './FilterTabs.js';
export { CopyButton, type CopyButtonProps } from './CopyButton.js';
