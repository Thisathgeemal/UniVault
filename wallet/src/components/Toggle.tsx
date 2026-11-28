import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, space } from '../theme';
import { useTheme } from '../theme/use-theme';

export interface ToggleProps {
  /** Spoken label (the visible label next to it says the same). */
  label: string;
  value: boolean;
  onValueChange: (on: boolean) => void;
  disabled?: boolean;
  /** Spoken extra, e.g. why it is disabled. */
  hint?: string;
  testID?: string;
}

const TRACK_W = space(12);
const TRACK_H = space(7);
const THUMB = space(5);

/**
 * An on/off switch in the design tokens (track `accent` when on, `border-strong` when off, a
 * `surface` thumb that also moves: position, not colour alone), role "switch" with its checked
 * and disabled state announced, a 44 pt target. Controlled: the screen decides the value (e.g.
 * only after the OS biometric prompt or the PIN succeeded).
 */
export function Toggle({
  label,
  value,
  onValueChange,
  disabled = false,
  hint,
  testID,
}: ToggleProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      {...(hint ? { accessibilityHint: hint } : {})}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      testID={testID}
      hitSlop={space(2)}
      style={[styles.target, disabled ? styles.disabled : null]}
    >
      <View
        style={[
          styles.track,
          {
            borderRadius: theme.radius.pill,
            backgroundColor: value ? theme.colors.accent : theme.colors.borderStrong,
          },
          value ? styles.on : styles.off,
        ]}
      >
        <View
          style={[
            styles.thumb,
            { borderRadius: theme.radius.pill, backgroundColor: theme.colors.surface },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { minHeight: MIN_TOUCH_TARGET, minWidth: MIN_TOUCH_TARGET, justifyContent: 'center' },
  track: { width: TRACK_W, minHeight: TRACK_H, padding: space(1), justifyContent: 'center' },
  thumb: { width: THUMB, minHeight: THUMB },
  on: { alignItems: 'flex-end' },
  off: { alignItems: 'flex-start' },
  disabled: { opacity: 0.55 },
});
