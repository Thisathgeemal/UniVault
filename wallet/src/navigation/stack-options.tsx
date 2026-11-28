import type { NativeStackHeaderProps, NativeStackNavigationOptions } from 'expo-router';
import { Header } from '../components/Header';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';

export { useBrandStatusBar } from './status-bar';

/**
 * Renders the shared Header for a stack screen: title from the options, back when possible;
 * `tone="brand"` for the Credentials home screen (design system: brand header on home).
 */
export function StackHeader({
  options,
  back,
  navigation,
  route,
  tone = 'surface',
}: NativeStackHeaderProps & { tone?: 'surface' | 'brand' }) {
  const title = typeof options.title === 'string' ? options.title : route.name;
  return (
    <Header
      testID="stack-header"
      title={title}
      tone={tone}
      {...(back ? { onBack: () => navigation.goBack() } : {})}
    />
  );
}

/**
 * Screen options for every Stack (root and the four tab stacks): the shared Header (back button
 * only when there is a screen to go back to, so a tab's root never shows one) and the themed
 * background. Android's hardware back button is handled by the navigator: it pops the stack,
 * then the tab navigator goes to the first tab (backBehavior "firstRoute"), and only from the
 * Credentials root does it leave the app (the Android norm). With the phone's "reduce motion"
 * setting on, screens change without an animated transition.
 */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return {
    header: (props) => <StackHeader {...props} />,
    contentStyle: { backgroundColor: theme.colors.bg },
    animation: reduceMotion ? 'none' : 'default',
  };
}
