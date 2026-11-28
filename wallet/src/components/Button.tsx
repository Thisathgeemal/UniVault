import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { buttonColors, MIN_TOUCH_TARGET, type ButtonVariant } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type { ButtonVariant };

export interface ButtonProps {
  label: string;
  onPress: () => void;
  /**
   * primary (azure: the ONE main action on a screen), secondary (every other action), text
   * (low weight, e.g. "View details"), destructive (revoke, delete), onBrand (on a navy header or
   * credential card), inverse (the primary action on a full-navy screen such as the lock screen:
   * on-brand fill, brand label), textOnBrand (a text button in on-brand on such a screen).
   */
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner, announces "busy" and blocks presses (e.g. while a check runs). */
  loading?: boolean;
  /** Decorative icon before the label (the label carries the meaning). */
  icon?: IconName;
  /** Spoken instead of the label when the label alone is ambiguous. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string | undefined;
}

/**
 * Accessible button in the design system's kinds: role "button", disabled/busy state announced,
 * at least 44 × 44 pt, radius-md, label 16 / weight 600. On onboarding and setup screens buttons
 * sit full width in BottomActions. With keyboard or switch-access focus it draws a 2 pt focus ring
 * 2 pt outside its edge: focus-ring, or focus-ring-on-brand for the navy kinds.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const inactive = disabled || loading;
  const colors = buttonColors(theme.colors, variant);
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        {
          borderRadius: theme.radius.md,
          paddingHorizontal: theme.space(4),
          paddingVertical: theme.space(2),
          backgroundColor: colors.bg,
          borderColor: colors.border,
          // disabled controls are exempt from WCAG contrast; the state is also announced
          opacity: inactive ? 0.55 : pressed ? 0.8 : 1,
        },
        focused ? { ...styles.focusRing, outlineColor: colors.focus } : null,
      ]}
    >
      <View style={[styles.row, { gap: theme.space(2) }]}>
        {loading ? (
          <ActivityIndicator color={colors.fg} testID={testID ? `${testID}-spinner` : undefined} />
        ) : icon ? (
          <Icon name={icon} size={20} color={colors.fg} />
        ) : null}
        {/* button labels: 16 / weight 600 (the h3 step; wallet typography) */}
        <AppText variant="h3" style={[styles.label, { color: colors.fg }]}>
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
  row: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  focusRing: { outlineWidth: 2, outlineOffset: 2, outlineStyle: 'solid' },
  label: { flexShrink: 1, textAlign: 'center' },
});
