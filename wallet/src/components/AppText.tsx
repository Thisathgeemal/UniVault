import type { ReactNode } from 'react';
import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import { typeStyle, type TypeStep } from '../theme';
import { useTheme } from '../theme/use-theme';

export type AppTextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption';

const VARIANTS: Record<AppTextVariant, { step: TypeStep; bold: boolean }> = {
  title: { step: '2xl', bold: true },
  heading: { step: 'lg', bold: true },
  body: { step: 'base', bold: false },
  label: { step: 'sm', bold: true },
  caption: { step: 'sm', bold: false },
};

export interface AppTextProps extends Omit<TextProps, 'style'> {
  variant?: AppTextVariant;
  tone?: 'default' | 'muted' | 'primary' | 'destructive';
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

/**
 * Themed text. Sizes come from the shared type scale; the Sinhala font and taller line height
 * apply automatically while the UI is in Sinhala. Text keeps scaling with the OS text size
 * (dynamic type); maxFontSizeMultiplier only stops extreme sizes from breaking layouts.
 */
export function AppText({
  variant = 'body',
  tone = 'default',
  style,
  children,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const { step, bold } = VARIANTS[variant];
  const color =
    tone === 'muted'
      ? theme.colors.mutedForeground
      : tone === 'primary'
        ? theme.colors.primary
        : tone === 'destructive'
          ? theme.colors.destructive
          : theme.colors.foreground;
  const fontFamily = theme.fontFamily(bold ? 'bold' : 'regular');
  return (
    <Text
      maxFontSizeMultiplier={2}
      {...rest}
      style={[
        typeStyle(step, theme.script),
        { color },
        fontFamily ? { fontFamily } : bold ? styles.bold : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '700' },
});
