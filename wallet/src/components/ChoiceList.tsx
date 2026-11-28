import { Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface Choice<T extends string> {
  value: T;
  /** Already translated. */
  label: string;
  testID?: string;
  /** BCP 47 code when the label is in another language (e.g. "සිංහල" on an English screen). */
  accessibilityLanguage?: string;
}

export interface ChoiceListProps<T extends string> {
  choices: readonly Choice<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** large: the first-start language choice (bigger targets and text). */
  size?: 'normal' | 'large';
  testID?: string;
}

/**
 * A single choice as a radio group (Settings → Language and Appearance, onboarding language):
 * each option is a `radio` with `checked`, a filled / empty radio icon (never colour alone) and
 * the selected one in the accent fill. At least 44 pt (large: 64 pt), text wraps.
 */
export function ChoiceList<T extends string>({
  choices,
  selected,
  onSelect,
  size = 'normal',
  testID,
}: ChoiceListProps<T>) {
  const theme = useTheme();
  const large = size === 'large';
  return (
    <View
      accessibilityRole="radiogroup"
      testID={testID}
      style={{ gap: theme.space(large ? 3 : 2) }}
    >
      {choices.map((choice) => {
        const isSelected = choice.value === selected;
        return (
          <Pressable
            key={choice.value}
            accessibilityRole="radio"
            accessibilityLabel={choice.label}
            accessibilityState={{ checked: isSelected }}
            {...(choice.accessibilityLanguage
              ? { accessibilityLanguage: choice.accessibilityLanguage }
              : {})}
            onPress={() => onSelect(choice.value)}
            testID={choice.testID}
            style={[
              styles.option,
              {
                minHeight: large ? MIN_TOUCH_TARGET + theme.space(5) : MIN_TOUCH_TARGET,
                borderRadius: theme.radius.md,
                borderColor: isSelected ? theme.colors.accent : theme.colors.borderStrong,
                backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
                paddingHorizontal: theme.space(4),
                paddingVertical: theme.space(large ? 3 : 2),
                gap: theme.space(3),
              },
            ]}
          >
            <Icon
              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
              size={large ? 28 : 24}
              color={isSelected ? theme.colors.onAccent : theme.colors.accentText}
            />
            <AppText
              variant={large ? 'h2' : 'label'}
              style={[
                styles.label,
                { color: isSelected ? theme.colors.onAccent : theme.colors.text },
              ]}
            >
              {choice.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  option: { borderWidth: 1, flexDirection: 'row', alignItems: 'center' },
  label: { flexShrink: 1 },
});
