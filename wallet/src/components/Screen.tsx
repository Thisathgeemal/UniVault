import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MAX_READABLE_WIDTH, SECTION_GAP } from '../theme';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface ScreenProps {
  /** Shown as the screen's heading (announced as a header by screen readers). */
  title?: string;
  children: ReactNode;
  /** Scrolls by default, so large OS text sizes never cut content off. */
  scroll?: boolean;
  testID?: string;
}

/**
 * A themed, safe-area-aware page with an optional heading (h2, left-aligned). Wallet layout:
 * space-4 at the sides and top, space-6 between sections and at the bottom, content at most
 * 560 pt wide (centred on tablets).
 */
export function Screen({ title, children, scroll = true, testID }: ScreenProps) {
  const theme = useTheme();
  const content = (
    <View
      testID={testID ? `${testID}-content` : undefined}
      style={[
        styles.content,
        {
          paddingHorizontal: theme.space(4),
          paddingTop: theme.space(4),
          paddingBottom: SECTION_GAP,
          gap: SECTION_GAP,
        },
      ]}
    >
      {title ? (
        <AppText variant="h2" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
  return (
    <SafeAreaView
      edges={['left', 'right']}
      style={[styles.root, { backgroundColor: theme.colors.bg }]}
      testID={testID}
    >
      {scroll ? <ScrollView contentContainerStyle={styles.scroll}>{content}</ScrollView> : content}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: MAX_READABLE_WIDTH, alignSelf: 'center' },
});
