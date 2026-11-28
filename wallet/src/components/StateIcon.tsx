import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { Icon, type IconName } from './Icon';

/** The decorative icon circle of EmptyState / ErrorState (hidden from screen readers). */
export function StateIcon({ name, danger = false }: { name: IconName; danger?: boolean }) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.circle,
        {
          backgroundColor: danger ? theme.colors.statusRevokedBg : theme.colors.surfaceSunken,
          borderRadius: theme.radius.pill,
          padding: theme.space(4),
        },
      ]}
    >
      <Icon
        name={name}
        size={36}
        color={danger ? theme.colors.statusRevoked : theme.colors.textMuted}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center' },
});
