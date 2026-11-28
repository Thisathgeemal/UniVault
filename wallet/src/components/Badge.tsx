import { StyleSheet, View } from 'react-native';
import { statusTokens } from '@univault/portal-ui/tokens';
import { toneColors, type Tone } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type BadgeTone = Tone;

export interface BadgeProps {
  /** Already translated. The word carries the meaning; colour and icon reinforce it. */
  label: string;
  /** A status colour set (only for a status), or neutral for any other label. */
  tone: BadgeTone;
  icon?: IconName;
  testID?: string;
}

/**
 * A small pill (radius-sm) with a word and an optional icon. Status sets use their badge
 * colours (status-*-bg, status-*-text, the icon in status-*): a status icon always sits in its
 * own pill, never straight on navy.
 */
export function Badge({ label, tone, icon, testID }: BadgeProps) {
  const theme = useTheme();
  const { fg, bg } = toneColors(theme.colors, tone);
  const iconColour = tone === 'neutral' ? fg : theme.colors[statusTokens[tone].icon];
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[
        styles.badge,
        {
          backgroundColor: bg,
          borderRadius: theme.radius.sm,
          paddingHorizontal: theme.space(2),
          paddingVertical: theme.space(1),
          gap: theme.space(1),
        },
      ]}
    >
      {icon ? <Icon name={icon} size={16} color={iconColour} /> : null}
      <AppText variant="label" style={[styles.text, { color: fg }]}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  text: { flexShrink: 1 },
});
