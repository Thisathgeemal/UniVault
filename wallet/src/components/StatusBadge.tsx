import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export type BadgeTone = 'success' | 'danger' | 'info' | 'neutral';

export interface StatusBadgeProps {
  /** Already translated, e.g. t('diagnostics.pass'). Colour is never the only signal. */
  label: string;
  tone: BadgeTone;
  testID?: string;
}

/** A small status pill. The text carries the meaning; the colour only reinforces it. */
export function StatusBadge({ label, tone, testID }: StatusBadgeProps) {
  const { colors, radii, space } = useTheme();
  const palette = {
    success: { bg: colors.successMuted, fg: colors.success },
    danger: { bg: colors.destructiveMuted, fg: colors.destructive },
    info: { bg: colors.infoMuted, fg: colors.info },
    neutral: { bg: colors.muted, fg: colors.mutedForeground },
  }[tone];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          backgroundColor: palette.bg,
          borderRadius: radii.full,
          paddingHorizontal: space(3),
          paddingVertical: space(1),
        },
      ]}
    >
      <AppText variant="label" style={{ color: palette.fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start' },
});
