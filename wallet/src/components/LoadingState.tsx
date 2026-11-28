import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface LoadingStateProps {
  /** Default: "Loading…". */
  message?: string;
  testID?: string;
}

/** A centred spinner with a visible, announced message (busy state for screen readers). */
export function LoadingState({ message, testID }: LoadingStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const text = message ?? t('common.loading');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={text}
      accessibilityState={{ busy: true }}
      accessibilityLiveRegion="polite"
      style={[styles.root, { gap: theme.space(3), paddingVertical: theme.space(6) }]}
    >
      <ActivityIndicator size="large" color={theme.colors.accentText} />
      <AppText tone="muted">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'flex-start' },
});
