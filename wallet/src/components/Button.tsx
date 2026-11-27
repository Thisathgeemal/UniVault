import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** Shows a spinner and blocks presses (e.g. while a check runs). */
  busy?: boolean;
  /** Spoken instead of the label when the label alone is ambiguous. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}

/** Accessible button: role "button", disabled/busy state announced, at least 44 pt tall. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  busy = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || busy;
  const primary = variant === 'primary';
  const foreground = primary ? theme.colors.primaryForeground : theme.colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radii.lg,
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(2),
          backgroundColor: primary ? theme.colors.primary : theme.colors.surface,
          borderColor: theme.colors.primary,
          opacity: inactive ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={foreground} /> : null}
        <AppText variant="label" style={{ color: foreground }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
