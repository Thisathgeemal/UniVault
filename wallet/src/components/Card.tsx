import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface CardProps {
  title?: string;
  children?: ReactNode;
  testID?: string;
}

/** A surface with the shared card radius and border; the title is announced as a header. */
export function Card({ title, children, testID }: CardProps) {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radii.card,
          padding: theme.space(4),
          gap: theme.space(2),
        },
      ]}
    >
      {title ? (
        <AppText variant="heading" accessibilityRole="header">
          {title}
        </AppText>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
