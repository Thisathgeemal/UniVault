/**
 * The four main tabs. Labels are translated; icons are decorative (the label is what screen
 * readers announce). Tab bar items are at least 44 pt tall.
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useTranslation } from 'react-i18next';
import { TAB_ROUTES } from '../../src/navigation/tabs';
import { MIN_TOUCH_TARGET } from '../../src/theme';
import { useTheme } from '../../src/theme/use-theme';

export default function TabsLayout() {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        tabBarItemStyle: { minHeight: MIN_TOUCH_TARGET },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.foreground },
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      {TAB_ROUTES.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.titleKey),
            tabBarIcon: ({ focused, size }) => (
              <Ionicons
                name={tab.icon}
                size={size}
                color={focused ? theme.colors.primary : theme.colors.mutedForeground}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
