import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Button } from './Button';
import type { IconName } from './Icon';
import { StateIcon } from './StateIcon';

export interface EmptyStateProps {
  icon: IconName;
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
      <StateIcon name={icon} />
      <AppText variant="h2" accessibilityRole="header" style={styles.center}>
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
  center: { textAlign: 'center' },
});
