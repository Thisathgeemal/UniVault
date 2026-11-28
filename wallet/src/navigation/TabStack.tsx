import { Stack } from 'expo-router';
import { useStackScreenOptions } from './stack-options';

export interface TabStackScreen {
  /** Route file name inside the tab folder (index, [id], language, …). */
  name: string;
  /** Already translated header title. */
  title: string;
}

/**
 * The Stack inside one tab: the shared navy Header on EVERY screen (the tab root tall, the screens
 * inside it compact with Back; design-system.md), the background, one declared screen per file.
 */
export function TabStack({ screens }: { screens: readonly TabStackScreen[] }) {
  const screenOptions = useStackScreenOptions('brand');
  return (
    <Stack screenOptions={screenOptions}>
      {screens.map((screen) => (
        <Stack.Screen key={screen.name} name={screen.name} options={{ title: screen.title }} />
      ))}
    </Stack>
  );
}
