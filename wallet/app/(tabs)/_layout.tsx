/**
 * The four main tabs, each with its own Stack (app/(tabs)/<tab>/_layout.tsx), so a tab keeps
 * its place when you switch away and back. Labels and accessibility labels are translated;
 * icons are decorative (outline / filled for unselected / selected, so the selection is not
 * shown by colour alone). Tab bar items are at least 44 pt tall.
 *
 * Back behaviour (Android hardware back, follows the platform norm): back pops the current
 * tab's stack; at a tab's root it goes to the Credentials tab (backBehavior "firstRoute"); only
 * at the Credentials root does it leave the app. Pressing the selected tab again returns to its
 * root.
 */
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../src/components';
import { TAB_ROUTES } from '../../src/navigation/tabs';
import { MIN_TOUCH_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme/use-theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tabs
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false, // each tab's Stack draws the shared Header
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarItemStyle: { minHeight: MIN_TOUCH_TARGET },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      {TAB_ROUTES.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarAccessibilityLabel: t(tab.titleKey),
            tabBarButtonTestID: `tab-${tab.name}`,
            tabBarIcon: ({ focused, size }) => (
              <Icon
                name={focused ? tab.activeIcon : tab.icon}
                size={size}
                color={focused ? theme.colors.accent : theme.colors.textMuted}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
