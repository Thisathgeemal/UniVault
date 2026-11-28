import type { NativeStackHeaderProps, NativeStackNavigationOptions } from 'expo-router';
import { Header } from '../components/Header';
import { useReduceMotion } from '../theme/reduce-motion';
import { useTheme } from '../theme/use-theme';
import { useBrandStatusBarWhileFocused } from './status-bar';

export type HeaderTone = 'surface' | 'brand';

/**
 * Renders the shared Header for a stack screen: title from the options, back when possible.
 * `brand` (every screen inside a tab, design-system.md): the navy header (root screens tall,
 * stack screens compact with the on-brand back arrow) and light status-bar icons while that
 * screen is focused. `surface`: the root stack outside the tabs (onboarding's Privacy details,
 * not found).
 */
export function StackHeader({
  options,
  back,
  navigation,
  route,
  tone,
}: NativeStackHeaderProps & { tone: HeaderTone }) {
  const title = typeof options.title === 'string' ? options.title : route.name;
  useBrandStatusBarWhileFocused(navigation, tone === 'brand');
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
 * Screen options for every Stack (root: `surface`; the four tab stacks: `brand`, TabStack): the
 * shared Header (back button
 * only when there is a screen to go back to, so a tab's root never shows one) and the themed
 * background. Android's hardware back button is handled by the navigator: it pops the stack,
 * then the tab navigator goes to the first tab (backBehavior "firstRoute"), and only from the
 * Credentials root does it leave the app (the Android norm). With the phone's "reduce motion"
 * setting on, screens change without an animated transition.
 */
export function useStackScreenOptions(tone: HeaderTone = 'surface'): NativeStackNavigationOptions {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return {
    header: (props) => <StackHeader {...props} tone={tone} />,
    contentStyle: { backgroundColor: theme.colors.bg },
    animation: reduceMotion ? 'none' : 'default',
  };
}
