import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface ProcessingStateProps {
  /** What is happening, e.g. "Saving your PIN…" (already translated). */
  message: string;
  testID: string;
}

/**
 * The processing state (design-system.md): an indeterminate spinner (a native view, so it keeps
 * turning while the JS thread hashes) and the message, as ONE busy progressbar element that is
 * announced when it appears (live region + announceForAccessibility for iOS). Left-aligned under
 * the content it belongs to; the caller disables the controls and keeps it up for at least
 * PROCESSING_MIN_MS (src/lib/timing.ts).
 */
export function ProcessingState({ message, testID }: ProcessingStateProps) {
  const theme = useTheme();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[styles.row, { gap: theme.space(3) }]}
    >
      <ActivityIndicator color={theme.colors.accentText} />
      <AppText style={styles.text}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, flexShrink: 1 },
});
