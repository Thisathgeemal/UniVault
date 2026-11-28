import type { IconName } from '../components/Icon';

/**
 * The four main tabs, in order: route folder (app/(tabs)/<name>/, each with its own Stack),
 * label key, icon (outline when inactive, filled when selected).
 */
export const TAB_ROUTES = [
  {
    name: 'credentials',
    titleKey: 'tabs.credentials',
    icon: 'wallet-outline',
    activeIcon: 'wallet',
  },
  {
    name: 'scan',
    titleKey: 'tabs.scan',
    icon: 'qr-code-outline',
    activeIcon: 'qr-code',
  },
  {
    name: 'history',
    titleKey: 'tabs.history',
    icon: 'time-outline',
    activeIcon: 'time',
  },
  {
    name: 'settings',
    titleKey: 'tabs.settings',
    icon: 'settings-outline',
    activeIcon: 'settings',
  },
] as const satisfies readonly {
  name: string;
  titleKey: string;
  icon: IconName;
  activeIcon: IconName;
}[];
