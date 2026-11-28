/**
 * The status bar: ONE `<StatusBar>` (expo-status-bar) whose style follows the effective theme
 * (src/theme/appearance.tsx) and the navy header.
 *
 *   - a screen with the navy header is focused (useBrandStatusBar): light content (white icons on
 *     navy, in both themes);
 *   - otherwise: dark content on the light theme, light content on the dark theme.
 *
 * The style is computed, never set imperatively, so a theme change (including a live system
 * change under "Automatic") cannot leave dark icons on navy. The same provider gives the
 * phone's root view the theme's `bg` (expo-system-ui), so nothing light shows behind a dark app
 * during transitions.
 */
import { useFocusEffect } from 'expo-router';
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

/** Call in a screen with the navy header: light status-bar content while it is focused. */
export function useBrandStatusBar(): void {
  const api = useContext(BrandStatusBarContext);
  // without a StatusBarProvider (a screen rendered on its own) there is no status bar to set
  useFocusEffect(useCallback(() => api?.enter(), [api]));
}

/** Outside the navigator (the lock screen, the privacy cover): light content while `active`. */
export function useBrandStatusBarWhile(active: boolean): void {
  const api = useContext(BrandStatusBarContext);
  useEffect(() => (active && api ? api.enter() : undefined), [active, api]);
}
