import { componentTokens } from '@univault/portal-ui/tokens';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface OfflineNoticeProps {
  /** When the status was last checked, already in words ("2 hours ago"). */
  lastChecked: string;
  testID?: string;
}

/**
 * Offline / stale-status banner (design system: stale status uses the expired colours):
 * status-expired-bg with status-expired-text and an offline icon, "Status last checked …".
 * Announced politely; for the status-check task (shown in the UI kit until then).
 */
export function OfflineNotice({ lastChecked, testID }: OfflineNoticeProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const tokens = componentTokens.offlineNotice;
  const text = t('offline.lastChecked', { time: lastChecked });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={text}
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          backgroundColor: theme.colors[tokens.bg],
          borderRadius: theme.radius.md,
          padding: theme.space(3),
          gap: theme.space(2),
        },
      ]}
    >
      <Icon name="cloud-offline" color={theme.colors[tokens.icon]} />
      <AppText style={[styles.text, { color: theme.colors[tokens.text] }]}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1, flexShrink: 1 },
});
