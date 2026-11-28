import { Pressable, StyleSheet } from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface CheckboxProps {
  /** Already translated; the whole row is the target and the spoken label. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  testID?: string;
}

/**
 * A checkbox row: role "checkbox" with its checked state announced, a filled / empty box icon
 * (shape, not colour alone), 44 pt, text wraps. Used for "I understand" on the Privacy screen.
 */
export function Checkbox({ label, checked, onChange, testID }: CheckboxProps) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      testID={testID}
      style={({ pressed }) => [
        styles.row,
        { gap: theme.space(3), paddingVertical: theme.space(2), opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={28}
        color={theme.colors.accentText}
      />
      <AppText style={styles.label}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  label: { flexShrink: 1 },
});
