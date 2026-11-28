import { Pressable, StyleSheet, View } from 'react-native';
import { LIST_ROW_MIN_HEIGHT } from '../theme';
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
  testID?: string;
}

/**
 * A single choice as a radio group (Settings → Language and Appearance, onboarding language):
 * each option is a `radio` with `checked`, a filled / empty radio icon (never colour alone) and
 * the selected one in the accent fill. Body text (16), rows at least 56 pt, text wraps; the
 * label only (no helper lines).
 */
export function ChoiceList<T extends string>({
  choices,
  selected,
  onSelect,
  testID,
}: ChoiceListProps<T>) {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" testID={testID} style={{ gap: theme.space(2) }}>
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
                borderRadius: theme.radius.md,
                borderColor: isSelected ? theme.colors.accent : theme.colors.borderStrong,
                backgroundColor: isSelected ? theme.colors.accent : theme.colors.surface,
                paddingHorizontal: theme.space(4),
                paddingVertical: theme.space(2),
                gap: theme.space(3),
              },
            ]}
          >
            <Icon
              name={isSelected ? 'radio-button-on' : 'radio-button-off'}
              color={isSelected ? theme.colors.onAccent : theme.colors.accentText}
            />
            <AppText
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
  option: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: LIST_ROW_MIN_HEIGHT,
  },
  label: { flex: 1, flexShrink: 1 },
});
