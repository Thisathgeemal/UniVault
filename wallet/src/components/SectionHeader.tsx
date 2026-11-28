import { useTheme } from '../theme/use-theme';
import { AppText } from './AppText';

export interface SectionHeaderProps {
  title: string;
  testID?: string;
}

/** A heading above a group of rows or cards (announced as a header). */
export function SectionHeader({ title, testID }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <AppText
      variant="label"
      tone="muted"
      accessibilityRole="header"
      testID={testID}
      style={{ marginTop: theme.space(2) }}
    >
      {title}
    </AppText>
  );
}
