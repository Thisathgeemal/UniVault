/**
 * The protected pages: ONE list used by both the router (with a RequireRole guard per route)
 * and the sidebar (filtered by the same roles), so the menu and the guards cannot disagree.
 */
import {
  FileBadge,
  KeyRound,
  LayoutDashboard,
  QrCode,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { ParseKeys } from 'i18next';
import type { Role } from '../api/auth.js';

export interface AppRoute {
  id: string;
  path: string;
  labelKey: ParseKeys;
  icon: LucideIcon;
  /** Roles allowed to open the page and see it in the menu. */
  roles: readonly Role[];
  /** Placeholder pages: the sprint the real page is planned for. */
  comingInSprint?: number;
}

const EVERYONE: readonly Role[] = ['admin', 'officer'];
const ADMIN_ONLY: readonly Role[] = ['admin'];

export const APP_ROUTES: readonly AppRoute[] = [
  { id: 'dashboard', path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, roles: EVERYONE },
  {
    id: 'holders',
    path: '/holders',
    labelKey: 'nav.holders',
    icon: Users,
    roles: EVERYONE,
  },
  {
    id: 'credentials',
    path: '/credentials',
    labelKey: 'nav.credentials',
    icon: FileBadge,
    roles: EVERYONE,
  },
  {
    id: 'credential-offers',
    path: '/credential-offers',
    labelKey: 'nav.credentialOffers',
    icon: QrCode,
    roles: EVERYONE,
    comingInSprint: 2,
  },
  {
    id: 'issuer-keys',
    path: '/issuer-keys',
    labelKey: 'nav.issuerKeys',
    icon: KeyRound,
    roles: ADMIN_ONLY,
    comingInSprint: 4,
  },
  {
    id: 'staff',
    path: '/staff',
    labelKey: 'nav.staff',
    icon: UserCog,
    roles: ADMIN_ONLY,
    comingInSprint: 4,
  },
];

export const canAccess = (route: Pick<AppRoute, 'roles'>, role: Role | undefined): boolean =>
  role !== undefined && route.roles.includes(role);
