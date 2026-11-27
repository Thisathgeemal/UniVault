import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Button } from './Button';

export interface EmptyStateProps {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  message: string;
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/** "Nothing here yet" panel: decorative icon (hidden from screen readers), title, explanation. */
export function EmptyState({ icon, title, message, action, testID }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.root, { gap: theme.space(3), padding: theme.space(6) }]}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[
          styles.iconCircle,
          { backgroundColor: theme.colors.muted, borderRadius: theme.radii.full },
        ]}
      >
        <Ionicons name={icon} size={36} color={theme.colors.primary} />
      </View>
      <AppText variant="heading" accessibilityRole="header" style={styles.center}>
        {title}
      </AppText>
      <AppText tone="muted" style={styles.center}>
        {message}
      </AppText>
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
