/**
 * The status bar: ONE `<StatusBar>` (expo-status-bar) whose style follows the effective theme
 * (src/theme/appearance.tsx) and the navy header.
 *
 *   - a screen with the navy header is focused (every screen inside a tab: the brand stack header,
 *     useBrandStatusBarWhileFocused): light content (white icons on navy, in both themes);
 *   - otherwise: dark content on the light theme, light content on the dark theme.
 *
 * The style is computed, never set imperatively, so a theme change (including a live system
 * change under "Automatic") cannot leave dark icons on navy. The same provider gives the
 * phone's root view the theme's `bg` (expo-system-ui), so nothing light shows behind a dark app
 * during transitions.
 */
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { ColorScheme } from '../theme/appearance';
import { useTheme } from '../theme/use-theme';

export type StatusBarContent = 'light' | 'dark';

/** Light content on navy or on the dark theme; dark content on the light theme. */
export function statusBarStyleFor(scheme: ColorScheme, onBrand: boolean): StatusBarContent {
  return onBrand || scheme === 'dark' ? 'light' : 'dark';
}

interface BrandStatusBarApi {
  /** A navy-header screen gained focus; the returned function is called when it loses it. */
  enter: () => () => void;
}

const BrandStatusBarContext = createContext<BrandStatusBarApi | null>(null);

/** Root of the app (app/_layout.tsx): renders the status bar for everything below it. */
export function StatusBarProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const [brandScreens, setBrandScreens] = useState(0);
  const enter = useCallback(() => {
    setBrandScreens((n) => n + 1);
    return () => setBrandScreens((n) => Math.max(0, n - 1));
  }, []);
  const api = useMemo(() => ({ enter }), [enter]);
  const bg = theme.colors.bg;

  useEffect(() => {
    try {
      void Promise.resolve(SystemUI.setBackgroundColorAsync(bg)).catch(() => undefined);
    } catch {
      // no native module: only the root view colour behind the screens is affected
    }
  }, [bg]);

  return (
    <BrandStatusBarContext.Provider value={api}>
      {children}
      <StatusBar style={statusBarStyleFor(theme.scheme, brandScreens > 0)} />
    </BrandStatusBarContext.Provider>
  );
}

/**
 * The navy stack header (src/navigation/stack-options.tsx): light content while ITS screen is
 * focused (a screen kept mounted under another one, or in another tab, does not count).
 */
export function useBrandStatusBarWhileFocused(
  navigation: {
    isFocused: () => boolean;
    addListener: (event: 'focus' | 'blur', listener: () => void) => () => void;
  },
  active: boolean,
): void {
  const api = useContext(BrandStatusBarContext);
  useEffect(() => {
    if (!active || !api) return undefined;
    let leave: (() => void) | null = navigation.isFocused() ? api.enter() : null;
    const offFocus = navigation.addListener('focus', () => {
      leave ??= api.enter();
    });
    const offBlur = navigation.addListener('blur', () => {
      leave?.();
      leave = null;
    });
    return () => {
      offFocus();
      offBlur();
      leave?.();
    };
  }, [active, api, navigation]);
}

/** Outside the navigator (the lock screen, the privacy cover): light content while `active`. */
export function useBrandStatusBarWhile(active: boolean): void {
  const api = useContext(BrandStatusBarContext);
  useEffect(() => (active && api ? api.enter() : undefined), [active, api]);
}
