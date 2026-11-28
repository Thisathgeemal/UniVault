import { Stack } from 'expo-router';
import { StackHeader, useStackScreenOptions } from './stack-options';

export interface TabStackScreen {
  /** Route file name inside the tab folder (index, [id], language, …). */
  name: string;
  /** Already translated header title. */
  title: string;
  /** The navy header (only the Credentials home screen, design system). */
  brandHeader?: boolean;
}

/** The Stack inside one tab: shared Header and background, one declared screen per file. */
export function TabStack({ screens }: { screens: readonly TabStackScreen[] }) {
  const screenOptions = useStackScreenOptions();
  return (
    <Stack screenOptions={screenOptions}>
      {screens.map((screen) => (
        <Stack.Screen
          key={screen.name}
          name={screen.name}
          options={{
            title: screen.title,
            ...(screen.brandHeader
              ? { header: (props) => <StackHeader {...props} tone="brand" /> }
              : {}),
          }}
        />
      ))}
    </Stack>
  );
}
