import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface ProcessingStateProps {
  /** What is happening, e.g. "Securing your PIN…" (already translated; no technical words). */
  message: string;
  testID: string;
  /**
   * The whole screen is the progress state (a step of its own, e.g. after the PIN is confirmed):
   * a large spinner and the message, centred. Default: one row under the content it belongs to.
   */
  fullScreen?: boolean;
}

/**
 * The processing state (design-system.md): an indeterminate spinner (a native view, so it keeps
 * turning while the JS thread hashes) and the message, as ONE busy progressbar element that is
 * announced when it appears (live region + announceForAccessibility for iOS). Inline: left-aligned
 * under the content it belongs to; full screen: centred. The caller disables (or removes) the
 * controls and keeps it up for at least PROCESSING_MIN_MS (src/lib/timing.ts).
 */
export function ProcessingState({ message, testID, fullScreen = false }: ProcessingStateProps) {
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
      style={
        fullScreen
          ? [styles.screen, { padding: theme.space(4), gap: theme.space(4) }]
          : [styles.row, { gap: theme.space(3) }]
      }
    >
      <ActivityIndicator color={theme.colors.accentText} size={fullScreen ? 'large' : 'small'} />
      <AppText style={fullScreen ? styles.centre : styles.text}>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, flexShrink: 1 },
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centre: { textAlign: 'center' },
});
