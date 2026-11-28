import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { useTheme } from '../theme/use-theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  /** Points; scales with nothing (icons are not text). Default 24. */
  size?: number;
  /** Default: the theme's foreground colour. */
  color?: string;
  /**
   * Spoken label. Without one the icon is decorative and hidden from screen readers, which is
   * right whenever text next to it says the same thing (the usual case: never icon-only meaning).
   */
  label?: string;
  testID?: string;
}

/** The one wrapper over @expo/vector-icons (Ionicons): theme colour and accessibility rules. */
export function Icon({ name, size = 24, color, label, testID }: IconProps) {
  const theme = useTheme();
  const a11y = label
    ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel: label }
    : {
        accessible: false,
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? theme.colors.text}
      testID={testID}
      {...a11y}
    />
  );
}
