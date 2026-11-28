import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface HeaderAction {
  icon: IconName;
  /** Spoken label (icon-only button, so it is required). */
  label: string;
  onPress: () => void;
  testID?: string;
}

export interface HeaderProps {
  title: string;
  /** Shows the back button (platform icon, label "Back") when given. */
  onBack?: () => void;
  /** Up to two icon actions on the right. */
  actions?: readonly [] | readonly [HeaderAction] | readonly [HeaderAction, HeaderAction];
  /** surface (every stack screen) or brand (the Credentials home screen, design system). */
  tone?: 'surface' | 'brand';
  /**
   * root (a tab's first screen, or any screen without Back): taller, h2 20 title; detail (a
   * screen with Back): h3 16. Default: detail with `onBack`, root without.
   */
  size?: 'root' | 'detail';
  testID?: string;
}

function IconButton({
  icon,
  label,
  onPress,
  color,
  testID,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: string;
  testID?: string | undefined;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        { borderRadius: theme.radius.pill, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

/**
 * Screen header used by every stack (src/navigation/stack-options.tsx): surface, or brand navy
 * on the Credentials home screen; safe-area aware (it pads below the status bar / notch). Root
 * screens: h2 20 title with space-4 above and space-3 below; detail screens: h3 16 with space-2
 * above and below (weight 600 in both scripts). The title starts at space-4 like the screen content (after the Back button on
 * detail screens) and wraps instead of being cut off at large text sizes; back and action
 * buttons are 44 pt targets with spoken labels.
 */
export function Header({
  title,
  onBack,
  actions = [],
  tone = 'surface',
  size = onBack ? 'detail' : 'root',
  testID,
}: HeaderProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const brand = tone === 'brand';
  const root = size === 'root';
  const iconColour = brand ? theme.colors.onBrand : theme.colors.accentText;
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          paddingTop: insets.top + theme.space(root ? 4 : 2),
          paddingBottom: theme.space(root ? 3 : 2),
          paddingLeft: insets.left + theme.space(onBack ? 1 : 4),
          // icon buttons carry their own 44 pt target; text alone keeps the space-4 edge
          paddingRight: insets.right + theme.space(actions.length > 0 ? 2 : 4),
          backgroundColor: brand ? theme.colors.brand : theme.colors.surface,
          borderBottomColor: brand ? theme.colors.brand : theme.colors.border,
          gap: theme.space(1),
        },
      ]}
    >
      {onBack ? (
        <IconButton
          icon={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'}
          label={t('common.back')}
          onPress={onBack}
          color={iconColour}
          testID={testID ? `${testID}-back` : undefined}
        />
      ) : null}
      <AppText
        variant={root ? 'h2' : 'h3'}
        tone={brand ? 'onBrand' : 'default'}
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </AppText>
      {actions.map((action) => (
        <IconButton
          key={action.label}
          icon={action.icon}
          label={action.label}
          onPress={action.onPress}
          color={iconColour}
          testID={action.testID}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, flexShrink: 1 },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
