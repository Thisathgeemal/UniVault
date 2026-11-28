import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface ListItemProps {
  title: string;
  subtitle?: string;
  /** Decorative leading icon (the title says what the row is). */
  icon?: IconName;
  /** Trailing value text, e.g. the current language. */
  value?: string;
  /** Makes the row pressable (role "button", 44 pt) with a trailing chevron. */
  onPress?: () => void;
  accessibilityHint?: string;
  testID?: string;
  /** Extra content under the text (rarely needed). */
  children?: ReactNode;
}

/** One row of a settings-style list: leading icon, title, subtitle, trailing value/chevron. */
export function ListItem({
  title,
  subtitle,
  icon,
  value,
  onPress,
  accessibilityHint,
  testID,
  children,
}: ListItemProps) {
  const theme = useTheme();
  const label = [title, value, subtitle].filter(Boolean).join(', ');
  const body = (
    <>
      {icon ? <Icon name={icon} color={theme.colors.textMuted} /> : null}
      <View style={styles.text}>
        <AppText variant="label">{title}</AppText>
        {subtitle ? (
          <AppText variant="caption" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
        {children}
      </View>
      {value ? (
        <AppText tone="muted" style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {onPress ? <Icon name="chevron-forward" size={20} color={theme.colors.textMuted} /> : null}
    </>
  );
  const rowStyle = {
    paddingHorizontal: theme.space(4),
    paddingVertical: theme.space(3),
    gap: theme.space(3),
    backgroundColor: theme.colors.surface,
  };
  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={label} style={[styles.row, rowStyle]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint ? { accessibilityHint } : {})}
      onPress={onPress}
      style={({ pressed }) => [styles.row, rowStyle, { opacity: pressed ? 0.7 : 1 }]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH_TARGET },
  text: { flex: 1, flexShrink: 1, gap: 2 },
  value: { flexShrink: 1, textAlign: 'right' },
});
