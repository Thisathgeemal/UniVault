import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface SectionHeaderProps {
  title: string;
  testID?: string;
}

/** A heading above a group of rows or cards (h3, announced as a header). */
export function SectionHeader({ title, testID }: SectionHeaderProps) {
  return (
    <AppText variant="h3" accessibilityRole="header" testID={testID}>
      {title}
    </AppText>
  );
}

/**
 * One section of a screen: its heading and content kept together (space-2), while the Screen
 * puts space-6 between sections (wallet layout).
 */
export function Section({ title, children, testID }: SectionHeaderProps & { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View testID={testID} style={{ gap: theme.space(2) }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}
