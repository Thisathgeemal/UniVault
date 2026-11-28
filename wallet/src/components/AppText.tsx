import type { ReactNode } from 'react';
import { Platform, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';
import type { ThemeColors, TypeStep } from '../theme';
import { useTheme } from '../theme/use-theme';

/** The design type scale: display, h1, h2, h3, body, bodySm, label, caption, mono. */
export type AppTextVariant = TypeStep;

/** Text colours: text, text-muted, text-subtle (captions only), links, errors, on navy. */
export type AppTextTone =
  'default' | 'muted' | 'subtle' | 'accent' | 'error' | 'onBrand' | 'onBrandMuted';

const TONE: Record<AppTextTone, keyof ThemeColors> = {
  default: 'text',
  muted: 'textMuted',
  subtle: 'textSubtle',
  accent: 'accentText',
  error: 'statusRevoked', // errors use the revoked colours (design system)
  onBrand: 'onBrand',
  onBrandMuted: 'onBrandMuted',
};

/**
 * mono: ids and JWT snippets on the Diagnostics screen only. The system monospace font
 * (JetBrains Mono is self-hosted for the portals; bundling it for one developer screen was not
 * worth the app size).
 */
const SYSTEM_MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

export interface AppTextProps extends Omit<TextProps, 'style'> {
  variant?: AppTextVariant;
  tone?: AppTextTone;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
}

/**
 * Themed text in the design type scale (generous line heights: 26 for 16 body), Noto Sans or
 * Noto Sans Sinhala by weight and UI language. Wallet typography (design-system.md): body 16/26
 * for what people read; SECONDARY text is 14 in text-muted, so `tone="muted"` without a variant
 * is `bodySm`; captions 12 for metadata only; headings h1 / h2 / h3 at weight 600. Text keeps scaling with the OS text size
 * (dynamic type); maxFontSizeMultiplier only stops extreme sizes from breaking layouts.
 */
export function AppText({
  tone = 'default',
  variant = tone === 'muted' ? 'bodySm' : 'body',
  style,
  children,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const type = theme.type(variant);
  return (
    <Text
      maxFontSizeMultiplier={2}
      {...rest}
      style={[
        { fontSize: type.fontSize, lineHeight: type.lineHeight },
        { fontFamily: variant === 'mono' ? SYSTEM_MONO : type.fontFamily },
        { color: theme.colors[TONE[tone]] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
