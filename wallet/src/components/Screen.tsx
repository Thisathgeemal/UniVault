import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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

/** A themed, safe-area-aware page with an optional heading. */
export function Screen({ title, children, scroll = true, testID }: ScreenProps) {
  const theme = useTheme();
  const content = (
    <View style={[styles.content, { padding: theme.space(4), gap: theme.space(4) }]}>
      {title ? (
        <AppText variant="h1" accessibilityRole="header">
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
  content: { flexGrow: 1 },
});
