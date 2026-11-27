import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** The four main tabs, in order: route file name (app/(tabs)/<name>.tsx), label key, icon. */
export const TAB_ROUTES = [
  { name: 'index', titleKey: 'tabs.credentials', icon: 'wallet-outline' },
  { name: 'scan', titleKey: 'tabs.scan', icon: 'qr-code-outline' },
  { name: 'history', titleKey: 'tabs.history', icon: 'time-outline' },
  { name: 'settings', titleKey: 'tabs.settings', icon: 'settings-outline' },
] as const satisfies readonly { name: string; titleKey: string; icon: IconName }[];
