import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { StateIcon } from './StateIcon';

export interface ErrorStateProps {
  /** Default: "Something went wrong". */
  title?: string;
  /** What happened, in plain words (never an error message from code: it may contain data). */
  message: string;
  /** Shows "Try again" (or retryLabel). */
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
}

/** A failure panel: alert icon, title, message (announced as an alert), optional retry. */
export function ErrorState({ title, message, onRetry, retryLabel, testID }: ErrorStateProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.root, { gap: theme.space(3), padding: theme.space(6) }]}>
      <StateIcon name="alert-circle-outline" danger />
      <View accessible accessibilityRole="alert" style={[styles.text, { gap: theme.space(2) }]}>
        <AppText variant="h2" style={styles.center}>
          {title ?? t('errors.title')}
        </AppText>
        <AppText tone="muted" style={styles.center}>
          {message}
        </AppText>
      </View>
      {onRetry ? <Button label={retryLabel ?? t('common.tryAgain')} onPress={onRetry} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  text: { alignItems: 'center' },
  center: { textAlign: 'center' },
});
