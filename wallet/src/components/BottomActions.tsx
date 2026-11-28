import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAX_READABLE_WIDTH } from '../theme';
import { useTheme } from '../theme/use-theme';

export interface BottomActionsProps {
  /** Buttons, primary first; each is drawn full width, stacked. */
  children: ReactNode;
  /** Shown above the buttons (e.g. the onboarding progress). */
  above?: ReactNode;
  testID: string;
  /**
   * `surface` (default): the surface footer with a border top. `brand`: on a full-navy screen
   * (the lock screen): no footer of its own, the buttons sit on the screen's brand.
   */
  tone?: 'surface' | 'brand';
}

/**
 * The action area at the bottom of onboarding and setup screens (Wallet typography and layout,
 * design-system.md): a `surface` footer with a `border` top edge, full-width buttons stacked
 * with space-2 (primary first), space-4 padding plus the bottom safe-area inset on every screen,
 * centred at most MAX_READABLE_WIDTH wide on tablets.
 */
export function BottomActions({ children, above, testID, tone = 'surface' }: BottomActionsProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        tone === 'surface' ? styles.footer : null,
        {
          backgroundColor: tone === 'surface' ? theme.colors.surface : theme.colors.brand,
          borderTopColor: theme.colors.border,
          paddingTop: theme.space(4),
          paddingHorizontal: theme.space(4) + Math.max(insets.left, insets.right),
          paddingBottom: insets.bottom + theme.space(4),
        },
      ]}
    >
      <View style={[styles.inner, { gap: theme.space(3) }]}>
        {above}
        <View testID={`${testID}-buttons`} style={{ gap: theme.space(2) }}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: { borderTopWidth: StyleSheet.hairlineWidth },
  inner: { width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
});
